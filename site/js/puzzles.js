// « Tactique anti-tunnel » dans l'application : 10 problèmes Lichess du thème du jour, joués sur
// l'échiquier de BlitzRefute. Le dernier coup adverse est rejoué sous vos yeux (habitude « son coup
// d'abord ») ; coup faux : la pièce ne bouge pas, bulle d'explication ; « Voir la solution » rejoue
// la suite de Lichess. Problème réussi = résolu sans erreur ni solution affichée.
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { sanFr } from './analysis.js';
import { urlProbleme, lireProbleme, verdict, bilan, N_PROBLEMES } from './puzzles-core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

export class PuzzleRunner {
  // theme : { id, nom, url } (routine-core THEMES) ; queue : file Lichess (une requête à la fois).
  constructor({ el, queue, theme, n = N_PROBLEMES, difficulty = 'easiest', onDone }) {
    this.difficulty = difficulty;
    this.el = el;
    this.queue = queue;
    this.theme = theme;
    this.n = n;
    this.onDone = onDone;
    this.vus = new Set();
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
        <div class="board-wrap" data-board></div>
        <div class="actions">
          <button type="button" data-solution>💡 Voir la solution</button>
          <button type="button" class="primary" data-next hidden>Problème suivant →</button>
          <button type="button" data-quit>Terminer</button>
        </div>
      </section>
      <section class="card train-panel">
        <h2>🧩 Tactique : ${esc(this.theme.nom)}</h2>
        <p class="small"><strong>Son coup d’abord :</strong> regarde le coup qu’il vient de jouer (surligné). Qu’a-t-il changé ? Puis trouve le meilleur coup.</p>
        <div data-head class="small"></div>
        <div data-feedback class="small"></div>
        <p class="muted tiny">Problèmes de la base Lichess (licence CC0). Niveau réglable dans la routine. Ils ne comptent pas pour ton classement Lichess.</p>
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
      const r = await this.queue.run(urlProbleme(this.theme.id, this.difficulty), { headers: { accept: 'application/json' } });
      if (!r.res.ok) throw new Error(`Lichess : erreur ${r.res.status}`);
      const p = lireProbleme(await r.res.json());
      if (p && !this.vus.has(p.id)) { this.vus.add(p.id); return p; }
    }
    throw new Error('Lichess n’a pas renvoyé de nouveau problème.');
  }

  async suivant() {
    this.$('[data-next]').hidden = true;
    this.$('[data-solution]').hidden = false;
    this.$('[data-feedback]').innerHTML = '';
    this.board.hideBubble();
    this.board.setArrows([]);
    if (this.resultats.length >= this.n) { this.finir(); return; }
    this.status('Chargement du problème…');
    let p;
    try { p = await this.prochain; } catch (err) { if (this.alive) this.erreur(err); return; }
    if (!this.alive) return;
    if (this.resultats.length + 1 < this.n) { this.prochain = this.charger(); this.prochain.catch(() => {}); }
    this.p = p;
    this.cur = { i: 0, erreurs: 0, vu: false, fini: false };
    this.chess = new Chess(p.fenAvant);
    this.board.setOrientation(new Chess(p.fen).turn());
    this.$('[data-head]').innerHTML = `<p><strong>Problème ${this.resultats.length + 1} / ${this.n}</strong>${p.rating ? ` · difficulté ${esc(p.rating)}` : ''} · <a href="${esc(p.url)}" target="_blank" rel="noopener">voir sur Lichess ↗</a></p>`;
    this.board.setPosition(this.chess, {});
    this.status('Regarde son coup…');
    this.later(() => {
      this.chess.move(p.dernier);
      this.dessiner(true);
      this.status(`Il a joué <strong>${esc(sanFr(p.dernier.san))}</strong>. À toi : trouve le meilleur coup.`, 'player');
    }, 700);
  }

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
        ? 'Pas le bon coup. Regarde ce que menace la dernière pièce qu’il a jouée, et ce qui est en prise.'
        : 'Toujours pas. Tu peux réessayer ou « Voir la solution ».');
      this.status('✘ Raté du premier coup — réessaie.', 'err');
      return;
    }
    this.chess.move(toObj(uci));
    c.i++;
    if (v === 'mat' || c.i >= this.p.solution.length) { this.dessiner(false); this.reussi(); return; }
    this.dessiner(false);
    this.board.showBubble('✔ Bien vu !', 'ok');
    this.later(() => this.jouerReponse(), 450);
  }

  jouerReponse() {
    const c = this.cur;
    this.chess.move(toObj(this.p.solution[c.i]));
    c.i++;
    this.dessiner(true);
    this.status('Continue : quel est le coup suivant ?', 'player');
  }

  reussi() {
    const c = this.cur;
    c.fini = true;
    const ok = !c.erreurs && !c.vu;
    this.resultats.push({ id: this.p.id, reussi: ok });
    this.status(ok ? '✔ Résolu du premier coup !' : '✔ Résolu (après une erreur : ne compte pas comme réussi).', ok ? 'ok' : '');
    this.board.showBubble(ok ? '✔ Résolu !' : '✔ Résolu', 'ok');
    this.finProbleme();
  }

  async montrerSolution() {
    const c = this.cur;
    if (!c || c.fini) return;
    c.vu = true;
    c.fini = true;
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
    this.status('Solution affichée : ce problème compte comme raté.');
    this.$('[data-feedback]').innerHTML = `<p>Solution : <strong>${esc(sans.join(' '))}</strong></p>`;
    this.finProbleme();
  }

  finProbleme() {
    this.$('[data-solution]').hidden = true;
    const b = this.$('[data-next]');
    b.hidden = false;
    b.textContent = this.resultats.length >= this.n ? 'Voir mon bilan →' : 'Problème suivant →';
    b.focus({ preventScroll: true });
  }

  erreur(err) {
    this.status('Problèmes indisponibles pour le moment.', 'err');
    this.$('[data-solution]').hidden = true;
    this.$('[data-feedback]').innerHTML = `<p class="errbox">${esc(err?.message || 'Lichess injoignable.')} Vérifie ta connexion, ou fais les problèmes directement sur Lichess : <a href="${esc(this.theme.url)}" target="_blank" rel="noopener">${esc(this.theme.nom)} ↗</a></p>`;
  }

  finir() {
    if (!this.alive) return;
    this.alive = false;
    this.onDone(bilan(this.resultats));
  }

  destroy() { this.alive = false; }
}
