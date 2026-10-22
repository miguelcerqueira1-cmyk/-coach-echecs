// Jeu de données « Élite blitz/rapide » (data/elite.json, généré par scripts/elite.mjs) :
// parties récentes des meilleurs joueurs blitz/rapide de Lichess et Chess.com, limitées au
// répertoire (1.d4 d5 2.c4 et 1.e4 c6), agrégées par position.
// Ce sont des FRÉQUENCES OBSERVÉES chez des joueurs en ligne très forts, jamais une évaluation :
// une position absente du fichier est affichée comme absente, sans extrapolation.
import { Chess } from '../vendor/chess.js';
import { enrichMoves, nodeStats, SPEED_LABELS } from './lichess.js';

export const ELITE_URL = './data/elite.json';
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

// Résumé lisible des métadonnées (date, joueurs, parties par plateforme, sources en échec).
export function eliteSummary(meta) {
  if (!meta) return '';
  const d = meta.generatedAt ? new Date(meta.generatedAt).toLocaleDateString('fr-FR') : '?';
  const src = meta.sources || {};
  const part = (k) => {
    const s = src[k];
    if (!s || s.status === 'ignoré') return null;
    if (s.status === 'erreur') return `${PLATFORM_LABELS[k]} : indisponible lors de la génération (aucune partie)`;
    return `${PLATFORM_LABELS[k]} : ${s.gamesKept.toLocaleString('fr-FR')} parties de ${s.players} joueurs${s.status === 'partiel' ? ' (récupération partielle)' : ''}`;
  };
  return `Données du ${d} — ${[part('li'), part('cc')].filter(Boolean).join(' ; ')}.`;
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

// Chargement unique et partagé du fichier (absent en développement tant qu'il n'est pas généré).
let pending = null;
export function loadElite(fetchImpl = (...a) => fetch(...a)) {
  pending ??= (async () => {
    try {
      const r = await fetchImpl(ELITE_URL, { cache: 'no-cache' });
      if (!r.ok) return { status: 'unavailable', error: `data/elite.json absent (HTTP ${r.status})` };
      const data = await r.json();
      if (!data?.positions || !data?.meta) return { status: 'unavailable', error: 'data/elite.json illisible' };
      return { status: 'ok', data };
    } catch {
      return { status: 'unavailable', error: 'data/elite.json illisible ou injoignable' };
    }
  })();
  return pending;
}
