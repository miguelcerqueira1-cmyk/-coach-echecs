// Brouillon d'analyse (page Moteur) : coups essayés à partir d'une position de la partie,
// gardés à part. La partie réelle (Game) n'est jamais modifiée par un brouillon.
import { Chess } from '../vendor/chess.js';

const uciObj = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length === 5 ? { promotion: uci[4] } : {}) });

let compteur = 0;

export class Variante {
  // startFen : départ de la partie ; baseUcis : coups réels jusqu'à la position de départ du brouillon.
  constructor(startFen, baseUcis, basePly) {
    this.id = ++compteur;
    this.startFen = startFen;
    this.baseUcis = baseUcis.slice(0, basePly);
    this.base = basePly;
    this.coups = []; // coups verbeux chess.js
    this.cur = 0; // nombre de coups du brouillon affichés (navigation)
    this.revision = 0;
    const c = new Chess(startFen);
    for (const u of this.baseUcis) c.move(uciObj(u));
    this.baseFen = c.fen();
  }

  chessAt(n = this.cur) {
    const c = new Chess(this.baseFen);
    for (let i = 0; i < n; i++) c.move(uciObj(this.coups[i].lan));
    return c;
  }

  fen() { return this.chessAt().fen(); }
  turn() { return this.fen().split(' ')[1]; }
  lastMove() { return this.cur > 0 ? this.coups[this.cur - 1] : null; }
  over() { const c = this.chessAt(); return c.isGameOver(); }

  // Joue un coup à la position affichée ; les coups suivants du brouillon sont remplacés.
  // `input` : {from, to, promotion} ou UCI. Lève une erreur si le coup est illégal.
  play(input) {
    const c = this.chessAt();
    let mv;
    try { mv = c.move(typeof input === 'string' ? uciObj(input) : input); } catch { throw new Error('Coup illégal dans cette position'); }
    this.coups = this.coups.slice(0, this.cur);
    this.coups.push(mv);
    this.cur = this.coups.length;
    this.revision++;
    return mv;
  }

  // Retire le dernier coup affiché (et ceux d'après). Renvoie false si le brouillon est vide.
  retirer() {
    if (!this.cur) return false;
    this.coups = this.coups.slice(0, this.cur - 1);
    this.cur = this.coups.length;
    this.revision++;
    return true;
  }

  aller(n) {
    const v = Math.max(0, Math.min(this.coups.length, n));
    if (v !== this.cur) { this.cur = v; this.revision++; }
    return this.cur;
  }

  // Coups (UCI) depuis le départ de la partie jusqu'à la position affichée du brouillon.
  ucis() { return [...this.baseUcis, ...this.coups.slice(0, this.cur).map((m) => m.lan)]; }

  // Numérotation des coups du brouillon : [{ i, no, color, san }] (no = numéro du coup).
  numeros() {
    const [, turn, , , , full] = this.baseFen.split(' ');
    let no = Number(full || 1);
    let color = turn;
    return this.coups.map((m, i) => {
      const r = { i, no, color, san: m.san };
      if (color === 'b') no++;
      color = color === 'w' ? 'b' : 'w';
      return r;
    });
  }
}
