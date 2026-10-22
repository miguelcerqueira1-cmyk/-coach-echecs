// Logique pure de la page « Mes parties » : lecture des formats Lichess / Chess.com,
// sortie du répertoire, classement des erreurs (pertes d'évaluation Stockfish) et bilan.
// Tout chiffre affiché provient de Stockfish ; toute règle (pièce en prise…) de chess.js.
import { Chess } from '../vendor/chess.js';
import { START_FEN } from './lines.js';
import { buildTree, key } from './training-core.js';
import { piecesEnDanger } from './explain-free.js';
import { sanFr } from './analysis.js';

const SPEED_FR = { ultraBullet: 'UltraBullet', bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapide', classical: 'Classique', correspondence: 'Correspondance', daily: 'Correspondance' };

function resultFor(result, color) {
  if (result === '1/2-1/2') return 'nulle';
  if (result === '1-0') return color === 'w' ? 'victoire' : 'défaite';
  if (result === '0-1') return color === 'b' ? 'victoire' : 'défaite';
  return 'inconnu';
}

function sanList(moves) {
  const c = new Chess();
  const out = [];
  for (const m of moves) {
    try { out.push(c.move(m).san); } catch { return null; }
  }
  return out;
}

// Une ligne NDJSON de l'export Lichess (/api/games/user/…).
export function parseLichessGame(g, username) {
  if (!g || g.variant !== 'standard' || g.initialFen) return null;
  const me = username.toLowerCase();
  const wName = g.players?.white?.user?.name || 'Anonyme';
  const bName = g.players?.black?.user?.name || 'Anonyme';
  const color = wName.toLowerCase() === me ? 'w' : bName.toLowerCase() === me ? 'b' : null;
  if (!color) return null;
  const san = sanList((g.moves || '').split(' ').filter(Boolean));
  if (!san) return null;
  const result = g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : (['draw', 'stalemate'].includes(g.status) ? '1/2-1/2' : '*');
  return {
    site: 'Lichess', id: `li-${g.id}`, url: `https://lichess.org/${g.id}`, date: new Date(g.createdAt || g.lastMoveAt || 0).toISOString(),
    speed: SPEED_FR[g.speed] || g.speed, rated: !!g.rated, color,
    white: wName, black: bName, whiteElo: g.players?.white?.rating ?? null, blackElo: g.players?.black?.rating ?? null,
    result, outcome: resultFor(result, color), opening: g.opening ? `${g.opening.eco} ${g.opening.name}` : '', san,
  };
}

// Une partie de l'archive mensuelle Chess.com (/pub/player/…/games/AAAA/MM).
export function parseChessComGame(g, username) {
  if (!g || g.rules !== 'chess' || !g.pgn) return null;
  const me = username.toLowerCase();
  const color = g.white?.username?.toLowerCase() === me ? 'w' : g.black?.username?.toLowerCase() === me ? 'b' : null;
  if (!color) return null;
  const c = new Chess();
  try { c.loadPgn(g.pgn); } catch { return null; }
  const h = c.getHeaders();
  if (h.SetUp === '1' && h.FEN && h.FEN !== START_FEN) return null;
  const result = ['1-0', '0-1', '1/2-1/2'].includes(h.Result) ? h.Result : '*';
  const ecoName = (h.ECOUrl || '').split('/').pop()?.replace(/-/g, ' ') || '';
  return {
    site: 'Chess.com', id: `cc-${(g.url || '').split('/').pop() || g.end_time}`, url: g.url, date: new Date((g.end_time || 0) * 1000).toISOString(),
    speed: SPEED_FR[g.time_class] || g.time_class, rated: !!g.rated, color,
    white: g.white.username, black: g.black.username, whiteElo: g.white.rating ?? null, blackElo: g.black.rating ?? null,
    result, outcome: resultFor(result, color), opening: [h.ECO, ecoName].filter(Boolean).join(' '), san: c.history(),
  };
}

// Partie jouée sur la page Moteur → même forme qu'une partie importée, pour le bilan.
// L'identifiant dépend des coups : la même partie réutilise son analyse en cache.
export function localGame({ san, color, result = '*', white, black, opening = '' }) {
  let h = 0;
  for (const ch of san.join(' ')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return {
    site: 'Échiquier', id: `moteur-${san.length}-${(h >>> 0).toString(36)}`, url: null, local: true,
    date: new Date().toISOString(), speed: 'Partie de l’échiquier', rated: false, color,
    white: white || (color === 'w' ? 'Moi' : 'Adversaire'), black: black || (color === 'b' ? 'Moi' : 'Adversaire'),
    whiteElo: null, blackElo: null, result, outcome: result === '*' ? 'en cours' : resultFor(result, color), opening, san: san.slice(),
  };
}

// Répertoire concerné par la partie (null si hors répertoire).
export function repertoireOf(game) {
  if (game.color === 'w') return game.san[0] === 'd4' ? 'gd' : null;
  return game.san[0] === 'e4' && game.san[1] === 'c6' ? 'ck' : (game.san[0] === 'e4' ? 'ck-hors' : null);
}

// Premier écart avec les fiches : qui sort du répertoire, à quel coup, et ce qui était prévu.
export function repertoireDeviation(game, entries) {
  const rep = repertoireOf(game);
  if (rep === 'ck-hors') return { rep: 'ck', who: 'moi', ply: 1, played: game.san[1], expected: ['c6'], note: 'Contre 1.e4, votre répertoire est la Caro-Kann (1…c6).' };
  if (!rep) return { rep: null };
  const tree = buildTree(entries, rep);
  const c = new Chess();
  const path = [];
  for (let i = 0; i < game.san.length; i++) {
    const mover = i % 2 === 0 ? 'w' : 'b';
    const k = key(path);
    const mv = c.move(game.san[i]);
    if (mover === game.color) {
      const book = tree.ours.get(k);
      if (!book) return { rep, who: 'fin', ply: i, note: 'Fin de la théorie des fiches.' };
      const trap = tree.traps.get(k);
      if (trap && trap.uci === mv.lan) return { rep, who: 'moi', ply: i, played: mv.san, expected: [...book.keys()].map((u) => sanOf(path, u)), trap };
      if (!book.has(mv.lan)) {
        const fiche = book.get([...book.keys()][0])[0];
        return { rep, who: 'moi', ply: i, played: mv.san, expected: [...book.keys()].map((u) => sanOf(path, u)), fiche };
      }
    } else {
      const theirs = tree.theirs.get(k);
      const ours = tree.ours.get(key([...path, mv.lan]));
      if (!theirs || (!theirs.has(mv.lan) && !ours)) {
        path.push(mv.lan);
        const err = tree.errors.get(key(path));
        return { rep, who: 'adversaire', ply: i, played: mv.san, err };
      }
    }
    path.push(mv.lan);
    const err = tree.errors.get(key(path));
    if (err && mover !== game.color) {
      // Erreur adverse prévue par une fiche : l'utilisateur a-t-il trouvé la punition ?
      const next = game.san[i + 1];
      const expected = sanOf(path, err.suite[0]);
      return { rep, who: 'adversaire-erreur', ply: i, played: mv.san, err, punished: next === expected, expected: [expected], playedNext: next };
    }
  }
  return { rep, who: 'aucun', ply: game.san.length };
}

function sanOf(path, uci) {
  const c = new Chess();
  for (const u of path) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
}

// Numéro de coup lisible pour un demi-coup (0 = 1.).
export function moveNo(ply) { return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`; }

// Score UCI du camp au trait → centipions côté Blancs, mats bornés à ±1000.
export function whiteCp(score, turn) {
  if (!score) return null;
  let v = score.type === 'mate' ? (score.value > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, score.value));
  if (score.type === 'mate' && score.value === 0) v = -1000;
  return turn === 'w' ? v : -v;
}

export const CLASSES = [
  { min: 300, id: 'gaffe', label: 'Gaffe', mark: '??' },
  { min: 120, id: 'erreur', label: 'Erreur', mark: '?' },
  { min: 50, id: 'imprecision', label: 'Imprécision', mark: '?!' },
];
export const classify = (loss) => CLASSES.find((c) => loss >= c.min) || null;

function phase(fen, ply) {
  if (ply < 20) return 'ouverture';
  const c = new Chess(fen);
  let n = 0;
  for (const row of c.board()) for (const p of row) if (p && p.type !== 'k' && p.type !== 'p') n++;
  return n <= 6 ? 'finale' : 'milieu de partie';
}

// evals[i] : { cp (Blancs), best (uci) } pour la position AVANT le demi-coup i ; evals[n] : position finale.
export function analyseGame(game, evals) {
  const c = new Chess();
  const plies = [];
  for (let i = 0; i < game.san.length; i++) {
    const fenBefore = c.fen();
    const mv = c.move(game.san[i]);
    const e0 = evals[i];
    const e1 = evals[i + 1];
    if (!e0 || !e1 || e0.cp == null || e1.cp == null) { plies.push({ i, san: mv.san, mover: mv.color }); continue; }
    const sign = mv.color === 'w' ? 1 : -1;
    const loss = Math.max(0, sign * (e0.cp - e1.cp));
    let bestSan = null;
    if (e0.best && e0.best !== mv.lan) {
      try { bestSan = new Chess(fenBefore).move({ from: e0.best.slice(0, 2), to: e0.best.slice(2, 4), promotion: e0.best[4] }).san; } catch { /* ignoré */ }
    }
    const cls = bestSan ? classify(loss) : null; // si le coup joué est le meilleur, pas de faute
    plies.push({
      i, san: mv.san, uci: mv.lan, mover: mv.color, fenBefore, fenAfter: c.fen(), cpBefore: e0.cp, cpAfter: e1.cp,
      loss: bestSan ? loss : 0, bestSan, bestUci: bestSan ? e0.best : null, cls, phase: phase(fenBefore, i),
      hanging: piecesEnDanger(c.fen(), mv.color),
    });
  }
  return plies;
}

// Bilan d'une partie : moments décisifs, erreurs principales, trois pistes de travail.
export function bilan(game, plies, deviation) {
  const mine = plies.filter((p) => p.mover === game.color && p.loss != null && p.cpBefore != null);
  const theirs = plies.filter((p) => p.mover !== game.color && p.cpBefore != null);
  const errors = mine.filter((p) => p.cls).sort((a, b) => b.loss - a.loss);
  const decisive = plies.filter((p) => p.cpBefore != null && p.cls && p.loss >= 150).sort((a, b) => b.loss - a.loss).slice(0, 3)
    .sort((a, b) => a.i - b.i);
  const avg = mine.length ? Math.round(mine.reduce((a, p) => a + Math.min(p.loss, 1000), 0) / mine.length) : null;
  const count = (id) => mine.filter((p) => p.cls?.id === id).length;
  const pistes = [];
  if (deviation?.who === 'moi' && deviation.expected?.length) {
    pistes.push({ id: 'repertoire', text: `Revoir l’ouverture : au coup ${moveNo(deviation.ply)} vous avez joué ${sanFr(deviation.played)}, votre répertoire prévoit ${deviation.expected.map(sanFr).join(' ou ')}${deviation.fiche ? ` (par exemple fiche « ${deviation.fiche.nom} »)` : ''}. Le mode Entraînement permet de le répéter.` });
  } else if (deviation?.who === 'adversaire-erreur' && !deviation.punished) {
    pistes.push({ id: 'punition', text: `L’adversaire a commis une erreur connue au coup ${moveNo(deviation.ply)} (${sanFr(deviation.played)}) : la punition était ${sanFr(deviation.expected[0])} (fiche « ${deviation.err.nom} »).` });
  }
  const hangingBlunder = errors.find((p) => p.cls.id === 'gaffe' && p.hanging?.length);
  if (hangingBlunder) {
    pistes.push({ id: 'pieces', text: `Vérifier les pièces en prise avant chaque coup : après ${moveNo(hangingBlunder.i)} ${sanFr(hangingBlunder.san)}, la ou les pièces en ${hangingBlunder.hanging.map((h) => h.square).join(', ')} étaient mal protégées (le moteur préférait ${sanFr(hangingBlunder.bestSan)}).` });
  }
  const missed = theirs.filter((p) => p.cls?.id === 'gaffe').map((p) => plies[p.i + 1]).find((n) => n && n.mover === game.color && n.loss >= 150);
  if (missed) {
    pistes.push({ id: 'occasion', text: `Saisir les cadeaux : au coup ${moveNo(missed.i)}, après une gaffe adverse, ${sanFr(missed.bestSan)} gardait un net avantage ; vous avez joué ${sanFr(missed.san)} (perte ≈ ${(Math.min(missed.loss, 1000) / 100).toFixed(1).replace('.', ',')}).` });
  }
  const byPhase = {};
  for (const p of errors) byPhase[p.phase] = (byPhase[p.phase] || 0) + p.loss;
  const worst = Object.entries(byPhase).sort((a, b) => b[1] - a[1])[0];
  if (worst && pistes.length < 3) {
    pistes.push({ id: 'phase', text: `Phase la plus coûteuse : ${worst[0]} (${errors.filter((p) => p.phase === worst[0]).length} faute(s)).` });
  }
  if (pistes.length < 3 && avg != null) {
    pistes.push({ id: 'precision', text: `Précision : perte moyenne de ${(avg / 100).toFixed(2).replace('.', ',')} pion par coup ; ${count('gaffe')} gaffe(s), ${count('erreur')} erreur(s), ${count('imprecision')} imprécision(s).` });
  }
  return { errors: errors.slice(0, 3), decisive, avg, counts: { gaffe: count('gaffe'), erreur: count('erreur'), imprecision: count('imprecision') }, pistes: pistes.slice(0, 3) };
}
