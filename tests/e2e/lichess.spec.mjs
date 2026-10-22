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
  // Base des maîtres : coup le plus joué (le mock donne 1000 parties au 2e coup sur 1505).
  await expect(panel.locator('.mv-master')).toBeVisible();
  await expect(panel).toContainText('des parties');
  expect(calls.some((c) => c.url.startsWith('https://explorer.lichess.org/masters') && !c.url.includes('ratings='))).toBe(true);
  // Filtre par défaut : blitz, < 1000 et 1000–1199 ; jeton envoyé en Bearer.
  const lc = calls.find((c) => c.url.startsWith('https://explorer.lichess.org/lichess'));
  expect(lc.url).toContain('speeds=blitz');
  expect(lc.url).toContain('ratings=0%2C1000');
  expect(lc.auth).toBe('Bearer lip_test');
  // Changer de préréglage relance la requête avec le nouveau filtre.
  await panel.locator('summary').click();
  await panel.locator('[data-f=preset]').selectOption('fort');
  await expect.poll(() => calls.some((c) => c.url.includes('ratings=2200%2C2500'))).toBe(true);
  // Après un coup, les statistiques suivent la nouvelle position (play=...).
  await page.fill('#notation-input', 'd4');
  await page.press('#notation-input', 'Enter');
  await expect.poll(() => calls.some((c) => c.url.includes('play=d2d4'))).toBe(true);
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

test('Répertoire : 9 colonnes, filtres rapides, vérification Stockfish, stats niveau + maîtres', async ({ page }) => {
  const calls = [];
  await mockLichess(page, { explorerCalls: calls });
  await setup(page);
  await page.goto('./#/repertoire');
  const rows = page.locator('.rep-table tbody tr[data-id]');
  await expect(rows.first()).toBeVisible();
  await expect(page.locator('.rep-table thead th')).toHaveCount(9);
  const nGd = await rows.count();
  expect(nGd).toBeGreaterThan(25);
  await expect(page.locator('.rep-table tbody')).toContainText('D67');
  await expect(page.locator('.badge.ok').first()).toContainText('Stockfish');
  await expect(page.locator('.badge.err')).toHaveCount(0);
  // Colonnes dynamiques remplies depuis le (faux) Lichess : mon niveau ET base des maîtres.
  const stats = rows.first().locator('[data-label="Statistiques"]');
  await expect(stats).toContainText('Mon niveau');
  await expect(stats).toContainText('Maîtres');
  await expect(stats.locator('.stat-line')).toHaveCount(2);
  expect(calls.some((c) => c.url.startsWith('https://explorer.lichess.org/masters'))).toBe(true);
  await expect(rows.first().locator('[data-label="Évaluation"]')).toContainText('Cloud Eval');
  await page.click('[data-view=ck]');
  await expect(page.locator('.rep-table tbody')).toContainText('B17');
  await page.click('[data-badge-chip=loufoque]');
  const badges = await page.locator('.rep-table tbody .badge.b-loufoque').count();
  expect(badges).toBe(await rows.count());
  await page.click('[data-badge-chip=""]');
  await page.fill('[data-q]', 'Karpov');
  await expect(rows.first()).toBeVisible();
  await expect.poll(() => rows.count()).toBeLessThan(5);
  await expect(page.locator('tr[data-id="ck-karpov"]')).toBeVisible();
});

test('Répertoire : recherche par coup (français ou anglais) et par code ECO', async ({ page }) => {
  await mockLichess(page);
  await setup(page);
  await page.goto('./#/repertoire');
  const rows = page.locator('.rep-table tbody tr[data-id]');
  await expect(rows.first()).toBeVisible();
  await page.click('[data-view=ck]');
  await page.fill('[data-q]', '4...Fg4');
  await expect.poll(() => rows.count()).toBeGreaterThan(0);
  const fr = await rows.count();
  await page.fill('[data-q]', '4...Bg4');
  await expect.poll(() => rows.count()).toBe(fr);
  await page.fill('[data-q]', 'B12');
  await expect.poll(() => rows.count()).toBeGreaterThan(0);
  expect(await rows.locator('.badge.eco').allTextContents()).toContain('B12');
  await page.fill('[data-q]', 'zzzz');
  await expect(rows).toHaveCount(0);
});

test('Répertoire : arbre Lichess navigable (niveau et maîtres)', async ({ page }) => {
  const calls = [];
  await mockLichess(page, { explorerCalls: calls });
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
  const n = calls.length;
  await tree.locator('[data-tree-src=maitres]').click();
  await expect.poll(() => calls.slice(n).some((c) => c.url.startsWith('https://explorer.lichess.org/masters'))).toBe(true);
  await expect(tree.locator('.tree-table tbody tr')).toHaveCount(3);
});

test('Répertoire : « Tester cette ligne » bascule sur le Moteur et rejoue la séquence', async ({ page }) => {
  await mockLichess(page);
  await setup(page);
  await page.goto('./#/repertoire');
  await page.click('[data-view=ck]');
  // Partie vide : pas de confirmation demandée.
  await page.click('[data-test="ck-karpov"]');
  await expect(page.locator('#page-moteur')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__coach.state.viewPly)).not.toBe(null);
  // Fin de l'animation : retour à la position actuelle (vue « en direct »).
  await expect.poll(() => page.evaluate(() => window.__coach.state.viewPly), { timeout: 15000 }).toBe(null);
  const g = await page.evaluate(() => ({ moves: window.__coach.state.game.moves.map((m) => m.san), color: window.__coach.state.game.playerColor }));
  expect(g.moves.slice(0, 4)).toEqual(['e4', 'c6', 'd4', 'd5']);
  expect(g.color).toBe('b');
  // Une ligne testée se remplace sans confirmation.
  let asked = false;
  page.on('dialog', (d) => { asked = true; d.accept(); });
  await page.click('.tabs a[data-page=repertoire]');
  await page.click('[data-view=gd]');
  await page.click('[data-test="gd-orthodoxe"]');
  await expect.poll(() => page.evaluate(() => window.__coach.state.game.moves[0]?.san)).toBe('d4');
  expect(asked).toBe(false);
});

test('Répertoire : section Anti-trash Blitz et test d’une punition', async ({ page }) => {
  await mockLichess(page);
  await setup(page);
  await page.goto('./#/repertoire');
  await page.click('[data-view=trash]');
  const trash = page.locator('.trash');
  await expect(trash).toContainText('Coups adverses à punir');
  await expect(trash).toContainText('Pièges à ne pas commettre');
  expect(await trash.locator('.trash-card.punition').count()).toBeGreaterThan(10);
  expect(await trash.locator('.trash-card.piege').count()).toBeGreaterThan(3);
  await trash.locator('[data-test-claim="gd-echange:punition"]').click();
  await expect(page.locator('#page-moteur')).toBeVisible();
  const moves = await page.evaluate(() => window.__coach.state.game.moves.map((m) => m.san));
  expect(moves.slice(-2)).toEqual(['c6', 'Qxb7']);
});

test('Répertoire : export PGN importable (chess.js), annotations ?', async ({ page }) => {
  await mockLichess(page);
  await setup(page);
  await page.goto('./#/repertoire');
  await page.locator('.export-menu summary').click();
  const dl = page.waitForEvent('download');
  await page.click('[data-export=gd]');
  expect((await dl).suggestedFilename()).toBe('repertoire-gambit-dame.pgn');
  const pgn = await page.evaluate(() => window.__coach.repertoire.lastExport);
  expect(pgn).toContain('[Event "');
  expect(pgn).toContain('$2');
  const games = pgn.split(/\n(?=\[Event )/);
  expect(games.length).toBeGreaterThan(25);
  for (const g of games) new Chess().loadPgn(g);
});

test('Répertoire : vidéos multilingues sans clé (lien de recherche) et avec clé (API simulée)', async ({ page }) => {
  await mockLichess(page);
  const ytCalls = [];
  await page.route('https://www.googleapis.com/youtube/v3/**', (r) => {
    const u = new URL(r.request().url());
    ytCalls.push(u);
    if (u.pathname.endsWith('/search')) {
      return r.fulfill({ headers: CORS, json: { items: [{ id: { videoId: 'abc123def45' }, snippet: { title: 'Gambit Dame : l&#39;Orthodoxe', channelTitle: 'Chaîne test', publishedAt: '2024-01-02T00:00:00Z', thumbnails: {} } }] } });
    }
    return r.fulfill({ headers: CORS, json: { items: [{ id: 'abc123def45', contentDetails: { duration: 'PT12M5S' }, statistics: { viewCount: '12345' } }] } });
  });
  await setup(page);
  await page.goto('./#/repertoire');
  await page.click('[data-videos="gd-orthodoxe"]');
  const dlg = page.locator('[data-video-dlg]');
  await expect(dlg.locator('a.primary-link')).toHaveAttribute('href', /youtube\.com\/results\?search_query=/);
  await dlg.locator('[data-vlang=es]').click();
  await expect(dlg.locator('a.primary-link')).toHaveAttribute('href', /ajedrez/);
  await dlg.locator('[data-vclose]').click();
  // Avec une clé : liste avec chaîne, durée et vues ; horodatage personnel conservé.
  await page.evaluate(() => localStorage.setItem('coach-echecs:cle-youtube', 'AIza-test'));
  await page.click('[data-videos="gd-orthodoxe"]');
  await expect(dlg.locator('.vd-title')).toHaveText("Gambit Dame : l'Orthodoxe");
  await expect(dlg).toContainText('12:05');
  expect(ytCalls[0].searchParams.get('relevanceLanguage')).toBe('es');
  page.once('dialog', (d) => d.accept('1:30'));
  await dlg.locator('[data-vkeep]').click();
  await expect(page.locator('tr[data-id="gd-orthodoxe"] a', { hasText: 'Mon lien horodaté' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc123def45&t=90s');
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

test('Répertoire : toucher une étiquette filtre les fiches de ce type', async ({ page }) => {
  await mockLichess(page);
  await setup(page);
  await page.goto('./#/repertoire');
  await page.locator('[data-badge-filter="loufoque"]').first().click();
  await expect(page.locator('[data-badge-chip="loufoque"]')).toHaveAttribute('aria-pressed', 'true');
  const rows = page.locator('.rep-table tbody tr[data-id]');
  expect(await rows.count()).toBe(await page.locator('.rep-table tbody .b-loufoque').count());
});

test('Expliquer sans API Claude : explication gratuite sous l’échiquier', async ({ page }) => {
  await mockLichess(page);
  await setup(page);
  await page.goto('./');
  await waitEngine(page);
  await page.click('#btn-explain');
  const coach = page.locator('.board-col #coach');
  await expect(coach).toContainText('Pourquoi ce coup', { timeout: 15000 });
  await expect(coach).toContainText('Menace à surveiller');
  await expect(coach).toContainText('Suite calculée');
  await expect(coach).not.toContainText('undefined');
  // La navigation ⏮ ◀ ▶ ⏭ est sous l'échiquier et indique la position affichée.
  await page.fill('#notation-input', 'e4');
  await page.press('#notation-input', 'Enter');
  await expect(page.locator('#nav-label')).toContainText('1. e4');
  await page.click('.board-nav [data-nav=prev]');
  await expect(page.locator('#nav-label')).toContainText('départ');
  await expect(page.locator('#view-banner')).toBeVisible();
  await page.click('.board-nav [data-nav=end]');
  await expect(page.locator('#view-banner')).toBeHidden();
});
