// Transforme un résultat brut du moteur en conseil affichable.
// Chaque coup de variante est rejoué et validé par chess.js avant affichage ;
// la variante est tronquée au premier coup qui ne serait pas légal.
import { Chess } from '../vendor/chess.js';
import { uciToMoveObj } from './game.js';

export const BUDGETS = {
  rapide: { label: 'Rapide', movetime: 1000 },
  standard: { label: 'Standard', movetime: 3000 },
  approfondi: { label: 'Approfondi', movetime: 10000 },
};
export const DEEPER_MOVETIME = 30000;

const PIECE_NAMES = { p: 'Pion', n: 'Cavalier', b: 'Fou', r: 'Tour', q: 'Dame', k: 'Roi' };
const PIECE_FR = { n: 'C', b: 'F', r: 'T', q: 'D', k: 'R' };
export const COLOR_NAMES = { w: 'Blancs', b: 'Noirs' };

export function pieceName(p) { return PIECE_NAMES[p]; }

// SAN anglaise → notation française (C, F, T, D, R).
export function sanFr(san) {
  return san.replace(/^[NBRQK]/, (p) => PIECE_FR[p.toLowerCase()]).replace(/=([NBRQ])/, (_, p) => '=' + PIECE_FR[p.toLowerCase()]);
}

// Rejoue une suite UCI depuis `fen`. Renvoie les coups validés (objets chess.js).
export function validateLine(fen, uciMoves) {
  const c = new Chess(fen);
  const out = [];
  let truncated = false;
  for (const u of uciMoves) {
    try {
      out.push(c.move(uciToMoveObj(u)));
    } catch {
      truncated = true;
      break;
    }
  }
  return { moves: out, truncated };
}

export function describeMove(m) {
  if (!m) return '';
  if (m.san.startsWith('O-O-O')) return 'Grand roque';
  if (m.san.startsWith('O-O')) return 'Petit roque';
  let s = `${PIECE_NAMES[m.piece]} de ${m.from} vers ${m.to}`;
  if (m.isEnPassant()) s = `Pion de ${m.from} prend en passant en ${m.to}`;
  else if (m.captured) s += ` (prend ${PIECE_NAMES[m.captured].toLowerCase()})`;
  if (m.promotion) s += `, promotion en ${PIECE_NAMES[m.promotion].toLowerCase()}`;
  if (m.san.endsWith('#')) s += ', échec et mat';
  else if (m.san.endsWith('+')) s += ', échec';
  return s;
}

// Numérotation « 12. Cf3 Cc6 13. … ».
export function formatLine(moves, startFen, fr = true) {
  const parts = startFen.split(' ');
  let moveNo = Number(parts[5] || 1);
  let turn = parts[1];
  const out = [];
  moves.forEach((m, i) => {
    const s = fr ? sanFr(m.san) : m.san;
    if (turn === 'w') out.push(`${moveNo}. ${s}`);
    else out.push(i === 0 ? `${moveNo}… ${s}` : s);
    if (turn === 'b') moveNo++;
    turn = turn === 'w' ? 'b' : 'w';
  });
  return out.join(' ');
}

// Évaluation ramenée au point de vue des Blancs (le moteur parle du camp au trait).
export function whitePovScore(score, turn) {
  if (!score) return null;
  const sign = turn === 'w' ? 1 : -1;
  return { type: score.type, value: score.value * sign };
}

export function formatScore(wScore) {
  if (!wScore) return '—';
  if (wScore.type === 'mate') {
    if (wScore.value === 0) return 'Mat';
    return `Mat en ${Math.abs(wScore.value)} pour les ${wScore.value > 0 ? 'Blancs' : 'Noirs'}`;
  }
  const v = wScore.value / 100;
  const txt = (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ',');
  return txt;
}

export function scoreVerdict(wScore) {
  if (!wScore) return '';
  if (wScore.type === 'mate') return wScore.value > 0 ? 'gain forcé pour les Blancs' : 'gain forcé pour les Noirs';
  const v = wScore.value;
  const side = v > 0 ? 'Blancs' : 'Noirs';
  const a = Math.abs(v);
  if (a < 30) return 'position équilibrée';
  if (a < 80) return `léger avantage aux ${side}`;
  if (a < 200) return `net avantage aux ${side}`;
  return `avantage décisif aux ${side}`;
}

// WDL du moteur (‰, camp au trait) → point de vue d'une couleur donnée.
export function wdlFor(wdl, turn, color) {
  if (!wdl) return null;
  const [w, d, l] = wdl;
  return turn === color ? { win: w, draw: d, loss: l } : { win: l, draw: d, loss: w };
}

// Coups candidats (MultiPV) : chaque ligne est rejouée par chess.js ; une ligne dont le premier
// coup est illégal ou déjà proposé est écartée. Le premier candidat est toujours le coup conseillé
// (`bestLan`) ; sinon aucun candidat n'est rendu (résultat moteur incohérent).
// gap : écart avec le meilleur, en pions, du point de vue du camp au trait (null si un mat est en jeu).
export function buildCandidates(fen, lines, bestLan, max = 3) {
  const turn = fen.split(' ')[1];
  const out = [];
  for (const info of lines || []) {
    if (!info?.pv?.length || !info.score) continue;
    const line = validateLine(fen, info.pv);
    if (!line.moves.length || out.some((c) => c.move.lan === line.moves[0].lan)) continue;
    const scoreWhite = whitePovScore(info.score, turn);
    out.push({
      move: line.moves[0],
      san: line.moves[0].san,
      line: line.moves.slice(0, 6),
      lineText: formatLine(line.moves.slice(0, 6), fen),
      scoreWhite,
      scoreText: formatScore(scoreWhite),
      mover: info.score,
      depth: info.depth ?? null,
    });
  }
  const i = out.findIndex((c) => c.move.lan === bestLan);
  if (i < 0) return [];
  out.unshift(...out.splice(i, 1));
  const top = out[0].mover;
  return out.slice(0, max).map(({ mover, ...c }, rank) => ({
    ...c,
    rank: rank + 1,
    gap: rank && top.type === 'cp' && mover.type === 'cp' ? (mover.value - top.value) / 100 : null,
  }));
}

// « −0,45 » : écart en pions (toujours négatif ou nul pour un candidat moins bon).
export function formatGap(gap) {
  if (gap == null) return '';
  const v = Math.min(0, gap);
  return `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2).replace('.', ',')}`;
}

// Construit le conseil à partir du résultat moteur et de l'état de la partie.
export function buildAdvice(game, res) {
  const fen = game.fen();
  const turn = game.turn();
  if (!res || !res.bestmove || res.bestmove === '(none)') {
    return { ok: false, error: 'Le moteur n’a renvoyé aucun coup pour cette position.' };
  }
  const info = res.info;
  const pvUci = info?.pv?.length ? info.pv : [res.bestmove];
  if (pvUci[0] !== res.bestmove) pvUci.unshift(res.bestmove);
  const line = validateLine(fen, pvUci);
  if (!line.moves.length || line.moves[0].lan !== res.bestmove) {
    return { ok: false, error: `Le moteur a proposé un coup illégal (${res.bestmove}) : conseil refusé.` };
  }
  const best = line.moves[0];
  const reply = line.moves[1] || null;
  const wScore = whitePovScore(info?.score, turn);
  const playerColor = game.playerColor;
  return {
    ok: true,
    token: res.token,
    fen,
    turn,
    isPlayerTurn: turn === playerColor,
    best,
    bestDescription: describeMove(best),
    reply,
    replyDescription: reply ? describeMove(reply) : null,
    line: line.moves.slice(0, 8),
    lineTruncated: line.truncated,
    lineText: formatLine(line.moves.slice(0, 8), fen),
    candidates: res.lines?.length > 1 ? buildCandidates(fen, res.lines, best.lan) : [],
    scoreWhite: wScore,
    scoreText: formatScore(wScore),
    verdict: scoreVerdict(wScore),
    // Les WDL ne sont affichés que si le moteur les a effectivement fournis.
    wdlPlayer: wdlFor(info?.wdl, turn, playerColor),
    depth: info?.depth ?? null,
    seldepth: info?.seldepth ?? null,
    nodes: info?.nodes ?? null,
    nps: info?.nps ?? null,
    timeMs: info?.time ?? res.elapsedMs,
    movetime: res.movetime,
    engine: res.engine,
  };
}

// Position « coup nul » : on donne le trait à l'adversaire pour voir ce qu'il
// menace. Impossible si le camp au trait est en échec.
export function nullMoveFen(fen) {
  const p = fen.split(' ');
  p[1] = p[1] === 'w' ? 'b' : 'w';
  p[3] = '-';
  p[4] = '0';
  return p.join(' ');
}

export function buildThreat(fen, res) {
  if (!res || !res.bestmove || res.bestmove === '(none)') return null;
  const nf = nullMoveFen(fen);
  const pv = res.info?.pv?.length ? res.info.pv : [res.bestmove];
  const line = validateLine(nf, pv);
  if (!line.moves.length) return null;
  const turn = nf.split(' ')[1];
  return {
    move: line.moves[0],
    san: line.moves[0].san,
    description: describeMove(line.moves[0]),
    lineSan: line.moves.slice(0, 4).map((m) => m.san),
    scoreWhite: whitePovScore(res.info?.score, turn),
    depth: res.info?.depth ?? null,
  };
}
