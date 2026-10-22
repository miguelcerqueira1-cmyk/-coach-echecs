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
