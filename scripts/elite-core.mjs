// Logique pure du jeu de données Élite (sans réseau, testée) : lecture des réponses Lichess /
// Chess.com, filtre du répertoire (par POSITION, transpositions comprises), état persistant
// (mises à jour incrémentales), agrégation par position et sélection des parties exemples.
import { Chess } from '../site/vendor/chess.js';
import { parseLichessGame, parseChessComGame } from '../site/js/games-core.js';
import { fenKey, ROOTS } from '../site/js/elite.js';
import { LIGNES } from '../site/data/repertoire.js';
import { REPERTOIRES, couleurDe } from '../site/data/repertoires/meta.js';
import { playLine } from '../site/js/lines.js';

const RESULTS = ['1-0', '0-1', '1/2-1/2'];

// Premiers coups SAN d'une suite « 1. d4 {[%clk …]} 1... d5 2. c4 … » (filtre rapide avant chess.js).
export function firstSans(movetext, n = 3) {
  const out = [];
  const body = String(movetext).replace(/\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ');
  for (const tok of body.split(/\s+/)) {
    if (!tok || /^\d+\.+$/.test(tok) || /^\$\d+$/.test(tok)) continue;
    const t = tok.replace(/^\d+\.+/, '');
    if (!t || RESULTS.includes(t) || t === '*') break;
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

const PGN_BODY = (pgn) => String(pgn).replace(/^\s*(\[[^\]]*\]\s*)+/, '');

// ---------- Entrée dans le répertoire (par position) ----------
// Arbre du répertoire = positions des lignes des fiches (ligne principale, punition, piège) à
// partir de la racine de leur ouverture (après 1.d4 d5 2.c4 : 3 demi-coups ; après 1.e4 c6 : 2),
// plus les deux racines. Clé : FEN sans compteurs (le camp au trait en fait partie). Une partie
// est gardée si l'une de ses positions, dans les TRANSPO_PLIES premiers demi-coups, est dans
// l'arbre : 1.d4 Cf6 2.c4 e6 3.Cc3 d5 rejoint la Variante orthodoxe comme 1.d4 d5 2.c4 e6 3.Cc3 Cf6.

export const TRANSPO_PLIES = 16;

// Seuls les répertoires marqués `elite` (repertoires/meta.js) sont collectés.
export function buildRepertoireIndex(lines = LIGNES.filter((e) => REPERTOIRES[e.rep]?.elite)) {
  const index = new Map();
  const add = (fen, rep) => { const k = fenKey(fen); if (!index.has(k)) index.set(k, rep); };
  for (const [rep, root] of Object.entries(ROOTS)) {
    const c = new Chess();
    root.forEach((m) => c.move(m));
    add(c.fen(), rep);
  }
  for (const e of lines) {
    const from = ROOTS[e.rep]?.length ?? 0;
    for (const ligne of [e.ligne, e.punition?.ligne, e.piege?.ligne].filter(Boolean)) {
      const { fens } = playLine(ligne);
      fens.forEach((f, ply) => { if (ply >= from) add(f, e.rep); });
    }
  }
  return index;
}

let defaultIndex = null;
export const repertoireIndex = () => (defaultIndex ??= buildRepertoireIndex());

// Première position de l'arbre atteinte : { rep, ply } (ply = demi-coups joués avant elle), ou null.
// Les coups illisibles ou illégaux arrêtent la recherche. Les débuts de partie se répètent
// énormément : la clé FEN de chaque préfixe de coups est mise en cache (la génération de FEN par
// chess.js coûte ≈ 0,05 ms par coup, × 16 demi-coups × des dizaines de milliers de parties).
const prefixCache = new Map();
const CACHE_MAX = 300000;
export function repertoireEntry(san, { index = repertoireIndex(), maxPlies = TRANSPO_PLIES } = {}) {
  const moves = [];
  let c = null;
  for (let ply = 0; ply <= maxPlies; ply++) {
    const prefix = moves.join(' ');
    let key = prefixCache.get(prefix);
    if (key === undefined) {
      if (!c) {
        c = new Chess();
        try { for (const m of moves) c.move(m); } catch { key = null; }
      }
      if (key === undefined) key = fenKey(c.fen());
      if (prefixCache.size >= CACHE_MAX) prefixCache.clear();
      prefixCache.set(prefix, key);
    }
    if (key === null) return null;
    const rep = index.get(key);
    if (rep) return { rep, ply };
    const m = san[ply];
    if (!m) return null;
    const mv = String(m).replace(/[!?]+$/, '');
    if (c) {
      try { c.move(mv); } catch { return null; }
    }
    moves.push(mv);
  }
  return null;
}

// Entrée d'une partie normalisée (champs rp/e posés à la collecte ; recalculés pour un état ancien).
export function entryOf(g, opts) {
  if (g.rp && Number.isInteger(g.e)) return { rep: g.rp, ply: g.e };
  return repertoireEntry(g.san || String(g.m || '').split(' '), opts);
}

// Règle de couleur : le camp de notre répertoire (Blancs pour le Gambit Dame, Noirs pour la
// Caro-Kann) est-il tenu par un joueur du top ou suivi ? Plateformes : un propriétaire de la partie
// (clé « li:pseudo:cadence ») joue ce camp ; tournois : joueur suivi (nom usuel) ou Elo ≥ minElo.
export function campDuTop(g, { minElo = 2600 } = {}) {
  const ent = entryOf(g);
  if (!ent) return false;
  const side = couleurDe(ent.rep) || 'w';
  if (g.p === 'bc') return !!g[`${side}n`] || (Number.isFinite(g[`${side}r`]) && g[`${side}r`] >= minElo);
  const name = String(g[side] ?? '').toLowerCase();
  return (g.o || []).some((k) => k.split(':')[1] === name);
}

// Le début de partie atteint-il le répertoire ? (filtre avant l'analyse complète de la partie)
export function mayReachRepertoire(sans, opts) {
  return !!repertoireEntry(sans, opts);
}

// Partie Lichess (ligne NDJSON) → partie normalisée, ou null (hors cadence, hors répertoire, inachevée…).
export function normalizeLichess(g, player, speeds = ['blitz', 'rapid']) {
  if (!g || !speeds.includes(g.speed) || g.rated === false) return null;
  const ent = repertoireEntry(String(g.moves || '').split(' ').slice(0, TRANSPO_PLIES));
  if (!ent) return null;
  const p = parseLichessGame(g, player);
  if (!p || !RESULTS.includes(p.result)) return null;
  return {
    p: 'li', id: g.id, w: p.white, wr: p.whiteElo, b: p.black, br: p.blackElo,
    y: new Date(p.date).getUTCFullYear(), t: g.createdAt || 0, r: p.result, s: g.speed, san: p.san, rp: ent.rep, e: ent.ply,
  };
}

// Partie d'une archive mensuelle Chess.com → partie normalisée, ou null.
export function normalizeChessCom(g, player, speeds = ['blitz', 'rapid']) {
  if (!g || !speeds.includes(g.time_class) || g.rated === false || g.rules !== 'chess' || !g.pgn) return null;
  const ent = repertoireEntry(firstSans(PGN_BODY(g.pgn), TRANSPO_PLIES));
  if (!ent) return null;
  const p = parseChessComGame(g, player);
  if (!p || !RESULTS.includes(p.result)) return null;
  const id = String(g.url || '').split('/').pop();
  if (!id) return null;
  return {
    p: 'cc', id, w: p.white, wr: p.whiteElo, b: p.black, br: p.blackElo,
    y: new Date(p.date).getUTCFullYear(), t: (g.end_time || 0) * 1000, r: p.result, s: g.time_class, san: p.san, rp: ent.rep, e: ent.ply,
  };
}

// Analyse d'une réponse NDJSON (lignes vides ou tronquées ignorées et comptées).
export function parseNdjson(text) {
  const out = [];
  let bad = 0;
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { bad++; }
  }
  return { items: out, bad };
}

// Champs publiés d'une partie (noms usuels des joueurs suivis, tournoi et ronde, lien direct).
export function publicGame(g) {
  const out = { p: g.p, id: g.id, w: g.w, wr: g.wr, b: g.b, br: g.br, y: g.y, t: g.t, r: g.r, s: g.s };
  for (const k of ['wn', 'bn', 'ev', 'rd', 'u', 'c']) if (g[k]) out[k] = g[k];
  // Ouverture du répertoire atteinte et demi-coup d'entrée (transpositions).
  const ent = entryOf(g);
  if (ent) { out.rp = ent.rep; out.e = ent.ply; }
  return out;
}

const avgElo = (g) => {
  const r = [g.wr, g.br].filter((x) => Number.isFinite(x));
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
};

// Agrégation par position (clé FEN sans compteurs) à partir de la racine du répertoire et
// jusqu'à `plies` demi-coups. Pour chaque coup : [san, blancs, nulles, noirs, Elo moyen du
// joueur qui le joue, parties Lichess, parties Chess.com, tournois, puis — règle de couleur, parties
// marquées `c` (campDuTop) — blancs, nulles, noirs]. Parties exemples : les `samples`
// parties de moyenne Elo la plus haute passant par la position.
export function aggregate(games, { plies = 24, minPositionGames = 2, samples = 3 } = {}) {
  const positions = new Map();
  const kept = [];
  for (const g of games) {
    const ent = entryOf(g);
    if (!ent) continue;
    const gi = kept.length;
    kept.push(g);
    const root = ent.ply; // coups joués avant l'entrée dans le répertoire : non comptés
    const avg = avgElo(g);
    const c = new Chess();
    const n = Math.min(plies, g.san.length);
    for (let i = 0; i < n; i++) {
      const key = fenKey(c.fen());
      let mv;
      try { mv = c.move(g.san[i]); } catch { break; }
      if (i < root) continue;
      let pos = positions.get(key);
      if (!pos) { pos = { moves: new Map(), samples: [] }; positions.set(key, pos); }
      let m = pos.moves.get(mv.san);
      if (!m) { m = { w: 0, d: 0, b: 0, eloSum: 0, eloN: 0, li: 0, cc: 0, bc: 0, cw: 0, cd: 0, cb: 0 }; pos.moves.set(mv.san, m); }
      const r = g.r === '1-0' ? 'w' : g.r === '0-1' ? 'b' : 'd';
      m[r]++;
      if (g.c) m[`c${r}`]++;
      const elo = mv.color === 'w' ? g.wr : g.br;
      if (Number.isFinite(elo)) { m.eloSum += elo; m.eloN++; }
      m[g.p]++;
      // Top-k par Elo moyen ; une même partie n'est comptée qu'une fois par position.
      if (!pos.samples.some((s) => s.gi === gi)) {
        pos.samples.push({ gi, avg });
        pos.samples.sort((a, b) => b.avg - a.avg || a.gi - b.gi);
        if (pos.samples.length > samples) pos.samples.pop();
      }
    }
  }
  return { positions, games: kept, minPositionGames, plies };
}

// Mise en forme compacte (JSON publié). Les positions de moins de `minPositionGames` parties sont
// retirées : le coup reste compté dans la position précédente, mais la position elle-même est
// « absente » (aucun chiffre n'est extrapolé).
export function compact(agg, minPositionGames = agg.minPositionGames) {
  const positions = {};
  const used = new Map();
  const ref = (gi) => {
    if (!used.has(gi)) used.set(gi, used.size);
    return used.get(gi);
  };
  let dropped = 0;
  for (const [key, pos] of agg.positions) {
    // Colonnes de la règle de couleur seulement si non nulles (format plus court).
    const moves = [...pos.moves].map(([san, m]) => [san, m.w, m.d, m.b, m.eloN ? Math.round(m.eloSum / m.eloN) : null, m.li, m.cc, m.bc,
      ...(m.cw + m.cd + m.cb ? [m.cw, m.cd, m.cb] : [])]);
    const total = moves.reduce((a, m) => a + m[1] + m[2] + m[3], 0);
    if (total < minPositionGames) { dropped++; continue; }
    moves.sort((a, b) => (b[1] + b[2] + b[3]) - (a[1] + a[2] + a[3]) || (a[0] < b[0] ? -1 : 1));
    positions[key] = { m: moves, g: pos.samples.map((s) => ref(s.gi)) };
  }
  const games = [];
  for (const [gi, idx] of used) {
    const g = agg.games[gi];
    games[idx] = { ...publicGame(g), m: g.san.join(' ') };
  }
  return { positions, games, dropped };
}

// Ensemble des parties gardées, comptées par plateforme et par répertoire.
export function countGames(games) {
  const out = { li: 0, cc: 0, bc: 0, ...Object.fromEntries(Object.keys(ROOTS).map((id) => [id, 0])) };
  for (const g of games) {
    out[g.p]++;
    const ent = entryOf(g);
    if (ent) out[ent.rep]++;
  }
  return out;
}

// Dédoublonnage (une partie entre deux joueurs du top apparaît dans les deux exports).
export function dedupe(games) {
  const seen = new Set();
  return games.filter((g) => {
    const k = `${g.p}:${g.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- État persistant (etat.json) ----------
// owners : pour chaque joueur du top × cadence (« li:pseudo:blitz »), la date de sa partie la plus
//   récente vue (`last`) et ses `maxGames` dernières parties téléchargées [id, date] (répertoire ou
//   non) : c'est ce qui définit « ses 100 dernières parties », en mode complet comme incrémental.
// games : parties du répertoire gardées (clé « plateforme:id », donc sans doublon), avec la liste
//   des joueurs du top qui les ont fait entrer (`o`).
// L'agrégat publié est toujours RECALCULÉ à partir de games : ni dérive, ni double comptage.

export const MONTH_MS = 30.44 * 86400000;

export function emptyState() {
  return { version: 1, updatedAt: null, tops: { li: {}, cc: {} }, owners: {}, etags: {}, games: {} };
}

export const ownerKey = (p, user, perf) => `${p}:${String(user).toLowerCase()}:${perf}`;

// Ajoute les parties téléchargées pour un joueur × cadence. items : [{ id, t, game|null }].
// Renvoie le nombre de parties du répertoire inconnues jusque-là.
export function recordDownload(state, key, items, { maxGames }) {
  const o = (state.owners[key] ??= { last: 0, recent: [] });
  const seen = new Set(o.recent.map((r) => r[0]));
  let added = 0;
  for (const it of items) {
    if (!seen.has(it.id)) { o.recent.push([it.id, it.t]); seen.add(it.id); }
    if (it.t > o.last) o.last = it.t;
    if (!it.game) continue;
    const gk = `${it.game.p}:${it.game.id}`;
    const g = state.games[gk];
    if (!g) {
      const { san, y, ...rest } = it.game;
      state.games[gk] = { ...rest, t: it.t, m: san.join(' '), o: [key] };
      added++;
    } else if (!g.o.includes(key)) g.o.push(key);
  }
  o.recent.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  o.recent = o.recent.slice(0, maxGames);
  return added;
}

// Retire : les joueurs sortis du top, les parties hors fenêtre, et celles qui ne font plus partie
// des `maxGames` dernières parties d'aucun joueur du top. Renvoie le nombre de parties retirées.
// monthsBy : fenêtre propre à une source (ex. { bc: 6 } pour les tournois).
export function pruneState(state, { now, months, activeOwners, monthsBy = {} }) {
  const startOf = (p) => now - (monthsBy[p] ?? months) * MONTH_MS;
  for (const k of Object.keys(state.owners)) if (!activeOwners.has(k)) delete state.owners[k];
  const ids = new Map();
  for (const [k, o] of Object.entries(state.owners)) {
    const start = startOf(k.split(':')[0]);
    o.recent = o.recent.filter((r) => r[1] >= start);
    ids.set(k, new Set(o.recent.map((r) => r[0])));
  }
  let removed = 0;
  for (const [gk, g] of Object.entries(state.games)) {
    g.o = g.o.filter((k) => ids.get(k)?.has(g.id));
    if (!g.o.length || g.t < startOf(g.p)) { delete state.games[gk]; removed++; }
  }
  return removed;
}

// Parties de l'état → parties normalisées (pour aggregate).
export function stateGames(state) {
  return Object.values(state.games)
    .sort((a, b) => b.t - a.t || (a.id < b.id ? -1 : 1))
    .map((g) => ({ ...g, y: new Date(g.t).getUTCFullYear(), san: g.m.split(' ') }));
}

// Dernières parties gardées, tous joueurs confondus (« Nouvelles parties »).
// classifyFn(san) → { eco, name } | null (nom d'ouverture, base CC0).
export function recentGames(state, n = 10, classifyFn = () => null) {
  return stateGames(state).slice(0, n).map((g) => {
    const op = classifyFn(g.san);
    return { ...publicGame(g), m: g.m, eco: op?.eco || null, n: op?.name || null };
  });
}

// ---------- Retransmissions Lichess (tournois officiels) ----------

// Découpe un PGN de plusieurs parties.
export function splitPgn(text) {
  return String(text).replace(/\r/g, '').split(/\n\s*\n(?=\[)/).map((x) => x.trim()).filter((x) => x.startsWith('['));
}

export function pgnHeaders(pgn) {
  const h = {};
  for (const m of String(pgn).matchAll(/^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm)) h[m[1]] = m[2].replace(/\\(.)/g, '$1');
  return h;
}

export const FIDE_TC = { standard: 'classical', rapid: 'rapid', blitz: 'blitz' };

// Partie d'une retransmission → partie normalisée (p: 'bc'), ou null (inachevée, autre variante,
// position de départ imposée, hors répertoire, coups illisibles).
// opts : { speed, event, roundName, displayName(nom FIDE) }.
export function normalizeBroadcast(pgn, { speed = 'classical', event = '', roundName = '', displayName = (n) => n } = {}) {
  const h = pgnHeaders(pgn);
  if (!RESULTS.includes(h.Result)) return null;
  if (h.Variant && h.Variant.toLowerCase() !== 'standard') return null;
  if (h.SetUp === '1' || h.FEN) return null;
  const body = PGN_BODY(pgn);
  const ent = repertoireEntry(firstSans(body, TRANSPO_PLIES));
  if (!ent) return null;
  const c = new Chess();
  try { c.loadPgn(pgn); } catch { return null; }
  const san = c.history();
  if (!repertoireEntry(san)) return null;
  const url = h.GameURL || '';
  const id = url.split('/').pop() || `${h.Event}-${h.Round}-${h.White}-${h.Black}`.replace(/\W+/g, '');
  const day = (h.UTCDate || h.Date || '').replace(/\./g, '-');
  let t = Date.parse(`${day}T${h.UTCTime || '12:00:00'}Z`);
  if (!Number.isFinite(t)) t = 0;
  const elo = (x) => (/^\d{3,4}$/.test(x || '') ? Number(x) : null);
  return {
    p: 'bc', id, u: url || undefined, w: displayName(h.White || '?'), wr: elo(h.WhiteElo), b: displayName(h.Black || '?'), br: elo(h.BlackElo),
    y: t ? new Date(t).getUTCFullYear() : null, t, r: h.Result, s: speed, ev: event || h.BroadcastName || h.Event || '', rd: roundName || (h.Round ? `ronde ${h.Round}` : ''),
    san, rp: ent.rep, e: ent.ply, wFide: h.WhiteFideId || null, bFide: h.BlackFideId || null,
  };
}

// Garder une partie de tournoi : les deux joueurs à minElo+ (Elo FIDE de la retransmission), ou
// au moins un joueur suivi.
export function keepBroadcast(g, { minElo = 2600, isSuivi = () => false } = {}) {
  if (isSuivi(g.w) || isSuivi(g.b)) return true;
  return g.wr != null && g.br != null && g.wr >= minElo && g.br >= minElo;
}

// Tournoi retenu : catégorie Lichess la plus haute (tier 5), ou un joueur suivi dans la liste des
// participants annoncée.
export function keepTour(tour, { minTier = 5, mentionsSuivi = () => false } = {}) {
  return (tour?.tier ?? 0) >= minTier || mentionsSuivi(tour?.info?.players || '');
}
