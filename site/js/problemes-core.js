// Problèmes par thème avec un classement propre à BlitzRefute (logique pure, testée par node:test).
// Les problèmes viennent tels quels de l'API publique Lichess (base CC0) ; le classement est calculé
// ici, sur l'appareil, avec la formule Elo à partir de la difficulté publiée par Lichess. Il ne
// remplace pas et n'influence pas le classement Lichess de l'utilisateur.
// Données : coach-echecs:problemes-v1 { classement, n, histo: [{ d, r }], themes: { id: { n, ok } }, vus: [ids] }

export const KEY = 'coach-echecs:problemes-v1';
export const DEPART = 1200;

// Thèmes de la base Lichess (identifiants de l'API `angle`) et nom français.
export const THEMES_PROBLEMES = [
  { id: 'mix', nom: 'Mélange (tous les thèmes)', groupe: 'Général', gratuit: true },
  { id: 'hangingPiece', nom: 'Pièce en prise', groupe: 'Bases', gratuit: true },
  { id: 'mateIn1', nom: 'Mat en 1', groupe: 'Mats', gratuit: true },
  { id: 'mateIn2', nom: 'Mat en 2', groupe: 'Mats' },
  { id: 'mateIn3', nom: 'Mat en 3', groupe: 'Mats' },
  { id: 'backRankMate', nom: 'Mat du couloir', groupe: 'Mats' },
  { id: 'fork', nom: 'Fourchette', groupe: 'Motifs' },
  { id: 'pin', nom: 'Clouage', groupe: 'Motifs' },
  { id: 'skewer', nom: 'Enfilade', groupe: 'Motifs' },
  { id: 'discoveredAttack', nom: 'Attaque à la découverte', groupe: 'Motifs' },
  { id: 'doubleCheck', nom: 'Échec double', groupe: 'Motifs' },
  { id: 'xRayAttack', nom: 'Attaque rayons X', groupe: 'Motifs' },
  { id: 'trappedPiece', nom: 'Pièce piégée', groupe: 'Motifs' },
  { id: 'deflection', nom: 'Déviation', groupe: 'Motifs' },
  { id: 'attraction', nom: 'Attraction', groupe: 'Motifs' },
  { id: 'capturingDefender', nom: 'Élimination du défenseur', groupe: 'Motifs' },
  { id: 'intermezzo', nom: 'Coup intermédiaire', groupe: 'Motifs' },
  { id: 'sacrifice', nom: 'Sacrifice', groupe: 'Motifs' },
  { id: 'quietMove', nom: 'Coup tranquille', groupe: 'Motifs' },
  { id: 'defensiveMove', nom: 'Coup défensif', groupe: 'Bases' },
  { id: 'kingsideAttack', nom: 'Attaque à l’aile roi', groupe: 'Phases' },
  { id: 'exposedKing', nom: 'Roi exposé', groupe: 'Phases' },
  { id: 'opening', nom: 'Ouverture', groupe: 'Phases' },
  { id: 'middlegame', nom: 'Milieu de partie', groupe: 'Phases' },
  { id: 'endgame', nom: 'Finale', groupe: 'Phases' },
  { id: 'promotion', nom: 'Promotion', groupe: 'Phases' },
];

export const themeDe = (id) => THEMES_PROBLEMES.find((t) => t.id === id) || THEMES_PROBLEMES[0];

export function lire(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage.getItem(KEY) || 'null');
    if (v && typeof v === 'object' && Number.isFinite(v.classement)) return { histo: [], themes: {}, vus: [], n: 0, ...v };
  } catch { /* illisible */ }
  return { classement: DEPART, n: 0, histo: [], themes: {}, vus: [] };
}
export function ecrire(d, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify(d)); } catch { /* stockage plein */ }
}

// Difficulté demandée à Lichess selon le classement (l'API sans compte est relative à 1500 ;
// fourchettes observées : easiest ≈ 700–1000, easier ≈ 950–1250, normal ≈ 1450–1600,
// harder ≈ 1600–1950, hardest ≈ 1600–2100).
export function difficultePour(classement) {
  if (classement < 1000) return 'easiest';
  if (classement < 1350) return 'easier';
  if (classement < 1650) return 'normal';
  if (classement < 1900) return 'harder';
  return 'hardest';
}

// Formule Elo : attendu = 1 / (1 + 10^((difficulté − classement) / 400)). K = 40 pour les
// 20 premiers problèmes (classement provisoire), puis 20.
export function nouveauClassement(classement, difficulte, reussi, n = 0) {
  if (!Number.isFinite(difficulte)) return classement;
  const k = n < 20 ? 40 : 20;
  const attendu = 1 / (1 + 10 ** ((difficulte - classement) / 400));
  return Math.max(400, Math.round(classement + k * ((reussi ? 1 : 0) - attendu)));
}

// Enregistre un problème joué ; renvoie { data, avant, apres, delta }.
export function noterProbleme(data, { id, theme, difficulte, reussi, now = new Date() }) {
  const d = { ...data, themes: { ...data.themes }, histo: [...(data.histo || [])], vus: [...(data.vus || [])] };
  const avant = d.classement;
  const apres = nouveauClassement(avant, difficulte, reussi, d.n);
  d.classement = apres;
  d.n = (d.n || 0) + 1;
  const t = { n: 0, ok: 0, ...(d.themes[theme] || {}) };
  t.n++;
  if (reussi) t.ok++;
  d.themes[theme] = t;
  const jour = now.toISOString().slice(0, 10);
  if (d.histo.at(-1)?.d === jour) d.histo[d.histo.length - 1] = { d: jour, r: apres };
  else d.histo.push({ d: jour, r: apres });
  d.histo = d.histo.slice(-365);
  if (id && !d.vus.includes(id)) d.vus = [...d.vus, id].slice(-300);
  return { data: d, avant, apres, delta: apres - avant };
}

// Thèmes les plus faibles (au moins 5 problèmes joués), du plus bas taux de réussite au plus haut.
export function themesFaibles(data, min = 5) {
  return Object.entries(data.themes || {})
    .filter(([, t]) => t.n >= min)
    .map(([id, t]) => ({ id, nom: themeDe(id).nom, n: t.n, pct: Math.round((100 * t.ok) / t.n) }))
    .sort((a, b) => a.pct - b.pct);
}

export const signe = (x) => (x > 0 ? `+${x}` : `${x}`);
