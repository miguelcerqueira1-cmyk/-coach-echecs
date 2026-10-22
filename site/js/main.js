// Contrôleur principal. Principe : l'état de partie (game.js) est la source de vérité ;
// Stockfish calcule ; chess.js valide ; Claude explique les résultats calculés.
import { Game, parseMoveText } from './game.js';
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
import { RepertoirePage } from './repertoire-page.js';

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
  onPlay: (uci) => {
    if (state.viewPly !== null) return;
    const mv = state.game.legalMoves().find((m) => m.lan === uci);
    if (mv && window.confirm(`Enregistrer ${sanFr(mv.san)} comme coup réellement joué ?`)) playMove(uci, 'explorer');
  },
});
let repertoirePage = null;

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
          openLine: openLineInBoard,
        });
        repertoirePage.show();
      }
    },
  });
  try {
    await engine.load();
  } catch { /* état d'erreur déjà affiché */ }
  onPositionChanged('init');
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
  // Toute explication en cours devient obsolète.
  abortCoach();
  state.coach = { status: 'idle', token: null, html: '', error: null, abort: null, meta: null };
  state.analysis = { status: 'waiting-engine', token: null, live: null, advice: null, error: null, deeper: false };
  renderAll();
  optimal.setEngine(engine.state === 'error' ? 'error' : 'computing', null);
  optimal.update(g);
  const st = g.status();
  if (st.over) {
    engine.cancelAll();
    state.analysis.status = 'over';
    renderAdvice();
    return;
  }
  runAnalysis(BUDGETS[state.settings.budget].movetime);
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
    // Calcul interrompu sans remplaçant (cas rare) : on garde le dernier conseil valide.
    state.analysis = { ...state.analysis, status: previous ? 'ready' : 'error', error: previous ? null : 'Calcul interrompu. Touchez « Analyser davantage » pour relancer.', live: null };
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
  optimal.setEngine('ready', advice);
  if (!advice.isPlayerTurn) {
    state.expectation = { gameId: g.id, revision: g.revision, ply: g.ply, uci: advice.best.lan, san: advice.best.san };
  }
  renderAdvice();
  renderBoard();
  if (advice.isPlayerTurn && !deeper && state.settings.autoExplain) explain({ auto: true });
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

  if (free) {
    const sections = explicationGratuite({ game: g, advice, threat, deviation: state.deviation });
    // La flèche rouge n'est dessinée que pour une menace sérieuse.
    const shown = menaceSerieuse(advice, threat, g.playerColor) ? threat : null;
    state.coach = { status: 'ready', mode: 'free', token, html: renderExplication(sections), error: null, abort: null, meta: { depth: advice.depth, threat: shown } };
    renderCoach();
    if (threat) renderBoard();
    return;
  }

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

function renderTurn() {
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
  if (live && a.advice && g.isCurrent(a.advice.token) && a.status !== 'engine-error') {
    if (a.advice.isPlayerTurn) arrows.push({ from: a.advice.best.from, to: a.advice.best.to, kind: 'best' });
    else if (state.settings.showOpponentArrow) arrows.push({ from: a.advice.best.from, to: a.advice.best.to, kind: 'reply' });
    const th = state.coach.meta?.threat;
    if (th && state.coach.token && g.isCurrent(state.coach.token)) arrows.push({ from: th.move.from, to: th.move.to, kind: 'threat' });
  }
  if (live) {
    const stat = optimal.statArrow((t) => g.isCurrent(t));
    // Flèche bleue seulement si le coup statistique diffère du coup moteur déjà fléché.
    if (stat && !arrows.some((x) => x.from === stat.from && x.to === stat.to)) arrows.push(stat);
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
  else if (adv.isPlayerTurn) el.innerHTML = `Conseil : <strong class="best">${esc(sanFr(adv.best.san))}</strong> — ${esc(adv.bestDescription)} <span class="muted">(${esc(adv.scoreText)})</span>`;
  else el.innerHTML = `Meilleure réponse adverse calculée : <strong class="reply">${esc(sanFr(adv.best.san))}</strong> <span class="muted">— saisissez le coup réel</span>`;
}

function renderAdvice() {
  renderMini();
  const el = $('advice');
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
  state.viewPly = ply === g.ply ? null : ply;
  renderBoard();
  renderMoves();
  renderButtons();
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
  $('set-opp-arrow').checked = s.showOpponentArrow;
  $('set-api').value = s.apiUrl;
  $('set-code').value = '';
  $('set-code').placeholder = store.getAccessCode() ? 'Code enregistré sur cet appareil (laisser vide pour le garder)' : 'Saisi une fois, conservé sur cet appareil';
  $('coach-test-msg').textContent = '';
  $('set-lichess').value = '';
  $('set-lichess').placeholder = store.getLichessToken() ? 'Jeton enregistré sur cet appareil (laisser vide pour le garder)' : 'lip_… (jeton sans aucune permission)';
  $('dlg-settings').showModal();
}

function saveSettingsFromForm() {
  const s = state.settings;
  const budgetChanged = s.budget !== $('set-budget').value;
  s.budget = $('set-budget').value;
  s.level = $('set-level').value;
  s.autoExplain = $('set-auto').checked;
  s.showOpponentArrow = $('set-opp-arrow').checked;
  s.apiUrl = $('set-api').value.trim();
  store.saveSettings(s);
  state.game.setLevel(s.level);
  store.saveGame(state.game.toJSON());
  const code = $('set-code').value.trim();
  if (code) store.setAccessCode(code);
  const tok = $('set-lichess').value.trim();
  if (tok) store.setLichessToken(tok);
  if (tok || code) optimal.update(state.game);
  refreshCoachPill();
  renderCoach();
  renderBoard();
  if (budgetChanged && state.viewPly === null && !state.game.status().over) runAnalysis(BUDGETS[s.budget].movetime);
}

// Accès pour les tests automatisés (lecture seule de l'état).
window.__coach = { state, engine, optimal, lichess, get repertoire() { return repertoirePage; } };

// Ouvre une ligne du répertoire sur l'échiquier comme nouvelle partie (l'ancienne est sauvegardée).
function openLineInBoard(entry) {
  const color = entry.rep === 'gd' ? 'w' : 'b';
  const pgn = entry.san.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ');
  if (!window.confirm(`Ouvrir « ${entry.nom} » sur l’échiquier ? La partie en cours sera remplacée (elle reste récupérable dans ⚙ Réglages → Avancé).`)) return;
  store.backupGame();
  setGame(Game.fromPgn(pgn, { playerColor: color, level: state.settings.level }));
  location.hash = '#/moteur';
}

init();
