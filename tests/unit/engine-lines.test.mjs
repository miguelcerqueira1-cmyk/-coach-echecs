import test from 'node:test';
import assert from 'node:assert/strict';
import { linesCompletes } from '../../site/js/engine.js';

const info = (depth, mv, k, cp = 10) => ({ depth, multipv: k, pv: [mv], score: { type: 'cp', value: cp } });
const job = (infos, multipv = 3) => {
  const j = { multipv, lines: [], byDepth: [] };
  for (const i of infos) { j.lines[i.multipv] = i; (j.byDepth[i.depth] ??= [])[i.multipv] = i; }
  return j;
};

test('MultiPV : lignes désynchronisées à l’arrêt → 3 coups distincts, le coup final inclus', () => {
  // Cas réel (position de départ) : ligne 1 passe de d4 à e4 à la même profondeur.
  const j = job([info(20, 'd2d4', 1, 39), info(20, 'e2e4', 2, 38), info(20, 'g1f3', 3, 32), info(20, 'e2e4', 1, 40), info(21, 'd2d4', 2, 32)]);
  const r = linesCompletes(j, 'e2e4').map((i) => i.pv[0]);
  assert.equal(new Set(r).size, 3);
  assert.ok(r.includes('e2e4') && r.includes('d2d4') && r.includes('g1f3'));
});

test('MultiPV : coup final absent → dernières lignes reçues', () => {
  const j = job([info(10, 'e2e4', 1), info(10, 'd2d4', 2), info(10, 'g1f3', 3)]);
  assert.deepEqual(linesCompletes(j, 'b1c3').map((i) => i.pv[0]), ['e2e4', 'd2d4', 'g1f3']);
});

test('MultiPV 1 : la ligne reçue', () => {
  assert.equal(linesCompletes(job([info(5, 'e2e4', 1)], 1), 'e2e4').length, 1);
});
