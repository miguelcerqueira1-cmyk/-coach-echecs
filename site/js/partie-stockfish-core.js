// Partie contre Stockfish à niveau réglable (logique pure, testée par node:test).
// Niveaux 1 à 6 : option UCI « Skill Level » de Stockfish (0 à 20 ; le moteur choisit volontairement
// des coups moins bons). Niveaux 7 à 9 : « UCI_LimitStrength » + « UCI_Elo », échelle Elo officielle
// de Stockfish (calibrée par ses développeurs contre d'autres moteurs, PAS l'échelle Lichess ou
// Chess.com). Niveau 10 : pleine force. Aucune correspondance avec un classement humain n'est affirmée.
import { Chess } from '../vendor/chess.js';
import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

export const KEY = 'coach-echecs:stockfish-v1';

export const NIVEAUX_SF = [
  { n: 1, force: { skill: 0 }, movetime: 50, nom: L('Niveau 1 — débutant (Skill 0)', 'Level 1 — beginner (Skill 0)') },
  { n: 2, force: { skill: 2 }, movetime: 80, nom: L('Niveau 2 (Skill 2)', 'Level 2 (Skill 2)') },
  { n: 3, force: { skill: 4 }, movetime: 120, nom: L('Niveau 3 (Skill 4)', 'Level 3 (Skill 4)') },
  { n: 4, force: { skill: 6 }, movetime: 160, nom: L('Niveau 4 (Skill 6)', 'Level 4 (Skill 6)') },
  { n: 5, force: { skill: 9 }, movetime: 250, nom: L('Niveau 5 (Skill 9)', 'Level 5 (Skill 9)') },
  { n: 6, force: { skill: 12 }, movetime: 350, nom: L('Niveau 6 (Skill 12)', 'Level 6 (Skill 12)') },
  { n: 7, force: { elo: 1500 }, movetime: 500, nom: L('Niveau 7 (Elo Stockfish 1500)', 'Level 7 (Stockfish Elo 1500)') },
  { n: 8, force: { elo: 1900 }, movetime: 700, nom: L('Niveau 8 (Elo Stockfish 1900)', 'Level 8 (Stockfish Elo 1900)') },
  { n: 9, force: { elo: 2400 }, movetime: 900, nom: L('Niveau 9 (Elo Stockfish 2400)', 'Level 9 (Stockfish Elo 2400)') },
  { n: 10, force: null, movetime: 1500, nom: L('Niveau 10 — pleine force', 'Level 10 — full strength') },
];
export const niveauSF = (n) => NIVEAUX_SF.find((x) => x.n === Number(n)) || NIVEAUX_SF[2];

// Fin de partie selon chess.js (règles FIDE : mat, pat, matériel insuffisant, répétition, 50 coups).
// Renvoie null si la partie continue, sinon { resultat: '1-0' | '0-1' | '½-½', raison }.
export function finDePartie(chess) {
  if (chess.isCheckmate()) return { resultat: chess.turn() === 'w' ? '0-1' : '1-0', raison: L('échec et mat', 'checkmate') };
  if (chess.isStalemate()) return { resultat: '½-½', raison: L('pat', 'stalemate') };
  if (chess.isInsufficientMaterial()) return { resultat: '½-½', raison: L('matériel insuffisant', 'insufficient material') };
  if (chess.isThreefoldRepetition()) return { resultat: '½-½', raison: L('triple répétition', 'threefold repetition') };
  if (chess.isDraw()) return { resultat: '½-½', raison: L('règle des 50 coups', '50-move rule') };
  return null;
}

// Résultat vu par l'utilisateur ('v' victoire, 'n' nulle, 'd' défaite).
export function pourMoi(resultat, camp) {
  if (resultat === '½-½') return 'n';
  return (resultat === '1-0') === (camp === 'w') ? 'v' : 'd';
}

export function lire(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? { niveaux: {}, ...v } : { niveaux: {} }; } catch { return { niveaux: {} }; }
}
export function ecrire(d, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify(d)); } catch { /* stockage plein */ }
}

// Bilan par niveau { v, n, d } ; le dernier réglage est retenu pour la prochaine partie.
export function noterPartie(data, niveau, issue) {
  const niveaux = { ...data.niveaux };
  const b = { v: 0, n: 0, d: 0, ...(niveaux[niveau] || {}) };
  b[issue]++;
  niveaux[niveau] = b;
  return { ...data, niveaux };
}

// Conseil de niveau : monter après 2 victoires d'affilée au même niveau est laissé à l'utilisateur ;
// on propose seulement le niveau au-dessus quand le bilan du niveau est positif sur 3 parties ou plus.
export function niveauConseille(data, courant) {
  const b = data.niveaux?.[courant];
  if (!b) return null;
  const total = b.v + b.n + b.d;
  if (total >= 3 && (b.v + b.n / 2) / total >= 0.6 && courant < 10) return courant + 1;
  return null;
}

// Position de départ : partie normale ou fin de la ligne d'une fiche (SAN anglais).
export function departDepuis(sanMoves = []) {
  const c = new Chess();
  for (const s of sanMoves) c.move(s);
  return c;
}

// PGN de la partie (pour l'ouvrir sur l'échiquier Moteur ou l'exporter).
export function pgnPartie(chess, { camp, niveau, date = new Date() }) {
  chess.header('Event', L(`BlitzRefute — partie contre Stockfish (niveau ${niveau})`, `BlitzRefute — game against Stockfish (level ${niveau})`), 'Date', date.toISOString().slice(0, 10).replaceAll('-', '.'),
    'White', camp === 'w' ? L('Moi', 'Me') : L(`Stockfish niveau ${niveau}`, `Stockfish level ${niveau}`), 'Black', camp === 'b' ? L('Moi', 'Me') : L(`Stockfish niveau ${niveau}`, `Stockfish level ${niveau}`));
  return chess.pgn();
}
