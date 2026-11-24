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

import { pageDe, suivrePages, resumeVues } from '../../site/js/stats.js';

test('pages vues : page tirée de l’ancre, envoi seulement sur le site publié et à chaque changement', () => {
  assert.equal(pageDe('#/repertoire'), 'repertoire');
  assert.equal(pageDe('#/entrainement/cours'), 'entrainement');
  assert.equal(pageDe(''), 'moteur');
  assert.equal(pageDe('#/inconnue'), 'moteur');
  const envois = [];
  let ecoute;
  const env = {
    location: { hostname: H, hash: '#/repertoire' },
    navigator: { sendBeacon: (url, corps) => { envois.push([url, corps]); return true; } },
    addEventListener: (t, f) => { ecoute = f; },
  };
  const cfg = { apiUrl: 'https://api.exemple.dev/', analyticsHost: H };
  assert.equal(suivrePages(cfg, env), true);
  env.location.hash = '#/repertoire'; ecoute();
  env.location.hash = '#/parties'; ecoute();
  assert.deepEqual(envois.map(([u, c]) => [u, JSON.parse(c).p]), [['https://api.exemple.dev/v1/vue', 'repertoire'], ['https://api.exemple.dev/v1/vue', 'parties']]);
  assert.equal(suivrePages(cfg, { ...env, location: { hostname: 'localhost', hash: '' } }), false);
  assert.equal(suivrePages(cfg, { ...env, navigator: { webdriver: true } }), false);
  assert.equal(suivrePages({ ...cfg, apiUrl: '' }, env), false);
});

test('pages vues : résumé des totaux', () => {
  const r = resumeVues([{ jour: '2026-11-24', pages: { repertoire: 3, moteur: 1 } }, { jour: '2026-11-23', pages: { repertoire: 2 } }]);
  assert.equal(r.total, 6);
  assert.deepEqual(r.pages[0], ['repertoire', 5]);
  assert.deepEqual(r.parJour, [{ jour: '2026-11-24', n: 4 }, { jour: '2026-11-23', n: 2 }]);
});
