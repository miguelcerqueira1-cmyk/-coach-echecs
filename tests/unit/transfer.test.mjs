import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportData, importData, describe, SECRETS } from '../../site/js/transfer.js';

function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('export : données utiles sans les secrets ; import sur un autre appareil', () => {
  const a = mem({
    'coach-echecs:progression-v1': '{"jours":["2026-10-22"]}',
    'coach-echecs:reglages:v1': '{"theme":"neon"}',
    'coach-echecs:jeton-lichess': 'lip_secret',
    'coach-echecs:cle-youtube': 'AIza',
    'coach-echecs:youtube-v1': '{}',
    'autre-site': 'x',
  });
  const dump = exportData(a, new Date('2026-10-23T10:00:00Z'));
  assert.deepEqual(Object.keys(dump.data).sort(), ['coach-echecs:progression-v1', 'coach-echecs:reglages:v1']);
  for (const k of SECRETS) assert.equal(dump.data[k], undefined);
  assert.match(describe(dump), /progression/);
  const b = mem({ 'coach-echecs:jeton-lichess': 'lip_pc' });
  const forged = { ...dump, data: { ...dump.data, 'coach-echecs:jeton-lichess': 'pirate', 'ailleurs': 'x' } };
  assert.equal(importData(forged, b), 2);
  assert.equal(b.getItem('coach-echecs:jeton-lichess'), 'lip_pc'); // secret jamais écrasé par un fichier
  assert.equal(b.getItem('coach-echecs:reglages:v1'), '{"theme":"neon"}');
  assert.throws(() => importData({ hello: 1 }, b), /non reconnu/);
});
