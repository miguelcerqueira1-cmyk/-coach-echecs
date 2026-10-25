// Formule Gratuit / Pro (site/js/pro.js) : marque, verrous, fenêtre BlitzRefute Pro.
// Les autres fichiers de tests tournent en formule Pro.
import { test, expect } from '@playwright/test';

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
  await dlg.locator('summary').click();
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
