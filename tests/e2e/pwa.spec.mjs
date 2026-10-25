// Application installable et hors connexion (service worker). Le service worker est bloqué
// pour tous les autres tests (playwright.config.mjs : serviceWorkers 'block'), afin que leurs
// interceptions réseau (page.route) voient toutes les requêtes ; il est autorisé ici seulement.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

const FAST = { budget: 'rapide', autoExplain: false, level: 'intermediaire', showOpponentArrow: true, apiUrl: '' };

async function setup(page) {
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('coach-echecs:pro', '{"pro":true}'); // tests fonctionnels en formule Pro (pro.spec.mjs : formule gratuite)
      localStorage.setItem('coach-echecs:reglages:v1', JSON.stringify(s));
      localStorage.setItem('coach-echecs:entrainement', JSON.stringify({ rep: 'gd', source: 'fiches', length: 5 }));
      sessionStorage.setItem('e2e-init', '1');
    }
  }, FAST);
}

// Service worker actif (pré-cache terminé) et contrôlant la page.
const swReady = (page) => page.waitForFunction(async () => {
  const reg = await navigator.serviceWorker.ready;
  return !!(reg.active && navigator.serviceWorker.controller);
}, null, { timeout: 60000 });

const waitAdvice = (page) => page.waitForFunction(() => {
  const s = window.__coach?.state;
  return s && s.analysis.status === 'ready' && s.analysis.advice && s.game.isCurrent(s.analysis.advice.token);
}, null, { timeout: 120000 });

test('manifeste : nom, portée relative, icônes servies', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').evaluate((l) => l.href);
  const res = await request.get(href);
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.name).toBe('BlitzRefute');
  expect(m.display).toBe('standalone');
  expect(m.start_url.startsWith('./')).toBe(true);
  expect(m.scope).toBe('./');
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const i of m.icons) {
    const r = await request.get(new URL(i.src, href).href);
    expect(r.ok(), i.src).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  const apple = await page.locator('link[rel="apple-touch-icon"]').evaluate((l) => l.href);
  expect((await request.get(apple)).ok()).toBe(true);
  await page.click('#btn-settings');
  await expect(page.locator('#pwa-install')).toContainText('hors connexion');
});

test('hors connexion : Moteur (Stockfish), Répertoire et Entraînement après une visite en ligne', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  await page.goto('./');
  await expect(page.locator('#engine-pill')).toHaveText('Moteur prêt', { timeout: 60000 });
  await swReady(page);
  const names = await page.evaluate(() => caches.keys());
  expect(names.some((n) => n.startsWith('coach-echecs-app-'))).toBe(true);
  expect(names.some((n) => n.startsWith('coach-echecs-moteur-'))).toBe(true);
  // Le WASM (7 Mo) reste dans le seul cache du moteur, jamais dupliqué par le service worker.
  const wasmInShell = await page.evaluate(async () => {
    for (const n of await caches.keys()) {
      if (!n.startsWith('coach-echecs-app-')) continue;
      const keys = await (await caches.open(n)).keys();
      if (keys.some((k) => k.url.includes('.wasm'))) return true;
    }
    return false;
  });
  expect(wasmInShell).toBe(false);

  // Rechargement en ligne sous le contrôle du service worker : le moteur repart de son propre
  // cache, sans retélécharger le WASM (ni par engine.js, ni par stockfish.js dans le Worker).
  const wasm = [];
  context.on('request', (r) => { if (r.url().includes('.wasm')) wasm.push(r.url()); });
  await page.reload();
  await expect(page.locator('#engine-pill')).toHaveText('Moteur prêt', { timeout: 60000 });
  expect(wasm).toEqual([]);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('BlitzRefute');
  await expect(page.locator('#engine-pill')).toHaveText('Moteur prêt', { timeout: 60000 });
  await waitAdvice(page);
  await expect(page.locator('#advice')).toContainText('Coup conseillé par le moteur');
  await expect(page.locator('.board-arrows line.arrow-best')).toHaveCount(1);

  await page.goto('./#/repertoire');
  await expect(page.locator('#page-repertoire')).toBeVisible();
  await expect(page.locator('.rep-table tbody tr[data-id]').first()).toBeVisible();
  expect(await page.locator('.rep-table tbody tr[data-id]').count()).toBeGreaterThan(10);

  await page.goto('./#/entrainement');
  await page.click('#page-entrainement [data-lines]');
  await expect(page.locator('#page-entrainement [data-status]')).toContainText('À vous', { timeout: 15000 });

  await context.setOffline(false);
  expect(errors).toEqual([]);
});

// Publication simulée en réécrivant dist/sw.js (même code, autre identifiant de build) :
// les interceptions de Playwright ne voient pas la requête de mise à jour du service worker.
// Seulement sur le site servi localement.
test('nouvelle version : bandeau « Recharger », mise à jour appliquée', async ({ page }) => {
  test.skip(!!process.env.BASE_URL, 'réécrit dist/sw.js : site local seulement');
  const file = fileURLToPath(new URL('../../dist/sw.js', import.meta.url));
  const original = readFileSync(file, 'utf8');
  try {
    await setup(page);
    await page.goto('./');
    await swReady(page);
    const before = await page.evaluate(() => caches.keys());
    await expect(page.locator('.pwa-update')).toHaveCount(0);
    writeFileSync(file, original.replace(/const BUILD = "([^"]+)"/, 'const BUILD = "$1-suivante"'));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    const banner = page.locator('.pwa-update');
    await expect(banner).toContainText('Nouvelle version disponible');
    await Promise.all([page.waitForEvent('load'), banner.getByRole('button', { name: 'Recharger' }).click()]);
    await swReady(page);
    await expect(page.locator('.pwa-update')).toHaveCount(0);
    // L'ancien cache d'application est supprimé ; celui du moteur (WASM) est conservé.
    await expect.poll(async () => (await page.evaluate(() => caches.keys())).filter((n) => n.startsWith('coach-echecs-app-')))
      .toEqual([expect.stringMatching(/-suivante$/)]);
    const after = await page.evaluate(() => caches.keys());
    for (const n of before.filter((x) => x.startsWith('coach-echecs-moteur-'))) expect(after).toContain(n);
  } finally {
    writeFileSync(file, original);
  }
});
