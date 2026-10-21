// Lecture des lignes du répertoire (« 1. d4 d5 2. c4? … ») et validation par chess.js.
// Utilisé par le navigateur et par les scripts de génération/vérification.
import { Chess } from '../vendor/chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function epd(fen) { return fen.split(' ').slice(0, 4).join(' '); }

// Découpe en coups SAN, en retirant numéros et annotations ; mémorise les coups marqués « ? ».
export function tokenize(text) {
  const out = [];
  for (const raw of text.trim().split(/\s+/)) {
    const t = raw.replace(/^\d+\.(\.\.)?/, '').replace(/^…/, '');
    if (!t) continue;
    const m = t.match(/^(.*?)([!?]+)?$/);
    out.push({ san: m[1], annotation: m[2] || '' });
  }
  return out;
}

// Rejoue la ligne ; lève une erreur précise si un coup est illégal.
export function playLine(text, startFen = START_FEN) {
  const c = new Chess(startFen);
  const moves = [];
  const fens = [c.fen()];
  let marked = -1;
  for (const tok of tokenize(text)) {
    let mv;
    try {
      mv = c.move(tok.san);
    } catch {
      throw new Error(`Coup illégal « ${tok.san} » dans : ${text}`);
    }
    if (marked < 0 && tok.annotation.includes('?')) marked = moves.length;
    moves.push(mv);
    fens.push(c.fen());
  }
  return { moves, fens, marked, uci: moves.map((m) => m.lan), san: moves.map((m) => m.san) };
}

// Index ECO : position (EPD) → { eco, name }, construit depuis les TSV de lichess-org/chess-openings.
export function buildEcoIndex(tsvTexts) {
  const index = new Map();
  for (const tsv of tsvTexts) {
    for (const row of tsv.split('\n').slice(1)) {
      if (!row.trim()) continue;
      const [eco, name, pgn] = row.split('\t');
      const { fens } = playLine(pgn);
      index.set(epd(fens.at(-1)), { eco, name, pgn });
    }
  }
  return index;
}

// Ouverture nommée la plus profonde rencontrée le long de la ligne (gère les transpositions).
export function classify(index, fens) {
  let found = null;
  for (const f of fens) {
    const hit = index.get(epd(f));
    if (hit) found = hit;
  }
  return found;
}

// Empreinte d'une fiche : la vérification moteur n'est valable que pour ce contenu exact.
export function entryFingerprint(e) {
  const s = JSON.stringify([e.ligne, e.punition?.ligne || '', e.piege?.ligne || '', e.punition?.minCp || 0, e.piege?.minCp || 0]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
