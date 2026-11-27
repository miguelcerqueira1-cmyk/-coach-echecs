// « Tactique anti-tunnel » dans l'application : 10 problèmes Lichess du thème du jour, joués sur
// l'échiquier de BlitzRefute. Le dernier coup adverse est rejoué sous vos yeux (habitude « son coup
// d'abord ») ; coup faux : la pièce ne bouge pas, bulle d'explication ; « Voir la solution » rejoue
// la suite de Lichess. Problème réussi = résolu sans erreur ni solution affichée.
import { sons } from './sons.js';
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { sanFr } from './analysis.js';
import { urlProbleme, lireProbleme, verdict, bilan, N_PROBLEMES } from './puzzles-core.js';
import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

export class PuzzleRunner {
  // theme : { id, nom, url } (routine-core THEMES) ; queue : file Lichess (une requête à la fois).
  // difficulty : valeur ou fonction (problèmes par thème : selon le classement à jour) ;
  // onResultat(p, reussi) → texte affiché (ex. évolution du classement) ; note : texte du panneau.
  constructor({ el, queue, theme, n = N_PROBLEMES, difficulty = 'easiest', chrono = 0, onDone, onResultat = null, note = null, titre = null, vus = [] }) {
    this.onResultat = onResultat;
    this.note = note;
    this.titre = titre;
    this.chrono = chrono; // secondes par problème (0 = sans chrono) ; temps écoulé = raté
    this.difficulty = difficulty;
    this.el = el;
    this.queue = queue;
    this.theme = theme;
    this.n = n;
    this.onDone = onDone;
    this.vus = new Set(vus); // problèmes déjà vus (séance, et historique des problèmes par thème)
    this.resultats = [];
    this.alive = true;
    this.layout();
    this.prochain = this.charger();
    this.suivant();
  }

  $(s) { return this.el.querySelector(s); }
  later(fn, ms) { setTimeout(() => { if (this.alive) fn(); }, ms); }

  layout() {
    this.el.innerHTML = `<div class="train-layout drill" data-puzzles>
      <section>
        <div class="train-status" data-status></div>
        ${this.chrono ? '<div class="drill-timer" data-timer><span></span></div>' : ''}
        <div class="board-wrap" data-board></div>
        <div class="actions">
          <button type="button" data-solution>💡 ${L('Voir la solution', 'Show solution')}</button>
          <button type="button" class="primary" data-next hidden>${L('Problème suivant →', 'Next puzzle →')}</button>
          <button type="button" data-quit>${L('Terminer', 'Finish')}</button>
        </div>
      </section>
      <section class="card train-panel">
        <h2>${esc(this.titre || L(`🧩 Tactique : ${this.theme.nom}`, `🧩 Tactics: ${this.theme.nom}`))}</h2>
        <p class="small"><strong>${L('Son coup d’abord :', 'Their move first:')}</strong> ${L('regarde le coup qu’il vient de jouer (surligné). Qu’a-t-il changé ? Puis trouve le meilleur coup.', 'look at the move they just played (highlighted). What did it change? Then find the best move.')}</p>
        <div data-head class="small"></div>
        <div data-feedback class="small"></div>
        <p class="muted tiny">${esc(this.note || L('Problèmes de la base Lichess (licence CC0). Niveau et chrono réglables dans la routine. Ils ne comptent pas pour ton classement Lichess.', 'Puzzles from the Lichess database (CC0 licence). Level and timer can be set in the routine. They don’t count for your Lichess rating.'))}</p>
      </section>
    </div>`;
    this.board = new Board(this.$('[data-board]'), { piecesUrl: './pieces/', onMove: (mv) => this.onMove(mv) });
    this.$('[data-quit]').addEventListener('click', () => this.finir());
    this.$('[data-next]').addEventListener('click', () => this.suivant());
    this.$('[data-solution]').addEventListener('click', () => this.montrerSolution());
  }

  status(t, cls = '') { const s = this.$('[data-status]'); s.className = `train-status ${cls}`; s.innerHTML = `<span>${t}</span>`; }

  // Un problème Lichess pas encore vu dans la séance (3 essais en cas de doublon).
  async charger() {
    for (let essai = 0; essai < 3; essai++) {
      const diff = typeof this.difficulty === 'function' ? this.difficulty() : this.difficulty;
      const r = await this.queue.run(urlProbleme(this.theme.id, diff), { headers: { accept: 'application/json' } });
      if (!r.res.ok) throw new Error(L(`Lichess : erreur ${r.res.status}`, `Lichess: error ${r.res.status}`));
      const p = lireProbleme(await r.res.json());
      if (p && !this.vus.has(p.id)) { this.vus.add(p.id); return p; }
    }
    throw new Error(L('Lichess n’a pas renvoyé de nouveau problème.', 'Lichess did not return a new puzzle.'));
  }

  async suivant() {
    this.$('[data-next]').hidden = true;
    this.$('[data-solution]').hidden = false;
    this.$('[data-feedback]').innerHTML = '';
    this.board.hideBubble();
    this.board.setArrows([]);
    if (this.resultats.length >= this.n) { this.finir(); return; }
    this.status(L('Chargement du problème…', 'Loading puzzle…'));
    let p;
    try { p = await this.prochain; } catch (err) { if (this.alive) this.erreur(err); return; }
    if (!this.alive) return;
    if (this.resultats.length + 1 < this.n) { this.prochain = this.charger(); this.prochain.catch(() => {}); }
    this.p = p;
    this.cur = { i: 0, erreurs: 0, vu: false, fini: false };
    this.chess = new Chess(p.fenAvant);
    this.board.setOrientation(new Chess(p.fen).turn());
    this.$('[data-head]').innerHTML = `<p><strong>${L('Problème', 'Puzzle')} ${this.resultats.length + 1} / ${this.n}</strong>${p.rating ? ` · ${L('difficulté', 'difficulty')} ${esc(p.rating)}` : ''} · <a href="${esc(p.url)}" target="_blank" rel="noopener">${L('voir sur Lichess ↗', 'view on Lichess ↗')}</a></p>`;
    this.board.setPosition(this.chess, {});
    this.status(L('Regarde son coup…', 'Watch their move…'));
    this.later(() => {
      this.chess.move(p.dernier);
      this.dessiner(true);
      this.status(L(`Il a joué <strong>${esc(sanFr(p.dernier.san))}</strong>. À toi : trouve le meilleur coup.`, `They played <strong>${esc(sanFr(p.dernier.san))}</strong>. Your turn: find the best move.`), 'player');
      this.lancerChrono();
    }, 700);
  }

  // ---------- Chrono (option de la routine) ----------
  lancerChrono() {
    this.arreterChrono();
    if (!this.chrono) return;
    const c = this.cur;
    const t0 = performance.now();
    const bar = this.$('[data-timer]');
    this.timer = setInterval(() => {
      if (!this.alive || this.cur !== c || c.fini) { this.arreterChrono(); return; }
      const left = Math.max(0, 1 - (performance.now() - t0) / (this.chrono * 1000));
      bar.querySelector('span').style.width = `${Math.round(left * 100)}%`;
      bar.classList.toggle('low', left < 0.3);
      if (left <= 0) {
        this.arreterChrono();
        c.horsTemps = true;
        this.status(L('⏱ Temps écoulé : ce problème compte comme raté. Tu peux le finir ou voir la solution.', '⏱ Time’s up: this puzzle counts as failed. You can finish it or see the solution.'), 'err');
      }
    }, 100);
  }

  arreterChrono() { clearInterval(this.timer); this.timer = null; }

  dessiner(interactive) {
    const last = this.chess.history({ verbose: true }).at(-1) || null;
    this.board.setPosition(this.chess, { lastMove: last, interactive });
  }

  onMove(mv) {
    const c = this.cur;
    if (!c || c.fini || !this.alive) return;
    const uci = `${mv.from}${mv.to}${mv.promotion || ''}`;
    const v = verdict(this.chess.fen(), uci, this.p.solution, c.i);
    if (v === 'ko') {
      c.erreurs++;
      this.dessiner(true);
      this.board.flashError(mv.to, c.erreurs === 1
        ? L('Pas le bon coup. Regarde ce que menace la dernière pièce qu’il a jouée, et ce qui est en prise.', 'Not the right move. Look at what the last piece they moved threatens, and what is hanging.')
        : L('Toujours pas. Tu peux réessayer ou « Voir la solution ».', 'Still not. You can try again or “Show solution”.'));
      this.status(L('✘ Raté du premier coup — réessaie.', '✘ Missed on the first try — try again.'), 'err');
      return;
    }
    this.chess.move(toObj(uci));
    c.i++;
    if (v === 'mat' || c.i >= this.p.solution.length) { this.dessiner(false); this.reussi(); return; }
    this.dessiner(false);
    this.board.showBubble(L('✔ Bien vu !', '✔ Well spotted!'), 'ok');
    this.later(() => this.jouerReponse(), 450);
  }

  jouerReponse() {
    const c = this.cur;
    this.chess.move(toObj(this.p.solution[c.i]));
    c.i++;
    this.dessiner(true);
    this.status(L('Continue : quel est le coup suivant ?', 'Keep going: what is the next move?'), 'player');
  }

  reussi() {
    const c = this.cur;
    c.fini = true;
    this.arreterChrono();
    const ok = !c.erreurs && !c.vu && !c.horsTemps;
    this.resultats.push({ id: this.p.id, reussi: ok });
    this.annoncer(ok);
    if (ok) sons.reussite();
    this.status(ok ? L('✔ Résolu du premier coup !', '✔ Solved on the first try!') : c.horsTemps && !c.erreurs ? L('✔ Résolu, mais après le temps : ne compte pas comme réussi.', '✔ Solved, but after the time limit: doesn’t count as a success.') : L('✔ Résolu (après une erreur : ne compte pas comme réussi).', '✔ Solved (after a mistake: doesn’t count as a success).'), ok ? 'ok' : '');
    this.board.showBubble(ok ? L('✔ Résolu !', '✔ Solved!') : L('✔ Résolu', '✔ Solved'), 'ok');
    this.finProbleme();
  }

  async montrerSolution() {
    const c = this.cur;
    if (!c || c.fini) return;
    c.vu = true;
    c.fini = true;
    this.arreterChrono();
    this.$('[data-solution]').hidden = true;
    const sans = [];
    while (c.i < this.p.solution.length && this.alive) {
      const m = this.chess.move(toObj(this.p.solution[c.i]));
      sans.push(sanFr(m.san));
      c.i++;
      this.dessiner(false);
      this.board.setArrows([{ from: m.from, to: m.to, kind: 'best' }]);
      await new Promise((r) => setTimeout(r, 700));
    }
    if (!this.alive) return;
    this.resultats.push({ id: this.p.id, reussi: false });
    this.status(L('Solution affichée : ce problème compte comme raté.', 'Solution shown: this puzzle counts as failed.'));
    this.$('[data-feedback]').innerHTML = `<p>${L('Solution :', 'Solution:')} <strong>${esc(sans.join(' '))}</strong></p>`;
    this.annoncer(false);
    this.finProbleme();
  }

  // Résultat d'un problème transmis à l'appelant (classement des problèmes par thème).
  annoncer(reussi) {
    const t = this.onResultat?.(this.p, reussi);
    if (t) this.$('[data-feedback]').insertAdjacentHTML('beforeend', `<p class="puz-classement">${esc(t)}</p>`);
  }

  finProbleme() {
    this.$('[data-solution]').hidden = true;
    const b = this.$('[data-next]');
    b.hidden = false;
    b.textContent = this.resultats.length >= this.n ? L('Voir mon bilan →', 'See my summary →') : L('Problème suivant →', 'Next puzzle →');
    b.focus({ preventScroll: true });
  }

  erreur(err) {
    this.status(L('Problèmes indisponibles pour le moment.', 'Puzzles unavailable for now.'), 'err');
    this.$('[data-solution]').hidden = true;
    this.$('[data-feedback]').innerHTML = `<p class="errbox">${esc(err?.message || L('Lichess injoignable.', 'Lichess unreachable.'))} ${L('Vérifie ta connexion, ou fais les problèmes directement sur Lichess :', 'Check your connection, or do the puzzles directly on Lichess:')} <a href="${esc(this.theme.url)}" target="_blank" rel="noopener">${esc(this.theme.nom)} ↗</a></p>`;
  }

  finir() {
    if (!this.alive) return;
    this.alive = false;
    this.arreterChrono();
    this.onDone(bilan(this.resultats));
  }

  destroy() { this.alive = false; }
}
