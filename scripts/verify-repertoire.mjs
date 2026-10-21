// Vérifie avec Stockfish chaque affirmation tactique du répertoire et enregistre les
// résultats dans data/verification.json (affichés par la page « Répertoire »).
//
//   node scripts/verify-repertoire.mjs            → recalcule les fiches modifiées
//   node scripts/verify-repertoire.mjs --all      → recalcule tout
//   node scripts/verify-repertoire.mjs --all --dry → recalcule tout sans écrire ; échoue
//                                                   si une affirmation n'est pas confirmée (CI)
//   node scripts/verify-repertoire.mjs --check    → n'écrit rien ; échoue si une fiche
//                                                   n'est pas vérifiée ou pas confirmée (CI)
//
// Critères (du point de vue du camp qui joue le répertoire) :
//   punition : position finale ≥ +minCp (150 par défaut) ou mat en notre faveur
//   piège    : position finale ≤ −minCp ou mat contre nous
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../site/vendor/chess.js';
import { LIGNES, REPERTOIRES } from '../site/data/repertoire.js';
import { playLine, entryFingerprint } from '../site/js/lines.js';
import { NodeEngine } from './uci-node.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'data/verification.json');
const DEPTH = 18;
const args = new Set(process.argv.slice(2));

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { entries: {} };

function check(entries = previous.entries) {
  const problems = [];
  for (const e of LIGNES) {
    const v = entries[e.id];
    if (!v || v.fp !== entryFingerprint(e) || v.depth !== DEPTH) { problems.push(`${e.id} : non vérifiée (lancer npm run verify:repertoire)`); continue; }
    for (const k of ['punition', 'piege']) if (v[k] && !v[k].ok) problems.push(`${e.id} : ${k} non confirmée par Stockfish`);
  }
  return problems;
}

if (args.has('--check')) {
  const p = check();
  if (p.length) { console.error(p.join('\n')); process.exit(1); }
  console.log(`Répertoire : ${LIGNES.length} fiches vérifiées par Stockfish (profondeur ${DEPTH}).`);
  process.exit(0);
}

// Score du point de vue de `color`, en tenant compte des mats et pats déjà sur l'échiquier.
async function scoreFor(engine, fen, color) {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { type: 'mate', value: 0, mated: c.turn(), depth: 0, best: null, pv: [] };
  if (c.isStalemate() || c.isInsufficientMaterial()) return { type: 'cp', value: 0, depth: 0, best: null, pv: [] };
  const r = await engine.evaluate(fen, DEPTH);
  const sign = c.turn() === color ? 1 : -1;
  const pvSan = [];
  for (const u of r.pv.slice(0, 6)) {
    try { pvSan.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { break; }
  }
  return { type: r.score.type, value: r.score.value * sign, depth: r.depth, best: pvSan[0] || null, pv: pvSan };
}

async function verifyClaim(engine, claim, color, kind) {
  const minCp = claim.minCp ?? 150;
  const line = playLine(claim.ligne);
  const finalFen = line.fens.at(-1);
  const fin = await scoreFor(engine, finalFen, color);
  const errorPly = line.marked;
  const errorBy = line.moves[errorPly].color;
  // Ce que le moteur aurait recommandé juste après l'erreur, pour comparaison.
  const afterErr = await scoreFor(engine, line.fens[errorPly + 1], color);
  let ok;
  if (fin.mated) ok = kind === 'punition' ? fin.mated !== color : fin.mated === color;
  else if (kind === 'punition') ok = fin.type === 'mate' ? fin.value > 0 : fin.value >= minCp;
  else ok = fin.type === 'mate' ? fin.value < 0 : fin.value <= -minCp;
  const expectedBy = kind === 'punition' ? (color === 'w' ? 'b' : 'w') : color;
  if (errorBy !== expectedBy) ok = false;
  return {
    ok,
    minCp,
    errorPly,
    errorSan: line.san[errorPly],
    final: { type: fin.type, value: fin.value, mated: fin.mated || null },
    afterError: { type: afterErr.type, value: afterErr.value, best: afterErr.best, pv: afterErr.pv },
    pov: color,
  };
}

const engine = await new NodeEngine().init();
const out = { engine: engine.name, depth: DEPTH, date: new Date().toISOString().slice(0, 10), entries: { ...previous.entries } };
let n = 0;
for (const e of LIGNES) {
  const fp = entryFingerprint(e);
  const prev = previous.entries[e.id];
  if (!args.has('--all') && prev && prev.fp === fp && prev.depth === DEPTH) continue;
  const color = REPERTOIRES[e.rep].couleur;
  const main = playLine(e.ligne);
  const m = await scoreFor(engine, main.fens.at(-1), 'w');
  const v = { fp, depth: DEPTH, main: { type: m.type, value: m.value, best: m.best, pv: m.pv, pov: 'w' } };
  if (e.punition) v.punition = await verifyClaim(engine, e.punition, color, 'punition');
  if (e.piege) v.piege = await verifyClaim(engine, e.piege, color, 'piege');
  out.entries[e.id] = v;
  n++;
  const fmt = (x) => (x ? `${x.ok ? 'OK ' : 'NON'} fin=${x.final.mated ? 'mat' : x.final.type + ' ' + x.final.value} aprèsErreur=${x.afterError.type} ${x.afterError.value} (${x.afterError.pv.join(' ')})` : '—');
  console.log(`${e.id.padEnd(22)} ligne=${m.type} ${m.value}\n   punition: ${fmt(v.punition)}\n   piège:    ${fmt(v.piege)}`);
}
for (const id of Object.keys(out.entries)) if (!LIGNES.some((e) => e.id === id)) delete out.entries[id];
engine.quit();
const p = check(out.entries);
if (args.has('--dry')) {
  // CI : recalcul complet sans rien écrire ; échec si une affirmation n'est plus confirmée.
  if (p.length) { console.error('À corriger :\n' + p.join('\n')); process.exit(1); }
  console.log(`${n} fiche(s) recalculée(s) : toutes les affirmations tactiques sont confirmées.`);
} else {
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`${n} fiche(s) recalculée(s) → data/verification.json`);
  if (p.length) console.log('À corriger :\n' + p.join('\n'));
}
