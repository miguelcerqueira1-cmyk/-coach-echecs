// Site grand public : page d'accueil de première visite, choix des ouvertures en 4 étapes,
// répertoires « bientôt », changement de choix dans ⚙, utilisateur existant (Gambit Dame + Caro-Kann).
import { test, expect } from '@playwright/test';

const KEY = 'coach-echecs:mon-repertoire';

// existant : données d'avant le passage grand public (réglages enregistrés) ; sinon visiteur neuf.
async function setup(page, { existant = false } = {}) {
  await page.route(/https:\/\/(lichess\.org|explorer\.lichess\.org|raw\.githubusercontent\.com)\//, (r) => r.abort());
  await page.addInitScript((ex) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      if (ex) localStorage.setItem('coach-echecs:reglages:v1', JSON.stringify({ budget: 'rapide', autoExplain: false }));
      sessionStorage.setItem('e2e-init', '1');
    }
  }, existant);
}

const choisir = async (page, ids) => {
  for (const id of ids) await page.click(`#page-ouvertures [data-rep="${id}"]`);
};

test('première visite : accueil, choix en 4 étapes (Londres, Sicilienne, Indienne du Roi), ouvertures « bientôt »', async ({ page }) => {
  await setup(page);
  // Données servies sans les fiches de l'Indienne du Roi : couvre l'affichage « bientôt »
  // d'un répertoire sans contenu (tous les répertoires réels en ont désormais).
  await page.route('**/data/repertoire.json', async (route) => {
    const res = await route.fetch();
    const data = await res.json();
    data.entries = data.entries.filter((e) => e.rep !== 'indienne-roi');
    await route.fulfill({ response: res, json: data });
  });
  await page.goto('./');
  const acc = page.locator('#page-accueil');
  await expect(acc).toBeVisible();
  await expect(page).toHaveURL(/#\/accueil$/);
  await expect(acc).toContainText('L’encyclopédie interactive et l’arme fatale');
  await expect(acc.locator('.acc-opening', { hasText: 'Gambit Dame' }).first()).toContainText('31 fiches');
  await expect(acc.locator('.acc-opening', { hasText: 'Défense indienne du Roi' })).toContainText('bientôt');
  await expect(acc).toContainText('29 €');
  await acc.locator('[data-acc-choix]').click();
  const ch = page.locator('#page-ouvertures');
  await expect(ch.locator('[data-choix-q]')).toHaveText('Avec les Blancs, je joue…');
  // Rien choisi : la validation finale est refusée.
  for (let i = 0; i < 3; i++) await ch.locator('[data-choix-next]').click();
  await ch.locator('[data-choix-next]').click();
  await expect(ch.locator('[data-choix-err]')).toHaveText('Choisissez au moins une ouverture.');
  for (let i = 0; i < 3; i++) await ch.locator('[data-choix-prev]').click();
  await choisir(page, ['londres']);
  await expect(ch.locator('[data-rep="londres"]')).toHaveAttribute('aria-pressed', 'true');
  await ch.locator('[data-choix-next]').click();
  await expect(ch.locator('[data-choix-q]')).toHaveText('Avec les Noirs, contre 1.e4, je joue…');
  await choisir(page, ['sicilienne']);
  await ch.locator('[data-choix-next]').click();
  await choisir(page, ['indienne-roi']);
  await ch.locator('[data-choix-next]').click();
  await expect(ch.locator('[data-choix-q]')).toHaveText('Avec les Noirs, contre 1.c4 ou 1.Cf3, je joue…');
  await expect(ch.locator('.choix-recap')).toContainText('Système de Londres · Défense sicilienne · Défense indienne du Roi');
  await ch.locator('[data-choix-next]').click();
  // Accueil unique : où et à quelle cadence je joue (au moins un site et une cadence), puis temps et niveau.
  await expect(ch.locator('[data-choix-q]')).toHaveText('Où et à quelle cadence joues-tu ?');
  await ch.locator('[data-choix-next]').click();
  await expect(ch.locator('[data-choix-err]')).toHaveText('Choisis au moins un site et une cadence.');
  await ch.locator('[data-rt="sites"][data-val="lichess"]').click();
  await ch.locator('[data-rt="cadences"][data-val="blitz"]').click();
  await ch.locator('[data-choix-next]').click();
  await expect(ch.locator('[data-choix-q]')).toHaveText('Combien de temps par jour, et quel est ton niveau ?');
  await ch.locator('[data-rt="temps"][data-val="20"]').click();
  await ch.locator('[data-rt="cote"][data-val="1000-1400"]').click();
  await expect(ch.locator('.choix-recap')).toContainText('Système de Londres · Défense sicilienne · Défense indienne du Roi · 20 min par jour · Lichess · Blitz');
  await expect(ch.locator('[data-choix-next]')).toHaveText('Créer ma routine et commencer');
  await ch.locator('[data-choix-next]').click();
  // Nouvel utilisateur : visite guidée (6 étapes, une seule fois), la page suit chaque étape.
  const tour = page.locator('.tour-bulle');
  await expect(tour).toContainText('1 / 6');
  await expect(tour).toContainText('Ta routine du jour');
  await expect(page).toHaveURL(/#\/entrainement$/);
  await expect(page.locator('.tour-cible')).toHaveCount(1);
  for (let i = 2; i <= 6; i++) {
    await tour.locator('[data-tour-suivant]').click();
    await expect(tour).toContainText(`${i} / 6`);
  }
  await expect(page).toHaveURL(/#\/moteur$/);
  await tour.locator('[data-tour-suivant]').click();
  await expect(tour).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('coach-echecs:visite'))).toBe('faite');
  await page.goto('./#/repertoire');
  await page.reload();
  await expect(page.locator('.tour-bulle')).toHaveCount(0);
  // Répertoire : seulement les ouvertures choisies ; le Londres a ses fiches
  // (1 gratuite, les autres verrouillées), l'Indienne du Roi est annoncée « bientôt ».
  const rep = page.locator('#page-repertoire');
  await expect(rep.locator('tr[data-id="lon-classique"]:not([data-locked])')).toBeVisible();
  await expect(rep.locator('[data-view]')).toHaveCount(4); // 3 ouvertures + Anti-trash
  await expect(rep.locator('[data-view="gd"]')).toHaveCount(0);
  await expect(rep.locator('tr[data-id]')).toHaveCount(21);
  await expect(rep.locator('tr[data-id][data-locked]')).toHaveCount(20);
  // Tous les répertoires ont désormais des fiches : l'Indienne du Roi a été vidée dans les données
  // servies à ce test (voir plus haut) pour garder la couverture de l'affichage « bientôt ».
  await rep.locator('[data-view="indienne-roi"]').click();
  await expect(rep.locator('[data-soon="indienne-roi"]')).toBeVisible();
  expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY)).ids).toEqual(['londres', 'sicilienne', 'indienne-roi']);
  // Entraînement : le cours du Londres est proposé ; la routine est déjà prête (pas de questions).
  await page.goto('./#/entrainement');
  await expect(page.locator('[data-course="londres"]')).toBeVisible();
  await expect(page.locator('[data-routine-profil]')).toHaveCount(0);
  await expect(page.locator('[data-routine]')).toContainText('Ma routine : 20 min par jour · Lichess · Blitz');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('coach-echecs:routine-v1'))).niveau).toBe('easier');
  // Revenir à l'accueil depuis le logo.
  await page.click('.brand');
  await expect(page.locator('#page-accueil')).toBeVisible();
  await expect(page.locator('#page-accueil [data-acc-choix]')).toContainText('Modifier mes ouvertures');
});

test('utilisateur existant : Gambit Dame + Caro-Kann gardés, choix modifié dans ⚙', async ({ page }) => {
  await setup(page, { existant: true });
  await page.goto('./');
  await expect(page.locator('#page-moteur')).toBeVisible();
  expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY))).toMatchObject({ ids: ['gd', 'ck'], auto: true });
  await page.goto('./#/repertoire');
  await expect(page.locator('#page-repertoire tr[data-id="gd-orthodoxe"]')).toBeVisible();
  await page.click('#btn-settings');
  await expect(page.locator('#set-ouvertures')).toHaveText('Votre répertoire : Gambit Dame · Défense Caro-Kann.');
  await page.click('#set-ouvertures-btn');
  const ch = page.locator('#page-ouvertures');
  await expect(ch.locator('[data-rep="gd"]')).toHaveAttribute('aria-pressed', 'true');
  await ch.locator('[data-choix-next]').click();
  await expect(ch.locator('[data-rep="ck"]')).toHaveAttribute('aria-pressed', 'true');
  await choisir(page, ['ck', 'sicilienne']);
  for (let i = 0; i < 3; i++) await ch.locator('[data-choix-next]').click();
  await expect(page).toHaveURL(/#\/repertoire$/);
  const rep = page.locator('#page-repertoire');
  await expect(rep.locator('[data-view="gd"]')).toBeVisible();
  await expect(rep.locator('[data-view="sicilienne"]')).not.toContainText('bientôt');
  await expect(rep.locator('[data-view="ck"]')).toHaveCount(0);
  // Entraînement : leçons du Gambit Dame et de la Sicilienne, plus de Caro-Kann.
  await page.goto('./#/entrainement');
  await expect(page.locator('[data-course="gd"]')).toBeVisible();
  await expect(page.locator('[data-course="sicilienne"]')).toBeVisible();
  await expect(page.locator('[data-course="ck"]')).toHaveCount(0);
  // Le choix fait partie de « Mes données ».
  const keys = await page.evaluate(async () => {
    const { exportData } = await import('./js/transfer.js');
    return Object.keys(exportData().data);
  });
  expect(keys).toContain(KEY);
});

test('accueil et choix des ouvertures sur téléphone @mobile : pas de défilement horizontal', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await expect(page.locator('#page-accueil')).toBeVisible();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.locator('#page-accueil [data-acc-choix]').click();
  await expect(page.locator('#page-ouvertures [data-rep="gd"]')).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('Aide : questions fréquentes, signaler un problème (message préparé, diagnostic joint)', async ({ page }) => {
  await setup(page, { existant: true });
  await page.goto('./#/moteur');
  await page.click('#btn-settings');
  await page.click('#set-aide-btn');
  const dlg = page.locator('#dlg-aide');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.faq')).toHaveCount(13);
  await expect(dlg).toContainText('application indépendante');
  await dlg.locator('.faq summary', { hasText: 'installer' }).click();
  await expect(dlg).toContainText('Sur l’écran d’accueil');
  await dlg.locator('[data-bug-envoyer]').click();
  await expect(dlg.locator('[data-bug-msg]')).toContainText('Décris le problème');
  await dlg.locator('[data-bug]').fill('Le bouton ne répond pas.');
  await dlg.locator('[data-bug-envoyer]').click();
  await expect(dlg.locator('[data-bug-msg]')).toContainText(/copié|Copie impossible|messagerie/);
  await dlg.locator('button[value="close"]').click();
  await expect(dlg).toBeHidden();
});

test('Ma progression : courbe Lichess, classements Chess.com, routine sur 4 semaines', async ({ page }) => {
  await setup(page, { existant: true });
  const CORS = { 'access-control-allow-origin': '*' };
  await page.route('https://lichess.org/api/user/LeugiMC/rating-history', (r) => r.fulfill({ headers: CORS, json: [
    { name: 'Blitz', points: [[2026, 5, 1, 990], [2026, 8, 1, 1010], [2026, 10, 20, 1042]] },
    { name: 'Rapid', points: [[2026, 7, 1, 1200], [2026, 10, 1, 1240]] },
  ] }));
  await page.route(/api\.chess\.com\/pub\/player\/qg_miguel\/stats/, (r) => r.fulfill({ headers: CORS, json: { chess_rapid: { last: { rating: 760 }, best: { rating: 812 } } } }));
  await page.addInitScript(() => {
    localStorage.setItem('coach-echecs:mes-parties', JSON.stringify({ lichess: 'LeugiMC', chesscom: 'QG_Miguel' }));
    localStorage.setItem('coach-echecs:finales-v1', JSON.stringify({ dame: { ok: true, sansIndice: true, essais: 1 } }));
  });
  await page.goto('./#/entrainement');
  await page.click('[data-lien-progression]');
  await expect(page).toHaveURL(/#\/progression$/);
  const li = page.locator('[data-prog-lichess]');
  await expect(li).toContainText('Blitz');
  await expect(li).toContainText('1042');
  await expect(li.locator('.prog-courbe').first()).toBeVisible();
  await expect(page.locator('[data-prog-chesscom]')).toContainText('760');
  await expect(page.locator('[data-prog-chesscom]')).toContainText('record 812');
  await expect(page.locator('[data-prog-routine] tbody tr')).toHaveCount(4);
  await expect(page.locator('[data-prog-entrainement]')).toContainText('1/8');
  await page.click('[data-periode="0"]');
  await expect(page.locator('[data-periode="0"]')).toHaveAttribute('aria-pressed', 'true');
});

test('version anglaise : bouton EN, interface traduite, notation anglaise, retour en français', async ({ page }) => {
  await setup(page, { existant: true });
  await page.goto('./#/moteur');
  await page.click('#btn-langue');
  await expect(page.locator('.tabs [data-page="entrainement"]')).toHaveText('Training');
  await expect(page.locator('#btn-langue')).toHaveText('FR');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('./#/repertoire');
  await expect(page.locator('#page-repertoire')).toContainText('Queen’s Gambit');
  await page.goto('./#/entrainement');
  await expect(page.locator('#page-entrainement')).toContainText('Puzzles by theme');
  await expect(page.locator('#page-entrainement')).toContainText('Play against Stockfish');
  // Le choix de langue n'est pas une « donnée » de visiteur : il est exporté avec le reste, pas un secret.
  await page.click('#btn-settings');
  await expect(page.locator('#set-langue')).toHaveValue('en');
  await page.selectOption('#set-langue', 'fr');
  await expect(page.locator('.tabs [data-page="entrainement"]')).toHaveText('Entraînement');
});

test('première visite : choisir l’anglais sur l’accueil ne compte pas comme un ancien utilisateur', async ({ page }) => {
  await setup(page);
  await page.goto('./');
  await expect(page).toHaveURL(/#\/accueil$/);
  await page.click('#btn-langue');
  await expect(page).toHaveURL(/#\/accueil$/);
  await expect(page.locator('#page-accueil')).toContainText('Choose my openings');
  expect(await page.evaluate(() => localStorage.getItem('coach-echecs:mon-repertoire'))).toBeNull();
});
