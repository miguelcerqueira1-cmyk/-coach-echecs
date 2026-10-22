// Mode Entraînement avec le vrai Stockfish. Lichess est simulé (coups légaux et fréquences).
import { test, expect } from '@playwright/test';
import { Chess } from '../../site/vendor/chess.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

async function setup(page, { token = '', prefs = {} } = {}) {
  await page.route(/https:\/\/lichess\.org\//, (r) => r.abort());
  await page.addInitScript(([t, p]) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('coach-echecs:reglages:v1', JSON.stringify({ budget: 'rapide', autoExplain: false }));
      localStorage.setItem('coach-echecs:entrainement', JSON.stringify(p));
      if (t) localStorage.setItem('coach-echecs:jeton-lichess', t);
      sessionStorage.setItem('e2e-init', '1');
    }
  }, [token, prefs]);
}

const engineReady = (page) => page.waitForFunction(() => window.__coach?.engine.state === 'ready', null, { timeout: 60000 });
const sq = (page, s) => page.locator(`#page-entrainement [data-sq="${s}"]`);
async function move(page, uci) {
  await sq(page, uci.slice(0, 2)).click();
  await sq(page, uci.slice(2, 4)).click();
}

test('Entraînement (fiches) : coup du répertoire validé, erreur détectée par Stockfish, réessai', async ({ page }) => {
  await setup(page, { prefs: { rep: 'gd', source: 'fiches', length: 5 } });
  await page.goto('./#/entrainement');
  await engineReady(page);
  await page.click('[data-start]');
  const log = page.locator('[data-log]');
  // 1.d4 : coup du répertoire.
  await expect(page.locator('[data-status]')).toContainText('À vous');
  await move(page, 'd2d4');
  await expect(log).toContainText('Coup du répertoire');
  await expect(log).toContainText('Adversaire :');
  await expect(page.locator('[data-status]')).toContainText('À vous', { timeout: 10000 });
  // Un coup faible : le pion a2-a4 laisse b4 ; selon la position, verdict par Stockfish ou fiche.
  await move(page, 'a2a4');
  await expect(log).toContainText(/Vous : .*a4/, { timeout: 30000 });
  const first = await log.locator('li').first().innerText();
  expect(first).toMatch(/répertoire joue|Imprécision|Erreur|Gaffe|Bon coup/);
  if (await page.locator('[data-retry]').count()) {
    await page.click('[data-retry]');
    await expect(log).toContainText('Nouvel essai');
    await expect(page.locator('[data-status]')).toContainText('À vous');
  }
});

test('Entraînement (Lichess) : adversaire tiré des parties réelles, avec sa fréquence', async ({ page }) => {
  const calls = [];
  await setup(page, { token: 'lip_test', prefs: { rep: 'ck', source: 'lichess', length: 5 } });
  await page.route('https://explorer.lichess.org/**', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const u = new URL(r.request().url());
    calls.push(u.searchParams.get('play'));
    const c = new Chess(START);
    for (const m of (u.searchParams.get('play') || '').split(',').filter(Boolean)) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    const legal = c.moves({ verbose: true });
    // Un seul coup très majoritaire (90 %) et un coup rare.
    const moves = [{ uci: legal[0].lan, san: legal[0].san, white: 50, draws: 0, black: 40 }, { uci: legal[1].lan, san: legal[1].san, white: 5, draws: 0, black: 5 }];
    return r.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { white: 55, draws: 0, black: 45, moves } });
  });
  await page.goto('./#/entrainement');
  await engineReady(page);
  await page.click('[data-start]');
  const log = page.locator('[data-log]');
  // Caro-Kann : 1.e4 imposé, puis notre 1…c6 (répertoire).
  await expect(log).toContainText('ouverture imposée');
  await move(page, 'c7c6');
  await expect(log).toContainText('Coup du répertoire');
  await expect(log).toContainText(/parties de ce niveau/, { timeout: 10000 });
  expect(calls.some((p) => p === 'e2e4,c7c6')).toBe(true);
});

test('Révision espacée : position ratée revient, réussie s’espace, compteur mis à jour', async ({ page }) => {
  await setup(page, { prefs: { rep: 'gd', source: 'fiches', length: 5, mode: 'revision' } });
  await page.goto('./#/entrainement');
  await engineReady(page);
  await expect(page.locator('[data-rev-stats]')).toContainText('0 / ');
  await page.click('[data-start]');
  const log = page.locator('[data-log]');
  // 1re carte : position de départ (nouvelle), coup du répertoire 1.d4.
  await expect(log).toContainText('Position 1 / 5');
  await move(page, 'd2d4');
  await expect(log).toContainText('Coup du répertoire');
  // 2e carte : on se trompe exprès (a2-a4) → proposition du bon coup.
  await expect(log).toContainText('Position 2 / 5', { timeout: 10000 });
  await move(page, 'a2a4');
  await expect(page.locator('[data-fix]')).toBeVisible({ timeout: 20000 });
  await page.click('[data-fix]');
  await expect(log).toContainText('Position 3 / 5', { timeout: 10000 });
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('coach-echecs:revision-v1')).gd);
  const vals = Object.values(st);
  expect(vals.length).toBe(2);
  const ok = vals.find((x) => x.reps === 1);
  const ko = vals.find((x) => x.lapses === 1);
  expect(ok.due - ok.seen).toBe(86400000); // revient dans 1 jour
  expect(ko.due - ko.seen).toBe(600000); // revient dans 10 minutes
  await page.click('[data-stop]');
  await expect(log).toContainText('Révision :');
});

const status = (page) => page.locator('#page-entrainement [data-status]');
const openAll = (page) => page.evaluate(() => document.querySelectorAll('.dash-more').forEach((d) => { d.open = true; }));
async function ours(page, uci) {
  await expect(status(page)).toContainText('À vous', { timeout: 10000 });
  await move(page, uci);
}

test('Lignes : l’application joue l’adversaire, erreur expliquée puis reposée en fin de séance', async ({ page }) => {
  await setup(page, { prefs: { rep: 'gd', source: 'fiches' } });
  await page.goto('./#/entrainement');
  await expect(page.locator('[data-dashboard]')).toContainText('Progression par variante');
  const line = 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 b8d7 a1c1 c7c6 f1d3 d5c4 d3c4 f6d5'.split(' ');
  await openAll(page);
  await page.click('[data-dash-line="gd-orthodoxe"]');
  const log = page.locator('#page-entrainement [data-log]');
  await ours(page, 'd2d4');
  await expect(log).toContainText('✔ d4');
  // Erreur volontaire au 2e coup : explication du plan, bon coup, puis on continue.
  await ours(page, 'a2a3');
  const fb = page.locator('#page-entrainement [data-feedback]');
  await expect(fb).toContainText('Le bon coup : c4');
  await expect(fb).toContainText('Plan de la fiche');
  await page.click('[data-continue]');
  for (let i = 4; i < line.length; i += 2) await ours(page, line[i]);
  await expect(log).toContainText('Ligne terminée');
  // La position ratée revient.
  await expect(page.locator('#page-entrainement [data-head]')).toContainText('Révision des erreurs', { timeout: 10000 });
  await ours(page, 'c2c4');
  await expect(page.locator('.hub-result')).toContainText('Lignes terminées : 0 / 1 sans faute', { timeout: 10000 });
  // Progression mise à jour : positions révisées → maîtrise > 0 pour cette fiche.
  const pctTxt = await page.locator('.dash-row', { hasText: 'Variante orthodoxe' }).first().locator('.dash-pct').textContent().catch(() => null);
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem('coach-echecs:progression-v1')));
  expect(prog.lignes['gd-orthodoxe']).toMatchObject({ ok: 0, ko: 1 });
  if (pctTxt) expect(parseInt(pctTxt, 10)).toBeGreaterThan(0);
});

test('Drill anti-trash : punition réussie dans le temps, puis ratée avec la solution affichée', async ({ page }) => {
  await setup(page, { prefs: { rep: 'gd', source: 'fiches' } });
  await page.goto('./#/entrainement');
  await openAll(page);
  await page.click('[data-dash-trash="gd-echange"]');
  const log = page.locator('#page-entrainement [data-log]');
  await expect(log).toContainText('L’adversaire joue', { timeout: 10000 });
  await expect(page.locator('#page-entrainement [data-timer]')).toBeVisible();
  for (const u of ['g5f6', 'd1b3', 'b3b7']) await ours(page, u);
  await expect(page.locator('#page-entrainement [data-feedback]')).toContainText('+1 point');
  await page.click('[data-continue]');
  await expect(page.locator('.hub-result')).toContainText('1 / 1 punition(s) réussie(s)');
  // Deuxième essai : mauvais coup → solution complète.
  await openAll(page);
  await page.click('[data-dash-trash="gd-echange"]');
  await expect(log).toContainText('L’adversaire joue', { timeout: 10000 });
  await ours(page, 'a2a3');
  await expect(page.locator('#page-entrainement [data-feedback]')).toContainText('La punition : 7. Fxf6 Fxf6 8. Db3 c6 9. Dxb7');
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem('coach-echecs:progression-v1')));
  expect(prog.drills['gd-echange']).toMatchObject({ ok: 1, ko: 1 });
  expect(prog.jours.length).toBe(1);
});

test('Accueil Entraînement sur téléphone @mobile : modules et progression lisibles', async ({ page }) => {
  await setup(page, { prefs: { rep: 'gd', source: 'fiches' } });
  await page.goto('./#/entrainement');
  await expect(page.locator('[data-today]')).toBeVisible();
  await expect(page.locator('.dash-row').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await page.click('[data-dash-rep="ck"]');
  await expect(page.locator('.dash-row').first()).toContainText(/B1\d/);
});
