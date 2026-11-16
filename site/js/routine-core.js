// « Ma routine du jour » (logique pure) : blocs du jour, cases cochées et suivi du soir, conservés
// par date sur l'appareil (clé coach-echecs:routine-v1, exportée par « Mes données »).
// Lundi → samedi : 6 blocs ; dimanche : jour off (théorie seulement).

export const KEY = 'coach-echecs:routine-v1';

// Thèmes de problèmes Lichess (anti-vision tunnel), en alternance un jour sur deux.
export const THEMES = [
  { id: 'hangingPiece', nom: 'Pièce en prise', url: 'https://lichess.org/training/hangingPiece' },
  { id: 'defensiveMove', nom: 'Coup défensif', url: 'https://lichess.org/training/defensiveMove' },
];

// Niveau des problèmes Lichess (paramètre `difficulty` de l'API, sans compte : relatif à 1500).
// Fourchettes observées le 2026-11-16 sur l'API (thème « Pièce en prise »).
export const NIVEAUX = [
  { id: 'easiest', nom: 'Très facile (≈ 700–850)' },
  { id: 'easier', nom: 'Facile (≈ 950–1250)' },
  { id: 'normal', nom: 'Moyen (≈ 1500)' },
];
export const niveauProblemes = (data) => (NIVEAUX.some((n) => n.id === data?.niveau) ? data.niveau : 'easiest');

// Date locale « AAAA-MM-JJ ».
export function jour(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const numJour = (date) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000);

export function blocsDuJour(date = jour()) {
  const dimanche = new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
  const theme = THEMES[numJour(date) % THEMES.length];
  const tous = [
    { id: 'tactique', titre: 'Tactique anti-tunnel', min: 15, texte: `10 problèmes sans chrono, thème « ${theme.nom} », ici dans l’appli. Avant de jouer : qu’a changé le dernier coup adverse ?`, action: 'problemes', theme, lien: { url: theme.url, label: `ou sur Lichess` } },
    { id: 'vitesse', titre: 'Vitesse', min: 5, texte: 'Un seul Puzzle Rush de 3 minutes : échauffement des réflexes.', lien: { url: 'https://www.chess.com/puzzles/rush', label: 'Chess.com : Puzzle Rush' } },
    { id: 'theorie', titre: 'Théorie', min: 10, texte: 'Apprendre 1 nouvelle variante, puis réviser celles déjà apprises, sans chrono. Le rythme Blitz (5 s par coup) ne vient que sur les variantes maîtrisées.', action: 'theorie' },
    { id: 'rapide', titre: '1 partie rapide', min: 25, texte: 'Une partie en 10 minutes. À CHAQUE coup : « son coup d’abord ».', lien: { url: 'https://www.chess.com/play/online', label: 'Chess.com : jouer' } },
    { id: 'analyse', titre: 'Analyse', min: 10, texte: 'Rejoue ta partie rapide moteur coupé : compte les menaces adverses ratées. Ensuite seulement, Game Review.', lien: { url: '#/parties', label: 'Mes parties', interne: true } },
    { id: 'blitz', titre: 'Blitz (récompense)', min: 15, texte: '5 parties maximum. 2 défaites d’affilée = stop pour aujourd’hui.', lien: { url: 'https://lichess.org/', label: 'Lichess : jouer' } },
  ];
  return dimanche ? { dimanche, blocs: tous.filter((b) => b.id === 'theorie') } : { dimanche, blocs: tous };
}

export function charger(storage = globalThis.localStorage) {
  try { const d = JSON.parse(storage.getItem(KEY) || 'null'); return d && typeof d.jours === 'object' && d.jours ? d : { jours: {} }; } catch { return { jours: {} }; }
}

export function enregistrer(data, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify(data)); } catch { /* stockage plein */ }
}

export function cocher(data, date, bloc, fait) {
  const j = data.jours[date] ??= { faits: [] };
  j.faits = fait ? [...new Set([...j.faits, bloc])] : j.faits.filter((b) => b !== bloc);
  return data;
}

// Suivi du soir : menaces ratées (partie rapide), parties de Blitz, problèmes réussis sur 10.
export const SUIVI = {
  menaces: { label: 'Menaces adverses ratées dans ma partie rapide', min: 0, max: 50 },
  blitz: { label: 'Parties de Blitz jouées (5 max)', min: 0, max: 50 },
  problemes: { label: 'Problèmes réussis du 1er coup, sur 10', min: 0, max: 10 },
};

export function noter(data, date, champ, valeur) {
  const j = data.jours[date] ??= { faits: [] };
  const s = SUIVI[champ];
  const n = valeur === '' || valeur == null ? null : Math.round(Number(valeur));
  j[champ] = n == null || Number.isNaN(n) ? null : Math.min(s.max, Math.max(s.min, n));
  return data;
}

// Les N derniers jours (le plus récent d'abord) et la série de jours où la routine est complète.
export function historique(data, date = jour(), n = 7) {
  const out = [];
  const t = numJour(date);
  for (let i = 0; i < n; i++) {
    const d = jour(new Date((t - i) * 86400000 + 12 * 3600000));
    const j = data.jours[d] || { faits: [] };
    out.push({ date: d, faits: j.faits.length, total: blocsDuJour(d).blocs.length, menaces: j.menaces ?? null, blitz: j.blitz ?? null, problemes: j.problemes ?? null });
  }
  return out;
}

export function serie(data, date = jour()) {
  let s = 0;
  const t = numJour(date);
  for (let i = 0; ; i++) {
    const d = jour(new Date((t - i) * 86400000 + 12 * 3600000));
    const j = data.jours[d];
    const total = blocsDuJour(d).blocs.length;
    if (j && j.faits.length >= total) s++;
    else if (i > 0) break; // aujourd'hui pas encore fini : la série d'hier compte
    if (i > 400) break;
  }
  return s;
}
