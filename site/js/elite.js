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
import { REPERTOIRES, couleurDe } from '../data/repertoires/meta.js';
import { langue } from './i18n.js';

// Phrases en français ou en anglais selon la langue de l'interface.
const L = (fr, en) => (langue() === 'en' ? en : fr);
const LOC = () => L('fr-FR', 'en-US');

export const ELITE_LIVE_URL = 'https://raw.githubusercontent.com/miguelcerqueira1-cmyk/-coach-echecs/donnees-elite/elite.json';
export const ELITE_URL = './data/elite.json';
const RELOAD_MS = 5 * 60000; // même durée que le cache de raw.githubusercontent.com
export const PLATFORM_LABELS = { li: 'Lichess', cc: 'Chess.com', bc: L('Tournois', 'Tournaments') };
export const SOURCE_NAMES = { li: 'Lichess', cc: 'Chess.com', bc: L('Tournois (retransmissions Lichess)', 'Tournaments (Lichess broadcasts)') };
// Racines des répertoires dont les données Élite sont collectées (repertoires/meta.js : elite).
export const ROOTS = Object.fromEntries(Object.values(REPERTOIRES).filter((r) => r.elite).map((r) => [r.id, r.racine]));

// Clé de position : FEN sans les compteurs de coups (les transpositions se rejoignent).
export function fenKey(fen) {
  return String(fen).split(' ').slice(0, 4).join(' ');
}

// Répertoire atteint par une suite de coups SAN (null si hors répertoire).
// Racine la plus longue (1.d4 Cf6 2.c4 e6 3.g3 → Catalane plutôt que Londres 1.d4).
export function repertoireOfSan(san) {
  let best = null;
  for (const [rep, root] of Object.entries(ROOTS)) {
    if (root.every((m, i) => san[i] === m) && (!best || root.length > ROOTS[best].length)) best = rep;
  }
  return best;
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
// camp : règle de couleur, seules les parties où le joueur du top tient notre camp (`side` : 'w' ou
// 'b', couleur du répertoire ou de la partie) ; la répartition par plateforme n'est alors pas connue.
// Format 3 : colonnes séparées camp Blancs / camp Noirs et bits `c` (1 Blancs, 2 Noirs) ; avant, un
// seul camp (celui du répertoire Gambit Dame / Caro-Kann).
export function lookupElite(data, fen, { camp = false, side = 'w' } = {}) {
  const v3 = (data?.meta?.version || 0) >= 3;
  const bit = side === 'b' ? 2 : 1;
  if (camp && !hasCamp(data)) return { status: 'nocamp' };
  const pos = data?.positions?.[fenKey(fen)];
  if (!pos) return { status: 'absent', camp };
  const c = new Chess(fen);
  const turn = c.turn();
  const raw = [];
  for (const row of pos.m) {
    const [san, , , , elo, li, cc, bc = 0, cw = 0, cd = 0, cb = 0, kw = 0, kd = 0, kb = 0] = row;
    const [w, d, b] = !camp ? row.slice(1, 4) : v3 && side === 'b' ? [kw, kd, kb] : [cw, cd, cb];
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
    games: (pos.g || []).map((i) => data.games[i]).filter((g) => g && (!camp || (v3 ? g.c & bit : g.c))).map(gameInfo),
  };
}

// « il y a 12 min », « il y a 3 h », « il y a 2 j » (date ISO ou millisecondes).
export function ago(when, now = Date.now()) {
  const t = typeof when === 'number' ? when : Date.parse(when);
  if (!Number.isFinite(t)) return '?';
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 1) return L('à l’instant', 'just now');
  if (min < 60) return L(`il y a ${min} min`, `${min} min ago`);
  if (min < 48 * 60) return L(`il y a ${Math.round(min / 60)} h`, `${Math.round(min / 60)} h ago`);
  return L(`il y a ${Math.round(min / 1440)} j`, `${Math.round(min / 1440)} d ago`);
}

// Résumé lisible des métadonnées (fraîcheur, joueurs, parties par plateforme, sources en échec).
export function eliteSummary(meta, now = Date.now()) {
  if (!meta) return '';
  const quand = meta.generatedAt ? `${ago(meta.generatedAt, now)} (${new Date(meta.generatedAt).toLocaleString(LOC(), { dateStyle: 'short', timeStyle: 'short' })})` : '';
  const d = meta.generatedAt ? L(`Mis à jour ${quand}`, `Updated ${quand}`) : L('Date inconnue', 'Unknown date');
  const src = meta.sources || {};
  const part = (k) => {
    const s = src[k];
    if (!s || s.status === 'ignoré') return null;
    if (s.status === 'erreur') return L(`${SOURCE_NAMES[k]} : indisponible lors de la génération (aucune partie)`, `${SOURCE_NAMES[k]}: unavailable when generated (no games)`);
    const who = k === 'bc' ? L(`${s.events ?? 0} tournois`, `${s.events ?? 0} tournaments`) : L(`${s.players} joueurs`, `${s.players} players`);
    const partiel = s.status === 'partiel' ? L(' (récupération partielle)', ' (partial fetch)') : '';
    return L(`${SOURCE_NAMES[k]} : ${s.gamesKept.toLocaleString('fr-FR')} parties de ${who}${partiel}`, `${SOURCE_NAMES[k]}: ${s.gamesKept.toLocaleString('en-US')} games from ${who}${partiel}`);
  };
  const su = src.su && src.su.status !== 'ignoré' ? L(`joueurs suivis : ${src.su.verified} comptes vérifiés`, `followed players: ${src.su.verified} verified accounts`) : null;
  return `${d} — ${[part('li'), part('cc'), part('bc'), su].filter(Boolean).join(L(' ; ', '; '))}.`;
}

// Répartition par source, ex. « Lichess 12 · Chess.com 30 » (+ « Tournois 3 » s'il y en a).
export function splitText(split) {
  if (!split) return L('même camp que moi (plateformes non détaillées)', 'same side as me (platforms not broken down)');
  return Object.entries(PLATFORM_LABELS).filter(([k]) => k !== 'bc' || split?.bc)
    .map(([k, l]) => `${l} ${(split?.[k] || 0).toLocaleString(LOC())}`).join(' · ');
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
  return L(`Position absente du jeu Élite${camp ? ' avec la règle de couleur (joueur du top dans notre camp)' : ''} : il ne couvre que les positions des ouvertures du répertoire (transpositions comprises) et leurs suites, jusqu’au demi-coup ${f.plies ?? '?'}, atteintes par au moins ${f.minPositionGames ?? '?'} parties retenues. Rien n’est extrapolé.`,
    `Position not in the Elite dataset${camp ? ' with the colour rule (top player on our side)' : ''}: it only covers the positions of the repertoire openings (transpositions included) and their continuations, up to ply ${f.plies ?? '?'}, reached by at least ${f.minPositionGames ?? '?'} kept games. Nothing is extrapolated.`);
}

// Règle de couleur demandée mais absente du fichier publié (collecte antérieure à l'option).
export const NOCAMP_TEXT = L('Règle de couleur indisponible : le jeu Élite publié date d’avant cette option (elle arrivera avec la prochaine collecte). Décochez-la dans ⚙ Réglages pour voir toutes les parties.', 'Colour rule unavailable: the published Elite dataset predates this option (it will come with the next collection). Untick it in ⚙ Settings to see all games.');
export const CAMP_LABEL = L('mon camp seulement', 'my side only');

export const SOURCE_LABELS = { direct: L('mise à jour continue (branche donnees-elite)', 'continuous updates (donnees-elite branch)'), site: L('copie publiée avec le site', 'copy published with the site') };

// « Nouvelles parties » : dernières parties gardées, tous joueurs du top confondus.
export function recentInfo(data) {
  return (data?.recent || []).map((g) => {
    const info = gameInfo(g);
    const rep = g.rp || repertoireOfSan(info.san); // rp : posé à la collecte (transpositions)
    return { ...info, rep, color: couleurDe(rep) || 'w', opening: g.eco ? `${g.eco} ${g.n || ''}`.trim() : '' };
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
      return { status: 'unavailable', error: L(`data/elite.json absent ou illisible (${e.message})`, `data/elite.json missing or unreadable (${e.message})`) };
    }
  })();
  cache = { at: now, promise };
  return promise;
}
