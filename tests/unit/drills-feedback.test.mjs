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
