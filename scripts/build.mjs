// Assemble le site publié dans dist/ (copie de site/ + config.json).
// COACH_API_URL : adresse du Worker Cloudflare (fournie par le workflow de déploiement).
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  build: process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local',
  builtAt: new Date().toISOString(),
};
writeFileSync(join(dist, 'config.json'), JSON.stringify(config, null, 2) + '\n');
// GitHub Pages : pas de traitement Jekyll (fichiers servis tels quels).
writeFileSync(join(dist, '.nojekyll'), '');
console.log('build: dist/ prêt', config);
