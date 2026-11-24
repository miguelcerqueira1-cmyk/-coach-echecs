import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Variante } from '../../site/js/variante-core.js';
import { Game } from '../../site/js/game.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('brouillon : part d’une position passée, ne touche pas la partie réelle', () => {
  const g = Game.create({ playerColor: 'w', level: 'intermediaire' });
  for (const m of ['e2e4', 'e7e5', 'g1f3', 'b8c6']) g.play(m);
  const rev = g.revision;
  const v = new Variante(g.startFen, g.moves.map((m) => m.uci), 2); // après 1.e4 e5
  assert.equal(v.turn(), 'w');
  const mv = v.play({ from: 'f1', to: 'c4' });
  assert.equal(mv.san, 'Bc4');
  v.play('g8f6');
  assert.deepEqual(v.ucis(), ['e2e4', 'e7e5', 'f1c4', 'g8f6']);
  assert.equal(g.ply, 4);
  assert.equal(g.revision, rev);
  assert.deepEqual(g.moves.map((m) => m.san), ['e4', 'e5', 'Nf3', 'Nc6']);
});

test('brouillon : navigation, coup joué au milieu remplace la suite, retrait', () => {
  const v = new Variante(START, [], 0);
  v.play('e2e4'); v.play('c7c5'); v.play('g1f3');
  assert.equal(v.aller(1), 1);
  assert.equal(v.lastMove().san, 'e4');
  v.play('e7e5');
  assert.deepEqual(v.coups.map((m) => m.san), ['e4', 'e5']);
  assert.equal(v.retirer(), true);
  assert.deepEqual(v.coups.map((m) => m.san), ['e4']);
  v.retirer();
  assert.equal(v.retirer(), false);
  assert.throws(() => v.play('e2e5'), /illégal/);
});

test('brouillon : numérotation à partir d’une position où les Noirs ont le trait', () => {
  const v = new Variante(START, ['e2e4'], 1);
  v.play('e7e5'); v.play('g1f3');
  assert.deepEqual(v.numeros().map((n) => `${n.no}${n.color}`), ['1b', '2w']);
  assert.equal(v.over(), false);
});
