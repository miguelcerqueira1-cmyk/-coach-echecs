import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../../site/vendor/chess.js';
import { cleCoup, pourquoi } from '../../site/js/pourquoi.js';
import { verifier } from '../../scripts/verifie-pourquoi.mjs';

const START = new Chess().fen();

test('clé d’un coup : position (sans compteurs) + coup', () => {
  assert.equal(cleCoup(START, 'e2e4'), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -|e2e4');
  const t = { [cleCoup(START, 'e2e4')]: ['Le pion prend le centre.', 'The pawn takes the centre.'] };
  assert.equal(pourquoi(t, START, 'e2e4', 'fr'), 'Le pion prend le centre.');
  assert.equal(pourquoi(t, START, 'e2e4', 'en'), 'The pawn takes the centre.');
  assert.equal(pourquoi(t, START, 'd2d4'), null);
  assert.equal(pourquoi(null, START, 'e2e4'), null);
});

test('contrôle : coup orphelin, évaluation chiffrée et coup cité inconnu sont refusés', () => {
  const c = new Chess(); c.move('e4');
  const k1 = cleCoup(c.fen(), 'c7c6'); // 1…c6 de la Caro-Kann
  const ok = verifier('ck', { [k1]: ['Prépare …d5 en soutenant la case d5 ; le Fou c8 garde sa diagonale.', 'Prepares …d5 by supporting d5; the c8-bishop keeps its diagonal.'] });
  assert.deepEqual(ok.erreurs, []);
  const ko = verifier('ck', {
    [k1]: ['Les Noirs sont à +0,3 après Dxh7.', 'Black is fine after Qxh7.'],
    [cleCoup(START, 'a2a3')]: ['x', 'y'],
  });
  assert.ok(ko.erreurs.some((e) => e.includes('évaluation chiffrée')));
  assert.ok(ko.erreurs.some((e) => e.includes('Dxh7')));
  assert.ok(ko.erreurs.some((e) => e.includes('Qxh7')));
  assert.ok(ko.erreurs.some((e) => e.includes('aucun coup de fiche')));
});
