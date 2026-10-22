// Tests de bout en bout avec le vrai moteur Stockfish (WASM) dans le navigateur.
// Seule l'API Claude est simulée (interception réseau), pour ne rien dépenser.
import { test, expect } from '@playwright/test';

const FAST = { budget: 'rapide', autoExplain: false, level: 'intermediaire', showOpponentArrow: true, apiUrl: '' };

async function setup(page, settings = {}, code = '') {
  // Pas d'appel réseau réel vers Lichess dans ces tests : réponses déterministes.
  await page.route(/https:\/\/(explorer\.)?lichess\.org\//, (r) => r.abort());
  await page.addInitScript(([s, c]) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('coach-echecs:reglages:v1', JSON.stringify(s));
      if (c) localStorage.setItem('coach-echecs:code-acces', c);
      sessionStorage.setItem('e2e-init', '1');
    }
  }, [{ ...FAST, ...settings }, code]);
}

const snap = (page) => page.evaluate(() => {
  const s = window.__coach.state;
  return {
    fen: s.game.fen(), ply: s.game.ply, revision: s.game.revision, id: s.game.id, turn: s.game.turn(),
    moves: s.game.moves.map((m) => m.san), status: s.analysis.status,
    best: s.analysis.advice?.best?.lan, adviceFen: s.analysis.advice?.fen, depth: s.analysis.advice?.depth,
    coach: s.coach.status, engine: window.__coach.engine.state,
  };
});

// Attend un conseil calculé pour la position actuelle exacte.
async function waitAdvice(page) {
  await page.waitForFunction(() => {
    const s = window.__coach?.state;
    return s && s.analysis.status === 'ready' && s.analysis.advice && s.game.isCurrent(s.analysis.advice.token);
  }, null, { timeout: 60000 });
  return snap(page);
}

async function clickMove(page, from, to) {
  await page.locator(`[data-sq="${from}"]`).click();
  await page.locator(`[data-sq="${to}"]`).click();
}

async function typeMove(page, text) {
  await page.fill('#notation-input', text);
  await page.press('#notation-input', 'Enter');
}

async function newGame(page, { color = 'w', source = 'initial', text = '' } = {}) {
  await page.click(source === 'initial' ? '#btn-new' : '#btn-import');
  await page.check(`#form-new input[name=color][value=${color}]`);
  await page.check(`#form-new input[name=source][value=${source}]`);
  if (source === 'pgn') await page.fill('#new-pgn', text);
  if (source === 'fen') await page.fill('#new-fen', text);
  await page.click('#new-ok');
}

test('parcours complet @smoke : conseil → coup confirmé → réponse adverse réelle différente → rechargement', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await expect(page.locator('#engine-pill')).toHaveText('Moteur prêt', { timeout: 60000 });
  let s = await waitAdvice(page);
  expect(s.ply).toBe(0);
  expect(s.depth).toBeGreaterThan(5);
  await expect(page.locator('#turn-banner')).toContainText('À vous de jouer');
  await expect(page.locator('#advice')).toContainText('Coup conseillé par le moteur');
  await expect(page.locator('.board-arrows line.arrow-best')).toHaveCount(1);
  // La recommandation n'est pas jouée tant qu'elle n'est pas confirmée.
  expect((await snap(page)).ply).toBe(0);
  const best = s.best;
  await page.click('#btn-play-best');
  s = await snap(page);
  expect(s.ply).toBe(1);
  expect(s.moves.length).toBe(1);

  // Tour de l'adversaire : meilleure réponse calculée, puis saisie du coup réel.
  s = await waitAdvice(page);
  await expect(page.locator('#turn-banner')).toContainText('coup réellement joué');
  await expect(page.locator('#advice')).toContainText('Meilleure réponse adverse calculée');
  const engineReply = s.best;
  // On choisit volontairement un coup légal différent de la réponse calculée.
  const alt = await page.evaluate((avoid) => window.__coach.state.game.legalMoves().find((m) => m.lan !== avoid).lan, engineReply);
  await typeMove(page, alt);
  s = await snap(page);
  expect(s.ply).toBe(2);
  await expect(page.locator('#advice')).toContainText('L’adversaire a joué');
  s = await waitAdvice(page);
  expect(s.adviceFen).toBe(s.fen);
  expect(s.turn).toBe('w');

  // Rechargement : même partie, même position, nouveau calcul.
  const before = await snap(page);
  await page.reload();
  const after = await waitAdvice(page);
  expect(after.id).toBe(before.id);
  expect(after.fen).toBe(before.fen);
  expect(after.moves).toEqual(before.moves);
  expect(after.revision).toBe(before.revision);
  expect(after.adviceFen).toBe(after.fen);
  expect(best).toMatch(/^[a-h][1-8][a-h][1-8]/);
});

test('coup différent du conseil : on repart du vrai choix du joueur', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  const s = await waitAdvice(page);
  const other = s.best === 'g1f3' ? ['b1', 'c3'] : ['g1', 'f3'];
  await clickMove(page, ...other);
  await expect(page.locator('#advice')).toContainText('au lieu du coup conseillé');
  const s2 = await waitAdvice(page);
  expect(s2.moves[0]).toBe(other[0] === 'g1' ? 'Nf3' : 'Nc3');
  expect(s2.adviceFen).toBe(s2.fen);
});

test('glisser-déposer', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await waitAdvice(page);
  await page.locator('[data-sq="d2"] .piece').dragTo(page.locator('[data-sq="d4"]'));
  expect((await snap(page)).moves).toEqual(['d4']);
});

test('promotion : choix explicite de la pièce', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await waitAdvice(page);
  await newGame(page, { source: 'fen', text: '8/P6k/8/8/8/8/8/K7 w - - 0 1' });
  await waitAdvice(page);
  await clickMove(page, 'a7', 'a8');
  await expect(page.locator('.promo-box')).toBeVisible();
  expect((await snap(page)).ply).toBe(0);
  await page.click('.promo-choices button[data-p="n"]');
  expect((await snap(page)).moves).toEqual(['a8=N']);
  await expect(page.locator('#start-note')).toContainText('historique antérieur');
});

test('annulation : le coup disparaît, la révision augmente, nouveau calcul', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await waitAdvice(page);
  await typeMove(page, 'e4');
  const a = await snap(page);
  await page.click('#btn-undo');
  const b = await waitAdvice(page);
  expect(b.ply).toBe(0);
  expect(b.revision).toBeGreaterThan(a.revision);
  expect(b.adviceFen).toBe(b.fen);
});

test('réponse d’analyse tardive ignorée après changement de position', async ({ page }) => {
  await setup(page, { budget: 'approfondi' });
  await page.goto('./');
  await page.waitForFunction(() => window.__coach?.state.analysis.status === 'computing', null, { timeout: 60000 });
  // On joue pendant le calcul de 10 s : l'ancien résultat ne doit jamais s'afficher.
  await typeMove(page, 'e4');
  await page.evaluate(() => {
    window.__seen = [];
    const s = window.__coach.state;
    const iv = setInterval(() => {
      const a = s.analysis;
      if (a.advice) window.__seen.push({ adviceFen: a.advice.fen, fen: s.game.fen() });
    }, 50);
    window.__stopWatch = () => clearInterval(iv);
  });
  await typeMove(page, 'c5');
  await page.evaluate(() => window.__coach.state.settings.budget = 'rapide');
  await page.click('#btn-undo');
  await page.click('#btn-undo');
  await typeMove(page, 'd4');
  const s = await waitAdvice(page);
  const seen = await page.evaluate(() => { window.__stopWatch(); return window.__seen; });
  expect(seen.every((x) => x.adviceFen === x.fen)).toBe(true);
  expect(s.moves).toEqual(['d4']);
  expect(s.adviceFen).toBe(s.fen);
});

test('import PGN puis export PGN identique', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await waitAdvice(page);
  const pgn = '[Event "Test"]\n[White "Moi"]\n[Black "Adv"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *';
  await newGame(page, { source: 'pgn', text: pgn, color: 'b' });
  const s = await waitAdvice(page);
  expect(s.ply).toBe(8);
  await expect(page.locator('#turn-banner')).toContainText('Saisissez le coup réellement joué');
  await page.click('#btn-export');
  const out = await page.inputValue('#export-pgn');
  expect(out).toContain('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6');
  await page.click('#dlg-export button[value=close]');
});

test('répétition : nulle réclamable signalée, la partie continue', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await waitAdvice(page);
  for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) await typeMove(page, m);
  await waitAdvice(page);
  await expect(page.locator('#advice')).toContainText('Nulle réclamable');
  await expect(page.locator('#advice')).toContainText('triple répétition');
});

test('mat : fin de partie, plus aucun calcul', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await waitAdvice(page);
  for (const m of ['e4', 'e5', 'Fc4', 'Cc6', 'Dh5', 'Cf6', 'Dxf7']) await typeMove(page, m);
  await expect(page.locator('#turn-banner')).toContainText('Partie terminée : 1-0');
  await expect(page.locator('#advice')).toContainText('Plus aucun calcul');
  expect((await snap(page)).status).toBe('over');
});

test('navigation dans l’historique sans modifier la partie', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await waitAdvice(page);
  for (const m of ['e4', 'e5', 'Nf3']) await typeMove(page, m);
  await page.click('[data-nav=start]');
  await expect(page.locator('#view-banner')).toBeVisible();
  await expect(page.locator('#notation-input')).toBeDisabled();
  await page.click('#btn-live');
  expect((await snap(page)).ply).toBe(3);
});

test('panne du moteur affichée, aucun conseil fabriqué', async ({ page }) => {
  await setup(page);
  await page.route('**/engine/stockfish.wasm*', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('./');
  await expect(page.locator('#engine-pill')).toHaveText('Moteur en panne');
  await expect(page.locator('#advice')).toContainText('Moteur indisponible');
  await expect(page.locator('#advice')).not.toContainText('Coup conseillé');
  await expect(page.locator('.board-arrows line')).toHaveCount(0);
  // L'échiquier reste utilisable.
  await typeMove(page, 'e4');
  expect((await snap(page)).moves).toEqual(['e4']);
});

test('sans API Claude : explication gratuite calculée, Claude indiqué comme indisponible', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await waitAdvice(page);
  await expect(page.locator('#coach-pill')).toHaveText('Claude : indisponible');
  await expect(page.locator('#coach')).toContainText('calculée · gratuite');
  await expect(page.locator('#advice')).toContainText('Coup conseillé');
});

test('Claude (API simulée) : explication affichée, coup non calculé signalé, réponse tardive ignorée', async ({ page }) => {
  let delay = 0;
  const bodies = [];
  await setup(page, { apiUrl: 'https://api.test' }, 'code-secret-test');
  await page.route('https://api.test/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.headers().authorization !== 'Bearer code-secret-test') return route.fulfill({ status: 401, headers: cors, json: { error: 'x' } });
    if (req.url().endsWith('/v1/status')) return route.fulfill({ headers: cors, json: { ok: true, model: 'claude-test', usedToday: 0, dailyLimit: 100 } });
    const body = req.postDataJSON();
    bodies.push(body);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const best = body.engine.bestMove.fr;
    return route.fulfill({ headers: cors, json: { text: `**Pourquoi ce coup :** [${best}] est le coup calculé. Évitez [Rh8] et [Cxz9].`, model: 'claude-test', remainingToday: 99 } });
  });
  await page.goto('./');
  await expect(page.locator('#coach-pill')).toHaveText('Claude : prêt');
  await waitAdvice(page);
  await page.click('#btn-explain');
  await expect(page.locator('#coach .text')).toContainText('est le coup calculé');
  await expect(page.locator('#coach .mv.ok')).toHaveCount(1);
  await expect(page.locator('#coach')).toContainText('non vérifié');
  // Les données envoyées viennent du moteur et de l'état de partie.
  expect(bodies[0].engine.principalVariationSan.length).toBeGreaterThan(0);
  expect(bodies[0].fen).toBe((await snap(page)).fen);
  expect(JSON.stringify(bodies[0])).not.toContain('code-secret-test');

  // Réponse lente : on joue un coup avant qu'elle n'arrive ; elle doit être ignorée.
  delay = 2500;
  await page.click('#btn-explain');
  await expect(page.locator('#coach')).toContainText('Claude rédige');
  await page.click('#btn-play-best');
  await page.waitForTimeout(3500);
  await expect(page.locator('#coach')).not.toContainText('est le coup calculé');
});

test('téléphone @mobile : pas de défilement horizontal, saisie au toucher', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await waitAdvice(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.locator('#board').boundingBox();
  expect(box.width).toBeGreaterThan(300);
  await page.locator('[data-sq="e2"]').tap();
  await page.locator('[data-sq="e4"]').tap();
  expect((await snap(page)).moves).toEqual(['e4']);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('téléphone @mobile : jouer un coup ne fait pas défiler la page loin de l’échiquier', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await waitAdvice(page);
  // Plusieurs coups pour que la liste des coups doive défiler.
  for (const [a, b] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'b5'], ['a7', 'a6'], ['b5', 'a4'], ['g8', 'f6']]) {
    const before = await page.evaluate(() => window.scrollY);
    await page.locator(`[data-sq="${a}"]`).tap();
    await page.locator(`[data-sq="${b}"]`).tap();
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  }
  // « Confirmer » est sous l'échiquier : après le coup, l'échiquier revient à l'écran.
  await waitAdvice(page);
  await page.locator('#btn-play-best').scrollIntoViewIfNeeded();
  await page.locator('#btn-play-best').tap();
  await expect.poll(async () => (await page.locator('#turn-banner').boundingBox()).y, { timeout: 5000 }).toBeLessThan(200);
  await expect.poll(async () => (await page.locator('#turn-banner').boundingBox()).y).toBeGreaterThanOrEqual(0);
});

test('mode « Indice d’abord » : coup caché jusqu’à « Montrer le coup »', async ({ page }) => {
  await setup(page, { helpMode: 'indice' });
  await page.goto('./');
  const s = await waitAdvice(page);
  const advice = page.locator('#advice');
  await expect(advice).toContainText('À vous de trouver le meilleur coup');
  await expect(page.locator('.board-arrows line')).toHaveCount(0);
  await expect(page.locator('#optimal')).toContainText('Masqué');
  await expect(page.locator('#advice-mini')).toContainText('Mode indice');
  await page.click('#btn-hint1');
  await expect(advice).toContainText('Pièce à jouer');
  await expect(page.locator('.board-arrows line')).toHaveCount(0);
  await page.click('#btn-hint2');
  const from = s.best.slice(0, 2);
  await expect(page.locator(`[data-sq="${from}"]`)).toHaveClass(/hint/);
  await expect(page.locator('#coach')).toContainText('sans le coup', { timeout: 15000 });
  await expect(page.locator('#coach')).not.toContainText('Pourquoi ce coup');
  await page.click('#btn-hint3');
  await expect(advice).toContainText('Coup conseillé par le moteur');
  await expect(page.locator('.board-arrows line.arrow-best')).toHaveCount(1);
  // Coup suivant : le masquage reprend à zéro.
  await page.click('#btn-play-best');
  await waitAdvice(page);
  await page.fill('#notation-input', (await page.evaluate(() => window.__coach.state.analysis.advice.best.lan)));
  await page.press('#notation-input', 'Enter');
  await waitAdvice(page);
  await expect(advice).toContainText('À vous de trouver le meilleur coup');
});
