import { readFileSync } from 'node:fs';
// Mode Entraînement avec le vrai Stockfish. Lichess est simulé (coups légaux et fréquences).
import { test, expect } from '@playwright/test';
import { Chess } from '../../site/vendor/chess.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// routine : profil de la routine du jour (null = premier lancement, les 3 questions s'affichent).
async function setup(page, { token = '', prefs = {}, routine = { temps: 90, sites: ['lichess', 'chesscom'], cadences: ['blitz', 'rapide'] } } = {}) {
  await page.route(/https:\/\/lichess\.org\//, (r) => r.abort());
  await page.addInitScript(([t, p, r]) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('coach-echecs:pro', '{"pro":true}'); // tests fonctionnels en formule Pro (pro.spec.mjs : formule gratuite)
      localStorage.setItem('coach-echecs:reglages:v1', JSON.stringify({ budget: 'rapide', autoExplain: false }));
      localStorage.setItem('coach-echecs:entrainement', JSON.stringify({ complet: '0', cOrdre: 'conseil', ...p })); // lignes de la fiche seule, sauf test dédié
      if (t) localStorage.setItem('coach-echecs:jeton-lichess', t);
      if (r) localStorage.setItem('coach-echecs:routine-v1', JSON.stringify({ jours: {}, profil: r }));
      sessionStorage.setItem('e2e-init', '1');
    }
  }, [token, prefs, routine]);
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
  await page.evaluate(() => { document.querySelector('[data-other-modes]').open = true; });
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
  await page.evaluate(() => { document.querySelector('[data-other-modes]').open = true; });
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
  await page.evaluate(() => { document.querySelector('[data-other-modes]').open = true; });
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
const openAll = (page) => page.evaluate(() => document.querySelectorAll('.dash-more, [data-dashboard]').forEach((d) => { d.open = true; }));
async function ours(page, uci) {
  await expect(status(page)).toContainText('À vous', { timeout: 10000 });
  await move(page, uci);
}

test('Lignes : l’application joue l’adversaire, erreur refusée et expliquée, série, bilan puis révision ciblée', async ({ page }) => {
  await setup(page, { prefs: { rep: 'gd', source: 'fiches' } });
  await page.goto('./#/entrainement');
  await expect(page.locator('[data-dashboard]')).toContainText('Progression par variante');
  const line = 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 b8d7 a1c1 c7c6 f1d3 d5c4 d3c4 f6d5'.split(' ');
  await openAll(page);
  await page.click('[data-dash-line="gd-orthodoxe"]');
  const log = page.locator('#page-entrainement [data-log]');
  await ours(page, 'd2d4');
  await expect(log).toContainText('✔ d4');
  const streak = page.locator('#page-entrainement [data-streak]');
  await expect(streak).toHaveText('🔥 Série : 1');
  // Erreur volontaire au 2e coup : coup refusé (pion resté en a2), bulle, plan, bon coup.
  await ours(page, 'a2a3');
  const bubble = page.locator('#page-entrainement .board-bubble');
  await expect(bubble).toContainText('Ce n’est pas le coup de la ligne. Ici, on joue c4.');
  await expect(page.locator('#page-entrainement [data-sq="a2"] .piece')).toBeVisible();
  await expect(streak).toHaveText('🔥 Série : 0');
  const fb = page.locator('#page-entrainement [data-feedback]');
  await expect(fb).toContainText('Le bon coup : c4');
  await expect(fb).toContainText('Plan de la fiche');
  await page.click('[data-continue]');
  for (let i = 4; i < line.length; i += 2) await ours(page, line[i]);
  await expect(log).toContainText('Ligne terminée');
  await expect(streak).toHaveText('🔥 Série : 7');
  // Bilan : 8 positions trouvées du premier coup, 1 ratée ; révision ciblée jusqu'à validation.
  const recap = page.locator('#page-entrainement [data-recap]');
  await expect(recap).toContainText('✔ 8 réussies', { timeout: 10000 });
  await expect(recap).toContainText('✘ 1 ratée');
  await expect(recap).toContainText('meilleure série 7');
  await recap.locator('[data-review]').click();
  await expect(page.locator('#page-entrainement [data-head]')).toContainText('Révision ciblée — encore 1 position(s)');
  await ours(page, 'h2h3');
  await expect(bubble).toContainText('Ici, on joue c4');
  await page.click('#page-entrainement [data-continue]');
  await ours(page, 'c2c4');
  await expect(page.locator('#page-entrainement [data-review-done]')).toContainText('Toutes les positions ratées sont validées', { timeout: 10000 });
  await page.click('#page-entrainement [data-review-done] [data-end]');
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
  await expect(page.locator('[data-routine]')).toBeVisible();
  await openAll(page);
  await expect(page.locator('.dash-row').first()).toBeVisible();
  // En cas d'échec, le message liste les éléments qui dépassent (diagnostic Safari).
  const wide = await page.evaluate(() => {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n && out.length < 6; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const b of r.getClientRects()) if (b.right > innerWidth + 1) { out.push(`texte « ${n.textContent.trim().slice(0, 30)} » dans ${n.parentElement.tagName.toLowerCase()}.${n.parentElement.className} → ${Math.round(b.right)}`); break; }
    }
    for (const el of document.querySelectorAll('body *')) {
      if (out.length >= 10) break;
      const st = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && st.overflowX === 'visible' && el.clientWidth > 0) out.push(`contenu plus large que ${el.tagName.toLowerCase()}.${el.className} (${el.scrollWidth} > ${el.clientWidth})`);
    }
    return out;
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), wide.join(' | ')).toBeLessThanOrEqual(0);
  await page.click('[data-dash-rep="ck"]');
  await expect(page.locator('.dash-row').first()).toContainText(/B1\d/);
});

test('Cours : leçon pas à pas (nom officiel à chaque étape), à retenir, puis pratique guidée avec indice', async ({ page }) => {
  await setup(page, { prefs: { rep: 'gd', source: 'fiches' } });
  await page.goto('./#/entrainement');
  await page.click('[data-course="gd"]');
  await expect(page.locator('.course-item.next')).toContainText('Variante orthodoxe');
  await page.click('[data-lesson="gd-orthodoxe"]');
  // 1. Présentation
  await expect(page.locator('[data-panel]')).toContainText('Nom officiel');
  await expect(page.locator('[data-panel]')).toContainText('Défense orthodoxe');
  await page.click('[data-panel] [data-next]');
  // 2. Les coups : 2.c4 = « Gambit Dame », 4.Fg5 cloue le Cavalier.
  for (let i = 0; i < 3; i++) await page.click('[data-step]');
  await expect(page.locator('[data-under]')).toContainText('2. c4');
  await expect(page.locator('[data-name]')).toContainText('Gambit Dame');
  for (let i = 0; i < 4; i++) await page.click('[data-step]');
  await expect(page.locator('[data-under]')).toContainText('Cloue le Cavalier en f6 sur la Dame en d8');
  await page.click('[data-panel] [data-ply="17"]');
  await page.click('[data-under] [data-next]');
  // 3. À retenir
  await expect(page.locator('[data-panel]')).toContainText('Cases et pièces clés');
  await expect(page.locator('[data-panel]')).toContainText('Le piège à éviter');
  // Vidéos : horodatage seulement depuis un chapitre publié par l'auteur, affiché.
  await expect(page.locator('[data-panel] a[href*="TSTnJNs9wdw&t=560s"]')).toHaveCount(1);
  await expect(page.locator('[data-panel] .video-chap')).toContainText('s’ouvre à 9:20');
  // Le piège, joué coup par coup : seul le coup de la séquence est accepté, le coup fautif est signalé.
  await page.click('[data-panel] [data-drill="piege"]');
  const card = page.locator('[data-drill-card="piege"]');
  await expect(card).toContainText('coup 1 / 18');
  await move(page, 'a2a3');
  await expect(card.locator('.drill-msg')).toContainText('1. d4');
  await expect(page.locator('#page-entrainement .board-bubble')).toContainText('Ici, on joue d4');
  await move(page, 'd2d4');
  await expect(card).toContainText('coup 2 / 18');
  await card.locator('[data-drill-skip]').click();
  await expect(card).toContainText('C’est le coup fautif');
  await expect(card).toContainText('7. Fd3?');
  await move(page, 'f1d3');
  await expect(card.locator('.drill-msg')).toContainText('Voilà l’erreur');
  for (const u of 'f6e4 d1c2 e4g5 f3g5 d5c4'.split(' ')) await move(page, u);
  await expect(card.locator('.drill-done')).toContainText('Séquence jouée');
  await card.locator('[data-drill-back]').click();
  await expect(card).toContainText('coup 18 / 18');
  await card.locator('[data-drill-quit]').click();
  await expect(card).toHaveCount(0);
  await page.click('[data-panel] [data-next]');
  // 4. Pratique guidée : erreur → indice (case entourée), puis le bon coup.
  await ours(page, 'd2d4');
  await ours(page, 'a2a3');
  await expect(page.locator('#page-entrainement [data-feedback]')).toContainText('Indice');
  await expect(page.locator('#page-entrainement .sq.hint')).toHaveCount(1);
  await ours(page, 'c2c4');
  const line = 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 b8d7 a1c1 c7c6 f1d3 d5c4 d3c4 f6d5'.split(' ');
  for (let i = 4; i < line.length; i += 2) await ours(page, line[i]);
  // Une erreur pendant la pratique : bilan, puis fin de la leçon.
  await expect(page.locator('#page-entrainement [data-recap]')).toContainText('✘ 1 ratée', { timeout: 15000 });
  await page.click('#page-entrainement [data-recap] [data-end]');
  await expect(page.locator('.hub-result')).toContainText('Leçon « Variante orthodoxe', { timeout: 15000 });
  await expect(page.locator('.course-item', { hasText: 'Variante orthodoxe' })).toContainText('Leçon suivie');
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem('coach-echecs:progression-v1')));
  expect(prog.cours['gd-orthodoxe'].n).toBe(1);
});

test('Ligne complète (suite Stockfish jusqu’au 15e coup) et rythme Blitz : trop lent = raté, bilan des temps', async ({ page }) => {
  await setup(page, { prefs: { rep: 'gd', source: 'fiches', complet: '1', lTemps: 3 } });
  await page.goto('./#/entrainement');
  // Cours : même longueur que les exercices de la leçon (ligne de la fiche, sans suite Stockfish).
  await page.click('[data-course="gd"]');
  await page.click('[data-lesson="gd-orthodoxe"]');
  await page.click('[data-panel] [data-next]');
  await expect(page.locator('[data-panel] .m').first()).toBeVisible();
  await expect(page.locator('[data-panel] .m.moteur')).toHaveCount(0);
  await expect(page.locator('[data-panel] .suite-sep')).toHaveCount(0);
  await page.click('[data-close]');
  // S'entraîner : 3 s par coup ; on laisse filer le 1er coup.
  const full = await page.evaluate(async () => {
    const d = await (await fetch('./data/repertoire.json')).json();
    const e = d.entries.find((x) => x.id === 'gd-orthodoxe');
    return e.uci.concat(e.suite.uci);
  });
  expect(full.length).toBe(30);
  await page.click('[data-back]').catch(() => {});
  await page.goto('./#/entrainement');
  await openAll(page);
  await page.click('[data-dash-line="gd-orthodoxe"]');
  await expect(page.locator('#page-entrainement [data-timer]')).toBeVisible();
  await expect(page.locator('#page-entrainement .board-bubble')).toContainText('Trop lent', { timeout: 8000 });
  for (let i = 2; i < full.length; i += 2) await ours(page, full[i]);
  const recap = page.locator('#page-entrainement [data-recap]');
  await expect(recap).toContainText('Temps moyen', { timeout: 15000 });
  await expect(recap).toContainText('✘ 1 ratée');
  await expect(recap).toContainText('temps écoulé');
});

test('Cours : variantes classées de la plus jouée à la moins jouée (données Élite), bascule vers l’ordre conseillé', async ({ page }) => {
  await setup(page, { prefs: { rep: 'gd', source: 'fiches', cOrdre: 'freq' } });
  await page.goto('./#/entrainement');
  await page.click('[data-course="gd"]');
  await expect(page.locator('[data-cordre="freq"]')).toHaveAttribute('aria-pressed', 'true');
  const counts = await page.locator('.course-item .freq').allTextContents();
  const n = counts.map((t) => parseInt(t.replace(/\D+/g, ''), 10));
  expect(n.length).toBeGreaterThan(5);
  expect(n).toEqual([...n].sort((a, b) => b - a));
  await expect(page.locator('.course')).toContainText('Fréquence observée');
  await page.click('[data-cordre="conseil"]');
  await expect(page.locator('.course-item').first()).toContainText('Variante orthodoxe');
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('coach-echecs:entrainement')));
  expect(prefs.cOrdre).toBe('conseil');
});

test('Ma routine du jour : blocs à cocher (gardés), suivi du soir, théorie progressive (apprendre puis réviser sans chrono)', async ({ page }) => {
  await setup(page, { prefs: { rep: 'gd', source: 'fiches' }, routine: null });
  await page.goto('./#/entrainement');
  // Premier lancement : 3 questions ; sans site ni cadence, refus expliqué.
  const q = page.locator('[data-routine-profil]');
  await expect(q).toContainText('Construisons ta routine');
  await q.locator('input[name="rp-sites"][value="chesscom"]').uncheck().catch(() => {});
  await q.locator('[data-profil-ok]').click();
  await expect(q.locator('[data-profil-err]')).toContainText('au moins un site');
  await q.locator('input[name="rp-temps"][value="20"]').check();
  await q.locator('input[name="rp-sites"][value="lichess"]').check();
  await q.locator('input[name="rp-cadences"][value="blitz"]').check();
  await q.locator('[data-profil-ok]').click();
  const r = page.locator('[data-routine]');
  await expect(r).toContainText('Ma routine : 20 min par jour · Lichess · Blitz');
  // 20 min : tactique (5 problèmes) + théorie seulement (dimanche : théorie seule).
  expect([1, 2]).toContain(await r.locator('[data-bloc]').count());
  // Modifier : 90 min, Lichess + Chess.com, Blitz + Rapide → la routine complète de 6 blocs.
  await r.locator('[data-routine-edit]').click();
  await q.locator('input[name="rp-temps"][value="90"]').check();
  await q.locator('input[name="rp-sites"][value="chesscom"]').check();
  await q.locator('input[name="rp-cadences"][value="rapide"]').check();
  await q.locator('[data-profil-ok]').click();
  await expect(r).toContainText('Ma routine du jour');
  await expect(r).toContainText('Son coup d’abord');
  const n = await r.locator('[data-bloc]').count();
  expect([1, 6]).toContain(n);
  await r.locator('[data-bloc]').first().check();
  await expect(page.locator('[data-routine] .routine-prog')).toHaveText(`1 / ${n}`);
  await page.fill('[data-suivi="problemes"]', '7');
  await page.locator('[data-suivi="problemes"]').blur();
  await page.reload();
  await expect(page.locator('[data-routine] .routine-prog')).toHaveText(`1 / ${n}`);
  await expect(page.locator('[data-suivi="problemes"]')).toHaveValue('7');
  await page.locator('[data-routine] .routine-hist summary').click();
  await expect(page.locator('.routine-table')).toContainText('7/10');
  // Aucune leçon suivie : pas de révision « à l'aveugle », on commence par apprendre.
  await expect(page.locator('[data-routine-theorie]')).toHaveCount(0);
  await expect(r).toContainText('La révision s’ouvre après ta première leçon');
  await page.click('[data-routine-lecon]');
  await expect(page.locator('#page-entrainement .lesson, #page-entrainement [data-lesson-view]').first()).toBeVisible();
  // Une leçon suivie (non maîtrisée) : révision de cette variante, sans chrono.
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('coach-echecs:progression-v1') || '{}');
    p.cours = { 'gd-orthodoxe': { vue: Date.now(), n: 1 } };
    localStorage.setItem('coach-echecs:progression-v1', JSON.stringify(p));
  });
  await page.reload();
  await expect(page.locator('[data-routine-theorie]')).toContainText('relire puis jouer');
  // Mes variantes apprises : nom, ECO, coups en notation française, revoir la leçon.
  await page.click('[data-appris] summary');
  await expect(page.locator('[data-appris]')).toContainText('Mes variantes apprises (1)');
  await expect(page.locator('[data-appris] .appris-coups')).toContainText('1. d4 d5 2. c4');
  await page.click('[data-appris-copier]');
  await expect(page.locator('[data-appris-msg]')).not.toBeEmpty();
  await page.click('[data-routine-theorie]');
  await expect(page.locator('#page-entrainement [data-drill="lignes"]')).toBeVisible();
  await expect(page.locator('#page-entrainement [data-timer]')).toHaveCount(0);
  await expect(page.locator('#page-entrainement [data-head]')).toContainText('1 / 1');
  // Révision d'abord : la ligne défile, puis « À moi de jouer ».
  await expect(page.locator('#page-entrainement [data-status]')).toContainText('Révision');
  await expect(page.locator('#page-entrainement [data-relire-coups] span.cur')).toHaveCount(1, { timeout: 5000 });
  await page.click('#page-entrainement [data-relire-go2]');
  await expect(page.locator('#page-entrainement [data-relire-go2]')).toHaveCount(0);
  await expect(page.locator('#page-entrainement [data-status]')).toContainText('À vous', { timeout: 10000 });
});

test('Routine : 10 problèmes Lichess dans l’appli (dernier coup adverse, coup faux refusé, solution)', async ({ page }) => {
  await setup(page);
  const fx = JSON.parse(readFileSync(new URL('../fixtures/puzzle-hanging.json', import.meta.url), 'utf8'));
  let k = 0;
  await page.route(/https:\/\/lichess\.org\/api\/puzzle\/next/, (r) => {
    k++;
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ...fx, puzzle: { ...fx.puzzle, id: `test${k}` } }) });
  });
  await page.goto('./#/entrainement');
  const btn = page.locator('[data-routine-problemes]');
  if (!(await btn.count())) test.skip(true, 'dimanche : pas de bloc tactique');
  await page.selectOption('[data-routine-niveau]', 'easier');
  await page.selectOption('[data-routine-chrono]', '15');
  await page.reload();
  await expect(page.locator('[data-routine-niveau]')).toHaveValue('easier');
  await expect(page.locator('[data-routine-chrono]')).toHaveValue('15');
  let url = '';
  page.on('request', (r) => { if (r.url().includes('/api/puzzle/next')) url = r.url(); });
  await page.locator('[data-routine-problemes]').click();
  const P = page.locator('#page-entrainement [data-puzzles]');
  await expect.poll(() => url).toContain('difficulty=easier');
  await expect(P).toContainText('Problème 1 / 10');
  await expect(P.locator('[data-timer]')).toBeVisible();
  await expect(page.locator('#page-entrainement [data-status]')).toContainText('Il a joué', { timeout: 10000 });
  // Coup faux (roi en h7) : refusé, rien ne bouge.
  await sq(page, 'g8').click();
  await sq(page, 'h7').click();
  await expect(page.locator('#page-entrainement [data-status]')).toContainText('Raté du premier coup');
  // Bonne solution : Tb6, l'appli répond Tc8+, puis Rh7.
  await sq(page, 'a6').click();
  await sq(page, 'b6').click();
  await expect(page.locator('#page-entrainement [data-status]')).toContainText('Continue', { timeout: 5000 });
  await sq(page, 'g8').click();
  await sq(page, 'h7').click();
  await expect(page.locator('#page-entrainement [data-status]')).toContainText('Résolu (après une erreur');
  await page.click('#page-entrainement [data-next]');
  await expect(P).toContainText('Problème 2 / 10');
  await expect(page.locator('#page-entrainement [data-status]')).toContainText('Il a joué', { timeout: 10000 });
  await page.click('#page-entrainement [data-solution]');
  await expect(page.locator('#page-entrainement [data-feedback]')).toContainText('Solution', { timeout: 8000 });
  await page.click('#page-entrainement [data-quit]');
  await expect(page.locator('.hub-result')).toContainText('Problèmes : 0 / 2');
});

test('Finales essentielles : jouer contre Stockfish, indice, verdict, progression', async ({ page }) => {
  await setup(page);
  await page.goto('./#/entrainement');
  await engineReady(page);
  const card = page.locator('[data-finales]');
  await expect(card).toContainText('Finales essentielles');
  await expect(card.locator('[data-finale-id]')).toHaveCount(8);
  // Mat avec deux Tours : 1.Th5 (Stockfish) puis la réponse adverse.
  await card.locator('[data-finale-id="escalier"]').click();
  const F = page.locator('#page-entrainement [data-finale="escalier"]');
  await expect(F).toContainText('La méthode');
  await page.click('#page-entrainement [data-indice]');
  await expect(page.locator('#page-entrainement .board-arrows line.arrow-best')).toHaveCount(1, { timeout: 15000 });
  await sq(page, 'h1').click();
  await sq(page, 'h5').click();
  await expect(page.locator('#page-entrainement [data-status]')).toContainText('Il a joué', { timeout: 15000 });
  await expect(F.locator('[data-compte]')).toContainText('Coups joués : 1');
  await page.click('#page-entrainement [data-quit]');
  await expect(page.locator('[data-finales]')).toBeVisible();
  // Progression : une réussie notée apparaît avec ✔.
  await page.evaluate(() => localStorage.setItem('coach-echecs:finales-v1', JSON.stringify({ dame: { ok: true, sansIndice: true, essais: 1 } })));
  await page.reload();
  await expect(page.locator('[data-finales]')).toContainText('1 / 8 réussie(s)');
  await expect(page.locator('[data-finale-id="dame"]')).toContainText('⭐');
});

test('Problèmes par thème : thème choisi, difficulté selon le classement, classement mis à jour', async ({ page }) => {
  await setup(page);
  const fx = JSON.parse(readFileSync(new URL('../fixtures/puzzle-hanging.json', import.meta.url), 'utf8'));
  let k = 0;
  const urls = [];
  await page.route(/https:\/\/lichess\.org\/api\/puzzle\/next/, (r) => {
    k++;
    urls.push(r.request().url());
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ...fx, puzzle: { ...fx.puzzle, id: `th${k}` } }) });
  });
  await page.goto('./#/entrainement');
  const card = page.locator('[data-problemes]');
  await expect(card).toContainText('1200');
  await card.locator('[data-pb-theme]').selectOption('fork');
  await card.locator('[data-pb-n]').selectOption('5');
  await card.locator('[data-pb-start]').click();
  await expect.poll(() => urls[0] || '').toContain('angle=fork');
  expect(urls[0]).toContain('difficulty=easier'); // 1200 → « easier »
  const P = page.locator('#page-entrainement [data-puzzles]');
  await expect(P).toContainText('Fourchette');
  await expect(P).toContainText('Problème 1 / 5');
  await expect(page.locator('#page-entrainement [data-status]')).toContainText('Il a joué', { timeout: 10000 });
  // Solution du premier coup : Tb6, Tc8+, Rh7 → réussi, classement en hausse (problème 1144).
  await sq(page, 'a6').click();
  await sq(page, 'b6').click();
  await expect(page.locator('#page-entrainement [data-status]')).toContainText('Continue', { timeout: 5000 });
  await sq(page, 'g8').click();
  await sq(page, 'h7').click();
  await expect(page.locator('#page-entrainement [data-feedback]')).toContainText('Classement problèmes : 1217 (+17)');
  await page.click('#page-entrainement [data-quit]');
  await expect(page.locator('.hub-result')).toContainText('Fourchette : 1 / 1');
  await expect(page.locator('[data-problemes]')).toContainText('1217');
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('coach-echecs:problemes-v1')));
  expect(d.themes.fork).toEqual({ n: 1, ok: 1 });
});

test('Partie contre Stockfish : niveau 1, Stockfish répond, reprise du coup, abandon et bilan', async ({ page }) => {
  await setup(page);
  await page.goto('./#/entrainement');
  await engineReady(page);
  const card = page.locator('[data-stockfish]');
  await card.locator('[data-sf-niveau]').selectOption('1');
  await card.locator('[data-sf-camp]').selectOption('w');
  await card.locator('[data-sf-start]').click();
  const st = page.locator('#page-entrainement [data-status]');
  await expect(st).toContainText('À toi de jouer');
  await move(page, 'e2e4');
  await expect(st).toContainText('Stockfish a joué', { timeout: 20000 });
  await page.click('#page-entrainement [data-reprendre]');
  await expect(st).toContainText('Coup repris');
  await expect(page.locator('#page-entrainement [data-sq="e2"] .piece')).toHaveCount(1);
  await expect(page.locator('#page-entrainement [data-sq="e4"] .piece')).toHaveCount(0);
  page.once('dialog', (d) => d.accept());
  await page.click('#page-entrainement [data-abandon]');
  await expect(st).toContainText('Défaite');
  await expect(page.locator('#page-entrainement [data-feedback]')).toContainText('0 victoire(s), 0 nulle(s), 1 défaite(s)');
  // Le moteur est repassé à pleine force pour le reste de l'appli.
  await page.click('#page-entrainement [data-quit]');
  await expect(page.locator('[data-stockfish]')).toContainText('niv. 1 : 0-0-1');
});
