// Assemble le site publié dans dist/ (copie de site/ + config.json).
// COACH_API_URL : adresse du Worker Cloudflare (fournie par le workflow de déploiement).
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
for (const f of ['vendor/chess.js', 'engine/stockfish.js', 'engine/stockfish.wasm', 'engine/manifest.json']) {
  if (!existsSync(join(root, 'site', f))) throw new Error(`site/${f} manquant : lancez « npm ci » (qui exécute scripts/vendor.mjs).`);
}
rmSync(dist, { recursive: true, force: true });
cpSync(join(root, 'site'), dist, { recursive: true });
const config = {
  apiUrl: process.env.COACH_API_URL || '',
  // Lien de paiement « Passer Pro » (ex. lien de paiement Stripe) ; vide = « paiement bientôt ».
  paymentUrl: process.env.PAYMENT_URL || '',
  build: process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local',
  builtAt: new Date().toISOString(),
};
writeFileSync(join(dist, 'config.json'), JSON.stringify(config, null, 2) + '\n');

// Service worker : liste des fichiers de l'application à garder hors connexion, et version
// du cache = identifiant de build + empreinte du contenu (une modification locale suffit aussi
// à déclencher la mise à jour). Exclus : le WASM de Stockfish (engine.js le met lui-même en
// cache), les gros jeux Élite (relus en ligne, mis en cache à l'usage), la source du répertoire,
// et fc-creations/ (redirection vers le site FC Créations, qui a son propre dépôt).
const NOT_PRECACHED = new Set(['sw.js', 'config.json', '.nojekyll', 'engine/stockfish.wasm', 'engine/COPYING.txt',
  'data/elite.json', 'data/joueurs.json', 'data/repertoire.js']);
const files = (function walk(d) {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
})(dist).map((f) => relative(dist, f).split(sep).join('/')).filter((f) => !NOT_PRECACHED.has(f) && !f.startsWith('fc-creations/')).sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
const swVersion = `${config.build}-${hash.digest('hex').slice(0, 10)}`;
const precache = ['config.json', ...files]; // index.html = clé des navigations (sw.js)
const swPath = join(dist, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
if (!sw.includes("'__BUILD_ID__'") || !sw.includes('[/*__PRECACHE__*/]')) throw new Error('site/sw.js : marqueurs __BUILD_ID__/__PRECACHE__ introuvables.');
writeFileSync(swPath, sw.replace("'__BUILD_ID__'", JSON.stringify(swVersion))
  .replace('[/*__PRECACHE__*/]', '[\n  ' + precache.map((f) => JSON.stringify(f)).join(',\n  ') + ',\n]'));
const kb = files.reduce((n, f) => n + readFileSync(join(dist, f)).length, 0) / 1024;
console.log(`build: sw.js ${swVersion}, ${precache.length} fichiers pré-cachés (${Math.round(kb)} Ko)`);
// GitHub Pages : pas de traitement Jekyll (fichiers servis tels quels).
writeFileSync(join(dist, '.nojekyll'), '');
console.log('build: dist/ prêt', config);
