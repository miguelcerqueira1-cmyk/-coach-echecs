// Page « Mes parties » : import simulé (formats réels Lichess NDJSON et Chess.com),
// analyse avec le vrai Stockfish, bilan, ouverture d'une partie sur l'échiquier.
import { test, expect } from '@playwright/test';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

const lichessGames = [
  // Blancs, sortie du répertoire au 2e coup (2.Cf3 au lieu de 2.c4), gaffe ensuite.
  { id: 'aaaa1111', rated: true, variant: 'standard', speed: 'blitz', createdAt: 1760900000000, status: 'resign', winner: 'black',
    players: { white: { user: { name: 'LeugiMC' }, rating: 985 }, black: { user: { name: 'Adversaire1' }, rating: 1002 } },
    opening: { eco: 'D02', name: 'Queen\'s Pawn Game' }, moves: 'd4 d5 Nf3 Nf6 Bg5 Ne4 Bf4 Nc6 e3 e5 dxe5 Bb4+ c3 Bxc3+' },
  // Noirs, Caro-Kann, victoire.
  { id: 'bbbb2222', rated: true, variant: 'standard', speed: 'blitz', createdAt: 1760800000000, status: 'mate', winner: 'black',
    players: { white: { user: { name: 'Adversaire2' }, rating: 960 }, black: { user: { name: 'LeugiMC' }, rating: 980 } },
    opening: { eco: 'B12', name: 'Caro-Kann Defense' }, moves: 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5' },
];

const chessComMonth = { games: [{
  url: 'https://www.chess.com/game/live/999', rules: 'chess', time_class: 'blitz', rated: true, end_time: 1760700000,
  white: { username: 'QG_Miguel', rating: 870, result: 'win' }, black: { username: 'Inconnu', rating: 850, result: 'resigned' },
  pgn: '[Event "Live Chess"]\n[White "QG_Miguel"]\n[Black "Inconnu"]\n[Result "1-0"]\n[ECO "D06"]\n\n1. d4 d5 2. c4 Bg4 3. cxd5 Qxd5 4. Nc3 1-0',
}] };

async function setup(page, { token = 'lip_test' } = {}) {
  const calls = [];
  await page.route(/https:\/\/(explorer\.)?lichess\.org\/(?!api\/games)/, (r) => r.abort());
  await page.route('https://lichess.org/api/games/user/**', (r) => {
    calls.push({ url: r.request().url(), auth: r.request().headers().authorization });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    return r.fulfill({ headers: { ...CORS, 'content-type': 'application/x-ndjson' }, body: lichessGames.map((g) => JSON.stringify(g)).join('\n') + '\n' });
  });
  await page.route('https://api.chess.com/pub/player/**', (r) => {
    const u = r.request().url();
    calls.push({ url: u });
    if (u.endsWith('/archives')) return r.fulfill({ headers: CORS, json: { archives: ['https://api.chess.com/pub/player/qg_miguel/games/2026/10'] } });
    return r.fulfill({ headers: CORS, json: chessComMonth });
  });
  await page.addInitScript(([t]) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('coach-echecs:reglages:v1', JSON.stringify({ budget: 'rapide', autoExplain: false }));
      localStorage.setItem('coach-echecs:mes-parties', JSON.stringify({ lichess: 'LeugiMC', chesscom: 'QG_Miguel', max: 20, speed: 'blitz', precision: 150 }));
      if (t) localStorage.setItem('coach-echecs:jeton-lichess', t);
      sessionStorage.setItem('e2e-init', '1');
    }
  }, [token]);
  return calls;
}

test('Mes parties : import Lichess + Chess.com, sorties du répertoire, analyse et bilan', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('./#/parties');
  await page.waitForFunction(() => window.__coach?.engine.state === 'ready', null, { timeout: 60000 });
  await page.click('[data-import]');
  await expect(page.locator('.games-status')).toContainText('Lichess : 2 partie(s)');
  await expect(page.locator('.games-status')).toContainText('Chess.com : 1 partie(s)');
  // Le jeton Lichess est utilisé pour l'export.
  expect(calls.find((c) => c.url.includes('/api/games/user/LeugiMC')).auth).toBe('Bearer lip_test');
  await expect(page.locator('.game-card')).toHaveCount(3);
  // Sortie du répertoire détectée (2.Cf3 au lieu de 2.c4) et erreur adverse punie (2…Fg4 3.cxd5).
  await expect(page.locator('.games-summary')).toContainText('2. Cf3 au lieu de c4');
  await expect(page.locator('.game-card').filter({ hasText: 'Inconnu' })).toContainText('punie');
  // Analyse de la première partie avec Stockfish.
  await page.locator('.game-card').filter({ hasText: 'Adversaire1' }).locator('[data-analyse]').click();
  await expect(page.locator('.analysis-card')).toContainText('Trois pistes de travail', { timeout: 60000 });
  await expect(page.locator('.analysis-card')).toContainText('Revoir l’ouverture');
  await expect(page.locator('.eval-graph')).toBeVisible();
  await page.locator('.moves-annot .m').nth(4).click();
  await expect(page.locator('[data-review-caption]')).toContainText('Avant 3. Fg5');
  // Résultat mis en cache : la vue d’ensemble inclut la partie analysée.
  await expect(page.locator('.games-summary')).toContainText('Sur 1 partie(s) analysée(s)');
  // Ouvrir sur l'échiquier principal.
  page.once('dialog', (d) => d.accept());
  await page.locator('.game-card').filter({ hasText: 'Adversaire2' }).locator('[data-open]').click();
  await expect(page.locator('#page-moteur')).toBeVisible();
  const g = await page.evaluate(() => ({ n: window.__coach.state.game.ply, c: window.__coach.state.game.playerColor }));
  expect(g).toEqual({ n: 10, c: 'b' });
});

test('Mes parties : erreur explicite si l’export Lichess est refusé', async ({ page }) => {
  await setup(page, { token: '' });
  await page.route('https://lichess.org/api/games/user/**', (r) => r.fulfill({ status: 404, headers: CORS, json: { error: 'Not found' } }));
  await page.goto('./#/parties');
  await page.click('[data-import]');
  await expect(page.locator('.games-status')).toContainText('ajoutez votre jeton Lichess');
  await expect(page.locator('.games-status')).toContainText('Chess.com : 1 partie(s)');
});

// ---------- Vraies API depuis le site publié (CI) ----------

test('@online import Chess.com réel (compte public)', async ({ page }) => {
  test.skip(!process.env.ONLINE, 'uniquement en ligne');
  await page.addInitScript(() => localStorage.setItem('coach-echecs:mes-parties', JSON.stringify({ lichess: '', chesscom: 'Hikaru', max: 10, speed: 'toutes', precision: 300 })));
  await page.goto('./#/parties');
  await page.click('[data-import]');
  await expect(page.locator('.games-status')).toContainText(/Chess\.com : \d+ partie/, { timeout: 30000 });
  expect(await page.locator('.game-card').count()).toBeGreaterThan(0);
});

test('@online import Lichess réel avec jeton', async ({ page }) => {
  test.skip(!process.env.ONLINE || !process.env.LICHESS_TOKEN, 'nécessite ONLINE et le secret LICHESS_TOKEN');
  await page.addInitScript((t) => {
    localStorage.setItem('coach-echecs:jeton-lichess', t);
    localStorage.setItem('coach-echecs:mes-parties', JSON.stringify({ lichess: 'DrNykterstein', chesscom: '', max: 10, speed: 'toutes', precision: 300 }));
  }, process.env.LICHESS_TOKEN);
  await page.goto('./#/parties');
  await page.click('[data-import]');
  await expect(page.locator('.games-status')).toContainText(/Lichess : \d+ partie/, { timeout: 30000 });
});

test('Mes parties : revenir sur Moteur pendant une analyse ne bloque pas le calcul', async ({ page }) => {
  await setup(page);
  await page.goto('./#/parties');
  await page.waitForFunction(() => window.__coach?.engine.state === 'ready', null, { timeout: 60000 });
  await page.click('[data-import]');
  await expect(page.locator('.game-card')).toHaveCount(3);
  // Analyse « précise » (longue) lancée, puis retour immédiat sur la page Moteur.
  await page.evaluate(() => { window.__coach.games.prefs.precision = 800; });
  await page.locator('.game-card').first().locator('[data-analyse]').click();
  await page.waitForTimeout(500);
  await page.click('.tabs a[data-page=moteur]');
  await page.waitForFunction(() => {
    const s = window.__coach.state;
    return s.analysis.status === 'ready' && s.game.isCurrent(s.analysis.advice.token);
  }, null, { timeout: 30000 });
  await expect(page.locator('#optimal')).toContainText(/prof\. \d+/);
  // De retour sur Mes parties, l'analyse reprend et se termine.
  await page.click('.tabs a[data-page=parties]');
  await expect(page.locator('.analysis-card')).toContainText('Trois pistes de travail', { timeout: 90000 });
});
