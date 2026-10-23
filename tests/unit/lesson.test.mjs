import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nomFr, commentaires, lessonSteps, courseOrder } from '../../site/js/lesson-core.js';

const data = JSON.parse(readFileSync(new URL('../../site/data/repertoire.json', import.meta.url), 'utf8'));
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('noms d’ouverture traduits (nom officiel conservé à part)', () => {
  assert.equal(nomFr("Queen's Gambit Declined: Orthodox Defense, Main Line"), 'Gambit Dame refusé : Défense orthodoxe, ligne principale');
  assert.equal(nomFr('Caro-Kann Defense: Advance Variation, Short Variation'), 'Défense Caro-Kann : Variante d’avance, variante Short');
  assert.equal(nomFr("Queen's Gambit Declined: Orthodox Defense, Bd3 Line"), 'Gambit Dame refusé : Défense orthodoxe, ligne Fd3');
  assert.equal(nomFr('Caro-Kann Defense: Karpov Variation'), 'Défense Caro-Kann : Variante Karpov');
});

test('commentaires factuels : centre, développement, clouage, roque, prise, échec', () => {
  assert.match(commentaires(START, 'd4').join(' '), /centre/);
  const fen = 'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 0 4';
  const n = commentaires(fen, 'Bg5').join(' ');
  assert.match(n, /Développement/);
  assert.match(n, /Cloue le Cavalier en f6 sur la Dame en d8/);
  assert.match(commentaires('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'O-O').join(' '), /Petit roque/);
  assert.match(commentaires('rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2', 'dxc4').join(' '), /Prend le pion en c4/);
});

test('leçon : un pas par demi-coup, noms atteints, coups de notre camp marqués', () => {
  const e = data.entries.find((x) => x.id === 'gd-orthodoxe');
  const steps = lessonSteps(e, 'w');
  assert.equal(steps.length, e.san.length);
  assert.ok(steps[0].ours && !steps[1].ours);
  assert.equal(steps[2].nom.fr, 'Gambit Dame');
  assert.ok(steps.some((s) => s.nom?.fr === 'Gambit Dame refusé : Défense orthodoxe'));
  for (const s of steps) assert.ok(s.notes.length >= 1);
});

test('ordre du cours : théorie d’abord, toutes les fiches présentes', () => {
  for (const rep of ['gd', 'ck']) {
    const o = courseOrder(data.entries, rep);
    assert.equal(o.length, data.entries.filter((e) => e.rep === rep).length);
    const firstNonTheory = o.findIndex((e) => e.badge !== 'theorie');
    assert.ok(o.slice(firstNonTheory).every((e) => e.badge !== 'theorie'));
  }
});
