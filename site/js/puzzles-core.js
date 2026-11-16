// Problèmes Lichess dans l'application (logique pure). Source : API publique Lichess
// GET /api/puzzle/next?angle=<thème> (base de problèmes Lichess, licence CC0) ; rien n'est inventé :
// la position, le dernier coup adverse et la solution viennent tels quels de Lichess.
import { Chess } from '../vendor/chess.js';

export const PUZZLE_URL = 'https://lichess.org/api/puzzle/next';
export const N_PROBLEMES = 10;

export const urlProbleme = (theme, difficulty = 'easier') =>
  `${PUZZLE_URL}?angle=${encodeURIComponent(theme)}&difficulty=${encodeURIComponent(difficulty)}`;

// Réponse Lichess → problème utilisable, ou null si la réponse est incomplète ou incohérente.
export function lireProbleme(json) {
  const p = json?.puzzle;
  const g = json?.game;
  if (!p?.id || !Array.isArray(p.solution) || !p.solution.length) return null;
  const sans = String(g?.pgn || '').split(/\s+/).filter(Boolean);
  // Position du problème : on rejoue la partie (le dernier coup est le coup adverse à observer).
  const c = new Chess();
  const coups = [];
  try { for (const s of sans) coups.push(c.move(s)); } catch { return null; }
  const last = coups.at(-1) || null;
  if (!last) return null;
  const fen = c.fen();
  if (p.fen && p.fen.split(' ')[0] !== fen.split(' ')[0]) return null;
  // La solution doit être jouable de bout en bout.
  const v = new Chess(fen);
  try { for (const u of p.solution) v.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { return null; }
  c.undo();
  return {
    id: String(p.id),
    rating: p.rating ?? null,
    themes: p.themes || [],
    fenAvant: c.fen(), // position avant le dernier coup adverse
    dernier: { from: last.from, to: last.to, promotion: last.promotion, san: last.san, lan: last.lan },
    fen,
    solution: p.solution.map(String),
    url: `https://lichess.org/training/${encodeURIComponent(p.id)}`,
  };
}

// Coup de l'utilisateur au demi-coup `i` de la solution. Règle Lichess : le coup attendu, ou
// n'importe quel coup qui fait mat. Retour : 'ok' | 'mat' | 'ko'.
export function verdict(fen, uci, solution, i) {
  if (uci === solution[i]) return 'ok';
  const c = new Chess(fen);
  try { c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return 'ko'; }
  return c.isCheckmate() ? 'mat' : 'ko';
}

// Réussi = résolu sans erreur ni solution affichée.
export function bilan(resultats) {
  const total = resultats.length;
  const ok = resultats.filter((r) => r.reussi).length;
  return { total, ok };
}
