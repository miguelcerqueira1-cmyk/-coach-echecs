// Rush réfutations : les punitions vérifiées par Stockfish des fiches s'enchaînent, 3 vies,
// chrono par position qui raccourcit avec le score. Record et historique sur l'appareil
// (exportés par « Mes données » comme toutes les clés coach-echecs: non secrètes).
export const KEY = 'coach-echecs:rush-v1';
export const VIES = 3;

// Temps accordé pour la position suivante : 20 s, puis une seconde de moins par réussite, 8 s minimum.
export const tempsRush = (score) => Math.max(8, 20 - score);

export function charger(storage = globalThis.localStorage) {
  try {
    const d = JSON.parse(storage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') return { best: Number(d.best) || 0, parties: Array.isArray(d.parties) ? d.parties : [] };
  } catch { /* illisible : on repart de zéro */ }
  return { best: 0, parties: [] };
}

// Enregistre une partie ; renvoie { record: nouveau record ?, best, avant }.
export function enregistrer(score, now = Date.now(), storage = globalThis.localStorage) {
  const d = charger(storage);
  const avant = d.best;
  d.parties = [...d.parties, { date: new Date(now).toISOString(), score }].slice(-30);
  if (score > d.best) d.best = score;
  try { storage.setItem(KEY, JSON.stringify(d)); } catch { /* stockage plein */ }
  return { record: score > avant && score > 0, best: d.best, avant };
}

// Ordre des positions : mélangé, sans reprendre en premier la dernière position vue.
export function melanger(items, dernier = null, rnd = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (a.length > 1 && dernier != null && a[0] === dernier) [a[0], a[1]] = [a[1], a[0]];
  return a;
}
