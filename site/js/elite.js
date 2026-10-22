// Jeu de données « Élite blitz/rapide » (data/elite.json, généré par scripts/elite.mjs) :
// parties récentes des meilleurs joueurs blitz/rapide de Lichess et Chess.com, limitées au
// répertoire (1.d4 d5 2.c4 et 1.e4 c6), agrégées par position.
// Ce sont des FRÉQUENCES OBSERVÉES chez des joueurs en ligne très forts, jamais une évaluation :
// une position absente du fichier est affichée comme absente, sans extrapolation.
// Chargement : d'abord la branche « donnees-elite » du dépôt (mise à jour toutes les ~30 min par
// .github/workflows/elite.yml, servie par raw.githubusercontent.com avec CORS « * » et ~5 min de
// cache), sinon la copie publiée avec le site, sinon « non publié ».
import { Chess } from '../vendor/chess.js';
import { enrichMoves, nodeStats, SPEED_LABELS } from './lichess.js';

export const ELITE_LIVE_URL = 'https://raw.githubusercontent.com/miguelcerqueira1-cmyk/-coach-echecs/donnees-elite/elite.json';
export const ELITE_URL = './data/elite.json';
const RELOAD_MS = 5 * 60000; // même durée que le cache de raw.githubusercontent.com
export const PLATFORM_LABELS = { li: 'Lichess', cc: 'Chess.com' };
export const ROOTS = { gd: ['d4', 'd5', 'c4'], ck: ['e4', 'c6'] };

// Clé de position : FEN sans les compteurs de coups (les transpositions se rejoignent).
export function fenKey(fen) {
  return String(fen).split(' ').slice(0, 4).join(' ');
}

// Répertoire atteint par une suite de coups SAN (null si hors répertoire).
export function repertoireOfSan(san) {
  for (const [rep, root] of Object.entries(ROOTS)) {
    if (root.every((m, i) => san[i] === m)) return rep;
  }
  return null;
}

export function gameUrl(g) {
  return g.p === 'li' ? `https://lichess.org/${g.id}` : `https://www.chess.com/game/live/${g.id}`;
}

// Partie exemple → forme affichable (coups SAN prêts pour l'échiquier).
export function gameInfo(g) {
  return {
    ...g,
    url: gameUrl(g),
    platform: PLATFORM_LABELS[g.p] || g.p,
    san: String(g.m || '').split(' ').filter(Boolean),
    label: `${g.w} (${g.wr ?? '?'}) – ${g.b} (${g.br ?? '?'})`,
  };
}

// Statistiques Élite d'une position. Chaque coup est revalidé par chess.js.
export function lookupElite(data, fen) {
  const pos = data?.positions?.[fenKey(fen)];
  if (!pos) return { status: 'absent' };
  const c = new Chess(fen);
  const turn = c.turn();
  const raw = [];
  for (const [san, w, d, b, elo, li, cc] of pos.m) {
    let uci = null;
    try {
      const mv = new Chess(fen).move(san);
      uci = mv.lan;
    } catch { continue; /* coup illégal : ignoré */ }
    raw.push({ san, uci, white: w, draws: d, black: b, avgElo: elo, li, cc });
  }
  const moves = enrichMoves(raw, turn).sort((a, b) => b.stats.total - a.stats.total);
  const sum = (k) => moves.reduce((a, m) => a + m[k], 0);
  const stats = nodeStats({ white: sum('white'), draws: sum('draws'), black: sum('black') });
  return {
    status: 'ok',
    turn,
    moves,
    total: stats.total,
    stats,
    split: { li: sum('li'), cc: sum('cc') },
    top: moves[0] || null,
    games: (pos.g || []).map((i) => data.games[i]).filter(Boolean).map(gameInfo),
  };
}

// « il y a 12 min », « il y a 3 h », « il y a 2 j » (date ISO ou millisecondes).
export function ago(when, now = Date.now()) {
  const t = typeof when === 'number' ? when : Date.parse(when);
  if (!Number.isFinite(t)) return '?';
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  if (min < 48 * 60) return `il y a ${Math.round(min / 60)} h`;
  return `il y a ${Math.round(min / 1440)} j`;
}

// Résumé lisible des métadonnées (fraîcheur, joueurs, parties par plateforme, sources en échec).
export function eliteSummary(meta, now = Date.now()) {
  if (!meta) return '';
  const d = meta.generatedAt ? `Mis à jour ${ago(meta.generatedAt, now)} (${new Date(meta.generatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})` : 'Date inconnue';
  const src = meta.sources || {};
  const part = (k) => {
    const s = src[k];
    if (!s || s.status === 'ignoré') return null;
    if (s.status === 'erreur') return `${PLATFORM_LABELS[k]} : indisponible lors de la génération (aucune partie)`;
    return `${PLATFORM_LABELS[k]} : ${s.gamesKept.toLocaleString('fr-FR')} parties de ${s.players} joueurs${s.status === 'partiel' ? ' (récupération partielle)' : ''}`;
  };
  return `${d} — ${[part('li'), part('cc')].filter(Boolean).join(' ; ')}.`;
}

// Répartition par plateforme, ex. « Lichess 12 · Chess.com 30 ».
export function splitText(split) {
  return Object.entries(PLATFORM_LABELS).map(([k, l]) => `${l} ${(split?.[k] || 0).toLocaleString('fr-FR')}`).join(' · ');
}

// En-têtes PGN d'une partie exemple (lien vers l'original conservé dans Site).
export function eliteHeaders(g) {
  return { Event: `Élite ${g.platform} ${SPEED_LABELS[g.s] || g.s}`, Site: g.url, White: `${g.w} (${g.wr ?? '?'})`, Black: `${g.b} (${g.br ?? '?'})`, Date: `${g.y}.??.??` };
}

// Position absente : explication honnête du périmètre (aucun chiffre extrapolé).
export function absentText(meta) {
  const f = meta?.filters || {};
  return `Position absente du jeu Élite : il ne couvre que les positions après 1.d4 d5 2.c4 ou 1.e4 c6, jusqu’au demi-coup ${f.plies ?? '?'}, atteintes par au moins ${f.minPositionGames ?? '?'} parties retenues. Rien n’est extrapolé.`;
}

export const SOURCE_LABELS = { direct: 'mise à jour continue (branche donnees-elite)', site: 'copie publiée avec le site' };

// « Nouvelles parties » : dernières parties gardées, tous joueurs du top confondus.
export function recentInfo(data) {
  return (data?.recent || []).map((g) => {
    const info = gameInfo(g);
    const rep = repertoireOfSan(info.san);
    return { ...info, rep, color: rep === 'ck' ? 'b' : 'w', opening: g.eco ? `${g.eco} ${g.n || ''}`.trim() : '' };
  });
}

// Chargement partagé, rechargé au plus toutes les 5 minutes : branche de données d'abord,
// copie du site ensuite. Résultat : { status: 'ok', data, source: 'direct' | 'site' } ou
// { status: 'unavailable', error }.
let cache = null;
export function loadElite(fetchImpl = (...a) => fetch(...a), now = Date.now()) {
  if (cache && now - cache.at < RELOAD_MS) return cache.promise;
  const get = async (url) => {
    const r = await fetchImpl(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data?.positions || !data?.meta) throw new Error('fichier illisible');
    return data;
  };
  const promise = (async () => {
    try {
      return { status: 'ok', data: await get(ELITE_LIVE_URL), source: 'direct' };
    } catch { /* branche absente ou injoignable : copie du site */ }
    try {
      return { status: 'ok', data: await get(ELITE_URL), source: 'site' };
    } catch (e) {
      return { status: 'unavailable', error: `data/elite.json absent ou illisible (${e.message})` };
    }
  })();
  cache = { at: now, promise };
  return promise;
}
