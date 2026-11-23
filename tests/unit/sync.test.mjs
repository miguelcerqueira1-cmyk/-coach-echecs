import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nouveauCode, normaliser, valide, formater, identifiant, chiffrer, dechiffrer, empreinte, decision } from '../../site/js/sync-core.js';
import { exportData, SECRETS } from '../../site/js/transfer.js';

test('code de synchronisation : 32 caractères base32, saisie tolérante', () => {
  const c = nouveauCode();
  assert.match(c, /^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.ok(valide(c));
  assert.equal(normaliser(c.toLowerCase().replace(/-/g, ' ')), normaliser(c));
  assert.equal(normaliser('o0il'), '0011');
  assert.equal(formater('abcdefgh'), 'ABCD-EFGH');
  assert.ok(!valide('ABC'));
  assert.notEqual(nouveauCode(), c);
});

test('chiffrement : aller-retour, mauvais code refusé, identifiant stable non lié au contenu', async () => {
  const code = nouveauCode();
  const dump = { format: 'coach-echecs-donnees', version: 1, data: { 'coach-echecs:progression-v1': '{"jours":["2026-11-23"]}' } };
  const t = await chiffrer(dump, code);
  assert.match(t, /^v1\.[01]\./);
  assert.ok(!t.includes('progression'));
  assert.deepEqual(await dechiffrer(t, code), dump);
  await assert.rejects(() => dechiffrer(t, nouveauCode()), /incorrect/);
  const id = await identifiant(code);
  assert.match(id, /^[0-9a-f]{64}$/);
  assert.equal(id, await identifiant(code.toLowerCase()));
});

test('empreinte et décision au démarrage', async () => {
  const a = await empreinte({ exportedAt: '1', data: { b: '2', a: '1' } });
  assert.equal(a, await empreinte({ exportedAt: '2', data: { a: '1', b: '2' } }));
  assert.notEqual(a, await empreinte({ data: { a: '1', b: '3' } }));
  const local = { version: 3, empreinte: a };
  assert.equal(decision({ local, actuelle: a, distante: 3 }), 'rien');
  assert.equal(decision({ local, actuelle: 'x', distante: 3 }), 'envoyer');
  assert.equal(decision({ local, actuelle: a, distante: 4 }), 'recevoir');
  assert.equal(decision({ local, actuelle: 'x', distante: 4 }), 'conflit');
});

test('le code et l’état de synchronisation ne partent jamais dans « Mes données »', () => {
  assert.ok(SECRETS.includes('coach-echecs:sync-cle'));
  const m = new Map([['coach-echecs:sync-cle', 'X'], ['coach-echecs:sync-v1', '{}'], ['coach-echecs:routine-v1', '{}']]);
  const st = { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => m.get(k) ?? null };
  assert.deepEqual(Object.keys(exportData(st).data), ['coach-echecs:routine-v1']);
});
