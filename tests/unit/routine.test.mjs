import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jour, blocsDuJour, cocher, noter, historique, serie, THEMES } from '../../site/js/routine-core.js';

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
