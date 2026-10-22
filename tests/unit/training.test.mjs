import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTree, key, weightedPick, verdict, cpFrom } from '../../site/js/training-core.js';

const data = JSON.parse(readFileSync(new URL('../../site/data/repertoire.json', import.meta.url), 'utf8'));

test('arbre Gambit Dame : 2.c4 est un coup du répertoire, 2…dxc4 un coup adverse possible', () => {
  const t = buildTree(data.entries, 'gd');
  assert.equal(t.color, 'w');
  assert.ok(t.ours.get('').has('d2d4'));
  assert.ok(t.ours.get(key(['d2d4', 'd7d5'])).has('c2c4'));
  assert.ok(t.theirs.get(key(['d2d4', 'd7d5', 'c2c4'])).has('d5c4'));
  // Erreur adverse connue : 2…Fg4 (fiche « Sortie hâtive …Fg4 »).
  const err = t.errors.get(key(['d2d4', 'd7d5', 'c2c4', 'c8g4']));
  assert.equal(err.id, 'gd-fg4');
  // Piège : Cxd5 ?? dans l'échange (piège de l'Éléphant).
  const trap = t.traps.get(key(['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c4d5', 'e6d5', 'c1g5', 'b8d7']));
  assert.equal(trap.uci, 'c3d5');
});

test('arbre Caro-Kann : nous sommes les Noirs, 1…c6 est notre coup', () => {
  const t = buildTree(data.entries, 'ck');
  assert.equal(t.color, 'b');
  assert.ok(t.ours.get(key(['e2e4'])).has('c7c6'));
  assert.ok(t.theirs.get(key(['e2e4', 'c7c6'])).has('d2d4'));
  // Le mat étouffé Cd6# est un piège (notre coup fautif …Cgf6).
  const trap = t.traps.get(key(['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'b8d7', 'd1e2']));
  assert.equal(trap.uci, 'g8f6');
});

test('tirage pondéré par le nombre de parties', () => {
  const moves = [{ uci: 'a', weight: 90 }, { uci: 'b', weight: 10 }];
  assert.equal(weightedPick(moves, () => 0.0).uci, 'a');
  assert.equal(weightedPick(moves, () => 0.95).uci, 'b');
  assert.equal(weightedPick([], () => 0.5), null);
  let b = 0;
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2000; i++) if (weightedPick(moves, rng).uci === 'b') b++;
  assert.ok(b > 120 && b < 280, `fréquence de b ≈ 10 % (obtenu ${b / 20} %)`);
});

test('verdicts', () => {
  assert.equal(verdict({ isBookMove: true }).level, 'repertoire');
  assert.equal(verdict({ isTrap: true, isBookMove: false }).level, 'piege');
  assert.equal(verdict({ inBook: true, loss: 20 }).level, 'bon-hors-fiche');
  assert.equal(verdict({ inBook: false, loss: 20 }).level, 'bon');
  assert.equal(verdict({ loss: 80 }).level, 'imprecision');
  assert.equal(verdict({ loss: 200 }).level, 'erreur');
  assert.equal(verdict({ loss: 900 }).level, 'gaffe');
  assert.equal(cpFrom({ type: 'cp', value: 50 }, 'b', 'w'), -50);
  assert.ok(cpFrom({ type: 'mate', value: 2 }, 'w', 'w') > 9000);
  assert.ok(cpFrom({ type: 'mate', value: -1 }, 'w', 'w') < -9000);
});
