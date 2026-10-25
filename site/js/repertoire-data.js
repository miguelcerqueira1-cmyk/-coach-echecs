// Chargement partagé du répertoire (pages Répertoire, Entraînement, Mes parties).
// Le site publié ne contient que les fiches gratuites complètes et un aperçu des fiches Pro
// (`pro: true`, scripts/pro-content.mjs). Avec un jeton de licence, les fiches Pro complètes sont
// demandées au Worker (GET /v1/pro-content) et fusionnées ; une copie locale sert hors connexion.
// Résultat : data.entries = fiches complètes seulement (tout le code d'exercices peut s'y fier),
// data.all = toutes les fiches dans l'ordre, aperçus compris (listes avec verrou).
import { licenceToken, getApiUrl } from './pro.js';

export const PRO_CACHE = 'coach-echecs:pro-content';

function readCache() {
  try { return JSON.parse(localStorage.getItem(PRO_CACHE) || 'null'); } catch { return null; }
}

// Fusion : chaque aperçu est remplacé par sa fiche complète quand elle est connue.
export function mergeRepertoire(data, proEntries = []) {
  const full = new Map(proEntries.filter((e) => e?.id && e.uci).map((e) => [e.id, e]));
  const all = data.entries.map((e) => (e.pro ? full.get(e.id) || e : e));
  return { ...data, all, entries: all.filter((e) => !e.pro), previews: all.filter((e) => e.pro) };
}

async function fetchProEntries(apiUrl, token, fetchImpl) {
  if (!apiUrl) return { error: 'serveur de licences non configuré' };
  try {
    const r = await fetchImpl(`${apiUrl}/v1/pro-content`, { headers: { authorization: `Licence ${token}` }, cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      try { localStorage.setItem(PRO_CACHE, JSON.stringify({ version: d.version ?? null, entries: d.entries || [], at: Date.now() })); } catch { /* stockage plein */ }
      return { entries: d.entries || [] };
    }
    let msg = `erreur ${r.status}`;
    try { msg = (await r.json()).error || msg; } catch { /* rien */ }
    if (r.status === 401) { try { localStorage.removeItem(PRO_CACHE); } catch { /* rien */ } }
    return { error: msg, denied: r.status === 401 };
  } catch {
    return { error: 'serveur injoignable' };
  }
}

let memo = null;

// apiUrl : adresse du Worker (config.json ou réglage). Mémorisé ; reset() après un changement de licence.
export function loadRepertoire({ apiUrl = getApiUrl(), fetchImpl = (...a) => fetch(...a) } = {}) {
  if (memo) return memo;
  memo = (async () => {
    const data = await (await fetchImpl('./data/repertoire.json', { cache: 'no-cache' })).json();
    if (!data.entries.some((e) => e.pro)) return mergeRepertoire(data); // répertoire complet (tests, FULL_CONTENT)
    const token = licenceToken();
    if (!token) return { ...mergeRepertoire(data), proStatus: 'sans-licence' };
    const r = await fetchProEntries(apiUrl, token, fetchImpl);
    if (r.entries) return { ...mergeRepertoire(data, r.entries), proStatus: 'ok' };
    // Hors connexion ou serveur indisponible : dernière copie locale (sauf licence refusée).
    const cached = !r.denied && readCache();
    if (cached?.entries?.length) return { ...mergeRepertoire(data, cached.entries), proStatus: 'copie-locale', proError: r.error };
    return { ...mergeRepertoire(data), proStatus: 'erreur', proError: r.error };
  })();
  memo.catch(() => { memo = null; });
  return memo;
}

export function resetRepertoire() { memo = null; }
