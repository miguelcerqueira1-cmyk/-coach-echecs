// « Ma routine du jour » (logique pure) : blocs du jour, cases cochées et suivi du soir, conservés
// par date sur l'appareil (clé coach-echecs:routine-v1, exportée par « Mes données »).
// Lundi → samedi : 6 blocs ; dimanche : jour off (théorie seulement).

import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

export const KEY = 'coach-echecs:routine-v1';

// Thèmes de problèmes Lichess (anti-vision tunnel), en alternance un jour sur deux.
export const THEMES = [
  { id: 'hangingPiece', nom: L('Pièce en prise', 'Hanging piece'), url: 'https://lichess.org/training/hangingPiece' },
  { id: 'defensiveMove', nom: L('Coup défensif', 'Defensive move'), url: 'https://lichess.org/training/defensiveMove' },
];

// Niveau des problèmes Lichess (paramètre `difficulty` de l'API, sans compte : relatif à 1500).
// Fourchettes observées le 2026-11-16 sur l'API (thème « Pièce en prise »).
export const NIVEAUX = [
  { id: 'easiest', nom: L('Très facile (≈ 700–850)', 'Very easy (≈ 700–850)') },
  { id: 'easier', nom: L('Facile (≈ 950–1250)', 'Easy (≈ 950–1250)') },
  { id: 'normal', nom: L('Moyen (≈ 1500)', 'Medium (≈ 1500)') },
];
// Chrono par problème (secondes, 0 = sans chrono) : s'entraîner à trouver vite, sans tout calculer.
export const CHRONOS = [0, 30, 15];
export const chronoProblemes = (data) => (CHRONOS.includes(Number(data?.chrono)) ? Number(data.chrono) : 0);
export const niveauProblemes = (data) => (NIVEAUX.some((n) => n.id === data?.niveau) ? data.niveau : 'easiest');

// Date locale « AAAA-MM-JJ ».
export function jour(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const numJour = (date) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000);

// Profil de routine (3 questions au premier lancement) : temps par jour, sites, cadences.
// Profil « historique » : la routine d'origine (6 blocs, ~80 min, Lichess + Chess.com, Blitz +
// Rapide), gardée telle quelle pour les utilisateurs qui avaient déjà commencé.
export const TEMPS = [20, 45, 90];
export const SITES = { lichess: 'Lichess', chesscom: 'Chess.com' };
export const CADENCES = { bullet: 'Bullet', blitz: 'Blitz', rapide: L('Rapide', 'Rapid') };
export const PROFIL_HISTORIQUE = { temps: 90, sites: ['lichess', 'chesscom'], cadences: ['blitz', 'rapide'] };

// Profil enregistré, sinon historique si la routine a déjà servi, sinon null (questions à poser).
export function profilDe(data) {
  const p = data?.profil;
  if (p && TEMPS.includes(Number(p.temps)) && Array.isArray(p.sites) && Array.isArray(p.cadences)) return p;
  return data && Object.keys(data.jours || {}).length ? PROFIL_HISTORIQUE : null;
}

export function normaliserProfil({ temps, sites = [], cadences = [] } = {}) {
  const t = TEMPS.includes(Number(temps)) ? Number(temps) : 45;
  const si = sites.filter((x) => SITES[x]);
  const ca = cadences.filter((x) => CADENCES[x]);
  return { temps: t, sites: si.length ? si : ['lichess'], cadences: ca.length ? ca : ['blitz'] };
}

const JOUER = { lichess: { url: 'https://lichess.org/', label: L('Lichess : jouer', 'Lichess: play') }, chesscom: { url: 'https://www.chess.com/play/online', label: L('Chess.com : jouer', 'Chess.com: play') } };
const VITESSE = {
  chesscom: { texte: L('Un seul Puzzle Rush de 3 minutes : échauffement des réflexes.', 'A single 3-minute Puzzle Rush: reflex warm-up.'), lien: { url: 'https://www.chess.com/puzzles/rush', label: L('Chess.com : Puzzle Rush', 'Chess.com: Puzzle Rush') } },
  lichess: { texte: L('Un seul Puzzle Storm de 3 minutes : échauffement des réflexes.', 'A single 3-minute Puzzle Storm: reflex warm-up.'), lien: { url: 'https://lichess.org/storm', label: L('Lichess : Puzzle Storm', 'Lichess: Puzzle Storm') } },
};

export function blocsDuJour(date = jour(), profil = PROFIL_HISTORIQUE) {
  const p = profil || PROFIL_HISTORIQUE;
  const dimanche = new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
  const theme = THEMES[numJour(date) % THEMES.length];
  const historique = p === PROFIL_HISTORIQUE;
  // Site pour jouer : Chess.com pour la partie longue et Lichess pour le Blitz dans la routine
  // d'origine ; sinon le premier site choisi.
  const site = p.sites[0];
  const vit = VITESSE[p.sites.includes('chesscom') ? 'chesscom' : 'lichess'];
  const rapide = p.cadences.includes('rapide');
  const court = p.cadences.filter((c) => c !== 'rapide');
  const nomCourt = court.map((c) => CADENCES[c]).join(' / ');
  const tous = [
    { id: 'tactique', titre: L('Tactique anti-tunnel', 'Anti-tunnel tactics'), min: p.temps === 20 ? 8 : 15, texte: L(`${p.temps === 20 ? 5 : 10} problèmes, thème « ${theme.nom} », ici dans l’appli (chrono au choix). Avant de jouer : qu’a changé le dernier coup adverse ?`, `${p.temps === 20 ? 5 : 10} puzzles, theme “${theme.nom}”, here in the app (optional timer). Before moving: what did the opponent’s last move change?`), action: 'problemes', n: p.temps === 20 ? 5 : 10, theme, lien: { url: theme.url, label: L('ou sur Lichess', 'or on Lichess') } },
    p.temps >= 45 && { id: 'vitesse', titre: L('Vitesse', 'Speed'), min: 5, ...vit },
    { id: 'theorie', titre: L('Théorie', 'Theory'), min: p.temps === 20 ? 12 : 10, texte: L('Apprendre 1 nouvelle variante, puis réviser celles déjà apprises, sans chrono. Le rythme Blitz (5 s par coup) ne vient que sur les variantes maîtrisées.', 'Learn 1 new line, then review the ones already learned, without a timer. Blitz pace (5 s per move) only comes on mastered lines.'), action: 'theorie' },
    p.temps >= 45 && rapide && { id: 'rapide', titre: L('1 partie rapide', '1 rapid game'), min: 25, texte: L('Une partie en 10 minutes. À CHAQUE coup : « son coup d’abord ».', 'One 10-minute game. On EVERY move: “their move first”.'), lien: historique ? JOUER.chesscom : JOUER[site] },
    p.temps >= 45 && rapide && { id: 'analyse', titre: L('Analyse', 'Analysis'), min: 10, texte: L('Rejoue ta partie rapide moteur coupé : compte les menaces adverses ratées. Ensuite seulement, l’analyse du moteur (Mes parties).', 'Replay your rapid game with the engine off: count the opponent threats you missed. Only then, the engine analysis (My games).'), lien: { url: '#/parties', label: L('Mes parties', 'My games'), interne: true } },
    p.temps >= 45 && court.length && { id: 'blitz', titre: L(`${nomCourt} (récompense)`, `${nomCourt} (reward)`), min: p.temps >= 90 ? 15 : 10, texte: L(`${p.temps >= 90 ? 5 : 3} parties maximum. 2 défaites d’affilée = stop pour aujourd’hui.`, `${p.temps >= 90 ? 5 : 3} games maximum. 2 losses in a row = stop for today.`), lien: historique ? JOUER.lichess : JOUER[site] },
  ].filter(Boolean);
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

// Suivi du soir : menaces ratées (partie rapide), parties de Blitz, Blitz perdus au temps (rempli
// tout seul par « Mes parties » s'il est vide), problèmes réussis sur 10.
export const SUIVI = {
  menaces: { label: L('Menaces adverses ratées dans ma partie rapide', 'Opponent threats missed in my rapid game'), min: 0, max: 50 },
  blitz: { label: L('Parties de Blitz jouées (5 max)', 'Blitz games played (5 max)'), min: 0, max: 50 },
  temps: { label: L('Blitz perdus au temps', 'Blitz games lost on time'), min: 0, max: 50 },
  problemes: { label: L('Problèmes réussis du 1er coup, sur 10', 'Puzzles solved on the first try, out of 10'), min: 0, max: 10 },
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
    out.push({ date: d, faits: j.faits.length, total: blocsDuJour(d, profilDe(data)).blocs.length, menaces: j.menaces ?? null, blitz: j.blitz ?? null, temps: j.temps ?? null, problemes: j.problemes ?? null });
  }
  return out;
}

export function serie(data, date = jour()) {
  let s = 0;
  const t = numJour(date);
  for (let i = 0; ; i++) {
    const d = jour(new Date((t - i) * 86400000 + 12 * 3600000));
    const j = data.jours[d];
    const total = blocsDuJour(d, profilDe(data)).blocs.length;
    if (j && j.faits.length >= total) s++;
    else if (i > 0) break; // aujourd'hui pas encore fini : la série d'hier compte
    if (i > 400) break;
  }
  return s;
}
