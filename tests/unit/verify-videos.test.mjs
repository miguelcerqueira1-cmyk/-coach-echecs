import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoId, collectLinks, checkVideo, checkAll, report, OEMBED } from '../../scripts/verify-videos.mjs';
import { LIGNES } from '../../site/data/repertoire.js';

const reply = (status, json) => ({ status, ok: status >= 200 && status < 300, json: async () => json });

test('identifiant extrait des liens (avec ou sans horodatage)', () => {
  assert.equal(videoId('https://www.youtube.com/watch?v=-Sri7x0cwT8'), '-Sri7x0cwT8');
  assert.equal(videoId('https://www.youtube.com/watch?v=kRmwIRYnm8A&t=175s'), 'kRmwIRYnm8A');
  assert.equal(videoId('https://example.com/'), null);
});

test('liens du répertoire regroupés par vidéo', () => {
  const vids = collectLinks(LIGNES);
  assert.ok(vids.length >= 30);
  const advance = vids.find((v) => v.id === 'kRmwIRYnm8A');
  assert.deepEqual(advance.fiches.sort(), ['ck-avance-cc3', 'ck-avance-short', 'ck-avance-tal']);
  for (const v of vids) assert.match(v.id, /^[\w-]{11}$/);
});

test('oEmbed simulé : ok, mort, restreinte, changement, erreur réseau', async () => {
  const v = { id: 'abcdefghijk', titre: 'Exchange Variation of the Queen’s Gambit Declined', chaine: 'Hanging Pawns', fiches: ['gd-echange'] };
  const calls = [];
  const ok = await checkVideo(v, async (url) => { calls.push(url); return reply(200, { title: "Exchange Variation of the Queen's Gambit Declined", author_name: 'Hanging Pawns' }); });
  assert.equal(ok.etat, 'ok');
  assert.ok(calls[0].startsWith(`${OEMBED}?url=`));
  assert.equal(new URL(calls[0]).searchParams.get('url'), 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal((await checkVideo(v, async () => reply(404, null))).etat, 'mort');
  assert.equal((await checkVideo(v, async () => reply(401, null))).etat, 'restreinte');
  const changed = await checkVideo(v, async () => reply(200, { title: 'Something else entirely', author_name: 'Hanging Pawns' }));
  assert.equal(changed.etat, 'changement');
  assert.match(changed.detail, /titre/);
  const inconnue = await checkVideo({ ...v, chaine: null }, async () => reply(200, { title: "Exchange Variation of the Queen's Gambit Declined", author_name: 'Hanging Pawns' }));
  assert.equal(inconnue.etat, 'a-completer');
  assert.match(inconnue.detail, /chaîne à renseigner : « Hanging Pawns »/);
  assert.equal((await checkVideo(v, async () => { throw new Error('ECONNRESET'); })).etat, 'erreur');
  assert.equal((await checkVideo(v, async () => reply(503, null))).etat, 'erreur');
});

test('rapport : annotations GitHub « warning » pour les liens à revoir seulement', async () => {
  const vids = [
    { id: 'aaaaaaaaaaa', titre: 'A', chaine: 'C', fiches: ['gd-a'] },
    { id: 'bbbbbbbbbbb', titre: 'B', chaine: 'C', fiches: ['ck-b', 'ck-c'] },
  ];
  const results = await checkAll(vids, { pauseMs: 0, fetchImpl: async (url) => (url.includes('aaaaaaaaaaa') ? reply(200, { title: 'A', author_name: 'C' }) : reply(404, null)) });
  const out = report(results, { github: true });
  // Une seule annotation multiligne (GitHub n'en affiche que 10 par étape).
  assert.match(out, /^::warning title=Vidéos à vérifier \(1\)::mort : https:\/\/www\.youtube\.com\/watch\?v=bbbbbbbbbbb \(ck-b, ck-c\)/m);
  assert.equal(out.split('\n').filter((l) => l.startsWith('::warning')).length, 1);
  assert.doesNotMatch(out, /aaaaaaaaaaa/);
  assert.match(out, /2 contrôlées — 1 ok, 1 mortes/);
});
