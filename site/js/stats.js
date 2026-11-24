// Statistiques de visite anonymes : Cloudflare Web Analytics (sans cookies, sans identifiant
// de visiteur, aucune donnée de l'appli envoyée — seulement la page vue, le pays, le type
// d'appareil, comptés par Cloudflare). Chargé uniquement sur le site publié (pas en local, pas
// pendant les tests automatiques) et jamais si le navigateur demande de ne pas être suivi.
// Le jeton est public par nature (il figure dans la page) : config.json → analyticsToken.

export const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js';

export function doitCompter({ token, host, hostname, webdriver = false, dnt = false } = {}) {
  return /^[0-9a-f]{32}$/i.test(token || '') && !!host && hostname === host && !webdriver && !dnt;
}

export function demarrerStats(cfg = {}, env = globalThis) {
  suivrePages(cfg, env);
  const nav = env.navigator || {};
  const ok = doitCompter({
    token: cfg.analyticsToken,
    host: cfg.analyticsHost,
    hostname: env.location?.hostname,
    webdriver: !!nav.webdriver,
    dnt: nav.doNotTrack === '1' || nav.globalPrivacyControl === true,
  });
  if (!ok || !env.document) return false;
  const s = env.document.createElement('script');
  s.defer = true;
  s.src = BEACON;
  s.setAttribute('data-cf-beacon', JSON.stringify({ token: cfg.analyticsToken }));
  env.document.head.appendChild(s);
  return true;
}

// Pages vues : Cloudflare Web Analytics ne voit pas les changements de page par « # » ; chaque page
// affichée est donc comptée par notre serveur (POST /v1/vue { p }) : un compteur par jour et par
// page, sans cookie ni identifiant. Mêmes conditions que ci-dessus (site publié, hors tests, DNT).
export const PAGES_SUIVIES = ['accueil', 'ouvertures', 'moteur', 'repertoire', 'entrainement', 'progression', 'parties'];
export function pageDe(hash) {
  const p = String(hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return PAGES_SUIVIES.includes(p) ? p : 'moteur';
}

export function suivrePages(cfg = {}, env = globalThis) {
  const nav = env.navigator || {};
  const api = (cfg.apiUrl || '').replace(/\/$/, '');
  if (!api || !cfg.analyticsHost || env.location?.hostname !== cfg.analyticsHost) return false;
  if (nav.webdriver || nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return false;
  let derniere = null;
  const envoyer = () => {
    const p = pageDe(env.location.hash);
    if (p === derniere) return;
    derniere = p;
    const corps = JSON.stringify({ p });
    try {
      if (!nav.sendBeacon?.(api + '/v1/vue', corps)) env.fetch?.(api + '/v1/vue', { method: 'POST', body: corps, keepalive: true }).catch(() => {});
    } catch { /* hors ligne : tant pis */ }
  };
  env.addEventListener?.('hashchange', envoyer);
  envoyer();
  return true;
}

// Lecture des totaux (affichés dans ⚙ Réglages → Avancé).
export async function lireVues(apiUrl, jours = 30, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl(`${apiUrl.replace(/\/$/, '')}/v1/vues?jours=${jours}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).jours || [];
}

export function resumeVues(jours) {
  const pages = {};
  let total = 0;
  for (const j of jours) for (const [p, n] of Object.entries(j.pages || {})) { pages[p] = (pages[p] || 0) + n; total += n; }
  return { total, pages: Object.entries(pages).sort((a, b) => b[1] - a[1]), parJour: jours.map((j) => ({ jour: j.jour, n: Object.values(j.pages || {}).reduce((a, b) => a + b, 0) })) };
}
