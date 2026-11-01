// Prolonge chaque fiche au-delà de sa ligne : meilleure suite de Stockfish, demi-coup par
// demi-coup, jusqu'au demi-coup CIBLE (15e coup complet). Résultat dans data/prolongations.json,
// indexé par fiche et par empreinte (une fiche modifiée est recalculée).
//
//   node scripts/prolonge-lignes.mjs            → calcule ce qui manque ou a changé
//   node scripts/prolonge-lignes.mjs --all      → recalcule tout
//   node scripts/prolonge-lignes.mjs --only id  → une fiche
//
// Ce n'est PAS de la théorie publiée : c'est la suite conseillée par le moteur (affichée comme
// telle dans l'application). Rien n'est inventé : chaque coup est le meilleur coup de Stockfish.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../site/vendor/chess.js';
import { LIGNES } from '../site/data/repertoire.js';
import { playLine, entryFingerprint } from '../site/js/lines.js';
import { NodeEngine } from './uci-node.mjs';

export const CIBLE = 30; // demi-coups : la ligne complète va jusqu'au 15e coup
export const PROFONDEUR = 16;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(root, 'data/prolongations.json');

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = process.argv.includes('--all');
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  const data = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { entries: {} };
  const engine = await new NodeEngine().init();
  data.engine = engine.name;
  data.depth = PROFONDEUR;
  data.cible = CIBLE;
  let done = 0;
  for (const e of LIGNES) {
    if (only && e.id !== only) continue;
    const fp = entryFingerprint(e);
    if (!all && !only && data.entries[e.id]?.fp === fp) continue;
    const main = playLine(e.ligne);
    const c = new Chess(main.fens.at(-1));
    const uci = [];
    const san = [];
    for (let ply = main.uci.length; ply < CIBLE && !c.isGameOver(); ply++) {
      const r = await engine.evaluate(c.fen(), PROFONDEUR);
      if (!r.bestmove || r.bestmove === '(none)') break;
      const mv = c.move({ from: r.bestmove.slice(0, 2), to: r.bestmove.slice(2, 4), promotion: r.bestmove[4] });
      uci.push(mv.lan);
      san.push(mv.san);
    }
    data.entries[e.id] = { fp, uci, san };
    done++;
    console.log(`${e.id} : +${uci.length} demi-coups ${san.slice(0, 6).join(' ')}${san.length > 6 ? ' …' : ''}`);
    writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n'); // sauvegarde au fil de l'eau
  }
  data.date = new Date().toISOString().slice(0, 10);
  writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n');
  engine.quit();
  console.log(`prolongations : ${done} fiche(s) calculée(s) → data/prolongations.json`);
}
