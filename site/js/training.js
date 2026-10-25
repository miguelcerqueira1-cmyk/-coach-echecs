// Page « Entraînement » : l'application joue l'adversaire, l'utilisateur doit trouver
// le coup de son répertoire. Coups adverses tirés des parties Lichess du niveau choisi
// (fréquences réelles, coups loufoques compris) ou, à défaut, des fiches du répertoire.
// Les coups hors répertoire sont jugés par Stockfish (perte d'évaluation).
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { START_FEN } from './lines.js';
import { sanFr, formatScore } from './analysis.js';
import {
  buildTree, key, weightedPick, verdict, VERDICT_TEXT, cpFrom, cardsFor, schedule, pickCards, revisionStats,
} from './training-core.js';
import { DrillRunner } from './drills.js';
import { trashDrill } from './drills-core.js';
import { isPro, canOpenFiche, openPaywall } from './pro.js';
import { loadProgress, saveProgress, dashboard, pickFiches, recordLesson, vraiesErreurs, markCorrige } from './progress.js';
import { LessonView } from './cours.js';
import { courseOrder } from './lesson-core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PREFS = 'coach-echecs:entrainement';
const REVISION = 'coach-echecs:revision-v1'; // { gd: { cléPosition: état }, ck: { … } }
const pct = (x) => x.toFixed(0) + ' %';
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

const DEFAULT_PREFS = { rep: 'gd', source: 'lichess', length: 8, mode: 'partie', lRep: '', lN: 3, tRep: '', tN: 5, tTime: 10 };
function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { ...DEFAULT_PREFS }; }
}
function loadRevision() {
  try { return { gd: {}, ck: {}, ...JSON.parse(localStorage.getItem(REVISION) || '{}') }; } catch { return { gd: {}, ck: {} }; }
}
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const dateFr = (t) => new Date(t).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export class TrainingPage {
  constructor({ el, engine, client, getFilter, filterLabel }) {
    this.el = el;
    this.engine = engine;
    this.client = client;
    this.getFilter = getFilter;
    this.filterLabel = filterLabel;
    this.data = null;
    this.s = null; // session en cours
    this.prefs = loadPrefs();
    this.revision = loadRevision();
    this.sessionNo = 0;
  }

  async show() {
    if (!this.data) {
      try {
        this.data = await (await fetch('./data/repertoire.json', { cache: 'no-cache' })).json();
      } catch {
        this.el.innerHTML = '<p class="errbox pad">Impossible de charger le répertoire.</p>';
        return;
      }
    }
    if (!this.s && !this.drill && !this.lesson) this.renderSetup();
  }

  // ---------- Écran de départ ----------

  renderSetup() {
    this.lesson = null;
    if (this.view === 'cours') { this.renderCourse(this.courseRep || 'gd'); return; }
    const p = this.prefs;
    const hasLichess = !!this.client.explorerMode();
    this.progress = loadProgress();
    const board = dashboard(this.data, this.revision, this.progress);
    const nTrash = this.data.entries.filter((e) => trashDrill(e, this.data.repertoires[e.rep].couleur)).length;
    const repSel = (attr, cur) => `<select data-p="${attr}"><option value="" ${!cur ? 'selected' : ''}>Les deux</option><option value="gd" ${cur === 'gd' ? 'selected' : ''}>Gambit Dame</option><option value="ck" ${cur === 'ck' ? 'selected' : ''}>Caro-Kann</option></select>`;
    const opt = (attr, vals, cur, fmt = (v) => v) => `<select data-p="${attr}">${vals.map((v) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${fmt(v)}</option>`).join('')}</select>`;
    const next = (rep) => courseOrder(this.data.entries, rep).find((e) => !this.progress.cours?.[e.id] && canOpenFiche(e.id));
    const seen = (rep) => this.data.entries.filter((e) => e.rep === rep && this.progress.cours?.[e.id]).length;
    const total = (rep) => this.data.entries.filter((e) => e.rep === rep).length;
    const reelles = vraiesErreurs(this.progress);
    const lock = isPro() ? '' : ' <span class="lock-badge">🔒 Pro</span>';
    const nSort = reelles.filter((x) => x.kind === 'sortie').length;
    this.el.innerHTML = `<div class="train-hub">
      <section class="card hub-head">
        <div class="hub-stats">
          <div><span class="hub-big">🔥 ${board.streak}</span><span class="muted small">jour(s) d’affilée</span></div>
          <div><span class="hub-big">${board.byRep.gd.pct} %</span><span class="muted small">Gambit Dame</span></div>
          <div><span class="hub-big">${board.byRep.ck.pct} %</span><span class="muted small">Caro-Kann</span></div>
          <div><span class="hub-big">${board.byRep.gd.due + board.byRep.ck.due}</span><span class="muted small">position(s) à revoir</span></div>
        </div>
        <button type="button" class="primary hub-today" data-today>⚡ Séance du jour <span class="small">(3 lignes + 3 punitions, ≈ 5 min)</span>${lock}</button>
      </section>
      <section class="card hub-card hub-real" data-reelles>
        <h2>🎯 Mes vraies erreurs${lock}</h2>
        ${reelles.length ? `<p class="small"><strong>${reelles.length}</strong> position(s) tirée(s) de vos parties Lichess / Chess.com : ${nSort} sortie(s) de répertoire, ${reelles.length - nSort} punition(s) manquée(s). Retrouvez le bon coup : une position validée sort de la liste.</p>
        <ul class="small real-list">${reelles.slice(0, 3).map((x) => `<li>${esc(x.date ? new Date(x.date).toLocaleDateString('fr-FR') : '')}${x.opp ? ` · contre ${esc(x.opp)}` : ''} · ${x.kind === 'punition' ? 'punition manquée' : 'sortie du répertoire'}${x.ficheNom ? ` (« ${esc(x.ficheNom)} »)` : ''}</li>`).join('')}</ul>
        <div class="actions"><button type="button" class="primary" data-real>Revoir mes vraies erreurs</button></div>`
    : '<p class="small muted">Aucune position à corriger pour l’instant. Importez vos parties dans « Mes parties » : quand vous sortez de vos fiches ou laissez passer une punition prévue, la position arrive ici.</p>'}
      </section>
      <p class="hub-path muted small">Le parcours conseillé : <strong>1. Apprendre</strong> une variante (leçon), <strong>2. S’entraîner</strong> à la rejouer de mémoire, <strong>3. Réflexes</strong> pour punir les coups douteux en blitz.</p>
      <div class="hub-grid">
        <section class="card hub-card hub-learn">
          <h2>📖 1. Apprendre</h2>
          ${isPro() ? '' : '<p class="small"><strong>Gratuit :</strong> 3 leçons de base. Les autres leçons sont dans BlitzRefute Pro.</p>'}
          <p class="small">Des leçons pas à pas : le nom de chaque variante, les coups expliqués un par un, ce qu’il faut retenir, puis vous rejouez la ligne avec des indices.</p>
          <div class="hub-courses">
            ${['gd', 'ck'].map((rep) => {
              const n = next(rep);
              return `<button type="button" class="hub-course" data-course="${rep}">
                <strong>${rep === 'gd' ? '♙ Gambit Dame' : '♟ Caro-Kann'}</strong>
                <span class="small muted">${seen(rep)} / ${total(rep)} leçon(s) suivie(s)</span>
                ${n ? `<span class="small">Prochaine : ${esc(n.nom)}</span>` : '<span class="small">Toutes les leçons sont suivies ✔</span>'}
              </button>`;
            }).join('')}
          </div>
        </section>
        <section class="card hub-card">
          <h2>📚 2. S’entraîner${lock}</h2>
          <p class="small">L’application joue l’adversaire, vous jouez la théorie de mémoire. Erreur : le plan et le bon coup, et la position revient en fin de séance.</p>
          <label class="row">Répertoire ${repSel('lRep', p.lRep)}</label>
          <label class="row">Lignes ${opt('lN', [3, 5, 8], p.lN)}</label>
          <div class="actions"><button type="button" class="primary" data-lines>Commencer</button></div>
        </section>
        <section class="card hub-card">
          <h2>⏱ 3. Réflexes anti-trash${lock}</h2>
          <p class="small">Un coup douteux de blitz est joué : enchaînez la punition avant la fin du chrono. ${nTrash} exercices.</p>
          <label class="row">Répertoire ${repSel('tRep', p.tRep)}</label>
          <label class="row">Exercices ${opt('tN', [5, 10, 20], p.tN)}</label>
          <label class="row">Temps ${opt('tTime', [10, 20, 30], p.tTime, (v) => `${v} s`)}</label>
          <div class="actions"><button type="button" class="primary" data-trash>Commencer</button></div>
        </section>
      </div>
      <section class="card hub-dash" data-dashboard>${this.dashboardHtml(board)}</section>
      <details class="card hub-other" data-other-modes>
        <summary>Autres modes : partie contre l’adversaire, positions isolées</summary>
        <div class="train-setup">
          <p class="small">L’application joue l’adversaire ; à vous de trouver le coup de votre répertoire, sans aide. Chaque coup est vérifié (fiche ou Stockfish).</p>
      <label class="row">Répertoire
        <select data-p="rep">
          <option value="gd" ${p.rep === 'gd' ? 'selected' : ''}>Gambit Dame (vous avez les Blancs)</option>
          <option value="ck" ${p.rep === 'ck' ? 'selected' : ''}>Caro-Kann (vous avez les Noirs)</option>
        </select>
      </label>
      <label class="row">Mode
        <select data-p="mode">
          <option value="partie" ${p.mode !== 'revision' ? 'selected' : ''}>Partie contre l’adversaire</option>
          <option value="revision" ${p.mode === 'revision' ? 'selected' : ''}>Révision espacée (positions à revoir)</option>
        </select>
      </label>
      <p class="small" data-rev-stats>${this.revisionLine(p.rep)}</p>
      <label class="row">Coups de l’adversaire
        <select data-p="source">
          <option value="lichess" ${p.source === 'lichess' ? 'selected' : ''} ${hasLichess ? '' : 'disabled'}>Parties réelles Lichess (${esc(this.filterLabel())})</option>
          <option value="fiches" ${p.source === 'fiches' || !hasLichess ? 'selected' : ''}>Lignes des fiches seulement</option>
        </select>
      </label>
      ${hasLichess ? '' : '<p class="muted small">Pour des adversaires tirés des vraies parties de votre niveau, ajoutez votre jeton Lichess (⚙).</p>'}
      <label class="row">Nombre de vos coups <span class="muted small">(ou de positions en révision)</span>
        <select data-p="length">${[5, 8, 12, 16].map((n) => `<option value="${n}" ${Number(p.length) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <p class="muted small">Le filtre de niveau se règle dans « Coup optimal », page Moteur.</p>
                  <div class="actions"><button type="button" class="primary" data-start>Commencer</button></div>
        </div>
      </details>
    </div>`;
    this.el.querySelectorAll('[data-p]').forEach((sel) => sel.addEventListener('change', () => {
      this.prefs[sel.dataset.p] = sel.value;
      try { localStorage.setItem(PREFS, JSON.stringify(this.prefs)); } catch { /* rien */ }
      this.el.querySelector('[data-rev-stats]').innerHTML = this.revisionLine(this.prefs.rep);
    }));
    // Modules réservés à BlitzRefute Pro : fenêtre de paiement sinon.
    const need = (reason, fn) => () => (isPro() ? fn() : openPaywall({ reason }));
    this.el.querySelector('[data-start]').addEventListener('click', need('Ce mode d’entraînement', () => this.start()));
    this.el.querySelector('[data-real]')?.addEventListener('click', need('« Mes vraies erreurs »', () => this.runReelles()));
    this.el.querySelectorAll('[data-course]').forEach((b) => b.addEventListener('click', () => { this.view = 'cours'; this.courseRep = b.dataset.course; this.renderSetup(); window.scrollTo(0, 0); }));
    this.el.querySelector('[data-lines]').addEventListener('click', need('L’entraînement en répétition espacée', () => {
      this.runDrill('lignes', pickFiches(board, { rep: this.prefs.lRep || null, n: Number(this.prefs.lN) || 3 }));
    }));
    const trashIds = (rep) => pickFiches(board, { rep, n: 999, needPunition: true })
      .filter((id) => { const e = this.data.entries.find((x) => x.id === id); return trashDrill(e, this.data.repertoires[e.rep].couleur); });
    this.el.querySelector('[data-trash]').addEventListener('click', need('Le module Réflexes anti-trash', () => {
      this.runDrill('trash', shuffle(trashIds(this.prefs.tRep || null)).slice(0, Number(this.prefs.tN) || 5), { timeLimit: Number(this.prefs.tTime) || 10 });
    }));
    this.el.querySelector('[data-today]').addEventListener('click', need('La séance du jour', () => {
      const trash = shuffle(trashIds(null)).slice(0, 3);
      this.runDrill('lignes', pickFiches(board, { n: 3 }), { then: () => this.runDrill('trash', trash, { timeLimit: Number(this.prefs.tTime) || 10 }) });
    }));
    this.el.querySelectorAll('[data-dash-line]').forEach((b) => b.addEventListener('click', need('La révision des lignes', () => this.runDrill('lignes', [b.dataset.dashLine]))));
    this.el.querySelectorAll('[data-dash-trash]').forEach((b) => b.addEventListener('click', need('Le drill de punition', () => this.runDrill('trash', [b.dataset.dashTrash], { timeLimit: Number(this.prefs.tTime) || 10 }))));
    this.el.querySelectorAll('[data-dash-lesson]').forEach((b) => b.addEventListener('click', () => this.openLesson(b.dataset.dashLesson)));
    this.el.querySelectorAll('[data-dash-rep]').forEach((b) => b.addEventListener('click', () => {
      this.dashRep = b.dataset.dashRep;
      this.renderSetup();
      this.el.querySelector('[data-dashboard]').scrollIntoView({ block: 'start' });
    }));
  }

  // ---------- Module Apprendre (cours) ----------

  renderCourse(rep) {
    this.progress = loadProgress();
    const board = dashboard(this.data, this.revision, this.progress);
    const byId = Object.fromEntries(board.fiches.map((f) => [f.id, f]));
    const list = courseOrder(this.data.entries, rep);
    const next = list.find((e) => !this.progress.cours?.[e.id] && canOpenFiche(e.id));
    const groups = [];
    for (const e of list) {
      const g = `${e.badge === 'theorie' ? '' : `${({ piege: 'Pièges', loufoque: 'Coups loufoques à punir' })[e.badge]} · `}${e.famille}`;
      if (!groups.length || groups.at(-1).g !== g) groups.push({ g, items: [] });
      groups.at(-1).items.push(e);
    }
    let n = 0;
    this.el.innerHTML = `<div class="course">
      <div class="lesson-top">
        <button type="button" class="small-btn" data-back>← Accueil Entraînement</button>
        <div class="chips">${['gd', 'ck'].map((r) => `<button type="button" class="chip" data-crep="${r}" aria-pressed="${r === rep}">${r === 'gd' ? '♙ Gambit Dame (Blancs)' : '♟ Caro-Kann (Noirs)'}</button>`).join('')}</div>
      </div>
      <h2>📖 Cours : ${rep === 'gd' ? 'le Gambit Dame avec les Blancs' : 'la Caro-Kann avec les Noirs'}</h2>
      <p class="small muted">Dans l’ordre conseillé : la théorie principale d’abord, puis les pièges et les coups loufoques. Chaque leçon : présentation → les coups un par un → à retenir → à vous.</p>
      ${groups.map(({ g, items }) => `<h3 class="course-group">${esc(g)}</h3><ol class="course-list" start="${n + 1}">${items.map((e) => {
        n++;
        const f = byId[e.id];
        const isNext = next?.id === e.id;
        return `<li class="course-item ${isNext ? 'next' : ''}">
          <div class="course-main"><span class="badge eco">${esc(e.eco)}</span> <strong>${esc(e.nom)}</strong>
            <div class="small muted">${this.progress.cours?.[e.id] ? '📖 Leçon suivie' : isNext ? '👉 Prochaine leçon conseillée' : 'Pas encore vue'} · maîtrise ${f.pct} %</div></div>
          <div class="dash-bar"><span style="width:${f.pct}%" class="${f.pct >= 80 ? 'hi' : f.pct >= 40 ? 'mid' : 'lo'}"></span></div>
          <button type="button" class="${isNext ? 'primary' : ''} small-btn" data-lesson="${e.id}">${!canOpenFiche(e.id) ? '🔒 Pro' : this.progress.cours?.[e.id] ? 'Revoir' : 'Commencer'}</button>
        </li>`;
      }).join('')}</ol>`).join('')}
    </div>`;
    this.el.querySelector('[data-back]').addEventListener('click', () => { this.view = null; this.renderSetup(); window.scrollTo(0, 0); });
    this.el.querySelectorAll('[data-crep]').forEach((b) => b.addEventListener('click', () => { this.courseRep = b.dataset.crep; this.renderCourse(this.courseRep); }));
    this.el.querySelectorAll('[data-lesson]').forEach((b) => b.addEventListener('click', () => this.openLesson(b.dataset.lesson)));
  }

  openLesson(id) {
    const entry = this.data.entries.find((e) => e.id === id);
    if (!entry) return;
    if (!canOpenFiche(id)) { openPaywall({ reason: `La leçon « ${entry.nom} »` }); return; }
    this.s = null;
    this.view = 'cours';
    this.courseRep = entry.rep;
    window.scrollTo(0, 0);
    this.lesson = new LessonView({
      el: this.el, data: this.data, entry,
      onClose: () => { this.lesson = null; this.renderSetup(); },
      onPractice: (fid) => this.runDrill('lignes', [fid], {
        guided: true,
        then: () => {
          const p = loadProgress();
          recordLesson(p, fid);
          saveProgress(p);
          this.renderCourse(entry.rep);
          const e2 = this.data.entries.find((e) => e.id === fid);
          const drill = trashDrill(e2, this.data.repertoires[e2.rep].couleur);
          this.el.querySelector('.course').insertAdjacentHTML('afterbegin', `<div class="hub-result">Leçon « ${esc(e2.nom)} » terminée ✔ Elle reviendra dans vos révisions (module S’entraîner).
            ${drill ? `<button type="button" class="small-btn" data-after-drill="${fid}">⏱ Tester la punition</button>` : ''}</div>`);
          this.el.querySelector('[data-after-drill]')?.addEventListener('click', () => (isPro() ? this.runDrill('trash', [fid], { timeLimit: 20 }) : openPaywall({ reason: 'Le drill de punition' })));
        },
      }),
    });
  }

  // ---------- Modules Lignes / Anti-trash ----------

  runDrill(kind, ids, { timeLimit = 10, then = null, guided = false } = {}) {
    if (!ids.length) { this.renderSetup(); return; }
    this.s = null;
    const tree = { gd: buildTree(this.data.entries, 'gd'), ck: buildTree(this.data.entries, 'ck') };
    this.drill = new DrillRunner({
      el: this.el, data: this.data, kind, ids, tree, timeLimit, guided, engine: this.engine,
      progress: this.progress || loadProgress(),
      gradePos: (rep, k, ok) => this.gradePos(rep, k, ok),
      onDone: (r) => {
        this.drill = null;
        if (then && r.total) { then(); return; }
        this.lastResult = r;
        this.view = null;
        this.renderSetup();
        const msg = r.kind === 'trash'
          ? `Drill terminé : ${r.ok} / ${r.total} punition(s) réussie(s)${r.best ? `, meilleur temps ${(r.best / 1000).toFixed(1).replace('.', ',')} s` : ''}.`
          : `Lignes terminées : ${r.ok} / ${r.total} sans faute.`;
        this.el.querySelector('.hub-head').insertAdjacentHTML('afterbegin', `<p class="hub-result">${esc(msg)}</p>`);
      },
    });
  }

  // « Mes vraies erreurs » : positions de vos parties réelles (Mes parties) à corriger.
  runReelles() {
    const list = vraiesErreurs(loadProgress());
    if (!list.length) { this.renderSetup(); return; }
    this.s = null;
    const tree = { gd: buildTree(this.data.entries, 'gd'), ck: buildTree(this.data.entries, 'ck') };
    this.drill = new DrillRunner({
      el: this.el, data: this.data, kind: 'reelles', ids: [], tree, engine: this.engine, positions: list,
      progress: loadProgress(),
      gradePos: (rep, k, ok) => this.gradePos(rep, k, ok),
      onValidated: (gameId) => { const p = loadProgress(); markCorrige(p, gameId); saveProgress(p); },
      onDone: (r) => {
        this.drill = null;
        this.view = null;
        this.renderSetup();
        this.el.querySelector('.hub-head').insertAdjacentHTML('afterbegin', `<p class="hub-result">${esc(`Mes vraies erreurs : ${r.ok} position(s) corrigée(s).`)}</p>`);
      },
    });
  }

  // Révision espacée d'une position (hors session « Partie »).
  gradePos(rep, k, ok) {
    this.revision[rep][k] = schedule(this.revision[rep][k], ok);
    try { localStorage.setItem(REVISION, JSON.stringify(this.revision)); } catch { /* stockage plein */ }
  }

  dashboardHtml(board) {
    const rep = this.dashRep || 'gd';
    const fiches = board.fiches.filter((f) => f.rep === rep);
    const r = board.byRep[rep];
    const tab = (k, label) => `<button type="button" class="chip" data-dash-rep="${k}" aria-pressed="${rep === k}">${label}</button>`;
    return `<h2>📊 Progression par variante</h2>
      <div class="chips">${tab('gd', '♙ Gambit Dame')}${tab('ck', '♟ Caro-Kann')}</div>
      <p class="small">Maîtrise moyenne <strong>${r.pct} %</strong> · ${r.maitrisees} / ${r.total} variante(s) maîtrisée(s) (≥ 80 %) · ${r.due} position(s) à revoir.
        ${board.bestDrill ? ` · Record anti-trash : ${(board.bestDrill / 1000).toFixed(1).replace('.', ',')} s` : ''}</p>
      <p class="muted tiny">Maîtrise = positions révisées avec succès (70 %) + réussite aux exercices de la fiche (30 %). Les variantes les plus faibles sont en haut ; ⚠ = vous en êtes sorti dans une vraie partie (Mes parties).</p>
      ${(() => {
    const row = (f) => `<li class="dash-row">
        <div class="dash-name"><span class="badge eco">${esc(f.eco)}</span> ${esc(f.nom)}${f.cours ? ' <span title="Leçon suivie">📖</span>' : ''}${f.sorties ? ` <span class="badge err" title="Sortie de répertoire dans vos parties">⚠ ${f.sorties}</span>` : ''}${f.due ? ` <span class="badge">${f.due} à revoir</span>` : ''}</div>
        <div class="dash-bar" role="img" aria-label="Maîtrise ${f.pct} %"><span style="width:${f.pct}%" class="${f.pct >= 80 ? 'hi' : f.pct >= 40 ? 'mid' : 'lo'}"></span></div>
        <div class="dash-pct">${f.pct} %</div>
        <div class="dash-actions"><button type="button" class="small-btn" data-dash-lesson="${f.id}" title="Leçon">📖</button><button type="button" class="small-btn" data-dash-line="${f.id}">Réviser</button>${f.punition && trashDrill(this.data.entries.find((e) => e.id === f.id), this.data.repertoires[f.rep].couleur) ? `<button type="button" class="small-btn" data-dash-trash="${f.id}">⏱ Drill</button>` : ''}</div>
      </li>`;
    const head = fiches.slice(0, 12).map(row).join('');
    const rest = fiches.slice(12);
    return `<ul class="dash-list">${head}</ul>${rest.length ? `<details class="dash-more"><summary>Voir les ${rest.length} autres variantes</summary><ul class="dash-list">${rest.map(row).join('')}</ul></details>` : ''}`;
  })()}`;
  }

  // ---------- Révision espacée ----------

  revisionLine(rep) {
    const cards = cardsFor(buildTree(this.data.entries, rep));
    const st = revisionStats(cards, this.revision[rep]);
    return `📅 Révision : <strong>${st.due}</strong> position(s) à revoir maintenant · ${st.fresh} jamais vue(s) · ${st.learned} / ${st.total} apprise(s). <span class="muted">Chaque position ratée revient plus souvent ; réussie, elle s’espace (1 j, 3 j, 8 j…).</span>`;
  }

  // Note une position du répertoire (première tentative de la session seulement).
  grade(k, ok) {
    const s = this.s;
    if (s.graded.has(k)) return;
    s.graded.add(k);
    this.revision[s.rep][k] = schedule(this.revision[s.rep][k], ok);
    try { localStorage.setItem(REVISION, JSON.stringify(this.revision)); } catch { /* stockage plein */ }
  }

  nextCard() {
    const s = this.s;
    if (!this.alive(s)) return;
    if (s.cardIndex >= s.cards.length) { this.finish('Révision terminée.'); return; }
    const card = s.cards[s.cardIndex++];
    s.chess = new Chess();
    s.path = [];
    for (const u of card.path) this.play(u);
    const fiche = s.tree.ours.get(card.k)?.values().next().value?.[0];
    const st = this.revision[s.rep][card.k];
    this.msg(`Position ${s.cardIndex} / ${s.cards.length}${fiche ? ` — fiche « ${esc(fiche.nom)} »` : ''}${st ? (st.lapses ? ` <span class="muted">(ratée ${st.lapses} fois)</span>` : '') : ' <span class="muted">(nouvelle)</span>'} : trouvez votre coup.`, 'muted');
    this.render();
  }

  next() {
    if (this.s.mode === 'revision') setTimeout(() => this.nextCard(), 700);
    else setTimeout(() => this.opponentMove(), 450);
  }

  // ---------- Session ----------

  start() {
    const p = this.prefs;
    const color = p.rep === 'gd' ? 'w' : 'b';
    const source = p.source === 'lichess' && this.client.explorerMode() ? 'lichess' : 'fiches';
    this.sessionNo++;
    this.s = {
      id: `entrainement-${this.sessionNo}`, rep: p.rep, color, source, length: Number(p.length) || 8,
      chess: new Chess(), path: [], ours: 0, results: [], log: [], busy: false, done: false, pending: null, rev: 0,
      tree: buildTree(this.data.entries, p.rep), mode: p.mode === 'revision' ? 'revision' : 'partie', graded: new Set(),
    };
    if (this.s.mode === 'revision') {
      this.s.cards = pickCards(cardsFor(this.s.tree), this.revision[p.rep], { max: this.s.length });
      this.s.cardIndex = 0;
      this.s.length = this.s.cards.length;
    }
    this.el.innerHTML = `<div class="train-layout">
      <section><div class="train-status" data-status></div><div class="board-wrap" data-board></div>
        <div class="actions"><button type="button" data-stop>Arrêter</button><button type="button" data-restart>Recommencer</button></div></section>
      <section class="card train-panel"><div data-score></div><ol class="train-log" data-log></ol></section>
    </div>`;
    this.board = new Board(this.el.querySelector('[data-board]'), { piecesUrl: './pieces/', onMove: (mv) => this.onUserMove(mv) });
    this.board.setOrientation(color);
    this.el.querySelector('[data-stop]').addEventListener('click', () => this.finish('Session arrêtée.'));
    this.el.querySelector('[data-restart]').addEventListener('click', () => this.start());
    this.render();
    if (this.s.mode === 'revision') {
      if (!this.s.cards.length) {
        const next = Math.min(...Object.values(this.revision[p.rep]).map((x) => x.due));
        this.finish(`Rien à réviser : tout est à jour ✔ Prochaine révision : ${dateFr(next)}.`);
      } else this.nextCard();
    } else if (color === 'b') this.opponentMove();
  }

  token() { return { gameId: this.s.id, branchId: 'entrainement', revision: ++this.s.rev, ply: this.s.path.length }; }
  alive(s) { return this.s === s && !s.done; }

  msg(html, cls = '') { this.s.log.unshift({ html, cls }); }

  render() {
    const s = this.s;
    if (!s) return;
    const myTurn = s.chess.turn() === s.color && !s.busy && !s.done && !s.pending;
    const last = s.chess.history({ verbose: true }).at(-1) || null;
    this.board.setPosition(s.chess, { lastMove: last, interactive: myTurn });
    this.board.setArrows(s.pending?.arrow ? [s.pending.arrow] : []);
    const st = this.el.querySelector('[data-status]');
    st.className = 'train-status ' + (s.done ? 'over' : myTurn ? 'player' : 'opponent');
    st.innerHTML = s.done ? 'Session terminée'
      : s.busy ? '<span class="spinner"></span> ' + esc(s.busy)
      : s.pending ? 'Choisissez : réessayer ou continuer'
      : myTurn ? `À vous (${s.color === 'w' ? 'Blancs' : 'Noirs'}) : trouvez le coup de votre répertoire` : s.mode === 'revision' ? 'Position suivante…' : 'L’adversaire réfléchit…';
    const ok = s.results.filter((r) => r.ok).length;
    const book = s.results.filter((r) => r.level === 'repertoire').length;
    this.el.querySelector('[data-score]').innerHTML = `<h2>Score : ${ok} / ${s.results.length}</h2>
      <p class="small muted">${s.mode === 'revision' ? `Révision espacée · position ${s.ours} / ${s.length} réussie(s) ou passée(s)` : `${book} coup(s) du répertoire · coup ${s.ours} / ${s.length} · adversaire : ${s.source === 'lichess' ? 'parties Lichess (' + esc(this.filterLabel()) + ')' : 'lignes des fiches'}`}</p>
      ${s.pending ? `<div class="actions"><button type="button" data-retry>↺ Réessayer</button><button type="button" class="primary" data-fix>${s.mode === 'revision' ? 'Voir le bon coup et passer à la suite' : 'Continuer avec'} ${esc(sanFr(s.pending.bestSan))}</button></div>` : ''}
      ${s.done ? '<div class="actions"><button type="button" class="primary" data-again>Nouvelle session</button><button type="button" data-setup>Changer de réglages</button></div>' : ''}`;
    this.el.querySelector('[data-log]').innerHTML = s.log.map((l) => `<li class="${l.cls}">${l.html}</li>`).join('');
    this.el.querySelector('[data-retry]')?.addEventListener('click', () => this.retry());
    this.el.querySelector('[data-fix]')?.addEventListener('click', () => this.continueWithBest());
    this.el.querySelector('[data-again]')?.addEventListener('click', () => this.start());
    this.el.querySelector('[data-setup]')?.addEventListener('click', () => { this.s = null; this.renderSetup(); });
  }

  play(uci) {
    const mv = this.s.chess.move(toObj(uci));
    this.s.path.push(mv.lan);
    return mv;
  }

  // ---------- Coup de l'adversaire ----------

  async opponentMove() {
    const s = this.s;
    if (!this.alive(s)) return;
    if (s.ours >= s.length) { this.finish('Objectif atteint.'); return; }
    if (s.chess.isGameOver()) { this.finish('Fin de partie sur l’échiquier.'); return; }
    s.busy = 'L’adversaire choisit son coup…';
    this.render();
    let pick = null;
    let info = '';
    if (s.rep === 'ck' && s.path.length === 0) {
      pick = { uci: 'e2e4' };
      info = 'ouverture imposée pour la Caro-Kann';
    } else if (s.source === 'lichess') {
      try {
        const f = this.getFilter();
        const r = await this.client.explorer({ fen: START_FEN, play: s.path, ratings: f.ratings, speeds: f.speeds, moves: 30, isStale: () => !this.alive(s) });
        if (r.stale || !this.alive(s)) return;
        const legal = (u) => { try { new Chess(s.chess.fen()).move(toObj(u)); return true; } catch { return false; } };
        const moves = (r.moves || []).filter((m) => legal(m.uci)).map((m) => ({ uci: m.uci, weight: m.white + m.draws + m.black }));
        const total = moves.reduce((a, m) => a + m.weight, 0);
        pick = weightedPick(moves);
        if (pick) info = `joué dans ${pct((100 * pick.weight) / total)} des ${total.toLocaleString('fr-FR')} parties de ce niveau`;
      } catch (e) {
        this.msg(`Lichess indisponible (${esc(e.message)}) : coups tirés des fiches.`, 'muted');
      }
    }
    if (!pick) {
      const opts = s.tree.theirs.get(key(s.path));
      if (opts) {
        pick = weightedPick([...opts.entries()].map(([uci, infos]) => ({ uci, weight: infos.length })));
        if (pick) info = info || 'ligne des fiches';
      }
    }
    if (!this.alive(s)) return;
    s.busy = false;
    if (!pick) { this.finish(s.source === 'lichess' ? 'Plus aucune partie connue dans cette position avec ce filtre.' : 'Fin des lignes des fiches.'); return; }
    const mv = this.play(pick.uci);
    this.msg(`Adversaire : <strong>${esc(sanFr(mv.san))}</strong> <span class="muted">(${esc(info)})</span>`);
    const err = s.tree.errors.get(key(s.path));
    if (err) this.msg(`⚠ Erreur adverse connue (fiche « ${esc(err.nom)} ») : trouvez la punition !`, 'warn');
    if (s.chess.isGameOver()) { this.finish('Fin de partie sur l’échiquier.'); return; }
    this.render();
  }

  // ---------- Notre coup ----------

  async onUserMove(input) {
    const s = this.s;
    if (!this.alive(s) || s.busy || s.pending || s.chess.turn() !== s.color) return;
    const before = s.chess.fen();
    const k = key(s.path);
    let mv;
    try { mv = new Chess(before).move(input); } catch { return; }
    const uci = mv.lan;
    const book = s.tree.ours.get(k);
    const trap = s.tree.traps.get(k);
    const isBookMove = !!book?.has(uci);
    const isTrap = trap?.uci === uci;
    let best = null;
    let loss = null;
    if (!isBookMove) {
      s.busy = 'Stockfish vérifie votre coup…';
      this.play(uci);
      this.render();
      try {
        const rb = await this.engine.analyze({ position: `position fen ${before}`, movetime: 800, token: this.token() });
        if (rb.cancelled || !this.alive(s)) { if (this.alive(s)) { s.busy = false; this.render(); } return; }
        best = rb.bestmove;
        const cpBest = cpFrom(rb.info?.score, s.color, s.color);
        const after = new Chess(s.chess.fen());
        let cpAfter;
        if (after.isCheckmate()) cpAfter = 10000;
        else if (after.isDraw()) cpAfter = 0;
        else {
          const ra = await this.engine.analyze({ position: `position fen ${after.fen()}`, movetime: 800, token: this.token() });
          if (ra.cancelled || !this.alive(s)) { if (this.alive(s)) { s.busy = false; this.render(); } return; }
          cpAfter = cpFrom(ra.info?.score, after.turn(), s.color);
        }
        if (cpBest != null && cpAfter != null) loss = Math.max(0, cpBest - cpAfter);
      } catch (e) {
        this.msg(`Moteur indisponible (${esc(e.message)}) : coup non vérifié.`, 'muted');
      }
      s.chess.undo();
      s.path.pop();
      s.busy = false;
    }
    const v0 = verdict({ inBook: !!book, isBookMove, isTrap, loss });
    // En révision, on apprend le répertoire : un bon coup hors fiche reste à revoir.
    const v = s.mode === 'revision' && book && !isBookMove && v0.ok ? { level: 'bon-hors-fiche', ok: false } : v0;
    s.results.push({ ...v, san: mv.san });
    if (book) this.grade(k, v.level === 'repertoire'); // révision espacée : seul le coup du répertoire compte
    let html = `Vous : <strong>${esc(sanFr(mv.san))}</strong> — ${esc(VERDICT_TEXT[v.level])}`;
    if (loss != null && v.level !== 'repertoire') html += ` <span class="muted">(perte ≈ ${(loss / 100).toFixed(1).replace('.', ',')})</span>`;
    const bookMoves = book ? [...book.keys()] : [];
    const bookSan = bookMoves.map((u) => new Chess(before).move(toObj(u)).san);
    if (book && !isBookMove) {
      const fiche = book.get(bookMoves[0])[0];
      html += `<br><span class="small">Votre répertoire joue ${bookSan.map((x) => `<strong>${esc(sanFr(x))}</strong>`).join(' ou ')} (fiche « ${esc(fiche.nom)} »).</span>`;
    }
    if (isTrap) html += `<br><span class="small">${esc(trap.texte)}</span>`;
    const bestUci = bookMoves[0] || best;
    const bestSan = bestUci ? new Chess(before).move(toObj(bestUci)).san : null;
    if (!v.ok && best && !book) html += `<br><span class="small">Meilleur coup selon Stockfish : <strong>${esc(sanFr(new Chess(before).move(toObj(best)).san))}</strong>.</span>`;
    this.msg(html, v.ok ? 'ok' : 'ko');
    if (!v.ok && bestUci) {
      // On montre le coup joué, puis on laisse choisir : réessayer ou continuer avec le bon coup.
      this.play(uci);
      s.pending = { played: uci, bestUci, bestSan, arrow: { from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), kind: 'best' } };
      this.render();
      return;
    }
    this.play(uci);
    s.ours++;
    this.render();
    this.next();
  }

  retry() {
    const s = this.s;
    s.chess.undo();
    s.path.pop();
    s.results.pop();
    s.pending = null;
    this.msg('↺ Nouvel essai.', 'muted');
    this.render();
  }

  continueWithBest() {
    const s = this.s;
    s.chess.undo();
    s.path.pop();
    const mv = this.play(s.pending.bestUci);
    s.pending = null;
    s.ours++;
    this.msg(`${s.mode === 'revision' ? 'Bon coup' : 'On continue avec'} <strong>${esc(sanFr(mv.san))}</strong>.`, 'muted');
    this.render();
    this.next();
  }

  finish(reason) {
    const s = this.s;
    if (!s || s.done) return;
    s.done = true;
    s.busy = false;
    const ok = s.results.filter((r) => r.ok).length;
    const n = s.results.length;
    const fautes = s.results.filter((r) => !r.ok).map((r) => sanFr(r.san));
    this.msg(`<strong>${esc(reason)}</strong> Score : ${ok}/${n}${n ? ` (${Math.round((100 * ok) / n)} %)` : ''}.${fautes.length ? ` À revoir : ${fautes.map(esc).join(', ')}.` : ''}<br><span class="small">${this.revisionLine(s.rep)}</span>`, 'end');
    this.render();
  }
}
