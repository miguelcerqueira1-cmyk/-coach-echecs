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

import { rapport, motifs, lineSan, lineText, pourVous } from '../../site/js/games-core.js';

test('rapport détaillé : erreur expliquée (mat du berger), variante et bon coup, points à retenir', () => {
  const game = { color: 'b', outcome: 'défaite', san: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'] };
  const evals = [30, 30, 30, 30, 30, 30, 1000, 1000].map((cp, i) => ({ cp, best: i === 5 ? 'g7g6' : null }));
  const plies = analyseGame(game, evals);
  const b = bilan(game, plies, null);
  const deep = { 5: { best: { pv: ['g7g6', 'h5f3', 'g8f6'], cp: 30 }, played: { pv: ['h5f7'], cp: 1000 } } };
  const r = rapport(game, plies, b, null, deep);
  assert.equal(r.erreurs.length, 1);
  const e = r.erreurs[0];
  assert.equal(e.coup, '3… Cf6');
  assert.equal(e.meilleurCoup, 'g6');
  assert.match(e.pourquoi.join(' '), /maté/);
  assert.equal(e.refutation, '4. Dxf7#');
  assert.equal(e.meilleureLigne, '3… g6 4. Df3 Cf6');
  assert.equal(e.apres, 'perdant (mat en vue)');
  assert.ok(r.aRetenir.some((x) => /échecs adverses/.test(x)));
  assert.equal(r.exercices[0].i, 5);
  assert.match(r.synthese, /Vous avez perdu/);
});

test('motifs tactiques : fourchette de Cavalier et matériel', () => {
  // Cavalier en c7 : fourchette Roi e8 + Tour a8.
  const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1';
  const m = motifs(fen, lineSan(fen, ['b5c7', 'e8d7', 'c7a8']), 'w');
  assert.ok(m.some((x) => x.id === 'fourchette' && x.qui === 'moi'));
  assert.ok(m.some((x) => x.id === 'materiel-gagne' && x.n === 5));
  assert.equal(lineText(fen, ['Nc7+', 'Kd7']), '1. Cc7+ Rd7');
  assert.equal(pourVous(-120, 'b'), '+1,2');
});

test('vraies erreurs : position à retravailler (sortie, punition manquée), enregistrement et validation', async () => {
  const { positionARevoir } = await import('../../site/js/games-core.js');
  const { recordSortie, vraiesErreurs, markCorrige, dashboard } = await import('../../site/js/progress.js');
  // Sortie : 2.Cf3 au lieu de 2.c4 → position après 1.d4 d5, attendu c2c4.
  const g1 = { ...game(['d4', 'd5', 'Nf3', 'Nf6'], 'w'), id: 'li-a', date: '2026-10-20T10:00:00Z' };
  const p1 = positionARevoir(g1, repertoireDeviation(g1, data.entries));
  assert.deepEqual(p1, { kind: 'sortie', moves: ['d2d4', 'd7d5'], expected: ['c2c4'], played: 'Nf3', ply: 2, color: 'w', texte: null, ficheNom: p1.ficheNom });
  // Punition manquée : après 2…Fg4 ?, attendu cxd5 (1er coup de la punition vérifiée).
  const g2 = { ...game(['d4', 'd5', 'c4', 'Bg4', 'Qb3'], 'w'), id: 'li-b', date: '2026-10-21T10:00:00Z' };
  const p2 = positionARevoir(g2, repertoireDeviation(g2, data.entries));
  assert.equal(p2.kind, 'punition');
  assert.deepEqual(p2.moves, ['d2d4', 'd7d5', 'c2c4', 'c8g4']);
  assert.deepEqual(p2.expected, ['c4d5']);
  assert.equal(p2.played, 'Qb3');
  assert.ok(p2.texte);
  // Caro-Kann : 1…e5 → attendu c7c6.
  const g3 = game(['e4', 'e5'], 'b');
  assert.deepEqual(positionARevoir(g3, repertoireDeviation(g3, data.entries)).expected, ['c7c6']);
  // Rien à retravailler quand la partie suit les fiches.
  const g4 = game(['d4', 'd5', 'c4'], 'w');
  assert.equal(positionARevoir(g4, repertoireDeviation(g4, data.entries)), null);

  let p = { lignes: {}, drills: {}, jours: [], sorties: [{ gameId: 'li-a', ficheId: 'gd-orthodoxe', rep: 'gd', ply: 2, date: g1.date }], cours: {} };
  p = recordSortie(p, { gameId: 'li-a', ficheId: 'gd-orthodoxe', rep: 'gd', ply: 2, date: g1.date, pos: p1, opp: 'Adv' });
  p = recordSortie(p, { gameId: 'li-b', ficheId: 'gd-fg4', rep: 'gd', ply: 3, date: g2.date, pos: p2 });
  p = recordSortie(p, { gameId: 'li-b', ficheId: 'gd-fg4', rep: 'gd', ply: 3, date: g2.date, pos: p2 });
  assert.deepEqual(vraiesErreurs(p).map((x) => x.gameId), ['li-b', 'li-a'], 'une fois par partie, plus récente d’abord ; ancien enregistrement complété');
  assert.equal(p.sorties.length, 2);
  // Une punition manquée n'est pas comptée comme « sortie » dans le tableau de bord.
  const rev = { gd: {}, ck: {} };
  assert.equal(dashboard(data, rev, p).fiches.find((f) => f.id === 'gd-fg4').sorties, 0);
  p = markCorrige(p, 'li-b', Date.UTC(2026, 9, 25));
  assert.deepEqual(vraiesErreurs(p).map((x) => x.gameId), ['li-a']);
});

test('PGN collé : alerte de déviation (erreur adverse connue, sortie de théorie, hors répertoire)', async () => {
  const { alertePgn } = await import('../../site/js/games-core.js');
  const al = (san, color) => { const g = game(san, color); return alertePgn(g, repertoireDeviation(g, data.entries)); };
  const a1 = al(['d4', 'd5', 'c4', 'Bg4', 'Qb3'], 'w');
  assert.equal(a1.niveau, 'warn');
  assert.match(a1.texte, /^Au coup 2… Fg4, l’adversaire a joué une déviation connue \(fiche « .+ »\) ! Elle se punit/);
  assert.deepEqual(a1.ligne.slice(0, 5), ['d4', 'd5', 'c4', 'Bg4', 'cxd5']);
  const a2 = al(['d4', 'd5', 'Nf3'], 'w');
  assert.match(a2.texte, /^Au coup 2\. Cf3, vous sortez de la théorie de vos fiches : le coup prévu était c4\./);
  assert.deepEqual(a2.ligne, ['d4', 'd5', 'c4']);
  assert.equal(al(['e4', 'e5'], 'w').niveau, 'info');
});
