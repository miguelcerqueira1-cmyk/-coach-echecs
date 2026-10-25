// Test d'intégration local : `wrangler dev` + faux serveur Anthropic.
// Aucun appel réel à l'API Anthropic n'est fait.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8799;
const MOCK = 4999;
const BASE = `http://127.0.0.1:${PORT}`;
const CODE = 'code-de-test-123';
const ORIGIN = 'http://localhost:4173';
const SECRET = 'secret-de-test-pour-les-licences-0123456789';
// Clés simulées de la License API Lemon Squeezy (boutique 111, produit 222).
const LEMON = {
  'CLE-VALIDE': { valid: true, license_key: { status: 'active' }, meta: { store_id: 111, product_id: 222 } },
  'CLE-NEUVE': { valid: true, license_key: { status: 'inactive' }, meta: { store_id: 111, product_id: 222 } },
  'CLE-AUTRE-PRODUIT': { valid: true, license_key: { status: 'active' }, meta: { store_id: 111, product_id: 999 } },
  'CLE-DESACTIVEE': { valid: false, error: 'This license key is disabled.', license_key: { status: 'disabled' }, meta: { store_id: 111, product_id: 222 } },
};
const received = [];
let wrangler;
let mock;

const payload = {
  version: 1, level: 'debutant', levelLabel: 'Débutant', playerColor: 'Blancs', sideToMove: 'Blancs', mode: 'tour_du_joueur',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', movesSan: [],
  engine: { bestMove: { san: 'e4' }, principalVariationSan: ['e4', 'c5'] },
};

before(async () => {
  mock = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url.startsWith('/v1/licenses/validate')) {
        const key = new URLSearchParams(body).get('license_key');
        received.push({ url: req.url, headers: req.headers, lemon: true, key });
        const r = LEMON[key];
        res.writeHead(r ? 200 : 404, { 'content-type': 'application/json' });
        res.end(JSON.stringify(r || { valid: false, error: 'license_key not found.', license_key: null, meta: null }));
        return;
      }
      if (req.url.startsWith('/lichess')) {
        received.push({ url: req.url, headers: req.headers, explorer: true });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ white: 3, draws: 1, black: 1, moves: [] }));
        return;
      }
      received.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
        content: [{ type: 'text', text: '**Pourquoi ce coup :** [e4] occupe le centre.' }],
        stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 },
      }));
    });
  }).listen(MOCK);
  writeFileSync(join(dir, '.dev.vars'), `ACCESS_CODE=${CODE}\nANTHROPIC_API_KEY=sk-test-factice\nLICHESS_TOKEN=lip_relais\nLICENCE_SECRET=${SECRET}\n`);
  // Contenu Pro généré au build (scripts/pro-content.mjs) ; absent en CI avant le build : jeu de test.
  if (!existsSync(join(dir, 'src/pro-content.json'))) writeFileSync(join(dir, 'src/pro-content.json'), JSON.stringify({ version: 'test', entries: [{ id: 'fiche-pro-test', plan: 'contenu Pro' }] }));
  wrangler = spawn(join(dir, 'node_modules/.bin/wrangler'), ['dev', '--show-interactive-dev-session=false', '--port', String(PORT), '--ip', '127.0.0.1',
    '--var', `ANTHROPIC_BASE_URL:http://127.0.0.1:${MOCK}`, '--var', `EXPLORER_URL:http://127.0.0.1:${MOCK}/lichess`, '--var', 'PER_MINUTE_LIMIT:3', '--var', `ALLOWED_ORIGINS:${ORIGIN}`,
    '--var', `LEMON_API_URL:http://127.0.0.1:${MOCK}`, '--var', 'LS_STORE_ID:111', '--var', 'LS_PRODUCT_ID:222',
    '--persist-to', join(dir, '.wrangler/test-state')], { cwd: dir, stdio: 'pipe', detached: true });
  let log = '';
  wrangler.stdout.on('data', (d) => { log += d; });
  wrangler.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + '/'); if (r.ok) return; } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('wrangler dev n’a pas démarré :\n' + log);
});

after(() => {
  // Arrête wrangler et son processus workerd (groupe de processus entier).
  try { process.kill(-wrangler.pid, 'SIGTERM'); } catch { /* déjà arrêté */ }
  wrangler?.stdout.destroy();
  wrangler?.stderr.destroy();
  mock?.close();
  rmSync(join(dir, '.dev.vars'), { force: true });
  rmSync(join(dir, '.wrangler/test-state'), { recursive: true, force: true });
});

const call = (path, { code = CODE, origin = ORIGIN, method = 'GET', body } = {}) => fetch(BASE + path, {
  method,
  headers: { ...(code ? { authorization: 'Bearer ' + code } : {}), ...(origin ? { origin } : {}), 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});

test('sans code : 401', async () => {
  const r = await call('/v1/status', { code: '' });
  assert.equal(r.status, 401);
});

test('origine non autorisée : 403 et pas d’en-tête CORS', async () => {
  const r = await call('/v1/status', { origin: 'https://exemple.invalid' });
  assert.equal(r.status, 403);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});

test('statut avec bon code', async () => {
  const r = await call('/v1/status');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  const d = await r.json();
  assert.equal(d.model, 'claude-opus-5-5');
  assert.equal(d.claudeConfigured, true);
});

test('relais Opening Explorer : jeton Lichess ajouté côté serveur, paramètres filtrés', async () => {
  const st = await (await call('/v1/status')).json();
  assert.equal(st.explorerProxy, true);
  const r = await call('/v1/explorer?fen=x&play=d2d4,d7d5&ratings=0,1000&speeds=blitz&evil=1');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).white, 3);
  const req = received.find((x) => x.explorer);
  assert.equal(req.headers.authorization, 'Bearer lip_relais');
  assert.match(req.url, /play=d2d4%2Cd7d5/);
  assert.doesNotMatch(req.url, /evil/);
  assert.equal((await call('/v1/explorer?fen=x', { code: 'faux' })).status, 401);
});

test('données invalides : 400 sans consommer de quota', async () => {
  const r = await call('/v1/explain', { method: 'POST', body: { fen: 'x' } });
  assert.equal(r.status, 400);
});

test('explication : requête Claude correcte, clé côté serveur', async () => {
  const r = await call('/v1/explain', { method: 'POST', body: payload });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.match(d.text, /\[e4\]/);
  const req = received.at(-1);
  // La clé n'est connue que du Worker (le SDK l'envoie en x-api-key ou Authorization).
  assert.ok(req.headers['x-api-key'] === 'sk-test-factice' || req.headers.authorization === 'Bearer sk-test-factice');
  assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.equal(req.body.output_config.effort, 'low');
  assert.match(req.body.messages[0].content, /"bestMove"/);
});

test('limite par minute : 429 au-delà de 3 appels', async () => {
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await call('/v1/explain', { method: 'POST', body: payload })).status);
  assert.deepEqual(codes, [200, 200, 429]); // 1 appel déjà fait dans le test précédent
});

test('verrouillage après 10 échecs d’authentification', async () => {
  // 2 échecs déjà comptés (« sans code », relais avec mauvais code) + 8 ici = 10 → verrouillage.
  for (let i = 0; i < 8; i++) assert.equal((await call('/v1/status', { code: 'mauvais-' + i })).status, 401);
  const r = await call('/v1/status');
  assert.equal(r.status, 429);
});

// ---------- Licences BlitzRefute Pro ----------

const licence = (key, { origin = ORIGIN } = {}) => fetch(BASE + '/v1/licence', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify({ key }),
});
const proContent = (token) => fetch(BASE + '/v1/pro-content', { headers: { origin: ORIGIN, ...(token != null ? { authorization: 'Licence ' + token } : {}) } });
const b64 = (x) => Buffer.from(x).toString('base64url');
const forge = (payload, secret = SECRET) => { const body = b64(JSON.stringify(payload)); return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`; };

test('licence : clé valide (Lemon Squeezy) → jeton 30 j sans la clé → contenu Pro', async () => {
  const r = await licence('CLE-VALIDE');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.ok(d.exp - Date.now() > 29 * 86400000 && d.exp - Date.now() <= 30 * 86400000);
  const payloadTxt = Buffer.from(d.token.split('.')[0], 'base64url').toString();
  assert.doesNotMatch(payloadTxt + d.token, /CLE-VALIDE/, 'la clé n’apparaît pas dans le jeton');
  const req = received.filter((x) => x.lemon).at(-1);
  assert.equal(req.key, 'CLE-VALIDE');
  const c = await proContent(d.token);
  assert.equal(c.status, 200);
  const content = await c.json();
  assert.ok(content.entries.length >= 1);
  assert.ok(content.entries[0].id);
  // Clé neuve (jamais activée, statut « inactive ») : acceptée.
  assert.equal((await licence('CLE-NEUVE')).status, 200);
});

test('licence : sans jeton, jeton falsifié ou expiré → 401', async () => {
  assert.equal((await proContent(null)).status, 401);
  const { token } = await (await licence('CLE-VALIDE')).json();
  const [body, sig] = token.split('.');
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  const tampered = `${b64(JSON.stringify({ ...p, exp: p.exp + 365 * 86400000 }))}.${sig}`;
  const r1 = await proContent(tampered);
  assert.equal(r1.status, 401);
  assert.match((await r1.json()).error, /Licence invalide/);
  assert.equal((await proContent(forge({ v: 1, h: 'x', exp: Date.now() + 86400000 }, 'autre-secret'))).status, 401);
  const r2 = await proContent(forge({ v: 1, h: 'x', exp: Date.now() - 1000 }));
  assert.equal(r2.status, 401);
  assert.match((await r2.json()).error, /expirée/);
  assert.equal((await proContent('n.importe.quoi')).status, 401);
});

test('licence : origine non autorisée → 403', async () => {
  assert.equal((await licence('CLE-VALIDE', { origin: 'https://exemple.invalid' })).status, 403);
});

test('licence : autre produit, clé désactivée, clé inconnue → 403 avec message clair', async () => {
  const msg = async (key) => { const r = await licence(key); return [r.status, (await r.json()).error]; };
  assert.deepEqual(await msg('CLE-AUTRE-PRODUIT'), [403, 'Cette clé ne correspond pas à BlitzRefute Pro.']);
  assert.deepEqual(await msg('CLE-DESACTIVEE'), [403, 'Cette clé de licence est désactivée ou expirée.']);
  assert.deepEqual(await msg('CLE-INCONNUE'), [403, 'Clé de licence invalide.']);
  assert.equal((await licence('')).status, 400);
});

test('licence : 10 clés refusées par IP → 429, même avec une bonne clé', async () => {
  // 3 refus déjà comptés au test précédent + 7 ici = 10.
  for (let i = 0; i < 7; i++) assert.equal((await licence('FAUSSE-' + i)).status, 403);
  const r = await licence('CLE-VALIDE');
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /Trop d’essais/);
});
