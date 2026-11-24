// Guide d'installation (bandeau après la 1re visite, étapes par appareil) et rappels de sauvegarde.
import { test, expect, devices } from '@playwright/test';

const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const ilYa = (j) => new Date(Date.now() - j * 86400000).toISOString().slice(0, 10);

async function setup(page, installation, extra = {}) {
  await page.route(/https:\/\/(lichess\.org|explorer\.lichess\.org|raw\.githubusercontent\.com)\//, (r) => r.abort());
  await page.addInitScript(([inst, ex]) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('coach-echecs:reglages:v1', JSON.stringify({ budget: 'rapide', autoExplain: false }));
      localStorage.setItem('coach-echecs:mon-repertoire', JSON.stringify({ ids: ['gd', 'ck'] }));
      if (inst) localStorage.setItem('coach-echecs:installation-v1', JSON.stringify(inst));
      for (const [k, v] of Object.entries(ex)) localStorage.setItem(k, v);
      sessionStorage.setItem('e2e-init', '1');
    }
  }, [installation, extra]);
}

test('1re visite : pas de bandeau ; visite suivante : bandeau puis guide Android @mobile', async ({ browser }) => {
  // Téléphone Android explicite : sur le projet iPhone, le guide montrerait (à juste titre) les étapes iPhone.
  const ctx = await browser.newContext({ ...devices['Pixel 7'], baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await setup(page, null);
  await page.goto('./#/repertoire');
  await page.waitForTimeout(4500);
  await expect(page.locator('.inst-bandeau')).toHaveCount(0);
  const etat = await page.evaluate(() => JSON.parse(localStorage.getItem('coach-echecs:installation-v1')));
  expect(etat.jours).toHaveLength(1);

  await page.evaluate((j) => localStorage.setItem('coach-echecs:installation-v1', JSON.stringify({ jours: [j] })), hier);
  await page.reload();
  const bandeau = page.locator('.inst-bandeau');
  await expect(bandeau).toContainText('Installe BlitzRefute', { timeout: 8000 });
  await bandeau.getByRole('button', { name: 'Voir comment' }).click();
  const dlg = page.locator('#dlg-installer');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('h3').first()).toContainText('Android');
  await expect(dlg).toContainText('Installer l’application');
  const largeur = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(largeur).toBeLessThanOrEqual(0);
  // Sauvegarde depuis le guide : fichier téléchargé, date notée.
  const dl = page.waitForEvent('download');
  await dlg.getByRole('button', { name: /Sauvegarder maintenant/ }).click();
  expect((await dl).suggestedFilename()).toMatch(/^blitzrefute-donnees-\d{4}-\d{2}-\d{2}\.json$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('coach-echecs:installation-v1')).derniereSauvegarde)).toBeTruthy();
  await dlg.getByRole('button', { name: 'Fermer' }).click();
  await ctx.close();
});

test('iPhone Safari : étapes Partager → « Sur l’écran d’accueil » ; « Plus tard » refusé 14 jours @mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await setup(page, { jours: [hier] });
  await page.goto('./#/repertoire');
  const bandeau = page.locator('.inst-bandeau');
  await expect(bandeau).toBeVisible({ timeout: 8000 });
  await bandeau.getByRole('button', { name: 'Voir comment' }).click();
  const dlg = page.locator('#dlg-installer');
  await expect(dlg.locator('h3').first()).toContainText('Safari');
  await expect(dlg).toContainText('Sur l’écran d’accueil');
  await expect(dlg).toContainText('peut effacer les données');
  await dlg.getByRole('button', { name: 'Fermer' }).click();
  await page.reload();
  await expect(bandeau).toBeVisible({ timeout: 8000 });
  await bandeau.getByRole('button', { name: 'Plus tard' }).click();
  await expect(bandeau).toHaveCount(0);
  const etat = await page.evaluate(() => JSON.parse(localStorage.getItem('coach-echecs:installation-v1')));
  expect(etat.refusInstall).toBe(1);
  await page.reload();
  await page.waitForTimeout(4500);
  await expect(bandeau).toHaveCount(0);
  await ctx.close();
});

test('rappel de sauvegarde (ordinateur) et Réglages : guide, date de la dernière sauvegarde', async ({ page }) => {
  await setup(page, { jours: [ilYa(10), hier], premiereDonnee: ilYa(10) }, { 'coach-echecs:progression-v1': JSON.stringify({ lignes: {}, drills: {}, jours: [], sorties: [], cours: {} }) });
  await page.goto('./#/repertoire');
  const bandeau = page.locator('.inst-bandeau');
  await expect(bandeau).toContainText('Pense à sauvegarder', { timeout: 8000 });
  await expect(bandeau).toContainText('jamais sauvegardé');
  const dl = page.waitForEvent('download');
  await bandeau.getByRole('button', { name: 'Sauvegarder' }).click();
  await dl;
  await expect(bandeau).toHaveCount(0);
  await page.click('#btn-settings');
  await expect(page.locator('#data-last')).toContainText('aujourd’hui');
  await expect(page.locator('#pwa-install')).toContainText('hors connexion');
  await page.click('#pwa-guide-btn');
  await expect(page.locator('#dlg-installer')).toContainText('Ordinateur');
});

test('iPhone avec des données : le guide explique comment emporter ses données dans l’appli @mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  // Presse-papiers simulé (les permissions de presse-papiers n'existent pas sur WebKit).
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copie = t; }, readText: async () => window.__copie || '' } }); });
  await setup(page, { jours: [hier], premiereDonnee: hier }, { 'coach-echecs:progression-v1': JSON.stringify({ lignes: { 'gd-orthodoxe': { ok: 1, ko: 0 } }, drills: {}, jours: [], sorties: [], cours: {} }) });
  await page.goto('./#/repertoire');
  await page.click('#btn-settings');
  await page.click('#pwa-guide-btn');
  const dlg = page.locator('#dlg-installer');
  await expect(dlg.locator('.inst-alerte')).toContainText('emporte tes données');
  await expect(dlg.locator('.inst-alerte')).toContainText('Coller des données');
  await dlg.locator('[data-install-copier-donnees]').click();
  await expect(dlg.locator('[data-install-copie-donnees]')).toContainText('Copié');
  expect(await page.evaluate(() => window.__copie)).toContain('gd-orthodoxe');
  await ctx.close();
});

test('appli installée qui s’ouvre vide : proposition de récupérer les données du navigateur @mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await page.route(/https:\/\/(lichess\.org|explorer\.lichess\.org|raw\.githubusercontent\.com)\//, (r) => r.abort());
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  await page.goto('./');
  const bandeau = page.locator('.inst-bandeau');
  await expect(bandeau).toContainText('Tu utilisais BlitzRefute dans ton navigateur', { timeout: 8000 });
  await bandeau.getByRole('button', { name: 'Récupérer mes données' }).click();
  await expect(page.locator('#dlg-settings')).toBeVisible();
  await expect(page.locator('#data-paste-box')).toBeVisible();
  // Rien d'écrit par la proposition (la partie vide créée au démarrage ne compte pas comme
  // « utilisateur existant ») : la première visite reste une première visite.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('coach-echecs:') && k !== 'coach-echecs:partie:v1'))).toEqual([]);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForTimeout(3000);
  await expect(bandeau).toHaveCount(0);
  await ctx.close();
});
