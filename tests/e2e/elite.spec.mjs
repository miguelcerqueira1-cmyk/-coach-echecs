// Jeu de données « Élite blitz/rapide » : généré hors ligne à partir des fixtures
// (tests/fixtures/elite : réponses Lichess réelles enregistrées + archive Chess.com synthétique),
// puis servi à la place de data/elite.json. Aucune requête Lichess/Chess.com réelle.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Chess } from '../../site/vendor/chess.js';
import { lookupElite, splitText } from '../../site/js/elite.js';
import { sanFr } from '../../site/js/analysis.js';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const root = new URL('../..', import.meta.url).pathname;
let dir;
let dataset;
const fenAfter = (san) => { const c = new Chess(); san.forEach((m) => c.move(m)); return c.fen(); };

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'elite-e2e-'));
  const out = join(dir, 'elite.json');
  execFileSync(process.execPath, ['scripts/elite.mjs', '--fixture', 'tests/fixtures/elite', '--top', '2', '--out', out], { cwd: root, stdio: 'pipe' });
  dataset = readFileSync(out, 'utf8');
});
test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function setup(page, { elite = 'ok' } = {}) {
  await page.route('**/data/elite.json', (r) => (elite === 'ok'
    ? r.fulfill({ contentType: 'application/json', body: dataset })
    : r.fulfill({ status: 404, body: 'absent' })));
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
  await expect(block).toContainText('Données du');
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
  await expect(tree.locator('.elite-absent')).toContainText('il ne couvre que les positions après 1.d4 d5 2.c4');

  // Partie exemple : la partie en cours est vide → ouverte sans confirmation sur le Moteur.
  await page.evaluate(() => window.__coach.repertoire.openTree(['d2d4', 'd7d5', 'c2c4']));
  const g = r.games[0];
  await tree.locator('[data-elite-game="0"]').click();
  await expect(page).toHaveURL(/#\/moteur/);
  await expect.poll(() => page.evaluate(() => window.__coach.state.game.ply)).toBe(g.san.length);
  expect(await page.evaluate(() => window.__coach.state.game.record.headers.White)).toBe(`${g.w} (${g.wr})`);
});

test('Élite : jeu de données non publié, affiché comme tel', async ({ page }) => {
  await setup(page, { elite: 'absent' });
  await page.goto('./');
  await expect(page.locator('#optimal .elite-block')).toContainText('Jeu de données Élite non publié');
  await page.goto('./#/repertoire');
  await expect(page.locator('.rep-table tbody tr[data-id]').first().locator('[data-label="Statistiques"]')).toContainText('Élite : jeu de données non publié');
});
