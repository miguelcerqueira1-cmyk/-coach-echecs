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
