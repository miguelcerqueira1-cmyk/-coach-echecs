// Génère les icônes PNG de l'application installable (site/icons/) à partir du cavalier
// blanc cburnett (site/pieces/wN.svg), sur fond « Nuit néon ». À relancer seulement si
// l'icône change : les PNG sont versionnés. Usage : node scripts/icons.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site/icons');
mkdirSync(out, { recursive: true });
const knight = 'data:image/svg+xml;base64,' + readFileSync(join(root, 'site/pieces/wN.svg')).toString('base64');

// rounded : coins arrondis transparents (icône « any ») ; sinon carré plein (maskable, Apple,
// le système applique sa propre forme). piece : part du côté occupée par le cavalier
// (maskable : la zone sûre est un cercle de 80 % ; le cavalier reste dedans).
const icons = [
  { file: 'icon-192.png', size: 192, rounded: true, piece: 0.78 },
  { file: 'icon-512.png', size: 512, rounded: true, piece: 0.78 },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, piece: 0.6 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, piece: 0.74 },
];

const browser = await chromium.launch();
try {
  for (const { file, size, rounded, piece } of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const radius = rounded ? Math.round(size * 0.22) : 0;
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
      <div style="width:${size}px;height:${size}px;border-radius:${radius}px;display:grid;place-items:center;
        background:radial-gradient(circle at 50% 38%, #2a2466 0%, #15183a 55%, #0b0d1e 100%);
        box-shadow:inset 0 0 0 ${Math.max(2, Math.round(size * 0.02))}px rgba(157,140,255,${rounded ? 0.55 : 0})">
        <img src="${knight}" style="width:${Math.round(size * piece)}px;height:${Math.round(size * piece)}px;
          filter:drop-shadow(0 0 ${Math.round(size * 0.03)}px rgba(157,140,255,.85))">
      </div></body></html>`);
    await page.waitForFunction(() => document.querySelector('img').complete);
    await page.screenshot({ path: join(out, file), omitBackground: true });
    await page.close();
    console.log('icône :', file);
  }
} finally {
  await browser.close();
}
