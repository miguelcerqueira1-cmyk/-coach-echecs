// Partie contre Stockfish à niveau réglable (page Entraînement). L'utilisateur joue son camp,
// Stockfish répond avec la force choisie (partie-stockfish-core). Reprendre un coup, abandonner,
// proposer… rien n'est inventé : la fin de partie vient de chess.js, les coups de Stockfish.
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { sanFr } from './analysis.js';
import { niveauSF, finDePartie, pourMoi, lire, ecrire, noterPartie, niveauConseille, pgnPartie } from './partie-stockfish-core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ISSUE = { v: '🏆 Victoire', n: '🤝 Nulle', d: '✘ Défaite' };

export class StockfishGameRunner {
  // depart : { chess (position de départ), titre } ; onAnalyse(san, camp, label) ouvre la partie sur la page Moteur.
  constructor({ el, engine, niveau, camp, depart, onDone, onAnalyse }) {
    this.el = el;
    this.engine = engine;
    this.niv = niveauSF(niveau);
    this.camp = camp;
    this.depart = depart;
    this.onDone = onDone;
    this.onAnalyse = onAnalyse;
    this.alive = true;
    this.layout();
    this.demarrer();
  }

  $(s) { return this.el.querySelector(s); }
  status(t, cls = '') { const s = this.$('[data-status]'); s.className = `train-status ${cls}`; s.innerHTML = `<span>${t}</span>`; }

  layout() {
    this.el.innerHTML = `<div class="train-layout drill" data-partie-sf>
      <section>
        <div class="train-status" data-status></div>
        <div class="board-wrap" data-board></div>
        <div class="actions">
          <button type="button" data-reprendre>↶ Reprendre mon coup</button>
          <button type="button" data-abandon>🏳 Abandonner</button>
          <button type="button" data-quit>Quitter</button>
        </div>
      </section>
      <section class="card train-panel">
        <h2>🤖 Contre Stockfish — ${esc(this.niv.nom)}</h2>
        <p class="small">Tu joues les <strong>${this.camp === 'w' ? 'Blancs' : 'Noirs'}</strong>${this.depart.titre ? ` · départ : ${esc(this.depart.titre)}` : ''}.</p>
        <p class="small" data-coups></p>
        <div data-feedback class="small"></div>
        <p class="muted tiny">Niveaux 1 à 6 : option « Skill Level » de Stockfish ; 7 à 9 : Elo de l’échelle officielle de Stockfish (pas celle de Lichess ou Chess.com) ; 10 : pleine force.</p>
      </section>
    </div>`;
    this.board = new Board(this.$('[data-board]'), { piecesUrl: './pieces/', onMove: (mv) => this.onMove(mv) });
    this.board.setOrientation(this.camp);
    this.$('[data-quit]').addEventListener('click', () => this.finir());
    this.$('[data-reprendre]').addEventListener('click', () => this.reprendre());
    this.$('[data-abandon]').addEventListener('click', () => { if (!this.fini && window.confirm('Abandonner cette partie ?')) this.terminer({ resultat: this.camp === 'w' ? '0-1' : '1-0', raison: 'abandon' }); });
  }

  demarrer() {
    this.jeton = (this.jeton || 0) + 1;
    this.chess = new Chess();
    for (const m of this.depart.chess.history({ verbose: true })) this.chess.move(m.san);
    this.debut = this.chess.history().length;
    this.fini = false;
    this.attente = false;
    this.reprises = 0;
    this.$('[data-feedback]').innerHTML = '';
    this.dessiner();
    if (this.chess.turn() !== this.camp) this.repondre();
    else this.status('À toi de jouer.', 'player');
  }

  dessiner() {
    const last = this.chess.history({ verbose: true }).at(-1) || null;
    this.board.setPosition(this.chess, { lastMove: last, interactive: !this.fini && !this.attente && this.chess.turn() === this.camp });
    const h = this.chess.history();
    const n = Math.floor((h.length - this.debut + 1) / 2);
    this.$('[data-coups]').textContent = `Coups joués dans la partie : ${n}${this.reprises ? ` · coups repris : ${this.reprises}` : ''}`;
  }

  onMove(mv) {
    if (this.fini || this.attente || !this.alive || this.chess.turn() !== this.camp) return;
    try { this.chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion }); } catch { this.dessiner(); return; }
    const fin = finDePartie(this.chess);
    if (fin) { this.terminer(fin); return; }
    this.repondre();
  }

  async repondre() {
    const jeton = this.jeton;
    this.attente = true;
    this.dessiner();
    this.status('<span class="spinner"></span> Stockfish réfléchit…', 'opponent');
    let r = null;
    if (this.engine?.state === 'ready') {
      try {
        r = await this.engine.analyze({ position: `position fen ${this.chess.fen()}`, movetime: this.niv.movetime, force: this.niv.force, token: { gameId: 'partie-sf', branchId: String(this.jeton), revision: this.chess.history().length, ply: this.chess.history().length } });
      } catch { r = null; }
    }
    if (!this.alive || jeton !== this.jeton) return;
    this.attente = false;
    if (!r || r.cancelled || !r.bestmove || r.bestmove === '(none)') {
      this.status('Stockfish n’a pas répondu. Touche « Reprendre mon coup » puis rejoue, ou réessaie dans un instant.', 'err');
      this.dessiner();
      return;
    }
    const b = r.bestmove;
    const m = this.chess.move({ from: b.slice(0, 2), to: b.slice(2, 4), promotion: b[4] });
    this.dessiner();
    const fin = finDePartie(this.chess);
    if (fin) { this.terminer(fin); return; }
    this.status(`Stockfish a joué <strong>${esc(sanFr(m.san))}</strong>. À toi.`, 'player');
  }

  reprendre() {
    if (this.fini || this.attente) return;
    // Annule la réponse de Stockfish et mon dernier coup (jamais avant la position de départ).
    let n = 0;
    while (this.chess.history().length > this.debut && (n === 0 || this.chess.turn() !== this.camp)) { this.chess.undo(); n++; if (this.chess.turn() === this.camp) break; }
    if (!n) return;
    this.reprises++;
    this.jeton++;
    this.dessiner();
    this.status('Coup repris. À toi de jouer.', 'player');
  }

  terminer(fin) {
    this.fini = true;
    this.attente = false;
    this.jeton++;
    const issue = pourMoi(fin.resultat, this.camp);
    let data = noterPartie(lire(), this.niv.n, issue);
    data = { ...data, dernier: { niveau: this.niv.n, camp: this.camp } };
    ecrire(data);
    this.dessiner();
    const b = data.niveaux[this.niv.n];
    const conseil = niveauConseille(data, this.niv.n);
    this.status(`${ISSUE[issue]} (${esc(fin.resultat)}, ${esc(fin.raison)})`, issue === 'v' ? 'ok' : issue === 'd' ? 'err' : '');
    this.pgn = pgnPartie(this.chess, { camp: this.camp, niveau: this.niv.n });
    this.$('[data-feedback]').innerHTML = `<p>Ton bilan au niveau ${this.niv.n} : ${b.v} victoire(s), ${b.n} nulle(s), ${b.d} défaite(s).${conseil ? ` Bon bilan : essaie le niveau ${conseil} !` : ''}</p>
      <div class="actions"><button type="button" class="primary" data-rejouer>↺ Rejouer</button>${this.onAnalyse ? '<button type="button" data-analyser>🔍 Analyser la partie (page Moteur)</button>' : ''}</div>`;
    this.$('[data-rejouer]').addEventListener('click', () => this.demarrer());
    this.$('[data-analyser]')?.addEventListener('click', () => { const san = this.chess.history(); this.finir(); this.onAnalyse(san, this.camp, `ta partie contre Stockfish (niveau ${this.niv.n})`); });
  }

  finir() {
    if (!this.alive) return;
    this.alive = false;
    this.jeton++;
    this.onDone?.();
  }

  destroy() { this.alive = false; }
}
