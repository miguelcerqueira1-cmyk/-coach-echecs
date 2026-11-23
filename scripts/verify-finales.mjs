// Vérifie chaque finale de site/data/finales.js avec Stockfish : gain pour 'mat' / 'promotion',
// nulle pour 'nulle', du point de vue du camp de l'utilisateur. Résultat dans
// data/finales-verif.json (par id et FEN). Une finale non conforme fait échouer le script.
//   node scripts/verify-finales.mjs          → vérifie et écrit le fichier
//   node scripts/verify-finales.mjs --check  → contrôle que le fichier couvre toutes les finales
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import FINALES from '../site/data/finales.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(root, 'data/finales-verif.json');
export const PROFONDEUR = 20;

// Score UCI (camp au trait) → centipions du point de vue de `camp` (mat = ±10000).
export function pourCamp(score, trait, camp) {
  const v = score.type === 'mate' ? Math.sign(score.value || -1) * (10000 - Math.abs(score.value)) : score.value;
  return trait === camp ? v : -v;
}

export function conforme(f, cp) {
  return f.but === 'nulle' ? Math.abs(cp) <= 60 : cp >= 400;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--check')) {
    const v = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { finales: {} };
    const manquantes = FINALES.filter((f) => v.finales[f.id]?.fen !== f.fen || !v.finales[f.id]?.ok);
    if (manquantes.length) { console.error('Finales non vérifiées :', manquantes.map((f) => f.id).join(', ')); process.exit(1); }
    console.log(`Finales : ${FINALES.length} vérifiées par Stockfish.`);
    process.exit(0);
  }
  const { NodeEngine } = await import('./uci-node.mjs');
  const engine = await new NodeEngine().init();
  const out = { engine: engine.name, depth: PROFONDEUR, date: new Date().toISOString().slice(0, 10), finales: {} };
  let ko = 0;
  for (const f of FINALES) {
    const r = await engine.evaluate(f.fen, PROFONDEUR);
    const trait = f.fen.split(' ')[1];
    const cp = pourCamp(r.score, trait, f.camp);
    const ok = conforme(f, cp);
    if (!ok) ko++;
    out.finales[f.id] = { fen: f.fen, but: f.but, cp, ok, bestmove: r.bestmove };
    console.log(`${ok ? '✔' : '✘'} ${f.id} (${f.but}) : ${cp} cp pour le camp ${f.camp}, meilleur coup ${r.bestmove}`);
  }
  engine.quit();
  writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n');
  if (ko) { console.error(`${ko} finale(s) non conforme(s)`); process.exit(1); }
}
