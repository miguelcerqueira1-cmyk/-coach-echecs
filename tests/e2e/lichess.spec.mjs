// Pages « Moteur » (panneau Coup optimal) et « Répertoire ».
// Les API Lichess sont simulées par un faux serveur qui calcule les coups légaux avec chess.js,
// sauf les tests @online qui interrogent le vrai Lichess (lancés en CI sur le site publié).
import { test, expect } from '@playwright/test';
import { Chess } from '../../site/vendor/chess.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

function positionFrom(url) {
  const u = new URL(url);
  const c = new Chess(u.searchParams.get('fen') || START);
  for (const m of (u.searchParams.get('play') || '').split(',').filter(Boolean)) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  return c;
}

// Faux Lichess : 3 premiers coups légaux, le 2e a le meilleur % sur un gros échantillon,
// le 3e a 100 % sur 5 parties (doit être écarté par le seuil).
async function mockLichess(page, { explorerCalls = [], cloud = 'ok', explorerStatus = 200 } = {}) {
  await page.route('https://lichess.org/api/cloud-eval**', (r) => {
    if (cloud === 'absent') return r.fulfill({ status: 404, headers: CORS, json: { error: 'Not found' } });
    const c = positionFrom(r.request().url());
    const mv = c.moves({ verbose: true })[0];
    return r.fulfill({ headers: CORS, json: { fen: c.fen(), knodes: 54321, depth: 37, pvs: [{ moves: mv ? mv.lan : '', cp: 31 }] } });
  });
  await page.route('https://explorer.lichess.org/**', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    explorerCalls.push({ url: r.request().url(), auth: r.request().headers().authorization });
    if (explorerStatus !== 200) return r.fulfill({ status: explorerStatus, headers: CORS, json: {} });
    const c = positionFrom(r.request().url());
    const legal = c.moves({ verbose: true }).slice(0, 3);
    const counts = [[400, 50, 550], [700, 50, 250], [5, 0, 0]];
    const moves = legal.map((m, i) => {
      const [w, d, b] = c.turn() === 'w' ? counts[i] : [counts[i][2], counts[i][1], counts[i][0]];
      return { uci: m.lan, san: m.san, white: w, draws: d, black: b, averageRating: 1100 };
    });
    const tot = moves.reduce((a, m) => [a[0] + m.white, a[1] + m.draws, a[2] + m.black], [0, 0, 0]);
    return r.fulfill({ headers: CORS, json: { white: tot[0], draws: tot[1], black: tot[2], moves, opening: { eco: 'X00', name: 'Ouverture de test' } } });
  });
}

async function setup(page, { token = 'lip_test', settings = {} } = {}) {
  await page.addInitScript(([t, s]) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('coach-echecs:reglages:v1', JSON.stringify({ budget: 'rapide', autoExplain: false, ...s }));
      if (t) localStorage.setItem('coach-echecs:jeton-lichess', t);
      sessionStorage.setItem('e2e-init', '1');
    }
  }, [token, settings]);
}

const waitEngine = (page) => page.waitForFunction(() => {
  const s = window.__coach?.state;
  return s && s.analysis.status === 'ready' && s.game.isCurrent(s.analysis.advice.token);
}, null, { timeout: 60000 });

test('Coup optimal : Stockfish local, Cloud Eval et meilleur % de victoire avec seuil', async ({ page }) => {
  const calls = [];
  await mockLichess(page, { explorerCalls: calls });
  await setup(page);
  await page.goto('./');
  await waitEngine(page);
  const panel = page.locator('#optimal');
  await expect(panel).toContainText('Meilleur coup — Stockfish');
  await expect(panel).toContainText('prof. 37');
  await expect(panel).toContainText('% de victoires blanches');
  const best = await page.evaluate(() => window.__coach.optimal.explorer.best);
  const legal = new Chess(START).moves({ verbose: true }).slice(0, 3);
  expect(best.uci).toBe(legal[1].lan); // 70 % sur 1000 parties, pas le 100 % sur 5 parties
  await expect(panel.locator('tr.small-sample')).toHaveCount(1);
  await expect(page.locator('.board-arrows line.arrow-stat')).toHaveCount(1);
  // Filtre par défaut : blitz, < 1000 et 1000–1199 ; jeton envoyé en Bearer.
  expect(calls[0].url).toContain('speeds=blitz');
  expect(calls[0].url).toContain('ratings=0%2C1000');
  expect(calls[0].auth).toBe('Bearer lip_test');
  // Changer de préréglage relance la requête avec le nouveau filtre.
  await panel.locator('summary').click();
  await panel.locator('[data-f=preset]').selectOption('fort');
  await expect.poll(() => calls.at(-1).url).toContain('ratings=2200%2C2500');
  // Après un coup, les statistiques suivent la nouvelle position (play=...).
  await page.fill('#notation-input', 'd4');
  await page.press('#notation-input', 'Enter');
  await expect.poll(() => calls.at(-1).url).toContain('play=d2d4');
});

test('Coup optimal : position absente du cache, explorateur sans jeton, erreur explicite', async ({ page }) => {
  await mockLichess(page, { cloud: 'absent', explorerStatus: 401 });
  await setup(page, { token: '' });
  await page.goto('./');
  await waitEngine(page);
  const panel = page.locator('#optimal');
  await expect(panel).toContainText('absente du cache Lichess');
  await expect(panel).toContainText('ajoutez un jeton Lichess');
  // Avec un jeton refusé : message d'erreur, aucune statistique inventée.
  await page.evaluate(() => { localStorage.setItem('coach-echecs:jeton-lichess', 'mauvais'); window.__coach.optimal.update(window.__coach.state.game); });
  await expect(panel).toContainText('Jeton Lichess refusé');
  await expect(panel.locator('table')).toHaveCount(0);
});

test('navigation entre les pages @smoke : la partie et l’analyse sont conservées', async ({ page }) => {
  await mockLichess(page);
  await setup(page);
  await page.goto('./');
  await waitEngine(page);
  await page.fill('#notation-input', 'e4');
  await page.press('#notation-input', 'Enter');
  await page.click('.tabs a[data-page=repertoire]');
  await expect(page.locator('#page-repertoire')).toBeVisible();
  await expect(page.locator('#page-moteur')).toBeHidden();
  await page.click('.tabs a[data-page=moteur]');
  const moves = await page.evaluate(() => window.__coach.state.game.moves.map((m) => m.san));
  expect(moves).toEqual(['e4']);
});

test('Répertoire : 9 colonnes, deux répertoires, filtres, vérification Stockfish affichée', async ({ page }) => {
  await mockLichess(page);
  await setup(page);
  await page.goto('./#/repertoire');
  const rows = page.locator('.rep-table tbody tr[data-id]');
  await expect(rows.first()).toBeVisible();
  await expect(page.locator('.rep-table thead th')).toHaveCount(9);
  const nGd = await rows.count();
  expect(nGd).toBeGreaterThan(15);
  await expect(page.locator('.rep-table tbody')).toContainText('D67');
  await expect(page.locator('.badge.ok').first()).toContainText('Stockfish');
  await expect(page.locator('.badge.err')).toHaveCount(0);
  // Colonnes dynamiques remplies depuis le (faux) Lichess.
  await expect(rows.first().locator('[data-label="Statistiques"]')).toContainText('parties');
  await expect(rows.first().locator('[data-label="Évaluation"]')).toContainText('Cloud Eval');
  await page.click('[data-rep=ck]');
  await expect(page.locator('.rep-table tbody')).toContainText('B17');
  await page.selectOption('[data-badge]', 'loufoque');
  const badges = await page.locator('.rep-table tbody .badge.b-loufoque').count();
  expect(badges).toBe(await rows.count());
  await page.fill('[data-q]', 'Karpov');
  await page.selectOption('[data-badge]', '');
  await expect(rows).toHaveCount(1);
});

test('Répertoire : arbre Lichess navigable et ouverture d’une ligne sur l’échiquier', async ({ page }) => {
  await mockLichess(page);
  await setup(page);
  await page.goto('./#/repertoire');
  await page.click('[data-tree="gd-orthodoxe"]');
  const tree = page.locator('#rep-tree');
  await expect(tree.locator('.tree-table tbody tr')).toHaveCount(3);
  const before = await page.evaluate(() => window.__coach.repertoire.tree.path.length);
  await tree.locator('[data-child]').first().click();
  await expect.poll(() => page.evaluate(() => window.__coach.repertoire.tree.path.length)).toBe(before + 1);
  await tree.locator('[data-crumb="0"]').click();
  await expect.poll(() => page.evaluate(() => window.__coach.repertoire.tree.path.length)).toBe(0);

  await page.click('[data-rep=ck]');
  page.once('dialog', (d) => d.accept());
  await page.click('[data-open="ck-karpov"]');
  await expect(page.locator('#page-moteur')).toBeVisible();
  const g = await page.evaluate(() => ({ moves: window.__coach.state.game.moves.map((m) => m.san), color: window.__coach.state.game.playerColor }));
  expect(g.moves.slice(0, 4)).toEqual(['e4', 'c6', 'd4', 'd5']);
  expect(g.color).toBe('b');
});

test('Répertoire : lien vidéo horodaté personnel', async ({ page }) => {
  await mockLichess(page);
  await setup(page);
  await page.goto('./#/repertoire');
  const answers = ['https://youtu.be/dQw4w9WgXcQ', '1:30'];
  page.on('dialog', (d) => d.accept(answers.shift()));
  await page.click('[data-video-add="gd-orthodoxe"]');
  const link = page.locator('tr[data-id="gd-orthodoxe"] a', { hasText: 'Mon lien horodaté' });
  await expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s');
  await expect(page.locator('tr[data-id="gd-orthodoxe"] a', { hasText: 'Rechercher sur YouTube' })).toHaveAttribute('href', /youtube\.com\/results\?search_query=/);
});

test('Répertoire sur téléphone @mobile : cartes lisibles, pas de défilement horizontal', async ({ page }) => {
  await mockLichess(page);
  await setup(page);
  await page.goto('./#/repertoire');
  await expect(page.locator('.rep-table tbody tr').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('.rep-table thead')).toBeHidden();
});

// ---------- Vraies API Lichess (CI, site publié) ----------

test('@online Cloud Eval réel depuis le site publié', async ({ page }) => {
  test.skip(!process.env.ONLINE, 'uniquement en ligne');
  await setup(page, { token: '' });
  await page.goto('./');
  await waitEngine(page);
  await expect(page.locator('#optimal')).toContainText(/prof\. \d+/, { timeout: 30000 });
  const cloud = await page.evaluate(() => window.__coach.optimal.cloud);
  expect(cloud.status).toBe('ok');
});

test('@online Opening Explorer réel avec jeton personnel (CORS depuis le site publié)', async ({ page }) => {
  test.skip(!process.env.ONLINE || !process.env.LICHESS_TOKEN, 'nécessite ONLINE et le secret LICHESS_TOKEN');
  await setup(page, { token: process.env.LICHESS_TOKEN });
  await page.goto('./');
  await waitEngine(page);
  await expect.poll(() => page.evaluate(() => window.__coach.optimal.explorer.status), { timeout: 30000 }).not.toBe('loading');
  const ex = await page.evaluate(() => window.__coach.optimal.explorer);
  expect(ex.error || '').toBe('');
  expect(ex.total).toBeGreaterThan(1000);
});
