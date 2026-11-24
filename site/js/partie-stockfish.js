// Partie contre Stockfish à niveau réglable (page Entraînement). L'utilisateur joue son camp,
// Stockfish répond avec la force choisie (partie-stockfish-core). Reprendre un coup, abandonner,
// proposer… rien n'est inventé : la fin de partie vient de chess.js, les coups de Stockfish.
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { sanFr } from './analysis.js';
import { niveauSF, finDePartie, pourMoi, lire, ecrire, noterPartie, niveauConseille, pgnPartie } from './partie-stockfish-core.js';
import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ISSUE = { v: L('🏆 Victoire', '🏆 Win'), n: L('🤝 Nulle', '🤝 Draw'), d: L('✘ Défaite', '✘ Loss') };

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
          <button type="button" data-reprendre>↶ ${L('Reprendre mon coup', 'Take back my move')}</button>
          <button type="button" data-abandon>🏳 ${L('Abandonner', 'Resign')}</button>
          <button type="button" data-quit>${L('Quitter', 'Quit')}</button>
        </div>
      </section>
      <section class="card train-panel">
        <h2>🤖 ${L('Contre Stockfish', 'Against Stockfish')} — ${esc(this.niv.nom)}</h2>
        <p class="small">${L('Tu joues les', 'You play')} <strong>${this.camp === 'w' ? L('Blancs', 'White') : L('Noirs', 'Black')}</strong>${this.depart.titre ? ` · ${L('départ :', 'start:')} ${esc(this.depart.titre)}` : ''}.</p>
        <p class="small" data-coups></p>
        <div data-feedback class="small"></div>
        <p class="muted tiny">${L('Niveaux 1 à 6 : option « Skill Level » de Stockfish ; 7 à 9 : Elo de l’échelle officielle de Stockfish (pas celle de Lichess ou Chess.com) ; 10 : pleine force.', 'Levels 1 to 6: Stockfish “Skill Level” option; 7 to 9: Elo on Stockfish’s official scale (not that of Lichess or Chess.com); 10: full strength.')}</p>
      </section>
    </div>`;
    this.board = new Board(this.$('[data-board]'), { piecesUrl: './pieces/', onMove: (mv) => this.onMove(mv) });
    this.board.setOrientation(this.camp);
    this.$('[data-quit]').addEventListener('click', () => this.finir());
    this.$('[data-reprendre]').addEventListener('click', () => this.reprendre());
    this.$('[data-abandon]').addEventListener('click', () => { if (!this.fini && window.confirm(L('Abandonner cette partie ?', 'Resign this game?'))) this.terminer({ resultat: this.camp === 'w' ? '0-1' : '1-0', raison: L('abandon', 'resignation') }); });
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
    else this.status(L('À toi de jouer.', 'Your move.'), 'player');
  }

  dessiner() {
    const last = this.chess.history({ verbose: true }).at(-1) || null;
    this.board.setPosition(this.chess, { lastMove: last, interactive: !this.fini && !this.attente && this.chess.turn() === this.camp });
    const h = this.chess.history();
    const n = Math.floor((h.length - this.debut + 1) / 2);
    this.$('[data-coups]').textContent = L(`Coups joués dans la partie : ${n}${this.reprises ? ` · coups repris : ${this.reprises}` : ''}`, `Moves played in the game: ${n}${this.reprises ? ` · moves taken back: ${this.reprises}` : ''}`);
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
    this.status(`<span class="spinner"></span> ${L('Stockfish réfléchit…', 'Stockfish is thinking…')}`, 'opponent');
    let r = null;
    if (this.engine?.state === 'ready') {
      try {
        r = await this.engine.analyze({ position: `position fen ${this.chess.fen()}`, movetime: this.niv.movetime, force: this.niv.force, token: { gameId: 'partie-sf', branchId: String(this.jeton), revision: this.chess.history().length, ply: this.chess.history().length } });
      } catch { r = null; }
    }
    if (!this.alive || jeton !== this.jeton) return;
    this.attente = false;
    if (!r || r.cancelled || !r.bestmove || r.bestmove === '(none)') {
      this.status(L('Stockfish n’a pas répondu. Touche « Reprendre mon coup » puis rejoue, ou réessaie dans un instant.', 'Stockfish did not respond. Tap “Take back my move” then play again, or retry in a moment.'), 'err');
      this.dessiner();
      return;
    }
    const b = r.bestmove;
    const m = this.chess.move({ from: b.slice(0, 2), to: b.slice(2, 4), promotion: b[4] });
    this.dessiner();
    const fin = finDePartie(this.chess);
    if (fin) { this.terminer(fin); return; }
    this.status(L(`Stockfish a joué <strong>${esc(sanFr(m.san))}</strong>. À toi.`, `Stockfish played <strong>${esc(sanFr(m.san))}</strong>. Your move.`), 'player');
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
    this.status(L('Coup repris. À toi de jouer.', 'Move taken back. Your move.'), 'player');
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
    this.$('[data-feedback]').innerHTML = `<p>${L(`Ton bilan au niveau ${this.niv.n} : ${b.v} victoire(s), ${b.n} nulle(s), ${b.d} défaite(s).${conseil ? ` Bon bilan : essaie le niveau ${conseil} !` : ''}`, `Your record at level ${this.niv.n}: ${b.v} win(s), ${b.n} draw(s), ${b.d} loss(es).${conseil ? ` Good record: try level ${conseil}!` : ''}`)}</p>
      <div class="actions"><button type="button" class="primary" data-rejouer>↺ ${L('Rejouer', 'Play again')}</button>${this.onAnalyse ? `<button type="button" data-analyser>🔍 ${L('Analyser la partie (page Moteur)', 'Analyse the game (Engine page)')}</button>` : ''}</div>`;
    this.$('[data-rejouer]').addEventListener('click', () => this.demarrer());
    this.$('[data-analyser]')?.addEventListener('click', () => { const san = this.chess.history(); this.finir(); this.onAnalyse(san, this.camp, L(`ta partie contre Stockfish (niveau ${this.niv.n})`, `your game against Stockfish (level ${this.niv.n})`)); });
  }

  finir() {
    if (!this.alive) return;
    this.alive = false;
    this.jeton++;
    this.onDone?.();
  }

  destroy() { this.alive = false; }
}
