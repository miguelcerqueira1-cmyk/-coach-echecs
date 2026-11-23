import test from 'node:test';
import assert from 'node:assert/strict';
import { seriesLichess, resume, pointDePartie, noterClassements, seriesParties, statsChessCom, routineParSemaine, tendance, cheminCourbe } from '../../site/js/progression-core.js';

const NOW = Date.UTC(2026, 10, 23);

test('historique Lichess : séries par cadence, évolution 30 / 90 jours, record', () => {
  const s = seriesLichess([
    { name: 'Blitz', points: [[2026, 6, 1, 980], [2026, 9, 20, 1010], [2026, 10, 22, 1045]] },
    { name: 'Puzzles', points: [[2026, 9, 1, 1500]] },
    { name: 'Rapid', points: [] },
  ], NOW);
  assert.equal(s.length, 1);
  assert.equal(s[0].nom, 'Blitz');
  assert.equal(s[0].actuel, 1045);
  assert.equal(s[0].d30, 35); // 1045 − 1010 (20 oct., dernier point avant le 24 oct.)
  assert.equal(s[0].d90, 65);
  assert.equal(s[0].max, 1045);
  assert.deepEqual(resume([], NOW), { points: [], actuel: null, d30: null, d90: null, max: null });
});

test('classements tirés des parties importées (Chess.com)', () => {
  const g = (id, date, r, color = 'w') => ({ id, date, site: 'Chess.com', speed: 'Rapide', color, whiteElo: color === 'w' ? r : 900, blackElo: color === 'b' ? r : 900 });
  assert.equal(pointDePartie({ ...g('x', '2026-11-01', 800), local: true }), null);
  let d = noterClassements({ parties: {} }, [g('a', '2026-09-01T10:00:00Z', 740), g('b', '2026-11-20T10:00:00Z', 790, 'b')]);
  d = noterClassements(d, [g('a', '2026-09-01T10:00:00Z', 740)]); // pas de doublon
  const s = seriesParties(d, 'Chess.com', NOW);
  assert.equal(s.length, 1);
  assert.equal(s[0].points.length, 2);
  assert.equal(s[0].actuel, 790);
  assert.equal(s[0].d30, 50); // 790 − 740 (dernière partie avant le 24 octobre : 1er septembre)
  assert.equal(s[0].d90, null);
  const many = noterClassements({ parties: {} }, Array.from({ length: 10 }, (_, i) => g(`p${i}`, `2026-10-${String(i + 1).padStart(2, '0')}`, 700 + i)), 5);
  assert.equal(Object.keys(many.parties).length, 5);
});

test('statistiques Chess.com', () => {
  const s = statsChessCom({ chess_rapid: { last: { rating: 760 }, best: { rating: 812 }, record: { win: 30, loss: 25, draw: 2 } }, chess_blitz: { last: { rating: 640 } } });
  assert.deepEqual(s.map((x) => [x.nom, x.actuel, x.max]), [['Blitz', 640, null], ['Rapide', 760, 812]]);
  assert.deepEqual(s[1].bilan, { v: 30, n: 2, d: 25 });
  assert.deepEqual(statsChessCom(null), []);
});

test('routine sur 4 semaines et tendances', () => {
  const jours = {
    '2026-10-28': { faits: ['a', 'b'], problemes: 4, menaces: 5 },
    '2026-11-04': { faits: ['a'], problemes: 5 },
    '2026-11-20': { faits: ['a', 'b'], problemes: 8, menaces: 2, temps: 1 },
    '2026-11-22': { faits: ['a', 'b'], problemes: 7 },
  };
  const s = routineParSemaine(jours, () => 2, '2026-11-23');
  assert.equal(s.length, 4);
  assert.deepEqual(s[3], { actifs: 2, complets: 2, problemes: 7.5, menaces: 2, temps: 1 });
  assert.equal(s[0].problemes, 4);
  assert.equal(tendance(s, 'problemes', true), 'mieux');
  assert.equal(tendance(s, 'menaces', false), 'mieux');
  assert.equal(tendance(s, 'temps', false), null);
});

test('courbe SVG', () => {
  assert.equal(cheminCourbe([{ t: 1, r: 1000 }]), '');
  const c = cheminCourbe([{ t: 0, r: 1000 }, { t: 10, r: 1100 }], 100, 50);
  assert.equal(c, 'M0.0,46.0 L100.0,4.0');
});
