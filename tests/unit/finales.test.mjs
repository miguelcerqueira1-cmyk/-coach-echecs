import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from '../../site/vendor/chess.js';
import FINALES from '../../site/data/finales.js';
import { cpPour, apresMonCoup, apresSonCoup, noterFinale, SEUIL } from '../../site/js/finales-core.js';

test('finales : positions légales, au trait du camp de l’utilisateur, vérifiées par Stockfish', () => {
  const verif = JSON.parse(readFileSync(new URL('../../data/finales-verif.json', import.meta.url))).finales;
  const ids = new Set();
  for (const f of FINALES) {
    assert.ok(!ids.has(f.id)); ids.add(f.id);
    const c = new Chess(f.fen);
    assert.equal(c.turn(), f.camp, f.id);
    assert.ok(!c.isGameOver(), f.id);
    assert.ok(['mat', 'promotion', 'nulle'].includes(f.but));
    assert.ok(f.methode.length > 40 && f.limite > 0);
    assert.equal(verif[f.id]?.fen, f.fen, `${f.id} : à vérifier (node scripts/verify-finales.mjs)`);
    assert.equal(verif[f.id].ok, true, f.id);
  }
  assert.ok(FINALES.filter((f) => f.gratuit).length >= 3);
});

test('finales : verdict après mon coup', () => {
  const mat = { but: 'mat', limite: 5 };
  // Mat du couloir.
  const c = new Chess('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  const m = c.move('Ra8#');
  assert.equal(apresMonCoup(mat, c, m, 1, 10000).etat, 'reussi');
  // Pat avec la Dame : raté, raison « Pat ».
  const p = new Chess('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1');
  const pm = p.move('Qg6');
  const v = apresMonCoup(mat, p, pm, 1, 0);
  assert.equal(v.etat, 'rate');
  assert.match(v.raison, /Pat/);
  // Gain perdu selon Stockfish ; limite dépassée.
  const q = new Chess('8/8/8/3k4/8/8/8/4K2Q w - - 0 1');
  const qm = q.move('Qh2');
  assert.equal(apresMonCoup(mat, q, qm, 1, SEUIL.mat - 1).etat, 'rate');
  assert.equal(apresMonCoup(mat, q, qm, 1, 9000).etat, 'continue');
  assert.equal(apresMonCoup(mat, q, qm, 5, 9000).etat, 'rate');
  // Nulle : tenue jusqu'à la limite ; perdante sous le seuil.
  const nulle = { but: 'nulle', limite: 3 };
  assert.equal(apresMonCoup(nulle, q, qm, 3, 0).etat, 'reussi');
  assert.equal(apresMonCoup(nulle, q, qm, 1, -500).etat, 'rate');
  // Promotion qui garde le gain.
  const pr = new Chess('8/4P3/8/8/8/2k5/8/4K3 w - - 0 1');
  const pp = pr.move('e8=Q');
  assert.equal(apresMonCoup({ but: 'promotion', limite: 10 }, pr, pp, 1, 2000).etat, 'reussi');
});

test('finales : verdict après le coup adverse, score, progression', () => {
  const pat = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); // noir pat
  assert.equal(apresSonCoup({ but: 'mat' }, pat).etat, 'rate');
  assert.equal(apresSonCoup({ but: 'nulle' }, pat).etat, 'reussi');
  assert.equal(cpPour({ type: 'mate', value: 3 }, 'w', 'w'), 9997);
  assert.equal(cpPour({ type: 'cp', value: 120 }, 'b', 'w'), -120);
  let p = noterFinale({}, 'dame', { ok: false });
  p = noterFinale(p, 'dame', { ok: true, indices: 2 });
  assert.deepEqual([p.dame.ok, p.dame.sansIndice, p.dame.essais], [true, false, 2]);
  p = noterFinale(p, 'dame', { ok: true, indices: 0 });
  assert.equal(p.dame.sansIndice, true);
});
