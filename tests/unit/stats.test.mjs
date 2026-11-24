import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doitCompter, demarrerStats } from '../../site/js/stats.js';

const T = '8cf6de5a2d1147faa7c7fab3c21876fb';
const H = 'miguelcerqueira1-cmyk.github.io';

test('statistiques : seulement sur le site publié, hors tests automatiques et sans « ne pas suivre »', () => {
  assert.equal(doitCompter({ token: T, host: H, hostname: H }), true);
  assert.equal(doitCompter({ token: T, host: H, hostname: 'localhost' }), false);
  assert.equal(doitCompter({ token: T, host: H, hostname: H, webdriver: true }), false);
  assert.equal(doitCompter({ token: T, host: H, hostname: H, dnt: true }), false);
  assert.equal(doitCompter({ token: '', host: H, hostname: H }), false);
  assert.equal(doitCompter({ token: 'pas-un-jeton', host: H, hostname: H }), false);
  assert.equal(doitCompter({ token: T, host: '', hostname: H }), false);
});

test('statistiques : script Cloudflare ajouté avec le jeton, rien sinon', () => {
  const ajoutes = [];
  const el = { setAttribute(k, v) { this[k] = v; } };
  const env = {
    location: { hostname: H }, navigator: {},
    document: { createElement: () => el, head: { appendChild: (x) => ajoutes.push(x) } },
  };
  assert.equal(demarrerStats({ analyticsToken: T, analyticsHost: H }, env), true);
  assert.equal(ajoutes.length, 1);
  assert.equal(ajoutes[0].src, 'https://static.cloudflareinsights.com/beacon.min.js');
  assert.deepEqual(JSON.parse(ajoutes[0]['data-cf-beacon']), { token: T });
  assert.equal(demarrerStats({ analyticsToken: T, analyticsHost: H }, { ...env, navigator: { webdriver: true } }), false);
  assert.equal(ajoutes.length, 1);
});
