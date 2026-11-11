// Fréquence réelle de chaque fiche dans le jeu de données Élite (parties blitz/rapide récentes du
// top Lichess / Chess.com, tournois retransmis) : nombre de parties où le coup qui DÉFINIT la fiche
// (premier coup qui la distingue des autres fiches du même répertoire) a été joué dans la position
// d'avant (clé FEN, transpositions comprises). Fréquence observée, pas une évaluation.
//
//   node scripts/frequences.mjs [chemin ou URL de elite.json]  → data/frequences.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../site/vendor/chess.js';
import { LIGNES } from '../site/data/repertoire.js';
import { playLine } from '../site/js/lines.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'https://raw.githubusercontent.com/miguelcerqueira1-cmyk/-coach-echecs/donnees-elite/elite.json';
const fenKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

// Indice du coup qui définit la fiche : longueur du plus long préfixe commun avec une autre fiche
// du même répertoire (borné au dernier coup de la fiche).
export function coupDefinissant(uci, autres) {
  let k = 0;
  for (const o of autres) {
    let i = 0;
    while (i < uci.length && i < o.length && uci[i] === o[i]) i++;
    k = Math.max(k, i);
  }
  return Math.min(k, uci.length - 1);
}

export function frequences(lignes, elite) {
  const out = {};
  const parRep = {};
  for (const e of lignes) (parRep[e.rep] ??= []).push({ e, l: playLine(e.ligne) });
  for (const [rep, list] of Object.entries(parRep)) {
    for (const { e, l } of list) {
      const k = coupDefinissant(l.uci, list.filter((x) => x.e.id !== e.id).map((x) => x.l.uci));
      const pos = elite.positions[fenKey(l.fens[k])];
      const row = pos?.m.find((m) => m[0] === l.san[k]);
      if (!row) continue; // position ou coup absents des données : rien d'extrapolé
      out[e.id] = { n: row[1] + row[2] + row[3], ply: k, coup: l.san[k], rep };
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2] || SOURCE;
  const elite = /^https:/.test(src) ? await (await fetch(src)).json() : JSON.parse(readFileSync(src, 'utf8'));
  const entries = frequences(LIGNES, elite);
  writeFileSync(join(root, 'data/frequences.json'), JSON.stringify({
    source: 'Élite (parties blitz/rapide du top Lichess et Chess.com, tournois retransmis)',
    date: elite.meta.generatedAt.slice(0, 10), parties: elite.meta.games, entries,
  }, null, 1) + '\n');
  const byRep = {};
  for (const [id, f] of Object.entries(entries)) (byRep[f.rep] ??= []).push([id, f]);
  for (const [rep, l] of Object.entries(byRep)) {
    console.log(`== ${rep}`);
    l.sort((a, b) => b[1].n - a[1].n).forEach(([id, f], i) => console.log(`${String(i + 1).padStart(2)}. ${id.padEnd(24)} ${String(f.n).padStart(5)}  (coup ${Math.floor(f.ply / 2) + 1}${f.ply % 2 ? '…' : '.'}${f.coup})`));
  }
  console.log(`fiches avec fréquence : ${Object.keys(entries).length} / ${LIGNES.length}`);
}
