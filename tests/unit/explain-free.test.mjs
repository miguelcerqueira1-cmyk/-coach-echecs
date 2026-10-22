import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../site/js/game.js';
import { buildAdvice, buildThreat, nullMoveFen } from '../../site/js/analysis.js';
import { explicationGratuite, piecesEnDanger, renderExplication } from '../../site/js/explain-free.js';

// Résultat moteur simulé (la logique d'explication est testée, pas Stockfish).
const res = (game, pv, cp, extra = {}) => ({
  bestmove: pv[0], info: { pv, score: { type: 'cp', value: cp }, depth: 20, ...extra }, token: game.token(), movetime: 1000, elapsedMs: 900, engine: 'test',
});

test('pièces en danger : non défendue, ou attaquée par moins cher', () => {
  // Cavalier blanc en e5 attaqué par le pion d6, défendu par d4 : en danger (pion < Cavalier).
  const d = piecesEnDanger('4k3/8/3p4/4N3/3P4/8/8/4K3 w - - 0 1', 'w');
  assert.deepEqual(d.map((p) => p.square), ['e5']);
  // Pion d4 attaqué par rien : pas en danger.
  assert.equal(piecesEnDanger('4k3/8/8/8/3P4/8/8/4K3 w - - 0 1', 'w').length, 0);
});

test('explication à notre tour : prise sans reprise, menace, plan factuel', () => {
  // Les Noirs viennent de jouer …Cg4?? qui laisse le Cavalier en prise de la Dame d1.
  const g = Game.fromPgn('1. e4 e5 2. d4 Nf6 3. Nc3 Ng4', { playerColor: 'w' });
  const adv = buildAdvice(g, res(g, ['d1g4', 'd7d5'], 320));
  assert.equal(adv.ok, true);
  const s = explicationGratuite({ game: g, advice: adv, threat: null, deviation: null });
  const html = renderExplication(s);
  assert.match(html, /Dernier coup :/);
  assert.match(html, /Les Noirs ont joué <strong>Cg4<\/strong>/);
  assert.match(html, /Pourquoi ce coup :/);
  assert.match(html, /Dxg4/);
  assert.match(html, /prend le Cavalier en g4/);
  assert.match(html, /\+3,20/);
  assert.match(html, /Roi est encore au centre/);
  assert.match(html, /Suite calculée/);
});

test('explication : menace sérieuse détectée par l’analyse « coup nul »', () => {
  const g = Game.fromPgn('1. e4 e5 2. Nf3 d6 3. Bc4 Bg4', { playerColor: 'w' });
  const adv = buildAdvice(g, res(g, ['e1g1'], 30));
  // L'adversaire, s'il rejouait, prendrait le Cf3 : évaluation chute à −2,00.
  const nf = nullMoveFen(adv.fen);
  const thr = buildThreat(adv.fen, { bestmove: 'g4f3', info: { pv: ['g4f3'], score: { type: 'cp', value: 200 }, depth: 12 } });
  assert.ok(thr && nf);
  const html = renderExplication(explicationGratuite({ game: g, advice: adv, threat: thr, deviation: null }));
  assert.match(html, /Menace à surveiller :/);
  assert.match(html, /menace sérieuse/);
  assert.match(html, /prendrait le Cavalier en f3/);
  assert.match(html, /roque/);
});

test('explication au tour adverse : présentée comme calcul, pas comme prédiction', () => {
  const g = Game.fromPgn('1. e4', { playerColor: 'w' });
  const adv = buildAdvice(g, res(g, ['c7c5'], 30));
  const html = renderExplication(explicationGratuite({ game: g, advice: adv, threat: null, deviation: null }));
  assert.match(html, /Meilleure réponse adverse calculée/);
  assert.match(html, /Un humain peut jouer autre chose/);
  assert.doesNotMatch(html, /<script/);
});
