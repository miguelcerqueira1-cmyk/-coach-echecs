import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../../site/vendor/chess.js';
import { raisonErreur, nextStreak } from '../../site/js/drills-core.js';

const fenAfter = (san) => { const c = new Chess(); san.forEach((m) => c.move(m)); return c.fen(); };

test('raison d’un coup refusé : piège de la fiche, pièce en prise (chess.js), sinon rappel du coup', () => {
  const qg = fenAfter(['d4', 'd5']);
  assert.equal(raisonErreur({ fen: qg, uci: 'a2a3', expectedSan: 'c4' }), 'Ce n’est pas le coup de la ligne. Ici, on joue c4.');
  assert.equal(raisonErreur({ fen: qg, uci: 'a2a3' }), 'Ce n’est pas le coup de la ligne.', 'coup attendu non révélé');
  // 3.Cg5 : le Cavalier est pris par la Dame d8 sans contrepartie.
  const it = fenAfter(['e4', 'e5', 'Nf3', 'Nc6']);
  assert.match(raisonErreur({ fen: it, uci: 'f3g5', expectedSan: 'Bb5' }), /^Erreur ! Après Cg5, votre Cavalier en g5 peut être pris sans contrepartie\. Ici, on joue Fb5\.$/);
  // Piège de la fiche : son texte (ligne vérifiée par Stockfish) prime.
  assert.equal(raisonErreur({ fen: it, uci: 'd1e2', trap: { uci: 'd1e2', texte: 'Texte.' } }), 'Erreur ! C’est le piège de la fiche : Texte.');
  // Mat : pas d'« erreur ».
  assert.equal(raisonErreur({ fen: fenAfter(['f3', 'e5', 'g4']), uci: 'd8h4' }), null);
});

test('série : +1 à chaque réussite du premier coup, remise à zéro à l’erreur, meilleure série gardée', () => {
  let s = { cur: 0, best: 0 };
  for (const ok of [true, true, true, false, true]) s = nextStreak(s, ok);
  assert.deepEqual(s, { cur: 1, best: 3 });
});

test('ligne complète : la suite Stockfish prolonge la fiche, marquée « moteur » ; bilan des temps', async () => {
  const { lineSteps, bilanTemps } = await import('../../site/js/drills-core.js');
  const { lessonSteps } = await import('../../site/js/lesson-core.js');
  const e = { san: ['d4', 'd5'], uci: ['d2d4', 'd7d5'], suite: { san: ['c4', 'e6'], uci: ['c2c4', 'e7e6'] } };
  assert.equal(lineSteps(e, 'w').length, 2, 'fiche seule par défaut');
  const full = lineSteps(e, 'w', { complet: true });
  assert.deepEqual(full.map((s) => [s.uci, s.ours, s.moteur]), [['d2d4', true, false], ['d7d5', false, false], ['c2c4', true, true], ['e7e6', false, true]]);
  assert.equal(lineSteps({ ...e, suite: null }, 'w', { complet: true }).length, 2, 'pas de suite calculée : fiche seule');
  const les = lessonSteps(e, 'w', { complet: true });
  assert.equal(les.length, 4);
  assert.equal(les[2].moteur, true);
  assert.match(les[2].notes[0], /Suite conseillée par Stockfish/);
  assert.equal(bilanTemps([]), null);
  const t = bilanTemps([{ ms: 1000, i: 0 }, { ms: 4000, i: 2 }, { ms: 2500, i: 4 }], 2);
  assert.equal(t.moy, 2500);
  assert.deepEqual(t.lents.map((x) => x.ms), [4000, 2500]);
});
