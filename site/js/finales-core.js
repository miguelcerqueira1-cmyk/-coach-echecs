// Finales essentielles (logique pure). Après chaque coup, l'évaluation Stockfish (du point de vue de
// l'utilisateur) dit si le but est toujours atteignable : gain gardé pour 'mat' / 'promotion',
// pas de perte pour 'nulle'. Les fins de partie (mat, pat, nulles) sont lues par chess.js.

// Seuils : en dessous, le but est compromis (gain perdu, ou position perdue en défense).
export const SEUIL = { mat: 300, promotion: 300, nulle: -150 };

// Centipions du point de vue de `camp` (mat = ±10000) à partir d'un score UCI du camp au trait.
export function cpPour(score, trait, camp) {
  if (!score) return null;
  const v = score.type === 'mate' ? Math.sign(score.value || -1) * (10000 - Math.abs(score.value)) : score.value;
  return trait === camp ? v : -v;
}

const nulleParRegle = (c) => c.isStalemate() || c.isInsufficientMaterial() || c.isThreefoldRepetition() || c.isDraw();

// Après un coup de l'UTILISATEUR. f : finale ; chess : position après le coup ; coup : coup chess.js ;
// n : nombre de coups joués par l'utilisateur ; cp : évaluation après le coup (null si inconnue).
// Retour : { etat: 'continue' | 'reussi' | 'rate', raison }.
export function apresMonCoup(f, chess, coup, n, cp) {
  if (chess.isCheckmate()) return { etat: 'reussi', raison: 'Échec et mat !' };
  if (nulleParRegle(chess)) {
    if (f.but === 'nulle') return { etat: 'reussi', raison: 'Nulle obtenue.' };
    return { etat: 'rate', raison: chess.isStalemate() ? 'Pat ! Le roi adverse n’a plus aucun coup mais n’est pas en échec : c’est nulle.' : 'La partie est nulle : le gain est perdu.' };
  }
  if (cp != null && cp < SEUIL[f.but]) {
    return { etat: 'rate', raison: f.but === 'nulle' ? 'Ce coup perd : la nulle n’est plus tenable.' : 'Ce coup laisse échapper le gain.' };
  }
  if (f.but === 'promotion' && coup.promotion) return { etat: 'reussi', raison: 'Pion promu, et la position reste gagnante !' };
  if (f.but === 'nulle' && n >= f.limite) return { etat: 'reussi', raison: `${f.limite} coups tenus sans perdre : nulle !` };
  if (f.but !== 'nulle' && n >= f.limite) return { etat: 'rate', raison: `Le but n’est pas atteint en ${f.limite} coups : trop long.` };
  return { etat: 'continue' };
}

// Après la réponse de l'ADVERSAIRE (Stockfish).
export function apresSonCoup(f, chess) {
  if (chess.isCheckmate()) return { etat: 'rate', raison: 'Tu es mat.' };
  if (nulleParRegle(chess)) {
    return f.but === 'nulle' ? { etat: 'reussi', raison: 'Nulle obtenue.' } : { etat: 'rate', raison: 'La partie est nulle : le gain est perdu.' };
  }
  return { etat: 'continue' };
}

// Progression : { id: { ok, sansIndice, essais, date } }.
export function noterFinale(p, id, { ok, indices = 0, date = new Date().toISOString() }) {
  const prev = p[id] || { ok: false, sansIndice: false, essais: 0 };
  p[id] = { ok: prev.ok || ok, sansIndice: prev.sansIndice || (ok && !indices), essais: prev.essais + 1, date };
  return p;
}
