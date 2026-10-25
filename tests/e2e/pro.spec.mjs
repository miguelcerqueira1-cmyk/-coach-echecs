// Formule Gratuit / Pro (site/js/pro.js) : marque, verrous, fenêtre BlitzRefute Pro.
// Les autres fichiers de tests tournent en formule Pro.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { splitRepertoire } from '../../scripts/pro-content.mjs';

async function setup(page, { pro = false } = {}) {
  await page.route(/https:\/\/(lichess\.org|raw\.githubusercontent\.com)\//, (r) => r.abort());
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('coach-echecs:reglages:v1', JSON.stringify({ budget: 'rapide', autoExplain: false }));
      if (p) localStorage.setItem('coach-echecs:pro', '{"pro":true}');
      sessionStorage.setItem('e2e-init', '1');
    }
  }, pro);
}

test('formule gratuite : marque, 3 variantes ouvertes, contenu Pro verrouillé, fenêtre Pro', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await expect(page.locator('h1')).toHaveText('BlitzRefute');
  await expect(page.locator('#plan-pill')).toHaveText('Gratuit');
  await expect(page.locator('#btn-pro')).toBeVisible();
  // Répertoire : la ligne principale est ouverte, une autre fiche est verrouillée.
  await page.goto('./#/repertoire');
  await expect(page.locator('tr[data-id="gd-orthodoxe"]:not([data-locked]) [data-test="gd-orthodoxe"]')).toBeVisible();
  const locked = page.locator('tr[data-id="gd-echange"][data-locked]');
  await expect(locked).toContainText('🔒 Pro');
  await expect(locked.locator('[data-test]')).toHaveCount(0);
  await locked.locator('[data-unlock]').click();
  const dlg = page.locator('#dlg-pro');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('fait partie de BlitzRefute Pro');
  await expect(dlg).toContainText('Réflexes anti-trash');
  await expect(dlg.locator('[data-pro-soon]')).toContainText('Le paiement en ligne ouvre bientôt');
  // Code d'accès inconnu : refusé, rien n'est débloqué.
  await dlg.locator('summary', { hasText: 'J’ai un code d’accès' }).click();
  await dlg.locator('[data-pro-code]').fill('MAUVAIS');
  await dlg.locator('[data-pro-form] button').click();
  await expect(dlg.locator('[data-pro-msg]')).toHaveText('Code non reconnu.');
  await dlg.locator('[data-pro-close]').click();
  expect(await page.evaluate(() => localStorage.getItem('coach-echecs:pro'))).toBeNull();
  // Entraînement : module anti-trash réservé, leçon de base ouverte, leçon Pro verrouillée.
  await page.goto('./#/entrainement');
  await page.click('[data-trash]');
  await expect(dlg).toContainText('Le module Réflexes anti-trash');
  await dlg.locator('[data-pro-close]').click();
  await page.click('[data-course="gd"]');
  await expect(page.locator('[data-lesson="gd-echange"]')).toHaveText('🔒 Pro');
  await page.click('[data-lesson="gd-orthodoxe"]');
  await expect(page.locator('[data-panel]')).toContainText('Nom officiel');
});

test('formule Pro : badge Pro, bouton d’achat masqué, toutes les fiches ouvertes', async ({ page }) => {
  await setup(page, { pro: true });
  await page.goto('./#/repertoire');
  await expect(page.locator('#plan-pill')).toHaveText('Pro');
  await expect(page.locator('#btn-pro')).toBeHidden();
  await expect(page.locator('tr[data-locked]')).toHaveCount(0);
  await expect(page.locator('[data-test="gd-echange"]')).toBeVisible();
});

// Site publié en mode réel : aperçu des fiches Pro seulement, fiches complètes servies par le
// Worker contre une licence (scripts/pro-content.mjs, worker/src/index.js) — Worker simulé ici.
test('licence : clé refusée puis acceptée → fiches Pro téléchargées et déverrouillées', async ({ page }) => {
  const full = JSON.parse(readFileSync(new URL('../../site/data/repertoire.json', import.meta.url), 'utf8'));
  const { publicData, proData } = splitRepertoire(full);
  const API = 'https://api.blitzrefute.test';
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type' };
  const calls = [];
  await setup(page);
  await page.route('**/data/repertoire.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(publicData) }));
  await page.route('**/config.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ apiUrl: API, paymentUrl: '' }) }));
  const worker = async (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    calls.push({ url: req.url(), auth: req.headers().authorization || null });
    if (req.url().endsWith('/v1/licence')) {
      const ok = JSON.parse(req.postData()).key === 'CLE-VALIDE-TEST';
      return r.fulfill({ status: ok ? 200 : 403, headers: CORS, json: ok ? { ok: true, token: 'jeton.signe', exp: Date.now() + 30 * 86400000 } : { error: 'Clé de licence invalide.' } });
    }
    if (req.url().endsWith('/v1/pro-content')) {
      return req.headers().authorization === 'Licence jeton.signe'
        ? r.fulfill({ headers: CORS, json: proData }) : r.fulfill({ status: 401, headers: CORS, json: { error: 'Licence invalide.' } });
    }
    return r.fulfill({ status: 404, headers: CORS, json: {} });
  };
  await page.route(`${API}/**`, worker);
  await page.goto('./#/repertoire');
  const row = page.locator('tr[data-id="gd-echange"]');
  await expect(row).toHaveAttribute('data-locked', '');
  await expect(page.locator('tr[data-id="gd-orthodoxe"] [data-test="gd-orthodoxe"]')).toBeVisible();
  await row.locator('[data-unlock]').click();
  const dlg = page.locator('#dlg-pro');
  await dlg.locator('[data-licence-key]').fill('MAUVAISE');
  await dlg.locator('[data-licence-form] button').click();
  await expect(dlg.locator('[data-licence-msg]')).toHaveText('Clé de licence invalide.');
  expect(await page.evaluate(() => localStorage.getItem('coach-echecs:licence'))).toBeNull();
  await dlg.locator('[data-licence-key]').fill('CLE-VALIDE-TEST');
  await dlg.locator('[data-licence-form] button').click();
  await expect(dlg.locator('[data-licence-msg]')).toContainText('Licence activée');
  // Rechargement automatique : fiches Pro demandées avec le jeton, puis déverrouillées.
  await expect(page.locator('#plan-pill')).toHaveText('Pro', { timeout: 15000 });
  await expect(page.locator('tr[data-id="gd-echange"] [data-test="gd-echange"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('tr[data-locked]')).toHaveCount(0);
  expect(calls.some((c) => c.url.endsWith('/v1/pro-content') && c.auth === 'Licence jeton.signe')).toBe(true);
  // Seul le jeton est gardé (jamais la clé) ; il n'est pas exporté par « Mes données ».
  const stored = await page.evaluate(() => Object.entries(localStorage).map(([k, v]) => `${k}=${v}`).join('\n'));
  expect(stored).not.toContain('CLE-VALIDE-TEST');
  const dump = await page.evaluate(async () => (await import('./js/transfer.js')).exportData());
  expect(JSON.stringify(dump)).not.toContain('jeton.signe');
  // Serveur injoignable : copie locale des fiches Pro.
  await page.unroute(`${API}/**`, worker);
  await page.route(`${API}/**`, (r) => r.abort());
  await page.reload();
  await expect(page.locator('tr[data-id="gd-echange"] [data-test="gd-echange"]')).toBeVisible({ timeout: 15000 });
});
