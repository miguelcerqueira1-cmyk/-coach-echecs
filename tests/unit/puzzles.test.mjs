import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireProbleme, verdict, bilan, urlProbleme } from '../../site/js/puzzles-core.js';
import { planTheorie } from '../../site/js/progress.js';
import { niveauProblemes } from '../../site/js/routine-core.js';

const fx = (f) => JSON.parse(readFileSync(new URL(`../fixtures/${f}`, import.meta.url)));

test('problème Lichess : position rejouée, dernier coup adverse, solution jouable', () => {
  const j = fx('puzzle-hanging.json');
  const p = lireProbleme(j);
  assert.ok(p);
  assert.equal(p.fen.split(' ')[0], j.puzzle.fen.split(' ')[0]);
  assert.deepEqual(p.solution, j.puzzle.solution);
  assert.match(p.url, /^https:\/\/lichess\.org\/training\//);
  assert.equal(p.dernier.lan, j.puzzle.lastMove ?? p.dernier.lan);
});

test('problème Lichess : réponse incohérente → refusé', () => {
  assert.equal(lireProbleme(null), null);
  assert.equal(lireProbleme({ puzzle: { id: 'x', solution: [] }, game: { pgn: 'e4' } }), null);
  const j = fx('puzzle-hanging.json');
  assert.equal(lireProbleme({ ...j, puzzle: { ...j.puzzle, solution: ['a1a8'] } }), null);
  assert.equal(lireProbleme({ ...j, game: { ...j.game, pgn: 'e4 e5 Zz9' } }), null);
});

test('verdict : coup attendu, autre mat accepté (règle Lichess), sinon raté', () => {
  // Mat du couloir : Ta8# attendu ; Te8# (autre tour) aussi mat.
  const fen = '6k1/5ppp/8/8/8/8/5PPP/R3R1K1 w - - 0 1';
  assert.equal(verdict(fen, 'a1a8', ['a1a8'], 0), 'ok');
  assert.equal(verdict(fen, 'e1e8', ['a1a8'], 0), 'mat');
  assert.equal(verdict(fen, 'g1f1', ['a1a8'], 0), 'ko');
  assert.equal(verdict(fen, 'a1a9', ['a1a8'], 0), 'ko');
});

test('bilan et URL', () => {
  assert.deepEqual(bilan([{ reussi: true }, { reussi: false }, { reussi: true }]), { total: 3, ok: 2 });
  assert.equal(urlProbleme('hangingPiece'), 'https://lichess.org/api/puzzle/next?angle=hangingPiece&difficulty=easier');
});

test('théorie de la routine : seulement les variantes apprises, Blitz seulement si maîtrisées', () => {
  const f = (id, pct, extra = {}) => ({ id, pct, due: 0, sorties: 0, ...extra });
  const board = { fiches: [f('a', 0), f('b', 90), f('c', 85), f('d', 40, { due: 2 })] };
  assert.deepEqual(planTheorie(board, {}), { ids: [], apprises: 0, rapide: false });
  const p1 = planTheorie(board, { b: {}, c: {}, d: {} });
  assert.deepEqual(p1.ids.sort(), ['b', 'c', 'd']);
  assert.equal(p1.rapide, false); // d n'est pas maîtrisée
  const p2 = planTheorie(board, { b: {}, c: {} });
  assert.equal(p2.rapide, true);
  assert.deepEqual(planTheorie(board, { b: {}, c: {} }, { peut: (id) => id !== 'b' }).ids, ['c']);
});

test('niveau des problèmes : très facile par défaut, valeur inconnue ignorée', () => {
  assert.equal(niveauProblemes({}), 'easiest');
  assert.equal(niveauProblemes({ niveau: 'easier' }), 'easier');
  assert.equal(niveauProblemes({ niveau: 'expert' }), 'easiest');
});
