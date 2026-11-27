// Test de départ (2 minutes) : quelques positions des ouvertures choisies où c'est à nous de jouer ;
// un seul essai par position ; tous les coups des fiches à cette position sont acceptés. Positions
// tirées des variantes « théorie » les plus jouées au top (entry.freq), autour du coup qui définit
// la variante. Résultat gardé dans coach-echecs:depart-v1 (exporté avec « Mes données »).
import { buildTree, key } from './training-core.js';
import { couleurDe } from '../data/repertoires/meta.js';

export const KEY = 'coach-echecs:depart-v1';
export const N_DEPART = 5;

// Indice du coup « à nous » le plus proche de la cible (au moins le 2e coup de la partie).
export function plyCible(uci, color, cible) {
  const nos = uci.map((_, i) => i).filter((i) => i >= 2 && (i % 2 === 0 ? 'w' : 'b') === color);
  if (!nos.length) return null;
  return nos.reduce((a, b) => (Math.abs(b - cible) < Math.abs(a - cible) ? b : a));
}

export function positionsDepart(entries, reps, { n = N_DEPART } = {}) {
  const parRep = reps.map((rep) => {
    const color = couleurDe(rep);
    const tree = buildTree(entries, rep);
    const fiches = entries.filter((e) => e.rep === rep && e.badge === 'theorie')
      .map((e, i) => ({ e, i })).sort((a, b) => (b.e.freq?.n ?? -1) - (a.e.freq?.n ?? -1) || a.i - b.i).map((x) => x.e);
    return { rep, color, tree, fiches };
  }).filter((r) => r.fiches.length);
  const out = [];
  const vues = new Set();
  for (let tour = 0; out.length < n && tour < 40; tour++) {
    let ajout = false;
    for (const r of parRep) {
      if (out.length >= n) break;
      const e = r.fiches[tour];
      if (!e) continue;
      const i = plyCible(e.uci, r.color, e.freq?.ply ?? Math.floor(e.uci.length * 0.6));
      if (i == null) continue;
      const moves = e.uci.slice(0, i);
      const k = key(moves);
      if (vues.has(`${r.rep}|${k}`)) continue;
      const attendus = [...(r.tree.ours.get(k)?.keys() || [e.uci[i]])];
      vues.add(`${r.rep}|${k}`);
      out.push({ kind: 'pos', examen: true, moves, expected: attendus, rep: r.rep, color: r.color, ficheId: e.id, ficheNom: e.nom, gameId: `depart-${out.length}` });
      ajout = true;
    }
    if (!ajout && tour > 0 && parRep.every((r) => tour >= r.fiches.length)) break;
  }
  return out;
}

export function bilanDepart(resultats) {
  const ok = resultats.filter((r) => r.ok).length;
  return { ok, total: resultats.length, ratees: [...new Set(resultats.filter((r) => !r.ok).map((r) => r.id))] };
}

export function charger(storage = globalThis.localStorage) {
  try { return JSON.parse(storage.getItem(KEY) || 'null'); } catch { return null; }
}
export function enregistrer(d, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify(d)); } catch { /* stockage plein */ }
}
