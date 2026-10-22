// Logique pure du jeu de données Élite (sans réseau, testée) : lecture des réponses Lichess /
// Chess.com, filtre du répertoire, agrégation par position et sélection des parties exemples.
import { Chess } from '../site/vendor/chess.js';
import { parseLichessGame, parseChessComGame } from '../site/js/games-core.js';
import { fenKey, repertoireOfSan, ROOTS } from '../site/js/elite.js';

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

// Le début de partie peut-il atteindre le répertoire ? (évite de rejouer toutes les parties)
export function mayReachRepertoire(sans) {
  return !!repertoireOfSan(sans);
}

// Partie Lichess (ligne NDJSON) → partie normalisée, ou null (hors cadence, hors répertoire, inachevée…).
export function normalizeLichess(g, player, speeds = ['blitz', 'rapid']) {
  if (!g || !speeds.includes(g.speed) || g.rated === false) return null;
  if (!mayReachRepertoire(String(g.moves || '').split(' ').slice(0, 3))) return null;
  const p = parseLichessGame(g, player);
  if (!p || !RESULTS.includes(p.result)) return null;
  return {
    p: 'li', id: g.id, w: p.white, wr: p.whiteElo, b: p.black, br: p.blackElo,
    y: new Date(p.date).getUTCFullYear(), r: p.result, s: g.speed, san: p.san,
  };
}

// Partie d'une archive mensuelle Chess.com → partie normalisée, ou null.
export function normalizeChessCom(g, player, speeds = ['blitz', 'rapid']) {
  if (!g || !speeds.includes(g.time_class) || g.rated === false || g.rules !== 'chess' || !g.pgn) return null;
  if (!mayReachRepertoire(firstSans(PGN_BODY(g.pgn), 3))) return null;
  const p = parseChessComGame(g, player);
  if (!p || !RESULTS.includes(p.result)) return null;
  const id = String(g.url || '').split('/').pop();
  if (!id) return null;
  return {
    p: 'cc', id, w: p.white, wr: p.whiteElo, b: p.black, br: p.blackElo,
    y: new Date(p.date).getUTCFullYear(), r: p.result, s: g.time_class, san: p.san,
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

const avgElo = (g) => {
  const r = [g.wr, g.br].filter((x) => Number.isFinite(x));
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
};

// Agrégation par position (clé FEN sans compteurs) à partir de la racine du répertoire et
// jusqu'à `plies` demi-coups. Pour chaque coup : [san, blancs, nulles, noirs, Elo moyen du
// joueur qui le joue, parties Lichess, parties Chess.com]. Parties exemples : les `samples`
// parties de moyenne Elo la plus haute passant par la position.
export function aggregate(games, { plies = 24, minPositionGames = 2, samples = 3 } = {}) {
  const positions = new Map();
  const kept = [];
  for (const g of games) {
    const rep = repertoireOfSan(g.san);
    if (!rep) continue;
    const gi = kept.length;
    kept.push(g);
    const root = ROOTS[rep].length;
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
      if (!m) { m = { w: 0, d: 0, b: 0, eloSum: 0, eloN: 0, li: 0, cc: 0 }; pos.moves.set(mv.san, m); }
      if (g.r === '1-0') m.w++; else if (g.r === '0-1') m.b++; else m.d++;
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
    const moves = [...pos.moves].map(([san, m]) => [san, m.w, m.d, m.b, m.eloN ? Math.round(m.eloSum / m.eloN) : null, m.li, m.cc]);
    const total = moves.reduce((a, m) => a + m[1] + m[2] + m[3], 0);
    if (total < minPositionGames) { dropped++; continue; }
    moves.sort((a, b) => (b[1] + b[2] + b[3]) - (a[1] + a[2] + a[3]) || (a[0] < b[0] ? -1 : 1));
    positions[key] = { m: moves, g: pos.samples.map((s) => ref(s.gi)) };
  }
  const games = [];
  for (const [gi, idx] of used) {
    const g = agg.games[gi];
    games[idx] = { p: g.p, id: g.id, w: g.w, wr: g.wr, b: g.b, br: g.br, y: g.y, r: g.r, s: g.s, m: g.san.join(' ') };
  }
  return { positions, games, dropped };
}

// Ensemble des parties gardées, comptées par plateforme et par répertoire.
export function countGames(games) {
  const out = { li: 0, cc: 0, gd: 0, ck: 0 };
  for (const g of games) {
    out[g.p]++;
    out[repertoireOfSan(g.san)]++;
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
