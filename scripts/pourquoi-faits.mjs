// Faits de chaque coup des fiches d'un répertoire, pour rédiger « 💡 Pourquoi ce coup ? » :
// commentaires chess.js (développement, centre, prises, attaques, clouages), noms d'ouverture
// atteints, plan de la fiche, et Stockfish (profondeur 16) : meilleur coup avant le coup, écart.
// Un coup partagé par plusieurs fiches (même position, même coup) n'apparaît qu'une fois.
//   node scripts/pourquoi-faits.mjs ck > faits.json
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../site/vendor/chess.js';
import { NodeEngine } from './uci-node.mjs';
import { commentaires } from '../site/js/lesson-core.js';
import { sanFr } from '../site/js/analysis.js';
import { cleCoup } from '../site/js/pourquoi.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rep = process.argv[2];
const data = JSON.parse(readFileSync(join(root, 'site/data/repertoire.json'), 'utf8'));
const fiches = data.entries.filter((e) => e.rep === rep);
const coups = new Map();
for (const e of fiches) {
  const c = new Chess();
  e.uci.forEach((u, i) => {
    const fen = c.fen();
    const san = e.san[i];
    const k = cleCoup(fen, u);
    if (!coups.has(k)) {
      coups.set(k, { cle: k, ply: i, coup: `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'}${sanFr(san)}`, avant: e.san.slice(0, i).map(sanFr).join(' '), fen, uci: u, san, faits: commentaires(fen, san, 'fr'), fiches: [] });
    }
    const x = coups.get(k);
    const nom = (e.noms || []).filter((n) => n.ply <= i).at(-1)?.name || null;
    x.fiches.push({ id: e.id, nom: e.nom, nomEco: nom });
    if (!x.plan) x.plan = e.plan;
    c.move(san);
  });
}
const eng = await new NodeEngine().init();
for (const x of coups.values()) {
  const r = await eng.evaluate(x.fen, 16);
  const c = new Chess(x.fen);
  const best = r.bestmove && r.bestmove !== '(none)' ? c.move({ from: r.bestmove.slice(0, 2), to: r.bestmove.slice(2, 4), promotion: r.bestmove[4] }) : null;
  const apres = new Chess(x.fen);
  apres.move(x.san);
  const r2 = apres.isGameOver() ? null : await eng.evaluate(apres.fen(), 16);
  const cpBest = r.score?.type === 'cp' ? r.score.value : (r.score?.value > 0 ? 10000 : -10000);
  const cpJoue = r2 ? (r2.score?.type === 'cp' ? -r2.score.value : (r2.score?.value > 0 ? -10000 : 10000)) : null;
  x.stockfish = { meilleur: best ? sanFr(best.san) : null, estLeMeilleur: best?.lan === x.uci, ecartCp: cpJoue == null ? null : cpBest - cpJoue, evalApresBlancs: r2?.score ? (apres.turn() === 'w' ? r2.score.value : -r2.score.value) : null, type: r2?.score?.type };
}
eng.quit();
process.stdout.write(JSON.stringify([...coups.values()], null, 1));
