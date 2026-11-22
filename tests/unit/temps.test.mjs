import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLichessGame, parseChessComGame, tempsParCoup, analyseTemps, bilanTempsParties, lireCadence, horlogesPgn } from '../../site/js/games-core.js';
import { chronoProblemes, SUIVI } from '../../site/js/routine-core.js';

const lichess = JSON.parse(readFileSync(new URL('../fixtures/lichess-clocks.json', import.meta.url)));

test('Lichess : pendules lues (entrée finale du joueur tombé ignorée), fin au temps', () => {
  const noir = parseLichessGame(lichess, 'fadi1618');
  assert.equal(noir.finTemps, 'moi');
  assert.deepEqual(noir.tc, { initial: 180, increment: 2 });
  assert.equal(noir.clocks.length, noir.san.length);
  assert.equal(parseLichessGame(lichess, 'paperboi85').finTemps, 'adversaire');
  const t = tempsParCoup(noir);
  assert.equal(t[12], 52.4); // 7.Fc4 : 151,63 s → 101,23 s, + 2 s d'incrément
});

test('analyse du temps : phases, longues réflexions, coup simple d’après Stockfish', () => {
  const g = parseLichessGame(lichess, 'fadi1618');
  const a = analyseTemps(g);
  assert.equal(a.finTemps, 'moi');
  assert.equal(a.longs[0].san, 'Kf8');
  assert.equal(a.longs[0].s, 36.1);
  assert.equal(a.phases.map((p) => p.phase).join(), 'ouverture,milieu de partie');
  // Avec une analyse : perte faible → « coup simple » ; dernière éval favorable → perdue avec l'avantage.
  const plies = g.san.map((_, i) => ({ i, phase: i < 20 ? 'ouverture' : 'milieu de partie', loss: 10, cpBefore: 0, cpAfter: -250 }));
  const b = analyseTemps(g, plies);
  assert.equal(b.longs[0].facile, true);
  assert.equal(b.perduAvecAvantage, true); // −250 côté Blancs = +2,5 pour les Noirs
  assert.equal(analyseTemps({ ...g, clocks: null }), null);
});

test('Chess.com : [%clk] du PGN, cadence, « timeout »', () => {
  assert.deepEqual(lireCadence('180+2'), { initial: 180, increment: 2 });
  assert.deepEqual(lireCadence('600'), { initial: 600, increment: 0 });
  assert.equal(lireCadence('1/86400'), null);
  assert.deepEqual(horlogesPgn('1. d4 {[%clk 0:02:59.9]} 1... d5 {[%clk 0:02:58]}'), [179.9, 178]);
  const g = parseChessComGame({
    url: 'https://www.chess.com/game/live/1', rules: 'chess', time_class: 'blitz', time_control: '180', end_time: 1,
    white: { username: 'Moi', rating: 800, result: 'timeout' }, black: { username: 'Lui', rating: 800, result: 'win' },
    pgn: '[White "Moi"]\n[Black "Lui"]\n[Result "0-1"]\n[TimeControl "180"]\n\n1. d4 {[%clk 0:02:59]} 1... d5 {[%clk 0:02:58]} 2. c4 {[%clk 0:02:20]} 0-1',
  }, 'moi');
  assert.equal(g.finTemps, 'moi');
  assert.deepEqual(tempsParCoup(g), [1, 2, 39]);
});

test('bilan du temps sur plusieurs parties', () => {
  const g = parseLichessGame(lichess, 'fadi1618');
  const b = bilanTempsParties([g, { ...g, clocks: null, finTemps: null }]);
  assert.equal(b.parties, 2);
  assert.equal(b.avecPendule, 1);
  assert.equal(b.perduesTemps, 1);
  assert.ok(b.phases.length >= 1);
});

test('routine : chrono des problèmes et suivi « perdus au temps »', () => {
  assert.equal(chronoProblemes({}), 0);
  assert.equal(chronoProblemes({ chrono: 15 }), 15);
  assert.equal(chronoProblemes({ chrono: 7 }), 0);
  assert.ok(SUIVI.temps);
});
