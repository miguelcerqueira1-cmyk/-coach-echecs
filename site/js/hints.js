// Indices progressifs (mode « Indice d'abord ») : tirés du coup calculé par Stockfish
// et de vérifications chess.js, sans révéler le coup avant le dernier niveau.
//   niveau 1 : thème + type de pièce
//   niveau 2 : case de départ + explication sans le coup
//   niveau 3 : le coup (affichage normal)
import { menaceSerieuse, piecesEnDanger } from './explain-free.js';
import { langue } from './i18n.js';

// Phrases en français ou en anglais selon la langue de l'interface.
const L = (fr, en) => (langue() === 'en' ? en : fr);

const ART = { p: 'un pion', n: 'un Cavalier', b: 'un Fou', r: 'une Tour', q: 'la Dame', k: 'le Roi' };
const ART_EN = { p: 'a pawn', n: 'a knight', b: 'a bishop', r: 'a rook', q: 'the queen', k: 'the king' };

export function indicesNiveau1(advice, threat, color) {
  const m = advice.best;
  const out = [];
  const s = advice.scoreWhite;
  const forUs = s && s.type === 'mate' && (color === 'w' ? s.value > 0 : s.value < 0);
  if (m.san.endsWith('#')) out.push(L('Il y a un <strong>mat en un coup</strong> !', 'There is a <strong>mate in one</strong>!'));
  else if (forUs) out.push(L(`Une suite forcée mène au mat (mat en ${Math.abs(s.value)} selon le moteur).`, `A forced sequence leads to mate (mate in ${Math.abs(s.value)} according to the engine).`));
  else if (m.captured) out.push(L('Il y a quelque chose à <strong>prendre</strong>.', 'There is something to <strong>capture</strong>.'));
  else if (m.san.endsWith('+')) out.push(L('Un <strong>échec</strong> est le coup le plus fort.', 'A <strong>check</strong> is the strongest move.'));
  else if (m.san.startsWith('O-O')) out.push(L('Pensez à la <strong>sécurité de votre Roi</strong>.', 'Think about your <strong>king’s safety</strong>.'));
  else if (threat && menaceSerieuse(advice, threat, color) && threat.move.to === m.from) {
    out.push(L('Une de vos pièces est <strong>menacée</strong> : occupez-vous-en.', 'One of your pieces is <strong>threatened</strong>: deal with it.'));
  } else if (m.promotion) out.push(L('Un pion peut aller à <strong>promotion</strong>.', 'A pawn can <strong>promote</strong>.'));
  else {
    const danger = piecesEnDanger(advice.fen, color === 'w' ? 'b' : 'w');
    if (danger.length) out.push(L('Une pièce adverse est <strong>mal protégée</strong>.', 'An enemy piece is <strong>poorly protected</strong>.'));
    else out.push(L('Pas de tactique immédiate : cherchez le <strong>meilleur placement</strong> d’une pièce.', 'No immediate tactic: look for the <strong>best square</strong> for a piece.'));
  }
  if (!m.san.startsWith('O-O')) out.push(L(`Pièce à jouer : <strong>${ART[m.piece]}</strong>.`, `Piece to move: <strong>${ART_EN[m.piece]}</strong>.`));
  return out;
}

export function indiceNiveau2(advice) {
  if (advice.best.san.startsWith('O-O')) return L('Le coup concerne votre Roi et une Tour.', 'The move involves your king and a rook.');
  return L(`La pièce à jouer est en <strong>${advice.best.from}</strong> (case entourée sur l’échiquier).`, `The piece to move is on <strong>${advice.best.from}</strong> (square circled on the board).`);
}
