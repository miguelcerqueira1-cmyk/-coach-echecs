// Contrôleur principal. Principe : l'état de partie (game.js) est la source de vérité ;
// Stockfish calcule ; chess.js valide ; Claude explique les résultats calculés.
import { Game, parseMoveText } from './game.js';
import { Chess, DEFAULT_POSITION } from '../vendor/chess.js';
import { Engine } from './engine.js';
import { Board } from './board.js';
import {
  BUDGETS, DEEPER_MOVETIME, COLOR_NAMES, buildAdvice, buildThreat, nullMoveFen, sanFr, formatScore,
} from './analysis.js';
import { Coach, CoachError, LEVELS, buildCoachPayload, allowedMoveSet, renderCoachText } from './coach.js';
import * as store from './storage.js';
import { LichessClient } from './lichess.js';
import { OptimalPanel, DEFAULT_FILTER } from './optimal.js';
import { initRouter } from './router.js';
import { explicationGratuite, renderExplication, menaceSerieuse } from './explain-free.js';
import { indicesNiveau1, indiceNiveau2 } from './hints.js';
import { RepertoirePage } from './repertoire-page.js';
import { YouTubeClient } from './youtube.js';
import { TrainingPage } from './training.js';
import { GamesPage } from './games.js';
import { SPEED_LABELS, bucketLabel } from './lichess.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  game: null,
  settings: store.loadSettings(),
  config: { apiUrl: '' },
  viewPly: null, // null = position actuelle ; sinon consultation de l'historique
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
    if (mv && window.confirm(`Enregistrer ${sanFr(mv.san)} comme coup réellement joué ?`)) playMove(uci, 'explorer');
  },
});
let repertoirePage = null;
let trainingPage = null;
let gamesPage = null;

const currentFilter = () => ({ ...DEFAULT_FILTER, ...(state.settings.explorerFilter || {}) });
function filterLabel() {
  const f = currentFilter();
  const sp = f.speeds.length ? f.speeds.map((x) => SPEED_LABELS[x]).join(', ') : 'toutes cadences';
  const r = f.ratings.length ? f.ratings.map(bucketLabel).join(', ') : 'tous classements';
  return `${sp} · ${r}`;
}

async function init() {
  fillSelects();
  restoreGame();
  board.setOrientation(state.game.playerColor);
  bindUi();
  try {
    const cfg = await (await fetch('./config.json', { cache: 'no-cache' })).json();
    state.config = { ...state.config, ...cfg };
  } catch { /* pas de config publiée : pas d'API Claude */ }
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
        trainingPage ??= new TrainingPage({ el: $('page-entrainement'), engine, client: lichess, getFilter: currentFilter, filterLabel });
        trainingPage.show();
      }
      if (page === 'parties') ensureGamesPage().show();
      // Le moteur est partagé : en revenant sur la page Moteur, on relance le calcul si
      // une autre page l'a interrompu.
      if (page === 'moteur' && state.game && state.analysis.status !== 'ready' && !state.game.status().over && engine.state === 'ready') {
        runAnalysis(BUDGETS[state.settings.budget].movetime);
      }
    },
  });
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
      flash(`La sauvegarde n’a pas pu être relue (${e.message}). Une nouvelle partie a été créée ; l’ancienne est conservée.`, true);
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
  if (state.viewPly !== null) return;
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
  notationMsg(source === 'notation' ? `Coup joué : ${sanFr(mv.san)}` : '');
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
  const link = /^https:\/\//.test(h.Site || '') ? ` · <a href="${esc(h.Site)}" target="_blank" rel="noopener">partie originale ↗</a>` : '';
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
    const reasons = { mat: 'échec et mat', pat: 'pat', materiel: 'matériel insuffisant', quintuple: 'quintuple répétition', '75coups': 'règle des 75 coups' };
    el.className = 'turn-banner over';
    el.innerHTML = `<span>Partie terminée : ${esc(st.result)} <span class="sub">(${reasons[st.reason]})</span></span>`;
    return;
  }
  const player = turn === g.playerColor;
  el.className = 'turn-banner ' + (player ? 'player' : 'opponent');
  el.innerHTML = `<span class="dot ${turn}"></span><span>Trait aux ${COLOR_NAMES[turn]}${st.inCheck ? ' — échec !' : ''}<br>
    <span class="sub">${player ? 'À vous de jouer' : 'Saisissez le coup réellement joué par l’adversaire'}</span></span>`;
}

function renderBoard() {
  const g = state.game;
  const ply = state.viewPly ?? g.ply;
  const live = state.viewPly === null;
  const st = g.status();
  board.setPosition(g.chessAt(ply), {
    lastMove: ply > 0 ? g.verboseMove(ply - 1) : null,
    interactive: live && !st.over,
  });
  const arrows = [];
  const a = state.analysis;
  const hide = moveHidden();
  board.setHint(hide && (state.reveal || 0) >= 2 && !a.advice.best.san.startsWith('O-O') ? a.advice.best.from : null);
  if (live && a.advice && g.isCurrent(a.advice.token) && a.status !== 'engine-error' && !hide) {
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
    arrows.push({ from: b.from, to: b.to, kind: state.view.advice.isPlayerTurn ? 'best' : 'reply' });
    const stat = optimal.statArrow((t) => optimal.game?.isCurrent(t));
    if (stat && !(stat.from === b.from && stat.to === b.to)) arrows.push(stat);
  }
  board.setArrows(arrows);
  $('view-banner').classList.toggle('hidden', live);
  if (!live) $('view-text').textContent = ply === 0 ? 'Vous consultez la position de départ.' : `Vous consultez la position après ${moveLabel(ply - 1)}.`;
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
  const cur = state.viewPly ?? g.ply;
  const live = state.viewPly === null;
  $('nav-label').textContent = cur === 0 ? (g.ply ? 'Position de départ' : 'Aucun coup joué')
    : `${live ? 'Actuelle · ' : ''}après ${moveLabel(cur - 1)}`;
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
  ol.innerHTML = html || '<li class="muted small" style="grid-column:1/-1">Aucun coup joué.</li>';
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
  if (g.record.start.type === 'fen') notes.push('Départ depuis une FEN.');
  if (g.record.start.type === 'pgn') notes.push('Partie importée depuis un PGN.');
  if (g.historyUnknown) notes.push('L’historique antérieur à la position de départ est inconnu : les répétitions éventuelles d’avant ne sont pas comptées.');
  $('start-note').textContent = notes.join(' ');
}

function renderButtons() {
  const g = state.game;
  const live = state.viewPly === null;
  const over = g.status().over;
  $('btn-undo').disabled = !g.ply;
  $('btn-deeper').disabled = !live || over || engine.state !== 'ready';
  $('btn-deeper').textContent = state.analysis.status === 'computing' && state.analysis.deeper ? 'Arrêter l’analyse' : 'Analyser davantage';
  $('btn-explain').disabled = !live || over || state.analysis.status !== 'ready';
  $('notation-input').disabled = !live || over;
  renderAutoplay();
}

const pct = (permille) => (permille / 10).toFixed(1).replace('.', ',') + ' %';

function evalBlock(adv) {
  const wdl = adv.wdlPlayer;
  const wdlHtml = wdl ? `
    <dt>Estimation V/N/D</dt><dd>victoire ${pct(wdl.win)} · nulle ${pct(wdl.draw)} · défaite ${pct(wdl.loss)} <span class="muted">(pour vous)</span>
    <div class="wdl-bar" aria-hidden="true"><span style="width:${wdl.win / 10}%"></span><span style="width:${wdl.draw / 10}%"></span><span style="width:${wdl.loss / 10}%"></span></div>
    <span class="muted small">Estimation issue du modèle interne du moteur (jeu de niveau moteur des deux côtés), pas une probabilité garantie contre votre adversaire.</span></dd>` : '';
  return `<dt>Évaluation</dt><dd><strong>${esc(adv.scoreText)}</strong> <span class="muted">(point de vue des Blancs${adv.scoreWhite?.type === 'cp' ? ', en pions' : ''})</span><br><span class="small">${esc(adv.verdict)}</span></dd>${wdlHtml}`;
}

function techDetails(adv, a) {
  const nps = adv.nps ? `${Math.round(adv.nps / 1000)} k nœuds/s` : '—';
  return `<details><summary>Détails du calcul</summary>
    <dl>
      <dt>Moteur</dt><dd>${esc(adv.engine || 'Stockfish')} (version « lite », monothread, pleine force)</dd>
      <dt>Profondeur</dt><dd>${adv.depth ?? '—'} (sélective ${adv.seldepth ?? '—'})</dd>
      <dt>Temps</dt><dd>${((adv.timeMs || 0) / 1000).toFixed(1).replace('.', ',')} s sur ${((a.movetime || adv.movetime) / 1000).toFixed(0)} s prévues</dd>
      <dt>Nœuds</dt><dd>${adv.nodes?.toLocaleString('fr-FR') ?? '—'} · ${nps}</dd>
      <dt>Variante (UCI)</dt><dd class="line">${esc(adv.line.map((m) => m.lan).join(' '))}${adv.lineTruncated ? ' <span class="muted">(tronquée : coup invalide écarté)</span>' : ''}</dd>
    </dl>
    <p class="muted small">La profondeur atteinte dépend de la puissance de l’appareil et du budget choisi ; elle n’est pas garantie.</p>
  </details>`;
}

function deviationNote() {
  const d = state.deviation;
  if (!d) return '';
  if (d.who === 'opponent') {
    return `<p class="note">L’adversaire a joué <strong>${esc(sanFr(d.played))}</strong> ; la meilleure réponse calculée était ${esc(sanFr(d.expected))}. L’ancienne ligne est abandonnée : nouveau calcul à partir du coup réel.</p>`;
  }
  return `<p class="note">Vous avez joué <strong>${esc(sanFr(d.played))}</strong> au lieu du coup conseillé ${esc(sanFr(d.expected))}. L’analyse repart de votre coup réel.</p>`;
}

function renderMini() {
  const el = $('advice-mini');
  const a = state.analysis;
  const adv = a.advice && state.game.isCurrent(a.advice.token) ? a.advice : null;
  if (a.status === 'over') el.textContent = '';
  else if (a.status === 'engine-error') el.innerHTML = '<span class="error-text">Moteur indisponible : aucun conseil.</span>';
  else if (!adv) el.innerHTML = '<span class="muted">Stockfish calcule…</span>';
  else if (state.viewPly !== null) {
    const v = state.view;
    el.innerHTML = v?.status === 'ready'
      ? `Position consultée — meilleur coup : <strong class="best">${esc(sanFr(v.advice.best.san))}</strong> <span class="muted">(${esc(v.advice.scoreText)})</span>`
      : '<span class="muted">Position consultée — Stockfish analyse…</span>';
  } else if (adv.isPlayerTurn && moveHidden()) el.innerHTML = '<span class="muted">Mode indice : à vous de trouver le coup.</span>';
  else if (adv.isPlayerTurn) el.innerHTML = `Conseil : <strong class="best">${esc(sanFr(adv.best.san))}</strong> — ${esc(adv.bestDescription)} <span class="muted">(${esc(adv.scoreText)})</span>`;
  else el.innerHTML = `Meilleure réponse adverse calculée : <strong class="reply">${esc(sanFr(adv.best.san))}</strong> <span class="muted">— saisissez le coup réel</span>`;
}

function renderAdvice() {
  renderMini();
  const el = $('advice');
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
    el.innerHTML = `<p class="label">Partie terminée</p><p class="move-big">${esc(st.result)}</p><p class="desc">Plus aucun calcul n’est lancé. Exportez la partie ou commencez-en une nouvelle.</p>`;
    return;
  }
  if (a.status === 'waiting-engine') {
    el.innerHTML = `<div class="state"><span class="spinner"></span><span>Chargement du moteur Stockfish…</span></div>`;
    return;
  }
  if (a.status === 'engine-error') {
    el.innerHTML = `<p><span class="badge err">Erreur</span></p><div class="errbox"><strong>Moteur indisponible.</strong> ${esc(a.error || engine.lastError || '')}<br>Aucun conseil n’est affiché tant que le moteur ne fonctionne pas.</div>
      <div class="actions"><button type="button" id="btn-restart-engine">Redémarrer le moteur</button></div>`;
    $('btn-restart-engine').onclick = async () => {
      try { await engine.restart(); onPositionChanged('restart'); } catch { renderAdvice(); }
    };
    return;
  }
  if (a.status === 'error') {
    el.innerHTML = `<p><span class="badge err">Erreur</span></p><div class="errbox">${esc(a.error)}</div>`;
    return;
  }
  const claim = g.status().claimable;
  const claimNote = claim.length
    ? `<p class="note">Nulle réclamable (${claim.map((c) => (c === 'triple' ? 'triple répétition' : 'règle des 50 coups')).join(', ')}). La partie continue tant que personne ne la réclame.</p>` : '';
  const adv = a.advice && g.isCurrent(a.advice.token) ? a.advice : null;
  const computing = a.status === 'computing';
  const badge = computing
    ? `<span class="badge calc">${a.deeper ? 'Analyse approfondie en cours' : 'Calcul en cours'}</span>`
    : '<span class="badge done">Résultat disponible</span>';
  let body = '';
  if (!adv) {
    body = `<div class="state"><span class="spinner"></span><span id="live-text">Stockfish calcule…</span></div>`;
  } else if (adv.isPlayerTurn && moveHidden()) {
    const r = state.reveal || 0;
    const th = state.hintThreat && state.game.isCurrent(state.hintThreat.token) ? state.hintThreat.threat : null;
    const hints = [];
    if (r >= 1) hints.push(...indicesNiveau1(adv, th, state.game.playerColor));
    if (r >= 2) hints.push(indiceNiveau2(adv));
    body = `<p class="label">À vous de trouver le meilleur coup</p>
      ${hints.length ? `<ul class="hints">${hints.map((h) => `<li>${h}</li>`).join('')}</ul>` : '<p class="desc">Réfléchissez, puis demandez de l’aide si besoin.</p>'}
      <dl>${evalBlock(adv)}</dl>
      <div class="actions hint-actions">
        <button type="button" id="btn-hint1" ${r >= 1 ? 'disabled' : ''}>💡 Indice</button>
        <button type="button" id="btn-hint2" ${r >= 2 ? 'disabled' : ''}>📖 Explication</button>
        <button type="button" class="primary" id="btn-hint3">👁 Montrer le coup</button>
      </div>
      <p class="muted small">Jouez votre coup directement sur l’échiquier quand vous l’avez trouvé : il sera comparé au calcul du moteur.</p>`;
  } else if (adv.isPlayerTurn) {
    body = `<p class="label">Coup conseillé par le moteur</p>
      <p class="move-big best">${esc(sanFr(adv.best.san))}</p>
      <p class="desc">${esc(adv.bestDescription)}</p>
      <dl>
        ${evalBlock(adv)}
        <dt>Réponse adverse principale</dt><dd>${adv.reply ? `${esc(sanFr(adv.reply.san))} <span class="muted">— calculée, pas une prédiction du choix humain</span>` : '—'}</dd>
        <dt>Suite calculée</dt><dd class="line">${esc(adv.lineText)}</dd>
      </dl>
      <div class="actions">
        <button type="button" class="primary" id="btn-play-best">Confirmer : je joue ${esc(sanFr(adv.best.san))}</button>
      </div>
      <p class="muted small">Le coup n’est enregistré qu’après confirmation. Vous pouvez aussi jouer un autre coup sur l’échiquier.</p>`;
  } else {
    body = `<p class="label">Meilleure réponse adverse calculée</p>
      <p class="move-big reply">${esc(sanFr(adv.best.san))}</p>
      <p class="desc">${esc(adv.bestDescription)}</p>
      <p class="small muted">Le moteur indique le coup le plus fort pour l’adversaire ; un humain peut jouer autre chose. Saisissez le coup qu’il a réellement joué.</p>
      <dl>${evalBlock(adv)}<dt>Suite calculée</dt><dd class="line">${esc(adv.lineText)}</dd></dl>`;
  }
  const liveLine = computing && adv ? `<p class="small muted" id="live-text"></p>` : '';
  el.innerHTML = `<p>${badge}</p>${deviationNote()}${claimNote}${body}${liveLine}${adv ? techDetails(adv, a) : ''}`;
  $('btn-hint1')?.addEventListener('click', () => setReveal(1));
  $('btn-hint2')?.addEventListener('click', () => setReveal(2));
  $('btn-hint3')?.addEventListener('click', () => setReveal(3));
  const modeLink = document.createElement('p');
  modeLink.className = 'small';
  modeLink.innerHTML = `<button type="button" class="link-btn" id="btn-toggle-help">${hintMode() ? 'Passer en conseil direct' : 'Passer en mode « Indice d’abord »'}</button>`;
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
  const elapsed = ((performance.now() - (a.started || performance.now())) / 1000).toFixed(1).replace('.', ',');
  if (!i) { el.textContent = 'Stockfish calcule…'; return; }
  const sc = i.score ? formatScore({ type: i.score.type, value: i.score.value * (state.game.turn() === 'w' ? 1 : -1) }) : '';
  el.textContent = `Stockfish calcule… profondeur ${i.depth ?? '—'} · ${elapsed} s${sc ? ' · éval. provisoire ' + sc : ''}`;
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
  const head = missing ? '<h2>Explication <span class="badge">calculée · gratuite</span></h2>' : '<h2>Explication de l’entraîneur (Claude)</h2>';
  if (c.status === 'loading' && c.mode === 'free') {
    el.innerHTML = `${head}<div class="state"><span class="spinner"></span><span>Stockfish cherche la menace adverse…</span></div>`;
    return;
  }
  if (moveHidden() && c.token && state.game.isCurrent(c.token) && c.status !== 'loading') {
    el.innerHTML = state.reveal >= 2 && c.htmlMasked
      ? `<h2>Explication <span class="badge">sans le coup</span></h2><div class="text">${c.htmlMasked}</div><p class="muted small">Le coup conseillé reste caché jusqu’à « Montrer le coup ».</p>`
      : '<h2>Explication</h2><p class="muted small">Mode « Indice d’abord » : l’explication s’affiche au 2e niveau d’aide.</p>';
    return;
  }
  if (c.status === 'ready' && c.mode === 'free' && c.token && state.game.isCurrent(c.token)) {
    el.innerHTML = `${head}<div class="text">${c.html}</div>
      <p class="muted small">Construite uniquement à partir des calculs de Stockfish (profondeur ${c.meta?.depth ?? '—'}) et des règles du jeu, sans IA. Flèche rouge pointillée (si présente) : une menace sérieuse de l’adversaire. Pour un texte rédigé par Claude, activez l’API (⚙ Réglages).</p>`;
    return;
  }
  if (c.status === 'loading') {
    el.innerHTML = `${head}<div class="state"><span class="spinner"></span><span>Claude rédige une explication à partir des calculs du moteur…</span></div>`;
    return;
  }
  if (c.status === 'ready' && c.token && state.game.isCurrent(c.token)) {
    const m = c.meta || {};
    const warn = m.unverified?.length
      ? `<p class="note">Coup(s) cité(s) non vérifié(s) par le moteur : ${m.unverified.map(esc).join(', ')}. À prendre avec prudence.</p>` : '';
    el.innerHTML = `${head}<div class="text">${c.html}</div>${warn}
      <p class="muted small">Explication fondée sur l’analyse Stockfish (profondeur ${m.depth ?? '—'}). Les coups surlignés en vert figurent dans les variantes calculées. ${m.model ? 'Modèle : ' + esc(m.model) + '.' : ''}${m.remaining != null ? ` Appels restants aujourd’hui : ${m.remaining}.` : ''}</p>`;
    return;
  }
  if (c.status === 'error') {
    el.innerHTML = `${head}<div class="errbox">Explication indisponible : ${esc(c.error)}</div><p class="muted small">Les calculs du moteur ci-dessus restent valables.</p>`;
    return;
  }
  if (missing) {
    el.innerHTML = `${head}<p class="muted small">${state.settings.autoExplain ? 'L’explication s’affiche automatiquement quand c’est à vous de jouer.' : 'Touchez « Expliquer » pour une explication du conseil.'} Version gratuite, calculée sans IA.</p>`;
    return;
  }
  el.innerHTML = `${head}<p class="muted small">${state.settings.autoExplain ? 'L’explication arrive automatiquement quand c’est à vous de jouer.' : 'Touchez « Expliquer » pour une explication du conseil.'}</p>`;
}

function renderEnginePill(s) {
  const el = $('engine-pill');
  if (s.state === 'loading') {
    el.className = 'pill warn';
    el.textContent = s.cached ? 'Moteur : depuis le cache…' : `Moteur : chargement ${Math.round((s.progress || 0) * 100)} %`;
    if (s.total) el.title = `Téléchargement unique de ${(s.total / 1e6).toFixed(1)} Mo, puis conservé sur l’appareil.`;
  } else if (s.state === 'ready') {
    el.className = 'pill ok';
    el.textContent = 'Moteur prêt';
    el.title = `${s.name} — ${s.manifest?.engine || ''}`;
    $('engine-info').textContent = `Moteur : ${s.name} (${s.manifest?.engine}). Réseau NNUE « lite » intégré (${(s.manifest?.wasmBytes / 1e6).toFixed(1)} Mo) : plus léger que le réseau complet, donc un peu moins fort, mais très au-dessus du niveau humain.`;
  } else if (s.state === 'error') {
    el.className = 'pill err';
    el.textContent = 'Moteur en panne';
    el.title = s.message;
    engine.lastError = s.message;
    optimal.setEngine('error', null);
    if (state.game) { state.analysis.status = 'engine-error'; state.analysis.error = s.message; renderAdvice(); }
  }
  if (state.game) renderButtons();
}

async function refreshCoachPill() {
  const el = $('coach-pill');
  const missing = coach.missing();
  if (missing) {
    el.className = 'pill';
    el.textContent = 'Claude : indisponible';
    el.title = missing;
    return;
  }
  el.className = 'pill warn';
  el.textContent = 'Claude : vérification…';
  try {
    const s = await coach.status();
    const hadRelay = state.relay;
    state.relay = !!s.explorerProxy;
    if (state.relay !== hadRelay && state.game) optimal.update(state.game);
    el.className = 'pill ok';
    el.textContent = 'Claude : prêt';
    el.title = `Modèle ${s.model} · ${s.usedToday}/${s.dailyLimit} appels aujourd’hui`;
  } catch (e) {
    el.className = 'pill err';
    el.textContent = 'Claude : erreur';
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
  const where = ply === 0 ? 'Position de départ' : `Après ${moveLabel(ply - 1)}`;
  const turn = g.fen(ply).split(' ')[1];
  let body;
  if (!v || v.status === 'computing') body = '<div class="state"><span class="spinner"></span><span>Stockfish analyse cette position…</span></div>';
  else if (v.status === 'over') body = '<p class="desc">Partie terminée dans cette position.</p>';
  else if (v.status === 'engine-error' || v.status === 'error') body = `<div class="errbox">${esc(v.error || 'Moteur indisponible')}</div>`;
  else {
    const adv = v.advice;
    const played = ply < g.ply ? g.verboseMove(ply) : null;
    const same = played && played.lan === adv.best.lan;
    body = `<p class="label">Meilleur coup selon Stockfish</p>
      <p class="move-big ${turn === g.playerColor ? 'best' : 'reply'}">${esc(sanFr(adv.best.san))}</p>
      <p class="desc">${esc(adv.bestDescription)}</p>
      <dl>${evalBlock(adv)}<dt>Suite calculée</dt><dd class="line">${esc(adv.lineText)}</dd>
        ${played ? `<dt>Coup réellement joué</dt><dd><strong>${esc(sanFr(played.san))}</strong> ${same ? '<span class="ok">✔ c’était le meilleur coup</span>' : '<span class="muted">(différent du calcul)</span>'}</dd>` : ''}
      </dl>${techDetails(adv, { movetime: adv.movetime })}`;
  }
  el.innerHTML = `<p><span class="badge">Position consultée</span> <strong>${esc(where)}</strong> — trait aux ${COLOR_NAMES[turn]}</p>${body}
    <p class="muted small">Ce n’est pas la position actuelle de la partie. <button type="button" class="link-btn" id="btn-back-live">Revenir à la position actuelle</button></p>`;
  $('btn-back-live').onclick = () => viewAt(g.ply);
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
    const g = state.game;
    const removed = g.undo();
    if (!removed) return;
    state.deviation = null;
    state.expectation = null;
    notationMsg(`Coup annulé : ${sanFr(removed.san)}`);
    onPositionChanged('undo');
  };
  $('btn-flip').onclick = () => { board.flip(); renderBoard(); };
  $('btn-deeper').onclick = () => {
    if (state.analysis.status === 'computing' && state.analysis.deeper) { engine.stop(); return; }
    runAnalysis(DEEPER_MOVETIME, { deeper: true });
  };
  $('btn-explain').onclick = () => explain();
  $('btn-bilan').onclick = () => openBilan();
  $('btn-auto').onclick = () => (autoplay.running ? stopAutoplay('Suite automatique arrêtée.') : startAutoplay());
  $('btn-export').onclick = openExport;
  $('btn-settings').onclick = openSettings;
  $('btn-live').onclick = () => viewAt(state.game.ply);
  $('moves').onclick = (e) => { const b = e.target.closest('[data-ply]'); if (b) viewAt(Number(b.dataset.ply)); };
  document.querySelectorAll('[data-nav]').forEach((b) => {
    b.onclick = () => {
      const g = state.game;
      const cur = state.viewPly ?? g.ply;
      const nav = { start: 0, prev: cur - 1, next: cur + 1, end: g.ply }[b.dataset.nav];
      viewAt(nav);
    };
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, dialog')) return;
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
    if (!cands.length) { notationMsg(`« ${text} » n’est pas un coup légal pour les ${COLOR_NAMES[state.game.turn()]}.`, true); return; }
    if (cands.length > 1) {
      notationMsg(`Saisie ambiguë : ${cands.map((c) => `${sanFr(c.move.san)} (notation ${c.how})`).join(' ou ')}. Précisez, par ex. en notation ${cands[0].move.lan}.`, true);
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
  $('copy-pgn').onclick = () => copy($('export-pgn').value, 'PGN copié.');
  $('copy-fen').onclick = () => copy($('export-fen').value, 'FEN copiée.');
  $('download-pgn').onclick = () => {
    const blob = new Blob([$('export-pgn').value + '\n'], { type: 'application/x-chess-pgn' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `partie-${state.game.record.createdAt.slice(0, 10)}.pgn`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // Réglages
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
    msg.textContent = 'Test en cours…';
    try {
      const s = await coach.status();
      msg.textContent = `Connexion réussie. Modèle : ${s.model}. Appels aujourd’hui : ${s.usedToday}/${s.dailyLimit}.`;
    } catch (err) {
      msg.textContent = 'Échec : ' + err.message;
    }
    state.settings.apiUrl = prevApi;
  };
  $('clear-lichess').onclick = () => {
    store.setLichessToken('');
    $('set-lichess').value = '';
    $('coach-test-msg').textContent = 'Jeton Lichess effacé de cet appareil.';
    optimal.update(state.game);
  };
  $('clear-youtube').onclick = () => {
    store.setYoutubeKey('');
    $('set-youtube').value = '';
    $('coach-test-msg').textContent = 'Clé YouTube effacée de cet appareil.';
  };
  $('clear-code').onclick = () => {
    store.setAccessCode('');
    $('set-code').value = '';
    $('coach-test-msg').textContent = 'Code effacé de cet appareil.';
    refreshCoachPill();
    renderCoach();
  };
  $('restore-backup').onclick = () => {
    const rec = store.loadBackupRecord();
    if (!rec) { $('coach-test-msg').textContent = 'Aucune partie précédente à restaurer.'; return; }
    try {
      const g = Game.fromRecord(rec);
      store.backupGame();
      setGame(g);
      $('dlg-settings').close();
    } catch (err) {
      $('coach-test-msg').textContent = 'Restauration impossible : ' + err.message;
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
  $('dlg-new-title').textContent = source === 'initial' ? 'Nouvelle partie' : 'Importer une partie ou une position';
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
      if (!txt) return 'Collez un PGN.';
      g = Game.fromPgn(txt, { playerColor: color, level });
    } else if (src === 'fen') {
      const fen = $('new-fen').value.trim();
      if (!fen) return 'Saisissez une FEN.';
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
    $('export-msg').textContent = 'Copie impossible : sélectionnez le texte manuellement.';
  }
}

function openSettings() {
  const s = state.settings;
  $('set-budget').value = s.budget;
  $('set-level').value = state.game.record.level || s.level;
  $('set-auto').checked = s.autoExplain;
  $('set-help').value = s.helpMode || 'direct';
  $('set-opp-arrow').checked = s.showOpponentArrow;
  $('set-api').value = s.apiUrl;
  $('set-code').value = '';
  $('set-code').placeholder = store.getAccessCode() ? 'Code enregistré sur cet appareil (laisser vide pour le garder)' : 'Saisi une fois, conservé sur cet appareil';
  $('coach-test-msg').textContent = '';
  $('set-lichess').value = '';
  $('set-lichess').placeholder = store.getLichessToken() ? 'Jeton enregistré sur cet appareil (laisser vide pour le garder)' : 'lip_… (jeton sans aucune permission)';
  $('set-youtube').value = '';
  $('set-youtube').placeholder = store.getYoutubeKey() ? 'Clé enregistrée sur cet appareil (laisser vide pour la garder)' : 'AIza… (clé restreinte à ce site)';
  $('dlg-settings').showModal();
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
  s.apiUrl = $('set-api').value.trim();
  store.saveSettings(s);
  state.game.setLevel(s.level);
  store.saveGame(state.game.toJSON());
  const code = $('set-code').value.trim();
  if (code) store.setAccessCode(code);
  const tok = $('set-lichess').value.trim();
  if (tok) store.setLichessToken(tok);
  const yt = $('set-youtube').value.trim();
  if (yt) store.setYoutubeKey(yt);
  if (tok || code) optimal.update(state.game);
  refreshCoachPill();
  renderCoach();
  renderBoard();
  if (budgetChanged && state.viewPly === null && !state.game.status().over) runAnalysis(BUDGETS[s.budget].movetime);
}

// Accès pour les tests automatisés (lecture seule de l'état).
window.__coach = { state, engine, optimal, lichess, get repertoire() { return repertoirePage; }, get games() { return gamesPage; } };

// Ouvre une suite de coups sur l'échiquier comme nouvelle partie (l'ancienne est sauvegardée).
// animate : rejoue la séquence coup par coup (≈ 400 ms) puis revient à la position finale.
// headers : en-têtes PGN conservés (partie exemple Élite : joueurs, lien d'origine).
let replayTimer = null;
function openSanInBoard(san, color, label, { animate = false, headers = null } = {}) {
  const pgn = san.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ');
  const cur = state.game;
  // Pas de confirmation si la partie en cours est vide ou n'est qu'une ligne testée.
  const disposable = !cur.ply || String(cur.record.headers?.Event || '').startsWith('Test');
  if (!disposable && !window.confirm(`Ouvrir ${label} sur l’échiquier ? La partie en cours sera remplacée (elle reste récupérable dans ⚙ Réglages → Avancé).`)) return;
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
    openGame: (g) => openSanInBoard(g.san, g.color, `votre partie contre ${g.color === 'w' ? g.black : g.white}`, {
      headers: { White: g.white, Black: g.black, WhiteElo: g.whiteElo ? String(g.whiteElo) : '', BlackElo: g.blackElo ? String(g.blackElo) : '', Site: g.url || '', Date: (g.date || '').slice(0, 10).replace(/-/g, '.'), Result: g.result || '' },
    }),
  });
  return gamesPage;
}

// Bilan de la partie de l'échiquier : analysée coup par coup sur la page « Mes parties ».
function openBilan() {
  const g = state.game;
  if (!g.ply) { notationMsg('Jouez au moins un coup avant de demander un bilan.', true); return; }
  if (g.record.start.fen !== DEFAULT_POSITION) { notationMsg('Bilan indisponible pour une partie commencée depuis une position (FEN).', true); return; }
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
  if (g !== autoplay.game || g.ply !== autoplay.ply) { stopAutoplay('Suite automatique arrêtée : la partie a changé.'); return false; }
  if (state.viewPly !== null) { stopAutoplay('Suite automatique en pause (navigation dans les coups).'); return false; }
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
        autoplay.lastInfo = `théorie des maîtres (${n.toLocaleString('fr-FR')} parties)`;
      } else autoplay.theory = false; // hors théorie : Stockfish jusqu'à la fin
    } catch { autoplay.theory = false; }
  } else autoplay.theory = false;
  if (!move) {
    const a = state.analysis;
    if (a.status !== 'ready' || !g.isCurrent(a.token)) { autoplay.busy = false; return; } // runAnalysis rappellera autoStep
    move = a.advice.best.lan;
    autoplay.lastInfo = `Stockfish (${AUTO_MOVETIME / 1000} s par coup)`;
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
  mat: 'échec et mat', pat: 'pat', materiel: 'matériel insuffisant', quintuple: 'quintuple répétition',
  '75coups': 'règle des 75 coups', triple: 'triple répétition (nulle)', '50coups': 'règle des 50 coups (nulle)',
};

function finishAutoplay(st) {
  const why = st.over ? END_REASONS[st.reason] : END_REASONS[st.claimable[0]];
  const result = st.over ? st.result : '1/2-1/2';
  stopAutoplay(`Fin de partie : ${why} — ${result}. ${autoplay.n.theorie} coup(s) de théorie des maîtres, ${autoplay.n.moteur} de Stockfish.`);
}

function renderAutoplay() {
  const btn = $('btn-auto');
  btn.textContent = autoplay.running ? '⏸ Arrêter la suite automatique' : '⏩ Jouer la suite jusqu’à la fin';
  btn.disabled = !autoplay.running && (state.game.status().over || engine.state === 'error');
  $('auto-text').textContent = autoplay.running
    ? `Coup ${Math.floor(state.game.ply / 2) + 1} · ${autoplay.lastInfo || 'calcul…'} · ${autoplay.n.theorie} théorie / ${autoplay.n.moteur} Stockfish`
    : autoplay.note;
}

// Télécharge une partie de la base des maîtres et l'ouvre sur l'échiquier.
async function openMasterGame(id, color) {
  let pgn;
  try {
    pgn = await lichess.masterPgn(id);
  } catch (e) {
    notationMsg(`Partie de maître indisponible : ${e.message}`, true);
    return;
  }
  let g;
  try { g = Game.fromPgn(pgn, { playerColor: color, level: state.settings.level }); } catch (e) { notationMsg(e.message, true); return; }
  const h = g.record.headers;
  if (!window.confirm(`Ouvrir ${h.White || '?'} – ${h.Black || '?'} sur l’échiquier ? La partie en cours sera remplacée (récupérable dans ⚙ Réglages → Avancé).`)) return;
  store.backupGame();
  setGame(g);
  location.hash = '#/moteur';
}

init();
