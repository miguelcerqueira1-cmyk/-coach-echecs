// Modules d'exercices de la page Entraînement :
// - « Lignes » : l'application joue les coups adverses d'une fiche, vous jouez les vôtres ;
//   une erreur affiche le plan et le bon coup, et la position revient en fin de séance ;
// - « Anti-trash » : un coup douteux adverse est joué, vous devez enchaîner la punition
//   de la fiche avant la fin du chronomètre.
// Les coups attendus sont ceux des fiches (lignes vérifiées par Stockfish) ; rien n'est inventé.
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { sanFr } from './analysis.js';
import { key, cpFrom } from './training-core.js';
import { lineSteps, trashDrill, seuilAutreCoup } from './drills-core.js';
import { lineText } from './games-core.js';
import { recordLine, recordDrill, saveProgress } from './progress.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const sec = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';
const MAX_RETRY = 3;

export class DrillRunner {
  // kind : 'lignes' | 'trash' ; ids : fiches à travailler ; onDone(résumé) : retour au menu.
  // guided : pratique guidée d'une leçon (indice, puis le coup ; pas de pénalité ni de reprise).
  constructor({ el, data, kind, ids, tree, progress, gradePos, timeLimit = 10, guided = false, engine = null, onDone }) {
    this.guided = guided;
    this.engine = engine; // Stockfish : accepte un autre coup gagnant dans le drill anti-trash
    this.el = el;
    this.data = data;
    this.kind = kind;
    this.tree = tree; // { gd, ck } : arbres buildTree (coups du répertoire, pièges)
    this.progress = progress;
    this.gradePos = gradePos;
    this.timeLimit = timeLimit;
    this.onDone = onDone;
    this.entries = ids.map((id) => data.entries.find((e) => e.id === id)).filter(Boolean);
    this.items = kind === 'trash'
      ? this.entries.map((e) => ({ e, d: trashDrill(e, this.colorOf(e)) })).filter((x) => x.d)
      : this.entries.map((e) => ({ e }));
    this.idx = -1;
    this.retry = [];
    this.results = [];
    this.alive = true;
    this.layout();
    this.next();
  }

  colorOf(e) { return this.data.repertoires[e.rep].couleur; }

  layout() {
    const title = this.kind === 'trash' ? '⏱ Drill anti-trash' : this.guided ? '📖 À vous : pratique guidée' : '📚 Lignes du répertoire';
    this.el.innerHTML = `<div class="train-layout drill" data-drill="${this.kind}">
      <section>
        <div class="train-status" data-status></div>
        ${this.kind === 'trash' ? '<div class="drill-timer" data-timer><span></span></div>' : ''}
        <div class="board-wrap" data-board></div>
        <div class="actions"><button type="button" data-quit>Terminer</button></div>
      </section>
      <section class="card train-panel">
        <h2>${title}</h2>
        <div data-head class="small"></div>
        <div data-feedback></div>
        <ol class="train-log" data-log></ol>
      </section>
    </div>`;
    this.board = new Board(this.el.querySelector('[data-board]'), { piecesUrl: './pieces/', onMove: (mv) => this.onUserMove(mv) });
    this.el.querySelector('[data-quit]').addEventListener('click', () => this.finish());
  }

  $(sel) { return this.el.querySelector(sel); }
  log(html, cls = '') { this.$('[data-log]').insertAdjacentHTML('afterbegin', `<li class="${cls}">${html}</li>`); }
  status(text, cls = '') { const s = this.$('[data-status]'); s.className = `train-status ${cls}`; s.innerHTML = text; }
  feedback(html) { this.$('[data-feedback]').innerHTML = html; }

  draw({ interactive = false, arrows = [] } = {}) {
    const last = this.chess.history({ verbose: true }).at(-1) || null;
    this.board.setPosition(this.chess, { lastMove: last, interactive });
    this.board.setArrows(arrows);
  }

  later(fn, ms) { setTimeout(() => { if (this.alive) fn(); }, ms); }

  // ---------- Enchaînement des exercices ----------

  next() {
    this.feedback('');
    if (this.kind === 'lignes' && this.idx + 1 >= this.items.length && this.retry.length) { this.nextRetry(); return; }
    this.idx++;
    if (this.idx >= this.items.length) { this.finish(); return; }
    const it = this.items[this.idx];
    this.cur = { ...it, color: this.colorOf(it.e), errors: 0, i: 0 };
    this.board.setOrientation(this.cur.color);
    this.$('[data-head]').innerHTML = `<p><strong>${this.idx + 1} / ${this.items.length}</strong> — fiche « ${esc(it.e.nom)} » <span class="badge eco">${esc(it.e.eco)}</span></p>`;
    if (this.kind === 'trash') this.startTrash(); else this.startLine();
  }

  // ---------- Module Lignes ----------

  startLine() {
    const c = this.cur;
    c.steps = lineSteps(c.e, c.color);
    this.chess = new Chess();
    this.log(this.guided
      ? `Rejouez la ligne que vous venez d’apprendre. En cas d’hésitation : un indice, puis le coup.`
      : `Ligne « ${esc(c.e.nom)} » : l’application joue l’adversaire, à vous les coups ${c.color === 'w' ? 'blancs' : 'noirs'}.`, 'muted');
    this.advance();
  }

  advance() {
    const c = this.cur;
    if (c.i >= c.steps.length) { this.endLine(); return; }
    const step = c.steps[c.i];
    if (!step.ours) {
      this.status('<span class="spinner"></span> L’adversaire joue…', 'opponent');
      this.draw();
      this.later(() => {
        this.chess.move(toObj(step.uci));
        c.i++;
        this.advance();
      }, 450);
      return;
    }
    this.status(`À vous (${c.color === 'w' ? 'Blancs' : 'Noirs'}) : coup de la ligne ?`, 'player');
    this.draw({ interactive: true });
  }

  onUserMove(input) {
    if (!this.alive || !this.cur || this.cur.wait) return;
    if (this.kind === 'trash') { this.onTrashMove(input); return; }
    const c = this.cur;
    const step = c.steps[c.i];
    if (!step?.ours) return;
    let mv;
    try { mv = new Chess(this.chess.fen()).move(input); } catch { return; }
    const k = key(c.steps.slice(0, c.i).map((s) => s.uci));
    const t = this.tree[c.e.rep];
    if (mv.lan === step.uci) {
      this.board.setHint(null);
      this.feedback('');
      if (!c.retryItem && !(this.guided && c.hints?.ply === c.i)) this.gradePos(c.e.rep, k, true);
      this.chess.move(toObj(step.uci));
      this.log(`✔ ${esc(sanFr(mv.san))}`, 'ok');
      c.i++;
      if (c.retryItem) { this.retryDone(true); return; }
      this.advance();
      return;
    }
    const good = sanFr(step.san);
    const arrow = { from: step.uci.slice(0, 2), to: step.uci.slice(2, 4), kind: 'best' };
    // Autre coup de votre répertoire (transposition d'une autre fiche) : pas une faute.
    if (!c.retryItem && t.ours.get(k)?.has(mv.lan)) {
      this.log(`≈ ${esc(sanFr(mv.san))} est aussi dans votre répertoire, mais cette fiche continue par <strong>${esc(good)}</strong>.`, 'muted');
      c.wait = true;
      this.draw({ arrows: [arrow] });
      this.later(() => { c.wait = false; this.chess.move(toObj(step.uci)); c.i++; this.advance(); }, 1300);
      return;
    }
    c.errors++;
    if (!c.retryItem) this.gradePos(c.e.rep, k, false);
    if (this.guided) { this.guide(c, step, mv, arrow); return; }
    const trap = t.traps.get(k);
    const isTrap = trap?.uci === mv.lan;
    const plan = c.e.plan ? `<p class="small"><strong>Plan de la fiche :</strong> ${esc(c.e.plan)}</p>` : '';
    this.feedback(`<div class="drill-fb ko">
      <p>✘ <strong>${esc(sanFr(mv.san))}</strong> n’est pas le coup de la ligne. Le bon coup : <strong>${esc(good)}</strong> (flèche verte).</p>
      ${isTrap ? `<p class="small">⚠ C’est le piège de la fiche : ${esc(trap.texte)}</p>` : ''}
      ${plan}
      <p class="small muted">Cette position reviendra en fin de séance.</p>
      <div class="actions"><button type="button" class="primary" data-continue>J’ai compris, continuer</button></div>
    </div>`);
    this.log(`✘ ${esc(sanFr(mv.san))} — attendu ${esc(good)}`, 'ko');
    if (!c.retryItem && !this.retry.some((r) => r.e.id === c.e.id && r.i === c.i)) this.retry.push({ e: c.e, i: c.i, color: c.color, tries: 0 });
    c.wait = true;
    this.status('Erreur : lisez l’explication', 'opponent');
    this.draw({ arrows: [arrow] });
    this.$('[data-continue]').addEventListener('click', () => {
      this.feedback('');
      c.wait = false;
      if (c.retryItem) { this.retryDone(false); return; }
      this.chess.move(toObj(step.uci));
      c.i++;
      this.advance();
    });
  }

  // Pratique guidée : 1re erreur → indice (pièce et case de départ) ; 2e → le coup (flèche).
  guide(c, step, mv, arrow) {
    c.hints = c.hints?.ply === c.i ? { ply: c.i, n: c.hints.n + 1 } : { ply: c.i, n: 1 };
    const from = step.uci.slice(0, 2);
    const piece = new Chess(this.chess.fen()).get(from);
    const NOM = { p: 'un pion', n: 'un Cavalier', b: 'un Fou', r: 'une Tour', q: 'la Dame', k: 'le Roi' };
    if (c.hints.n === 1) {
      this.board.setHint(from);
      this.feedback(`<div class="drill-fb"><p>Pas tout à fait (${esc(sanFr(mv.san))}). <strong>Indice :</strong> on joue ${NOM[piece?.type] || 'une pièce'} — la case de départ est entourée.</p></div>`);
      this.log(`↺ ${esc(sanFr(mv.san))} — indice donné`, 'muted');
    } else {
      this.board.setHint(null);
      this.feedback(`<div class="drill-fb"><p>Le coup de la ligne est <strong>${esc(sanFr(step.san))}</strong> (flèche verte) : jouez-le pour continuer.</p></div>`);
      this.draw({ interactive: true, arrows: [arrow] });
      return;
    }
    this.draw({ interactive: true });
  }

  endLine() {
    const c = this.cur;
    const ok = c.errors === 0;
    if (!this.guided) { recordLine(this.progress, c.e.id, ok); saveProgress(this.progress); }
    this.results.push({ id: c.e.id, ok });
    this.log(ok ? `<strong>Ligne réussie sans faute ✔</strong>` : `<strong>Ligne terminée</strong> avec ${c.errors} erreur(s).`, ok ? 'ok' : 'warn');
    this.status(ok ? 'Ligne réussie ✔' : 'Ligne terminée', ok ? 'player' : 'opponent');
    this.draw();
    this.later(() => this.next(), 1100);
  }

  // Positions ratées remises dans la boucle : on les redonne jusqu'à réussite (3 essais max).
  nextRetry() {
    const r = this.retry.shift();
    const steps = lineSteps(r.e, r.color);
    this.cur = { e: r.e, color: r.color, steps, i: r.i, errors: 0, retryItem: r };
    this.chess = new Chess();
    for (const s of steps.slice(0, r.i)) this.chess.move(toObj(s.uci));
    this.board.setOrientation(r.color);
    this.$('[data-head]').innerHTML = `<p><strong>Révision des erreurs</strong> — fiche « ${esc(r.e.nom)} » (encore ${this.retry.length + 1} position(s))</p>`;
    this.log(`↺ Position ratée de « ${esc(r.e.nom)} » : retrouvez le coup.`, 'muted');
    this.status('À vous : retrouvez le coup de la ligne', 'player');
    this.draw({ interactive: true });
  }

  retryDone(ok) {
    const r = this.cur.retryItem;
    r.tries++;
    if (!ok && r.tries < MAX_RETRY) this.retry.push(r);
    this.draw();
    this.later(() => this.next(), ok ? 700 : 300);
  }

  // ---------- Module Anti-trash ----------

  startTrash() {
    const c = this.cur;
    const d = c.d;
    this.chess = new Chess();
    for (const u of d.setup) this.chess.move(toObj(u));
    c.steps = d.steps;
    this.setTimer(1);
    this.status('<span class="spinner"></span> L’adversaire réfléchit…', 'opponent');
    this.draw();
    this.later(() => {
      const mv = this.chess.move(toObj(d.bad.uci));
      const no = `${Math.floor(d.bad.ply / 2) + 1}${d.bad.ply % 2 ? '…' : '.'}`;
      this.log(`⚠ L’adversaire joue <strong>${esc(no)} ${esc(sanFr(mv.san))} ?!</strong> — punissez-le : ${d.ours} coup(s) en ${this.timeLimit} s.`, 'warn');
      c.t0 = performance.now();
      c.timer = setInterval(() => this.tick(), 100);
      this.advanceTrash();
    }, 700);
  }

  setTimer(frac) {
    const bar = this.$('[data-timer] span');
    if (!bar) return;
    bar.style.width = `${Math.max(0, frac) * 100}%`;
    bar.parentElement.classList.toggle('low', frac < 0.3);
  }

  tick() {
    const c = this.cur;
    if (!c?.t0 || c.over || c.wait) return;
    const left = 1 - (performance.now() - c.t0) / (this.timeLimit * 1000);
    this.setTimer(left);
    if (left <= 0) this.endTrash(false, 'temps écoulé');
  }

  advanceTrash() {
    const c = this.cur;
    if (c.over) return;
    if (c.i >= c.steps.length) { this.endTrash(true); return; }
    const step = c.steps[c.i];
    if (!step.ours) {
      this.status('⏱ L’adversaire répond…', 'opponent');
      this.draw();
      this.later(() => { if (c.over) return; this.chess.move(toObj(step.uci)); c.i++; this.advanceTrash(); }, 250);
      return;
    }
    this.status(`⏱ À vous : punissez ! (${c.steps.slice(c.i).filter((s) => s.ours).length} coup(s))`, 'player');
    this.draw({ interactive: true });
  }

  onTrashMove(input) {
    const c = this.cur;
    if (c.over || c.wait) return;
    const step = c.steps[c.i];
    if (!step?.ours) return;
    let mv;
    try { mv = new Chess(this.chess.fen()).move(input); } catch { return; }
    if (mv.lan !== step.uci) { this.checkOther(mv, step); return; }
    this.chess.move(toObj(step.uci));
    this.log(`✔ ${esc(sanFr(mv.san))}`, 'ok');
    c.i++;
    this.advanceTrash();
  }

  // Autre coup que celui de la fiche : Stockfish vérifie s'il gagne presque autant que la
  // punition de la fiche (seuilAutreCoup). Le chrono est suspendu pendant la vérification.
  async checkOther(mv, step) {
    const c = this.cur;
    if (!this.engine || this.engine.state !== 'ready') { this.endTrash(false, `${sanFr(mv.san)} au lieu de ${sanFr(step.san)}`); return; }
    c.wait = true;
    const paused = performance.now();
    this.status('<span class="spinner"></span> Autre coup : Stockfish vérifie…', 'opponent');
    const after = new Chess(this.chess.fen());
    after.move(mv.san);
    let cp = null;
    if (after.isCheckmate()) cp = 10000;
    else {
      try {
        const r = await this.engine.analyze({ position: `position fen ${after.fen()}`, movetime: 700, token: { gameId: 'drill', branchId: 'drill', revision: Date.now(), ply: 0 } });
        if (!r.cancelled) cp = cpFrom(r.info?.score, after.turn(), c.color);
      } catch { /* moteur indisponible : coup refusé */ }
    }
    if (!this.alive || c.over) return;
    c.t0 += performance.now() - paused; // le temps de calcul n'est pas compté
    c.wait = false;
    const seuil = seuilAutreCoup(c.e, c.color);
    if (cp != null && cp >= seuil) {
      this.chess.move(mv.san);
      this.log(`✔ ${esc(sanFr(mv.san))} — autre coup gagnant (Stockfish : ${cp >= 9000 ? 'mat' : `+${(cp / 100).toFixed(1).replace('.', ',')}`})`, 'ok');
      c.alt = `${sanFr(mv.san)} (la fiche jouait ${sanFr(step.san)})`;
      this.endTrash(true);
      return;
    }
    this.endTrash(false, `${sanFr(mv.san)} au lieu de ${sanFr(step.san)}${cp != null ? ` (Stockfish : ${(cp / 100).toFixed(1).replace('.', ',')} pour vous, la punition de la fiche fait mieux)` : ''}`);
  }

  endTrash(ok, why = '') {
    const c = this.cur;
    if (c.over) return;
    c.over = true;
    clearInterval(c.timer);
    const ms = Math.round(performance.now() - c.t0);
    recordDrill(this.progress, c.e.id, ok, ok ? ms : null);
    saveProgress(this.progress);
    this.results.push({ id: c.e.id, ok, ms });
    const fenAt = (() => { const x = new Chess(); for (const u of c.d.setup) x.move(toObj(u)); x.move(toObj(c.d.bad.uci)); return x.fen(); })();
    const seq = lineText(fenAt, c.steps.map((s) => s.san));
    const best = this.progress.drills[c.e.id]?.best;
    let body;
    if (ok) {
      this.status(`✔ Puni en ${sec(ms)} !`, 'player');
      this.draw();
      body = `<p><strong>+1 point</strong> — ${c.alt ? `autre coup gagnant ${esc(c.alt)}, ` : 'séquence trouvée '}en ${sec(ms)}${best === ms ? ' (record personnel 🏆)' : best ? ` (record : ${sec(best)})` : ''}.</p>${c.alt ? `<p class="small">La punition de la fiche : <span class="line">${esc(seq)}</span></p>` : ''}`;
    } else {
      this.status(`✘ Raté : ${esc(why)}`, 'opponent');
      const step = c.steps[c.i];
      this.draw({ arrows: step ? [{ from: step.uci.slice(0, 2), to: step.uci.slice(2, 4), kind: 'best' }] : [] });
      body = `<p>✘ ${esc(why)}.</p><p><strong>La punition :</strong> <span class="line">${esc(seq)}</span></p>`;
    }
    this.feedback(`<div class="drill-fb ${ok ? 'ok' : 'ko'}">${body}<p class="small">${esc(c.d.texte || '')}</p>
      <div class="actions"><button type="button" class="primary" data-continue>Exercice suivant</button></div></div>`);
    this.$('[data-continue]').addEventListener('click', () => this.next());
  }

  // ---------- Fin ----------

  finish() {
    if (!this.alive) return;
    this.alive = false;
    clearInterval(this.cur?.timer);
    const ok = this.results.filter((r) => r.ok).length;
    const times = this.results.filter((r) => r.ok && r.ms).map((r) => r.ms);
    this.onDone?.({ kind: this.kind, ok, total: this.results.length, best: times.length ? Math.min(...times) : null });
  }
}
