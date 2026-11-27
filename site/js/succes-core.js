// Points d'expérience, niveaux, objectif du jour et badges. Tout reste sur l'appareil
// (coach-echecs:xp-v1, exporté avec « Mes données »). Les points se gagnent en s'entraînant
// (jamais en payant) ; les badges sont calculés à partir des données réelles de progression.
export const KEY = 'coach-echecs:xp-v1';
export const OBJECTIFS = [30, 50, 100];
export const GAINS = { ligneOk: 10, ligneKo: 2, drillOk: 10, drillKo: 2, lecon: 20, corrige: 15, probleme: 5, finale: 15, depart: 5 };

const jourDe = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const sto = (s) => s ?? (typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null);

export function vide() { return { total: 0, jours: {}, badges: {}, objectif: 50 }; }

export function charger(storage) {
  const st = sto(storage);
  if (!st) return vide();
  try {
    const d = JSON.parse(st.getItem(KEY) || 'null');
    if (d && typeof d === 'object') return { ...vide(), ...d, jours: { ...(d.jours || {}) }, badges: { ...(d.badges || {}) } };
  } catch { /* illisible */ }
  return null; // jamais initialisé : voir initialiser()
}

export function enregistrer(d, storage) {
  const st = sto(storage);
  try { st?.setItem(KEY, JSON.stringify(d)); } catch { /* stockage plein */ }
}

// Points de départ d'un utilisateur existant, d'après ce qu'il a déjà fait (une seule fois).
export function pointsExistants(p) {
  const somme = (o) => Object.values(o || {}).reduce((a, r) => a + (r.ok || 0) * GAINS.ligneOk + (r.ko || 0) * GAINS.ligneKo, 0);
  return somme(p?.lignes) + somme(p?.drills) + Object.keys(p?.cours || {}).length * GAINS.lecon
    + (p?.sorties || []).filter((x) => x.corrige).length * GAINS.corrige;
}

export function initialiser(progress, storage) {
  const d = charger(storage);
  if (d) return d;
  const n = { ...vide(), total: pointsExistants(progress) };
  enregistrer(n, storage);
  return n;
}

// Ajoute des points (total et jour) ; prévient l'interface (événement « xp »).
export function gagner(points, { now = Date.now(), storage } = {}) {
  if (!points || !sto(storage)) return null;
  const d = charger(storage) || vide();
  const j = jourDe(now);
  d.total += points;
  d.jours[j] = (d.jours[j] || 0) + points;
  // On ne garde que 120 jours d'historique.
  const cles = Object.keys(d.jours).sort();
  for (const k of cles.slice(0, Math.max(0, cles.length - 120))) delete d.jours[k];
  enregistrer(d, storage);
  try { globalThis.dispatchEvent?.(new CustomEvent('xp', { detail: { points, total: d.total, jour: d.jours[j] } })); } catch { /* hors navigateur */ }
  return d;
}

// Niveau : 1 au départ, 2 à 50 points, 3 à 200, 4 à 450… (50 × (n − 1)²).
export const seuilNiveau = (n) => 50 * (n - 1) ** 2;
export function niveau(total) {
  const n = Math.floor(Math.sqrt(Math.max(0, total) / 50)) + 1;
  const bas = seuilNiveau(n);
  const haut = seuilNiveau(n + 1);
  return { n, bas, haut, pct: Math.round((100 * (total - bas)) / (haut - bas)) };
}

export const xpDuJour = (d, now = Date.now()) => d.jours[jourDe(now)] || 0;
export const joursObjectif = (d) => Object.values(d.jours).filter((x) => x >= d.objectif).length;

// Badges : id, icône, nom (fr, en) et condition sur le contexte réel.
export const BADGES = [
  ['premiere-lecon', '📖', ['Première leçon', 'First lesson'], (c) => c.lecons >= 1],
  ['dix-lecons', '📚', ['10 leçons suivies', '10 lessons done'], (c) => c.lecons >= 10],
  ['maitrise-1', '✅', ['Première variante maîtrisée', 'First line mastered'], (c) => c.maitrisees >= 1],
  ['maitrise-10', '🏆', ['10 variantes maîtrisées', '10 lines mastered'], (c) => c.maitrisees >= 10],
  ['serie-3', '🔥', ['3 jours d’affilée', '3 days in a row'], (c) => c.serie >= 3],
  ['serie-7', '🔥', ['7 jours d’affilée', '7 days in a row'], (c) => c.serie >= 7],
  ['serie-30', '🌋', ['30 jours d’affilée', '30 days in a row'], (c) => c.serie >= 30],
  ['objectif-7', '📅', ['Objectif du jour atteint 7 fois', 'Daily goal reached 7 times'], (c) => c.objectifs >= 7],
  ['rush-10', '⚡', ['Rush : 10 points', 'Rush: 10 points'], (c) => c.rush >= 10],
  ['rush-25', '⚡', ['Rush : 25 points', 'Rush: 25 points'], (c) => c.rush >= 25],
  ['correcteur', '🎯', ['5 erreurs de mes parties corrigées', '5 mistakes from my games fixed'], (c) => c.corrigees >= 5],
  ['problemes-50', '🧩', ['50 problèmes réussis', '50 puzzles solved'], (c) => c.problemes >= 50],
  ['finales', '♚', ['Toutes les finales réussies', 'All endgames passed'], (c) => c.finales >= c.finalesTotal && c.finalesTotal > 0],
  ['niveau-5', '⭐', ['Niveau 5', 'Level 5'], (c) => c.niveau >= 5],
  ['niveau-10', '🌟', ['Niveau 10', 'Level 10'], (c) => c.niveau >= 10],
];

// Badges débloqués d'après le contexte ; renvoie les nouveaux (et les note dans d.badges).
export function verifierBadges(d, ctx, now = Date.now()) {
  const c = { ...ctx, objectifs: joursObjectif(d), niveau: niveau(d.total).n };
  const nouveaux = [];
  for (const [id, , , cond] of BADGES) {
    if (!d.badges[id] && cond(c)) { d.badges[id] = new Date(now).toISOString(); nouveaux.push(id); }
  }
  return nouveaux;
}
