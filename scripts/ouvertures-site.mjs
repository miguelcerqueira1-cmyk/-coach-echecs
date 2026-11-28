// Produit site/data/ouvertures.json pour la reconnaissance locale de l'ouverture (site/js/ouverture-core.js) :
// base ECO CC0 (data/chess-openings/*.tsv) + positions des fiches (site/data/repertoire.json).
// À relancer après toute modification des fiches (après scripts/repertoire.mjs).
//   node scripts/ouvertures-site.mjs [--check]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playLine } from '../site/js/lines.js';
import { cle } from '../site/js/ouverture-core.js';
import { Chess } from '../site/vendor/chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const eco = {};
const dir = join(root, 'data/chess-openings');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsv')).sort()) {
  for (const row of readFileSync(join(dir, f), 'utf8').split('\n').slice(1)) {
    if (!row.trim()) continue;
    const [code, name, pgn] = row.split('\t');
    eco[cle(playLine(pgn).fens.at(-1))] = [code, name];
  }
}
const rep = JSON.parse(readFileSync(join(root, 'site/data/repertoire.json'), 'utf8'));
const fiches = [], pos = {}, err = {};
const fensUci = (ucis) => { const c = new Chess(); const out = [c.fen()]; for (const u of ucis) { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); out.push(c.fen()); } return out; };
rep.entries.forEach((e, idx) => {
  fiches.push([e.id, e.rep, e.nom, rep.repertoires[e.rep].couleur, e.en?.nom || e.nom]);
  fensUci(e.uci).forEach((f, i) => { if (i === 0) return; const k = cle(f); (pos[k] ??= []).includes(idx) || pos[k].push(idx); });
  // Ligne principale avec un coup marqué « ? » (fiches « coups loufoques ») : la suite de la fiche le réfute.
  const lp = playLine(e.ligne);
  const principale = lp.marked >= 0 ? { uci: lp.uci, marked: lp.marked } : null;
  for (const [kind, t] of [['p', e.punition], ['t', e.piege], ['d', principale]]) {
    if (!t?.uci || t.marked == null || t.marked < 0 || !t.uci[t.marked + 1]) continue;
    const fs = fensUci(t.uci.slice(0, t.marked + 1));
    // Positions menant à l'erreur : connues (la fiche les couvre), même hors de la ligne principale.
    fs.forEach((x, i) => { if (i === 0) return; const k = cle(x); (pos[k] ??= []).includes(idx) || pos[k].push(idx); });
    const f = fs.at(-1);
    (err[cle(f)] ??= []).push([idx, kind, t.uci[t.marked + 1], t.marked + 1]);
  }
});
const out = JSON.stringify({ v: 1, eco, pos, err, fiches });
const p = join(root, 'site/data/ouvertures.json');
if (process.argv.includes('--check')) {
  if (readFileSync(p, 'utf8') !== out + '\n') { console.error('site/data/ouvertures.json n’est pas à jour : node scripts/ouvertures-site.mjs'); process.exit(1); }
  console.log('ouvertures.json à jour');
} else {
  writeFileSync(p, out + '\n');
  console.log(`ouvertures.json : ${Object.keys(eco).length} positions ECO, ${Object.keys(pos).length} positions de fiches, ${Object.keys(err).length} erreurs connues, ${(out.length / 1024).toFixed(0)} Ko`);
}
