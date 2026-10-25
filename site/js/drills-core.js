// Construction des exercices (logique pure) : ligne complète d'une fiche, punition
// chronométrée d'un coup douteux (« anti-trash »), raison d'un coup refusé, série de réussites.
import { Chess } from '../vendor/chess.js';
import { sanFr } from './analysis.js';
import { piecesEnDanger } from './explain-free.js';

const mover = (i) => (i % 2 === 0 ? 'w' : 'b');

// Ligne d'une fiche : chaque demi-coup, avec qui le joue.
export function lineSteps(entry, color) {
  return entry.uci.map((uci, i) => ({ uci, san: entry.san[i], ours: mover(i) === color, ply: i }));
}

// Drill anti-trash : position avant le coup douteux adverse, ce coup, puis la séquence de
// punition (au plus `maxOurs` de nos coups). null si la fiche n'a pas de punition adverse.
export function trashDrill(entry, color, maxOurs = 5) {
  const p = entry.punition;
  if (!p || p.marked == null || mover(p.marked) === color) return null;
  const steps = [];
  let ours = 0;
  for (let i = p.marked + 1; i < p.uci.length; i++) {
    const s = { uci: p.uci[i], san: p.san[i], ours: mover(i) === color, ply: i };
    if (s.ours) { if (ours === maxOurs) break; ours++; }
    steps.push(s);
  }
  while (steps.length && !steps.at(-1).ours) steps.pop(); // finir sur notre coup
  if (!ours) return null;
  return {
    id: entry.id,
    setup: p.uci.slice(0, p.marked),
    bad: { uci: p.uci[p.marked], san: p.san[p.marked], ply: p.marked },
    steps,
    ours: steps.filter((s) => s.ours).length,
    texte: p.texte,
  };
}

// Seuil pour accepter un autre coup que celui de la fiche : presque aussi bon que la punition
// vérifiée par Stockfish (au plus 0,6 pion de moins), jamais sous +0,5, plafonné à +1,5.
export function seuilAutreCoup(entry, color) {
  const f = entry.verification?.punition?.final;
  if (!f) return 150;
  const v = f.type === 'mate' ? (f.value > 0 ? 10000 : -10000) : f.value; // point de vue des Blancs
  const mine = color === 'w' ? v : -v;
  return Math.max(50, Math.min(150, mine - 60));
}

const ART = { p: 'votre pion', n: 'votre Cavalier', b: 'votre Fou', r: 'votre Tour', q: 'votre Dame' };

// Raison affichée dans la bulle d'un coup refusé. Uniquement des faits : le piège de la fiche
// (ligne vérifiée par Stockfish) ou une pièce laissée en prise selon chess.js ; sinon, le simple
// rappel du coup de la ligne. Aucune évaluation inventée.
export function raisonErreur({ fen, uci, expectedSan = null, trap = null }) {
  if (trap && trap.uci === uci) return `Erreur ! C’est le piège de la fiche : ${trap.texte}`;
  const c = new Chess(fen);
  let mv;
  try { mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return 'Coup impossible ici.'; }
  if (c.isCheckmate()) return null;
  const before = new Set(piecesEnDanger(fen, mv.color).map((p) => p.square));
  const after = piecesEnDanger(c.fen(), mv.color);
  const moved = after.find((p) => p.square === mv.to);
  const fresh = moved || after.find((p) => !before.has(p.square));
  const attendu = expectedSan ? ` Ici, on joue ${sanFr(expectedSan)}.` : '';
  if (fresh) {
    const qui = ART[fresh.type] || 'une pièce';
    return `Erreur ! Après ${sanFr(mv.san)}, ${qui} en ${fresh.square} ${fresh.defended ? 'peut être pris avec gain de matériel' : 'peut être pris sans contrepartie'}.${attendu}`;
  }
  return `Ce n’est pas le coup de la ligne.${attendu}`;
}

// Série de réussites du premier coup (remise à zéro à la première erreur).
export function nextStreak(state, firstTry) {
  const cur = firstTry ? state.cur + 1 : 0;
  return { cur, best: Math.max(state.best, cur) };
}
