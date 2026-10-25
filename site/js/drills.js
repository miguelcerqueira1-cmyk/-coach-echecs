// Modules d'exercices de la page Entraînement :
// - « Lignes » : l'application joue les coups adverses d'une fiche, vous jouez les vôtres ;
//   une erreur affiche le plan et le bon coup ;
// - « Anti-trash » : un coup douteux adverse est joué, vous devez enchaîner la punition
//   de la fiche avant la fin du chronomètre.
// Coup refusé : case rouge, secousse et bulle (raison tirée de chess.js ou du piège de la fiche).
// Série de réussites du premier coup ; en fin de séance, bilan et « Revoir uniquement mes
// erreurs » : les positions ratées reviennent jusqu'à ce qu'elles soient toutes validées.
// - « Mes vraies erreurs » (kind 'reelles') : positions de vos parties Lichess/Chess.com où vous
//   avez quitté les fiches ou manqué une punition ; une position validée sort de la liste.
// Les coups attendus sont ceux des fiches (lignes vérifiées par Stockfish) ; rien n'est inventé.
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { sanFr } from './analysis.js';
import { key, cpFrom } from './training-core.js';
import { lineSteps, trashDrill, seuilAutreCoup, raisonErreur, nextStreak } from './drills-core.js';
import { lineText } from './games-core.js';
import { recordLine, recordDrill, saveProgress } from './progress.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const sec = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';

export class DrillRunner {
  // kind : 'lignes' | 'trash' ; ids : fiches à travailler ; onDone(résumé) : retour au menu.
  // guided : pratique guidée d'une leçon (indice, puis le coup ; pas de pénalité ni de reprise).
  constructor({ el, data, kind, ids, tree, progress, gradePos, timeLimit = 10, guided = false, engine = null, positions = [], onValidated = null, onDone }) {
    this.onValidated = onValidated;
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
    this.results = [];
    this.missed = []; // positions ratées (révision ciblée en fin de séance)
    this.okFirst = 0; // positions (ou punitions) réussies du premier coup
    this.streak = { cur: 0, best: 0 };
    this.reviewing = false;
    this.alive = true;
    this.layout();
    if (kind === 'reelles') { this.startReview(positions.map((x) => ({ ...x, kind: 'pos' }))); return; }
    this.next();
  }

  colorOf(e) { return this.data.repertoires[e.rep].couleur; }

  layout() {
    const title = { trash: '⏱ Drill anti-trash', reelles: '🎯 Mes vraies erreurs' }[this.kind] || (this.guided ? '📖 À vous : pratique guidée' : '📚 Lignes du répertoire');
    this.el.innerHTML = `<div class="train-layout drill" data-drill="${this.kind}">
      <section>
        <div class="train-status" data-status></div>
        <p class="drill-streak"><span class="streak" data-streak hidden></span></p>
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

  // Série de réussites du premier coup (effet vert discret à chaque hausse).
  bumpStreak(firstTry) {
    this.streak = nextStreak(this.streak, firstTry);
    const el = this.$('[data-streak]');
    el.hidden = false;
    el.textContent = `🔥 Série : ${this.streak.cur}`;
    el.classList.toggle('hot', this.streak.cur >= 3);
    el.classList.remove('bump');
    if (firstTry) { void el.offsetWidth; el.classList.add('bump'); }
  }

  // Position ratée, notée une fois pour la révision ciblée.
  noteMissed(m) {
    const id = m.kind === 'trash' ? `t:${m.e.id}` : `l:${m.e.id}:${m.i}`;
    if (!this.missed.some((x) => x.id === id)) this.missed.push({ ...m, id });
  }

  missedLabel(m) {
    if (m.kind === 'trash') return `« ${m.e.nom} » — punition chronométrée`;
    return `« ${m.e.nom} » — ${Math.floor(m.i / 2) + 1}${m.i % 2 ? 'e coup noir' : 'e coup blanc'}`;
  }

  // Coup refusé : rien ne bouge sur l'échiquier, la case visée clignote et une bulle explique.
  refuse(c, mv, step, { reveal = true } = {}) {
    const k = key(c.steps.slice(0, c.i).map((s) => s.uci));
    const trap = this.tree[c.e.rep]?.traps.get(k);
    const why = raisonErreur({ fen: this.chess.fen(), uci: mv.lan, expectedSan: reveal ? step.san : null, trap });
    this.board.flashError(mv.to, why || 'Ce n’est pas le coup de la ligne.');
  }

  // ---------- Enchaînement des exercices ----------

  next() {
    this.feedback('');
    this.board.hideBubble();
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
    if (this.cur.pos) { this.onPosMove(input); return; }
    if (this.kind === 'trash') { this.onTrashMove(input); return; }
    const c = this.cur;
    const step = c.steps[c.i];
    if (!step?.ours) return;
    let mv;
    try { mv = new Chess(this.chess.fen()).move(input); } catch { return; }
    if (c.review) { this.onReviewMove(c, mv, step); return; }
    const k = key(c.steps.slice(0, c.i).map((s) => s.uci));
    const t = this.tree[c.e.rep];
    if (mv.lan === step.uci) {
      const firstTry = !c.errAt?.has(c.i);
      this.board.setHint(null);
      this.board.hideBubble();
      this.feedback('');
      if (!(this.guided && c.hints?.ply === c.i)) this.gradePos(c.e.rep, k, true);
      if (firstTry) this.okFirst++;
      this.bumpStreak(firstTry);
      this.chess.move(toObj(step.uci));
      this.log(`✔ ${esc(sanFr(mv.san))}`, 'ok');
      c.i++;
      this.advance();
      return;
    }
    const good = sanFr(step.san);
    const arrow = { from: step.uci.slice(0, 2), to: step.uci.slice(2, 4), kind: 'best' };
    // Autre coup de votre répertoire (transposition d'une autre fiche) : pas une faute.
    if (t.ours.get(k)?.has(mv.lan)) {
      this.log(`≈ ${esc(sanFr(mv.san))} est aussi dans votre répertoire, mais cette fiche continue par <strong>${esc(good)}</strong>.`, 'muted');
      c.wait = true;
      this.draw({ arrows: [arrow] });
      this.later(() => { c.wait = false; this.chess.move(toObj(step.uci)); c.i++; this.advance(); }, 1300);
      return;
    }
    c.errors++;
    (c.errAt ??= new Set()).add(c.i);
    this.gradePos(c.e.rep, k, false);
    this.bumpStreak(false);
    this.noteMissed({ kind: 'ligne', e: c.e, i: c.i, color: c.color });
    if (this.guided) { this.refuse(c, mv, step, { reveal: (c.hints?.ply === c.i ? c.hints.n : 0) >= 1 }); this.guide(c, step, mv, arrow); return; }
    this.refuse(c, mv, step);
    const trap = t.traps.get(k);
    const isTrap = trap?.uci === mv.lan;
    const plan = c.e.plan ? `<p class="small"><strong>Plan de la fiche :</strong> ${esc(c.e.plan)}</p>` : '';
    this.feedback(`<div class="drill-fb ko">
      <p>✘ <strong>${esc(sanFr(mv.san))}</strong> n’est pas le coup de la ligne. Le bon coup : <strong>${esc(good)}</strong> (flèche verte).</p>
      ${isTrap ? `<p class="small">⚠ C’est le piège de la fiche : ${esc(trap.texte)}</p>` : ''}
      ${plan}
      <p class="small muted">Elle sera proposée dans « Revoir uniquement mes erreurs » en fin de séance.</p>
      <div class="actions"><button type="button" class="primary" data-continue>J’ai compris, continuer</button></div>
    </div>`);
    this.log(`✘ ${esc(sanFr(mv.san))} — attendu ${esc(good)}`, 'ko');
    c.wait = true;
    this.status('Erreur : lisez l’explication', 'opponent');
    this.draw({ arrows: [arrow] });
    this.$('[data-continue]').addEventListener('click', () => {
      this.feedback('');
      this.board.hideBubble();
      c.wait = false;
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

  // ---------- Bilan et révision ciblée ----------

  showRecap() {
    this.recapDone = true;
    clearInterval(this.cur?.timer);
    this.cur = null;
    if (this.chess) this.draw();
    this.board.hideBubble();
    this.board.setHint(null);
    const n = this.missed.length;
    const pl = (x) => (x > 1 ? 's' : '');
    this.status('Séance terminée', 'player');
    this.$('[data-head]').innerHTML = '<p><strong>Bilan de la séance</strong></p>';
    this.feedback(`<div class="drill-recap" data-recap>
      <p class="recap-nums"><span class="ok">✔ ${this.okFirst} réussie${pl(this.okFirst)}</span> · <span class="ko">✘ ${n} ratée${pl(n)}</span>${this.streak.best ? ` · 🔥 meilleure série ${this.streak.best}` : ''}</p>
      <p class="small muted">Réussie = trouvée du premier coup. ${n ? 'Positions à revoir :' : ''}</p>
      ${n ? `<ul class="small">${this.missed.map((m) => `<li>${esc(this.missedLabel(m))}</li>`).join('')}</ul>` : ''}
      <div class="actions">${n ? '<button type="button" class="primary" data-review>🎯 Revoir uniquement mes erreurs</button>' : ''}<button type="button" data-end>Terminer</button></div>
    </div>`);
    this.$('[data-review]')?.addEventListener('click', () => this.startReview());
    this.$('[data-end]').addEventListener('click', () => this.done());
  }

  // Mini-quiz des positions ratées : une position réussie sort de la file, une position
  // ratée repasse à la fin, jusqu'à ce que toutes soient validées.
  startReview(queue = this.missed.map((m) => ({ ...m }))) {
    this.reviewing = true;
    this.queue = queue;
    this.$('[data-log]').innerHTML = '';
    this.log(this.kind === 'reelles'
      ? '🎯 Positions de vos vraies parties : retrouvez le coup de votre répertoire. Une position ratée repasse en fin de liste.'
      : '🎯 Révision ciblée : seulement les positions ratées, jusqu’à ce qu’elles soient toutes validées.', 'muted');
    this.nextReview();
  }

  nextReview() {
    this.feedback('');
    this.board.hideBubble();
    this.board.setHint(null);
    if (!this.queue.length) {
      this.cur = null;
      this.status('Toutes vos erreurs sont corrigées ✔', 'player');
      this.$('[data-head]').innerHTML = `<p><strong>${this.kind === 'reelles' ? 'Vraies erreurs corrigées' : 'Révision ciblée terminée'}</strong></p>`;
      this.feedback(`<div class="drill-fb ok" data-review-done><p>✔ Toutes les positions ${this.kind === 'reelles' ? 'de vos parties' : 'ratées'} sont validées.${this.streak.best ? ` Meilleure série : 🔥 ${this.streak.best}.` : ''}</p>
        <div class="actions"><button type="button" class="primary" data-end>Terminer</button></div></div>`);
      this.$('[data-end]').addEventListener('click', () => this.done());
      return;
    }
    const m = this.queue[0];
    this.board.setOrientation(m.color);
    if (m.kind === 'pos') { this.showPos(m); return; }
    this.$('[data-head]').innerHTML = `<p><strong>Révision ciblée</strong> — encore ${this.queue.length} position(s) · fiche « ${esc(m.e.nom)} »</p>`;
    if (m.kind === 'trash') {
      this.cur = { e: m.e, d: trashDrill(m.e, m.color), color: m.color, errors: 0, i: 0, review: m };
      this.startTrash();
      return;
    }
    const steps = lineSteps(m.e, m.color);
    this.cur = { e: m.e, color: m.color, steps, i: m.i, errors: 0, review: m };
    this.chess = new Chess();
    for (const st of steps.slice(0, m.i)) this.chess.move(toObj(st.uci));
    this.status('À vous : retrouvez le coup de la ligne', 'player');
    this.draw({ interactive: true });
  }

  // Position d'une vraie partie : tous les coups des fiches à cette position sont acceptés.
  showPos(m) {
    this.chess = new Chess();
    for (const u of m.moves) this.chess.move(toObj(u));
    this.cur = { pos: true, review: m, color: m.color };
    const quand = m.date ? new Date(m.date).toLocaleDateString('fr-FR') : '';
    this.$('[data-head]').innerHTML = `<p><strong>Encore ${this.queue.length} position(s)</strong> — partie${quand ? ` du ${esc(quand)}` : ''}${m.opp ? ` contre ${esc(m.opp)}` : ''}${m.url ? ` <a class="tiny" href="${esc(m.url)}" target="_blank" rel="noopener">↗</a>` : ''}${m.ficheNom ? ` · fiche « ${esc(m.ficheNom)} »` : ''}</p>`;
    const vous = m.played ? `vous aviez joué <strong>${esc(sanFr(m.played))}</strong>` : 'la partie s’est arrêtée là';
    this.status(m.kind === 'punition'
      ? `L’adversaire vient de faire l’erreur prévue par la fiche (${vous}) : punissez-la !`
      : `Ici, ${vous} et vous êtes sorti du répertoire : quel est le coup de vos fiches ?`, 'player');
    this.draw({ interactive: true });
  }

  onPosMove(input) {
    const c = this.cur;
    const m = c.review;
    let mv;
    try { mv = new Chess(this.chess.fen()).move(input); } catch { return; }
    const rep = m.rep; // répertoire de la vraie partie (enregistré avec la position)
    const k = key(m.moves);
    const inTree = this.tree[rep]?.ours.has(k);
    const bestSan = new Chess(this.chess.fen()).move(toObj(m.expected[0])).san;
    if (m.expected.includes(mv.lan)) {
      this.queue.shift();
      if (inTree) this.gradePos(rep, k, true);
      this.bumpStreak(true);
      this.results.push({ id: m.gameId, ok: true });
      this.onValidated?.(m.gameId);
      this.chess.move(toObj(mv.lan));
      this.log(`✔ ${esc(sanFr(mv.san))} — position corrigée`, 'ok');
      this.draw();
      this.board.showBubble('✔ Validé ! Cette position sort de la liste.', 'ok');
      c.wait = true;
      this.later(() => this.nextReview(), 900);
      return;
    }
    if (inTree) this.gradePos(rep, k, false);
    this.bumpStreak(false);
    const why = raisonErreur({ fen: this.chess.fen(), uci: mv.lan, expectedSan: bestSan });
    this.board.flashError(mv.to, why || `Ici, on joue ${sanFr(bestSan)}.`);
    this.queue.push(this.queue.shift());
    this.log(`✘ ${esc(sanFr(mv.san))} — attendu ${esc(sanFr(bestSan))}`, 'ko');
    c.wait = true;
    this.draw({ arrows: [{ from: m.expected[0].slice(0, 2), to: m.expected[0].slice(2, 4), kind: 'best' }] });
    this.feedback(`<div class="drill-fb ko"><p>✘ Le coup de votre répertoire est <strong>${esc(sanFr(bestSan))}</strong> (flèche verte).</p>
      ${m.texte ? `<p class="small">${esc(m.texte)}</p>` : ''}
      <p class="small muted">La position repasse en fin de liste.</p>
      <div class="actions"><button type="button" class="primary" data-continue>Continuer</button></div></div>`);
    this.$('[data-continue]').addEventListener('click', () => this.nextReview());
  }

  onReviewMove(c, mv, step) {
    const k = key(c.steps.slice(0, c.i).map((s) => s.uci));
    if (mv.lan === step.uci) {
      this.queue.shift();
      this.gradePos(c.e.rep, k, true);
      this.bumpStreak(true);
      this.chess.move(toObj(step.uci));
      this.log(`✔ ${esc(sanFr(mv.san))} — validé (« ${esc(c.e.nom)} »)`, 'ok');
      this.draw();
      this.board.showBubble('✔ Validé !', 'ok');
      c.wait = true;
      this.later(() => this.nextReview(), 800);
      return;
    }
    this.gradePos(c.e.rep, k, false);
    this.bumpStreak(false);
    this.refuse(c, mv, step);
    this.queue.push(this.queue.shift());
    this.log(`✘ ${esc(sanFr(mv.san))} — attendu ${esc(sanFr(step.san))} ; la position reviendra.`, 'ko');
    c.wait = true;
    this.draw({ arrows: [{ from: step.uci.slice(0, 2), to: step.uci.slice(2, 4), kind: 'best' }] });
    this.feedback(`<div class="drill-fb ko"><p>✘ Le coup de la ligne est <strong>${esc(sanFr(step.san))}</strong> (flèche verte). La position repasse en fin de file.</p>
      <div class="actions"><button type="button" class="primary" data-continue>Continuer</button></div></div>`);
    this.$('[data-continue]').addEventListener('click', () => this.nextReview());
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
    this.board.hideBubble();
    this.bumpStreak(true);
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
    if (!c.review) {
      this.results.push({ id: c.e.id, ok, ms });
      if (ok) this.okFirst++;
      else this.noteMissed({ kind: 'trash', e: c.e, color: c.color });
    }
    if (!ok) this.bumpStreak(false);
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
      if (step) this.board.flashError(step.uci.slice(2, 4), `✘ ${why}. La punition commence par ${sanFr(step.san)}.`);
    }
    this.feedback(`<div class="drill-fb ${ok ? 'ok' : 'ko'}">${body}<p class="small">${esc(c.d.texte || '')}</p>
      <div class="actions"><button type="button" class="primary" data-continue>${c.review ? 'Continuer' : 'Exercice suivant'}</button></div></div>`);
    this.$('[data-continue]').addEventListener('click', () => {
      if (!c.review) { this.next(); return; }
      if (ok) this.queue.shift(); else this.queue.push(this.queue.shift());
      this.nextReview();
    });
  }

  // ---------- Fin ----------

  // Fin de la série d'exercices (ou « Terminer ») : bilan avec révision ciblée s'il y a des erreurs.
  finish() {
    if (!this.alive) return;
    if (!this.recapDone && !this.reviewing && this.missed.length) { this.showRecap(); return; }
    this.done();
  }

  done() {
    if (!this.alive) return;
    this.alive = false;
    this.board.hideBubble();
    clearInterval(this.cur?.timer);
    const ok = this.results.filter((r) => r.ok).length;
    const times = this.results.filter((r) => r.ok && r.ms).map((r) => r.ms);
    this.onDone?.({ kind: this.kind, ok, total: this.results.length, best: times.length ? Math.min(...times) : null });
  }
}
