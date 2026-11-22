import test from 'node:test';
import assert from 'node:assert/strict';
import { defiPkce, urlAutorisation, terminerConnexion, adresseRetour, CLIENT_ID } from '../../site/js/lichess-auth.js';

const memoire = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const KEY = 'coach-echecs:lichess-oauth';

test('PKCE : défi S256 conforme à la RFC 7636', async () => {
  assert.equal(await defiPkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('adresse d’autorisation Lichess', () => {
  const u = new URL(urlAutorisation({ challenge: 'abc', state: 'xyz', redirect: 'https://ex.org/app/' }));
  assert.equal(u.origin + u.pathname, 'https://lichess.org/oauth');
  assert.equal(u.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://ex.org/app/');
  assert.equal(adresseRetour({ origin: 'https://ex.org', pathname: '/app/' }), 'https://ex.org/app/');
});

test('retour de Lichess : jeton échangé, pseudo lu, état vérifié', async () => {
  const st = memoire({ [KEY]: JSON.stringify({ verifier: 'v', state: 's1', retour: '#/parties', redirect: 'https://ex.org/app/', at: Date.now() }) });
  const appels = [];
  const fetchImpl = async (url, init = {}) => {
    appels.push({ url, init });
    if (url.endsWith('/api/token')) return { ok: true, json: async () => ({ access_token: 'lio_abc' }) };
    return { ok: true, json: async () => ({ username: 'LeugiMC' }) };
  };
  const r = await terminerConnexion({ loc: { search: '?code=C0DE&state=s1' }, fetchImpl, storage: st });
  assert.deepEqual(r, { ok: true, token: 'lio_abc', username: 'LeugiMC', retour: '#/parties' });
  const body = new URLSearchParams(appels[0].init.body);
  assert.equal(body.get('code'), 'C0DE');
  assert.equal(body.get('code_verifier'), 'v');
  assert.equal(appels[1].init.headers.authorization, 'Bearer lio_abc');
  assert.equal(st.getItem(KEY), null); // connexion en cours effacée
});

test('retour de Lichess : rien, annulé, état faux', async () => {
  assert.equal(await terminerConnexion({ loc: { search: '' }, storage: memoire() }), null);
  const annule = await terminerConnexion({ loc: { search: '?error=access_denied' }, storage: memoire() });
  assert.equal(annule.ok, false);
  assert.match(annule.message, /annulée/);
  const st = memoire({ [KEY]: JSON.stringify({ verifier: 'v', state: 'bon', at: Date.now() }) });
  const faux = await terminerConnexion({ loc: { search: '?code=x&state=mauvais' }, storage: st, fetchImpl: async () => { throw new Error('ne doit pas être appelé'); } });
  assert.equal(faux.ok, false);
});
