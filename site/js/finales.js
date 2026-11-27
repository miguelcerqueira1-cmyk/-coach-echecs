// Finales essentielles jouées contre Stockfish (page Entraînement). L'utilisateur joue son camp,
// Stockfish répond ; après chaque coup, l'évaluation dit si le but tient toujours (finales-core).
// Indice : flèche du meilleur coup (compté). Échec : explication et coup conseillé.
import { sons } from './sons.js';
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { sanFr } from './analysis.js';
import { cpPour, apresMonCoup, apresSonCoup, noterFinale } from './finales-core.js';
import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

export const KEY = 'coach-echecs:finales-v1';
const MOVETIME = 500;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BUT = { mat: L('♚ Mater', '♚ Checkmate'), promotion: L('♛ Aller à dame en gardant le gain', '♛ Promote while keeping the win'), nulle: L('🤝 Tenir la nulle', '🤝 Hold the draw') };

export function chargerFinales(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function enregistrerFinales(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* stockage plein */ } }

export class FinaleRunner {
  constructor({ el, engine, finale, onDone }) {
    this.el = el;
    this.engine = engine;
    this.f = finale;
    this.onDone = onDone;
    this.alive = true;
    this.layout();
    this.demarrer();
  }

  $(s) { return this.el.querySelector(s); }
  status(t, cls = '') { const s = this.$('[data-status]'); s.className = `train-status ${cls}`; s.innerHTML = `<span>${t}</span>`; }

  layout() {
    const f = this.f;
    this.el.innerHTML = `<div class="train-layout drill" data-finale="${esc(f.id)}">
      <section>
        <div class="train-status" data-status></div>
        <div class="board-wrap" data-board></div>
        <div class="actions">
          <button type="button" data-indice>💡 ${L('Indice', 'Hint')}</button>
          <button type="button" data-recommencer>↺ ${L('Recommencer', 'Restart')}</button>
          <button type="button" data-quit>${L('Terminer', 'Finish')}</button>
        </div>
      </section>
      <section class="card train-panel">
        <h2>${esc(f.titre)}</h2>
        <p><strong>${BUT[f.but]}</strong> · ${L('tu joues les', 'you play')} ${f.camp === 'w' ? L('Blancs', 'White') : L('Noirs', 'Black')}${f.but === 'nulle' ? L(` · tiens ${f.limite} coups`, ` · hold for ${f.limite} moves`) : L(` · en ${f.limite} coups au plus`, ` · in ${f.limite} moves at most`)}</p>
        <p class="small"><strong>${L('La méthode :', 'The method:')}</strong> ${esc(f.methode)}</p>
        <p class="small" data-compte></p>
        <div data-feedback class="small"></div>
        <p class="muted tiny">${L('L’adversaire est Stockfish à pleine force. Après chacun de tes coups, il vérifie que le but est toujours atteignable.', 'The opponent is Stockfish at full strength. After each of your moves, it checks that the goal can still be reached.')}</p>
      </section>
    </div>`;
    this.board = new Board(this.$('[data-board]'), { piecesUrl: './pieces/', onMove: (mv) => this.onMove(mv) });
    this.board.setOrientation(this.f.camp);
    this.$('[data-quit]').addEventListener('click', () => this.finir());
    this.$('[data-recommencer]').addEventListener('click', () => this.demarrer());
    this.$('[data-indice]').addEventListener('click', () => this.indice());
  }

  demarrer() {
    this.jeton = (this.jeton || 0) + 1;
    this.chess = new Chess(this.f.fen);
    this.n = 0;
    this.indices = 0;
    this.fini = false;
    this.attente = false;
    this.$('[data-feedback]').innerHTML = '';
    this.$('[data-indice]').hidden = false;
    this.board.setArrows([]);
    this.dessiner(true);
    this.compte();
    this.status(L('À toi de jouer.', 'Your move.'), 'player');
  }

  compte() {
    const reste = this.f.limite - this.n;
    this.$('[data-compte]').textContent = this.f.but === 'nulle' ? L(`Coups tenus : ${this.n} / ${this.f.limite}`, `Moves held: ${this.n} / ${this.f.limite}`) : L(`Coups joués : ${this.n} (il en reste ${Math.max(0, reste)})`, `Moves played: ${this.n} (${Math.max(0, reste)} left)`);
  }

  dessiner(interactive) {
    const last = this.chess.history({ verbose: true }).at(-1) || null;
    this.board.setPosition(this.chess, { lastMove: last, interactive });
  }

  async analyser(fen) {
    if (!this.engine || this.engine.state !== 'ready') return null;
    try {
      const r = await this.engine.analyze({ position: `position fen ${fen}`, movetime: MOVETIME, token: { gameId: 'finale', branchId: this.f.id, revision: Date.now(), ply: this.n } });
      return r?.cancelled ? null : r;
    } catch { return null; }
  }

  async onMove(mv) {
    if (this.fini || this.attente || !this.alive) return;
    const jeton = this.jeton;
    const avant = this.chess.fen();
    let coup;
    try { coup = this.chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion }); } catch { this.dessiner(true); return; }
    this.n++;
    this.attente = true;
    this.board.setArrows([]);
    this.dessiner(false);
    this.compte();
    this.status(`<span class="spinner"></span> ${L('Stockfish réfléchit…', 'Stockfish is thinking…')}`, 'opponent');
    // Une seule analyse : l'évaluation après mon coup et la meilleure réponse adverse.
    const r = this.chess.isGameOver() ? null : await this.analyser(this.chess.fen());
    if (!this.alive || jeton !== this.jeton) return;
    if (!this.chess.isGameOver() && (!r?.bestmove || r.bestmove === '(none)')) {
      // Moteur indisponible ou sans réponse : on annule le coup pour pouvoir réessayer.
      this.chess.undo();
      this.n--;
      this.attente = false;
      this.dessiner(true);
      this.compte();
      this.status(L('Stockfish n’a pas répondu : rejoue ton coup dans un instant.', 'Stockfish did not respond: play your move again in a moment.'), 'err');
      return;
    }
    const cp = r ? cpPour(r.info?.score, this.chess.turn(), this.f.camp) : null;
    const v = apresMonCoup(this.f, this.chess, coup, this.n, cp);
    if (v.etat !== 'continue') { await this.terminer(v, v.etat === 'rate' ? avant : null, coup); return; }
    // Réponse de Stockfish.
    const best = r.bestmove;
    const rep = this.chess.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] });
    this.dessiner(true);
    const v2 = apresSonCoup(this.f, this.chess);
    this.attente = false;
    if (v2.etat !== 'continue') { await this.terminer(v2, null, null); return; }
    this.status(L(`Il a joué <strong>${esc(sanFr(rep.san))}</strong>. À toi.`, `They played <strong>${esc(sanFr(rep.san))}</strong>. Your move.`), 'player');
  }

  async indice() {
    if (this.fini || this.attente) return;
    this.indices++;
    this.status(`<span class="spinner"></span> ${L('Recherche du meilleur coup…', 'Looking for the best move…')}`, 'opponent');
    const r = await this.analyser(this.chess.fen());
    if (!this.alive || this.fini) return;
    if (!r?.bestmove) { this.status(L('Indice indisponible pour le moment.', 'Hint unavailable for now.'), 'err'); return; }
    this.board.setArrows([{ from: r.bestmove.slice(0, 2), to: r.bestmove.slice(2, 4), kind: 'best' }]);
    this.status(L('💡 Flèche verte : le coup de Stockfish. À toi de le jouer.', '💡 Green arrow: Stockfish’s move. Your turn to play it.'), 'player');
  }

  async terminer(v, fenAvant, coup) {
    this.fini = true;
    this.attente = false;
    this.dessiner(false);
    this.$('[data-indice]').hidden = true;
    const ok = v.etat === 'reussi';
    const p = noterFinale(chargerFinales(), this.f.id, { ok, indices: this.indices });
    enregistrerFinales(p);
    this.status(ok ? `✔ ${esc(v.raison)}` : `✘ ${esc(v.raison)}`, ok ? 'ok' : 'err');
    let conseil = '';
    if (!ok && fenAvant) {
      const r = await this.analyser(fenAvant);
      if (r?.bestmove) {
        try {
          const b = new Chess(fenAvant).move({ from: r.bestmove.slice(0, 2), to: r.bestmove.slice(2, 4), promotion: r.bestmove[4] });
          conseil = L(`<p>Stockfish conseillait <strong>${esc(sanFr(b.san))}</strong>${coup ? ` au lieu de ${esc(sanFr(coup.san))}` : ''}.</p>`, `<p>Stockfish suggested <strong>${esc(sanFr(b.san))}</strong>${coup ? ` instead of ${esc(sanFr(coup.san))}` : ''}.</p>`);
          this.board.setArrows([{ from: b.from, to: b.to, kind: 'best' }]);
        } catch { /* coup illisible : pas de conseil */ }
      }
    }
    if (!this.alive) return;
    if (ok) sons.reussite();
    this.$('[data-feedback]').innerHTML = `${conseil}<p>${ok ? (this.indices ? L(`Réussie avec ${this.indices} indice(s). Refais-la sans indice pour la maîtriser.`, `Passed with ${this.indices} hint(s). Do it again without hints to master it.`) : L('Réussie sans indice : bravo !', 'Passed without hints: well done!')) : L('Relis la méthode et recommence.', 'Reread the method and try again.')}</p>
      <div class="actions"><button type="button" class="primary" data-encore>↺ ${L('Recommencer', 'Restart')}</button></div>`;
    this.$('[data-encore]').addEventListener('click', () => this.demarrer());
  }

  finir() {
    if (!this.alive) return;
    this.alive = false;
    this.onDone?.();
  }
}
