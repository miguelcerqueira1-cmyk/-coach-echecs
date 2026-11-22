import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jour, blocsDuJour, cocher, noter, historique, serie, THEMES, profilDe, normaliserProfil, PROFIL_HISTORIQUE } from '../../site/js/routine-core.js';

test('routine : 6 blocs en semaine, théorie seule le dimanche, thème de problèmes en alternance', () => {
  const lundi = blocsDuJour('2026-11-16');
  assert.equal(lundi.dimanche, false);
  assert.deepEqual(lundi.blocs.map((b) => b.id), ['tactique', 'vitesse', 'theorie', 'rapide', 'analyse', 'blitz']);
  const dim = blocsDuJour('2026-11-22');
  assert.equal(dim.dimanche, true);
  assert.deepEqual(dim.blocs.map((b) => b.id), ['theorie']);
  const t1 = blocsDuJour('2026-11-16').blocs[0].lien.url;
  const t2 = blocsDuJour('2026-11-17').blocs[0].lien.url;
  assert.notEqual(t1, t2);
  assert.ok(THEMES.some((t) => t.url === t1));
  assert.equal(jour(new Date(2026, 0, 5)), '2026-01-05');
});

test('routine : cases cochées, suivi borné, historique et série de jours complets', () => {
  let d = { jours: {} };
  for (const b of blocsDuJour('2026-11-16').blocs) d = cocher(d, '2026-11-16', b.id, true);
  d = cocher(d, '2026-11-17', 'tactique', true);
  d = cocher(d, '2026-11-17', 'tactique', false);
  assert.deepEqual(d.jours['2026-11-17'].faits, []);
  d = noter(d, '2026-11-16', 'problemes', '14');
  d = noter(d, '2026-11-16', 'menaces', '3');
  d = noter(d, '2026-11-16', 'blitz', '');
  assert.equal(d.jours['2026-11-16'].problemes, 10, 'borné à 10');
  assert.equal(d.jours['2026-11-16'].blitz, null);
  const h = historique(d, '2026-11-17', 3);
  assert.deepEqual(h.map((x) => [x.date, x.faits, x.total, x.menaces]), [['2026-11-17', 0, 6, null], ['2026-11-16', 6, 6, 3], ['2026-11-15', 0, 1, null]]);
  assert.equal(serie(d, '2026-11-17'), 1, 'aujourd’hui pas fini : la série d’hier compte');
  assert.equal(serie(d, '2026-11-18'), 0);
});

test('routine : données abîmées → routine vide, pas de plantage', async () => {
  const { charger, historique } = await import('../../site/js/routine-core.js');
  for (const raw of ['{}', '[1]', 'null', '{"jours":null}', '{oups']) {
    const st = { getItem: () => raw };
    const d = charger(st);
    assert.deepEqual(d.jours, {});
    assert.equal(historique(d, '2026-11-16').length, 7);
  }
});

test('profil de routine : questions au premier lancement, routine d’origine gardée, routines adaptées', () => {
  assert.equal(profilDe({ jours: {} }), null);
  assert.equal(profilDe({ jours: { '2026-11-16': { faits: [] } } }), PROFIL_HISTORIQUE);
  const p20 = normaliserProfil({ temps: '20', sites: ['lichess'], cadences: ['blitz'] });
  assert.deepEqual(profilDe({ jours: {}, profil: p20 }), p20);
  // Routine d'origine inchangée : 6 blocs, partie rapide sur Chess.com, Blitz sur Lichess.
  const h = blocsDuJour('2026-11-16');
  assert.deepEqual(h.blocs.map((b) => b.id), ['tactique', 'vitesse', 'theorie', 'rapide', 'analyse', 'blitz']);
  assert.match(h.blocs.find((b) => b.id === 'rapide').lien.url, /chess\.com/);
  assert.match(h.blocs.find((b) => b.id === 'blitz').lien.url, /lichess/);
  assert.equal(h.blocs.find((b) => b.id === 'blitz').titre, 'Blitz (récompense)');
  // 20 min : 5 problèmes + théorie.
  const c = blocsDuJour('2026-11-16', p20);
  assert.deepEqual(c.blocs.map((b) => b.id), ['tactique', 'theorie']);
  assert.equal(c.blocs[0].n, 5);
  // 45 min, Lichess seul, Bullet + Rapide : Puzzle Storm, parties sur Lichess, 3 parties courtes.
  const m = blocsDuJour('2026-11-16', normaliserProfil({ temps: 45, sites: ['lichess'], cadences: ['bullet', 'rapide'] }));
  assert.deepEqual(m.blocs.map((b) => b.id), ['tactique', 'vitesse', 'theorie', 'rapide', 'analyse', 'blitz']);
  assert.match(m.blocs[1].lien.url, /lichess\.org\/storm/);
  assert.match(m.blocs.find((b) => b.id === 'rapide').lien.url, /lichess/);
  assert.equal(m.blocs.find((b) => b.id === 'blitz').titre, 'Bullet (récompense)');
  // Dimanche : théorie seule, quel que soit le profil.
  assert.deepEqual(blocsDuJour('2026-11-22', p20).blocs.map((b) => b.id), ['theorie']);
  // Valeurs inconnues ignorées.
  assert.deepEqual(normaliserProfil({ temps: 7, sites: ['x'], cadences: [] }), { temps: 45, sites: ['lichess'], cadences: ['blitz'] });
});
