import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../site/js/game.js';
import { Engine, parseInfo } from '../../site/js/engine.js';
import { buildAdvice, buildCandidates, formatGap } from '../../site/js/analysis.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const info = (k, cp, pv, depth = 20) => parseInfo(`info depth ${depth} multipv ${k} score cp ${cp} nodes 1000 pv ${pv}`);

test('candidats MultiPV : rejoués par chess.js, meilleur en tête, écart en pions', () => {
  const lines = [info(1, 30, 'e2e4 e7e5 g1f3'), info(2, 22, 'd2d4 d7d5 c2c4'), info(3, 15, 'g1f3 d7d5')];
  const c = buildCandidates(START, lines, 'e2e4');
  assert.deepEqual(c.map((x) => x.san), ['e4', 'd4', 'Nf3']);
  assert.deepEqual(c.map((x) => x.rank), [1, 2, 3]);
  assert.equal(c[0].gap, null);
  assert.equal(c[1].gap, -0.08);
  assert.equal(formatGap(c[2].gap), '−0,15');
  assert.equal(c[1].lineText, '1. d4 d5 2. c4');
  assert.equal(c[2].scoreText, '+0,15');
});

test('candidats : coup illégal ou doublon écarté ; meilleur coup absent → aucun candidat', () => {
  const lines = [info(1, 30, 'e2e4 e7e5'), info(2, 25, 'e2e5'), info(3, 20, 'e2e4 c7c5'), info(4, 10, 'c2c4')];
  assert.deepEqual(buildCandidates(START, lines, 'e2e4').map((x) => x.san), ['e4', 'c4']);
  assert.deepEqual(buildCandidates(START, lines, 'g1f3'), []);
  // Ordre MultiPV différent du bestmove : le coup conseillé est remis en tête.
  assert.deepEqual(buildCandidates(START, [info(1, 30, 'd2d4'), info(2, 30, 'e2e4')], 'e2e4').map((x) => x.san), ['e4', 'd4']);
});

test('candidats : écart non chiffré quand un mat est en jeu ; point de vue des Noirs', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const c = buildCandidates(fen, [info(1, -20, 'c7c6 d2d4'), info(2, -35, 'e7e5'), parseInfo('info depth 9 multipv 3 score mate -5 pv g7g5')], 'c7c6');
  assert.equal(c[0].scoreText, '+0,20', 'éval. affichée côté Blancs');
  assert.equal(c[1].gap, -0.15, 'écart du point de vue des Noirs');
  assert.equal(c[2].gap, null);
  assert.equal(c[1].lineText, '1… e5');
});

test('buildAdvice : candidats seulement si le moteur a rendu plusieurs lignes', () => {
  const g = Game.create();
  const one = buildAdvice(g, { bestmove: 'e2e4', info: info(1, 30, 'e2e4 e7e5'), lines: [info(1, 30, 'e2e4 e7e5')], movetime: 1000 });
  assert.deepEqual(one.candidates, []);
  const three = buildAdvice(g, { bestmove: 'e2e4', info: info(1, 30, 'e2e4 e7e5'), lines: [info(1, 30, 'e2e4 e7e5'), info(2, 20, 'd2d4')], movetime: 1000 });
  assert.equal(three.ok, true);
  assert.deepEqual(three.candidates.map((x) => x.san), ['e4', 'd4']);
  assert.equal(three.best.san, 'e4');
});

test('moteur : option MultiPV envoyée seulement quand elle change, lignes rendues par rang', async () => {
  const e = new Engine();
  const sent = [];
  e.state = 'ready';
  e.worker = { postMessage: (c) => sent.push(c) };
  const p = e.analyze({ position: 'position startpos', movetime: 50, token: { gameId: 'g' }, multipv: 3 });
  e._onLine('info depth 10 multipv 1 score cp 30 pv e2e4 e7e5');
  e._onLine('info depth 10 multipv 2 score cp 20 pv d2d4');
  e._onLine('info depth 11 multipv 1 score cp 28 lowerbound pv e2e4'); // borne : la valeur exacte reste
  e._onLine('info depth 9 multipv 3 score cp 10 pv g1f3');
  e._onLine('bestmove e2e4 ponder e7e5');
  const r = await p;
  assert.ok(sent.includes('setoption name MultiPV value 3'));
  assert.deepEqual(r.lines.map((l) => [l.multipv, l.score.value]), [[1, 30], [2, 20], [3, 10]]);
  assert.equal(r.info.score.value, 30);
  const before = sent.length;
  const p2 = e.analyze({ position: 'position startpos', movetime: 50, token: { gameId: 'g' } });
  e._onLine('bestmove e2e4');
  await p2;
  assert.ok(sent.slice(before).includes('setoption name MultiPV value 1'), 'retour à 1 ligne pour un calcul simple');
  e.current = null;
  for (const t of [e.current, e.pending]) if (t) clearTimeout(t.watchdog);
});
