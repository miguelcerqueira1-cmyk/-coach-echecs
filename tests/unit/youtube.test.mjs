import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoDuration, queryFor, searchLink, YouTubeClient } from '../../site/js/youtube.js';

const entry = { nom: 'Variante Orthodoxe (Gambit Dame refusé)', ecoNom: "Queen's Gambit Declined: Orthodox Defense", video: { recherche: 'QGD orthodox' } };

test('isoDuration', () => {
  assert.equal(isoDuration('PT12M5S'), '12:05');
  assert.equal(isoDuration('PT1H2M3S'), '1:02:03');
  assert.equal(isoDuration(''), '');
});

test('requêtes par langue', () => {
  assert.equal(queryFor(entry, 'fr'), 'Variante Orthodoxe échecs');
  assert.equal(queryFor(entry, 'es'), "Queen's Gambit Declined: Orthodox Defense ajedrez");
  assert.match(searchLink(entry, 'ru'), /^https:\/\/www\.youtube\.com\/results\?search_query=/);
});

test('erreurs API traduites ; sans clé, erreur explicite', async () => {
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
  const quota = new YouTubeClient({ getKey: () => 'k', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }) }) });
  await assert.rejects(quota.search(entry, 'de'), /Quota/);
  const ref = new YouTubeClient({ getKey: () => 'k', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'forbidden' }] } }) }) });
  await assert.rejects(ref.search(entry, 'it'), /non autorisée/);
  const none = new YouTubeClient({ getKey: () => '' });
  assert.equal(none.hasKey(), false);
  await assert.rejects(none.search(entry, 'pt'), /non configurée/);
});
