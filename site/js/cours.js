// Module « Apprendre » de la page Entraînement : une leçon par fiche, en 4 étapes.
// 1. Présentation (nom, idée, structure) ; 2. les coups un par un, avec le nom officiel de
// l'ouverture atteint à chaque étape et des commentaires factuels ; 3. à retenir (cases,
// échanges, piège, punition — séquences jouables coup par coup sur l'échiquier —, vidéos) ;
// 4. à vous : pratique guidée (indices, puis le coup).
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { sanFr } from './analysis.js';
import { lessonSteps, nomFr } from './lesson-core.js';
import { raisonErreur } from './drills-core.js';
import { langue } from './i18n.js';

// Phrases en français ou en anglais selon la langue de l'interface.
const L = (fr, en) => (langue() === 'en' ? en : fr);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const STAGES = () => [L('Présentation', 'Overview'), L('Les coups', 'The moves'), L('À retenir', 'Key points'), L('À vous', 'Your turn')];
const BADGE = () => ({ theorie: L('Théorie', 'Theory'), piege: L('Piège Blitz', 'Blitz trap'), loufoque: L('Coup loufoque', 'Offbeat move') });

export class LessonView {
  // mesParties : mes vraies parties dans cette variante (coups gardés), pour la comparaison.
  constructor({ el, data, entry, onPractice, onClose, complet = false, mesParties = [], cmpGameId = null }) {
    this.mesParties = mesParties;
    this.cmp = null; // { idx, vue: 'theorie' | 'partie' } : comparaison avec une de mes parties
    this.cmpGameId = cmpGameId; // ouverture directe sur la comparaison avec cette partie
    this.el = el;
    this.data = data;
    this.e = entry;
    this.color = data.repertoires[entry.rep].couleur;
    this.steps = lessonSteps(entry, this.color, { complet });
    this.nFiche = entry.san.length; // demi-coups de la fiche ; au-delà : suite Stockfish
    this.onPractice = onPractice;
    this.onClose = onClose;
    this.stage = 0;
    this.ply = -1; // -1 = position de départ
    this.timer = null;
    this.alive = true;
    this.layout();
    // Ouverture directe depuis « Mes parties dans cette variante » : étape « Les coups », sur l'écart.
    const i = cmpGameId ? this.mesParties.findIndex((r) => r.gameId === cmpGameId) : -1;
    if (i >= 0) {
      this.cmp = { idx: i, vue: 'partie' };
      this.stage = 1;
      const p = this.partie();
      this.ply = Math.min(p?.ecart ?? 0, this.steps.length - 1);
    }
    this.render();
  }

  layout() {
    this.el.innerHTML = `<div class="lesson" data-lesson="${esc(this.e.id)}">
      <div class="lesson-top">
        <button type="button" class="small-btn" data-close>${L('← Retour au cours', '← Back to the course')}</button>
        <ol class="lesson-stages">${STAGES().map((s, i) => `<li><button type="button" class="chip" data-stage="${i}">${i + 1}. ${s}</button></li>`).join('')}</ol>
      </div>
      <div class="train-layout">
        <section><div class="lesson-name" data-name></div><div class="board-wrap" data-board></div><div class="lesson-nav" data-nav></div><div class="lesson-under" data-under></div></section>
        <section class="card lesson-panel" data-panel></section>
      </div>
    </div>`;
    this.board = new Board(this.el.querySelector('[data-board]'), { piecesUrl: './pieces/', onMove: (mv) => this.onBoardMove(mv) });
    this.board.setOrientation(this.color);
    this.el.querySelector('[data-close]').addEventListener('click', () => this.close());
    this.el.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => this.go(Number(b.dataset.stage))));
  }

  close() {
    this.alive = false;
    clearInterval(this.timer);
    this.onClose?.();
  }

  go(stage) {
    clearInterval(this.timer);
    this.timer = null;
    this.stage = stage;
    this.drill = null;
    this.board.hideBubble();
    if (stage === 1 && this.ply < 0) this.ply = -1;
    if (stage === 2 || stage === 0) this.ply = this.steps.length - 1;
    if (stage === 3) { this.alive = false; this.onPractice?.(this.e.id); return; }
    this.render();
  }

  // Nom officiel atteint à la position affichée (dernier nom connu jusqu'à ce coup).
  nameAt(ply) {
    let n = null;
    for (const s of this.steps) { if (s.ply > ply) break; if (s.nom) n = s.nom; }
    return n;
  }

  // Comparaison : coups de ma partie (fenêtre de la leçon) et premier écart avec la théorie.
  partie() {
    const r = this.cmp && this.mesParties[this.cmp.idx];
    if (!r) return null;
    const san = r.san.slice(0, this.steps.length);
    let ecart = san.findIndex((m, i) => m !== this.steps[i]?.san);
    if (ecart < 0) ecart = san.length < this.steps.length ? san.length : null;
    return { r, san, ecart };
  }

  drawPartie(ply) {
    const p = this.partie();
    const c = new Chess();
    let last = null;
    for (const m of p.san.slice(0, ply + 1)) { try { last = c.move(m); } catch { break; } }
    this.board.setPosition(c, { lastMove: last });
    const ours = (ply % 2 === 0 ? 'w' : 'b') === this.color;
    this.board.setArrows(last ? [{ from: last.from, to: last.to, kind: ply === p.ecart ? 'threat' : ours ? 'best' : 'reply' }] : []);
    this.el.querySelector('[data-name]').innerHTML = `<strong>${L('🎮 Ma partie', '🎮 My game')}</strong>${p.r.opp ? L(` contre ${esc(p.r.opp)}`, ` vs ${esc(p.r.opp)}`) : ''} <span class="muted tiny">· ${ply < 0 ? L('position de départ', 'starting position') : L(`après ${esc(coupNo(ply, p.san[ply]))}`, `after ${esc(coupNo(ply, p.san[ply]))}`)}</span>`;
  }

  drawAt(ply, { arrow = true } = {}) {
    if (this.stage === 1 && this.cmp?.vue === 'partie' && this.partie()) { this.drawPartie(ply); return; }
    const c = new Chess();
    for (const s of this.steps.slice(0, ply + 1)) c.move(s.san);
    const last = c.history({ verbose: true }).at(-1) || null;
    this.board.setPosition(c, { lastMove: last });
    const s = this.steps[ply];
    this.board.setArrows(arrow && s ? [{ from: s.uci.slice(0, 2), to: s.uci.slice(2, 4), kind: s.ours ? 'best' : 'reply' }] : []);
    const n = this.nameAt(ply);
    this.el.querySelector('[data-name]').innerHTML = n
      ? `<span class="lesson-eco">${esc(n.eco)}</span> <strong>${esc(n.fr)}</strong><span class="muted tiny">${L(' · nom officiel : ', ' · official name: ')}${esc(n.name)}</span>`
      : `<span class="muted">${L('Position de départ', 'Starting position')}</span>`;
  }

  render() {
    this.el.querySelectorAll('[data-stage]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.stage) === this.stage)));
    const panel = this.el.querySelector('[data-panel]');
    const nav = this.el.querySelector('[data-nav]');
    const under = this.el.querySelector('[data-under]');
    nav.innerHTML = '';
    under.innerHTML = '';
    const e = this.e;
    const me = this.color === 'w' ? 'Blancs' : 'Noirs';
    if (this.stage === 0) {
      this.drawAt(this.steps.length - 1, { arrow: false });
      const finalName = nomFr(e.ecoNom);
      panel.innerHTML = `<p class="muted small">${esc(e.famille)} · <span class="badge eco">${esc(e.eco)}</span> <span class="badge">${esc(BADGE()[e.badge] || e.badge)}</span> · ${L(`vous avez les ${me}`, `you have ${this.color === 'w' ? 'White' : 'Black'}`)}</p>
        <h2>${esc(e.nom)}</h2>
        <p class="lesson-official">${L('Nom officiel : ', 'Official name: ')}<strong>${esc(finalName)}</strong><br><span class="muted tiny">${esc(e.ecoNom)} (${esc(e.eco)})</span></p>
        <h3>${L('L’idée', 'The idea')}</h3><p>${esc(e.plan)}</p>
        <h3>${L('La structure', 'The structure')}</h3><p>${esc(e.structure)}</p>
        <p class="muted small">${L(`La position finale de la ligne est affichée. Étape suivante : les ${this.steps.length} demi-coups, un par un, avec le nom de l’ouverture qui se précise à chaque coup${this.steps.length > this.nFiche ? ` (les ${this.nFiche} de la fiche, puis la suite conseillée par Stockfish jusqu’au ${Math.ceil(this.steps.length / 2)}e coup)` : ''}.`, `The final position of the line is shown. Next step: the ${this.steps.length} half-moves, one by one, with the opening name getting more precise at each move${this.steps.length > this.nFiche ? ` (the ${this.nFiche} of the line, then the continuation recommended by Stockfish up to move ${Math.ceil(this.steps.length / 2)})` : ''}.`)}</p>
        <div class="actions"><button type="button" class="primary" data-next>${L('Voir les coups →', 'See the moves →')}</button></div>`;
      panel.querySelector('[data-next]').addEventListener('click', () => { this.ply = -1; this.go(1); });
      return;
    }
    if (this.stage === 1) {
      this.drawAt(this.ply);
      const s = this.steps[this.ply];
      const total = this.steps.length;
      // Explication juste sous l'échiquier (visible sans défiler sur téléphone) ; à côté : tous les coups.
      if (!s) {
        under.innerHTML = `<div class="card lesson-step"><h2>${L('Position de départ', 'Starting position')}</h2><p>${me === 'Blancs' ? L('Vous avez les Blancs : vous jouez le premier coup.', 'You have White: you play the first move.') : L('Vous avez les Noirs : l’adversaire commence.', 'You have Black: your opponent starts.')}</p><p class="muted small">${L('Touchez « Suivant » pour avancer coup par coup. Flèche verte : votre coup ; orange : celui de l’adversaire.', 'Tap “Next” to go move by move. Green arrow: your move; orange: your opponent’s.')}</p></div>`;
      } else {
        under.innerHTML = `<div class="card lesson-step"><p class="muted small">${L('Coup', 'Move')} ${this.ply + 1} / ${total} · ${s.ours ? L('<strong>votre coup</strong>', '<strong>your move</strong>') : L('coup de l’adversaire', 'opponent’s move')}</p>
          <h2 class="lesson-move ${s.ours ? 'ours' : 'theirs'}">${esc(s.label)}</h2>
          ${s.nom ? `<p class="lesson-newname">${L('📛 Vous entrez dans : ', '📛 You are entering: ')}<strong>${esc(s.nom.fr)}</strong> <span class="muted tiny">(${esc(s.nom.eco)})</span></p>` : ''}
          ${this.cmpLigneHtml()}
          <ul class="lesson-notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
          ${this.ply === total - 1 ? `<div class="actions"><button type="button" class="primary" data-next>${L('À retenir →', 'Key points →')}</button></div>` : ''}</div>`;
        under.querySelector('[data-next]')?.addEventListener('click', () => this.go(2));
      }
      panel.innerHTML = `<h2>${L('Les coups de la ligne', 'The moves of the line')}</h2><p class="small muted">${L('Touchez un coup pour y aller. En vert : vos coups.', 'Tap a move to go there. In green: your moves.')}</p>
        <p class="moves-annot">${this.steps.map((x) => `${x.ply === this.nFiche ? L('<span class="suite-sep small muted" title="Au-delà de la fiche : meilleurs coups de Stockfish">🤖 suite Stockfish :</span> ', '<span class="suite-sep small muted" title="Beyond the line: Stockfish’s best moves">🤖 Stockfish continuation:</span> ') : ''}<button type="button" class="m ${x.ours ? 'mine' : ''} ${x.moteur ? 'moteur' : ''} ${x.ply === this.ply ? 'current' : ''}" data-ply="${x.ply}">${esc(x.label)}</button>`).join(' ')}</p>`;
      panel.insertAdjacentHTML('beforeend', this.cmpPanelHtml());
      panel.querySelectorAll('[data-ply]').forEach((b) => b.addEventListener('click', () => { this.stop(); this.ply = Number(b.dataset.ply); this.render(); }));
      panel.querySelector('[data-cmp-select]')?.addEventListener('change', (ev) => {
        const v = ev.target.value;
        this.cmp = v === '' ? null : { idx: Number(v), vue: this.cmp?.vue || 'partie' };
        const p = this.partie();
        if (p?.ecart != null) this.ply = Math.min(p.ecart, this.steps.length - 1);
        this.render();
      });
      panel.querySelectorAll('[data-cmp-vue]').forEach((b) => b.addEventListener('click', () => { this.cmp.vue = b.dataset.cmpVue; this.render(); }));
      nav.innerHTML = `<button type="button" data-prev aria-label="${L('Coup précédent', 'Previous move')}" ${this.ply < 0 ? 'disabled' : ''}>◀</button>
        <button type="button" class="primary" data-play>${this.timer ? '⏸ Pause' : L('▶ Lecture', '▶ Play')}</button>
        <button type="button" data-step aria-label="${L('Coup suivant', 'Next move')}" ${this.ply >= total - 1 ? 'disabled' : ''}>${L('Suivant ▶', 'Next ▶')}</button>`;
      nav.querySelector('[data-prev]').addEventListener('click', () => { this.stop(); this.ply = Math.max(-1, this.ply - 1); this.render(); });
      nav.querySelector('[data-step]').addEventListener('click', () => { this.stop(); this.ply = Math.min(total - 1, this.ply + 1); this.render(); });
      nav.querySelector('[data-play]').addEventListener('click', () => this.togglePlay());
      return;
    }
    // Étape 2 : à retenir.
    if (this.drill) this.renderDrill();
    else this.drawAt(this.steps.length - 1, { arrow: false });
    const claim = (c, kind) => (c ? `<div class="lesson-claim ${kind}"><h3>${kind === 'piege' ? L('⚠ Le piège à éviter', '⚠ The trap to avoid') : L('🎯 La punition à connaître', '🎯 The punishment to know')}</h3><p>${esc(c.texte)}</p>
      <p class="line small">${esc(lineFr(c.san))}</p>
      <div class="actions"><button type="button" class="primary small-btn" data-drill="${kind}">${L('♟ La jouer coup par coup', '♟ Play it move by move')}</button>
      <button type="button" class="small-btn" data-show="${kind}">${L('Voir défiler', 'Watch it play')}</button></div></div>` : '');
    const liens = (e.video?.liens || []).slice().sort((a, b) => (a.langue === 'fr' ? -1 : 0) - (b.langue === 'fr' ? -1 : 0));
    panel.innerHTML = `<h2>${L('À retenir', 'Key points')}</h2>
      <dl class="lesson-keys">
        <dt>${L('Cases et pièces clés', 'Key squares and pieces')}</dt><dd>${esc(e.cases)}</dd>
        <dt>${L('À échanger', 'To exchange')}</dt><dd>${esc(e.echanger)}</dd>
        <dt>${L('À conserver', 'To keep')}</dt><dd>${esc(e.conserver)}</dd>
      </dl>
      ${claim(e.piege, 'piege')}${claim(e.punition, 'punition')}
      ${liens.length ? `<h3>${L('🎬 Pour aller plus loin', '🎬 Going further')}</h3><ul>${liens.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.titre)}</a> <span class="muted small">(${l.chaine ? `${esc(l.chaine)}, ` : ''}${esc(String(l.langue).toUpperCase())})</span>
        ${l.chapitre ? `<br><span class="badge tiny video-chap">${L(`▶ s’ouvre à ${esc(l.chapitre)}`, `▶ opens at ${esc(l.chapitre)}`)}</span>` : L('<br><span class="muted tiny">Début de la vidéo (l’auteur n’a pas publié de chapitres)</span>', '<br><span class="muted tiny">Start of the video (the author has not published chapters)</span>')}</li>`).join('')}</ul>` : ''}
      <div class="actions"><button type="button" class="primary" data-next>${L('À vous de jouer la ligne →', 'Your turn to play the line →')}</button></div>`;
    panel.querySelector('[data-next]').addEventListener('click', () => this.go(3));
    panel.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => { this.drill = null; this.el.querySelector('[data-under]').innerHTML = ''; this.showClaim(e[b.dataset.show]); }));
    panel.querySelectorAll('[data-drill]').forEach((b) => b.addEventListener('click', () => this.startDrill(b.dataset.drill)));
  }

  // ---------- Séquence jouable (piège ou punition) ----------
  // Vous jouez vous-même chaque coup de la ligne (les deux camps), le coup fautif compris :
  // seul le coup suivant de la séquence est accepté ; « Indice » montre la pièce à jouer.

  startDrill(kind) {
    const c = this.e[kind];
    if (!c) return;
    this.stop();
    this.drill = { kind, c, i: 0, msg: null, hint: false };
    this.renderDrill();
    this.el.querySelector('[data-board]').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  // Étiquette d'un demi-coup de la séquence (« 4. Fg5 », « 4… Cf6? »).
  drillLabel(i) {
    const { c } = this.drill;
    const num = i % 2 === 0 ? `${i / 2 + 1}. ` : `${Math.floor(i / 2) + 1}… `;
    return `${num}${sanFr(c.san[i])}${i === c.marked ? '?' : ''}`;
  }

  renderDrill() {
    const d = this.drill;
    const { c } = d;
    const total = c.uci.length;
    const chess = new Chess();
    let last = null;
    for (const u of c.uci.slice(0, d.i)) last = chess.move(toObj(u));
    const done = d.i >= total;
    this.board.setPosition(chess, { lastMove: last, interactive: !done });
    const arrows = [];
    if (last) arrows.push({ from: last.from, to: last.to, kind: d.i - 1 === c.marked ? 'threat' : (d.i - 1 > c.marked ? 'best' : 'reply') });
    if (d.hint && !done) arrows.push({ from: c.uci[d.i].slice(0, 2), to: c.uci[d.i].slice(2, 4), kind: 'stat' });
    this.board.setArrows(arrows);
    this.board.setHint?.(d.hint && !done ? c.uci[d.i].slice(0, 2) : null);
    const piege = d.kind === 'piege';
    const side = chess.turn() === 'w' ? 'aux Blancs' : 'aux Noirs';
    const moves = c.san.map((_, i) => `<span class="m ${i === c.marked ? 'fault' : ''} ${i < d.i ? 'played' : ''} ${i === d.i ? 'current' : ''}">${esc(this.drillLabel(i))}</span>`).join(' ');
    let body;
    if (done) {
      body = `<p class="drill-done">${L('✔ Séquence jouée jusqu’au bout.', '✔ Sequence played to the end.')}</p><p>${esc(c.texte)}</p>
        <p class="muted small">${piege ? L('Retenez le coup marqué « ? » : c’est le réflexe à ne pas avoir.', 'Remember the move marked “?”: it’s the reflex to avoid.') : L('Retenez la suite après le coup fautif « ? » : c’est elle qui le punit.', 'Remember the continuation after the faulty move “?”: it’s what punishes it.')}</p>`;
    } else {
      const next = d.i === c.marked
        ? (piege ? L(`C’est le coup fautif : jouez <strong>${esc(this.drillLabel(d.i))}</strong> pour voir pourquoi il perd.`, `This is the faulty move: play <strong>${esc(this.drillLabel(d.i))}</strong> to see why it loses.`) : L(`L’adversaire commet l’erreur : jouez <strong>${esc(this.drillLabel(d.i))}</strong> pour lui.`, `Your opponent makes the mistake: play <strong>${esc(this.drillLabel(d.i))}</strong> for them.`))
        : d.i > c.marked
          ? L(`${piege ? 'La sanction' : 'La punition'} : jouez <strong>${esc(this.drillLabel(d.i))}</strong>.`, `${piege ? 'The sanction' : 'The punishment'}: play <strong>${esc(this.drillLabel(d.i))}</strong>.`)
          : L(`Mise en place : jouez <strong>${esc(this.drillLabel(d.i))}</strong>.`, `Setup: play <strong>${esc(this.drillLabel(d.i))}</strong>.`);
      body = `<p>${L(`Trait ${side}.`, `${chess.turn() === 'w' ? 'White' : 'Black'} to move.`)} ${next}</p>${d.msg ? `<p class="drill-msg" role="status">${esc(d.msg)}</p>` : ''}`;
    }
    const under = this.el.querySelector('[data-under]');
    under.innerHTML = `<div class="card lesson-step lesson-drill" data-drill-card="${d.kind}">
      <p class="muted small">${piege ? L('⚠ Le piège, à jouer vous-même', '⚠ The trap, to play yourself') : L('🎯 La punition, à jouer vous-même', '🎯 The punishment, to play yourself')} · ${L('coup', 'move')} ${Math.min(d.i + 1, total)} / ${total}</p>
      ${body}
      <p class="moves-annot small">${moves}</p>
      <div class="actions">
        ${done ? '' : `<button type="button" class="small-btn" data-drill-hint>${L('💡 Indice', '💡 Hint')}</button>`}
        ${!done && d.i < c.marked ? `<button type="button" class="small-btn" data-drill-skip>${L('⏩ Aller à l’erreur', '⏩ Go to the mistake')}</button>` : ''}
        <button type="button" class="small-btn" data-drill-back ${d.i ? '' : 'disabled'}>${L('◀ Annuler un coup', '◀ Undo a move')}</button>
        <button type="button" class="small-btn" data-drill-restart>${L('↺ Recommencer', '↺ Restart')}</button>
        <button type="button" class="small-btn" data-drill-quit>${L('Fermer', 'Close')}</button>
      </div></div>`;
    under.querySelector('[data-drill-hint]')?.addEventListener('click', () => { d.hint = true; this.renderDrill(); });
    under.querySelector('[data-drill-skip]')?.addEventListener('click', () => { d.i = c.marked; d.msg = null; d.hint = false; this.renderDrill(); });
    under.querySelector('[data-drill-back]').addEventListener('click', () => { d.i = Math.max(0, d.i - 1); d.msg = null; d.hint = false; this.renderDrill(); });
    under.querySelector('[data-drill-restart]').addEventListener('click', () => { d.i = 0; d.msg = null; d.hint = false; this.renderDrill(); });
    under.querySelector('[data-drill-quit]').addEventListener('click', () => { this.drill = null; under.innerHTML = ''; this.drawAt(this.steps.length - 1, { arrow: false }); this.board.setHint?.(null); });
  }

  // Coup joué sur l'échiquier : seul le coup suivant de la séquence est accepté.
  onBoardMove(mv) {
    const d = this.drill;
    if (!d || this.stage !== 2 || d.i >= d.c.uci.length) return;
    const want = d.c.uci[d.i];
    const played = `${mv.from}${mv.to}${mv.promotion || ''}`;
    if (played === want || (played.slice(0, 4) === want.slice(0, 4) && !want[4])) {
      const fault = d.i === d.c.marked;
      d.i++;
      d.hint = false;
      d.msg = fault ? (d.kind === 'piege' ? L('Voilà l’erreur. Regardez maintenant la sanction.', 'There’s the mistake. Now watch the sanction.') : L('Voilà l’erreur adverse. À vous de la punir.', 'There’s your opponent’s mistake. Your turn to punish it.')) : null;
    } else {
      d.msg = L(`Ce n’est pas le coup de la séquence : ici, on joue ${this.drillLabel(d.i)}.`, `That’s not the sequence’s move: here, the move is ${this.drillLabel(d.i)}.`);
      const chess = new Chess();
      for (const u of d.c.uci.slice(0, d.i)) chess.move(toObj(u));
      const why = raisonErreur({ fen: chess.fen(), uci: played, expectedSan: d.c.san[d.i] });
      this.renderDrill();
      this.board.flashError(mv.to, why || d.msg);
      return;
    }
    this.board.hideBubble();
    this.renderDrill();
  }

  // Panneau « Comparer avec ma partie » : choix de la partie, vue théorie / ma partie, 2 lignes de coups.
  cmpPanelHtml() {
    if (!this.mesParties.length) return '';
    const res = L({ victoire: 'gagnée', défaite: 'perdue', nulle: 'nulle' }, { victoire: 'won', défaite: 'lost', nulle: 'draw' });
    const p = this.partie();
    const lbl = (i, m) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${sanFr(m)}`;
    const lblComplet = (i, m) => coupNo(i, m);
    return `<div class="lesson-cmp" data-cmp>
      <h3>${L('🎮 Comparer avec ma partie', '🎮 Compare with my game')}</h3>
      <select data-cmp-select aria-label="${L('Ma partie à comparer', 'My game to compare')}"><option value="">${L('— Choisir une de mes parties —', '— Choose one of my games —')}</option>${this.mesParties.map((r, i) => `<option value="${i}" ${this.cmp?.idx === i ? 'selected' : ''}>${esc(r.date ? new Date(r.date).toLocaleDateString(L('fr-FR', 'en-GB')) : '')}${r.opp ? L(` · contre ${esc(r.opp)}`, ` · vs ${esc(r.opp)}`) : ''} · ${res[r.outcome] || ''}</option>`).join('')}</select>
      ${p ? `<div class="chips"><button type="button" class="chip" data-cmp-vue="theorie" aria-pressed="${this.cmp.vue === 'theorie'}">${L('📖 Théorie', '📖 Theory')}</button><button type="button" class="chip" data-cmp-vue="partie" aria-pressed="${this.cmp.vue === 'partie'}">${L('🎮 Ma partie', '🎮 My game')}</button></div>
        <p class="small">${p.ecart == null ? L('✅ Ta partie suit la théorie sur toute la ligne.', '✅ Your game follows theory for the whole line.') : `${L('Ta partie quitte la théorie au coup ', 'Your game leaves theory at move ')}<strong>${esc(lblComplet(p.ecart, p.san[p.ecart] || '…'))}</strong>${p.san[p.ecart] ? `${L(' (théorie : ', ' (theory: ')}<strong>${esc(sanFr(this.steps[p.ecart].san))}</strong>)` : ''} — ${(p.ecart % 2 === 0 ? 'w' : 'b') === this.color ? L('c’est toi qui en sors', 'you are the one who leaves it') : L('c’est l’adversaire qui en sort', 'your opponent is the one who leaves it')}.`}</p>
        <p class="small muted">${L('Ma partie :', 'My game:')}</p>
        <p class="moves-annot">${p.san.map((m, i) => `<button type="button" class="m ${i === p.ecart ? 'ecart' : ''} ${p.ecart != null && i > p.ecart ? 'apres' : ''} ${i === this.ply ? 'current' : ''}" data-ply="${i}">${esc(lbl(i, m))}</button>`).join(' ')}</p>` : ''}
    </div>`;
  }

  // Sous l'échiquier : le coup de la théorie et celui de ma partie à cette étape.
  cmpLigneHtml() {
    const p = this.partie();
    if (!p) return '';
    const t = this.steps[this.ply]?.san;
    const m = p.san[this.ply];
    if (!m) return L('<p class="cmp-ligne small muted">Ma partie s’arrête avant ce coup.</p>', '<p class="cmp-ligne small muted">My game stops before this move.</p>');
    const meme = m === t;
    return `<p class="cmp-ligne small ${meme ? 'same' : 'diff'}">${meme ? L('✔ Même coup dans ma partie', '✔ Same move in my game') : L(`✘ Ma partie : <strong>${esc(sanFr(m))}</strong> · théorie : <strong>${esc(sanFr(t))}</strong>`, `✘ My game: <strong>${esc(sanFr(m))}</strong> · theory: <strong>${esc(sanFr(t))}</strong>`)}${this.ply === p.ecart ? L(' — <strong>c’est ici que ta partie quitte la théorie</strong>', ' — <strong>this is where your game leaves theory</strong>') : ''}</p>`;
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  togglePlay() {
    if (this.timer) { this.stop(); this.render(); return; }
    if (this.ply >= this.steps.length - 1) this.ply = -1;
    this.timer = setInterval(() => {
      if (!this.alive || this.stage !== 1) { this.stop(); return; }
      this.ply++;
      if (this.ply >= this.steps.length - 1) this.stop();
      this.render();
    }, 1800);
    this.render();
  }

  // Rejoue une punition ou un piège sur l'échiquier (coup fautif en rouge).
  showClaim(c) {
    if (!c) return;
    this.stop();
    const chess = new Chess();
    let i = 0;
    this.timer = setInterval(() => {
      if (!this.alive || i >= c.uci.length) { this.stop(); return; }
      const mv = chess.move(toObj(c.uci[i]));
      this.board.setPosition(chess, { lastMove: mv });
      this.board.setArrows([{ from: mv.from, to: mv.to, kind: i === c.marked ? 'threat' : 'best' }]);
      i++;
    }, 700);
  }
}

// « 6… Cbd7 » / « 7. Tc1 » : coup numéroté, même pour les Noirs.
function coupNo(i, san) {
  return `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'} ${sanFr(san)}`;
}

function lineFr(sans) {
  return sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${sanFr(s)}` : sanFr(s))).join(' ');
}
