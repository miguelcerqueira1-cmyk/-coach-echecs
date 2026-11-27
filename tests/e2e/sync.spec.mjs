// Synchronisation entre appareils : le serveur (Worker /v1/sync) est simulé en mémoire. Vérifie
// l'activation, le chiffrement (rien de lisible ne part), la récupération sur un 2e appareil et
// l'envoi automatique quand l'appli passe en arrière-plan.
import { test, expect } from '@playwright/test';

const API = 'https://sync.test';

function serveur() {
  const store = new Map();
  return {
    store,
    async route(r) {
      const req = r.request();
      const id = new URL(req.url()).pathname.split('/').pop();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type' };
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      if (req.method() === 'GET') {
        const v = store.get(id);
        return r.fulfill({ status: v ? 200 : 404, headers: cors, contentType: 'application/json', body: JSON.stringify(v || { error: 'Aucune donnée' }) });
      }
      const body = JSON.parse(req.postData());
      const cur = store.get(id);
      if ((cur?.version || 0) !== body.version) return r.fulfill({ status: 409, headers: cors, contentType: 'application/json', body: JSON.stringify({ version: cur?.version || 0 }) });
      const v = { version: (cur?.version || 0) + 1, updatedAt: new Date().toISOString(), data: body.data };
      store.set(id, v);
      return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ version: v.version }) });
    },
  };
}

async function appareil(browser, srv, init = {}) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await page.route(/https:\/\/(lichess\.org|explorer\.lichess\.org|raw\.githubusercontent\.com)\//, (r) => r.abort());
  await page.route(`${API}/**`, (r) => srv.route(r));
  await page.addInitScript(([api, extra]) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('coach-echecs:reglages:v1', JSON.stringify({ budget: 'rapide', autoExplain: false, apiUrl: api }));
      localStorage.setItem('coach-echecs:mon-repertoire', JSON.stringify({ ids: ['gd', 'ck'] }));
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
      sessionStorage.setItem('e2e-init', '1');
    }
  }, [API, init]);
  return { ctx, page };
}

test('activer sur un appareil, récupérer sur un autre, envoi automatique, données chiffrées', async ({ browser }) => {
  const srv = serveur();
  const A = await appareil(browser, srv, { 'coach-echecs:progression-v1': JSON.stringify({ lignes: { 'gd-orthodoxe': { ok: 3, ko: 0 } }, drills: {}, jours: ['2026-11-23'], sorties: [], cours: {} }), 'coach-echecs:jeton-lichess': 'lip_secret' });
  await A.page.goto('./#/repertoire');
  await A.page.click('#btn-settings');
  await expect(A.page.locator('#sync-section')).toContainText('chiffrées');
  await A.page.click('#sync-activer');
  await expect(A.page.locator('#sync-msg')).toContainText('Synchronisation activée');
  const code = (await A.page.locator('#sync-msg').textContent()).match(/([0-9A-Z]{4}-){7}[0-9A-Z]{4}/)[0];
  const [stocke] = [...srv.store.values()];
  expect(stocke.version).toBe(1);
  expect(stocke.data).toMatch(/^v1\./);
  expect(stocke.data).not.toContain('gd-orthodoxe');
  expect(stocke.data).not.toContain('lip_secret');

  const B = await appareil(browser, srv);
  await B.page.goto('./#/repertoire');
  await B.page.click('#btn-settings');
  await B.page.fill('#sync-code-saisi', code.toLowerCase().replace(/-/g, ' '));
  B.page.once('dialog', (d) => d.accept());
  await B.page.click('#sync-utiliser');
  await expect.poll(() => B.page.evaluate(() => localStorage.getItem('coach-echecs:progression-v1')).catch(() => null), { timeout: 15000 }).toContain('gd-orthodoxe');
  expect(await B.page.evaluate(() => localStorage.getItem('coach-echecs:jeton-lichess'))).toBeNull();

  // B change quelque chose puis passe en arrière-plan : envoi automatique (version 2).
  await B.page.waitForLoadState('load');
  await B.page.evaluate(() => {
    localStorage.setItem('coach-echecs:finales-v1', JSON.stringify({ escalier: { ok: true } }));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => [...srv.store.values()][0].version, { timeout: 10000 }).toBe(2);

  // A rouvre l'appli : elle récupère la nouveauté automatiquement.
  await A.page.reload();
  // L'appli se recharge en appliquant les données reçues : une lecture pendant ce rechargement est
  // simplement refaite.
  const lire = (p, k) => p.evaluate((x) => localStorage.getItem(x), k).catch(() => null);
  await expect.poll(() => lire(A.page, 'coach-echecs:finales-v1'), { timeout: 15000 }).toContain('escalier');
  await A.page.waitForLoadState('load');
  await expect(A.page.locator('.sync-bandeau')).toContainText('Données mises à jour');
  await A.ctx.close();
  await B.ctx.close();
});
