// Jeu de données « Élite blitz/rapide » (data/elite.json, généré par scripts/elite.mjs) :
// parties récentes des meilleurs joueurs blitz/rapide de Lichess et Chess.com, de grands maîtres
// suivis (comptes vérifiés) et des tournois retransmis sur Lichess, limitées au répertoire
// (1.d4 d5 2.c4 et 1.e4 c6), agrégées par position.
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
export const PLATFORM_LABELS = { li: 'Lichess', cc: 'Chess.com', bc: 'Tournois' };
export const SOURCE_NAMES = { li: 'Lichess', cc: 'Chess.com', bc: 'Tournois (retransmissions Lichess)' };
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
  if (g.u) return g.u; // retransmission : lien complet vers la partie
  return g.p === 'li' ? `https://lichess.org/${g.id}` : `https://www.chess.com/game/live/${g.id}`;
}

// « Lichess Blitz » ou « Norway Chess 2026 | Open, Round 3 ».
export function gameSource(g) {
  if (g.p === 'bc') return [g.ev, g.rd].filter(Boolean).join(', ') || PLATFORM_LABELS.bc;
  return `${PLATFORM_LABELS[g.p] || g.p} ${SPEED_LABELS[g.s] || g.s || ''}`.trim();
}

// Partie exemple → forme affichable (coups SAN prêts pour l'échiquier).
export function gameInfo(g) {
  return {
    ...g,
    url: gameUrl(g),
    platform: PLATFORM_LABELS[g.p] || g.p,
    source: gameSource(g),
    san: String(g.m || '').split(' ').filter(Boolean),
    label: `${g.wn || g.w} (${g.wr ?? '?'}) – ${g.bn || g.b} (${g.br ?? '?'})`,
  };
}

// Le jeu de données publie-t-il les colonnes de la règle de couleur ?
export const hasCamp = (data) => !!data?.meta?.filters?.camp;

// Statistiques Élite d'une position. Chaque coup est revalidé par chess.js.
// camp : règle de couleur, seules les parties où le joueur du top tient notre camp (Blancs pour le
// Gambit Dame, Noirs pour la Caro-Kann) ; la répartition par plateforme n'est alors pas connue.
export function lookupElite(data, fen, { camp = false } = {}) {
  if (camp && !hasCamp(data)) return { status: 'nocamp' };
  const pos = data?.positions?.[fenKey(fen)];
  if (!pos) return { status: 'absent', camp };
  const c = new Chess(fen);
  const turn = c.turn();
  const raw = [];
  for (const row of pos.m) {
    const [san, , , , elo, li, cc, bc = 0, cw = 0, cd = 0, cb = 0] = row;
    const [w, d, b] = camp ? [cw, cd, cb] : row.slice(1, 4);
    if (w + d + b === 0) continue;
    let uci = null;
    try {
      const mv = new Chess(fen).move(san);
      uci = mv.lan;
    } catch { continue; /* coup illégal : ignoré */ }
    raw.push({ san, uci, white: w, draws: d, black: b, avgElo: elo, li, cc, bc });
  }
  const moves = enrichMoves(raw, turn).sort((a, b) => b.stats.total - a.stats.total);
  const sum = (k) => moves.reduce((a, m) => a + m[k], 0);
  const stats = nodeStats({ white: sum('white'), draws: sum('draws'), black: sum('black') });
  if (!stats.total) return { status: 'absent', camp };
  return {
    status: 'ok',
    camp,
    turn,
    moves,
    total: stats.total,
    stats,
    split: camp ? null : { li: sum('li'), cc: sum('cc'), bc: sum('bc') },
    top: moves[0] || null,
    games: (pos.g || []).map((i) => data.games[i]).filter((g) => g && (!camp || g.c)).map(gameInfo),
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
    if (s.status === 'erreur') return `${SOURCE_NAMES[k]} : indisponible lors de la génération (aucune partie)`;
    const who = k === 'bc' ? `${s.events ?? 0} tournois` : `${s.players} joueurs`;
    return `${SOURCE_NAMES[k]} : ${s.gamesKept.toLocaleString('fr-FR')} parties de ${who}${s.status === 'partiel' ? ' (récupération partielle)' : ''}`;
  };
  const su = src.su && src.su.status !== 'ignoré' ? `joueurs suivis : ${src.su.verified} comptes vérifiés` : null;
  return `${d} — ${[part('li'), part('cc'), part('bc'), su].filter(Boolean).join(' ; ')}.`;
}

// Répartition par source, ex. « Lichess 12 · Chess.com 30 » (+ « Tournois 3 » s'il y en a).
export function splitText(split) {
  if (!split) return 'même camp que moi (plateformes non détaillées)';
  return Object.entries(PLATFORM_LABELS).filter(([k]) => k !== 'bc' || split?.bc)
    .map(([k, l]) => `${l} ${(split?.[k] || 0).toLocaleString('fr-FR')}`).join(' · ');
}

// En-têtes PGN d'une partie exemple (lien vers l'original conservé dans Site).
// Noms affichés : nom usuel du joueur suivi s'il est connu (« Magnus Carlsen (DrNykterstein) »).
export function eliteHeaders(g) {
  const name = (acc, canon) => (canon && normalize(canon) !== normalize(acc) ? `${canon} (${acc})` : acc);
  const date = g.t ? new Date(g.t).toISOString().slice(0, 10).replace(/-/g, '.') : `${g.y}.??.??`;
  return {
    Event: g.p === 'bc' ? gameSource(g) : `Élite ${gameSource(g)}`, Site: g.url || gameUrl(g),
    White: name(g.w, g.wn), Black: name(g.b, g.bn), WhiteElo: g.wr != null ? String(g.wr) : '', BlackElo: g.br != null ? String(g.br) : '',
    Date: date, Result: g.r || '*',
  };
}
const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Position absente : explication honnête du périmètre (aucun chiffre extrapolé).
export function absentText(meta, camp = false) {
  const f = meta?.filters || {};
  return `Position absente du jeu Élite${camp ? ' avec la règle de couleur (joueur du top dans notre camp)' : ''} : il ne couvre que les positions du répertoire (Gambit Dame, Caro-Kann, transpositions comprises) et leurs suites, jusqu’au demi-coup ${f.plies ?? '?'}, atteintes par au moins ${f.minPositionGames ?? '?'} parties retenues. Rien n’est extrapolé.`;
}

// Règle de couleur demandée mais absente du fichier publié (collecte antérieure à l'option).
export const NOCAMP_TEXT = 'Règle de couleur indisponible : le jeu Élite publié date d’avant cette option (elle arrivera avec la prochaine collecte). Décochez-la dans ⚙ Réglages pour voir toutes les parties.';
export const CAMP_LABEL = 'mon camp seulement';

export const SOURCE_LABELS = { direct: 'mise à jour continue (branche donnees-elite)', site: 'copie publiée avec le site' };

// « Nouvelles parties » : dernières parties gardées, tous joueurs du top confondus.
export function recentInfo(data) {
  return (data?.recent || []).map((g) => {
    const info = gameInfo(g);
    const rep = g.rp || repertoireOfSan(info.san); // rp : posé à la collecte (transpositions)
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
