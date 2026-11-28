import { readFileSync } from 'node:fs';
import { LIGNES, REPERTOIRES } from '../../site/data/repertoire.js';
import { playLine } from '../../site/js/lines.js';
const [rep, file] = process.argv.slice(2);
const elite = JSON.parse(readFileSync(file, 'utf8'));
const fk = (f) => f.split(' ').slice(0, 4).join(' ');
const col = REPERTOIRES[rep]?.couleur ?? REPERTOIRES.find?.(r=>r.id===rep)?.couleur;
const fiches = LIGNES.filter((e) => e.rep === rep);
const cov = new Map(); // fen -> {moves:Set, path}
for (const e of fiches) {
  const l = playLine(e.ligne);
  for (let i = 0; i < l.san.length; i++) {
    const k = fk(l.fens[i]);
    const o = cov.get(k) ?? { moves: new Set(), path: l.san.slice(0, i).join(' '), ids: new Set() };
    o.moves.add(l.san[i]); o.ids.add(e.id); cov.set(k, o);
  }
}
const out = [];
for (const [k, o] of cov) {
  const tour = k.split(' ')[1];
  if (tour === col) continue; // only opponent's turns
  const pos = elite.positions[k]; if (!pos) continue;
  const tot = pos.m.reduce((s, m) => s + m[1] + m[2] + m[3], 0);
  for (const m of pos.m) {
    if (o.moves.has(m[0])) continue;
    const n = m[1] + m[2] + m[3];
    if (n >= +(process.env.MIN||8)) out.push({ n, tot, path: o.path, coup: m[0] });
  }
}
out.sort((a, b) => b.n - a.n);
console.log('couleur', col, 'fiches', fiches.length);
for (const r of out.slice(0, 40)) console.log(String(r.n).padStart(5), '/', String(r.tot).padStart(5), ' ', r.path, '→', r.coup);
