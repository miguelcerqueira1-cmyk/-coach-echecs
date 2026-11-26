import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempsRush, charger, enregistrer, melanger, KEY } from '../../site/js/rush-core.js';

const memoire = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('Rush : chrono qui raccourcit, 8 s minimum', () => {
  assert.equal(tempsRush(0), 20);
  assert.equal(tempsRush(5), 15);
  assert.equal(tempsRush(30), 8);
});

test('Rush : record et historique (30 parties max)', () => {
  const st = memoire();
  assert.deepEqual(charger(st), { best: 0, parties: [] });
  assert.equal(enregistrer(0, 0, st).record, false);
  const r = enregistrer(7, 1, st);
  assert.deepEqual([r.record, r.best, r.avant], [true, 7, 0]);
  assert.equal(enregistrer(5, 2, st).record, false);
  assert.equal(charger(st).best, 7);
  for (let i = 0; i < 40; i++) enregistrer(1, 3 + i, st);
  assert.equal(charger(st).parties.length, 30);
  st.setItem(KEY, '{illisible');
  assert.deepEqual(charger(st), { best: 0, parties: [] });
});

test('Rush : mélange sans reprendre la dernière position en premier', () => {
  const a = melanger([1, 2, 3], 1, () => 0.99);
  assert.notEqual(a[0], 1);
  assert.deepEqual([...a].sort(), [1, 2, 3]);
});
