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
import { prendreDemande } from './demande-entrainement.js';
import { charger as chargerRush, enregistrer as enregistrerRush } from './rush-core.js';
import { PuzzleRunner } from './puzzles.js';
import { FinaleRunner, chargerFinales } from './finales.js';
import FINALES_FR from '../data/finales.js';
import { langue } from './i18n.js';

const L = (fr, en) => (langue() === 'en' ? en : fr);
const LOC = langue() === 'en' ? 'en-GB' : 'fr-FR';

// Finales dans la langue de l'interface (titre et méthode).
const FINALES = FINALES_FR.map((f) => (langue() === 'en' && f.en ? { ...f, ...f.en } : f));
import { THEMES_PROBLEMES, themeDe, lire as lireProblemes, ecrire as ecrireProblemes, difficultePour, noterProbleme, themesFaibles, signe } from './problemes-core.js';
import { StockfishGameRunner } from './partie-stockfish.js';
import { NIVEAUX_SF, lire as lireSF, departDepuis } from './partie-stockfish-core.js';
import { loadProgress, saveProgress, dashboard, pickFiches, planTheorie, recordLesson, vraiesErreurs, markCorrige, bilanFiches } from './progress.js';
import { LessonView } from './cours.js';
import { courseOrder, courseOrderFreq } from './lesson-core.js';
import { filtrerData, REPERTOIRES } from './mon-repertoire.js';
import { couleurDe } from '../data/repertoires/meta.js';
import { jour, blocsDuJour, charger, enregistrer, cocher, noter, historique, serie, SUIVI, NIVEAUX, niveauProblemes, CHRONOS, chronoProblemes, profilDe, normaliserProfil, TEMPS, SITES, CADENCES } from './routine-core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PREFS = 'coach-echecs:entrainement';
const REVISION = 'coach-echecs:revision-v1'; // { <répertoire> : { cléPosition: état } }
const pct = (x) => x.toFixed(0) + ' %';
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

// complet : lignes prolongées par la suite Stockfish jusqu'au 15e coup (cours et S'entraîner) ;
// lTemps : secondes par coup en S'entraîner (0 = libre) ; lRepet : répéter une ligne jusqu'à N fois
// d'affilée sans faute.
const DEFAULT_PREFS = { rep: '', source: 'lichess', length: 8, mode: 'partie', lRep: '', lN: 3, tRep: '', tN: 5, tTime: 10, complet: '1', lTemps: 0, lRepet: 1 };
function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { ...DEFAULT_PREFS }; }
}
function loadRevision() {
  let r = {};
  try { r = JSON.parse(localStorage.getItem(REVISION) || '{}') || {}; } catch { r = {}; }
  for (const id of Object.keys(REPERTOIRES)) r[id] ??= {};
  return r;
}
// Libellé d'un répertoire avec le camp joué : « ♙ Gambit Dame (Blancs) ».
const repLabel = (id, { camp = true } = {}) => `${couleurDe(id) === 'w' ? '♙' : '♟'} ${REPERTOIRES[id]?.titre || id}${camp ? ` <span class="muted small">(${couleurDe(id) === 'w' ? L('Blancs', 'White') : L('Noirs', 'Black')})</span>` : ''}`;
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const dateFr = (t) => new Date(t).toLocaleString(LOC, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export class TrainingPage {
  constructor({ el, engine, client, getFilter, filterLabel, openSan = null }) {
    this.openSan = openSan;
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
    // Demande « 1 clic » arrivée alors que la page Entraînement est déjà affichée.
    window.addEventListener('demande-entrainement', () => { if (this.data) this.executerDemande(prendreDemande()); });
  }

  async show() {
    if (!this.data) {
      try {
        // Seulement les ouvertures choisies (Mon répertoire).
        this.data = filtrerData(await (await fetch('./data/repertoire.json', { cache: 'no-cache' })).json());
      } catch {
        this.el.innerHTML = `<p class="errbox pad">${L('Impossible de charger le répertoire.', 'Could not load the repertoire.')}</p>`;
        return;
      }
    }
    const d = prendreDemande();
    if (d) { this.executerDemande(d); return; }
    if (!this.s && !this.drill && !this.lesson) this.renderSetup();
  }

  montrerZone(z) {
    const hub = this.el.querySelector('.train-hub');
    if (!hub) return;
    hub.dataset.zoneActif = z;
    hub.querySelectorAll('[data-tuile]').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.tuile === z)));
    this.prefs.zone = z;
    try { localStorage.setItem(PREFS, JSON.stringify(this.prefs)); } catch { /* rien */ }
  }

  // Arrête proprement l'exercice ou la leçon en cours (minuteries comprises).
  arreterEnCours() {
    const c = this.drill?.cur;
    if (c) { clearInterval(c.moveTimer); clearInterval(c.timer); }
    if (this.drill) this.drill.alive = false;
    if (this.lesson) this.lesson.alive = false;
    this.drill = null;
    this.lesson = null;
    this.s = null;
    this.view = null;
  }

  // Demande venue du Répertoire, de Mes parties ou du bouton « Continuer ».
  executerDemande(d) {
    if (!d) return;
    this.arreterEnCours();
    this.progress = loadProgress();
    if (d.type === 'fiche') {
      const e = this.data.entries.find((x) => x.id === d.id);
      if (!e) { this.renderSetup(); return; }
      if (!canOpenFiche(e.id)) { this.renderSetup(); openPaywall({ reason: L(`La fiche « ${e.nom} »`, `The line “${e.nom}”`) }); return; }
      // Leçon pas encore suivie (ou formule gratuite) : la leçon ; sinon révision de la variante.
      if (!this.progress.cours?.[e.id] || !isPro()) this.openLesson(e.id);
      else this.runDrill('lignes', [e.id], { preset: { complet: '0', lTemps: 0, lRepet: 1 } });
    } else if (d.type === 'reelle') {
      if (!isPro()) { this.renderSetup(); openPaywall({ reason: L('« Positions de mes parties »', '“Positions from my games”') }); return; }
      this.runReelles({ gameId: d.gameId });
    } else if (d.type === 'continuer') {
      this.prochaineAction().run();
    } else this.renderSetup();
    window.scrollTo(0, 0);
  }

  // « Continuer » : la chose la plus utile du moment, dans cet ordre : positions ratées de mes
  // parties, positions dues en révision espacée, prochaine leçon, révision des variantes faibles.
  prochaineAction() {
    const p = this.progress || loadProgress();
    const board = dashboard(this.data, this.revision, p);
    const actifs = this.actifs();
    const pro = isPro();
    const reelles = vraiesErreurs(p);
    if (pro && reelles.length) {
      return { label: L(`Corriger ${reelles.length} position(s) de mes parties`, `Fix ${reelles.length} position(s) from my games`), run: () => this.runReelles() };
    }
    const dues = board.fiches.filter((f) => f.due > 0 && actifs.includes(f.rep) && canOpenFiche(f.id));
    if (pro && dues.length) {
      const ids = dues.sort((a, b) => b.due - a.due).slice(0, 3).map((f) => f.id);
      const n = dues.reduce((a, f) => a + f.due, 0);
      return { label: L(`Réviser ${n} position(s) à revoir`, `Review ${n} position(s) due`), run: () => this.runDrill('lignes', ids, { preset: { complet: '0', lTemps: 0, lRepet: 1 } }) };
    }
    for (const rep of actifs) {
      const e = this.ordreCours(rep).list.find((x) => !p.cours?.[x.id] && canOpenFiche(x.id));
      if (e) return { label: L(`Apprendre : ${e.nom}`, `Learn: ${e.nom}`), run: () => this.openLesson(e.id) };
    }
    if (pro) {
      const ids = pickFiches({ fiches: board.fiches.filter((f) => actifs.includes(f.rep)) }, { n: 3 });
      if (ids.length) return { label: L('Réviser mes variantes les plus faibles', 'Review my weakest lines'), run: () => this.runDrill('lignes', ids, { preset: { complet: '0', lTemps: 0, lRepet: 1 } }) };
    }
    return { label: L('Débloquer toutes les variantes avec Pro', 'Unlock every line with Pro'), run: () => { this.renderSetup(); openPaywall(); } };
  }

  // ---------- Écran de départ ----------

  // Répertoires choisis qui ont des fiches (les autres sont « bientôt »).
  actifs() { return this.data.choisis.filter((id) => this.data.entries.some((e) => e.rep === id)); }
  bientot() { return this.data.choisis.filter((id) => !this.data.entries.some((e) => e.rep === id)); }

  renderSetup() {
    this.lesson = null;
    const actifs = this.actifs();
    if (!actifs.length) { this.renderEmpty(); return; }
    if (this.view === 'cours') { this.renderCourse(actifs.includes(this.courseRep) ? this.courseRep : actifs[0]); return; }
    const p = this.prefs;
    if (!actifs.includes(p.rep)) p.rep = actifs[0];
    for (const k of ['lRep', 'tRep']) if (p[k] && !actifs.includes(p[k])) p[k] = '';
    const bientot = this.bientot();
    const hasLichess = !!this.client.explorerMode();
    this.progress = loadProgress();
    const board = dashboard(this.data, this.revision, this.progress);
    const nTrash = this.data.entries.filter((e) => trashDrill(e, this.data.repertoires[e.rep].couleur)).length;
    const repSel = (attr, cur) => `<select data-p="${attr}"><option value="" ${!cur ? 'selected' : ''}>${actifs.length > 1 ? L('Tous mes répertoires', 'All my repertoires') : esc(REPERTOIRES[actifs[0]].titre)}</option>${actifs.length > 1 ? actifs.map((id) => `<option value="${id}" ${cur === id ? 'selected' : ''}>${esc(REPERTOIRES[id].titre)}</option>`).join('') : ''}</select>`;
    const opt = (attr, vals, cur, fmt = (v) => v) => `<select data-p="${attr}">${vals.map((v) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${fmt(v)}</option>`).join('')}</select>`;
    const next = (rep) => this.ordreCours(rep).list.find((e) => !this.progress.cours?.[e.id] && canOpenFiche(e.id));
    const seen = (rep) => this.data.entries.filter((e) => e.rep === rep && this.progress.cours?.[e.id]).length;
    const total = (rep) => this.data.entries.filter((e) => e.rep === rep).length;
    const reelles = vraiesErreurs(this.progress);
    const lock = isPro() ? '' : ' <span class="lock-badge">🔒 Pro</span>';
    const nSort = reelles.filter((x) => x.kind === 'sortie').length;
    const suite = this.prochaineAction();
    const zone = ['apprendre', 'entrainer', 'reflexes', 'plus'].includes(p.zone) ? p.zone : 'apprendre';
    const tuile = (id, ico, t, sous) => `<button type="button" class="tuile" data-tuile="${id}" aria-pressed="${zone === id}"><span class="tuile-ico" aria-hidden="true">${ico}</span><strong>${t}</strong><span class="small muted">${sous}</span></button>`;
    this.el.innerHTML = `<div class="train-hub" data-zone-actif="${zone}">
      <section class="card continuer">
        <button type="button" class="pro-cta" data-continuer>${L('▶ Continuer', '▶ Continue')}</button>
        <p class="small"><span class="muted">${L('Prochaine étape :', 'Next step:')}</span> <strong>${esc(suite.label)}</strong></p>
      </section>
      ${this.routineHtml(board, next, seen)}
      <section class="card hub-head">
        <div class="hub-stats">
          <div><span class="hub-big">🔥 ${board.streak}</span><span class="muted small">${L('jour(s) d’affilée', 'day(s) in a row')}</span></div>
          ${actifs.map((id) => `<div><span class="hub-big">${board.byRep[id].pct} %</span><span class="muted small">${esc(REPERTOIRES[id].titre)}</span></div>`).join('')}
          <div><span class="hub-big">${actifs.reduce((a, id) => a + board.byRep[id].due, 0)}</span><span class="muted small">${L('position(s) à revoir', 'position(s) to review')}</span></div>
        </div>
      </section>
      <p class="hub-prog"><a class="btn-like" href="#/progression" data-lien-progression>${L('📈 Ma progression', '📈 My progress')}</a> <span class="muted small">${L('classements, routine et entraînement sur 4 semaines', 'ratings, routine and training over 4 weeks')}</span></p>
      <nav class="tuiles" aria-label="${L('Sections de l’entraînement', 'Training sections')}">
        ${tuile('apprendre', '📖', L('Apprendre', 'Learn'), L('leçons pas à pas', 'step-by-step lessons'))}
        ${tuile('entrainer', '📚', L('S’entraîner', 'Practise'), L('de mémoire, mes erreurs', 'from memory, my mistakes'))}
        ${tuile('reflexes', '⚡', L('Réflexes', 'Reflexes'), L('Rush et anti-trash', 'Rush and anti-trash'))}
        ${tuile('plus', '🧩', L('Plus', 'More'), L('problèmes, finales, Stockfish', 'puzzles, endgames, Stockfish'))}
      </nav>
      <div class="hub-grid">
        <section class="card hub-card hub-learn" data-zone="apprendre">
          <h2>${L('📖 Apprendre', '📖 Learn')}</h2>
          ${isPro() ? '' : L('<p class="small"><strong>Gratuit :</strong> une leçon de base par ouverture. Les autres leçons sont dans BlitzRefute Pro.</p>', '<p class="small"><strong>Free:</strong> one basic lesson per opening. The other lessons are in BlitzRefute Pro.</p>')}
          <p class="small">${L('Des leçons pas à pas : le nom de chaque variante, les coups expliqués un par un, ce qu’il faut retenir, puis vous rejouez la ligne avec des indices.', 'Step-by-step lessons: the name of each line, the moves explained one by one, what to remember, then you replay the line with hints.')}</p>
          <div class="hub-courses">
            ${actifs.map((rep) => {
              const n = next(rep);
              return `<button type="button" class="hub-course" data-course="${rep}">
                <strong>${repLabel(rep, { camp: false })}</strong>
                <span class="small muted">${seen(rep)} / ${total(rep)} ${L('leçon(s) suivie(s)', 'lesson(s) done')}</span>
                ${n ? `<span class="small">${L(`Prochaine : ${esc(n.nom)}`, `Next: ${esc(n.nom)}`)}</span>` : `<span class="small">${L('Toutes les leçons sont suivies ✔', 'All lessons done ✔')}</span>`}
              </button>`;
            }).join('')}
            ${bientot.map((rep) => `<div class="hub-course soon" aria-disabled="true"><strong>${repLabel(rep, { camp: false })}</strong><span class="small muted">${L('Fiches en préparation — bientôt', 'Lines in preparation — coming soon')}</span></div>`).join('')}
          </div>
        </section>
        <section class="card hub-card" data-zone="entrainer">
          <h2>${L('📚 S’entraîner', '📚 Practise')}${lock}</h2>
          <p class="small">${L('L’application joue l’adversaire, vous jouez la théorie de mémoire. Erreur : le plan et le bon coup, et la position revient en fin de séance.', 'The app plays the opponent, you play the theory from memory. Mistake: the plan and the right move, and the position comes back at the end of the session.')}</p>
          <div class="actions"><button type="button" class="primary" data-lines>${L('Commencer', 'Start')}</button></div>
          <details class="hub-reglages"><summary class="small">${L(`⚙ Réglages : ${p.lN} lignes`, `⚙ Settings: ${p.lN} lines`)} · ${p.complet === '0' ? L('fiche seule', 'line only') : L('ligne complète', 'full line')} · ${Number(p.lTemps) ? L(`${p.lTemps} s par coup`, `${p.lTemps} s per move`) : L('temps libre', 'no time limit')}${Number(p.lRepet) > 1 ? ` · ${L(`${p.lRepet} fois sans faute`, `${p.lRepet} times without a mistake`)}` : ''}</summary>
          <label class="row">${L('Répertoire', 'Repertoire')} ${repSel('lRep', p.lRep)}</label>
          <label class="row">${L('Lignes', 'Lines')} ${opt('lN', [3, 5, 8], p.lN)}</label>
          <label class="row">${L('Longueur', 'Length')} ${opt('complet', ['1', '0'], p.complet, (v) => (v === '1' ? L('Complète (jusqu’au 15e coup)', 'Full (up to move 15)') : L('Fiche seule', 'Line only')))}</label>
          <label class="row">${L('Temps par coup', 'Time per move')} ${opt('lTemps', [0, 10, 5, 3], p.lTemps, (v) => (Number(v) ? L(`${v} s (rythme Blitz)`, `${v} s (Blitz pace)`) : L('Libre', 'Unlimited')))}</label>
          <label class="row">${L('Répétitions', 'Repetitions')} ${opt('lRepet', [1, 3], p.lRepet, (v) => (Number(v) > 1 ? L(`Jusqu’à ${v} fois d’affilée sans faute`, `Up to ${v} times in a row without a mistake`) : L('1 fois', 'Once')))}</label>
          </details>
        </section>
        <section class="card hub-card hub-rush" data-zone="reflexes">
          <h2>${L('⚡ Rush réfutations', '⚡ Refutation rush')}</h2>
          <p class="small">${L('Les coups douteux de tes ouvertures s’enchaînent : punis-les avant la fin du chrono, qui raccourcit à chaque réussite. 3 vies. Bats ton record !', 'Dubious moves from your openings come one after another: punish them before the clock runs out; it gets shorter with every success. 3 lives. Beat your best!')}</p>
          <p class="small"><strong>${L(`🏆 Record : ${chargerRush().best}`, `🏆 Best: ${chargerRush().best}`)}</strong> <span class="muted">· ${L(`${this.idsRush().length} réfutation(s) disponibles`, `${this.idsRush().length} refutation(s) available`)}</span></p>
          <div class="actions"><button type="button" class="primary" data-rush>${L('⚡ Jouer', '⚡ Play')}</button></div>
        </section>
        <section class="card hub-card" data-zone="reflexes">
          <h2>${L('⏱ Réflexes anti-trash', '⏱ Anti-trash reflexes')}${lock}</h2>
          <p class="small">${L(`Un coup douteux de blitz est joué : enchaînez la punition avant la fin du chrono. ${nTrash} exercices.`, `A dubious blitz move is played: find the punishment before the clock runs out. ${nTrash} exercises.`)}</p>
          <div class="actions"><button type="button" class="primary" data-trash>${L('Commencer', 'Start')}</button></div>
          <details class="hub-reglages"><summary class="small">${L(`⚙ Réglages : ${p.tN} exercices · ${p.tTime} s`, `⚙ Settings: ${p.tN} exercises · ${p.tTime} s`)}</summary>
          <label class="row">${L('Répertoire', 'Repertoire')} ${repSel('tRep', p.tRep)}</label>
          <label class="row">${L('Exercices', 'Exercises')} ${opt('tN', [5, 10, 20], p.tN)}</label>
          <label class="row">${L('Temps', 'Time')} ${opt('tTime', [10, 20, 30], p.tTime, (v) => `${v} s`)}</label>
          </details>
        </section>
      </div>
      <div data-zone="plus">
      ${this.problemesHtml()}
      ${this.finalesHtml()}
      ${this.stockfishHtml()}
      </div>
      <section class="card hub-card hub-real" data-reelles data-zone="entrainer">
        <h2>${L('🎯 Positions de mes parties', '🎯 Positions from my games')}${lock}</h2>
        ${reelles.length ? `<p class="small">${L(`<strong>${reelles.length}</strong> position(s) tirée(s) de vos parties Lichess / Chess.com : ${nSort} sortie(s) de répertoire, ${reelles.length - nSort} punition(s) manquée(s). Retrouvez le bon coup : une position validée sort de la liste.`, `<strong>${reelles.length}</strong> position(s) from your Lichess / Chess.com games: ${nSort} repertoire exit(s), ${reelles.length - nSort} missed punishment(s). Find the right move: a solved position leaves the list.`)}</p>
        <ul class="small real-list">${reelles.slice(0, 3).map((x) => `<li>${esc(x.date ? new Date(x.date).toLocaleDateString(LOC) : '')}${x.opp ? ` · ${L('contre', 'vs')} ${esc(x.opp)}` : ''} · ${x.kind === 'punition' ? L('punition manquée', 'missed punishment') : L('sortie du répertoire', 'left the repertoire')}${x.ficheNom ? L(` (« ${esc(x.ficheNom)} »)`, ` (“${esc(x.ficheNom)}”)`) : ''}</li>`).join('')}</ul>
        <div class="actions"><button type="button" class="primary" data-real>${L('Rejouer ces positions', 'Replay these positions')}</button></div>`
    : L('<p class="small muted">Aucune position à corriger pour l’instant. Quand, dans tes parties Lichess / Chess.com (onglet « Mes parties »), tu sors de tes fiches ou laisses passer une punition prévue, la position arrive ici.</p>', '<p class="small muted">No position to fix yet. When, in your Lichess / Chess.com games (“My games” tab), you leave your lines or miss a planned punishment, the position shows up here.</p>')}
      </section>
      <details class="card hub-dash" data-zone="entrainer" data-dashboard ${this.dashOpen ? 'open' : ''}><summary><strong>${L('📊 Progression par variante', '📊 Progress by line')}</strong> <span class="muted small">${L('(maîtrise, positions à revoir)', '(mastery, positions to review)')}</span></summary>${this.dashboardHtml(board)}</details>
      <details class="card hub-other" data-zone="plus" data-other-modes>
        <summary>${L('Autres modes : partie contre l’adversaire, positions isolées', 'Other modes: game against the opponent, single positions')}</summary>
        <div class="train-setup">
          <p class="small">${L('L’application joue l’adversaire ; à vous de trouver le coup de votre répertoire, sans aide. Chaque coup est vérifié (fiche ou Stockfish).', 'The app plays the opponent; you find your repertoire move, without help. Every move is checked (line or Stockfish).')}</p>
      <label class="row">${L('Répertoire', 'Repertoire')}
        <select data-p="rep">
          ${actifs.map((id) => `<option value="${id}" ${p.rep === id ? 'selected' : ''}>${esc(REPERTOIRES[id].titre)} (${L('vous avez les', 'you play')} ${couleurDe(id) === 'w' ? L('Blancs', 'White') : L('Noirs', 'Black')})</option>`).join('')}
        </select>
      </label>
      <label class="row">Mode
        <select data-p="mode">
          <option value="partie" ${p.mode !== 'revision' ? 'selected' : ''}>${L('Partie contre l’adversaire', 'Game against the opponent')}</option>
          <option value="revision" ${p.mode === 'revision' ? 'selected' : ''}>${L('Révision espacée (positions à revoir)', 'Spaced repetition (positions to review)')}</option>
        </select>
      </label>
      <p class="small" data-rev-stats>${this.revisionLine(p.rep)}</p>
      <label class="row">${L('Coups de l’adversaire', 'Opponent’s moves')}
        <select data-p="source">
          <option value="lichess" ${p.source === 'lichess' ? 'selected' : ''} ${hasLichess ? '' : 'disabled'}>${L('Parties réelles Lichess', 'Real Lichess games')} (${esc(this.filterLabel())})</option>
          <option value="fiches" ${p.source === 'fiches' || !hasLichess ? 'selected' : ''}>${L('Lignes des fiches seulement', 'Repertoire lines only')}</option>
        </select>
      </label>
      ${hasLichess ? '' : L('<p class="muted small">Pour des adversaires tirés des vraies parties de votre niveau, ajoutez votre jeton Lichess (⚙).</p>', '<p class="muted small">For opponents drawn from real games at your level, add your Lichess token (⚙).</p>')}
      <label class="row">${L('Nombre de vos coups', 'Number of your moves')} <span class="muted small">${L('(ou de positions en révision)', '(or of positions in review)')}</span>
        <select data-p="length">${[5, 8, 12, 16].map((n) => `<option value="${n}" ${Number(p.length) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <p class="muted small">${L('Le filtre de niveau se règle dans « Coup optimal », page Moteur.', 'The level filter is set in “Best move”, Engine page.')}</p>
                  <div class="actions"><button type="button" class="primary" data-start>${L('Commencer', 'Start')}</button></div>
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
    this.bindRoutine(need(L('L’entraînement en répétition espacée', 'Spaced-repetition practice'), () => {
      // Seulement des variantes déjà apprises ; rythme Blitz uniquement si elles sont maîtrisées.
      const plan = planTheorie(board, this.progress.cours, { peut: canOpenFiche });
      this.runDrill('lignes', plan.ids, { preset: plan.rapide ? { complet: '0', lTemps: 5, lRepet: 1 } : { complet: '0', lTemps: 0, lRepet: 1, apercu: true } });
    }));
    this.el.querySelector('[data-rush]')?.addEventListener('click', () => this.lancerRush());
    // Tuiles : une seule section affichée à la fois (choix mémorisé).
    this.el.querySelectorAll('[data-tuile]').forEach((b) => b.addEventListener('click', () => this.montrerZone(b.dataset.tuile)));
    this.el.querySelector('[data-continuer]')?.addEventListener('click', () => this.executerDemande({ type: 'continuer' }));
    this.el.querySelector('[data-start]').addEventListener('click', need(L('Ce mode d’entraînement', 'This training mode'), () => this.start()));
    this.el.querySelectorAll('[data-finale-id]').forEach((b) => b.addEventListener('click', () => {
      const f = FINALES.find((x) => x.id === b.dataset.finaleId);
      if (!f) return;
      if (!f.gratuit && !isPro()) { openPaywall({ reason: L(`La finale « ${f.titre} »`, `The endgame “${f.titre}”`) }); return; }
      this.runFinale(f);
    }));
    this.bindProblemes();
    this.bindStockfish();
    this.el.querySelector('[data-real]')?.addEventListener('click', need(L('« Positions de mes parties »', '“Positions from my games”'), () => this.runReelles()));
    this.el.querySelectorAll('[data-course]').forEach((b) => b.addEventListener('click', () => { this.view = 'cours'; this.courseRep = b.dataset.course; this.renderSetup(); window.scrollTo(0, 0); }));
    this.el.querySelector('[data-lines]').addEventListener('click', need(L('L’entraînement en répétition espacée', 'Spaced-repetition practice'), () => {
      this.runDrill('lignes', pickFiches(board, { rep: this.prefs.lRep || null, n: Number(this.prefs.lN) || 3 }));
    }));
    const trashIds = (rep) => pickFiches(board, { rep, n: 999, needPunition: true })
      .filter((id) => { const e = this.data.entries.find((x) => x.id === id); return trashDrill(e, this.data.repertoires[e.rep].couleur); });
    this.el.querySelector('[data-trash]').addEventListener('click', need(L('Le module Réflexes anti-trash', 'The anti-trash reflexes module'), () => {
      this.runDrill('trash', shuffle(trashIds(this.prefs.tRep || null)).slice(0, Number(this.prefs.tN) || 5), { timeLimit: Number(this.prefs.tTime) || 10 });
    }));
    this.el.querySelectorAll('[data-dash-line]').forEach((b) => b.addEventListener('click', need(L('La révision des lignes', 'Line review'), () => this.runDrill('lignes', [b.dataset.dashLine]))));
    this.el.querySelectorAll('[data-dash-trash]').forEach((b) => b.addEventListener('click', need(L('Le drill de punition', 'The punishment drill'), () => this.runDrill('trash', [b.dataset.dashTrash], { timeLimit: Number(this.prefs.tTime) || 10 }))));
    this.el.querySelectorAll('[data-dash-lesson]').forEach((b) => b.addEventListener('click', () => this.openLesson(b.dataset.dashLesson)));
    const dash = this.el.querySelector('[data-dashboard]');
    dash?.addEventListener('toggle', () => { this.dashOpen = dash.open; });
    this.el.querySelectorAll('[data-dash-rep]').forEach((b) => b.addEventListener('click', () => {
      this.dashRep = b.dataset.dashRep;
      this.dashOpen = true;
      this.renderSetup();
      this.el.querySelector('[data-dashboard]').scrollIntoView({ block: 'start' });
    }));
  }

  // Aucune ouverture choisie n'a encore de fiche : on le dit, sans rien inventer.
  renderEmpty() {
    const b = this.bientot();
    this.el.innerHTML = `<div class="train-hub"><section class="card hub-empty" data-empty>
      <h2>${L('📖 Entraînement', '📖 Training')}</h2>
      <p>${L(`Les fiches de ${b.length > 1 ? 'vos ouvertures' : 'votre ouverture'} (${b.map((id) => esc(REPERTOIRES[id].titre)).join(', ')}) sont en préparation : chaque ligne y sera vérifiée par Stockfish avant publication.`, `The lines for ${b.length > 1 ? 'your openings' : 'your opening'} (${b.map((id) => esc(REPERTOIRES[id].titre)).join(', ')}) are being prepared: each line will be checked by Stockfish before publication.`)}</p>
      <p class="small muted">${L('En attendant : le Moteur d’analyse et Mes parties marchent pour toutes les ouvertures, et vous pouvez ajouter une ouverture déjà prête (Gambit Dame, Caro-Kann).', 'Meanwhile: the analysis Engine and My games work for every opening, and you can add an opening that is already available (Queen’s Gambit, Caro-Kann).')}</p>
      <div class="actions"><a class="btn-like primary" href="#/ouvertures">${L('Modifier mes ouvertures', 'Change my openings')}</a><a class="btn-like" href="#/moteur">${L('Ouvrir le Moteur', 'Open the Engine')}</a></div>
    </section></div>`;
  }

  // ---------- Module Apprendre (cours) ----------

  // Ordre du cours : « les plus jouées d'abord » (données Élite) par défaut quand le répertoire en a,
  // sinon l'ordre conseillé (théorie, pièges, coups loufoques).
  ordreCours(rep) {
    const freq = courseOrderFreq(this.data.entries, rep);
    if (this.prefs.cOrdre === 'revoir') {
      // « À revoir d'abord » : variantes à revoir (mes vraies parties), puis les autres jouées, puis le reste.
      const b = bilanFiches(this.progress || loadProgress());
      const rang = (e) => ({ revoir: 0, neutre: 1, solide: 2 }[b[e.id]?.etat] ?? 3);
      const base = freq || courseOrder(this.data.entries, rep);
      const list = base.map((e, i) => ({ e, i })).sort((x, y) => rang(x.e) - rang(y.e) || (b[y.e.id]?.d ?? 0) - (b[x.e.id]?.d ?? 0) || x.i - y.i).map((x) => x.e);
      return { list, parFreq: false, revoir: true, dispo: !!freq };
    }
    const parFreq = !!freq && this.prefs.cOrdre !== 'conseil';
    return { list: parFreq ? freq : courseOrder(this.data.entries, rep), parFreq, dispo: !!freq };
  }

  renderCourse(rep) {
    this.progress = loadProgress();
    const board = dashboard(this.data, this.revision, this.progress);
    const byId = Object.fromEntries(board.fiches.map((f) => [f.id, f]));
    const { list, parFreq, dispo, revoir } = this.ordreCours(rep);
    const bilan = bilanFiches(this.progress);
    const joues = list.filter((e) => bilan[e.id]);
    const aRevoir = joues.filter((e) => bilan[e.id].etat === 'revoir');
    const solides = joues.filter((e) => bilan[e.id].etat === 'solide');
    const next = list.find((e) => !this.progress.cours?.[e.id] && canOpenFiche(e.id));
    const groups = [];
    if (revoir) groups.push({ g: L('Mes points faibles d’abord (d’après mes parties)', 'My weak spots first (from my games)'), items: list });
    else if (parFreq) groups.push({ g: L('Les plus jouées d’abord', 'Most played first'), items: list });
    else {
      for (const e of list) {
        const g = `${e.badge === 'theorie' ? '' : `${({ piege: L('Pièges', 'Traps'), loufoque: L('Coups loufoques à punir', 'Odd moves to punish') })[e.badge]} · `}${e.famille}`;
        if (!groups.length || groups.at(-1).g !== g) groups.push({ g, items: [] });
        groups.at(-1).items.push(e);
      }
    }
    const src = this.data.frequences;
    let n = 0;
    this.el.innerHTML = `<div class="course">
      <div class="lesson-top">
        <button type="button" class="small-btn" data-back>${L('← Accueil Entraînement', '← Training home')}</button>
        <div class="chips">${this.actifs().map((r) => `<button type="button" class="chip" data-crep="${r}" aria-pressed="${r === rep}">${repLabel(r)}</button>`).join('')}</div>
      </div>
      <h2>${L(`📖 Cours : ${esc(REPERTOIRES[rep].titre)} avec les`, `📖 Course: ${esc(REPERTOIRES[rep].titre)} with`)} ${couleurDe(rep) === 'w' ? L('Blancs', 'White') : L('Noirs', 'Black')}</h2>
      <div class="chips" role="group" aria-label="${L('Ordre des leçons', 'Lesson order')}">${dispo ? `<button type="button" class="chip" data-cordre="freq" aria-pressed="${parFreq}">${L('📊 Les plus jouées d’abord', '📊 Most played first')}</button>` : ''}<button type="button" class="chip" data-cordre="revoir" aria-pressed="${!!revoir}">${L('⚠ Mes points faibles d’abord', '⚠ My weak spots first')}</button><button type="button" class="chip" data-cordre="conseil" aria-pressed="${!parFreq && !revoir}">${L('Ordre conseillé', 'Recommended order')}</button></div>
      <div class="card mes-variantes" data-mes-variantes>${joues.length
        ? `<p class="small"><strong>${L(`🎮 D’après mes ${joues.reduce((a, e) => a + bilan[e.id].n, 0)} partie(s) dans ces variantes :`, `🎮 Based on my ${joues.reduce((a, e) => a + bilan[e.id].n, 0)} game(s) in these lines:`)}</strong></p>
          ${aRevoir.length ? `<p class="small">${L('⚠ <strong>À revoir :</strong>', '⚠ <strong>To review:</strong>')} ${aRevoir.map((e) => `<button type="button" class="link-btn" data-lesson="${e.id}">${esc(e.nom)}</button>`).join(', ')}</p>` : L('<p class="small">Aucune variante à revoir pour l’instant 👍</p>', '<p class="small">No line to review for now 👍</p>')}
          ${solides.length ? `<p class="small">${L('✅ <strong>Solides :</strong>', '✅ <strong>Solid:</strong>')} ${solides.map((e) => esc(e.nom)).join(', ')}</p>` : ''}
          <p class="muted tiny">${L('« À revoir » : tu es sorti de la fiche, tu as raté une punition prévue, ou tu as perdu plus de 60 % des points sur 2 parties ou plus. Une défaite ne vient pas forcément de l’ouverture.', '“To review”: you left the line, missed a planned punishment, or lost more than 60% of the points over 2 or more games. A loss does not necessarily come from the opening.')}</p>`
        : L('<p class="small muted">🎮 Importe tes parties dans « Mes parties » : chaque variante affichera ici tes résultats (gagnées, perdues, sorties de fiche).</p>', '<p class="small muted">🎮 Import your games in “My games”: each line will show your results here (won, lost, left the line).</p>')}</div>
      <p class="small muted">${parFreq ? L(`Classées par fréquence réelle : nombre de parties du top blitz/rapide (Lichess, Chess.com, tournois) où le coup qui définit la variante a été joué${src ? `, données du ${esc(new Date(src.date).toLocaleDateString(LOC))}` : ''}. Fréquence observée, pas une évaluation ; à votre niveau, les coups loufoques sont plus fréquents qu’au top.`, `Sorted by real frequency: number of top blitz/rapid games (Lichess, Chess.com, tournaments) in which the move that defines the line was played${src ? `, data from ${esc(new Date(src.date).toLocaleDateString(LOC))}` : ''}. Observed frequency, not an evaluation; at your level, odd moves are more frequent than at the top.`) : (revoir ? L('Les variantes à revoir d’après mes vraies parties en tête, puis celles jouées sans souci, puis les autres.', 'Lines to review based on my real games first, then those played without trouble, then the others.') : L('Dans l’ordre conseillé : la théorie principale d’abord, puis les pièges et les coups loufoques.', 'In the recommended order: main theory first, then traps and odd moves.'))} ${L('Chaque leçon : présentation → les coups un par un → à retenir → à vous.', 'Each lesson: introduction → the moves one by one → key points → your turn.')}</p>
      ${groups.map(({ g, items }) => `<h3 class="course-group">${esc(g)}</h3><ol class="course-list" start="${n + 1}">${items.map((e) => {
        n++;
        const f = byId[e.id];
        const isNext = next?.id === e.id;
        return `<li class="course-item ${isNext ? 'next' : ''}">
          <div class="course-main"><span class="badge eco">${esc(e.eco)}</span> <strong>${esc(e.nom)}</strong>
            ${bilan[e.id] ? (() => { const b = bilan[e.id]; return `<div class="small var-bilan ${b.etat}" data-bilan="${e.id}">${{ revoir: L('⚠ À revoir', '⚠ To review'), solide: L('✅ Solide', '✅ Solid'), neutre: '🎮' }[b.etat]} · ${L(`${b.n} partie(s) : ${b.v} V · ${b.nul} N · ${b.d} D`, `${b.n} game(s): ${b.v} W · ${b.nul} D · ${b.d} L`)}${b.sorties ? L(` · ${b.sorties} sortie(s) de fiche`, ` · left the line ${b.sorties} time(s)`) : ''}${b.punitions ? L(` · ${b.punitions} punition(s) ratée(s)`, ` · ${b.punitions} missed punishment(s)`) : ''}</div>${this.mesPartiesHtml(e)}`; })() : ''}
            <div class="small muted">${this.progress.cours?.[e.id] ? L('📖 Leçon suivie', '📖 Lesson done') : isNext ? L('👉 Prochaine leçon conseillée', '👉 Recommended next lesson') : L('Pas encore vue', 'Not seen yet')} · ${L('maîtrise', 'mastery')} ${f.pct} %${e.freq ? ` · <span class="freq" title="${L(`Parties du top où ${esc(e.freq.coup)} a été joué dans cette position`, `Top games in which ${esc(e.freq.coup)} was played in this position`)}">${L(`📊 ${e.freq.n} partie(s) du top`, `📊 ${e.freq.n} top game(s)`)}</span>` : (parFreq ? L(' · 📊 rare au top', ' · 📊 rare at the top') : '')}</div></div>
          <div class="dash-bar"><span style="width:${f.pct}%" class="${f.pct >= 80 ? 'hi' : f.pct >= 40 ? 'mid' : 'lo'}"></span></div>
          <button type="button" class="${isNext ? 'primary' : ''} small-btn" data-lesson="${e.id}">${!canOpenFiche(e.id) ? '🔒 Pro' : this.progress.cours?.[e.id] ? L('Revoir', 'Review') : L('Commencer', 'Start')}</button>
        </li>`;
      }).join('')}</ol>`).join('')}
    </div>`;
    this.el.querySelector('[data-back]').addEventListener('click', () => { this.view = null; this.renderSetup(); window.scrollTo(0, 0); });
    this.el.querySelectorAll('[data-crep]').forEach((b) => b.addEventListener('click', () => { this.courseRep = b.dataset.crep; this.renderCourse(this.courseRep); }));
    this.el.querySelectorAll('[data-replay]').forEach((b) => b.addEventListener('click', () => this.openLesson(b.dataset.replayFiche, { cmpGameId: b.dataset.replay })));
    this.el.querySelectorAll('[data-cordre]').forEach((b) => b.addEventListener('click', () => {
      this.prefs.cOrdre = b.dataset.cordre;
      try { localStorage.setItem(PREFS, JSON.stringify(this.prefs)); } catch { /* stockage plein */ }
      this.renderCourse(rep);
    }));
    this.el.querySelectorAll('[data-lesson]').forEach((b) => b.addEventListener('click', () => this.openLesson(b.dataset.lesson)));
  }

  // cmpGameId : ouvrir directement la comparaison avec cette partie (étape « Les coups »).
  openLesson(id, { cmpGameId = null } = {}) {
    const entry = this.data.entries.find((e) => e.id === id);
    if (!entry) return;
    if (!canOpenFiche(id)) { openPaywall({ reason: L(`La leçon « ${entry.nom} »`, `The lesson “${entry.nom}”`) }); return; }
    this.s = null;
    this.view = 'cours';
    this.courseRep = entry.rep;
    window.scrollTo(0, 0);
    this.lesson = new LessonView({
      el: this.el, data: this.data, entry, complet: false, cmpGameId, // la leçon enseigne la ligne de la fiche
      mesParties: ((this.progress || loadProgress()).parties || []).filter((x) => x.ficheId === entry.id && x.san?.length).sort((a, b) => String(b.date).localeCompare(String(a.date))),
      onClose: () => { this.lesson = null; this.renderSetup(); },
      onPractice: (fid) => this.runDrill('lignes', [fid], {
        guided: true,
        preset: { complet: '0' }, // même longueur que la leçon
        then: () => {
          const p = loadProgress();
          recordLesson(p, fid);
          saveProgress(p);
          this.renderCourse(entry.rep);
          const e2 = this.data.entries.find((e) => e.id === fid);
          const drill = trashDrill(e2, this.data.repertoires[e2.rep].couleur);
          this.el.querySelector('.course').insertAdjacentHTML('afterbegin', `<div class="hub-result">${L(`Leçon « ${esc(e2.nom)} » terminée ✔ Elle reviendra dans vos révisions (module S’entraîner).`, `Lesson “${esc(e2.nom)}” completed ✔ It will come back in your reviews (Practise module).`)}
            ${drill ? `<button type="button" class="small-btn" data-after-drill="${fid}">${L('⏱ Tester la punition', '⏱ Test the punishment')}</button>` : ''}</div>`);
          this.el.querySelector('[data-after-drill]')?.addEventListener('click', () => (isPro() ? this.runDrill('trash', [fid], { timeLimit: 20 }) : openPaywall({ reason: L('Le drill de punition', 'The punishment drill') })));
        },
      }),
    });
  }

  // ---------- Rush réfutations ----------

  // Positions du Rush : punitions des fiches ouvertes (formule gratuite : variantes gratuites).
  idsRush() {
    return this.data.entries.filter((e) => this.actifs().includes(e.rep) && canOpenFiche(e.id) && trashDrill(e, this.data.repertoires[e.rep].couleur)).map((e) => e.id);
  }

  lancerRush() {
    const ids = this.idsRush();
    if (!ids.length) { openPaywall({ reason: L('Le Rush réfutations sur tes ouvertures', 'The refutation rush on your openings') }); return; }
    this.runDrill('trash', ids, { rush: true });
    window.scrollTo(0, 0);
  }

  finRush(score) {
    const r = enregistrerRush(score);
    this.renderSetup();
    const plus = isPro() ? '' : L(' Avec Pro : toutes les réfutations de tes ouvertures dans le Rush.', ' With Pro: every refutation of your openings in the rush.');
    const msg = r.record
      ? L(`⚡ Rush : ${score} — nouveau record 🏆 (avant : ${r.avant}).`, `⚡ Rush: ${score} — new personal best 🏆 (before: ${r.avant}).`)
      : L(`⚡ Rush : ${score} (record : ${r.best}).`, `⚡ Rush: ${score} (best: ${r.best}).`);
    this.el.querySelector('.hub-head')?.insertAdjacentHTML('afterbegin', `<p class="hub-result">${esc(msg + plus)} <button type="button" class="small-btn" data-rush-encore>${L('Rejouer', 'Play again')}</button></p>`);
    this.el.querySelector('[data-rush-encore]')?.addEventListener('click', () => this.lancerRush());
  }

  // ---------- Modules Lignes / Anti-trash ----------

  // preset : réglages imposés pour cette séance seulement (ex. routine du jour).
  runDrill(kind, ids, { timeLimit = 10, then = null, guided = false, preset = null, rush = false } = {}) {
    if (!ids.length) { this.renderSetup(); return; }
    this.s = null;
    const tree = Object.fromEntries(this.actifs().map((r) => [r, buildTree(this.data.entries, r)]));
    const p = { ...this.prefs, ...preset };
    this.drill = new DrillRunner({
      el: this.el, data: this.data, kind, ids, tree, timeLimit, guided, engine: this.engine, rush,
      complet: p.complet !== '0',
      tempsCoup: kind === 'lignes' && !guided ? Number(p.lTemps) || 0 : 0,
      repeter: kind === 'lignes' && !guided ? Number(p.lRepet) || 1 : 1,
      apercu: kind === 'lignes' && !guided && !!p.apercu,
      progress: this.progress || loadProgress(),
      gradePos: (rep, k, ok) => this.gradePos(rep, k, ok),
      onDone: (r) => {
        this.drill = null;
        if (then && r.total) { then(); return; }
        this.lastResult = r;
        this.view = null;
        if (r.rush) { this.finRush(r.rush.score); return; }
        this.renderSetup();
        const msg = r.kind === 'trash'
          ? L(`Drill terminé : ${r.ok} / ${r.total} punition(s) réussie(s)${r.best ? `, meilleur temps ${(r.best / 1000).toFixed(1).replace('.', ',')} s` : ''}.`, `Drill finished: ${r.ok} / ${r.total} punishment(s) found${r.best ? `, best time ${(r.best / 1000).toFixed(1)} s` : ''}.`)
          : L(`Lignes terminées : ${r.ok} / ${r.total} sans faute.`, `Lines finished: ${r.ok} / ${r.total} without a mistake.`);
        this.el.querySelector('.hub-head').insertAdjacentHTML('afterbegin', `<p class="hub-result">${esc(msg)}</p>`);
      },
    });
  }

  // Mes vraies parties dans une variante : résultat, coup où la partie quitte la fiche, relecture.
  mesPartiesHtml(e) {
    const list = (this.progress.parties || []).filter((x) => x.ficheId === e.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!list.length) return '';
    const res = { victoire: L('✅ gagnée', '✅ won'), défaite: L('❌ perdue', '❌ lost'), nulle: L('½ nulle', '½ draw') };
    const ecart = (x) => {
      if (x.ecart == null) return '';
      const no = `${Math.floor(x.ecart / 2) + 1}${x.ecart % 2 ? '…' : '.'}`;
      return x.sortie ? L(` · je quitte la fiche au coup ${no}`, ` · I leave the line on move ${no}`) : x.ecart >= e.uci.length ? L(' · fiche suivie jusqu’au bout', ' · line followed to the end') : L(` · l’adversaire quitte la fiche au coup ${no}`, ` · the opponent leaves the line on move ${no}`);
    };
    return `<details class="mes-parties-var" data-mes-parties="${e.id}"><summary class="small">${L('🎮 Mes parties dans cette variante', '🎮 My games in this line')} (${list.length})</summary>
      <ul class="small">${list.map((x) => `<li><span>${esc(x.date ? new Date(x.date).toLocaleDateString(LOC) : '')}${x.opp ? ` · ${L('contre', 'vs')} ${esc(x.opp)}` : ''} · ${res[x.outcome] || ''}${ecart(x)}</span>
        ${x.san?.length ? `<button type="button" class="small-btn" data-replay="${esc(x.gameId)}" data-replay-fiche="${esc(e.id)}">${L('▶ Comparer avec la théorie', '▶ Compare with theory')}</button>` : L('<span class="muted tiny">(rouvre « Mes parties » pour pouvoir la comparer)</span>', '<span class="muted tiny">(reopen “My games” to be able to compare it)</span>')}${/^https:\/\//.test(x.url || "") ? ` <a class="tiny" href="${esc(x.url)}" target="_blank" rel="noopener">↗</a>` : ''}</li>`).join('')}</ul>
      <p class="muted tiny">${L('« Comparer » ouvre la leçon sur le coup où ta partie quitte la théorie : bascule 📖 Théorie / 🎮 Ma partie sur le même échiquier.', '“Compare” opens the lesson at the move where your game leaves theory: switch 📖 Theory / 🎮 My game on the same board.')}</p>
    </details>`;
  }

  // ---------- Ma routine du jour (routine-core.js) ----------

  // « Mes variantes apprises » : leçons suivies, la plus récente d'abord (nom, ECO, coups, maîtrise),
  // à recopier dans ses notes (bouton Copier) ou à revoir.
  apprises() {
    const cours = this.progress.cours || {};
    return this.data.entries.filter((e) => cours[e.id]).sort((a, b) => (cours[b.id].vue || 0) - (cours[a.id].vue || 0));
  }

  coupsTexte(e) {
    return e.san.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${sanFr(s)}` : sanFr(s))).join(' ');
  }

  apprisesHtml(board) {
    const list = this.apprises();
    if (!list.length) return '';
    const pct = (id) => board.fiches.find((f) => f.id === id)?.pct ?? 0;
    return `<details class="routine-appris" data-appris><summary class="small"><strong>${L('📒 Mes variantes apprises', '📒 My learned lines')} (${list.length})</strong></summary>
      <ol class="appris-list">${list.map((e) => `<li><div><span class="badge eco">${esc(e.eco)}</span> <strong>${esc(e.nom)}</strong>
        <span class="muted tiny">· ${esc(REPERTOIRES[e.rep]?.titre || e.rep)} · ${L('apprise le', 'learned on')} ${esc(new Date(this.progress.cours[e.id].vue).toLocaleDateString(LOC))} · ${L('maîtrise', 'mastery')} ${pct(e.id)} %</span></div>
        <p class="small appris-coups">${esc(this.coupsTexte(e))}</p>
        <button type="button" class="small-btn" data-appris-lecon="${esc(e.id)}">${L('Revoir la leçon', 'Review the lesson')}</button></li>`).join('')}</ol>
      <div class="actions"><button type="button" class="small-btn" data-appris-copier>${L('📋 Copier la liste (pour mes notes)', '📋 Copy the list (for my notes)')}</button> <span class="small muted" data-appris-msg></span></div>
    </details>`;
  }

  // Prochaine leçon de la routine : le répertoire le moins avancé qui a encore une leçon à voir.
  prochaineLecon(next, seen) {
    const reps = this.actifs().filter((r) => next(r)).sort((a, b) => seen(a) - seen(b));
    return reps.length ? next(reps[0]) : null;
  }

  profilTexte(p) {
    return `${L(`${p.temps} min par jour`, `${p.temps} min a day`)} · ${p.sites.map((x) => SITES[x]).join(' + ')} · ${p.cadences.map((x) => CADENCES[x]).join(', ')}`;
  }

  // Trois questions pour construire la routine (premier lancement, ou « Modifier »).
  profilHtml(profil) {
    const p = profil || { temps: 45, sites: [], cadences: [] };
    const chk = (name, val, label, on) => `<label class="chip-check"><input type="${name === 'temps' ? 'radio' : 'checkbox'}" name="rp-${name}" value="${val}" ${on ? 'checked' : ''}> ${esc(label)}</label>`;
    return `<section class="card routine routine-setup" data-routine data-routine-profil>
      <h2>${L('📅 Construisons ta routine', '📅 Let’s build your routine')}</h2>
      <p class="small">${L('Trois questions, et l’appli te prépare chaque jour un programme adapté. Tu pourras les changer quand tu veux.', 'Three questions, and the app prepares a tailored programme for you every day. You can change them whenever you like.')}</p>
      <fieldset><legend>${L('⏱ Combien de temps par jour ?', '⏱ How much time per day?')}</legend>${TEMPS.map((t) => chk('temps', t, `${t} min`, Number(p.temps) === t)).join('')}</fieldset>
      <fieldset><legend>${L('🌐 Où joues-tu ?', '🌐 Where do you play?')}</legend>${Object.entries(SITES).map(([k, l]) => chk('sites', k, l, p.sites.includes(k))).join('')}</fieldset>
      <fieldset><legend>${L('⚡ Quelles cadences joues-tu ?', '⚡ Which time controls do you play?')}</legend>${Object.entries(CADENCES).map(([k, l]) => chk('cadences', k, l, p.cadences.includes(k))).join('')}</fieldset>
      <p class="error-text small" data-profil-err></p>
      <div class="actions"><button type="button" class="primary" data-profil-ok>${L('Créer ma routine', 'Create my routine')}</button>${profil ? `<button type="button" data-profil-annuler>${L('Annuler', 'Cancel')}</button>` : ''}</div>
    </section>`;
  }

  bindProfil() {
    const el = this.el.querySelector('[data-routine-profil]');
    if (!el) return false;
    const val = (name) => [...el.querySelectorAll(`input[name="rp-${name}"]:checked`)].map((i) => i.value);
    el.querySelector('[data-profil-ok]').addEventListener('click', () => {
      if (!val('sites').length || !val('cadences').length) {
        el.querySelector('[data-profil-err]').textContent = L('Choisis au moins un site et une cadence.', 'Choose at least one site and one time control.');
        return;
      }
      const d = charger();
      d.profil = normaliserProfil({ temps: val('temps')[0], sites: val('sites'), cadences: val('cadences') });
      enregistrer(d);
      this.editRoutine = false;
      this.renderSetup();
    });
    el.querySelector('[data-profil-annuler]')?.addEventListener('click', () => { this.editRoutine = false; this.renderSetup(); });
    return true;
  }

  routineHtml(board, next, seen) {
    const date = jour();
    const lecon = this.prochaineLecon(next, seen);
    const plan = planTheorie(board, this.progress.cours, { peut: canOpenFiche });
    const theorie = `${lecon ? `<button type="button" class="small-btn primary" data-routine-lecon="${esc(lecon.id)}">${L(`📖 Apprendre : ${esc(lecon.nom)}`, `📖 Learn: ${esc(lecon.nom)}`)}</button>` : ''}${plan.ids.length
      ? `<button type="button" class="small-btn${lecon ? '' : ' primary'}" data-routine-theorie>${plan.rapide ? L('⚡ Réviser en rythme Blitz (5 s par coup)', '⚡ Review at Blitz pace (5 s per move)') : L(`🔁 Réviser ${plan.ids.length} variante(s) apprise(s) : relire puis jouer`, `🔁 Review ${plan.ids.length} learned line(s): read through, then play`)}</button>`
      : L('<span class="muted tiny">La révision s’ouvre après ta première leçon.</span>', '<span class="muted tiny">Review opens after your first lesson.</span>')}`;
    const data = charger();
    const profil = profilDe(data);
    if (!profil || this.editRoutine) return this.profilHtml(profil);
    const j = data.jours[date] || { faits: [] };
    const { dimanche, blocs } = blocsDuJour(date, profil);
    const faits = blocs.filter((b) => j.faits.includes(b.id)).length;
    const s = serie(data, date);
    const lien = (l) => (l.interne ? `<a class="btn-link" href="${esc(l.url)}">${esc(l.label)} →</a>` : `<a class="btn-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`);
    const hist = historique(data, date, 7);
    const v = (x) => (x == null ? '—' : x);
    return `<details class="card routine" data-routine ${this.routineFermee ? '' : 'open'}>
      <summary><h2>${L('📅 Ma routine du jour', '📅 My daily routine')}</h2> <span class="routine-prog">${faits} / ${blocs.length}</span>${s ? ` <span class="badge ok">🔥 ${L(`${s} jour(s) complet(s)`, `${s} full day(s)`)}</span>` : ''}</summary>
      <p class="routine-rule">${L('<strong>Son coup d’abord :</strong> avant chaque coup, un coup d’œil à la pièce qu’il vient de bouger (que menace-t-elle ?), puis mon coup est-il sûr ?', '<strong>Their move first:</strong> before every move, glance at the piece they just moved (what does it threaten?), then: is my move safe?')}</p>
      <p class="small muted routine-profil">${L('Ma routine :', 'My routine:')} ${esc(this.profilTexte(profil))} · <button type="button" class="link-btn" data-routine-edit>${L('⚙ Modifier', '⚙ Edit')}</button></p>
      ${dimanche ? L('<p class="small muted">Dimanche : jour off. Seulement la théorie, le reste se repose.</p>', '<p class="small muted">Sunday: day off. Theory only, everything else rests.</p>') : ''}
      <ol class="routine-list">${blocs.map((b, i) => {
        const ok = j.faits.includes(b.id);
        const bloque = b.id === 'blitz' && !blocs.filter((x) => x.id !== 'blitz').every((x) => j.faits.includes(x.id));
        return `<li class="routine-item ${ok ? 'done' : ''}">
          <label class="routine-check"><input type="checkbox" data-bloc="${b.id}" ${ok ? 'checked' : ''}> <span><strong>${i + 1}. ${esc(b.titre)}</strong> <span class="muted small">· ${b.min} min</span></span></label>
          <p class="small">${esc(b.texte)}${bloque ? L(' <span class="muted">(après les blocs 1 à 5)</span>', ' <span class="muted">(after blocks 1 to 5)</span>') : ''}</p>
          <div class="routine-actions">${b.action === 'problemes' ? `<button type="button" class="small-btn primary" data-routine-problemes>${L(`🧩 Faire les ${b.n || 10} problèmes ici`, `🧩 Do the ${b.n || 10} puzzles here`)}</button><label class="small routine-niveau">${L('Niveau', 'Level')} <select data-routine-niveau>${NIVEAUX.map((n) => `<option value="${n.id}" ${n.id === niveauProblemes(data) ? 'selected' : ''}>${esc(n.nom)}</option>`).join('')}</select></label><label class="small routine-niveau">${L('Chrono', 'Timer')} <select data-routine-chrono>${CHRONOS.map((t) => `<option value="${t}" ${t === chronoProblemes(data) ? 'selected' : ''}>${t ? L(`${t} s par problème`, `${t} s per puzzle`) : L('Sans chrono', 'No timer')}</option>`).join('')}</select></label>` : ''}${b.action === 'theorie' ? theorie : ''}${b.lien ? lien(b.lien) : ''}</div>${b.action === 'theorie' ? this.apprisesHtml(board) : ''}
        </li>`;
      }).join('')}</ol>
      <h3>${L('Le soir : mes 3 chiffres', 'In the evening: my 3 numbers')}</h3>
      <div class="routine-suivi">${Object.entries(SUIVI).map(([k, d]) => `<label>${esc(d.label)} <input type="number" inputmode="numeric" min="${d.min}" max="${d.max}" data-suivi="${k}" value="${j[k] ?? ''}"></label>`).join('')}</div>
      <details class="routine-hist"><summary class="small">${L('Mes 7 derniers jours', 'My last 7 days')}</summary>
        <table class="routine-table"><thead><tr><th>${L('Jour', 'Day')}</th><th>${L('Blocs', 'Blocks')}</th><th>${L('Menaces ratées', 'Missed threats')}</th><th>Blitz</th><th>${L('Au temps', 'On time')}</th><th>${L('Problèmes', 'Puzzles')}</th></tr></thead>
        <tbody>${hist.map((h) => `<tr><td>${esc(new Date(`${h.date}T12:00:00`).toLocaleDateString(LOC, { weekday: 'short', day: 'numeric' }))}</td><td>${h.faits}/${h.total}</td><td>${v(h.menaces)}</td><td>${v(h.blitz)}</td><td>${v(h.temps)}</td><td>${h.problemes == null ? '—' : `${h.problemes}/10`}</td></tr>`).join('')}</tbody></table>
        <p class="muted tiny">${L('Les chiffres qui comptent : les menaces ratées et les Blitz perdus au temps. S’ils baissent sur 2 à 3 semaines, tu progresses.', 'The numbers that matter: missed threats and Blitz games lost on time. If they go down over 2 to 3 weeks, you are improving.')}</p>
      </details>
    </details>`;
  }

  bindRoutine(lancerTheorie) {
    if (this.bindProfil()) return;
    const el = this.el.querySelector('[data-routine]');
    if (!el) return;
    el.querySelector('[data-routine-edit]')?.addEventListener('click', (ev) => { ev.preventDefault(); this.editRoutine = true; this.renderSetup(); });
    const date = jour();
    el.addEventListener('toggle', () => { this.routineFermee = !el.open; });
    el.querySelectorAll('[data-bloc]').forEach((c) => c.addEventListener('change', () => {
      enregistrer(cocher(charger(), date, c.dataset.bloc, c.checked));
      this.renderSetup();
    }));
    el.querySelectorAll('[data-suivi]').forEach((inp) => inp.addEventListener('change', () => {
      enregistrer(noter(charger(), date, inp.dataset.suivi, inp.value));
    }));
    el.querySelector('[data-routine-theorie]')?.addEventListener('click', lancerTheorie);
    el.querySelector('[data-routine-lecon]')?.addEventListener('click', (ev) => this.openLesson(ev.currentTarget.dataset.routineLecon));
    el.querySelector('[data-routine-problemes]')?.addEventListener('click', () => this.runProblemes());
    const appris = el.querySelector('[data-appris]');
    if (appris) {
      appris.open = !!this.apprisOuvert;
      appris.addEventListener('toggle', () => { this.apprisOuvert = appris.open; });
    }
    el.querySelectorAll('[data-appris-lecon]').forEach((b) => b.addEventListener('click', () => this.openLesson(b.dataset.apprisLecon)));
    el.querySelector('[data-appris-copier]')?.addEventListener('click', async () => {
      const txt = this.apprises().map((e) => `${e.eco} ${e.nom} (${REPERTOIRES[e.rep]?.titre || e.rep})\n${this.coupsTexte(e)}`).join('\n\n');
      const msg = el.querySelector('[data-appris-msg]');
      try { await navigator.clipboard.writeText(txt); msg.textContent = L('✔ Copié : colle-le dans tes notes.', '✔ Copied: paste it into your notes.'); } catch { msg.textContent = L('Copie impossible ici : appuie longuement sur le texte pour le sélectionner.', 'Copying is not possible here: long-press the text to select it.'); }
    });
    el.querySelector('[data-routine-niveau]')?.addEventListener('change', (ev) => { const d = charger(); d.niveau = ev.target.value; enregistrer(d); });
    el.querySelector('[data-routine-chrono]')?.addEventListener('change', (ev) => { const d = charger(); d.chrono = Number(ev.target.value); enregistrer(d); });
  }

  // 10 problèmes Lichess du thème du jour, dans l'application. Bilan → suivi du soir (« problèmes
  // réussis sur 10 ») et bloc coché quand les 10 sont faits.
  runProblemes() {
    const date = jour();
    const bloc = blocsDuJour(date, profilDe(charger())).blocs.find((b) => b.id === 'tactique');
    if (!bloc) return;
    this.s = null;
    window.scrollTo(0, 0);
    this.drill = new PuzzleRunner({
      el: this.el, queue: this.client.queue, theme: bloc.theme, n: bloc.n || 10, difficulty: niveauProblemes(charger()), chrono: chronoProblemes(charger()),
      onDone: (r) => {
        this.drill = null;
        this.view = null;
        const n = bloc.n || 10;
        if (r.total >= n) {
          // Le suivi du soir compte sur 10 : noté seulement pour une série de 10.
          let d = n === 10 ? noter(charger(), date, 'problemes', r.ok) : charger();
          d = cocher(d, date, 'tactique', true);
          enregistrer(d);
        }
        this.renderSetup();
        const msg = r.total ? L(`Problèmes : ${r.ok} / ${r.total} réussi(s) du premier coup${r.total >= n && n === 10 ? ' (noté dans ton suivi du soir)' : ''}.`, `Puzzles: ${r.ok} / ${r.total} solved on the first try${r.total >= n && n === 10 ? ' (recorded in your evening log)' : ''}.`) : L('Problèmes interrompus.', 'Puzzles interrupted.');
        this.el.querySelector('.hub-head')?.insertAdjacentHTML('afterbegin', `<p class="hub-result">${esc(msg)}</p>`);
      },
    });
  }

  // Finales essentielles : liste (réussies ✔, sans indice ⭐) et partie contre Stockfish.
  finalesHtml() {
    const p = chargerFinales();
    const ok = FINALES.filter((f) => p[f.id]?.ok).length;
    const but = { mat: L('mater', 'checkmate'), promotion: L('aller à dame', 'promote to a queen'), nulle: L('tenir la nulle', 'hold the draw') };
    return `<section class="card hub-card hub-finales" data-finales>
      <h2>${L('♚ Finales essentielles', '♚ Essential endgames')}</h2>
      <p class="small">${L(`Les finales à connaître, jouées contre Stockfish : il vérifie après chaque coup que tu gardes le bon résultat. ${ok} / ${FINALES.length} réussie(s).`, `The endgames you must know, played against Stockfish: after every move it checks that you keep the right result. ${ok} / ${FINALES.length} solved.`)}</p>
      <ul class="finales-list">${FINALES.map((f) => {
        const r = p[f.id];
        const etat = r?.sansIndice ? '⭐' : r?.ok ? '✔' : '';
        const lock = !f.gratuit && !isPro() ? ' <span class="lock-badge">🔒 Pro</span>' : '';
        return `<li><button type="button" class="finale-btn" data-finale-id="${f.id}"><span>${etat ? `<span class="finale-etat">${etat}</span> ` : ''}<strong>${esc(f.titre)}</strong>${lock}</span><span class="muted tiny">${L('but :', 'goal:')} ${but[f.but]}</span></button></li>`;
      }).join('')}</ul>
      <p class="muted tiny">${L('✔ réussie · ⭐ réussie sans indice', '✔ solved · ⭐ solved without a hint')}</p>
    </section>`;
  }

  // ---------- 🧩 Problèmes par thème (classement propre à l'appli) ----------
  problemesHtml() {
    const d = lireProblemes();
    const groupes = [...new Set(THEMES_PROBLEMES.map((t) => t.groupe))];
    const choix = this.prefs.pbTheme || 'mix';
    const faibles = themesFaibles(d).slice(0, 3);
    const h = d.histo || [];
    const il30 = h.filter((x) => x.d >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
    const evol = il30.length > 1 ? il30.at(-1).r - il30[0].r : null;
    return `<section class="card hub-card hub-problemes" data-problemes>
      <h2>${L('🧩 Problèmes par thème', '🧩 Puzzles by theme')}</h2>
      <p class="hub-big-line"><span class="hub-big">${d.classement}</span> <span class="muted small">${L('mon classement problèmes', 'my puzzle rating')}${d.n < 20 ? L(' (provisoire)', ' (provisional)') : ''} · ${L(`${d.n} problème(s)`, `${d.n} puzzle(s)`)}${evol !== null ? L(` · ${signe(evol)} sur 30 jours`, ` · ${signe(evol)} over 30 days`) : ''}</span></p>
      <label class="row">${L('Thème', 'Theme')}
        <select data-pb-theme>${groupes.map((g) => `<optgroup label="${esc(g)}">${THEMES_PROBLEMES.filter((t) => t.groupe === g).map((t) => `<option value="${t.id}" ${t.id === choix ? 'selected' : ''}>${esc(t.nom)}${!t.gratuit && !isPro() ? ' 🔒' : ''}${d.themes[t.id] ? ` — ${d.themes[t.id].ok}/${d.themes[t.id].n}` : ''}</option>`).join('')}</optgroup>`).join('')}</select>
      </label>
      <label class="row">${L('Nombre', 'Number')}
        <select data-pb-n>${[5, 10, 20].map((n) => `<option value="${n}" ${Number(this.prefs.pbN || 10) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      ${faibles.length ? `<p class="small">${L('Mes thèmes les plus faibles :', 'My weakest themes:')} ${faibles.map((f) => `<button type="button" class="link-btn" data-pb-go="${f.id}">${esc(f.nom)} (${f.pct} %)</button>`).join(' · ')}</p>` : ''}
      <div class="actions"><button type="button" class="primary" data-pb-start>${L('Commencer', 'Start')}</button></div>
      <p class="muted tiny">${L('Problèmes de la base Lichess (CC0), choisis selon ton classement. Ce classement est calculé dans l’appli (formule Elo, à partir de la difficulté publiée par Lichess) : il ne compte pas sur Lichess.', 'Puzzles from the Lichess database (CC0), chosen according to your rating. This rating is computed in the app (Elo formula, from the difficulty published by Lichess): it does not count on Lichess.')}</p>
    </section>`;
  }

  bindProblemes() {
    const sel = this.el.querySelector('[data-pb-theme]');
    const nSel = this.el.querySelector('[data-pb-n]');
    if (!sel) return;
    const save = () => { this.prefs.pbTheme = sel.value; this.prefs.pbN = nSel.value; try { localStorage.setItem(PREFS, JSON.stringify(this.prefs)); } catch { /* rien */ } };
    sel.addEventListener('change', save);
    nSel.addEventListener('change', save);
    const go = (id) => {
      const t = themeDe(id);
      if (!t.gratuit && !isPro()) { openPaywall({ reason: L(`Les problèmes « ${t.nom} »`, `The “${t.nom}” puzzles`) }); return; }
      this.runProblemesTheme(t, Number(nSel.value) || 10);
    };
    this.el.querySelector('[data-pb-start]').addEventListener('click', () => { save(); go(sel.value); });
    this.el.querySelectorAll('[data-pb-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.pbGo)));
  }

  runProblemesTheme(theme, n) {
    this.s = null;
    window.scrollTo(0, 0);
    const avant = lireProblemes().classement;
    this.drill = new PuzzleRunner({
      el: this.el, queue: this.client.queue, theme, n,
      titre: `🧩 ${theme.nom}`,
      note: L('Problèmes de la base Lichess (licence CC0). Classement calculé dans l’appli : il ne compte pas sur Lichess.', 'Puzzles from the Lichess database (CC0 licence). Rating computed in the app: it does not count on Lichess.'),
      vus: lireProblemes().vus,
      difficulty: () => difficultePour(lireProblemes().classement),
      onResultat: (p, reussi) => {
        const r = noterProbleme(lireProblemes(), { id: p.id, theme: theme.id, difficulte: Number(p.rating), reussi });
        ecrireProblemes(r.data);
        return L(`Classement problèmes : ${r.apres} (${signe(r.delta)})`, `Puzzle rating: ${r.apres} (${signe(r.delta)})`);
      },
      onDone: (b) => {
        this.drill = null;
        this.view = null;
        this.renderSetup();
        const apres = lireProblemes().classement;
        const msg = b.total ? L(`${theme.nom} : ${b.ok} / ${b.total} réussi(s) du premier coup. Classement problèmes : ${apres} (${signe(apres - avant)}).`, `${theme.nom}: ${b.ok} / ${b.total} solved on the first try. Puzzle rating: ${apres} (${signe(apres - avant)}).`) : L('Problèmes interrompus.', 'Puzzles interrupted.');
        this.el.querySelector('.hub-head')?.insertAdjacentHTML('afterbegin', `<p class="hub-result">${esc(msg)}</p>`);
      },
    });
  }

  // ---------- 🤖 Partie contre Stockfish (niveau réglable) ----------
  stockfishHtml() {
    const d = lireSF();
    const niv = Number(this.prefs.sfNiveau || d.dernier?.niveau || 3);
    const camp = this.prefs.sfCamp || 'w';
    const fiches = this.data.entries.filter((e) => e.san?.length);
    const dep = this.prefs.sfDepart || '';
    const bil = Object.entries(d.niveaux || {}).sort((a, b) => a[0] - b[0]).map(([n, b]) => L(`niv. ${n} : ${b.v}-${b.n}-${b.d}`, `lvl ${n}: ${b.v}-${b.n}-${b.d}`)).join(' · ');
    return `<section class="card hub-card hub-stockfish" data-stockfish>
      <h2>${L('🤖 Jouer contre Stockfish', '🤖 Play against Stockfish')}</h2>
      <p class="small">${L('Une vraie partie contre le moteur, du niveau 1 (il fait exprès des erreurs) au niveau 10 (pleine force). Tu peux partir de la fin d’une de tes fiches pour t’entraîner à jouer la suite.', 'A real game against the engine, from level 1 (it makes mistakes on purpose) to level 10 (full strength). You can start from the end of one of your lines to practise playing on.')}</p>
      <label class="row">${L('Niveau', 'Level')}
        <select data-sf-niveau>${NIVEAUX_SF.map((x) => `<option value="${x.n}" ${x.n === niv ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}</select>
      </label>
      <label class="row">${L('Ma couleur', 'My colour')}
        <select data-sf-camp>
          <option value="w" ${camp === 'w' ? 'selected' : ''}>${L('Blancs', 'White')}</option>
          <option value="b" ${camp === 'b' ? 'selected' : ''}>${L('Noirs', 'Black')}</option>
          <option value="hasard" ${camp === 'hasard' ? 'selected' : ''}>${L('Au hasard', 'Random')}</option>
        </select>
      </label>
      <label class="row">${L('Départ', 'Start position')}
        <select data-sf-depart>
          <option value="">${L('Position initiale', 'Initial position')}</option>
          ${fiches.map((e) => `<option value="${esc(e.id)}" ${dep === e.id ? 'selected' : ''}>${L(`Fin de la fiche : ${esc(e.nom)}`, `End of the line: ${esc(e.nom)}`)} (${esc(REPERTOIRES[e.rep]?.titre || e.rep)})</option>`).join('')}
        </select>
      </label>
      <p class="muted small">${L('Si tu pars d’une fiche, ta couleur est celle du répertoire.', 'If you start from a line, your colour is the repertoire’s.')}</p>
      <div class="actions"><button type="button" class="primary" data-sf-start>${L('Jouer', 'Play')}</button></div>
      ${bil ? `<p class="muted tiny">${L('Mon bilan (victoires-nulles-défaites) :', 'My record (wins-draws-losses):')} ${esc(bil)}</p>` : ''}
    </section>`;
  }

  bindStockfish() {
    const q = (s) => this.el.querySelector(s);
    if (!q('[data-sf-start]')) return;
    const save = () => {
      this.prefs.sfNiveau = q('[data-sf-niveau]').value;
      this.prefs.sfCamp = q('[data-sf-camp]').value;
      this.prefs.sfDepart = q('[data-sf-depart]').value;
      try { localStorage.setItem(PREFS, JSON.stringify(this.prefs)); } catch { /* rien */ }
    };
    ['[data-sf-niveau]', '[data-sf-camp]', '[data-sf-depart]'].forEach((s) => q(s).addEventListener('change', save));
    q('[data-sf-start]').addEventListener('click', () => {
      save();
      const niveau = Number(this.prefs.sfNiveau) || 3;
      // Niveaux 1 à 4 gratuits ; au-delà, formule Pro.
      if (niveau > 4 && !isPro()) { openPaywall({ reason: L(`La partie contre Stockfish au niveau ${niveau}`, `The game against Stockfish at level ${niveau}`) }); return; }
      const e = this.data.entries.find((x) => x.id === this.prefs.sfDepart);
      if (e && !canOpenFiche(e.id)) { openPaywall({ reason: L(`La fiche « ${e.nom} »`, `The line “${e.nom}”`) }); return; }
      let camp = this.prefs.sfCamp === 'hasard' ? (Math.random() < 0.5 ? 'w' : 'b') : this.prefs.sfCamp;
      if (e) camp = couleurDe(e.rep) || camp;
      this.runStockfish({ niveau, camp, depart: e ? { chess: departDepuis(e.san), titre: e.nom } : { chess: departDepuis([]), titre: '' } });
    });
  }

  runStockfish({ niveau, camp, depart }) {
    this.s = null;
    window.scrollTo(0, 0);
    this.drill = new StockfishGameRunner({
      el: this.el, engine: this.engine, niveau, camp, depart,
      onDone: () => { this.drill = null; this.view = null; this.renderSetup(); },
      onAnalyse: this.openSan ? (san, color, label) => this.openSan(san, color, label) : null,
    });
  }

  runFinale(f) {
    this.s = null;
    window.scrollTo(0, 0);
    this.drill = new FinaleRunner({
      el: this.el, engine: this.engine, finale: f,
      onDone: () => { this.drill?.destroy?.(); this.drill = null; this.view = null; this.renderSetup(); },
    });
  }

  // « Positions de mes parties » : positions de vos parties réelles (Mes parties) à corriger.
  runReelles({ gameId = null } = {}) {
    const toutes = vraiesErreurs(loadProgress());
    const list = gameId && toutes.some((x) => x.gameId === gameId) ? toutes.filter((x) => x.gameId === gameId) : toutes;
    if (!list.length) { this.renderSetup(); return; }
    this.s = null;
    const tree = Object.fromEntries(this.actifs().map((r) => [r, buildTree(this.data.entries, r)]));
    this.drill = new DrillRunner({
      el: this.el, data: this.data, kind: 'reelles', ids: [], tree, engine: this.engine, positions: list,
      progress: loadProgress(),
      gradePos: (rep, k, ok) => this.gradePos(rep, k, ok),
      onValidated: (gameId) => { const p = loadProgress(); markCorrige(p, gameId); saveProgress(p); },
      onDone: (r) => {
        this.drill = null;
        this.view = null;
        this.renderSetup();
        this.el.querySelector('.hub-head').insertAdjacentHTML('afterbegin', `<p class="hub-result">${esc(L(`Positions de mes parties : ${r.ok} corrigée(s).`, `Positions from my games: ${r.ok} fixed.`))}</p>`);
      },
    });
  }

  // Révision espacée d'une position (hors session « Partie »).
  gradePos(rep, k, ok) {
    this.revision[rep][k] = schedule(this.revision[rep][k], ok);
    try { localStorage.setItem(REVISION, JSON.stringify(this.revision)); } catch { /* stockage plein */ }
  }

  dashboardHtml(board) {
    const actifs = this.actifs();
    const rep = actifs.includes(this.dashRep) ? this.dashRep : actifs[0];
    const fiches = board.fiches.filter((f) => f.rep === rep);
    const r = board.byRep[rep];
    const tab = (k) => `<button type="button" class="chip" data-dash-rep="${k}" aria-pressed="${rep === k}">${repLabel(k, { camp: false })}</button>`;
    return `
      <div class="chips">${actifs.map(tab).join('')}</div>
      <p class="small">${L(`Maîtrise moyenne <strong>${r.pct} %</strong> · ${r.maitrisees} / ${r.total} variante(s) maîtrisée(s) (≥ 80 %) · ${r.due} position(s) à revoir.`, `Average mastery <strong>${r.pct}%</strong> · ${r.maitrisees} / ${r.total} line(s) mastered (≥ 80%) · ${r.due} position(s) to review.`)}
        ${board.bestDrill ? L(` · Record anti-trash : ${(board.bestDrill / 1000).toFixed(1).replace('.', ',')} s`, ` · Anti-trash record: ${(board.bestDrill / 1000).toFixed(1)} s`) : ''}</p>
      <p class="muted tiny">${L('Maîtrise = positions révisées avec succès (70 %) + réussite aux exercices de la fiche (30 %). Les variantes les plus faibles sont en haut ; ⚠ = vous en êtes sorti dans une vraie partie (Mes parties).', 'Mastery = positions reviewed successfully (70%) + success in the line’s exercises (30%). The weakest lines are at the top; ⚠ = you left it in a real game (My games).')}</p>
      ${(() => {
    const row = (f) => `<li class="dash-row">
        <div class="dash-name"><span class="badge eco">${esc(f.eco)}</span> ${esc(f.nom)}${f.cours ? ` <span title="${L('Leçon suivie', 'Lesson done')}">📖</span>` : ''}${f.sorties ? ` <span class="badge err" title="${L('Sortie de répertoire dans vos parties', 'Repertoire exit in your games')}">⚠ ${f.sorties}</span>` : ''}${f.due ? ` <span class="badge">${L(`${f.due} à revoir`, `${f.due} to review`)}</span>` : ''}</div>
        <div class="dash-bar" role="img" aria-label="${L('Maîtrise', 'Mastery')} ${f.pct} %"><span style="width:${f.pct}%" class="${f.pct >= 80 ? 'hi' : f.pct >= 40 ? 'mid' : 'lo'}"></span></div>
        <div class="dash-pct">${f.pct} %</div>
        <div class="dash-actions"><button type="button" class="small-btn" data-dash-lesson="${f.id}" title="${L('Leçon', 'Lesson')}">📖</button><button type="button" class="small-btn" data-dash-line="${f.id}">${L('Réviser', 'Review')}</button>${f.punition && trashDrill(this.data.entries.find((e) => e.id === f.id), this.data.repertoires[f.rep].couleur) ? `<button type="button" class="small-btn" data-dash-trash="${f.id}">⏱ Drill</button>` : ''}</div>
      </li>`;
    const head = fiches.slice(0, 12).map(row).join('');
    const rest = fiches.slice(12);
    return `<ul class="dash-list">${head}</ul>${rest.length ? `<details class="dash-more"><summary>${L(`Voir les ${rest.length} autres variantes`, `Show the ${rest.length} other lines`)}</summary><ul class="dash-list">${rest.map(row).join('')}</ul></details>` : ''}`;
  })()}`;
  }

  // ---------- Révision espacée ----------

  revisionLine(rep) {
    const cards = cardsFor(buildTree(this.data.entries, rep));
    const st = revisionStats(cards, this.revision[rep]);
    return L(`📅 Révision : <strong>${st.due}</strong> position(s) à revoir maintenant · ${st.fresh} jamais vue(s) · ${st.learned} / ${st.total} apprise(s). <span class="muted">Chaque position ratée revient plus souvent ; réussie, elle s’espace (1 j, 3 j, 8 j…).</span>`, `📅 Review: <strong>${st.due}</strong> position(s) to review now · ${st.fresh} never seen · ${st.learned} / ${st.total} learned. <span class="muted">Each missed position comes back more often; once solved, it is spaced out (1 d, 3 d, 8 d…).</span>`);
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
    if (s.cardIndex >= s.cards.length) { this.finish(L('Révision terminée.', 'Review finished.')); return; }
    const card = s.cards[s.cardIndex++];
    s.chess = new Chess();
    s.path = [];
    for (const u of card.path) this.play(u);
    const fiche = s.tree.ours.get(card.k)?.values().next().value?.[0];
    const st = this.revision[s.rep][card.k];
    this.msg(L(`Position ${s.cardIndex} / ${s.cards.length}${fiche ? ` — fiche « ${esc(fiche.nom)} »` : ''}${st ? (st.lapses ? ` <span class="muted">(ratée ${st.lapses} fois)</span>` : '') : ' <span class="muted">(nouvelle)</span>'} : trouvez votre coup.`, `Position ${s.cardIndex} / ${s.cards.length}${fiche ? ` — line “${esc(fiche.nom)}”` : ''}${st ? (st.lapses ? ` <span class="muted">(missed ${st.lapses} time(s))</span>` : '') : ' <span class="muted">(new)</span>'}: find your move.`), 'muted');
    this.render();
  }

  next() {
    if (this.s.mode === 'revision') setTimeout(() => this.nextCard(), 700);
    else setTimeout(() => this.opponentMove(), 450);
  }

  // ---------- Session ----------

  start() {
    const p = this.prefs;
    if (!this.actifs().includes(p.rep)) p.rep = this.actifs()[0];
    const color = couleurDe(p.rep);
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
        <div class="actions"><button type="button" data-stop>${L('Arrêter', 'Stop')}</button><button type="button" data-restart>${L('Recommencer', 'Restart')}</button></div></section>
      <section class="card train-panel"><div data-score></div><ol class="train-log" data-log></ol></section>
    </div>`;
    this.board = new Board(this.el.querySelector('[data-board]'), { piecesUrl: './pieces/', onMove: (mv) => this.onUserMove(mv) });
    this.board.setOrientation(color);
    this.el.querySelector('[data-stop]').addEventListener('click', () => this.finish(L('Session arrêtée.', 'Session stopped.')));
    this.el.querySelector('[data-restart]').addEventListener('click', () => this.start());
    this.render();
    if (this.s.mode === 'revision') {
      if (!this.s.cards.length) {
        const next = Math.min(...Object.values(this.revision[p.rep]).map((x) => x.due));
        this.finish(L(`Rien à réviser : tout est à jour ✔ Prochaine révision : ${dateFr(next)}.`, `Nothing to review: everything is up to date ✔ Next review: ${dateFr(next)}.`));
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
    st.innerHTML = s.done ? L('Session terminée', 'Session finished')
      : s.busy ? '<span class="spinner"></span> ' + esc(s.busy)
      : s.pending ? L('Choisissez : réessayer ou continuer', 'Choose: retry or continue')
      : myTurn ? L(`À vous (${s.color === 'w' ? 'Blancs' : 'Noirs'}) : trouvez le coup de votre répertoire`, `Your move (${s.color === 'w' ? 'White' : 'Black'}): find your repertoire move`) : s.mode === 'revision' ? L('Position suivante…', 'Next position…') : L('L’adversaire réfléchit…', 'The opponent is thinking…');
    const ok = s.results.filter((r) => r.ok).length;
    const book = s.results.filter((r) => r.level === 'repertoire').length;
    this.el.querySelector('[data-score]').innerHTML = `<h2>${L('Score :', 'Score:')} ${ok} / ${s.results.length}</h2>
      <p class="small muted">${s.mode === 'revision' ? L(`Révision espacée · position ${s.ours} / ${s.length} réussie(s) ou passée(s)`, `Spaced repetition · position ${s.ours} / ${s.length} solved or skipped`) : L(`${book} coup(s) du répertoire · coup ${s.ours} / ${s.length} · adversaire : ${s.source === 'lichess' ? 'parties Lichess (' + esc(this.filterLabel()) + ')' : 'lignes des fiches'}`, `${book} repertoire move(s) · move ${s.ours} / ${s.length} · opponent: ${s.source === 'lichess' ? 'Lichess games (' + esc(this.filterLabel()) + ')' : 'repertoire lines'}`)}</p>
      ${s.pending ? `<div class="actions"><button type="button" data-retry>${L('↺ Réessayer', '↺ Retry')}</button><button type="button" class="primary" data-fix>${s.mode === 'revision' ? L('Voir le bon coup et passer à la suite', 'Show the right move and go on') : L('Continuer avec', 'Continue with')} ${esc(sanFr(s.pending.bestSan))}</button></div>` : ''}
      ${s.done ? `<div class="actions"><button type="button" class="primary" data-again>${L('Nouvelle session', 'New session')}</button><button type="button" data-setup>${L('Changer de réglages', 'Change settings')}</button></div>` : ''}`;
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
    if (s.ours >= s.length) { this.finish(L('Objectif atteint.', 'Goal reached.')); return; }
    if (s.chess.isGameOver()) { this.finish(L('Fin de partie sur l’échiquier.', 'Game over on the board.')); return; }
    s.busy = L('L’adversaire choisit son coup…', 'The opponent is choosing a move…');
    this.render();
    let pick = null;
    let info = '';
    if (s.color === 'b' && s.path.length === 0) {
      // Avec les Noirs : le 1er coup blanc est celui qui mène au répertoire (1.e4, 1.d4…).
      pick = { uci: new Chess().move(REPERTOIRES[s.rep].racine[0]).lan };
      info = L(`ouverture imposée pour ${REPERTOIRES[s.rep].titre}`, `opening set for ${REPERTOIRES[s.rep].titre}`);
    } else if (s.source === 'lichess') {
      try {
        const f = this.getFilter();
        const r = await this.client.explorer({ fen: START_FEN, play: s.path, ratings: f.ratings, speeds: f.speeds, moves: 30, isStale: () => !this.alive(s) });
        if (r.stale || !this.alive(s)) return;
        const legal = (u) => { try { new Chess(s.chess.fen()).move(toObj(u)); return true; } catch { return false; } };
        const moves = (r.moves || []).filter((m) => legal(m.uci)).map((m) => ({ uci: m.uci, weight: m.white + m.draws + m.black }));
        const total = moves.reduce((a, m) => a + m.weight, 0);
        pick = weightedPick(moves);
        if (pick) info = L(`joué dans ${pct((100 * pick.weight) / total)} des ${total.toLocaleString(LOC)} parties de ce niveau`, `played in ${pct((100 * pick.weight) / total)} of the ${total.toLocaleString(LOC)} games at this level`);
      } catch (e) {
        this.msg(L(`Lichess indisponible (${esc(e.message)}) : coups tirés des fiches.`, `Lichess unavailable (${esc(e.message)}): moves taken from the repertoire lines.`), 'muted');
      }
    }
    if (!pick) {
      const opts = s.tree.theirs.get(key(s.path));
      if (opts) {
        pick = weightedPick([...opts.entries()].map(([uci, infos]) => ({ uci, weight: infos.length })));
        if (pick) info = info || L('ligne des fiches', 'repertoire line');
      }
    }
    if (!this.alive(s)) return;
    s.busy = false;
    if (!pick) { this.finish(s.source === 'lichess' ? L('Plus aucune partie connue dans cette position avec ce filtre.', 'No more known games in this position with this filter.') : L('Fin des lignes des fiches.', 'End of the repertoire lines.')); return; }
    const mv = this.play(pick.uci);
    this.msg(`${L('Adversaire :', 'Opponent:')} <strong>${esc(sanFr(mv.san))}</strong> <span class="muted">(${esc(info)})</span>`);
    const err = s.tree.errors.get(key(s.path));
    if (err) this.msg(L(`⚠ Erreur adverse connue (fiche « ${esc(err.nom)} ») : trouvez la punition !`, `⚠ Known opponent mistake (line “${esc(err.nom)}”): find the punishment!`), 'warn');
    if (s.chess.isGameOver()) { this.finish(L('Fin de partie sur l’échiquier.', 'Game over on the board.')); return; }
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
      s.busy = L('Stockfish vérifie votre coup…', 'Stockfish is checking your move…');
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
        this.msg(L(`Moteur indisponible (${esc(e.message)}) : coup non vérifié.`, `Engine unavailable (${esc(e.message)}): move not checked.`), 'muted');
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
    let html = `${L('Vous :', 'You:')} <strong>${esc(sanFr(mv.san))}</strong> — ${esc(VERDICT_TEXT[v.level])}`;
    if (loss != null && v.level !== 'repertoire') html += L(` <span class="muted">(perte ≈ ${(loss / 100).toFixed(1).replace('.', ',')})</span>`, ` <span class="muted">(loss ≈ ${(loss / 100).toFixed(1)})</span>`);
    const bookMoves = book ? [...book.keys()] : [];
    const bookSan = bookMoves.map((u) => new Chess(before).move(toObj(u)).san);
    if (book && !isBookMove) {
      const fiche = book.get(bookMoves[0])[0];
      html += L(`<br><span class="small">Votre répertoire joue ${bookSan.map((x) => `<strong>${esc(sanFr(x))}</strong>`).join(' ou ')} (fiche « ${esc(fiche.nom)} »).</span>`, `<br><span class="small">Your repertoire plays ${bookSan.map((x) => `<strong>${esc(sanFr(x))}</strong>`).join(' or ')} (line “${esc(fiche.nom)}”).</span>`);
    }
    if (isTrap) html += `<br><span class="small">${esc(trap.texte)}</span>`;
    const bestUci = bookMoves[0] || best;
    const bestSan = bestUci ? new Chess(before).move(toObj(bestUci)).san : null;
    if (!v.ok && best && !book) html += `<br><span class="small">${L('Meilleur coup selon Stockfish :', 'Best move according to Stockfish:')} <strong>${esc(sanFr(new Chess(before).move(toObj(best)).san))}</strong>.</span>`;
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
    this.msg(L('↺ Nouvel essai.', '↺ New try.'), 'muted');
    this.render();
  }

  continueWithBest() {
    const s = this.s;
    s.chess.undo();
    s.path.pop();
    const mv = this.play(s.pending.bestUci);
    s.pending = null;
    s.ours++;
    this.msg(`${s.mode === 'revision' ? L('Bon coup', 'Right move:') : L('On continue avec', 'Continuing with')} <strong>${esc(sanFr(mv.san))}</strong>.`, 'muted');
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
    this.msg(`<strong>${esc(reason)}</strong> ${L('Score :', 'Score:')} ${ok}/${n}${n ? ` (${Math.round((100 * ok) / n)} %)` : ''}.${fautes.length ? L(` À revoir : ${fautes.map(esc).join(', ')}.`, ` To review: ${fautes.map(esc).join(', ')}.`) : ''}<br><span class="small">${this.revisionLine(s.rep)}</span>`, 'end');
    this.render();
  }
}
