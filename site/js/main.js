// Contrôleur principal. Principe : l'état de partie (game.js) est la source de vérité ;
// Stockfish calcule ; chess.js valide ; Claude explique les résultats calculés.
import { bindPaywall, renderPlan, openPaywall, setPaymentUrl } from './pro.js';
import { initChoix, choisis, resume } from './mon-repertoire.js';
import { AccueilPage } from './accueil.js';
import { ChoixPage } from './choix.js';
import './pwa.js'; // service worker, bandeau de mise à jour
import { demarrer as demarrerInstallation, sauvegarder } from './installation.js';
import { demarrerSync } from './sync.js';
import { demarrerStats } from './stats.js';
import { initLangue, langue, choisirLangue } from './i18n.js';
import { Game, parseMoveText } from './game.js';
import { Variante } from './variante-core.js';
import { Chess, DEFAULT_POSITION } from '../vendor/chess.js';
import { Engine } from './engine.js';
import { Board } from './board.js';
import {
  BUDGETS, DEEPER_MOVETIME, COLOR_NAMES, buildAdvice, buildThreat, nullMoveFen, sanFr, formatScore, formatGap,
} from './analysis.js';
import { Coach, CoachError, LEVELS, buildCoachPayload, allowedMoveSet, renderCoachText } from './coach.js';
import * as store from './storage.js';
import { LichessClient } from './lichess.js';
import { OptimalPanel, DEFAULT_FILTER } from './optimal.js';
import { initRouter } from './router.js';
import { terminerConnexion, connecter as connecterLichess } from './lichess-auth.js';
import { aFaire as visiteAFaire, lancerVisite } from './tour.js';
import { ouvrirAide } from './aide.js';
import { ProgressionPage } from './progression-page.js';
import { explicationGratuite, renderExplication, menaceSerieuse } from './explain-free.js';
import { indicesNiveau1, indiceNiveau2 } from './hints.js';
import { RepertoirePage } from './repertoire-page.js';
import { YouTubeClient } from './youtube.js';
import { THEMES, BOARDS, applyAppearance } from './theme.js';
import { importData, describe } from './transfer.js';
import { TrainingPage } from './training.js';
import { GamesPage } from './games.js';
import { SPEED_LABELS, bucketLabel } from './lichess.js';

const $ = (id) => document.getElementById(id);
const L = (fr, en) => (langue() === 'en' ? en : fr);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  game: null,
  settings: store.loadSettings(),
  config: { apiUrl: '' },
  viewPly: null, // null = position actuelle ; sinon consultation de l'historique
  // Brouillon d'analyse (Variante) ouvert depuis la position consultée : coups essayés à part,
  // jamais ajoutés à la partie. Quand il existe, viewPly = sa position de départ.
  variante: null,
  analysis: { status: 'waiting-engine', token: null, live: null, advice: null, error: null, deeper: false },
  // Meilleure réponse adverse calculée pour la position où l'adversaire a le trait.
  expectation: null,
  deviation: null,
  coach: { status: 'idle', token: null, html: '', error: null, abort: null, meta: null },
};

// ---------- Initialisation ----------

const engine = new Engine({ baseUrl: './engine/', onStatus: renderEnginePill });
const board = new Board($('board'), { piecesUrl: './pieces/', onMove: (mv) => playMove(mv, 'board') });
const coach = new Coach({
  getApiUrl: () => state.settings.apiUrl || state.config.apiUrl,
  getCode: () => store.getAccessCode(),
});

const lichess = new LichessClient({
  getToken: () => store.getLichessToken(),
  // Relais Cloudflare (jeton Lichess côté serveur) si l'API le propose et que le code est saisi.
  getProxy: () => (state.relay && coach.configured() ? { url: coach.getApiUrl(), code: coach.getCode() } : null),
});
const optimal = new OptimalPanel({
  el: $('optimal'),
  client: lichess,
  getFilter: () => ({ ...DEFAULT_FILTER, ...(state.settings.explorerFilter || {}) }),
  setFilter: (f) => { state.settings.explorerFilter = f; store.saveSettings(state.settings); },
  onChange: () => renderBoard(),
  onOpenMaster: (id) => openMasterGame(id, state.game.playerColor),
  onOpenGame: (san, label, headers) => openSanInBoard(san, state.game.playerColor, label, { headers }),
  onPlay: (uci) => {
    if (state.viewPly !== null) return;
    const mv = state.game.legalMoves().find((m) => m.lan === uci);
    if (mv && window.confirm(L(`Enregistrer ${sanFr(mv.san)} comme coup réellement joué ?`, `Record ${sanFr(mv.san)} as the move actually played?`))) playMove(uci, 'explorer');
  },
});
let repertoirePage = null;
let trainingPage = null;
let accueilPage = null;
let progressionPage = null;
let choixPage = null;
let gamesPage = null;

const currentFilter = () => ({ ...DEFAULT_FILTER, ...(state.settings.explorerFilter || {}) });
function filterLabel() {
  const f = currentFilter();
  const sp = f.speeds.length ? f.speeds.map((x) => SPEED_LABELS[x]).join(', ') : L('toutes cadences', 'all time controls');
  const r = f.ratings.length ? f.ratings.map(bucketLabel).join(', ') : L('tous classements', 'all ratings');
  return `${sp} · ${r}`;
}

async function init() {
  // Langue (avant tout affichage) : en anglais, la traduction suit chaque rendu.
  try { await initLangue(); } catch { /* reste en français */ }
  $('btn-langue').textContent = langue() === 'en' ? 'FR' : 'EN';
  $('btn-langue').title = langue() === 'en' ? 'Passer en français' : 'Switch to English';
  $('btn-langue').onclick = () => choisirLangue(langue() === 'en' ? 'fr' : 'en');
  $('set-langue').value = langue();
  $('set-langue').onchange = (e) => choisirLangue(e.target.value);
  // Avant toute écriture locale : première visite → page d'accueil (sauf lien direct vers une page).
  const { premiereVisite } = initChoix();
  if (premiereVisite && !location.hash.replace(/^#\/?/, '')) history.replaceState(null, '', '#/accueil');
  // Retour de « Se connecter avec Lichess » (?code=…) : jeton enregistré sur l'appareil, pseudo
  // rempli dans Mes parties, adresse nettoyée.
  const auth = await terminerConnexion();
  if (auth) {
    history.replaceState(null, '', location.pathname + auth.retour);
    if (auth.ok) {
      store.setLichessToken(auth.token);
      try {
        const k = 'coach-echecs:mes-parties';
        const mp = JSON.parse(localStorage.getItem(k) || '{}');
        if (auth.username) { mp.lichess = auth.username; mp.lichessConnecte = auth.username; }
        localStorage.setItem(k, JSON.stringify(mp));
      } catch { /* stockage plein */ }
    }
    state.authMessage = auth.ok ? L(`✔ Connecté à Lichess${auth.username ? ` : ${auth.username}` : ''}. Tes parties peuvent être chargées.`, `✔ Connected to Lichess${auth.username ? `: ${auth.username}` : ''}. Your games can now be loaded.`) : auth.message;
  }
  applyAppearance(state.settings);
  fillSelects();
  restoreGame();
  board.setOrientation(state.game.playerColor);
  bindUi();
  try {
    const cfg = await (await fetch('./config.json', { cache: 'no-cache' })).json();
    state.config = { ...state.config, ...cfg };
  } catch { /* pas de config publiée : pas d'API Claude */ }
  demarrerStats(state.config); // compteur de visites anonyme, site publié seulement
  setPaymentUrl(state.config.paymentUrl);
  bindPaywall();
  renderPlan();
  $('btn-pro').addEventListener('click', () => openPaywall());
  window.addEventListener('pro-change', () => {
    renderPlan();
    if (repertoirePage) repertoirePage.render();
    if (trainingPage && !trainingPage.drill && !trainingPage.lesson) trainingPage.renderSetup();
  });
  refreshCoachPill();
  renderAll();
  initRouter({
    onShow: (page) => {
      if (page === 'repertoire') {
        repertoirePage ??= new RepertoirePage({
          el: $('page-repertoire'),
          client: lichess,
          getFilter: () => ({ ...DEFAULT_FILTER, ...(state.settings.explorerFilter || {}) }),
          openSan: (san, color, label) => openSanInBoard(san, color, label, { animate: true }),
          openMaster: openMasterGame,
          openGame: (san, color, label, headers) => openSanInBoard(san, color, label, { headers }),
          youtube: new YouTubeClient({ getKey: () => store.getYoutubeKey() }),
        });
        repertoirePage.show();
      }
      if (page === 'entrainement') {
        trainingPage ??= new TrainingPage({ el: $('page-entrainement'), engine, client: lichess, getFilter: currentFilter, filterLabel, openSan: (san, color, label) => openSanInBoard(san, color, label) });
        trainingPage.show();
      }
      if (page === 'parties') ensureGamesPage().show();
      if (page === 'accueil') { accueilPage ??= new AccueilPage({ el: $('page-accueil') }); accueilPage.show(); }
      if (page === 'progression') { progressionPage ??= new ProgressionPage({ el: $('page-progression'), client: lichess }); progressionPage.show(); }
      if (page === 'ouvertures') {
        // Choix enregistré : rechargement, pour que toutes les pages suivent les nouvelles ouvertures.
        choixPage ??= new ChoixPage({ el: $('page-ouvertures'), onSaved: () => { location.hash = '#/repertoire'; location.reload(); } });
        choixPage.show();
      }
      // Le moteur est partagé : en revenant sur la page Moteur, on relance le calcul si
      // une autre page l'a interrompu.
      if (page === 'moteur' && state.game && state.analysis.status !== 'ready' && !state.game.status().over && engine.state === 'ready') {
        runAnalysis(BUDGETS[state.settings.budget].movetime);
      }
    },
  });
  // Premier lancement, ouvertures choisies : visite guidée (une fois).
  if (visiteAFaire()) setTimeout(() => lancerVisite(), 900);
  // Guide d'installation et rappels de sauvegarde (jamais pendant la visite guidée).
  demarrerInstallation();
  // Synchronisation entre appareils (si activée) : section des réglages, envoi / réception automatiques.
  demarrerSync({ apiUrl: () => state.settings.apiUrl || state.config.apiUrl });
  try {
    await engine.load();
  } catch { /* état d'erreur déjà affiché */ }
  // Moteur prêt. Si une position passée est affichée (ligne testée en cours de rejeu pendant
  // le chargement), on la garde : le calcul de la partie reprendra au retour en direct.
  if (state.viewPly !== null && engine.state === 'ready') {
    analyzeView(state.viewPly);
    renderAll();
  } else onPositionChanged('init');
}

function restoreGame() {
  const rec = store.loadGameRecord();
  if (rec && !rec.corrupt) {
    try {
      state.game = Game.fromRecord(rec);
      return;
    } catch (e) {
      store.keepCorrupt(rec);
      flash(L(`La sauvegarde n’a pas pu être relue (${e.message}). Une nouvelle partie a été créée ; l’ancienne est conservée.`, `The saved game could not be read (${e.message}). A new game has been created; the old one has been kept.`), true);
    }
  } else if (rec?.corrupt) {
    store.keepCorrupt(rec.corrupt);
  }
  state.game = Game.create({ playerColor: 'w', level: state.settings.level });
  store.saveGame(state.game.toJSON());
}

// ---------- Cycle principal ----------

// Appelé après tout changement de la partie réelle.
function onPositionChanged(reason) {
  const g = state.game;
  store.saveGame(g.toJSON());
  state.viewPly = null;
  state.variante = null;
  state.view = null;
  viewJob++;
  // Toute explication en cours devient obsolète.
  abortCoach();
  state.coach = { status: 'idle', token: null, html: '', error: null, abort: null, meta: null };
  state.analysis = { status: 'waiting-engine', token: null, live: null, advice: null, error: null, deeper: false };
  state.reveal = 0;
  renderAll();
  optimal.setHidden(false);
  optimal.setEngine(engine.state === 'error' ? 'error' : 'computing', null);
  optimal.update(g);
  const st = g.status();
  if (st.over) {
    engine.cancelAll();
    state.analysis.status = 'over';
    renderAdvice();
    return;
  }
  runAnalysis(autoplay.running ? AUTO_MOVETIME : BUDGETS[state.settings.budget].movetime);
}

let jobCounter = 0;
const CANDIDATES = 3; // coups candidats comparés (MultiPV) ; 1 pendant la suite automatique

async function runAnalysis(movetime, { deeper = false } = {}) {
  const g = state.game;
  if (engine.state !== 'ready') {
    state.analysis.status = engine.state === 'error' ? 'engine-error' : 'waiting-engine';
    renderAdvice();
    return;
  }
  const token = g.token();
  const jobId = ++jobCounter;
  const previous = deeper ? state.analysis.advice : null;
  state.analysis = { status: 'computing', jobId, token, live: null, advice: previous, error: null, deeper, movetime, started: performance.now() };
  renderAdvice();
  let res;
  try {
    res = await engine.analyze({
      position: g.uciPosition(),
      movetime,
      token,
      multipv: autoplay.running ? 1 : CANDIDATES,
      onInfo: (info) => {
        if (!g.isCurrent(token) || state.analysis.jobId !== jobId) return;
        state.analysis.live = info;
        renderLive();
      },
    });
  } catch (e) {
    if (state.game.isCurrent(token) && state.analysis.jobId === jobId) {
      state.analysis = { ...state.analysis, status: 'engine-error', error: e.message };
      optimal.setEngine('error', null);
      renderAdvice();
      renderBoard();
    }
    return;
  }
  // Réponse tardive d'une position qui n'est plus la position actuelle : ignorée.
  if (!state.game.isCurrent(token) || state.analysis.jobId !== jobId) return;
  if (res.cancelled) {
    // Calcul interrompu par une autre page qui utilisait le moteur : on garde le dernier
    // conseil valide, sinon on relance dès que la page Moteur est affichée.
    if (previous) {
      state.analysis = { ...state.analysis, status: 'ready', live: null };
      optimal.setEngine('ready', previous);
    } else if (!$('page-moteur').classList.contains('hidden') && state.viewPly === null) {
      setTimeout(() => { if (state.game.isCurrent(token) && state.analysis.jobId === jobId) runAnalysis(movetime); }, 150);
      return;
    } else {
      state.analysis = { ...state.analysis, status: 'waiting-engine', live: null };
    }
    renderAdvice();
    return;
  }
  const advice = buildAdvice(g, res);
  if (!advice.ok) {
    state.analysis = { ...state.analysis, status: 'error', error: advice.error };
    renderAdvice();
    return;
  }
  state.analysis = { ...state.analysis, status: 'ready', advice, live: null };
  optimal.setHidden(moveHidden());
  optimal.setEngine('ready', advice);
  if (!advice.isPlayerTurn) {
    state.expectation = { gameId: g.id, revision: g.revision, ply: g.ply, uci: advice.best.lan, san: advice.best.san };
  }
  renderAdvice();
  renderBoard();
  if (advice.isPlayerTurn && !deeper && state.settings.autoExplain && !autoplay.running) explain({ auto: true });
  if (autoplay.running) autoStep();
}

// Ramène l'échiquier à l'écran s'il n'est plus visible (bouton « Confirmer » ou tableau
// de statistiques situés plus bas sur téléphone). Ne fait rien s'il est déjà visible.
function revealBoard() {
  const el = $('turn-banner');
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.top > window.innerHeight * 0.5) {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: window.scrollY + r.top - 8, behavior: smooth ? 'smooth' : 'auto' });
  }
}

function playMove(input, source) {
  const g = state.game;
  if (state.variante || state.viewPly !== null) {
    if (source === 'board') return playVariante(input);
    return;
  }
  const before = { revision: g.revision, ply: g.ply, gameId: g.id, wasPlayer: g.isPlayerTurn() };
  const advice = state.analysis.status === 'ready' && g.isCurrent(state.analysis.token) ? state.analysis.advice : null;
  let mv;
  try {
    mv = g.play(input);
  } catch (e) {
    notationMsg(e.message, true);
    renderBoard();
    return false;
  }
  notationMsg(source === 'notation' ? L(`Coup joué : ${sanFr(mv.san)}`, `Move played: ${sanFr(mv.san)}`) : '');
  // Comparaison avec ce que le moteur avait calculé pour cette position précise.
  state.deviation = null;
  if (before.wasPlayer) {
    if (advice && advice.best.lan !== mv.lan) {
      state.deviation = { who: 'player', played: mv.san, expected: advice.best.san };
    }
    // Si le joueur suit le conseil, la réponse adverse prévue est le 2e coup de la variante.
    state.expectation = advice && advice.best.lan === mv.lan && advice.reply
      ? { gameId: g.id, revision: g.revision, ply: g.ply, uci: advice.reply.lan, san: advice.reply.san, provisional: true }
      : null;
  } else {
    const ex = state.expectation;
    if (ex && ex.gameId === before.gameId && ex.ply === before.ply && ex.revision === before.revision && ex.uci !== mv.lan) {
      state.deviation = { who: 'opponent', played: mv.san, expected: ex.san };
    }
    state.expectation = null;
  }
  onPositionChanged('move');
  if (source === 'confirm' || source === 'explorer') revealBoard();
  return true;
}

// ---------- Explications Claude ----------

function abortCoach() {
  if (state.coach.abort) state.coach.abort.abort();
}

// Explication du conseil : rédigée par Claude si l'API est configurée, sinon explication
// gratuite construite uniquement à partir des calculs (explain-free.js).
async function explain({ auto = false } = {}) {
  const g = state.game;
  const advice = state.analysis.advice;
  if (!advice || !g.isCurrent(advice.token)) return;
  const free = !!coach.missing();
  abortCoach();
  const token = advice.token;
  const ctrl = new AbortController();
  state.coach = { status: 'loading', mode: free ? 'free' : 'claude', token, html: '', error: null, abort: ctrl, meta: null };
  renderCoach();
  if (!auto) revealCoach();

  // Menace : coup que l'adversaire jouerait s'il avait le trait (calcul réel, court).
  let threat = null;
  const st = g.status();
  if (advice.isPlayerTurn && !st.inCheck && engine.state === 'ready') {
    try {
      const nf = nullMoveFen(advice.fen);
      const res = await engine.analyze({ position: `position fen ${nf}`, movetime: 800, token });
      if (!res.cancelled) threat = buildThreat(advice.fen, res);
    } catch { threat = null; }
  }
  if (!g.isCurrent(token) || ctrl.signal.aborted) return;

  // Version masquée (sans le coup) pour le mode « Indice d'abord », calculée dans tous les cas.
  const masked = advice.isPlayerTurn
    ? renderExplication(explicationGratuite({ game: g, advice, threat, deviation: state.deviation, masquer: true })) : '';
  state.hintThreat = { token, threat };
  if (free) {
    const sections = explicationGratuite({ game: g, advice, threat, deviation: state.deviation });
    // La flèche rouge n'est dessinée que pour une menace sérieuse.
    const shown = menaceSerieuse(advice, threat, g.playerColor) ? threat : null;
    state.coach = { status: 'ready', mode: 'free', token, html: renderExplication(sections), htmlMasked: masked, error: null, abort: null, meta: { depth: advice.depth, threat: shown } };
    renderCoach();
    renderAdvice();
    if (threat) renderBoard();
    return;
  }
  state.coach.htmlMasked = masked;

  const payload = buildCoachPayload({
    game: g, advice, threat, level: g.record.level,
    lastReplyExpected: state.deviation && state.deviation.who === 'opponent'
      ? { expectedSan: state.deviation.expected, playedSan: state.deviation.played } : null,
  });
  try {
    const data = await coach.explain(payload, ctrl.signal);
    if (!g.isCurrent(token) || ctrl.signal.aborted) return; // réponse tardive ignorée
    const allowed = allowedMoveSet(payload, g.legalMoves().map((m) => m.san));
    const r = renderCoachText(data.text || '', allowed);
    state.coach = {
      status: 'ready', token, html: r.html, error: null, abort: null,
      meta: { model: data.model, unverified: r.unverified, depth: advice.depth, threat, remaining: data.remainingToday },
    };
    if (threat) renderBoard();
  } catch (e) {
    if (e.name === 'AbortError' || !g.isCurrent(token)) return;
    state.coach = { status: 'error', token, html: '', error: e.message, kind: e instanceof CoachError ? e.kind : 'server', abort: null, meta: null };
  }
  renderCoach();
  refreshCoachPill();
}

// ---------- Rendu ----------

function renderAll() {
  renderTurn();
  renderBoard();
  renderMoves();
  renderAdvice();
  renderCoach();
  renderButtons();
}

// Joueurs et contexte d'une partie ouverte depuis un PGN (maîtres, Élite, mes parties).
function renderGameInfo() {
  const h = state.game.record.headers || {};
  const el = $('game-info');
  if (!h.White && !h.Black) { el.classList.add('hidden'); return; }
  const who = (name, elo) => `${esc(name || '?')}${elo ? ` <span class="muted">(${esc(elo)})</span>` : ''}`;
  const year = (h.Date || '').slice(0, 4);
  const extra = [h.Event && !h.Event.startsWith('Test') ? h.Event : '', /^\d{4}$/.test(year) ? year : '', h.Result && h.Result !== '*' ? h.Result : ''].filter(Boolean);
  const link = /^https:\/\//.test(h.Site || '') ? ` · <a href="${esc(h.Site)}" target="_blank" rel="noopener">${L('partie originale ↗', 'original game ↗')}</a>` : '';
  el.innerHTML = `<span class="dot w"></span> ${who(h.White, h.WhiteElo)} – <span class="dot b"></span> ${who(h.Black, h.BlackElo)}${extra.length ? ` <span class="muted">· ${extra.map(esc).join(' · ')}</span>` : ''}${link}`;
  el.classList.remove('hidden');
}

function renderTurn() {
  renderGameInfo();
  const g = state.game;
  const st = g.status();
  const el = $('turn-banner');
  const turn = st.turn;
  if (st.over) {
    const reasons = { mat: L('échec et mat', 'checkmate'), pat: L('pat', 'stalemate'), materiel: L('matériel insuffisant', 'insufficient material'), quintuple: L('quintuple répétition', 'fivefold repetition'), '75coups': L('règle des 75 coups', '75-move rule') };
    el.className = 'turn-banner over';
    el.innerHTML = `<span>${L('Partie terminée : ', 'Game over: ')}${esc(st.result)} <span class="sub">(${reasons[st.reason]})</span></span>`;
    return;
  }
  const player = turn === g.playerColor;
  el.className = 'turn-banner ' + (player ? 'player' : 'opponent');
  el.innerHTML = `<span class="dot ${turn}"></span><span>${L(`Trait aux ${COLOR_NAMES[turn]}${st.inCheck ? ' — échec !' : ''}`, `${turn === 'w' ? 'White' : 'Black'} to move${st.inCheck ? ' — check!' : ''}`)}<br>
    <span class="sub">${player ? L('À vous de jouer', 'Your move') : L('Saisissez le coup réellement joué par l’adversaire', 'Enter the move your opponent actually played')}</span></span>`;
}

function renderBoard() {
  const g = state.game;
  if (state.variante) { renderBoardVariante(); return; }
  const ply = state.viewPly ?? g.ply;
  const live = state.viewPly === null;
  const st = g.status();
  const pos = g.chessAt(ply);
  board.setPosition(pos, {
    lastMove: ply > 0 ? g.verboseMove(ply - 1) : null,
    // Position passée : un coup joué ouvre un brouillon (la partie ne change pas).
    interactive: live ? !st.over : !pos.isGameOver(),
  });
  const arrows = [];
  const a = state.analysis;
  const hide = moveHidden();
  board.setHint(hide && (state.reveal || 0) >= 2 && !a.advice.best.san.startsWith('O-O') ? a.advice.best.from : null);
  if (live && a.advice && g.isCurrent(a.advice.token) && a.status !== 'engine-error' && !hide) {
    if (a.advice.isPlayerTurn || state.settings.showOpponentArrow) arrows.push(...altArrows(a.advice));
    if (a.advice.isPlayerTurn) arrows.push({ from: a.advice.best.from, to: a.advice.best.to, kind: 'best' });
    else if (state.settings.showOpponentArrow) arrows.push({ from: a.advice.best.from, to: a.advice.best.to, kind: 'reply' });
    const th = state.coach.meta?.threat;
    if (th && state.coach.token && g.isCurrent(state.coach.token)) arrows.push({ from: th.move.from, to: th.move.to, kind: 'threat' });
  }
  if (live && !hide) {
    const stat = optimal.statArrow((t) => optimal.game?.isCurrent(t));
    // Flèche bleue seulement si le coup statistique diffère du coup moteur déjà fléché.
    if (stat && !arrows.some((x) => x.from === stat.from && x.to === stat.to)) arrows.push(stat);
  }
  if (!live && state.view?.status === 'ready' && state.view.ply === state.viewPly) {
    const b = state.view.advice.best;
    arrows.push(...altArrows(state.view.advice));
    arrows.push({ from: b.from, to: b.to, kind: state.view.advice.isPlayerTurn ? 'best' : 'reply' });
    const stat = optimal.statArrow((t) => optimal.game?.isCurrent(t));
    if (stat && !(stat.from === b.from && stat.to === b.to)) arrows.push(stat);
  }
  board.setArrows(arrows);
  $('view-banner').classList.toggle('hidden', live);
  if (!live) $('view-text').textContent = (ply === 0 ? L('Vous consultez la position de départ.', 'You are viewing the starting position.') : L(`Vous consultez la position après ${moveLabel(ply - 1)}.`, `You are viewing the position after ${moveLabel(ply - 1)}.`))
    + ' ' + L('Jouez un coup sur l’échiquier pour essayer une autre idée : la partie ne change pas.', 'Play a move on the board to try another idea: the game does not change.');
  $('btn-quitter-brouillon').classList.add('hidden');
}

// Candidats 2 et 3 : flèches discrètes, dessinées sous la flèche du meilleur coup.
function altArrows(adv) {
  return (adv.candidates || []).slice(1).map((c) => ({ from: c.move.from, to: c.move.to, kind: 'alt' }));
}

function moveLabel(i) {
  const g = state.game;
  const m = g.verboseMove(i);
  const startNo = Number(g.startFen.split(' ')[5] || 1);
  const startTurn = g.startFen.split(' ')[1];
  const idx = i + (startTurn === 'b' ? 1 : 0);
  const no = startNo + Math.floor(idx / 2);
  return `${no}${m.color === 'w' ? '.' : '…'} ${sanFr(m.san)}`;
}

// Barre ⏮ ◀ ▶ ⏭ sous l'échiquier : indique la position affichée.
function renderNav() {
  const g = state.game;
  const v = state.variante;
  if (v) {
    $('nav-label').textContent = v.cur === 0 ? L('🧪 Brouillon · départ', '🧪 Draft · start') : L(`🧪 Brouillon · après ${labelVariante(v.cur - 1)}`, `🧪 Draft · after ${labelVariante(v.cur - 1)}`);
    $('nav-label').classList.add('viewing');
    document.querySelectorAll('[data-nav]').forEach((b) => { b.disabled = false; });
    document.querySelectorAll('[data-nav=next]').forEach((b) => { b.disabled = v.cur >= v.coups.length; });
    return;
  }
  const cur = state.viewPly ?? g.ply;
  const live = state.viewPly === null;
  $('nav-label').textContent = cur === 0 ? (g.ply ? L('Position de départ', 'Starting position') : L('Aucun coup joué', 'No moves played'))
    : L(`${live ? 'Actuelle · ' : ''}après ${moveLabel(cur - 1)}`, `${live ? 'Current · ' : ''}after ${moveLabel(cur - 1)}`);
  $('nav-label').classList.toggle('viewing', !live);
  document.querySelectorAll('[data-nav=start], [data-nav=prev]').forEach((b) => { b.disabled = cur === 0; });
  document.querySelectorAll('[data-nav=next], [data-nav=end]').forEach((b) => { b.disabled = live; });
}

function renderMoves() {
  renderNav();
  const g = state.game;
  const ol = $('moves');
  const startNo = Number(g.startFen.split(' ')[5] || 1);
  const offset = g.startFen.split(' ')[1] === 'b' ? 1 : 0;
  const cur = state.viewPly ?? g.ply;
  let html = '';
  const total = g.ply + offset;
  for (let row = 0; row * 2 < total; row++) {
    html += `<li><span class="no">${startNo + row}.</span>`;
    for (let k = 0; k < 2; k++) {
      const i = row * 2 + k - offset;
      if (i < 0 || i >= g.ply) { html += '<span></span>'; continue; }
      const m = g.verboseMove(i);
      const cls = ['m', i + 1 === cur ? 'current' : '', m.color === g.playerColor ? 'player' : ''].join(' ');
      html += `<button type="button" class="${cls}" data-ply="${i + 1}">${esc(sanFr(m.san))}</button>`;
    }
    html += '</li>';
  }
  ol.innerHTML = html || '<li class="muted small" style="grid-column:1/-1">' + L('Aucun coup joué.', 'No moves played.') + '</li>';
  const curBtn = ol.querySelector('.current');
  // Fait défiler la liste des coups elle-même, jamais la page (sinon, sur téléphone,
  // chaque coup ferait descendre l'écran loin de l'échiquier).
  if (curBtn) {
    const lr = ol.getBoundingClientRect();
    const br = curBtn.getBoundingClientRect();
    if (br.bottom > lr.bottom) ol.scrollTop += br.bottom - lr.bottom + 4;
    else if (br.top < lr.top) ol.scrollTop -= lr.top - br.top + 4;
  }
  const notes = [];
  if (g.record.start.type === 'fen') notes.push(L('Départ depuis une FEN.', 'Started from a FEN.'));
  if (g.record.start.type === 'pgn') notes.push(L('Partie importée depuis un PGN.', 'Game imported from a PGN.'));
  if (g.historyUnknown) notes.push(L('L’historique antérieur à la position de départ est inconnu : les répétitions éventuelles d’avant ne sont pas comptées.', 'The history before the starting position is unknown: any earlier repetitions are not counted.'));
  $('start-note').textContent = notes.join(' ');
}

function renderButtons() {
  const g = state.game;
  const live = state.viewPly === null;
  const over = g.status().over;
  $('btn-undo').disabled = state.variante ? false : !g.ply;
  $('btn-undo').textContent = state.variante ? L('Annuler (brouillon)', 'Undo (draft)') : L('Annuler', 'Undo');
  $('btn-brouillon').disabled = !!state.variante || g.chessAt(state.viewPly ?? g.ply).isGameOver();
  $('btn-deeper').disabled = !live || over || engine.state !== 'ready';
  $('btn-deeper').textContent = state.analysis.status === 'computing' && state.analysis.deeper ? L('Arrêter l’analyse', 'Stop analysis') : L('Analyser davantage', 'Analyse deeper');
  $('btn-explain').disabled = !live || over || state.analysis.status !== 'ready';
  $('notation-input').disabled = !live || over;
  renderAutoplay();
}

const pct = (permille) => L((permille / 10).toFixed(1).replace('.', ',') + ' %', (permille / 10).toFixed(1) + '%');

function evalBlock(adv) {
  const wdl = adv.wdlPlayer;
  const wdlHtml = wdl ? `
    ${L(`<dt>Estimation V/N/D</dt><dd>victoire ${pct(wdl.win)} · nulle ${pct(wdl.draw)} · défaite ${pct(wdl.loss)} <span class="muted">(pour vous)</span>`, `<dt>W/D/L estimate</dt><dd>win ${pct(wdl.win)} · draw ${pct(wdl.draw)} · loss ${pct(wdl.loss)} <span class="muted">(for you)</span>`)}
    <div class="wdl-bar" aria-hidden="true"><span style="width:${wdl.win / 10}%"></span><span style="width:${wdl.draw / 10}%"></span><span style="width:${wdl.loss / 10}%"></span></div>
    <span class="muted small">${L('Estimation issue du modèle interne du moteur (jeu de niveau moteur des deux côtés), pas une probabilité garantie contre votre adversaire.', 'Estimate from the engine’s internal model (engine-level play on both sides), not a guaranteed probability against your opponent.')}</span></dd>` : '';
  return `<dt>${L('Évaluation', 'Evaluation')}</dt><dd><strong>${esc(adv.scoreText)}</strong> <span class="muted">${L(`(point de vue des Blancs${adv.scoreWhite?.type === 'cp' ? ', en pions' : ''})`, `(from White’s point of view${adv.scoreWhite?.type === 'cp' ? ', in pawns' : ''})`)}</span><br><span class="small">${esc(adv.verdict)}</span></dd>${wdlHtml}`;
}

// Comparaison des meilleurs coups (MultiPV) : écart avec le premier, du point de vue du camp au trait.
function candidatesBlock(adv) {
  const cands = adv.candidates || [];
  if (cands.length < 2) return '';
  const who = COLOR_NAMES[adv.turn];
  const rows = cands.map((c) => `<li class="cand cand-${c.rank}">
      <span class="cand-head"><strong class="cand-move">${esc(sanFr(c.san))}</strong> <span class="eval">${esc(c.scoreText)}</span>${c.rank > 1 && c.gap != null ? ` <span class="muted small">${L(`(${esc(formatGap(c.gap))} pour les ${who})`, `(${esc(formatGap(c.gap))} for ${adv.turn === 'w' ? 'White' : 'Black'})`)}</span>` : ''}</span>
      <span class="line small">${esc(c.lineText)}</span></li>`).join('');
  return `<details class="candidates" open><summary>${L(`Comparer les ${cands.length} meilleurs coups`, `Compare the ${cands.length} best moves`)}</summary>
    <ol class="cand-list">${rows}</ol>
    <p class="muted tiny">${L(`Calcul Stockfish en parallèle (MultiPV ${CANDIDATES}) : évaluations du point de vue des Blancs, écart en pions avec le premier coup. À temps égal, chaque ligne est un peu moins approfondie qu’un calcul d’un seul coup.`, `Parallel Stockfish calculation (MultiPV ${CANDIDATES}): evaluations from White’s point of view, gap in pawns from the first move. With the same time, each line is searched slightly less deeply than a single-move calculation.`)}</p>
  </details>`;
}

function techDetails(adv, a) {
  const nps = adv.nps ? L(`${Math.round(adv.nps / 1000)} k nœuds/s`, `${Math.round(adv.nps / 1000)} k nodes/s`) : '—';
  return `<details><summary>${L('Détails du calcul', 'Calculation details')}</summary>
    <dl>
      <dt>${L('Moteur', 'Engine')}</dt><dd>${esc(adv.engine || 'Stockfish')} ${L('(version « lite », monothread, pleine force)', '(“lite” version, single-threaded, full strength)')}</dd>
      <dt>${L('Profondeur', 'Depth')}</dt><dd>${adv.depth ?? '—'} (${L('sélective', 'selective')} ${adv.seldepth ?? '—'})</dd>
      <dt>${L('Temps', 'Time')}</dt><dd>${L(`${((adv.timeMs || 0) / 1000).toFixed(1).replace('.', ',')} s sur ${((a.movetime || adv.movetime) / 1000).toFixed(0)} s prévues`, `${((adv.timeMs || 0) / 1000).toFixed(1)} s of ${((a.movetime || adv.movetime) / 1000).toFixed(0)} s planned`)}</dd>
      <dt>${L('Nœuds', 'Nodes')}</dt><dd>${adv.nodes?.toLocaleString(L('fr-FR', 'en-US')) ?? '—'} · ${nps}</dd>
      <dt>${L('Variante (UCI)', 'Line (UCI)')}</dt><dd class="line">${esc(adv.line.map((m) => m.lan).join(' '))}${adv.lineTruncated ? L(' <span class="muted">(tronquée : coup invalide écarté)</span>', ' <span class="muted">(truncated: invalid move discarded)</span>') : ''}</dd>
    </dl>
    <p class="muted small">${L('La profondeur atteinte dépend de la puissance de l’appareil et du budget choisi ; elle n’est pas garantie.', 'The depth reached depends on your device’s power and the chosen budget; it is not guaranteed.')}</p>
  </details>`;
}

function deviationNote() {
  const d = state.deviation;
  if (!d) return '';
  if (d.who === 'opponent') {
    return `<p class="note">${L(`L’adversaire a joué <strong>${esc(sanFr(d.played))}</strong> ; la meilleure réponse calculée était ${esc(sanFr(d.expected))}. L’ancienne ligne est abandonnée : nouveau calcul à partir du coup réel.`, `Your opponent played <strong>${esc(sanFr(d.played))}</strong>; the best calculated reply was ${esc(sanFr(d.expected))}. The old line is dropped: new calculation from the actual move.`)}</p>`;
  }
  return `<p class="note">${L(`Vous avez joué <strong>${esc(sanFr(d.played))}</strong> au lieu du coup conseillé ${esc(sanFr(d.expected))}. L’analyse repart de votre coup réel.`, `You played <strong>${esc(sanFr(d.played))}</strong> instead of the recommended move ${esc(sanFr(d.expected))}. The analysis restarts from your actual move.`)}</p>`;
}

function renderMini() {
  const el = $('advice-mini');
  const a = state.analysis;
  const adv = a.advice && state.game.isCurrent(a.advice.token) ? a.advice : null;
  if (a.status === 'over') el.textContent = '';
  else if (a.status === 'engine-error') el.innerHTML = `<span class="error-text">${L('Moteur indisponible : aucun conseil.', 'Engine unavailable: no advice.')}</span>`;
  else if (state.variante) {
    const v = state.vueVariante;
    el.innerHTML = v?.status === 'ready' && v.id === state.variante.id
      ? `${L('Brouillon — meilleur coup : ', 'Draft — best move: ')}<strong class="best">${esc(sanFr(v.advice.best.san))}</strong> <span class="muted">(${esc(v.advice.scoreText)})</span>`
      : `<span class="muted">${L('Brouillon — Stockfish analyse…', 'Draft — Stockfish is analysing…')}</span>`;
  } else if (!adv) el.innerHTML = `<span class="muted">${L('Stockfish calcule…', 'Stockfish is calculating…')}</span>`;
  else if (state.viewPly !== null) {
    const v = state.view;
    el.innerHTML = v?.status === 'ready'
      ? `${L('Position consultée — meilleur coup : ', 'Viewed position — best move: ')}<strong class="best">${esc(sanFr(v.advice.best.san))}</strong> <span class="muted">(${esc(v.advice.scoreText)})</span>`
      : `<span class="muted">${L('Position consultée — Stockfish analyse…', 'Viewed position — Stockfish is analysing…')}</span>`;
  } else if (adv.isPlayerTurn && moveHidden()) el.innerHTML = `<span class="muted">${L('Mode indice : à vous de trouver le coup.', 'Hint mode: find the move yourself.')}</span>`;
  else if (adv.isPlayerTurn) el.innerHTML = `${L('Conseil : ', 'Advice: ')}<strong class="best">${esc(sanFr(adv.best.san))}</strong> — ${esc(adv.bestDescription)} <span class="muted">(${esc(adv.scoreText)})</span>`;
  else el.innerHTML = `${L('Meilleure réponse adverse calculée : ', 'Best calculated reply for your opponent: ')}<strong class="reply">${esc(sanFr(adv.best.san))}</strong> <span class="muted">${L('— saisissez le coup réel', '— enter the actual move')}</span>`;
}

function renderAdvice() {
  renderMini();
  const el = $('advice');
  if (state.variante) {
    renderButtons();
    renderVarianteAdvice(el);
    return;
  }
  if (state.viewPly !== null) {
    renderButtons();
    renderViewAdvice(el);
    return;
  }
  const a = state.analysis;
  const g = state.game;
  renderButtons();
  if (a.status === 'over') {
    const st = g.status();
    el.innerHTML = `<p class="label">${L('Partie terminée', 'Game over')}</p><p class="move-big">${esc(st.result)}</p><p class="desc">${L('Plus aucun calcul n’est lancé. Exportez la partie ou commencez-en une nouvelle.', 'No more calculations are run. Export the game or start a new one.')}</p>`;
    return;
  }
  if (a.status === 'waiting-engine') {
    el.innerHTML = `<div class="state"><span class="spinner"></span><span>${L('Chargement du moteur Stockfish…', 'Loading the Stockfish engine…')}</span></div>`;
    return;
  }
  if (a.status === 'engine-error') {
    el.innerHTML = `<p><span class="badge err">${L('Erreur', 'Error')}</span></p><div class="errbox"><strong>${L('Moteur indisponible.', 'Engine unavailable.')}</strong> ${esc(a.error || engine.lastError || '')}<br>${L('Aucun conseil n’est affiché tant que le moteur ne fonctionne pas.', 'No advice is shown until the engine is working.')}</div>
      <div class="actions"><button type="button" id="btn-restart-engine">${L('Redémarrer le moteur', 'Restart the engine')}</button></div>`;
    $('btn-restart-engine').onclick = async () => {
      try { await engine.restart(); onPositionChanged('restart'); } catch { renderAdvice(); }
    };
    return;
  }
  if (a.status === 'error') {
    el.innerHTML = `<p><span class="badge err">${L('Erreur', 'Error')}</span></p><div class="errbox">${esc(a.error)}</div>`;
    return;
  }
  const claim = g.status().claimable;
  const claimNote = claim.length
    ? `<p class="note">${L(`Nulle réclamable (${claim.map((c) => (c === 'triple' ? 'triple répétition' : 'règle des 50 coups')).join(', ')}). La partie continue tant que personne ne la réclame.`, `Draw can be claimed (${claim.map((c) => (c === 'triple' ? 'threefold repetition' : '50-move rule')).join(', ')}). The game continues as long as nobody claims it.`)}</p>` : '';
  const adv = a.advice && g.isCurrent(a.advice.token) ? a.advice : null;
  const computing = a.status === 'computing';
  const badge = computing
    ? `<span class="badge calc">${a.deeper ? L('Analyse approfondie en cours', 'Deep analysis in progress') : L('Calcul en cours', 'Calculating')}</span>`
    : `<span class="badge done">${L('Résultat disponible', 'Result available')}</span>`;
  let body = '';
  if (!adv) {
    body = `<div class="state"><span class="spinner"></span><span id="live-text">${L('Stockfish calcule…', 'Stockfish is calculating…')}</span></div>`;
  } else if (adv.isPlayerTurn && moveHidden()) {
    const r = state.reveal || 0;
    const th = state.hintThreat && state.game.isCurrent(state.hintThreat.token) ? state.hintThreat.threat : null;
    const hints = [];
    if (r >= 1) hints.push(...indicesNiveau1(adv, th, state.game.playerColor));
    if (r >= 2) hints.push(indiceNiveau2(adv));
    body = `<p class="label">${L('À vous de trouver le meilleur coup', 'Find the best move yourself')}</p>
      ${hints.length ? `<ul class="hints">${hints.map((h) => `<li>${h}</li>`).join('')}</ul>` : `<p class="desc">${L('Réfléchissez, puis demandez de l’aide si besoin.', 'Think it over, then ask for help if needed.')}</p>`}
      <dl>${evalBlock(adv)}</dl>
      <div class="actions hint-actions">
        <button type="button" id="btn-hint1" ${r >= 1 ? 'disabled' : ''}>${L('💡 Indice', '💡 Hint')}</button>
        <button type="button" id="btn-hint2" ${r >= 2 ? 'disabled' : ''}>${L('📖 Explication', '📖 Explanation')}</button>
        <button type="button" class="primary" id="btn-hint3">${L('👁 Montrer le coup', '👁 Show the move')}</button>
      </div>
      <p class="muted small">${L('Jouez votre coup directement sur l’échiquier quand vous l’avez trouvé : il sera comparé au calcul du moteur.', 'Play your move directly on the board once you have found it: it will be compared with the engine’s calculation.')}</p>`;
  } else if (adv.isPlayerTurn) {
    body = `<p class="label">${L('Coup conseillé par le moteur', 'Move recommended by the engine')}</p>
      <p class="move-big best">${esc(sanFr(adv.best.san))}</p>
      <p class="desc">${esc(adv.bestDescription)}</p>
      <dl>
        ${evalBlock(adv)}
        <dt>${L('Réponse adverse principale', 'Main opponent reply')}</dt><dd>${adv.reply ? `${esc(sanFr(adv.reply.san))} <span class="muted">${L('— calculée, pas une prédiction du choix humain', '— calculated, not a prediction of a human choice')}</span>` : '—'}</dd>
        <dt>${L('Suite calculée', 'Calculated line')}</dt><dd class="line">${esc(adv.lineText)}</dd>
      </dl>
      ${candidatesBlock(adv)}
      <div class="actions">
        <button type="button" class="primary" id="btn-play-best">${L(`Confirmer : je joue ${esc(sanFr(adv.best.san))}`, `Confirm: I play ${esc(sanFr(adv.best.san))}`)}</button>
      </div>
      <p class="muted small">${L('Le coup n’est enregistré qu’après confirmation. Vous pouvez aussi jouer un autre coup sur l’échiquier.', 'The move is only recorded after confirmation. You can also play another move on the board.')}</p>`;
  } else {
    body = `<p class="label">${L('Meilleure réponse adverse calculée', 'Best calculated reply for your opponent')}</p>
      <p class="move-big reply">${esc(sanFr(adv.best.san))}</p>
      <p class="desc">${esc(adv.bestDescription)}</p>
      <p class="small muted">${L('Le moteur indique le coup le plus fort pour l’adversaire ; un humain peut jouer autre chose. Saisissez le coup qu’il a réellement joué.', 'The engine shows the strongest move for your opponent; a human may play something else. Enter the move they actually played.')}</p>
      <dl>${evalBlock(adv)}<dt>${L('Suite calculée', 'Calculated line')}</dt><dd class="line">${esc(adv.lineText)}</dd></dl>
      ${candidatesBlock(adv)}`;
  }
  const liveLine = computing && adv ? `<p class="small muted" id="live-text"></p>` : '';
  el.innerHTML = `<p>${badge}</p>${deviationNote()}${claimNote}${body}${liveLine}${adv ? techDetails(adv, a) : ''}`;
  $('btn-hint1')?.addEventListener('click', () => setReveal(1));
  $('btn-hint2')?.addEventListener('click', () => setReveal(2));
  $('btn-hint3')?.addEventListener('click', () => setReveal(3));
  const modeLink = document.createElement('p');
  modeLink.className = 'small';
  modeLink.innerHTML = `<button type="button" class="link-btn" id="btn-toggle-help">${hintMode() ? L('Passer en conseil direct', 'Switch to direct advice') : L('Passer en mode « Indice d’abord »', 'Switch to “Hint first” mode')}</button>`;
  if (adv && adv.isPlayerTurn) el.appendChild(modeLink);
  $('btn-toggle-help')?.addEventListener('click', () => {
    state.settings.helpMode = hintMode() ? 'direct' : 'indice';
    store.saveSettings(state.settings);
    optimal.setHidden(moveHidden());
    renderAdvice();
    renderCoach();
    renderBoard();
  });
  const pb = $('btn-play-best');
  if (pb) pb.onclick = () => playMove(adv.best.lan, 'confirm');
  renderLive();
}

function renderLive() {
  const el = $('live-text');
  const a = state.analysis;
  if (!el || a.status !== 'computing') return;
  const i = a.live;
  const elapsedRaw = ((performance.now() - (a.started || performance.now())) / 1000).toFixed(1);
  const elapsed = L(elapsedRaw.replace('.', ','), elapsedRaw);
  if (!i) { el.textContent = L('Stockfish calcule…', 'Stockfish is calculating…'); return; }
  const sc = i.score ? formatScore({ type: i.score.type, value: i.score.value * (state.game.turn() === 'w' ? 1 : -1) }) : '';
  el.textContent = L(`Stockfish calcule… profondeur ${i.depth ?? '—'} · ${elapsed} s${sc ? ' · éval. provisoire ' + sc : ''}`, `Stockfish is calculating… depth ${i.depth ?? '—'} · ${elapsed} s${sc ? ' · provisional eval ' + sc : ''}`);
}

// ---------- Mode « Indice d'abord » ----------
// reveal : 0 rien, 1 indice, 2 explication sans le coup, 3 coup montré.

function currentAdvice() {
  const a = state.analysis;
  return a.advice && state.game.isCurrent(a.advice.token) ? a.advice : null;
}

function hintMode() { return state.settings.helpMode === 'indice'; }

// Vrai tant que le coup conseillé doit rester caché.
function moveHidden() {
  const adv = currentAdvice();
  return hintMode() && state.viewPly === null && !!adv && adv.isPlayerTurn && (state.reveal || 0) < 3;
}

function setReveal(level) {
  state.reveal = Math.max(state.reveal || 0, level);
  if (level >= 2 && state.coach.status === 'idle') explain({ auto: true });
  optimal.setHidden(moveHidden());
  renderAdvice();
  renderCoach();
  renderBoard();
}

// Fait apparaître le panneau d'explication s'il est hors de l'écran (demande explicite).
function revealCoach() {
  const r = $('coach').getBoundingClientRect();
  if (r.top > window.innerHeight - 80 || r.bottom < 0) $('coach').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderCoach() {
  const el = $('coach');
  const c = state.coach;
  const missing = coach.missing();
  const head = missing ? L('<h2>Explication <span class="badge">calculée · gratuite</span></h2>', '<h2>Explanation <span class="badge">calculated · free</span></h2>') : L('<h2>Explication de l’entraîneur (Claude)</h2>', '<h2>Coach’s explanation (Claude)</h2>');
  if (c.status === 'loading' && c.mode === 'free') {
    el.innerHTML = `${head}<div class="state"><span class="spinner"></span><span>${L('Stockfish cherche la menace adverse…', 'Stockfish is looking for your opponent’s threat…')}</span></div>`;
    return;
  }
  if (moveHidden() && c.token && state.game.isCurrent(c.token) && c.status !== 'loading') {
    el.innerHTML = state.reveal >= 2 && c.htmlMasked
      ? `<h2>${L('Explication', 'Explanation')} <span class="badge">${L('sans le coup', 'without the move')}</span></h2><div class="text">${c.htmlMasked}</div><p class="muted small">${L('Le coup conseillé reste caché jusqu’à « Montrer le coup ».', 'The recommended move stays hidden until “Show the move”.')}</p>`
      : L('<h2>Explication</h2><p class="muted small">Mode « Indice d’abord » : l’explication s’affiche au 2e niveau d’aide.</p>', '<h2>Explanation</h2><p class="muted small">“Hint first” mode: the explanation appears at the 2nd help level.</p>');
    return;
  }
  if (c.status === 'ready' && c.mode === 'free' && c.token && state.game.isCurrent(c.token)) {
    el.innerHTML = `${head}<div class="text">${c.html}</div>
      <p class="muted small">${L(`Construite uniquement à partir des calculs de Stockfish (profondeur ${c.meta?.depth ?? '—'}) et des règles du jeu, sans IA. Flèche rouge pointillée (si présente) : une menace sérieuse de l’adversaire. Pour un texte rédigé par Claude, activez l’API (⚙ Réglages).`, `Built only from Stockfish’s calculations (depth ${c.meta?.depth ?? '—'}) and the rules of the game, without AI. Dotted red arrow (if shown): a serious threat from your opponent. For a text written by Claude, enable the API (⚙ Settings).`)}</p>`;
    return;
  }
  if (c.status === 'loading') {
    el.innerHTML = `${head}<div class="state"><span class="spinner"></span><span>${L('Claude rédige une explication à partir des calculs du moteur…', 'Claude is writing an explanation from the engine’s calculations…')}</span></div>`;
    return;
  }
  if (c.status === 'ready' && c.token && state.game.isCurrent(c.token)) {
    const m = c.meta || {};
    const warn = m.unverified?.length
      ? `<p class="note">${L(`Coup(s) cité(s) non vérifié(s) par le moteur : ${m.unverified.map(esc).join(', ')}. À prendre avec prudence.`, `Quoted move(s) not verified by the engine: ${m.unverified.map(esc).join(', ')}. Treat with caution.`)}</p>` : '';
    el.innerHTML = `${head}<div class="text">${c.html}</div>${warn}
      <p class="muted small">${L(`Explication fondée sur l’analyse Stockfish (profondeur ${m.depth ?? '—'}). Les coups surlignés en vert figurent dans les variantes calculées. ${m.model ? 'Modèle : ' + esc(m.model) + '.' : ''}${m.remaining != null ? ` Appels restants aujourd’hui : ${m.remaining}.` : ''}`, `Explanation based on Stockfish analysis (depth ${m.depth ?? '—'}). Moves highlighted in green appear in the calculated lines. ${m.model ? 'Model: ' + esc(m.model) + '.' : ''}${m.remaining != null ? ` Calls left today: ${m.remaining}.` : ''}`)}</p>`;
    return;
  }
  if (c.status === 'error') {
    el.innerHTML = `${head}<div class="errbox">${L('Explication indisponible : ', 'Explanation unavailable: ')}${esc(c.error)}</div><p class="muted small">${L('Les calculs du moteur ci-dessus restent valables.', 'The engine calculations above remain valid.')}</p>`;
    return;
  }
  if (missing) {
    el.innerHTML = `${head}<p class="muted small">${state.settings.autoExplain ? L('L’explication s’affiche automatiquement quand c’est à vous de jouer.', 'The explanation appears automatically when it is your move.') : L('Touchez « Expliquer » pour une explication du conseil.', 'Tap “Explain” for an explanation of the advice.')} ${L('Version gratuite, calculée sans IA.', 'Free version, calculated without AI.')}</p>`;
    return;
  }
  el.innerHTML = `${head}<p class="muted small">${state.settings.autoExplain ? L('L’explication arrive automatiquement quand c’est à vous de jouer.', 'The explanation arrives automatically when it is your move.') : L('Touchez « Expliquer » pour une explication du conseil.', 'Tap “Explain” for an explanation of the advice.')}</p>`;
}

// Moteur en panne (souvent après une mise en arrière-plan sur iPhone) : redémarrage automatique au
// retour sur la page, et au plus une fois par minute sinon ; le bouton « Redémarrer » reste là.
let lastAutoRestart = 0;
async function autoRestartEngine() {
  if (engine.state !== 'error' || document.hidden || Date.now() - lastAutoRestart < 60000) return;
  lastAutoRestart = Date.now();
  try { await engine.restart(); onPositionChanged('restart'); } catch { renderAdvice(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastAutoRestart = 0; autoRestartEngine(); } });

function renderEnginePill(s) {
  const el = $('engine-pill');
  if (s.state === 'loading') {
    el.className = 'pill warn';
    el.textContent = s.cached ? L('Moteur : depuis le cache…', 'Engine: from cache…') : L(`Moteur : chargement ${Math.round((s.progress || 0) * 100)} %`, `Engine: loading ${Math.round((s.progress || 0) * 100)}%`);
    if (s.total) el.title = L(`Téléchargement unique de ${(s.total / 1e6).toFixed(1)} Mo, puis conservé sur l’appareil.`, `One-time download of ${(s.total / 1e6).toFixed(1)} MB, then kept on the device.`);
  } else if (s.state === 'ready') {
    el.className = 'pill ok';
    el.textContent = L('Moteur prêt', 'Engine ready');
    el.title = `${s.name} — ${s.manifest?.engine || ''}`;
    $('engine-info').textContent = L(`Moteur : ${s.name} (${s.manifest?.engine}). Réseau NNUE « lite » intégré (${(s.manifest?.wasmBytes / 1e6).toFixed(1)} Mo) : plus léger que le réseau complet, donc un peu moins fort, mais très au-dessus du niveau humain.`, `Engine: ${s.name} (${s.manifest?.engine}). Built-in “lite” NNUE network (${(s.manifest?.wasmBytes / 1e6).toFixed(1)} MB): lighter than the full network, so slightly weaker, but far above human level.`);
  } else if (s.state === 'error') {
    el.className = 'pill err';
    el.textContent = L('Moteur en panne', 'Engine down');
    el.title = s.message;
    engine.lastError = s.message;
    setTimeout(autoRestartEngine, 1500);
    optimal.setEngine('error', null);
    if (state.game) { state.analysis.status = 'engine-error'; state.analysis.error = s.message; renderAdvice(); }
  }
  if (state.game) renderButtons();
}

async function refreshCoachPill() {
  const el = $('coach-pill');
  const missing = coach.missing();
  if (missing) {
    el.className = 'pill hidden'; // badge discret : masqué tant que Claude n'est pas configuré
    el.textContent = L('Claude : indisponible', 'Claude: unavailable');
    el.title = missing;
    return;
  }
  el.className = 'pill warn';
  el.textContent = L('Claude : vérification…', 'Claude: checking…');
  try {
    const s = await coach.status();
    const hadRelay = state.relay;
    state.relay = !!s.explorerProxy;
    if (state.relay !== hadRelay && state.game) optimal.update(state.game);
    el.className = 'pill ok';
    el.textContent = L('Claude : prêt', 'Claude: ready');
    el.title = L(`Modèle ${s.model} · ${s.usedToday}/${s.dailyLimit} appels aujourd’hui`, `Model ${s.model} · ${s.usedToday}/${s.dailyLimit} calls today`);
  } catch (e) {
    el.className = 'pill err';
    el.textContent = L('Claude : erreur', 'Claude: error');
    el.title = e.message;
  }
}

function notationMsg(text, err = false) {
  const el = $('notation-msg');
  el.textContent = text;
  el.classList.toggle('err', err);
}
function flash(text, err) { notationMsg(text, err); }

// ---------- Navigation dans l'historique ----------

function viewAt(ply) {
  const g = state.game;
  ply = Math.max(0, Math.min(g.ply, ply));
  const wasViewing = state.viewPly !== null;
  if (state.variante) fermerVariante();
  state.viewPly = ply === g.ply ? null : ply;
  if (state.viewPly !== null) {
    analyzeView(ply);
  } else {
    state.view = null;
    viewJob++;
    if (wasViewing) {
      // Retour à la position actuelle : panneau « Coup optimal » et calcul de la partie réelle.
      optimal.update(g);
      if (state.analysis.status === 'ready' && g.isCurrent(state.analysis.advice?.token)) optimal.setEngine('ready', state.analysis.advice);
      else if (!g.status().over) runAnalysis(BUDGETS[state.settings.budget].movetime);
    }
  }
  renderBoard();
  renderMoves();
  renderButtons();
  renderAdvice();
}

// Partie « vue » à un demi-coup passé, présentée avec la même interface que Game pour
// les fonctions de conseil (buildAdvice) et le panneau « Coup optimal ».
function viewGameAt(ply) {
  const g = state.game;
  const fen = g.fen(ply);
  const tok = { gameId: g.id, branchId: 'vue', revision: g.revision, ply };
  return {
    playerColor: g.playerColor,
    startFen: g.startFen,
    moves: g.moves.slice(0, ply),
    fen: () => fen,
    turn: () => fen.split(' ')[1],
    token: () => tok,
    isCurrent: (t) => !!t && t.branchId === 'vue' && t.ply === ply && t.revision === g.revision && t.gameId === g.id && state.viewPly === ply,
    status: () => { const c = new Chess(fen); return { over: c.isCheckmate() || c.isStalemate() || c.isInsufficientMaterial() }; },
  };
}

let viewJob = 0;
async function analyzeView(ply) {
  const g = state.game;
  const job = ++viewJob;
  const vg = viewGameAt(ply);
  state.view = { ply, status: 'computing', advice: null, game: vg };
  optimal.update(vg);
  optimal.setEngine('computing', null);
  if (vg.status().over) { state.view.status = 'over'; renderAdvice(); return; }
  if (engine.state !== 'ready') { state.view.status = 'engine-error'; renderAdvice(); return; }
  const ucis = g.moves.slice(0, ply).map((m) => m.uci).join(' ');
  let res;
  try {
    res = await engine.analyze({
      position: `position fen ${g.startFen}${ucis ? ' moves ' + ucis : ''}`,
      movetime: BUDGETS[state.settings.budget].movetime,
      token: vg.token(),
      multipv: CANDIDATES,
    });
  } catch (e) {
    if (job === viewJob) { state.view = { ...state.view, status: 'engine-error', error: e.message }; renderAdvice(); }
    return;
  }
  if (job !== viewJob || state.viewPly !== ply || res.cancelled) return;
  const advice = buildAdvice(vg, res);
  state.view = { ...state.view, status: advice.ok ? 'ready' : 'error', advice: advice.ok ? advice : null, error: advice.error };
  if (advice.ok) optimal.setEngine('ready', advice);
  renderAdvice();
  renderBoard();
}

// Panneau de conseil pour une position consultée dans l'historique.
function renderViewAdvice(el) {
  const g = state.game;
  const v = state.view;
  const ply = state.viewPly;
  const where = ply === 0 ? L('Position de départ', 'Starting position') : L(`Après ${moveLabel(ply - 1)}`, `After ${moveLabel(ply - 1)}`);
  const turn = g.fen(ply).split(' ')[1];
  let body;
  if (!v || v.status === 'computing') body = `<div class="state"><span class="spinner"></span><span>${L('Stockfish analyse cette position…', 'Stockfish is analysing this position…')}</span></div>`;
  else if (v.status === 'over') body = `<p class="desc">${L('Partie terminée dans cette position.', 'The game is over in this position.')}</p>`;
  else if (v.status === 'engine-error' || v.status === 'error') body = `<div class="errbox">${esc(v.error || L('Moteur indisponible', 'Engine unavailable'))}</div>`;
  else {
    const adv = v.advice;
    const played = ply < g.ply ? g.verboseMove(ply) : null;
    const same = played && played.lan === adv.best.lan;
    body = `<p class="label">${L('Meilleur coup selon Stockfish', 'Best move according to Stockfish')}</p>
      <p class="move-big ${turn === g.playerColor ? 'best' : 'reply'}">${esc(sanFr(adv.best.san))}</p>
      <p class="desc">${esc(adv.bestDescription)}</p>
      <dl>${evalBlock(adv)}<dt>${L('Suite calculée', 'Calculated line')}</dt><dd class="line">${esc(adv.lineText)}</dd>
        ${played ? `<dt>${L('Coup réellement joué', 'Move actually played')}</dt><dd><strong>${esc(sanFr(played.san))}</strong> ${same ? `<span class="ok">${L('✔ c’était le meilleur coup', '✔ it was the best move')}</span>` : `<span class="muted">${L('(différent du calcul)', '(different from the calculation)')}</span>`}</dd>` : ''}
      </dl>${candidatesBlock(adv)}${techDetails(adv, { movetime: adv.movetime })}`;
  }
  el.innerHTML = `<p><span class="badge">${L('Position consultée', 'Viewed position')}</span> <strong>${esc(where)}</strong> — ${L(`trait aux ${COLOR_NAMES[turn]}`, `${turn === 'w' ? 'White' : 'Black'} to move`)}</p>${body}
    <p class="muted small">${L('Ce n’est pas la position actuelle de la partie.', 'This is not the current position of the game.')} <button type="button" class="link-btn" id="btn-back-live">${L('Revenir à la position actuelle', 'Back to the current position')}</button></p>`;
  $('btn-back-live').onclick = () => viewAt(g.ply);
}

// ---------- Brouillon d'analyse ----------
// Coups essayés depuis une position de la partie, analysés par Stockfish comme la partie
// réelle, mais gardés à part : la partie (Game) n'est jamais modifiée.

function ouvrirVariante(input) {
  const g = state.game;
  const base = state.viewPly ?? g.ply;
  stopAutoplay(L('Suite automatique en pause (brouillon).', 'Automatic continuation paused (draft).'));
  state.variante = new Variante(g.startFen, g.moves.map((m) => m.uci), base);
  state.viewPly = base;
  state.view = null;
  viewJob++;
  if (input) {
    try { state.variante.play(input); } catch (e) { notationMsg(e.message, true); }
  }
  apresVariante();
  return true;
}

function playVariante(input) {
  if (!state.variante) return ouvrirVariante(input);
  try {
    state.variante.play(input);
  } catch (e) {
    notationMsg(e.message, true);
    renderBoard();
    return false;
  }
  notationMsg('');
  apresVariante();
  return true;
}

function retirerVariante() {
  const v = state.variante;
  if (!v.retirer()) { viewAt(v.base); return; }
  apresVariante();
}

function navVariante(kind) {
  const v = state.variante;
  if (kind === 'start' && v.cur === 0) { viewAt(v.base); return; }
  if (kind === 'prev' && v.cur === 0) { viewAt(v.base - 1); return; }
  v.aller({ start: 0, prev: v.cur - 1, next: v.cur + 1, end: v.coups.length }[kind]);
  apresVariante();
}

function fermerVariante() {
  state.variante = null;
  state.vueVariante = null;
  varianteJob++;
}

function apresVariante() {
  renderBoard();
  renderMoves();
  renderButtons();
  analyseVariante();
  renderAdvice();
}

function labelVariante(i) {
  const n = state.variante.numeros()[i];
  return `${n.no}${n.color === 'w' ? '.' : '…'} ${sanFr(n.san)}`;
}

// Interface « partie » attendue par buildAdvice et le panneau « Coup optimal ».
function varianteGame(v) {
  const g = state.game;
  const fen = v.fen();
  const ucis = v.ucis();
  const tok = { gameId: g.id, branchId: 'brouillon-' + v.id, revision: v.revision, ply: ucis.length };
  return {
    playerColor: g.playerColor,
    startFen: g.startFen,
    moves: ucis.map((uci) => ({ uci })),
    fen: () => fen,
    turn: () => fen.split(' ')[1],
    token: () => tok,
    isCurrent: (t) => !!t && state.variante === v && t.branchId === tok.branchId && t.revision === v.revision && t.gameId === g.id,
    status: () => ({ over: v.over() }),
  };
}

let varianteJob = 0;
async function analyseVariante() {
  const v = state.variante;
  const job = ++varianteJob;
  const vg = varianteGame(v);
  state.vueVariante = { id: v.id, revision: v.revision, status: 'computing', advice: null };
  optimal.update(vg);
  optimal.setEngine('computing', null);
  if (v.over()) { state.vueVariante.status = 'over'; renderAdvice(); return; }
  if (engine.state !== 'ready') { state.vueVariante.status = 'engine-error'; renderAdvice(); return; }
  const ucis = vg.moves.map((m) => m.uci).join(' ');
  let res;
  try {
    res = await engine.analyze({
      position: `position fen ${state.game.startFen}${ucis ? ' moves ' + ucis : ''}`,
      movetime: BUDGETS[state.settings.budget].movetime,
      token: vg.token(),
      multipv: CANDIDATES,
    });
  } catch (e) {
    if (job === varianteJob) { state.vueVariante = { ...state.vueVariante, status: 'engine-error', error: e.message }; renderAdvice(); }
    return;
  }
  if (job !== varianteJob || state.variante !== v || !vg.isCurrent(vg.token()) || res.cancelled) return;
  const advice = buildAdvice(vg, res);
  state.vueVariante = { ...state.vueVariante, status: advice.ok ? 'ready' : 'error', advice: advice.ok ? advice : null, error: advice.error };
  if (advice.ok) optimal.setEngine('ready', advice);
  renderAdvice();
  renderBoard();
}

function renderBoardVariante() {
  const g = state.game;
  const v = state.variante;
  const pos = v.chessAt();
  board.setHint(null);
  board.setPosition(pos, {
    lastMove: v.lastMove() || (v.base > 0 ? g.verboseMove(v.base - 1) : null),
    interactive: !pos.isGameOver(),
  });
  const arrows = [];
  const vv = state.vueVariante;
  if (vv?.status === 'ready' && vv.id === v.id && vv.revision === v.revision) {
    const b = vv.advice.best;
    arrows.push(...altArrows(vv.advice));
    arrows.push({ from: b.from, to: b.to, kind: 'best' });
  }
  board.setArrows(arrows);
  $('view-banner').classList.remove('hidden');
  const depart = v.base === 0 ? L('la position de départ', 'the starting position') : moveLabel(v.base - 1);
  const coups = v.numeros().map((n, i) => {
    const no = n.color === 'w' ? `${n.no}.` : (i === 0 ? `${n.no}…` : '');
    return `${no}<button type="button" class="link-btn${i + 1 === v.cur ? ' current' : ''}" data-vply="${i + 1}">${esc(sanFr(n.san))}</button>`;
  }).join(' ');
  $('view-text').innerHTML = `<strong>${L('🧪 Brouillon', '🧪 Draft')}</strong> ${L(`depuis ${esc(depart)}`, `from ${esc(depart)}`)}${coups ? ' : ' + coups : ''}<br><span class="small">${L('Ces coups ne sont pas ajoutés à la partie.', 'These moves are not added to the game.')}</span>`;
  $('btn-quitter-brouillon').classList.remove('hidden');
}

function renderVarianteAdvice(el) {
  const v = state.variante;
  const vv = state.vueVariante;
  const turn = v.turn();
  let body;
  if (!vv || vv.id !== v.id || vv.status === 'computing') body = `<div class="state"><span class="spinner"></span><span>${L('Stockfish analyse le brouillon…', 'Stockfish is analysing the draft…')}</span></div>`;
  else if (vv.status === 'over') {
    const c = v.chessAt();
    body = `<p class="desc">${c.isCheckmate() ? L('Échec et mat dans le brouillon.', 'Checkmate in the draft.') : L('Partie nulle dans le brouillon.', 'Draw in the draft.')}</p>`;
  } else if (vv.status === 'engine-error' || vv.status === 'error') body = `<div class="errbox">${esc(vv.error || L('Moteur indisponible', 'Engine unavailable'))}</div>`;
  else {
    const adv = vv.advice;
    body = `<p class="label">${L('Meilleur coup selon Stockfish', 'Best move according to Stockfish')}</p>
      <p class="move-big best">${esc(sanFr(adv.best.san))}</p>
      <p class="desc">${esc(adv.bestDescription)}</p>
      <dl>${evalBlock(adv)}<dt>${L('Suite calculée', 'Calculated line')}</dt><dd class="line">${esc(adv.lineText)}</dd></dl>
      <p><button type="button" id="btn-brouillon-best">${L(`Essayer ${sanFr(adv.best.san)}`, `Try ${sanFr(adv.best.san)}`)}</button></p>
      ${candidatesBlock(adv)}${techDetails(adv, { movetime: adv.movetime })}`;
  }
  el.innerHTML = `<p><span class="badge">${L('🧪 Brouillon', '🧪 Draft')}</span> ${L(`trait aux ${COLOR_NAMES[turn]}`, `${turn === 'w' ? 'White' : 'Black'} to move`)}</p>${body}
    <p class="muted small">${L('La partie réelle ne change pas. « Annuler » retire le dernier coup essayé.', 'The real game does not change. “Undo” removes the last move tried.')}</p>`;
  const bb = $('btn-brouillon-best');
  if (bb) bb.onclick = () => playVariante(vv.advice.best.lan);
}

// ---------- Interface ----------

function fillSelects() {
  const budgetOpts = Object.entries(BUDGETS).map(([k, v]) => `<option value="${k}">${v.label} (${v.movetime / 1000} s)</option>`).join('');
  $('set-budget').innerHTML = budgetOpts;
  const lv = Object.entries(LEVELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('set-level').innerHTML = lv;
  $('new-level').innerHTML = lv;
}

function bindUi() {
  $('btn-new').onclick = () => openNew('initial');
  $('btn-import').onclick = () => openNew('pgn');
  $('btn-undo').onclick = () => {
    // Dans un brouillon, « Annuler » retire le dernier coup essayé, jamais un coup de la partie.
    if (state.variante) { retirerVariante(); return; }
    const g = state.game;
    const removed = g.undo();
    if (!removed) return;
    state.deviation = null;
    state.expectation = null;
    notationMsg(L(`Coup annulé : ${sanFr(removed.san)}`, `Move undone: ${sanFr(removed.san)}`));
    onPositionChanged('undo');
  };
  $('btn-flip').onclick = () => { board.flip(); renderBoard(); };
  $('btn-deeper').onclick = () => {
    if (state.analysis.status === 'computing' && state.analysis.deeper) { engine.stop(); return; }
    runAnalysis(DEEPER_MOVETIME, { deeper: true });
  };
  $('btn-explain').onclick = () => explain();
  $('btn-bilan').onclick = () => openBilan();
  $('btn-auto').onclick = () => (autoplay.running ? stopAutoplay(L('Suite automatique arrêtée.', 'Automatic continuation stopped.')) : startAutoplay());
  $('btn-export').onclick = openExport;
  $('btn-settings').onclick = openSettings;
  $('set-ouvertures-btn').addEventListener('click', () => { $('dlg-settings').close(); location.hash = '#/ouvertures'; });
  $('set-visite-btn').addEventListener('click', () => { $('dlg-settings').close(); lancerVisite(); });
  $('set-aide-btn').addEventListener('click', () => {
    $('dlg-settings').close();
    ouvrirAide({
      supportEmail: state.config.supportEmail || '',
      infos: () => ({ build: state.config.build || '', page: location.hash || '#/moteur', ua: navigator.userAgent, ecran: `${innerWidth}×${innerHeight}`, moteur: engine.state }),
    });
  });
  $('btn-live').onclick = () => viewAt(state.game.ply);
  $('btn-quitter-brouillon').onclick = () => { if (state.variante) viewAt(state.variante.base); };
  $('btn-brouillon').onclick = () => ouvrirVariante();
  $('view-text').onclick = (e) => { const b = e.target.closest('[data-vply]'); if (b && state.variante) { state.variante.aller(Number(b.dataset.vply)); apresVariante(); } };
  $('moves').onclick = (e) => { const b = e.target.closest('[data-ply]'); if (b) viewAt(Number(b.dataset.ply)); };
  document.querySelectorAll('[data-nav]').forEach((b) => {
    b.onclick = () => {
      const g = state.game;
      if (state.variante) { navVariante(b.dataset.nav); return; }
      const cur = state.viewPly ?? g.ply;
      const nav = { start: 0, prev: cur - 1, next: cur + 1, end: g.ply }[b.dataset.nav];
      viewAt(nav);
    };
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, dialog')) return;
    if (state.variante && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { navVariante(e.key === 'ArrowLeft' ? 'prev' : 'next'); return; }
    const cur = state.viewPly ?? state.game.ply;
    if (e.key === 'ArrowLeft') viewAt(cur - 1);
    if (e.key === 'ArrowRight') viewAt(cur + 1);
  });
  $('notation-form').onsubmit = (e) => {
    e.preventDefault();
    const input = $('notation-input');
    const text = input.value;
    if (!text.trim()) return;
    const cands = parseMoveText(state.game.chessAt(), text);
    if (!cands.length) { notationMsg(L(`« ${text} » n’est pas un coup légal pour les ${COLOR_NAMES[state.game.turn()]}.`, `“${text}” is not a legal move for ${state.game.turn() === 'w' ? 'White' : 'Black'}.`), true); return; }
    if (cands.length > 1) {
      notationMsg(L(`Saisie ambiguë : ${cands.map((c) => `${sanFr(c.move.san)} (notation ${c.how})`).join(' ou ')}. Précisez, par ex. en notation ${cands[0].move.lan}.`, `Ambiguous input: ${cands.map((c) => `${sanFr(c.move.san)} (${c.how} notation)`).join(' or ')}. Be more specific, e.g. in notation ${cands[0].move.lan}.`), true);
      return;
    }
    if (playMove(cands[0].move.lan, 'notation')) input.value = '';
  };

  // Nouvelle partie
  document.querySelectorAll('#form-new input[name=source]').forEach((r) => { r.onchange = syncNewForm; });
  $('form-new').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'ok') return;
    const err = createFromForm();
    if (err) { e.preventDefault(); $('new-error').textContent = err; }
  });

  // Export
  $('copy-pgn').onclick = () => copy($('export-pgn').value, L('PGN copié.', 'PGN copied.'));
  $('copy-fen').onclick = () => copy($('export-fen').value, L('FEN copiée.', 'FEN copied.'));
  $('download-pgn').onclick = () => {
    const blob = new Blob([$('export-pgn').value + '\n'], { type: 'application/x-chess-pgn' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `partie-${state.game.record.createdAt.slice(0, 10)}.pgn`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // Réglages : apparence prévisualisée en direct, rétablie si on ferme sans enregistrer.
  for (const id of ['set-theme', 'set-board']) $(id).addEventListener('change', () => applyAppearance(appearanceFromForm()));
  $('set-accent').addEventListener('input', () => { $('set-accent').dataset.custom = '1'; applyAppearance(appearanceFromForm()); });
  $('reset-accent').onclick = () => {
    $('set-accent').dataset.custom = '';
    applyAppearance(appearanceFromForm());
    $('set-accent').value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  };
  $('dlg-settings').addEventListener('close', () => applyAppearance(state.settings));
  // Mes données : export / import par fichier (sans les secrets).
  $('data-export').onclick = () => {
    const dump = sauvegarder();
    $('data-msg').textContent = L(`Fichier créé : ${describe(dump)}. Range-le en lieu sûr (Fichiers, Drive, e-mail) ; sur l’autre appareil : ⚙ Réglages → Importer.`, `File created: ${describe(dump)}. Keep it somewhere safe (Files, Drive, e-mail); on the other device: ⚙ Settings → Import.`);
  };
  $('data-import').onchange = async (ev) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const dump = JSON.parse(await f.text());
      if (!window.confirm(L(`Importer ${describe(dump)} (export du ${new Date(dump.exportedAt).toLocaleString('fr-FR')}) ? Les données actuelles de cet appareil seront remplacées.`, `Import ${describe(dump)} (exported on ${new Date(dump.exportedAt).toLocaleString('en-GB')})? The current data on this device will be replaced.`))) return;
      store.backupGame();
      const n = importData(dump);
      $('data-msg').textContent = L(`${n} élément(s) importé(s). Rechargement…`, `${n} item(s) imported. Reloading…`);
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      $('data-msg').textContent = e instanceof SyntaxError ? L('Fichier illisible (JSON attendu).', 'Unreadable file (JSON expected).') : e.message;
    }
  };
  $('form-settings').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'ok') return;
    saveSettingsFromForm();
  });
  $('test-coach').onclick = async () => {
    const code = $('set-code').value.trim();
    if (code) store.setAccessCode(code);
    const api = $('set-api').value.trim();
    const prevApi = state.settings.apiUrl;
    state.settings.apiUrl = api;
    const msg = $('coach-test-msg');
    if (coach.missing()) { msg.textContent = coach.missing(); state.settings.apiUrl = prevApi; return; }
    msg.textContent = L('Test en cours…', 'Testing…');
    try {
      const s = await coach.status();
      msg.textContent = L(`Connexion réussie. Modèle : ${s.model}. Appels aujourd’hui : ${s.usedToday}/${s.dailyLimit}.`, `Connection successful. Model: ${s.model}. Calls today: ${s.usedToday}/${s.dailyLimit}.`);
    } catch (err) {
      msg.textContent = L('Échec : ', 'Failed: ') + err.message;
    }
    state.settings.apiUrl = prevApi;
  };
  $('connect-lichess').onclick = () => connecterLichess('#/parties');
  $('clear-lichess').onclick = () => {
    store.setLichessToken('');
    $('set-lichess').value = '';
    $('coach-test-msg').textContent = L('Jeton Lichess effacé de cet appareil.', 'Lichess token removed from this device.');
    optimal.update(state.game);
  };
  $('clear-youtube').onclick = () => {
    store.setYoutubeKey('');
    $('set-youtube').value = '';
    $('coach-test-msg').textContent = L('Clé YouTube effacée de cet appareil.', 'YouTube key removed from this device.');
  };
  $('clear-code').onclick = () => {
    store.setAccessCode('');
    $('set-code').value = '';
    $('coach-test-msg').textContent = L('Code effacé de cet appareil.', 'Code removed from this device.');
    refreshCoachPill();
    renderCoach();
  };
  $('restore-backup').onclick = () => {
    const rec = store.loadBackupRecord();
    if (!rec) { $('coach-test-msg').textContent = L('Aucune partie précédente à restaurer.', 'No previous game to restore.'); return; }
    try {
      const g = Game.fromRecord(rec);
      store.backupGame();
      setGame(g);
      $('dlg-settings').close();
    } catch (err) {
      $('coach-test-msg').textContent = L('Restauration impossible : ', 'Restore failed: ') + err.message;
    }
  };
}

function syncNewForm() {
  const src = document.querySelector('#form-new input[name=source]:checked').value;
  $('new-pgn').classList.toggle('hidden', src !== 'pgn');
  $('new-fen').classList.toggle('hidden', src !== 'fen');
  $('new-fen-note').classList.toggle('hidden', src !== 'fen');
}

function openNew(source) {
  $('dlg-new-title').textContent = source === 'initial' ? L('Nouvelle partie', 'New game') : L('Importer une partie ou une position', 'Import a game or a position');
  document.querySelector(`#form-new input[name=source][value=${source}]`).checked = true;
  document.querySelector(`#form-new input[name=color][value=${state.game.playerColor}]`).checked = true;
  $('new-level').value = state.game.record.level || state.settings.level;
  $('new-error').textContent = '';
  syncNewForm();
  $('dlg-new').showModal();
}

function createFromForm() {
  const color = document.querySelector('#form-new input[name=color]:checked').value;
  const src = document.querySelector('#form-new input[name=source]:checked').value;
  const level = $('new-level').value;
  let g;
  try {
    if (src === 'pgn') {
      const txt = $('new-pgn').value.trim();
      if (!txt) return L('Collez un PGN.', 'Paste a PGN.');
      g = Game.fromPgn(txt, { playerColor: color, level });
    } else if (src === 'fen') {
      const fen = $('new-fen').value.trim();
      if (!fen) return L('Saisissez une FEN.', 'Enter a FEN.');
      g = Game.create({ playerColor: color, fen, level });
    } else {
      g = Game.create({ playerColor: color, level });
    }
  } catch (e) {
    return e.message;
  }
  store.backupGame();
  state.settings.level = level;
  store.saveSettings(state.settings);
  setGame(g);
  return null;
}

function setGame(g) {
  state.game = g;
  state.deviation = null;
  state.expectation = null;
  board.setOrientation(g.playerColor);
  notationMsg('');
  onPositionChanged('new');
}

function openExport() {
  $('export-pgn').value = state.game.pgn();
  $('export-fen').value = state.game.fen(state.viewPly ?? state.game.ply);
  $('export-msg').textContent = '';
  $('dlg-export').showModal();
}

async function copy(text, ok) {
  try {
    await navigator.clipboard.writeText(text);
    $('export-msg').textContent = ok;
  } catch {
    $('export-msg').textContent = L('Copie impossible : sélectionnez le texte manuellement.', 'Copy failed: select the text manually.');
  }
}

function openSettings() {
  const s = state.settings;
  $('set-budget').value = s.budget;
  $('set-level').value = state.game.record.level || s.level;
  $('set-auto').checked = s.autoExplain;
  $('set-help').value = s.helpMode || 'direct';
  $('set-opp-arrow').checked = s.showOpponentArrow;
  $('set-ouvertures').textContent = L(`Votre répertoire : ${resume(choisis())}.`, `Your repertoire: ${resume(choisis())}.`);
  $('set-elite-camp').checked = !!s.eliteCamp;
  $('set-api').value = s.apiUrl;
  $('set-code').value = '';
  $('set-code').placeholder = store.getAccessCode() ? L('Code enregistré sur cet appareil (laisser vide pour le garder)', 'Code saved on this device (leave empty to keep it)') : L('Saisi une fois, conservé sur cet appareil', 'Entered once, kept on this device');
  $('coach-test-msg').textContent = '';
  $('set-lichess').value = '';
  $('set-lichess').placeholder = store.getLichessToken() ? L('Jeton enregistré sur cet appareil (laisser vide pour le garder)', 'Token saved on this device (leave empty to keep it)') : L('lip_… (jeton sans aucune permission)', 'lip_… (token without any permission)');
  $('set-youtube').value = '';
  $('set-youtube').placeholder = store.getYoutubeKey() ? L('Clé enregistrée sur cet appareil (laisser vide pour la garder)', 'Key saved on this device (leave empty to keep it)') : L('AIza… (clé restreinte à ce site)', 'AIza… (key restricted to this site)');
  $('set-theme').innerHTML = Object.entries(THEMES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('');
  $('set-board').innerHTML = Object.entries(BOARDS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
  $('set-theme').value = s.theme || 'neon';
  $('set-board').value = s.board || 'auto';
  $('set-accent').value = s.accent || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#9d8cff';
  $('set-accent').dataset.custom = s.accent ? '1' : '';
  $('dlg-settings').showModal();
}

function appearanceFromForm() {
  return { theme: $('set-theme').value, board: $('set-board').value, accent: $('set-accent').dataset.custom ? $('set-accent').value : '' };
}

function saveSettingsFromForm() {
  const s = state.settings;
  const budgetChanged = s.budget !== $('set-budget').value;
  s.budget = $('set-budget').value;
  s.level = $('set-level').value;
  s.autoExplain = $('set-auto').checked;
  s.helpMode = $('set-help').value;
  optimal.setHidden(moveHidden());
  renderAdvice();
  s.showOpponentArrow = $('set-opp-arrow').checked;
  const campChanged = !!s.eliteCamp !== $('set-elite-camp').checked;
  s.eliteCamp = $('set-elite-camp').checked;
  s.apiUrl = $('set-api').value.trim();
  Object.assign(s, appearanceFromForm());
  applyAppearance(s);
  store.saveSettings(s);
  state.game.setLevel(s.level);
  store.saveGame(state.game.toJSON());
  const code = $('set-code').value.trim();
  if (code) store.setAccessCode(code);
  const tok = $('set-lichess').value.trim();
  if (tok) store.setLichessToken(tok);
  const yt = $('set-youtube').value.trim();
  if (yt) store.setYoutubeKey(yt);
  if (tok || code || campChanged) optimal.update(state.game);
  if (campChanged) repertoirePage?.refreshElite?.();
  refreshCoachPill();
  renderCoach();
  renderBoard();
  if (budgetChanged && state.viewPly === null && !state.game.status().over) runAnalysis(BUDGETS[s.budget].movetime);
}

// Accès pour les tests automatisés (lecture seule de l'état).
window.__coach = { state, engine, optimal, lichess, get repertoire() { return repertoirePage; }, get games() { return gamesPage; }, get training() { return trainingPage; } };

// Ouvre une suite de coups sur l'échiquier comme nouvelle partie (l'ancienne est sauvegardée).
// animate : rejoue la séquence coup par coup (≈ 400 ms) puis revient à la position finale.
// headers : en-têtes PGN conservés (partie exemple Élite : joueurs, lien d'origine).
let replayTimer = null;
function openSanInBoard(san, color, label, { animate = false, headers = null } = {}) {
  const pgn = san.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ');
  const cur = state.game;
  // Pas de confirmation si la partie en cours est vide ou n'est qu'une ligne testée.
  const disposable = !cur.ply || String(cur.record.headers?.Event || '').startsWith('Test');
  if (!disposable && !window.confirm(L(`Ouvrir ${label} sur l’échiquier ? La partie en cours sera remplacée (elle reste récupérable dans ⚙ Réglages → Avancé).`, `Open ${label} on the board? The current game will be replaced (it can still be recovered in ⚙ Settings → Advanced).`))) return;
  if (!disposable) store.backupGame();
  let g;
  try { g = Game.fromPgn(pgn || '*', { playerColor: color, level: state.settings.level }); } catch (e) { notationMsg(e.message, true); return; }
  if (headers) g.record.headers = { ...(g.record.headers || {}), ...headers };
  if (animate) g.record.headers = { ...(g.record.headers || {}), Event: `Test : ${label}` };
  clearTimeout(replayTimer);
  setGame(g);
  location.hash = '#/moteur';
  if (!animate || !g.ply) return;
  viewAt(0);
  let i = 0;
  const step = () => {
    // Abandon si la partie ou la vue a changé entre-temps (autre coup, autre partie).
    if (state.game !== g || state.viewPly !== i) return;
    i++;
    viewAt(i);
    if (i < g.ply) replayTimer = setTimeout(step, 400);
    else startAutoplay(); // la ligne est jouée : la partie continue jusqu'à la fin
  };
  replayTimer = setTimeout(step, 400);
}

function ensureGamesPage() {
  gamesPage ??= new GamesPage({
    el: $('page-parties'), engine, client: lichess, getToken: () => store.getLichessToken(),
    setToken: (t) => store.setLichessToken(t), authMessage: state.authMessage || '',
    openLine: (san, color, label) => openSanInBoard(san, color, label),
    openGame: (g) => openSanInBoard(g.san, g.color, L(`votre partie contre ${g.color === 'w' ? g.black : g.white}`, `your game against ${g.color === 'w' ? g.black : g.white}`), {
      headers: { White: g.white, Black: g.black, WhiteElo: g.whiteElo ? String(g.whiteElo) : '', BlackElo: g.blackElo ? String(g.blackElo) : '', Site: g.url || '', Date: (g.date || '').slice(0, 10).replace(/-/g, '.'), Result: g.result || '' },
    }),
  });
  return gamesPage;
}

// Bilan de la partie de l'échiquier : analysée coup par coup sur la page « Mes parties ».
function openBilan() {
  const g = state.game;
  if (!g.ply) { notationMsg(L('Jouez au moins un coup avant de demander un bilan.', 'Play at least one move before asking for a summary.'), true); return; }
  if (g.record.start.fen !== DEFAULT_POSITION) { notationMsg(L('Bilan indisponible pour une partie commencée depuis une position (FEN).', 'Summary unavailable for a game started from a position (FEN).'), true); return; }
  stopAutoplay();
  const st = g.status();
  const h = g.record.headers || {};
  ensureGamesPage().bilanLocal({
    san: g.moves.map((m) => m.san), color: g.playerColor, result: st.over ? st.result : '*',
    white: h.White, black: h.Black, opening: h.Opening || '',
  });
  location.hash = '#/parties';
}

// ---------- Suite automatique jusqu'à la fin de la partie ----------
// Coups de la base des maîtres tant que la position y figure (≥ AUTO_MIN_GAMES parties),
// puis meilleur coup de Stockfish pour les deux camps, jusqu'au mat, au pat ou à une nulle.
const AUTO_MOVETIME = 1000;
const AUTO_MIN_GAMES = 10;
const AUTO_DELAY = 350;
const autoplay = { running: false, game: null, ply: 0, theory: true, n: { theorie: 0, moteur: 0 }, note: '', timer: null, busy: false };

function startAutoplay() {
  const g = state.game;
  if (g.status().over) { renderAutoplay(); return; }
  Object.assign(autoplay, { running: true, game: g, ply: g.ply, theory: true, n: { theorie: 0, moteur: 0 }, note: '', busy: false });
  if (state.viewPly !== null) viewAt(g.ply);
  renderAutoplay();
  // Le calcul en cours garde son budget ; on repart avec le budget court de la suite automatique.
  runAnalysis(AUTO_MOVETIME);
}

function stopAutoplay(note = '') {
  if (!autoplay.running) return;
  autoplay.running = false;
  clearTimeout(autoplay.timer);
  autoplay.note = note;
  renderAutoplay();
}

// Arrêt si l'utilisateur reprend la main (autre partie, coup joué, navigation).
function autoplayValid() {
  const g = state.game;
  if (!autoplay.running) return false;
  if (g !== autoplay.game || g.ply !== autoplay.ply) { stopAutoplay(L('Suite automatique arrêtée : la partie a changé.', 'Automatic continuation stopped: the game has changed.')); return false; }
  if (state.viewPly !== null) { stopAutoplay(L('Suite automatique en pause (navigation dans les coups).', 'Automatic continuation paused (browsing moves).')); return false; }
  return true;
}

async function autoStep() {
  if (autoplay.busy || !autoplayValid()) return;
  const g = state.game;
  const st = g.status();
  if (st.over || st.claimable.length) { finishAutoplay(st); return; }
  autoplay.busy = true;
  let move = null;
  let source = 'moteur';
  if (autoplay.theory && lichess.explorerMode()) {
    try {
      const r = await lichess.explorer({ fen: g.record.start.fen, play: g.record.moves.map((m) => m.uci), db: 'masters', moves: 5 });
      const top = (r.moves || []).reduce((a, m) => (!a || m.white + m.draws + m.black > a.white + a.draws + a.black ? m : a), null);
      const n = top ? top.white + top.draws + top.black : 0;
      if (n >= AUTO_MIN_GAMES && g.legalMoves().some((m) => m.lan === top.uci)) {
        move = top.uci;
        source = 'theorie';
        autoplay.lastInfo = L(`théorie des maîtres (${n.toLocaleString('fr-FR')} parties)`, `masters’ theory (${n.toLocaleString('en-US')} games)`);
      } else autoplay.theory = false; // hors théorie : Stockfish jusqu'à la fin
    } catch { autoplay.theory = false; }
  } else autoplay.theory = false;
  if (!move) {
    const a = state.analysis;
    if (a.status !== 'ready' || !g.isCurrent(a.token)) { autoplay.busy = false; return; } // runAnalysis rappellera autoStep
    move = a.advice.best.lan;
    autoplay.lastInfo = L(`Stockfish (${AUTO_MOVETIME / 1000} s par coup)`, `Stockfish (${AUTO_MOVETIME / 1000} s per move)`);
  }
  autoplay.timer = setTimeout(() => {
    autoplay.busy = false;
    if (!autoplayValid()) return;
    autoplay.n[source]++;
    autoplay.ply = g.ply + 1;
    renderAutoplay();
    playMove(move, 'auto');
    autoStep(); // théorie : coup suivant sans attendre ; Stockfish : rappelé par runAnalysis
  }, AUTO_DELAY);
}

const END_REASONS = {
  mat: L('échec et mat', 'checkmate'), pat: L('pat', 'stalemate'), materiel: L('matériel insuffisant', 'insufficient material'), quintuple: L('quintuple répétition', 'fivefold repetition'),
  '75coups': L('règle des 75 coups', '75-move rule'), triple: L('triple répétition (nulle)', 'threefold repetition (draw)'), '50coups': L('règle des 50 coups (nulle)', '50-move rule (draw)'),
};

function finishAutoplay(st) {
  const why = st.over ? END_REASONS[st.reason] : END_REASONS[st.claimable[0]];
  const result = st.over ? st.result : '1/2-1/2';
  stopAutoplay(L(`Fin de partie : ${why} — ${result}. ${autoplay.n.theorie} coup(s) de théorie des maîtres, ${autoplay.n.moteur} de Stockfish.`, `End of game: ${why} — ${result}. ${autoplay.n.theorie} move(s) from masters’ theory, ${autoplay.n.moteur} from Stockfish.`));
}

function renderAutoplay() {
  const btn = $('btn-auto');
  btn.textContent = autoplay.running ? L('⏸ Arrêter la suite automatique', '⏸ Stop automatic continuation') : L('⏩ Jouer la suite jusqu’à la fin', '⏩ Play on to the end');
  btn.disabled = !autoplay.running && (state.game.status().over || engine.state === 'error');
  $('auto-text').textContent = autoplay.running
    ? L(`Coup ${Math.floor(state.game.ply / 2) + 1} · ${autoplay.lastInfo || 'calcul…'} · ${autoplay.n.theorie} théorie / ${autoplay.n.moteur} Stockfish`, `Move ${Math.floor(state.game.ply / 2) + 1} · ${autoplay.lastInfo || 'calculating…'} · ${autoplay.n.theorie} theory / ${autoplay.n.moteur} Stockfish`)
    : autoplay.note;
}

// Télécharge une partie de la base des maîtres et l'ouvre sur l'échiquier.
async function openMasterGame(id, color) {
  let pgn;
  try {
    pgn = await lichess.masterPgn(id);
  } catch (e) {
    notationMsg(L(`Partie de maître indisponible : ${e.message}`, `Master game unavailable: ${e.message}`), true);
    return;
  }
  let g;
  try { g = Game.fromPgn(pgn, { playerColor: color, level: state.settings.level }); } catch (e) { notationMsg(e.message, true); return; }
  const h = g.record.headers;
  if (!window.confirm(L(`Ouvrir ${h.White || '?'} – ${h.Black || '?'} sur l’échiquier ? La partie en cours sera remplacée (récupérable dans ⚙ Réglages → Avancé).`, `Open ${h.White || '?'} – ${h.Black || '?'} on the board? The current game will be replaced (recoverable in ⚙ Settings → Advanced).`))) return;
  store.backupGame();
  setGame(g);
  location.hash = '#/moteur';
}

init();
