// Modules d'exercices de la page Entraînement :
// - « Lignes » : l'application joue les coups adverses d'une fiche, vous jouez les vôtres ;
//   une erreur affiche le plan et le bon coup ;
// - « Anti-trash » : un coup douteux adverse est joué, vous devez enchaîner la punition
//   de la fiche avant la fin du chronomètre.
// Coup refusé : case rouge, secousse et bulle (raison tirée de chess.js ou du piège de la fiche).
// Série de réussites du premier coup ; en fin de séance, bilan et « Refaire mes erreurs de la séance »
// : les positions ratées reviennent jusqu'à ce qu'elles soient toutes validées.
// - « Positions de mes parties » (kind 'reelles') : positions de vos parties Lichess/Chess.com où vous
//   avez quitté les fiches ou manqué une punition ; une position validée sort de la liste.
// Les coups attendus sont ceux des fiches (lignes vérifiées par Stockfish) ; rien n'est inventé.
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { sanFr } from './analysis.js';
import { key, cpFrom } from './training-core.js';
import { lineSteps, trashDrill, seuilAutreCoup, raisonErreur, nextStreak, bilanTemps } from './drills-core.js';
import { lineText } from './games-core.js';
import { recordLine, recordDrill, saveProgress } from './progress.js';
import { langue } from './i18n.js';
import { VIES, tempsRush, melanger, charger as chargerRush } from './rush-core.js';
import { sons } from './sons.js';

// Phrases en français ou en anglais selon la langue de l'interface.
const L = (fr, en) => (langue() === 'en' ? en : fr);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const sec = (ms) => (ms / 1000).toFixed(1).replace('.', L(',', '.')) + ' s';

export class DrillRunner {
  // kind : 'lignes' | 'trash' ; ids : fiches à travailler ; onDone(résumé) : retour au menu.
  // guided : pratique guidée d'une leçon (indice, puis le coup ; pas de pénalité ni de reprise).
  // complet : lignes prolongées par la suite Stockfish ; tempsCoup : secondes par coup (0 = libre,
  // « rythme Blitz » : trop lent = position ratée) ; repeter : refaire une ligne jusqu'à N fois
  // d'affilée sans faute.
  constructor({ el, data, kind, ids, tree, progress, gradePos, timeLimit = 10, guided = false, engine = null, positions = [], onValidated = null, onDone, complet = false, tempsCoup = 0, repeter = 1, apercu = false, rush = false }) {
    // rush : Rush réfutations (punitions enchaînées sans fin, 3 vies, chrono qui raccourcit).
    this.rush = rush && kind === 'trash' ? { vies: VIES, score: 0 } : null;
    this.rushBest = this.rush ? chargerRush().best : 0;
    this.complet = complet;
    this.apercu = apercu; // relire la ligne (coups animés) avant de la jouer
    this.apercuVu = new Set();
    this.relireTour = 0;
    this.tempsCoup = tempsCoup;
    this.repeter = repeter;
    this.times = []; // { ms, e, i } : temps de réflexion par coup (lignes)
    this.consec = {}; // fiche → réussites sans faute d'affilée (répétitions)
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
    if (this.rush) this.items = melanger(this.items);
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
    const title = this.rush ? L('⚡ Rush réfutations', '⚡ Refutation rush') : { trash: L('⏱ Drill anti-trash', '⏱ Anti-trash drill'), reelles: L('🎯 Positions de mes parties', '🎯 Positions from my games') }[this.kind] || (this.guided ? L('📖 À vous : pratique guidée', '📖 Your turn: guided practice') : L('📚 Lignes du répertoire', '📚 Repertoire lines'));
    this.el.innerHTML = `<div class="train-layout drill" data-drill="${this.kind}">
      <section>
        ${this.rush ? '<div data-rush-top></div>' : ''}
        <div class="train-status" data-status></div>
        <p class="drill-streak"><span class="streak" data-streak hidden></span></p>
        ${this.kind === 'trash' || this.tempsCoup ? '<div class="drill-timer" data-timer><span></span></div>' : ''}
        <div class="board-wrap" data-board></div>
        <div class="actions"><button type="button" data-quit>${L('Terminer', 'Finish')}</button></div>
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
    el.textContent = L(`🔥 Série : ${this.streak.cur}`, `🔥 Streak: ${this.streak.cur}`);
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
    if (m.kind === 'trash') return L(`« ${m.e.nom} » — punition chronométrée`, `“${m.e.nom}” — timed punishment`);
    return L(`« ${m.e.nom} » — ${Math.floor(m.i / 2) + 1}${m.i % 2 ? 'e coup noir' : 'e coup blanc'}`, `“${m.e.nom}” — ${m.i % 2 ? 'Black' : 'White'}’s move ${Math.floor(m.i / 2) + 1}`);
  }

  // Coup refusé : rien ne bouge sur l'échiquier, la case visée clignote et une bulle explique.
  refuse(c, mv, step, { reveal = true } = {}) {
    const k = key(c.steps.slice(0, c.i).map((s) => s.uci));
    const trap = this.tree[c.e.rep]?.traps.get(k);
    const why = raisonErreur({ fen: this.chess.fen(), uci: mv.lan, expectedSan: reveal ? step.san : null, trap });
    this.board.flashError(mv.to, why || L('Ce n’est pas le coup de la ligne.', 'That’s not the line’s move.'));
  }

  // ---------- Enchaînement des exercices ----------

  next() {
    this.feedback('');
    this.board.hideBubble();
    this.idx++;
    if (this.rush && this.idx >= this.items.length) { this.items = melanger(this.items, this.items.at(-1)); this.idx = 0; }
    if (this.idx >= this.items.length) { this.finish(); return; }
    const it = this.items[this.idx];
    this.cur = { ...it, color: this.colorOf(it.e), errors: 0, i: 0 };
    this.board.setOrientation(this.cur.color);
    if (this.rush) {
      this.timeLimit = tempsRush(this.rush.score);
      this.majRush(it.e);
      this.startTrash();
      return;
    }
    this.$('[data-head]').innerHTML = `<p><strong>${this.idx + 1} / ${this.items.length}</strong> ${L(`— fiche « ${esc(it.e.nom)} »`, `— line “${esc(it.e.nom)}”`)} <span class="badge eco">${esc(it.e.eco)}</span></p>`;
    if (this.kind === 'trash') this.startTrash(); else this.startLine();
  }

  // Vies et score : au-dessus de l'échiquier (visible sur téléphone) ; nom de la fiche dans le panneau.
  majRush(e) {
    this.$('[data-rush-top]').innerHTML = this.rushHead(null);
    this.$('[data-head]').innerHTML = `<p class="small muted">${esc(e.nom)} <span class="badge eco">${esc(e.eco)}</span></p>`;
  }

  rushHead(e) {
    const r = this.rush;
    const coeurs = '❤️'.repeat(r.vies) + '🤍'.repeat(Math.max(0, VIES - r.vies));
    return `<p class="rush-head"><span class="rush-vies" aria-label="${L(`${r.vies} vie(s)`, `${r.vies} life/lives`)}">${coeurs}</span> <strong>${L(`Score : ${r.score}`, `Score: ${r.score}`)}</strong> <span class="muted">· ${L(`Record : ${this.rushBest}`, `Best: ${this.rushBest}`)} · ${this.timeLimit} s</span></p>
      ${e ? `<p class="small muted">${esc(e.nom)} <span class="badge eco">${esc(e.eco)}</span></p>` : ''}`;
  }

  // ---------- Module Lignes ----------

  startLine() {
    const c = this.cur;
    c.steps = lineSteps(c.e, c.color, { complet: this.complet });
    if (this.apercu && !this.guided && !this.apercuVu.has(c.e.id)) { this.apercuVu.add(c.e.id); this.relire(c); return; }
    this.chess = new Chess();
    this.log(this.guided
      ? L(`Rejouez la ligne que vous venez d’apprendre. En cas d’hésitation : un indice, puis le coup.`, `Replay the line you have just learned. If you hesitate: a hint, then the move.`)
      : L(`Ligne « ${esc(c.e.nom)} » : l’application joue l’adversaire, à vous les coups ${c.color === 'w' ? 'blancs' : 'noirs'}.`, `Line “${esc(c.e.nom)}”: the app plays your opponent, you play the ${c.color === 'w' ? 'White' : 'Black'} moves.`), 'muted');
    this.advance();
  }

  // Révision avant l'exercice : la ligne défile sur l'échiquier (coups écrits dessous), puis
  // « À moi de jouer ». Rien n'est noté pendant la relecture.
  relire(c) {
    this.chess = new Chess();
    this.draw();
    this.status(L('📖 Révision : regarde la ligne, puis joue-la.', '📖 Review: watch the line, then play it.'), 'player');
    this.feedback(`<div class="card relire"><p class="small">${L(`<strong>Ligne « ${esc(c.e.nom)} »</strong> (tes coups : ${c.color === 'w' ? 'Blancs' : 'Noirs'})`, `<strong>Line “${esc(c.e.nom)}”</strong> (your moves: ${c.color === 'w' ? 'White' : 'Black'})`)}</p>
      <p class="relire-coups" data-relire-coups>${c.steps.map((x, i) => `<span data-k="${i}">${esc(this.coupTexte(c.steps, i))}</span>`).join(' ')}</p>
      ${c.e.plan ? `<p class="small muted">${L('Plan : ', 'Plan: ')}${esc(c.e.plan)}</p>` : ''}
      <div class="actions"><button type="button" data-relire-revoir>${L('↺ Revoir', '↺ Watch again')}</button><button type="button" class="primary" data-relire-go>${L('À moi de jouer →', 'My turn →')}</button></div></div>`);
    const coups = [...this.el.querySelectorAll('[data-relire-coups] span')];
    let i = 0;
    const tour = ++this.relireTour;
    const pas = () => {
      if (!this.alive || this.relireTour !== tour || this.cur !== c || i >= c.steps.length) return;
      const m = this.chess.move(toObj(c.steps[i].uci));
      coups.forEach((el, k) => el.classList.toggle('cur', k === i));
      this.draw({ arrows: [{ from: m.from, to: m.to, kind: c.steps[i].ours ? 'best' : 'reply' }] });
      i++;
      setTimeout(pas, 1100);
    };
    setTimeout(pas, 500);
    this.$('[data-relire-revoir]').addEventListener('click', () => this.relire(c));
    // Même bouton sous l'échiquier (sur téléphone, le panneau est plus bas).
    this.$('[data-relire-go2]')?.remove();
    this.$('[data-quit]').insertAdjacentHTML('beforebegin', `<button type="button" class="primary" data-relire-go2>${L('À moi de jouer →', 'My turn →')}</button>`);
    const go = () => {
      this.relireTour++;
      this.$('[data-relire-go2]')?.remove();
      this.feedback('');
      this.board.setArrows([]);
      this.startLine();
    };
    this.$('[data-relire-go]').addEventListener('click', go);
    this.$('[data-relire-go2]').addEventListener('click', go);
  }

  coupTexte(steps, i) {
    const no = Math.floor(i / 2) + 1;
    return i % 2 === 0 ? `${no}. ${sanFr(steps[i].san)}` : (i === 0 ? `${no}… ${sanFr(steps[i].san)}` : sanFr(steps[i].san));
  }

  advance() {
    const c = this.cur;
    if (c.i >= c.steps.length) { this.endLine(); return; }
    const step = c.steps[c.i];
    if (!step.ours) {
      this.status(L('<span class="spinner"></span> L’adversaire joue…', '<span class="spinner"></span> Your opponent is playing…'), 'opponent');
      this.draw();
      this.later(() => {
        this.chess.move(toObj(step.uci));
        c.i++;
        this.advance();
      }, 450);
      return;
    }
    this.status(L(`À vous (${c.color === 'w' ? 'Blancs' : 'Noirs'}) : ${step.moteur ? 'coup de la suite Stockfish' : 'coup de la ligne'} ?`, `Your move (${c.color === 'w' ? 'White' : 'Black'}): ${step.moteur ? 'Stockfish continuation move' : 'line move'}?`), 'player');
    this.draw({ interactive: true });
    this.startMoveClock();
  }

  // ---------- Rythme Blitz : chrono par coup ----------

  startMoveClock() {
    const c = this.cur;
    this.stopMoveClock();
    c.t0 = performance.now();
    if (!this.tempsCoup || this.kind !== 'lignes' || this.guided) return;
    this.setTimer(1);
    c.moveTimer = setInterval(() => {
      if (!this.alive || this.cur !== c || c.wait) return;
      const left = 1 - (performance.now() - c.t0) / (this.tempsCoup * 1000);
      this.setTimer(left);
      if (left <= 0) this.tooSlow();
    }, 100);
  }

  stopMoveClock() {
    const c = this.cur;
    if (c?.moveTimer) { clearInterval(c.moveTimer); c.moveTimer = null; }
  }

  // Temps écoulé : position ratée (révision ciblée), le coup est montré puis joué.
  tooSlow() {
    const c = this.cur;
    const step = c.steps[c.i];
    this.stopMoveClock();
    c.errors++;
    (c.errAt ??= new Set()).add(c.i);
    this.times.push({ ms: this.tempsCoup * 1000, e: c.e, i: c.i, lent: true });
    if (!step.moteur) this.gradePos(c.e.rep, key(c.steps.slice(0, c.i).map((x) => x.uci)), false);
    this.bumpStreak(false);
    this.noteMissed({ kind: 'ligne', e: c.e, i: c.i, color: c.color });
    c.wait = true;
    this.status(L(`⏱ Trop lent ! Le coup était ${esc(sanFr(step.san))}`, `⏱ Too slow! The move was ${esc(sanFr(step.san))}`), 'opponent');
    this.board.showBubble(L(`⏱ Trop lent ! Le coup était ${sanFr(step.san)}.`, `⏱ Too slow! The move was ${sanFr(step.san)}.`), 'error');
    this.draw({ arrows: [{ from: step.uci.slice(0, 2), to: step.uci.slice(2, 4), kind: 'best' }] });
    this.log(L(`⏱ Trop lent (${this.tempsCoup} s) — c’était ${esc(sanFr(step.san))}`, `⏱ Too slow (${this.tempsCoup} s) — it was ${esc(sanFr(step.san))}`), 'ko');
    this.later(() => { c.wait = false; this.board.hideBubble(); this.chess.move(toObj(step.uci)); c.i++; this.advance(); }, 1500);
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
      this.stopMoveClock();
      if (c.t0 && !this.guided) this.times.push({ ms: performance.now() - c.t0, e: c.e, i: c.i });
      this.board.setHint(null);
      this.board.hideBubble();
      this.feedback('');
      if (!(this.guided && c.hints?.ply === c.i) && !step.moteur) this.gradePos(c.e.rep, k, true);
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
      this.log(L(`≈ ${esc(sanFr(mv.san))} est aussi dans votre répertoire, mais cette fiche continue par <strong>${esc(good)}</strong>.`, `≈ ${esc(sanFr(mv.san))} is also in your repertoire, but this line continues with <strong>${esc(good)}</strong>.`), 'muted');
      c.wait = true;
      this.draw({ arrows: [arrow] });
      this.later(() => { c.wait = false; this.chess.move(toObj(step.uci)); c.i++; this.advance(); }, 1300);
      return;
    }
    c.errors++;
    (c.errAt ??= new Set()).add(c.i);
    this.stopMoveClock();
    if (!step.moteur) this.gradePos(c.e.rep, k, false);
    this.bumpStreak(false);
    this.noteMissed({ kind: 'ligne', e: c.e, i: c.i, color: c.color });
    if (this.guided) { this.refuse(c, mv, step, { reveal: (c.hints?.ply === c.i ? c.hints.n : 0) >= 1 }); this.guide(c, step, mv, arrow); return; }
    this.refuse(c, mv, step);
    const trap = t.traps.get(k);
    const isTrap = trap?.uci === mv.lan;
    const plan = c.e.plan ? `<p class="small"><strong>${L('Plan de la fiche :', 'Line plan:')}</strong> ${esc(c.e.plan)}</p>` : '';
    this.feedback(`<div class="drill-fb ko">
      <p>${L(`✘ <strong>${esc(sanFr(mv.san))}</strong> n’est pas le coup de la ligne. Le bon coup : <strong>${esc(good)}</strong> (flèche verte).`, `✘ <strong>${esc(sanFr(mv.san))}</strong> is not the line’s move. The right move: <strong>${esc(good)}</strong> (green arrow).`)}</p>
      ${isTrap ? `<p class="small">${L('⚠ C’est le piège de la fiche : ', '⚠ This is the line’s trap: ')}${esc(trap.texte)}</p>` : ''}
      ${step.moteur ? L('<p class="small muted">🤖 Ce coup fait partie de la suite conseillée par Stockfish, au-delà de la fiche.</p>', '<p class="small muted">🤖 This move is part of the continuation recommended by Stockfish, beyond the line.</p>') : ''}
      ${plan}
      <p class="small muted">${L('Elle sera proposée dans « Refaire mes erreurs de la séance » à la fin.', 'It will come back in “Redo my mistakes from this session” at the end.')}</p>
      <div class="actions"><button type="button" class="primary" data-continue>${L('J’ai compris, continuer', 'Got it, continue')}</button></div>
    </div>`);
    this.log(L(`✘ ${esc(sanFr(mv.san))} — attendu ${esc(good)}`, `✘ ${esc(sanFr(mv.san))} — expected ${esc(good)}`), 'ko');
    c.wait = true;
    this.status(L('Erreur : lisez l’explication', 'Mistake: read the explanation'), 'opponent');
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
    const NOM_EN = { p: 'a pawn', n: 'a knight', b: 'a bishop', r: 'a rook', q: 'the queen', k: 'the king' };
    if (c.hints.n === 1) {
      this.board.setHint(from);
      this.feedback(`<div class="drill-fb"><p>${L(`Pas tout à fait (${esc(sanFr(mv.san))}). <strong>Indice :</strong> on joue ${NOM[piece?.type] || 'une pièce'} — la case de départ est entourée.`, `Not quite (${esc(sanFr(mv.san))}). <strong>Hint:</strong> move ${NOM_EN[piece?.type] || 'a piece'} — its starting square is circled.`)}</p></div>`);
      this.log(L(`↺ ${esc(sanFr(mv.san))} — indice donné`, `↺ ${esc(sanFr(mv.san))} — hint given`), 'muted');
    } else {
      this.board.setHint(null);
      this.feedback(`<div class="drill-fb"><p>${L(`Le coup de la ligne est <strong>${esc(sanFr(step.san))}</strong> (flèche verte) : jouez-le pour continuer.`, `The line’s move is <strong>${esc(sanFr(step.san))}</strong> (green arrow): play it to continue.`)}</p></div>`);
      this.draw({ interactive: true, arrows: [arrow] });
      return;
    }
    this.draw({ interactive: true });
  }

  endLine() {
    const c = this.cur;
    const ok = c.errors === 0;
    this.stopMoveClock();
    if (!this.guided) { recordLine(this.progress, c.e.id, ok); saveProgress(this.progress); }
    this.results.push({ id: c.e.id, ok });
    // Répétitions : la même ligne revient jusqu'à N fois d'affilée sans faute (10 essais au plus).
    if (this.repeter > 1 && !this.guided) {
      this.consec[c.e.id] = ok ? (this.consec[c.e.id] || 0) + 1 : 0;
      const essais = this.results.filter((r) => r.id === c.e.id).length;
      if (this.consec[c.e.id] < this.repeter && essais < 10) {
        this.items.splice(this.idx + 1, 0, { e: c.e });
        this.log(L(`↻ On recommence « ${esc(c.e.nom)} » : ${this.consec[c.e.id]} / ${this.repeter} sans faute d’affilée.`, `↻ Again: “${esc(c.e.nom)}”: ${this.consec[c.e.id]} / ${this.repeter} flawless in a row.`), 'muted');
      } else if (this.consec[c.e.id] >= this.repeter) this.log(L(`🏆 « ${esc(c.e.nom)} » : ${this.repeter} fois d’affilée sans faute !`, `🏆 “${esc(c.e.nom)}”: ${this.repeter} times in a row without a mistake!`), 'ok');
    }
    this.log(ok ? L(`<strong>Ligne réussie sans faute ✔</strong>`, `<strong>Line completed without a mistake ✔</strong>`) : L(`<strong>Ligne terminée</strong> avec ${c.errors} erreur(s).`, `<strong>Line finished</strong> with ${c.errors} mistake(s).`), ok ? 'ok' : 'warn');
    if (ok) sons.reussite();
    this.status(ok ? L('Ligne réussie ✔', 'Line completed ✔') : L('Ligne terminée', 'Line finished'), ok ? 'player' : 'opponent');
    this.draw();
    this.later(() => this.next(), 1100);
  }

  // ---------- Bilan et révision ciblée ----------

  showRecap() {
    this.stopMoveClock();
    this.recapDone = true;
    clearInterval(this.cur?.timer);
    this.cur = null;
    if (this.chess) this.draw();
    this.board.hideBubble();
    this.board.setHint(null);
    const n = this.missed.length;
    const pl = (x) => (x > 1 ? 's' : '');
    this.status(L('Séance terminée', 'Session finished'), 'player');
    this.$('[data-head]').innerHTML = L('<p><strong>Bilan de la séance</strong></p>', '<p><strong>Session summary</strong></p>');
    const t = bilanTemps(this.times);
    const lbl = (x) => L(`« ${x.e.nom} », ${Math.floor(x.i / 2) + 1}${x.i % 2 ? 'e coup noir' : 'e coup blanc'}`, `“${x.e.nom}”, ${x.i % 2 ? 'Black' : 'White'}’s move ${Math.floor(x.i / 2) + 1}`);
    const temps = t ? `<p class="small" data-recap-temps>${L('⏱ Temps moyen : ', '⏱ Average time: ')}<strong>${sec(t.moy)}</strong>${L(' par coup', ' per move')}${this.tempsCoup ? L(` (limite ${this.tempsCoup} s)`, ` (limit ${this.tempsCoup} s)`) : ''}${L('. Plus lents : ', '. Slowest: ')}${t.lents.map((x) => `${esc(lbl(x))} (${x.lent ? L('temps écoulé', 'time up') : sec(x.ms)})`).join(L(' ; ', '; '))}.</p>` : '';
    this.feedback(`<div class="drill-recap" data-recap>
      ${temps}
      <p class="recap-nums"><span class="ok">${L(`✔ ${this.okFirst} réussie${pl(this.okFirst)}`, `✔ ${this.okFirst} solved`)}</span> · <span class="ko">${L(`✘ ${n} ratée${pl(n)}`, `✘ ${n} missed`)}</span>${this.streak.best ? L(` · 🔥 meilleure série ${this.streak.best}`, ` · 🔥 best streak ${this.streak.best}`) : ''}</p>
      <p class="small muted">${L('Réussie = trouvée du premier coup. ', 'Solved = found on the first try. ')}${n ? L('Positions à revoir :', 'Positions to review:') : ''}</p>
      ${n ? `<ul class="small">${this.missed.map((m) => `<li>${esc(this.missedLabel(m))}</li>`).join('')}</ul>` : ''}
      <div class="actions">${n ? `<button type="button" class="primary" data-review>${L('🎯 Refaire mes erreurs de la séance', '🎯 Redo my mistakes from this session')}</button>` : ''}<button type="button" data-end>${L('Terminer', 'Finish')}</button></div>
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
      ? L('🎯 Positions de vos vraies parties : retrouvez le coup de votre répertoire. Une position ratée repasse en fin de liste.', '🎯 Positions from your real games: find your repertoire move. A missed position goes back to the end of the list.')
      : L('🎯 Révision ciblée : seulement les positions ratées, jusqu’à ce qu’elles soient toutes validées.', '🎯 Targeted review: only the missed positions, until they are all solved.'), 'muted');
    this.nextReview();
  }

  nextReview() {
    this.feedback('');
    this.board.hideBubble();
    this.board.setHint(null);
    if (!this.queue.length) {
      this.cur = null;
      this.status(L('Toutes vos erreurs sont corrigées ✔', 'All your mistakes are fixed ✔'), 'player');
      this.$('[data-head]').innerHTML = `<p><strong>${this.kind === 'reelles' ? L('Vraies erreurs corrigées', 'Real mistakes fixed') : L('Révision ciblée terminée', 'Targeted review finished')}</strong></p>`;
      this.feedback(`<div class="drill-fb ok" data-review-done><p>${L(`✔ Toutes les positions ${this.kind === 'reelles' ? 'de vos parties' : 'ratées'} sont validées.`, `✔ All the ${this.kind === 'reelles' ? 'positions from your games' : 'missed positions'} are solved.`)}${this.streak.best ? L(` Meilleure série : 🔥 ${this.streak.best}.`, ` Best streak: 🔥 ${this.streak.best}.`) : ''}</p>
        <div class="actions"><button type="button" class="primary" data-end>${L('Terminer', 'Finish')}</button></div></div>`);
      this.$('[data-end]').addEventListener('click', () => this.done());
      return;
    }
    const m = this.queue[0];
    this.board.setOrientation(m.color);
    if (m.kind === 'pos') { this.showPos(m); return; }
    this.$('[data-head]').innerHTML = `<p>${L(`<strong>Révision ciblée</strong> — encore ${this.queue.length} position(s) · fiche « ${esc(m.e.nom)} »`, `<strong>Targeted review</strong> — ${this.queue.length} position(s) left · line “${esc(m.e.nom)}”`)}</p>`;
    if (m.kind === 'trash') {
      this.cur = { e: m.e, d: trashDrill(m.e, m.color), color: m.color, errors: 0, i: 0, review: m };
      this.startTrash();
      return;
    }
    const steps = lineSteps(m.e, m.color, { complet: this.complet });
    this.cur = { e: m.e, color: m.color, steps, i: m.i, errors: 0, review: m };
    this.chess = new Chess();
    for (const st of steps.slice(0, m.i)) this.chess.move(toObj(st.uci));
    this.status(L('À vous : retrouvez le coup de la ligne', 'Your turn: find the line’s move'), 'player');
    this.draw({ interactive: true });
  }

  // Position d'une vraie partie : tous les coups des fiches à cette position sont acceptés.
  showPos(m) {
    this.chess = new Chess();
    for (const u of m.moves) this.chess.move(toObj(u));
    this.cur = { pos: true, review: m, color: m.color };
    const quand = m.date ? new Date(m.date).toLocaleDateString(L('fr-FR', 'en-GB')) : '';
    this.$('[data-head]').innerHTML = `<p><strong>${L(`Encore ${this.queue.length} position(s)`, `${this.queue.length} position(s) left`)}</strong>${L(' — partie', ' — game')}${quand ? L(` du ${esc(quand)}`, ` of ${esc(quand)}`) : ''}${m.opp ? L(` contre ${esc(m.opp)}`, ` vs ${esc(m.opp)}`) : ''}${m.url ? ` <a class="tiny" href="${esc(m.url)}" target="_blank" rel="noopener">↗</a>` : ''}${m.ficheNom ? L(` · fiche « ${esc(m.ficheNom)} »`, ` · line “${esc(m.ficheNom)}”`) : ''}</p>`;
    const vous = m.played ? L(`vous aviez joué <strong>${esc(sanFr(m.played))}</strong>`, `you played <strong>${esc(sanFr(m.played))}</strong>`) : L('la partie s’est arrêtée là', 'the game stopped there');
    this.status(m.kind === 'punition'
      ? L(`L’adversaire vient de faire l’erreur prévue par la fiche (${vous}) : punissez-la !`, `Your opponent has just made the mistake covered by the line (${vous}): punish it!`)
      : L(`Ici, ${vous} et vous êtes sorti du répertoire : quel est le coup de vos fiches ?`, `Here, ${vous} and left your repertoire: what is the move from your lines?`), 'player');
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
      this.log(L(`✔ ${esc(sanFr(mv.san))} — position corrigée`, `✔ ${esc(sanFr(mv.san))} — position fixed`), 'ok');
      this.draw();
      this.board.showBubble(L('✔ Validé ! Cette position sort de la liste.', '✔ Solved! This position leaves the list.'), 'ok');
      c.wait = true;
      this.later(() => this.nextReview(), 900);
      return;
    }
    if (inTree) this.gradePos(rep, k, false);
    this.bumpStreak(false);
    const why = raisonErreur({ fen: this.chess.fen(), uci: mv.lan, expectedSan: bestSan });
    this.board.flashError(mv.to, why || L(`Ici, on joue ${sanFr(bestSan)}.`, `Here, the move is ${sanFr(bestSan)}.`));
    this.queue.push(this.queue.shift());
    this.log(L(`✘ ${esc(sanFr(mv.san))} — attendu ${esc(sanFr(bestSan))}`, `✘ ${esc(sanFr(mv.san))} — expected ${esc(sanFr(bestSan))}`), 'ko');
    c.wait = true;
    this.draw({ arrows: [{ from: m.expected[0].slice(0, 2), to: m.expected[0].slice(2, 4), kind: 'best' }] });
    this.feedback(`<div class="drill-fb ko"><p>${L(`✘ Le coup de votre répertoire est <strong>${esc(sanFr(bestSan))}</strong> (flèche verte).`, `✘ Your repertoire move is <strong>${esc(sanFr(bestSan))}</strong> (green arrow).`)}</p>
      ${m.texte ? `<p class="small">${esc(m.texte)}</p>` : ''}
      <p class="small muted">${L('La position repasse en fin de liste.', 'The position goes back to the end of the list.')}</p>
      <div class="actions"><button type="button" class="primary" data-continue>${L('Continuer', 'Continue')}</button></div></div>`);
    this.$('[data-continue]').addEventListener('click', () => this.nextReview());
  }

  onReviewMove(c, mv, step) {
    const k = key(c.steps.slice(0, c.i).map((s) => s.uci));
    if (mv.lan === step.uci) {
      this.queue.shift();
      this.gradePos(c.e.rep, k, true);
      this.bumpStreak(true);
      this.chess.move(toObj(step.uci));
      this.log(L(`✔ ${esc(sanFr(mv.san))} — validé (« ${esc(c.e.nom)} »)`, `✔ ${esc(sanFr(mv.san))} — solved (“${esc(c.e.nom)}”)`), 'ok');
      this.draw();
      this.board.showBubble(L('✔ Validé !', '✔ Solved!'), 'ok');
      c.wait = true;
      this.later(() => this.nextReview(), 800);
      return;
    }
    this.gradePos(c.e.rep, k, false);
    this.bumpStreak(false);
    this.refuse(c, mv, step);
    this.queue.push(this.queue.shift());
    this.log(L(`✘ ${esc(sanFr(mv.san))} — attendu ${esc(sanFr(step.san))} ; la position reviendra.`, `✘ ${esc(sanFr(mv.san))} — expected ${esc(sanFr(step.san))}; the position will come back.`), 'ko');
    c.wait = true;
    this.draw({ arrows: [{ from: step.uci.slice(0, 2), to: step.uci.slice(2, 4), kind: 'best' }] });
    this.feedback(`<div class="drill-fb ko"><p>${L(`✘ Le coup de la ligne est <strong>${esc(sanFr(step.san))}</strong> (flèche verte). La position repasse en fin de file.`, `✘ The line’s move is <strong>${esc(sanFr(step.san))}</strong> (green arrow). The position goes back to the end of the queue.`)}</p>
      <div class="actions"><button type="button" class="primary" data-continue>${L('Continuer', 'Continue')}</button></div></div>`);
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
    this.status(L('<span class="spinner"></span> L’adversaire réfléchit…', '<span class="spinner"></span> Your opponent is thinking…'), 'opponent');
    this.draw();
    this.later(() => {
      const mv = this.chess.move(toObj(d.bad.uci));
      const no = `${Math.floor(d.bad.ply / 2) + 1}${d.bad.ply % 2 ? '…' : '.'}`;
      this.log(L(`⚠ L’adversaire joue <strong>${esc(no)} ${esc(sanFr(mv.san))} ?!</strong> — punissez-le : ${d.ours} coup(s) en ${this.timeLimit} s.`, `⚠ Your opponent plays <strong>${esc(no)} ${esc(sanFr(mv.san))} ?!</strong> — punish it: ${d.ours} move(s) in ${this.timeLimit} s.`), 'warn');
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
    if (left <= 0) this.endTrash(false, L('temps écoulé', 'time up'));
  }

  advanceTrash() {
    const c = this.cur;
    if (c.over) return;
    if (c.i >= c.steps.length) { this.endTrash(true); return; }
    const step = c.steps[c.i];
    if (!step.ours) {
      this.status(L('⏱ L’adversaire répond…', '⏱ Your opponent replies…'), 'opponent');
      this.draw();
      this.later(() => { if (c.over) return; this.chess.move(toObj(step.uci)); c.i++; this.advanceTrash(); }, 250);
      return;
    }
    this.status(L(`⏱ À vous : punissez ! (${c.steps.slice(c.i).filter((s) => s.ours).length} coup(s))`, `⏱ Your turn: punish! (${c.steps.slice(c.i).filter((s) => s.ours).length} move(s))`), 'player');
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
    if (!this.engine || this.engine.state !== 'ready') { this.endTrash(false, L(`${sanFr(mv.san)} au lieu de ${sanFr(step.san)}`, `${sanFr(mv.san)} instead of ${sanFr(step.san)}`)); return; }
    c.wait = true;
    const paused = performance.now();
    this.status(L('<span class="spinner"></span> Autre coup : Stockfish vérifie…', '<span class="spinner"></span> Different move: Stockfish is checking…'), 'opponent');
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
      this.log(L(`✔ ${esc(sanFr(mv.san))} — autre coup gagnant (Stockfish : ${cp >= 9000 ? 'mat' : `+${(cp / 100).toFixed(1).replace('.', ',')}`})`, `✔ ${esc(sanFr(mv.san))} — another winning move (Stockfish: ${cp >= 9000 ? 'mate' : `+${(cp / 100).toFixed(1)}`})`), 'ok');
      c.alt = L(`${sanFr(mv.san)} (la fiche jouait ${sanFr(step.san)})`, `${sanFr(mv.san)} (the line played ${sanFr(step.san)})`);
      this.endTrash(true);
      return;
    }
    this.endTrash(false, L(`${sanFr(mv.san)} au lieu de ${sanFr(step.san)}${cp != null ? ` (Stockfish : ${(cp / 100).toFixed(1).replace('.', ',')} pour vous, la punition de la fiche fait mieux)` : ''}`, `${sanFr(mv.san)} instead of ${sanFr(step.san)}${cp != null ? ` (Stockfish: ${(cp / 100).toFixed(1)} for you, the line’s punishment does better)` : ''}`));
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
    if (ok) sons.reussite();
    if (this.rush) { this.endRush(c, ok, why); return; }
    const fenAt = (() => { const x = new Chess(); for (const u of c.d.setup) x.move(toObj(u)); x.move(toObj(c.d.bad.uci)); return x.fen(); })();
    const seq = lineText(fenAt, c.steps.map((s) => s.san));
    const best = this.progress.drills[c.e.id]?.best;
    let body;
    if (ok) {
      this.status(L(`✔ Puni en ${sec(ms)} !`, `✔ Punished in ${sec(ms)}!`), 'player');
      this.draw();
      body = L(`<p><strong>+1 point</strong> — ${c.alt ? `autre coup gagnant ${esc(c.alt)}, ` : 'séquence trouvée '}en ${sec(ms)}${best === ms ? ' (record personnel 🏆)' : best ? ` (record : ${sec(best)})` : ''}.</p>${c.alt ? `<p class="small">La punition de la fiche : <span class="line">${esc(seq)}</span></p>` : ''}`,
        `<p><strong>+1 point</strong> — ${c.alt ? `another winning move ${esc(c.alt)}, ` : 'sequence found '}in ${sec(ms)}${best === ms ? ' (personal best 🏆)' : best ? ` (best: ${sec(best)})` : ''}.</p>${c.alt ? `<p class="small">The line’s punishment: <span class="line">${esc(seq)}</span></p>` : ''}`);
    } else {
      this.status(L(`✘ Raté : ${esc(why)}`, `✘ Missed: ${esc(why)}`), 'opponent');
      const step = c.steps[c.i];
      this.draw({ arrows: step ? [{ from: step.uci.slice(0, 2), to: step.uci.slice(2, 4), kind: 'best' }] : [] });
      body = `<p>✘ ${esc(why)}.</p><p><strong>${L('La punition :', 'The punishment:')}</strong> <span class="line">${esc(seq)}</span></p>`;
      if (step) this.board.flashError(step.uci.slice(2, 4), L(`✘ ${why}. La punition commence par ${sanFr(step.san)}.`, `✘ ${why}. The punishment starts with ${sanFr(step.san)}.`));
    }
    this.feedback(`<div class="drill-fb ${ok ? 'ok' : 'ko'}">${body}<p class="small">${esc(c.d.texte || '')}</p>
      <div class="actions"><button type="button" class="primary" data-continue>${c.review ? L('Continuer', 'Continue') : L('Exercice suivant', 'Next exercise')}</button></div></div>`);
    this.$('[data-continue]').addEventListener('click', () => {
      if (!c.review) { this.next(); return; }
      if (ok) this.queue.shift(); else this.queue.push(this.queue.shift());
      this.nextReview();
    });
  }

  // Rush : réussite → +1 et position suivante aussitôt ; erreur → une vie de moins et la punition
  // montrée (on apprend), puis on continue ; plus de vie → fin de partie.
  endRush(c, ok, why) {
    const r = this.rush;
    if (ok) r.score++; else r.vies--;
    this.majRush(c.e);
    if (ok) {
      this.status(L(`✔ +1 — score ${r.score}`, `✔ +1 — score ${r.score}`), 'player');
      this.draw();
      this.later(() => this.next(), 700);
      return;
    }
    const fenAt = (() => { const x = new Chess(); for (const u of c.d.setup) x.move(toObj(u)); x.move(toObj(c.d.bad.uci)); return x.fen(); })();
    const seq = lineText(fenAt, c.steps.map((s) => s.san));
    const step = c.steps[c.i];
    this.status(L(`✘ ${esc(why)} — ${r.vies} vie(s)`, `✘ ${esc(why)} — ${r.vies} life/lives left`), 'opponent');
    this.draw({ arrows: step ? [{ from: step.uci.slice(0, 2), to: step.uci.slice(2, 4), kind: 'best' }] : [] });
    const fin = r.vies <= 0;
    this.feedback(`<div class="drill-fb ko"><p>✘ ${esc(why)}.</p><p><strong>${L('La punition :', 'The punishment:')}</strong> <span class="line">${esc(seq)}</span></p>
      <div class="actions"><button type="button" class="primary" data-continue>${fin ? L('Voir mon score', 'See my score') : L('Continuer', 'Continue')}</button></div></div>`);
    this.$('[data-continue]').addEventListener('click', () => (fin ? this.done() : this.next()));
  }

  // ---------- Fin ----------

  // Fin de la série d'exercices (ou « Terminer ») : bilan avec révision ciblée s'il y a des erreurs.
  finish() {
    if (!this.alive) return;
    if (this.rush) { this.done(); return; }
    if (!this.recapDone && !this.reviewing && (this.missed.length || (this.tempsCoup && this.times.length))) { this.showRecap(); return; }
    this.done();
  }

  done() {
    if (!this.alive) return;
    this.alive = false;
    this.board.hideBubble();
    clearInterval(this.cur?.timer);
    this.stopMoveClock();
    const ok = this.results.filter((r) => r.ok).length;
    const times = this.results.filter((r) => r.ok && r.ms).map((r) => r.ms);
    this.onDone?.({ kind: this.kind, ok, total: this.results.length, best: times.length ? Math.min(...times) : null, rush: this.rush ? { score: this.rush.score } : null });
  }
}
