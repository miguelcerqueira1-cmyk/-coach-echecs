// Indices progressifs (mode « Indice d'abord ») : tirés du coup calculé par Stockfish
// et de vérifications chess.js, sans révéler le coup avant le dernier niveau.
//   niveau 1 : thème + type de pièce
//   niveau 2 : case de départ + explication sans le coup
//   niveau 3 : le coup (affichage normal)
import { menaceSerieuse, piecesEnDanger } from './explain-free.js';

const ART = { p: 'un pion', n: 'un Cavalier', b: 'un Fou', r: 'une Tour', q: 'la Dame', k: 'le Roi' };

export function indicesNiveau1(advice, threat, color) {
  const m = advice.best;
  const out = [];
  const s = advice.scoreWhite;
  const forUs = s && s.type === 'mate' && (color === 'w' ? s.value > 0 : s.value < 0);
  if (m.san.endsWith('#')) out.push('Il y a un <strong>mat en un coup</strong> !');
  else if (forUs) out.push(`Une suite forcée mène au mat (mat en ${Math.abs(s.value)} selon le moteur).`);
  else if (m.captured) out.push('Il y a quelque chose à <strong>prendre</strong>.');
  else if (m.san.endsWith('+')) out.push('Un <strong>échec</strong> est le coup le plus fort.');
  else if (m.san.startsWith('O-O')) out.push('Pensez à la <strong>sécurité de votre Roi</strong>.');
  else if (threat && menaceSerieuse(advice, threat, color) && threat.move.to === m.from) {
    out.push('Une de vos pièces est <strong>menacée</strong> : occupez-vous-en.');
  } else if (m.promotion) out.push('Un pion peut aller à <strong>promotion</strong>.');
  else {
    const danger = piecesEnDanger(advice.fen, color === 'w' ? 'b' : 'w');
    if (danger.length) out.push('Une pièce adverse est <strong>mal protégée</strong>.');
    else out.push('Pas de tactique immédiate : cherchez le <strong>meilleur placement</strong> d’une pièce.');
  }
  if (!m.san.startsWith('O-O')) out.push(`Pièce à jouer : <strong>${ART[m.piece]}</strong>.`);
  return out;
}

export function indiceNiveau2(advice) {
  if (advice.best.san.startsWith('O-O')) return 'Le coup concerne votre Roi et une Tour.';
  return `La pièce à jouer est en <strong>${advice.best.from}</strong> (case entourée sur l’échiquier).`;
}
