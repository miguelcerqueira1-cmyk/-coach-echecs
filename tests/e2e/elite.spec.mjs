// Jeu de données « Élite blitz/rapide » : généré hors ligne à partir des fixtures
// (tests/fixtures/elite : réponses Lichess réelles enregistrées + archive Chess.com synthétique),
// puis servi à la place de la branche donnees-elite (raw.githubusercontent.com) et/ou de
// data/elite.json. Aucune requête Lichess, Chess.com ou GitHub réelle.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Chess } from '../../site/vendor/chess.js';
import { lookupElite, splitText, recentInfo, ELITE_LIVE_URL, eliteHeaders } from '../../site/js/elite.js';
import { JOUEURS_LIVE_URL, searchPlayers, playerGames } from '../../site/js/joueurs.js';
import { sanFr } from '../../site/js/analysis.js';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const root = new URL('../..', import.meta.url).pathname;
let dir;
let dataset;
let joueurs;
const fenAfter = (san) => { const c = new Chess(); san.forEach((m) => c.move(m)); return c.fen(); };

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'elite-e2e-'));
  const out = join(dir, 'elite.json');
  execFileSync(process.execPath, ['scripts/elite.mjs', '--fixture', 'tests/fixtures/elite', '--top', '2', '--now', '2026-10-22T12:00:00Z', '--out', out, '--joueurs', join(dir, 'joueurs.json')], { cwd: root, stdio: 'pipe' });
  dataset = readFileSync(out, 'utf8');
  joueurs = readFileSync(join(dir, 'joueurs.json'), 'utf8');
});
test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

// elite : copie publiée avec le site (data/elite.json) ; live : branche donnees-elite (raw GitHub).
async function setup(page, { elite = 'ok', live = null, calls = [], index = 'live' } = {}) {
  await page.route(JOUEURS_LIVE_URL, (r) => (index === 'live'
    ? r.fulfill({ headers: CORS, contentType: 'application/json', body: joueurs })
    : r.fulfill({ status: 404, headers: CORS, body: '404: Not Found' })));
  await page.route('**/data/joueurs.json', (r) => r.fulfill({ status: 404, body: 'absent' }));
  await page.route(ELITE_LIVE_URL, (r) => {
    calls.push('live');
    return live ? r.fulfill({ headers: CORS, contentType: 'application/json', body: live }) : r.fulfill({ status: 404, headers: CORS, body: '404: Not Found' });
  });
  await page.route('**/data/elite.json', (r) => {
    calls.push('site');
    return elite === 'ok' ? r.fulfill({ contentType: 'application/json', body: dataset }) : r.fulfill({ status: 404, body: 'absent' });
  });
  // Aucune requête Lichess réelle : Cloud Eval « absent », pas de jeton pour l'explorateur.
  await page.route('https://lichess.org/api/cloud-eval**', (r) => r.fulfill({ status: 404, headers: CORS, json: { error: 'Not found' } }));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('coach-echecs:reglages:v1', JSON.stringify({ budget: 'rapide', autoExplain: false }));
      sessionStorage.setItem('e2e-init', '1');
    }
  });
}

const play = async (page, moves) => {
  for (const m of moves) {
    await page.fill('#notation-input', m);
    await page.press('#notation-input', 'Enter');
  }
};

test('Élite : bloc du Coup optimal, table, parties exemples ouvertes sur l’échiquier, position absente', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  const panel = page.locator('#optimal');
  const block = panel.locator('.elite-block');
  await expect(block).toContainText('Élite blitz/rapide');
  await expect(block).toContainText('pas une évaluation moteur');
  // Position de départ : avant la racine du répertoire → absente, sans chiffre inventé.
  await expect(block.locator('.elite-absent')).toContainText('Rien n’est extrapolé');
  await expect(block.locator('.mv-elite')).toHaveCount(0);

  await play(page, ['d4', 'd5', 'c4']);
  const data = JSON.parse(dataset);
  const x = lookupElite(data, fenAfter(['d4', 'd5', 'c4']));
  await expect(block.locator('.mv-elite')).toHaveText(sanFr(x.top.san));
  await expect(block).toContainText(`${x.total} parties`);
  await expect(block).toContainText(splitText(x.split));
  await expect(block).toContainText('Mis à jour');
  await expect(block).toContainText('copie publiée avec le site'); // branche absente : repli
  await expect(block).toContainText('récupération partielle'); // archive Chess.com manquante dans les fixtures

  await panel.locator('[data-src=elite]').click();
  await expect(panel.locator('.opt-table tbody tr')).toHaveCount(x.moves.length);
  await expect(panel.locator('.opt-table thead')).toContainText('Li / C.com');

  // Partie exemple : confirmation (partie en cours non vide), puis ouverture avec son lien d'origine.
  const g = x.games[0];
  page.once('dialog', (d) => d.accept());
  await block.locator('summary').click();
  await block.locator('[data-elite-game="0"]').click();
  await expect.poll(() => page.evaluate(() => window.__coach.state.game.record.headers.Site)).toBe(g.url);
  expect(await page.evaluate(() => window.__coach.state.game.ply)).toBe(g.san.length);
});

test('Élite : colonne Statistiques et arbre du Répertoire (présente, absente, partie exemple)', async ({ page }) => {
  await setup(page);
  await page.goto('./#/repertoire');
  const data = JSON.parse(dataset);
  const rep = JSON.parse(readFileSync(join(root, 'site/data/repertoire.json'), 'utf8'));
  const gd = rep.entries.filter((e) => e.rep === 'gd');
  const present = gd.find((e) => lookupElite(data, e.fenFinale).status === 'ok');
  const absent = gd.find((e) => lookupElite(data, e.fenFinale).status === 'absent');
  expect(present, 'au moins une fiche couverte par les fixtures').toBeTruthy();
  const x = lookupElite(data, present.fenFinale);
  const cell = page.locator(`tr[data-id="${present.id}"] [data-label="Statistiques"]`);
  await expect(cell.locator('.stat-elite')).toContainText(`${x.total} parties`);
  await expect(cell.locator('.stat-elite')).toContainText(`ensuite surtout ${sanFr(x.top.san)}`);
  await expect(cell.locator('.stat-elite')).toContainText(splitText(x.split));
  await expect(page.locator(`tr[data-id="${absent.id}"] [data-label="Statistiques"] .elite-absent`)).toContainText('position absente');

  // Arbre : source Élite à la racine du Gambit Dame.
  const tree = page.locator('#rep-tree');
  await tree.locator('[data-tree-src=elite]').click();
  await tree.locator('[data-tree-root]').click();
  const r = lookupElite(data, fenAfter(['d4', 'd5', 'c4']));
  await expect(tree.locator('.tree-table tbody tr')).toHaveCount(r.moves.length);
  await expect(tree).toContainText('pas une évaluation moteur');
  await tree.locator(`[data-child="${r.top.uci}"]`).click();
  await expect.poll(() => page.evaluate(() => window.__coach.repertoire.tree.path.length)).toBe(4);
  await tree.locator('[data-crumb="0"]').click();
  await expect(tree.locator('.elite-absent')).toContainText('il ne couvre que les positions du répertoire');

  // Partie exemple : la partie en cours est vide → ouverte sans confirmation sur le Moteur.
  await page.evaluate(() => window.__coach.repertoire.openTree(['d2d4', 'd7d5', 'c2c4']));
  const g = r.games[0];
  await tree.locator('[data-elite-game="0"]').click();
  await expect(page).toHaveURL(/#\/moteur/);
  await expect.poll(() => page.evaluate(() => window.__coach.state.game.ply)).toBe(g.san.length);
  expect(await page.evaluate(() => window.__coach.state.game.record.headers.White)).toBe(eliteHeaders(g).White);
});

test('Élite : jeu de données non publié, affiché comme tel', async ({ page }) => {
  await setup(page, { elite: 'absent' });
  await page.goto('./');
  await expect(page.locator('#optimal .elite-block')).toContainText('Jeu de données Élite non publié');
  await page.goto('./#/repertoire');
  await expect(page.locator('.rep-table tbody tr[data-id]').first().locator('[data-label="Statistiques"]')).toContainText('Élite : jeu de données non publié');
});

test('Élite : branche donnees-elite d’abord (fraîcheur affichée), puis repli sur le site', async ({ page }) => {
  const live = JSON.parse(dataset);
  live.meta.generatedAt = new Date(Date.now() - 12 * 60000).toISOString();
  const calls = [];
  await setup(page, { live: JSON.stringify(live), calls });
  await page.goto('./');
  const block = page.locator('#optimal .elite-block');
  await expect(block.locator('.elite-fresh')).toContainText('Mis à jour il y a 12 min');
  await expect(block.locator('.elite-fresh')).toContainText('mise à jour continue (branche donnees-elite)');
  expect(calls).toEqual(['live']); // copie du site non demandée
});

test('Élite : « Nouvelles parties » du Répertoire ouvrables sur l’échiquier', async ({ page }) => {
  await setup(page, { live: dataset });
  await page.goto('./#/repertoire');
  const data = JSON.parse(dataset);
  const recent = recentInfo(data);
  const live = page.locator('#rep-live');
  await expect(live.locator('.live-list li')).toHaveCount(recent.length);
  const first = live.locator('.live-list li').first();
  await expect(first).toContainText(recent[0].label);
  await expect(first).toContainText(recent[0].opening);
  await expect(first.locator(`a[href="${recent[0].url}"]`)).toHaveCount(1);
  await expect(live).toContainText('une partie apparaît au passage suivant sa fin');
  // Partie en cours vide : ouverte sans confirmation, avec le bon sens de l'échiquier.
  await first.locator('[data-live-game="0"]').click();
  await expect(page).toHaveURL(/#\/moteur/);
  await expect.poll(() => page.evaluate(() => window.__coach.state.game.ply)).toBe(recent[0].san.length);
  expect(await page.evaluate(() => window.__coach.state.game.record.headers.Site)).toBe(recent[0].url);
  expect(await page.evaluate(() => window.__coach.state.game.playerColor)).toBe(recent[0].color);
});

test('Répertoire : recherche par joueur (Carlsen), suggestions, partie ouverte avec ses en-têtes', async ({ page }) => {
  await setup(page, { live: dataset });
  await page.goto('./#/repertoire');
  const idx = JSON.parse(joueurs);
  const [mc] = searchPlayers(idx, 'carlsen');
  expect(mc.n).toBe('Magnus Carlsen');
  const games = playerGames(idx, mc);
  expect(games.length).toBeGreaterThan(1);
  const q = page.locator('[data-q]');
  await q.click();
  await expect(page.locator('#rep-joueurs option[value="Magnus Carlsen"]')).toHaveCount(1);
  await q.fill('CARLSEN');
  const card = page.locator('#rep-players .players-card').first();
  await expect(card.locator('h3')).toContainText('Magnus Carlsen');
  await expect(card).toContainText('joueur suivi');
  await expect(card).toContainText('DrNykterstein');
  await expect(card.locator('li.pg')).toHaveCount(Math.min(games.length, 30));
  await expect(card.locator('li.pg').first()).toContainText(games[0].opponent);
  // Partie en cours vide : ouverte sans confirmation, échiquier du côté du joueur cherché.
  await card.locator('[data-player-game]').first().click();
  await expect(page).toHaveURL(/#\/moteur/);
  const g = games[0];
  await expect.poll(() => page.evaluate(() => window.__coach.state.game.ply)).toBe(g.san.length);
  const h = await page.evaluate(() => window.__coach.state.game.record.headers);
  const want = eliteHeaders(g);
  for (const k of ['White', 'Black', 'WhiteElo', 'BlackElo', 'Event', 'Site', 'Date', 'Result']) expect(h[k] ?? '').toBe(want[k]);
  expect(await page.evaluate(() => window.__coach.state.game.playerColor)).toBe(g.side);
  await expect(page.locator('#game-info')).toContainText(want.White);
});

test('Répertoire : joueur absent des données (message clair) ; une fiche trouvée reste affichée', async ({ page }) => {
  await setup(page, { live: dataset });
  await page.goto('./#/repertoire');
  await page.locator('[data-q]').fill('Kasparov');
  const none = page.locator('#rep-players .players-none');
  await expect(none).toContainText('Aucun joueur « Kasparov » dans les données collectées');
  await expect(none).toContainText('top 50 blitz et rapide');
  await expect(none).toContainText('Magnus Carlsen');
  await page.click('[data-view=ck]');
  await page.locator('[data-q]').fill('Karpov');
  await expect(page.locator('tr[data-id="ck-karpov"]')).toBeVisible();
  await expect(page.locator('#rep-players .players-none')).toHaveCount(0);
});

test('recherche d’un joueur au clavier sur téléphone @mobile : la saisie reste, la page répond', async ({ page }) => {
  await setup(page, { live: dataset });
  await page.goto('./#/repertoire');
  const q = page.locator('[data-q]');
  await expect(page.locator('.rep-table tbody tr[data-id]').first()).toBeVisible();
  await q.click();
  await page.evaluate(() => { window.__qEl = document.querySelector('[data-q]'); });
  await page.keyboard.type('carlsen', { delay: 80 });
  await expect(page.locator('#rep-players .players-card h3').first()).toContainText('Magnus Carlsen');
  // Même élément de saisie (jamais recréé pendant la frappe), texte intact, focus conservé.
  expect(await page.evaluate(() => window.__qEl === document.querySelector('[data-q]') && document.activeElement === window.__qEl)).toBe(true);
  await expect(q).toHaveValue('carlsen');
  // Suggestions courtes (une longue liste fige Safari iPhone).
  expect(await page.locator('#rep-joueurs option').count()).toBeLessThanOrEqual(12);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('n', { delay: 80 });
  await expect(q).toHaveValue('carlsen');
  // Liste lisible sur téléphone : aucune carte ne dépasse de l'écran.
  expect(await page.evaluate(() => [...document.querySelectorAll('#rep-players li.pg')].every((li) => li.getBoundingClientRect().right <= innerWidth + 1))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  // La page répond : on peut encore changer d'ouverture.
  await page.click('[data-view=ck]');
  await expect(page.locator('[data-view=ck]')).toHaveAttribute('aria-pressed', 'true');
});
