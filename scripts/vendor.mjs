// Copie les bibliothèques épinglées (package-lock.json) dans site/ pour qu'elles
// soient servies telles quelles par GitHub Pages. Exécuté après `npm ci`.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');

const sfPkg = JSON.parse(readFileSync(join(nm, 'stockfish/package.json'), 'utf8'));
const chessPkg = JSON.parse(readFileSync(join(nm, 'chess.js/package.json'), 'utf8'));
const flavor = `stockfish-${sfPkg.buildVersion}-lite-single`;

mkdirSync(join(root, 'site/vendor'), { recursive: true });
mkdirSync(join(root, 'site/engine'), { recursive: true });

copyFileSync(join(nm, 'chess.js/dist/esm/chess.js'), join(root, 'site/vendor/chess.js'));
copyFileSync(join(nm, `stockfish/bin/${flavor}.js`), join(root, 'site/engine/stockfish.js'));
copyFileSync(join(nm, `stockfish/bin/${flavor}.wasm`), join(root, 'site/engine/stockfish.wasm'));
copyFileSync(join(nm, 'stockfish/Copying.txt'), join(root, 'site/engine/COPYING.txt'));

const wasm = readFileSync(join(root, 'site/engine/stockfish.wasm'));
const manifest = {
  engine: `Stockfish ${sfPkg.buildVersion} (stockfish.js ${sfPkg.version}, ${flavor})`,
  flavor,
  version: sfPkg.version,
  wasmBytes: wasm.length,
  // Sert de clé de cache : un nouveau moteur invalide l'ancien cache.
  wasmSha256: createHash('sha256').update(wasm).digest('hex').slice(0, 16),
  chessjs: chessPkg.version,
};
writeFileSync(join(root, 'site/engine/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('vendor:', manifest.engine, `${(wasm.length / 1e6).toFixed(1)} Mo`, '| chess.js', chessPkg.version);
