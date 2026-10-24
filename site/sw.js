// Service worker de Coach Échecs : application installable et utilisable hors connexion.
// BUILD et PRECACHE sont remplis par scripts/build.mjs (dist/sw.js) ; le fichier change donc à
// chaque publication, ce qui déclenche la mise à jour (bandeau « Nouvelle version disponible »).
//
// Stratégies (même origine seulement, dans la portée du site) :
//   - HTML (navigation), config.json, engine/manifest.json : réseau d'abord, cache si hors ligne ;
//   - autres fichiers : cache immédiat, puis mise à jour en arrière-plan (stale-while-revalidate) ;
//   - jamais : requêtes d'autres origines (Lichess, explorer, raw.githubusercontent, Google Fonts,
//     Worker Cloudflare…), méthodes autres que GET, et le WASM de Stockfish, que engine.js
//     télécharge et garde lui-même dans son propre cache (« coach-echecs-moteur-<hash> »).
const BUILD = '__BUILD_ID__';
const PRECACHE = [/*__PRECACHE__*/];
const PREFIX = 'coach-echecs-app-';
const CACHE = PREFIX + BUILD;
const SCOPE = new URL(self.registration.scope);
const NETWORK_FIRST = new Set(['config.json', 'engine/manifest.json']);
const NETWORK_TIMEOUT_MS = 6000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' : jamais une copie périmée du cache HTTP du navigateur.
    await cache.addAll(PRECACHE.map((u) => new Request(new URL(u, SCOPE).href, { cache: 'reload' })));
  })());
  // Pas de skipWaiting() ici : la nouvelle version attend que l'utilisateur touche « Recharger ».
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Seuls nos anciens caches d'application ; le cache du moteur n'est jamais touché.
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const path = url.pathname.slice(SCOPE.pathname.length);
  if (path === 'sw.js' || path.endsWith('.wasm')) return;
  if (path.startsWith('fc-creations/')) return; // maquette d'un autre projet : jamais en cache ni prise pour index.html
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(event, req, new URL('index.html', SCOPE).href));
  } else if (NETWORK_FIRST.has(path) || path.endsWith('.html')) {
    event.respondWith(networkFirst(event, req, url.origin + url.pathname));
  } else if (req.destination === 'worker') {
    event.respondWith(staleWhileRevalidate(event, req).then(asWorkerScript));
  } else {
    event.respondWith(staleWhileRevalidate(event, req));
  }
});

// Script de Web Worker (engine/stockfish.js) : engine.js passe l'adresse du WASM déjà en
// mémoire dans le fragment (stockfish.js?v=…#blob:…), que le moteur relit dans self.location.
// Une réponse venant du cache garde son URL d'origine, sans ce fragment, et le moteur
// retéléchargerait alors stockfish.wasm (impossible hors connexion). Une réponse reconstruite
// n'a pas d'URL : le Worker prend celle de la requête, fragment compris.
async function asWorkerScript(res) {
  if (!res.ok) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

const cacheable = (res) => res && res.ok && res.type === 'basic';

async function fromCache(cache, req, key) {
  return (await cache.match(key || req)) || (await cache.match(req, { ignoreSearch: true }));
}

async function networkFirst(event, req, key) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (cacheable(res)) event.waitUntil(cache.put(key, res.clone()));
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  const cached = await fromCache(cache, req, key);
  if (!cached) return network;
  // Réseau lent ou capricieux : la copie locale au-delà de quelques secondes.
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS); });
  try {
    return await Promise.race([network, timeout]);
  } catch {
    return cached;
  } finally {
    clearTimeout(timer);
  }
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (cacheable(res)) event.waitUntil(cache.put(req, res.clone()));
    return res;
  });
  const cached = await fromCache(cache, req);
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}
