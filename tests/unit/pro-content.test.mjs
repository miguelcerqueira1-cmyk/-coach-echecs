import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitRepertoire } from '../../scripts/pro-content.mjs';
import { mergeRepertoire } from '../../site/js/repertoire-data.js';
import { FREE_FICHES } from '../../site/js/pro.js';

const data = JSON.parse(readFileSync(new URL('../../site/data/repertoire.json', import.meta.url), 'utf8'));

test('site public : fiches gratuites complètes, fiches Pro réduites à un aperçu sans contenu', () => {
  const { publicData, proData } = splitRepertoire(data);
  assert.equal(publicData.entries.length, data.entries.length, 'ordre et nombre conservés');
  assert.deepEqual(publicData.entries.map((e) => e.id), data.entries.map((e) => e.id));
  for (const e of publicData.entries) {
    if (FREE_FICHES.includes(e.id)) { assert.ok(e.uci && e.plan && !e.pro); continue; }
    assert.equal(e.pro, true);
    assert.deepEqual(Object.keys(e).sort(), ['badge', 'eco', 'ecoNom', 'famille', 'id', 'nom', 'pro', 'rep', 'san']);
    assert.ok(e.san.length <= 4);
  }
  const txt = JSON.stringify(publicData.entries.filter((e) => e.pro));
  for (const k of ['plan', 'punition', 'piege', 'video', 'uci', 'verification']) assert.doesNotMatch(txt, new RegExp(`"${k}":`));
  assert.equal(proData.entries.length, data.entries.length - FREE_FICHES.length);
  assert.ok(proData.entries.every((e) => e.uci && !FREE_FICHES.includes(e.id)));
});

test('fusion : aperçus remplacés par les fiches Pro reçues, ordre d’origine, aperçus restants listés', () => {
  const { publicData, proData } = splitRepertoire(data);
  const sans = mergeRepertoire(publicData);
  assert.equal(sans.entries.length, FREE_FICHES.length);
  assert.equal(sans.all.length, data.entries.length);
  assert.equal(sans.previews.length, data.entries.length - FREE_FICHES.length);
  const avec = mergeRepertoire(publicData, proData.entries);
  assert.deepEqual(avec.entries.map((e) => e.id), data.entries.map((e) => e.id));
  assert.equal(avec.previews.length, 0);
  // Une fiche reçue incomplète (sans coups) n'est pas prise pour une fiche complète.
  const partiel = mergeRepertoire(publicData, [{ id: proData.entries[0].id, nom: 'x' }]);
  assert.equal(partiel.entries.length, FREE_FICHES.length);
});
