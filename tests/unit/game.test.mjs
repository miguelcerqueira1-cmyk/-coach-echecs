import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, parseMoveText } from '../../site/js/game.js';
import { Chess } from '../../site/vendor/chess.js';

const playAll = (g, list) => list.forEach((m) => g.play(m));

test('partie complète jusqu’au mat ; plus aucun coup accepté ensuite', () => {
  const g = Game.create();
  playAll(g, ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']);
  const st = g.status();
  assert.equal(st.over, true);
  assert.equal(st.reason, 'mat');
  assert.equal(st.result, '1-0');
  assert.throws(() => g.play('a7a6'), /terminée/);
  assert.match(g.pgn(), /1-0$/);
});

test('coup illégal ou mauvais camp au trait refusé, état inchangé', () => {
  const g = Game.create();
  const rev = g.revision;
  assert.throws(() => g.play('e7e5'), /illégal/); // les Noirs ne sont pas au trait
  assert.throws(() => g.play('e2e5'), /illégal/);
  assert.equal(g.ply, 0);
  assert.equal(g.revision, rev);
});

test('roques, prise en passant, promotion et sous-promotion', () => {
  const g = Game.create({ fen: 'r3k2r/pppq1ppp/8/8/8/8/PPPQ1PPP/R3K2R w KQkq - 0 1' });
  g.play('e1g1');
  g.play('e8c8');
  assert.equal(g.moves[0].san, 'O-O');
  assert.equal(g.moves[1].san, 'O-O-O');
  assert.match(g.fen(), / w - - /);

  const ep = Game.create({ fen: '4k3/8/8/8/4p3/8/3P4/4K3 w - - 0 1' });
  ep.play('d2d4');
  assert.match(ep.fen(), / d3 /, 'case en passant présente car la prise est légale');
  const mv = ep.play('e4d3');
  assert.equal(mv.isEnPassant(), true);

  const pr = Game.create({ fen: '8/P6k/8/8/8/8/8/K7 w - - 0 1' });
  pr.play('a7a8n');
  assert.equal(pr.moves[0].san, 'a8=N');
  const pr2 = Game.create({ fen: '8/P6k/8/8/8/8/8/K7 w - - 0 1' });
  pr2.play({ from: 'a7', to: 'a8', promotion: 'q' });
  assert.equal(pr2.moves[0].san, 'a8=Q');
});

test('pat', () => {
  const s = Game.create({ fen: 'k7/8/8/8/8/8/2Q5/K7 w - - 0 1' });
  assert.equal(s.status().over, false);
  s.play('c2c7');
  assert.equal(s.status().over, true);
  assert.equal(s.status().reason, 'pat');
  assert.equal(s.status().result, '1/2-1/2');
});

test('triple répétition = nulle réclamable (la partie continue) ; quintuple = fin automatique', () => {
  const g = Game.create();
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  playAll(g, cycle);
  playAll(g, cycle);
  let st = g.status();
  assert.equal(st.repetitions, 3);
  assert.deepEqual(st.claimable, ['triple']);
  assert.equal(st.over, false);
  playAll(g, cycle);
  playAll(g, cycle);
  st = g.status();
  assert.equal(st.repetitions, 5);
  assert.equal(st.over, true);
  assert.equal(st.reason, 'quintuple');
});

test('50 coups réclamable, 75 coups automatique', () => {
  const g = Game.create({ fen: '7k/8/8/8/8/8/8/K6R w - - 99 80' });
  g.play('h1h2');
  assert.deepEqual(g.status().claimable, ['50coups']);
  assert.equal(g.status().over, false);
  const h = Game.create({ fen: '7k/8/8/8/8/8/8/K6R w - - 149 120' });
  h.play('h1h2');
  assert.equal(h.status().over, true);
  assert.equal(h.status().reason, '75coups');
});

test('matériel insuffisant', () => {
  const g = Game.create({ fen: '8/8/8/8/8/8/5k2/K3n3 w - - 0 1' });
  assert.equal(g.status().over, true);
  assert.equal(g.status().reason, 'materiel');
});

test('révisions : une ancienne réponse reste identifiable même si la FEN redevient identique', () => {
  const g = Game.create();
  g.play('e2e4');
  const tok = g.token();
  const fen = g.fen();
  g.undo();
  g.play('e2e4');
  assert.equal(g.fen(), fen, 'même position');
  assert.equal(g.isCurrent(tok), false, 'mais révision différente : réponse obsolète');
  assert.equal(g.isCurrent(g.token()), true);
  const other = Game.create();
  assert.equal(other.isCurrent({ ...g.token() }), false, 'autre partie');
});

test('sauvegarde → rechargement : reconstruction par rejeu identique', () => {
  const g = Game.create({ playerColor: 'b' });
  playAll(g, ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4']);
  const json = JSON.stringify(g.toJSON());
  const r = Game.fromRecord(JSON.parse(json));
  assert.equal(r.fen(), g.fen());
  assert.equal(r.id, g.id);
  assert.equal(r.revision, g.revision);
  assert.equal(r.playerColor, 'b');
  assert.equal(r.pgn(), g.pgn());
  assert.equal(r.uciPosition(), 'position startpos moves d2d4 g8f6 c2c4 e7e6 b1c3 f8b4');
});

test('sauvegarde corrompue détectée au rejeu', () => {
  const g = Game.create();
  g.play('e2e4');
  const rec = JSON.parse(JSON.stringify(g.toJSON()));
  rec.moves.push({ uci: 'e2e4', san: 'e4' });
  assert.throws(() => Game.fromRecord(rec), /illégal lors du rejeu/);
});

test('import/export PGN, y compris depuis une FEN', () => {
  const pgn = '[Event "Club"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *';
  const g = Game.fromPgn(pgn, { playerColor: 'w' });
  assert.equal(g.ply, 6);
  assert.equal(g.historyUnknown, false);
  assert.equal(g.turn(), 'w');
  const back = Game.fromPgn(g.pgn());
  assert.equal(back.fen(), g.fen());
  assert.match(g.pgn(), /\[White "A"\]/);

  const f = Game.create({ fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3' });
  f.play('f1b5');
  assert.equal(f.historyUnknown, true);
  const exported = f.pgn();
  assert.match(exported, /\[SetUp "1"\]/);
  const re = Game.fromPgn(exported);
  assert.equal(re.fen(), f.fen());
  assert.equal(re.historyUnknown, true);
  assert.match(f.uciPosition(), /^position fen r1bqkbnr\/pppp1ppp\/2n5\/4p3\/4P3\/5N2\/PPPP1PPP\/RNBQKB1R w KQkq - 2 3 moves f1b5$/);
});

test('FEN invalide refusée ; FEN à 4 champs complétée', () => {
  assert.throws(() => Game.create({ fen: 'pas une fen' }), /FEN invalide/);
  const g = Game.create({ fen: '4k3/8/8/8/8/8/4P3/4K3 w - -' });
  assert.equal(g.fen(), '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
});

test('PGN illisible refusé', () => {
  assert.throws(() => Game.fromPgn('1. e4 e5 2. Ke3 Ke6 3. Qxh8'), /PGN/);
});

test('saisie en notation : français, anglais, UCI, roque, promotion, ambiguïté', () => {
  const c = new Chess();
  assert.equal(parseMoveText(c, 'Cf3')[0].move.lan, 'g1f3');
  assert.equal(parseMoveText(c, 'Nf3')[0].move.lan, 'g1f3');
  assert.equal(parseMoveText(c, 'g1-f3')[0].move.lan, 'g1f3');
  assert.equal(parseMoveText(c, 'e4')[0].move.lan, 'e2e4');
  assert.equal(parseMoveText(c, 'Cf6').length, 0, 'coup du mauvais camp');
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(parseMoveText(castle, '0-0')[0].move.san, 'O-O');
  assert.equal(parseMoveText(castle, 'O-O-O')[0].move.san, 'O-O-O');
  const promo = new Chess('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  assert.equal(parseMoveText(promo, 'a8=D')[0].move.lan, 'a7a8q');
  assert.equal(parseMoveText(promo, 'a8=C')[0].move.lan, 'a7a8n');
  assert.equal(parseMoveText(promo, 'a7a8')[0].move.lan, 'a7a8q');
  // « Rf1 » : Tour f1 (anglais) ou Roi f1 (français) : les deux sont légaux ici.
  const amb = new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
  const r = parseMoveText(amb, 'Rd1');
  assert.equal(r.length, 2);
});
