import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nouveauClassement, difficultePour, noterProbleme, themesFaibles, THEMES_PROBLEMES, lire, DEPART } from '../../site/js/problemes-core.js';
import { NIVEAUX_SF, niveauSF, finDePartie, pourMoi, noterPartie, niveauConseille, departDepuis } from '../../site/js/partie-stockfish-core.js';
import { Chess } from '../../site/vendor/chess.js';

test('classement problèmes : formule Elo, K provisoire puis 20, plancher', () => {
  assert.equal(nouveauClassement(1200, 1200, true, 0), 1220);
  assert.equal(nouveauClassement(1200, 1200, false, 0), 1180);
  assert.equal(nouveauClassement(1200, 1200, true, 30), 1210);
  assert.equal(nouveauClassement(1200, 1144, true, 0), 1217);
  assert.equal(nouveauClassement(1200, NaN, true, 0), 1200); // difficulté inconnue : rien ne bouge
  assert.equal(nouveauClassement(400, 2000, false, 0), 400);
});

test('difficulté demandée à Lichess selon le classement', () => {
  assert.deepEqual([800, 1200, 1500, 1800, 2100].map(difficultePour), ['easiest', 'easier', 'normal', 'harder', 'hardest']);
});

test('noter un problème : thèmes, historique par jour, problèmes vus', () => {
  const mem = { getItem: () => null };
  let d = lire(mem);
  assert.equal(d.classement, DEPART);
  let r = noterProbleme(d, { id: 'a', theme: 'fork', difficulte: 1200, reussi: true, now: new Date('2026-11-23T10:00:00Z') });
  r = noterProbleme(r.data, { id: 'b', theme: 'fork', difficulte: 1200, reussi: false, now: new Date('2026-11-23T11:00:00Z') });
  d = r.data;
  assert.deepEqual(d.themes.fork, { n: 2, ok: 1 });
  assert.equal(d.histo.length, 1);
  assert.deepEqual(d.vus, ['a', 'b']);
  for (let i = 0; i < 5; i++) d = noterProbleme(d, { id: `p${i}`, theme: 'pin', difficulte: 1000, reussi: i < 1 }).data;
  assert.equal(themesFaibles(d)[0].id, 'pin');
  assert.ok(THEMES_PROBLEMES.some((t) => t.id === 'mix' && t.gratuit));
});

test('partie contre Stockfish : niveaux, fins de partie, bilan, conseil', () => {
  assert.equal(NIVEAUX_SF.length, 10);
  assert.deepEqual(niveauSF(7).force, { elo: 1500 });
  assert.equal(niveauSF(10).force, null);
  for (const n of NIVEAUX_SF) if (n.force?.elo) assert.ok(n.force.elo >= 1320 && n.force.elo <= 3190);
  const mat = departDepuis(['f3', 'e5', 'g4', 'Qh4#']);
  assert.deepEqual(finDePartie(mat), { resultat: '0-1', raison: 'échec et mat' });
  assert.equal(finDePartie(new Chess()), null);
  assert.equal(pourMoi('0-1', 'b'), 'v');
  assert.equal(pourMoi('0-1', 'w'), 'd');
  assert.equal(pourMoi('½-½', 'w'), 'n');
  let d = { niveaux: {} };
  for (const i of ['v', 'v', 'n']) d = noterPartie(d, 3, i);
  assert.deepEqual(d.niveaux[3], { v: 2, n: 1, d: 0 });
  assert.equal(niveauConseille(d, 3), 4);
  assert.equal(niveauConseille(noterPartie({ niveaux: {} }, 3, 'd'), 3), null);
});
