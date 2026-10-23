// Module « Apprendre » de la page Entraînement : une leçon par fiche, en 4 étapes.
// 1. Présentation (nom, idée, structure) ; 2. les coups un par un, avec le nom officiel de
// l'ouverture atteint à chaque étape et des commentaires factuels ; 3. à retenir (cases,
// échanges, piège, punition, vidéos) ; 4. à vous : pratique guidée (indices, puis le coup).
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { sanFr } from './analysis.js';
import { lessonSteps, nomFr } from './lesson-core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const STAGES = ['Présentation', 'Les coups', 'À retenir', 'À vous'];
const BADGE = { theorie: 'Théorie', piege: 'Piège Blitz', loufoque: 'Coup loufoque' };

export class LessonView {
  constructor({ el, data, entry, onPractice, onClose }) {
    this.el = el;
    this.data = data;
    this.e = entry;
    this.color = data.repertoires[entry.rep].couleur;
    this.steps = lessonSteps(entry, this.color);
    this.onPractice = onPractice;
    this.onClose = onClose;
    this.stage = 0;
    this.ply = -1; // -1 = position de départ
    this.timer = null;
    this.alive = true;
    this.layout();
    this.render();
  }

  layout() {
    this.el.innerHTML = `<div class="lesson" data-lesson="${esc(this.e.id)}">
      <div class="lesson-top">
        <button type="button" class="small-btn" data-close>← Retour au cours</button>
        <ol class="lesson-stages">${STAGES.map((s, i) => `<li><button type="button" class="chip" data-stage="${i}">${i + 1}. ${s}</button></li>`).join('')}</ol>
      </div>
      <div class="train-layout">
        <section><div class="lesson-name" data-name></div><div class="board-wrap" data-board></div><div class="lesson-nav" data-nav></div><div class="lesson-under" data-under></div></section>
        <section class="card lesson-panel" data-panel></section>
      </div>
    </div>`;
    this.board = new Board(this.el.querySelector('[data-board]'), { piecesUrl: './pieces/' });
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

  drawAt(ply, { arrow = true } = {}) {
    const c = new Chess();
    for (const s of this.steps.slice(0, ply + 1)) c.move(s.san);
    const last = c.history({ verbose: true }).at(-1) || null;
    this.board.setPosition(c, { lastMove: last });
    const s = this.steps[ply];
    this.board.setArrows(arrow && s ? [{ from: s.uci.slice(0, 2), to: s.uci.slice(2, 4), kind: s.ours ? 'best' : 'reply' }] : []);
    const n = this.nameAt(ply);
    this.el.querySelector('[data-name]').innerHTML = n
      ? `<span class="lesson-eco">${esc(n.eco)}</span> <strong>${esc(n.fr)}</strong><span class="muted tiny"> · nom officiel : ${esc(n.name)}</span>`
      : '<span class="muted">Position de départ</span>';
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
      panel.innerHTML = `<p class="muted small">${esc(e.famille)} · <span class="badge eco">${esc(e.eco)}</span> <span class="badge">${esc(BADGE[e.badge] || e.badge)}</span> · vous avez les ${me}</p>
        <h2>${esc(e.nom)}</h2>
        <p class="lesson-official">Nom officiel : <strong>${esc(finalName)}</strong><br><span class="muted tiny">${esc(e.ecoNom)} (${esc(e.eco)})</span></p>
        <h3>L’idée</h3><p>${esc(e.plan)}</p>
        <h3>La structure</h3><p>${esc(e.structure)}</p>
        <p class="muted small">La position finale de la ligne est affichée. Étape suivante : les ${this.steps.length} demi-coups, un par un, avec le nom de l’ouverture qui se précise à chaque coup.</p>
        <div class="actions"><button type="button" class="primary" data-next>Voir les coups →</button></div>`;
      panel.querySelector('[data-next]').addEventListener('click', () => { this.ply = -1; this.go(1); });
      return;
    }
    if (this.stage === 1) {
      this.drawAt(this.ply);
      const s = this.steps[this.ply];
      const total = this.steps.length;
      // Explication juste sous l'échiquier (visible sans défiler sur téléphone) ; à côté : tous les coups.
      if (!s) {
        under.innerHTML = `<div class="card lesson-step"><h2>Position de départ</h2><p>${me === 'Blancs' ? 'Vous avez les Blancs : vous jouez le premier coup.' : 'Vous avez les Noirs : l’adversaire commence.'}</p><p class="muted small">Touchez « Suivant » pour avancer coup par coup. Flèche verte : votre coup ; orange : celui de l’adversaire.</p></div>`;
      } else {
        under.innerHTML = `<div class="card lesson-step"><p class="muted small">Coup ${this.ply + 1} / ${total} · ${s.ours ? '<strong>votre coup</strong>' : 'coup de l’adversaire'}</p>
          <h2 class="lesson-move ${s.ours ? 'ours' : 'theirs'}">${esc(s.label)}</h2>
          ${s.nom ? `<p class="lesson-newname">📛 Vous entrez dans : <strong>${esc(s.nom.fr)}</strong> <span class="muted tiny">(${esc(s.nom.eco)})</span></p>` : ''}
          <ul class="lesson-notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
          ${this.ply === total - 1 ? '<div class="actions"><button type="button" class="primary" data-next>À retenir →</button></div>' : ''}</div>`;
        under.querySelector('[data-next]')?.addEventListener('click', () => this.go(2));
      }
      panel.innerHTML = `<h2>Les coups de la ligne</h2><p class="small muted">Touchez un coup pour y aller. En vert : vos coups.</p>
        <p class="moves-annot">${this.steps.map((x) => `<button type="button" class="m ${x.ours ? 'mine' : ''} ${x.ply === this.ply ? 'current' : ''}" data-ply="${x.ply}">${esc(x.label)}</button>`).join(' ')}</p>`;
      panel.querySelectorAll('[data-ply]').forEach((b) => b.addEventListener('click', () => { this.stop(); this.ply = Number(b.dataset.ply); this.render(); }));
      nav.innerHTML = `<button type="button" data-prev aria-label="Coup précédent" ${this.ply < 0 ? 'disabled' : ''}>◀</button>
        <button type="button" class="primary" data-play>${this.timer ? '⏸ Pause' : '▶ Lecture'}</button>
        <button type="button" data-step aria-label="Coup suivant" ${this.ply >= total - 1 ? 'disabled' : ''}>Suivant ▶</button>`;
      nav.querySelector('[data-prev]').addEventListener('click', () => { this.stop(); this.ply = Math.max(-1, this.ply - 1); this.render(); });
      nav.querySelector('[data-step]').addEventListener('click', () => { this.stop(); this.ply = Math.min(total - 1, this.ply + 1); this.render(); });
      nav.querySelector('[data-play]').addEventListener('click', () => this.togglePlay());
      return;
    }
    // Étape 2 : à retenir.
    this.drawAt(this.steps.length - 1, { arrow: false });
    const claim = (c, kind) => (c ? `<div class="lesson-claim ${kind}"><h3>${kind === 'piege' ? '⚠ Le piège à éviter' : '🎯 La punition à connaître'}</h3><p>${esc(c.texte)}</p>
      <p class="line small">${esc(lineFr(c.san))}</p>
      <button type="button" class="small-btn" data-show="${kind}">Voir sur l’échiquier</button></div>` : '');
    const liens = (e.video?.liens || []).slice().sort((a, b) => (a.langue === 'fr' ? -1 : 0) - (b.langue === 'fr' ? -1 : 0));
    panel.innerHTML = `<h2>À retenir</h2>
      <dl class="lesson-keys">
        <dt>Cases et pièces clés</dt><dd>${esc(e.cases)}</dd>
        <dt>À échanger</dt><dd>${esc(e.echanger)}</dd>
        <dt>À conserver</dt><dd>${esc(e.conserver)}</dd>
      </dl>
      ${claim(e.piege, 'piege')}${claim(e.punition, 'punition')}
      ${liens.length ? `<h3>🎬 Pour aller plus loin</h3><ul>${liens.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.titre)}</a> <span class="muted small">(${esc(l.chaine)}, ${esc(String(l.langue).toUpperCase())})</span></li>`).join('')}</ul>` : ''}
      <div class="actions"><button type="button" class="primary" data-next>À vous de jouer la ligne →</button></div>`;
    panel.querySelector('[data-next]').addEventListener('click', () => this.go(3));
    panel.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => this.showClaim(e[b.dataset.show])));
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

function lineFr(sans) {
  return sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${sanFr(s)}` : sanFr(s))).join(' ');
}
