import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseLichessGame, parseChessComGame, repertoireDeviation, analyseGame, bilan, whiteCp, classify, moveNo,
} from '../../site/js/games-core.js';

const data = JSON.parse(readFileSync(new URL('../../site/data/repertoire.json', import.meta.url), 'utf8'));

test('lecture d’une partie Lichess (NDJSON)', () => {
  const g = parseLichessGame({
    id: 'abcd1234', rated: true, variant: 'standard', speed: 'blitz', createdAt: 1760000000000, status: 'mate', winner: 'white',
    players: { white: { user: { name: 'LeugiMC' }, rating: 985 }, black: { user: { name: 'Adv' }, rating: 1010 } },
    opening: { eco: 'D06', name: 'Queen\'s Gambit' }, moves: 'd4 d5 c4 Bf5',
  }, 'leugimc');
  assert.equal(g.color, 'w');
  assert.equal(g.outcome, 'victoire');
  assert.equal(g.speed, 'Blitz');
  assert.deepEqual(g.san, ['d4', 'd5', 'c4', 'Bf5']);
  assert.equal(g.url, 'https://lichess.org/abcd1234');
  assert.equal(parseLichessGame({ variant: 'chess960', players: {} }, 'x'), null);
});

test('lecture d’une partie Chess.com (archive mensuelle)', () => {
  const g = parseChessComGame({
    url: 'https://www.chess.com/game/live/123', rules: 'chess', time_class: 'blitz', rated: true, end_time: 1760000000,
    white: { username: 'Adv', rating: 900, result: 'win' }, black: { username: 'QG_Miguel', rating: 880, result: 'checkmated' },
    pgn: '[Event "Live Chess"]\n[White "Adv"]\n[Black "QG_Miguel"]\n[Result "1-0"]\n[ECO "B12"]\n[ECOUrl "https://www.chess.com/openings/Caro-Kann-Defense-Advance-Variation"]\n\n1. e4 c6 2. d4 d5 3. e5 Bf5 1-0',
  }, 'qg_miguel');
  assert.equal(g.color, 'b');
  assert.equal(g.outcome, 'défaite');
  assert.equal(g.site, 'Chess.com');
  assert.match(g.opening, /^B12 Caro Kann Defense Advance Variation$/);
  assert.equal(g.san.length, 6);
});

const game = (san, color) => ({ san, color });

test('sortie du répertoire par le joueur, avec la fiche attendue', () => {
  const d = repertoireDeviation(game(['d4', 'd5', 'Nf3'], 'w'), data.entries);
  assert.equal(d.rep, 'gd');
  assert.equal(d.who, 'moi');
  assert.equal(moveNo(d.ply), '2.');
  assert.deepEqual(d.expected, ['c4']);
});

test('erreur adverse connue non punie (2…Fg4 ? 3.Db3 au lieu de cxd5)', () => {
  const d = repertoireDeviation(game(['d4', 'd5', 'c4', 'Bg4', 'Qb3'], 'w'), data.entries);
  assert.equal(d.who, 'adversaire-erreur');
  assert.equal(d.err.id, 'gd-fg4');
  assert.equal(d.punished, false);
  assert.deepEqual(d.expected, ['cxd5']);
});

test('Caro-Kann : 1…e5 contre 1.e4 est une sortie du répertoire ; 1.d4 avec les Noirs est hors répertoire', () => {
  assert.equal(repertoireDeviation(game(['e4', 'e5'], 'b'), data.entries).who, 'moi');
  assert.equal(repertoireDeviation(game(['d4', 'd5'], 'b'), data.entries).rep, null);
});

test('analyse : gaffe détectée par la perte d’évaluation, bilan factuel', () => {
  // 1.e4 e5 2.Dh5 Cc6 3.Fc4 Cf6?? 4.Dxf7# — nous avons les Noirs.
  const g = game(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'], 'b');
  const evals = [
    { cp: 30, best: 'e2e4' }, { cp: 30, best: 'e7e5' }, { cp: 30, best: 'g1f3' }, { cp: 0, best: 'b8c6' },
    { cp: 0, best: 'f1c4' }, { cp: 0, best: 'g7g6' }, { cp: 1000, best: 'h5f7' }, { cp: 1000, best: null },
  ];
  const plies = analyseGame(g, evals);
  const nf6 = plies[5];
  assert.equal(nf6.san, 'Nf6');
  assert.equal(nf6.cls.id, 'gaffe');
  assert.equal(nf6.bestSan, 'g6');
  assert.equal(plies[6].cls, null, 'le coup joué est le meilleur : pas de faute');
  const b = bilan(g, plies, { who: 'aucun' });
  assert.equal(b.counts.gaffe, 1);
  assert.equal(b.errors[0].san, 'Nf6');
  assert.ok(b.pistes.every((x) => !/\b(N|B|R|Q|K)[a-h]?[1-8]?x?[a-h][1-8]/.test(x.text)), 'notation française dans les pistes');
  assert.ok(b.pistes.length >= 1 && b.pistes.length <= 3);
  assert.ok(b.decisive.some((p) => p.san === 'Nf6'));
});

test('conversions et seuils', () => {
  assert.equal(whiteCp({ type: 'cp', value: 50 }, 'b'), -50);
  assert.equal(whiteCp({ type: 'mate', value: 3 }, 'w'), 1000);
  assert.equal(whiteCp({ type: 'mate', value: 0 }, 'w'), -1000);
  assert.equal(classify(40), null);
  assert.equal(classify(60).id, 'imprecision');
  assert.equal(classify(150).id, 'erreur');
  assert.equal(classify(400).id, 'gaffe');
});
