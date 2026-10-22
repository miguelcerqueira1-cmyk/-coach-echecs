// Recherche par nom de joueur dans le jeu Élite (index joueurs.json, généré par scripts/elite.mjs) :
// joueurs suivis (grands maîtres connus, comptes vérifiés), joueurs du top 50 Lichess / Chess.com et
// joueurs des tournois retransmis sur Lichess. Seules les parties gardées (répertoire, fenêtre de
// collecte) y figurent : un joueur absent est signalé comme tel, jamais complété.
import { ELITE_LIVE_URL, gameInfo } from './elite.js';

export const JOUEURS_LIVE_URL = ELITE_LIVE_URL.replace(/elite\.json$/, 'joueurs.json');
export const JOUEURS_URL = './data/joueurs.json';

// « Vachier-Lagrave, Maxime » → « vachier lagrave maxime » (accents, casse, ponctuation ignorés).
export function normalizeName(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
export const nameTokens = (s) => normalizeName(s).split(' ').filter(Boolean);

// Tous les mots-clés (ex. ['carlsen', 'magnus']) figurent-ils dans le nom ?
export function nameMatches(name, keys) {
  const t = new Set(nameTokens(name));
  return keys.length > 0 && keys.every((k) => nameTokens(k).every((x) => t.has(x)));
}

// « Carlsen, Magnus » → « Magnus Carlsen » (format FIDE des retransmissions).
export function displayFideName(name) {
  const m = String(name).match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : String(name).trim();
}

// Joueurs dont le nom ou un compte correspond à la requête (au moins 3 caractères).
// Correspondance : la requête est contenue dans un nom/compte (« carls », « drnyk »), ou tous ses
// mots figurent dans le nom (« magnus carlsen », « carlsen magnus »).
export function searchPlayers(index, query) {
  const q = normalizeName(query);
  if (q.replace(/ /g, '').length < 3 || !index?.joueurs) return [];
  const qt = q.split(' ');
  const qc = q.replace(/ /g, '');
  const scored = [];
  for (const j of index.joueurs) {
    const keys = [j.n, ...(j.c || []).map((c) => c.u)];
    let score = 0;
    for (const k of keys) {
      const nk = normalizeName(k);
      const tokens = nk.split(' ');
      if (nk === q || nk.replace(/ /g, '') === qc) score = Math.max(score, 3);
      else if (qt.every((x) => tokens.some((t) => t.startsWith(x)))) score = Math.max(score, 2);
      else if (nk.replace(/ /g, '').includes(qc)) score = Math.max(score, 1);
    }
    if (score) scored.push({ j, score });
  }
  // Joueurs suivis d'abord, puis meilleure correspondance, puis nombre de parties.
  return scored.sort((a, b) => (b.j.s ? 1 : 0) - (a.j.s ? 1 : 0) || b.score - a.score || b.j.g.length - a.j.g.length)
    .map((x) => x.j);
}

// Parties d'un joueur (plus récentes d'abord), prêtes pour l'affichage et l'échiquier.
// j.g : indices dans index.games ; j.sd : couleur du joueur dans chacune (« wbw… »).
export function playerGames(index, joueur) {
  return joueur.g.map((i, k) => {
    const g = index.games[i];
    if (!g) return null;
    const side = joueur.sd?.[k] === 'b' ? 'b' : 'w';
    return { ...gameInfo(g), side, opponent: side === 'w' ? g.b : g.w, opponentElo: side === 'w' ? g.br : g.wr };
  }).filter(Boolean).sort((a, b) => b.t - a.t);
}

// Chargement à la demande (première recherche), même ordre que elite.json : branche puis site.
let cache = null;
export function loadJoueurs(fetchImpl = (...a) => fetch(...a), now = Date.now()) {
  if (cache && now - cache.at < 5 * 60000) return cache.promise;
  const get = async (url) => {
    const r = await fetchImpl(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (!Array.isArray(d?.joueurs) || !Array.isArray(d?.games)) throw new Error('fichier illisible');
    return d;
  };
  const promise = (async () => {
    try { return { status: 'ok', data: await get(JOUEURS_LIVE_URL), source: 'direct' }; } catch { /* repli */ }
    try { return { status: 'ok', data: await get(JOUEURS_URL), source: 'site' }; } catch (e) {
      return { status: 'unavailable', error: `joueurs.json absent ou illisible (${e.message})` };
    }
  })();
  cache = { at: now, promise };
  return promise;
}
