// Page « Mes parties » : import des dernières parties (Lichess, Chess.com), repérage de la
// sortie du répertoire, analyse Stockfish coup par coup et bilan de chaque partie.
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { loadProgress, saveProgress, recordSortie } from './progress.js';
import { loadPgnTolerant } from './game.js';
import { sanFr, formatScore } from './analysis.js';
import {
  parseLichessGame, parseChessComGame, repertoireDeviation, localGame, analyseGame, bilan, whiteCp, moveNo, rapport, keyPlies,
  positionARevoir, alertePgn,
} from './games-core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fr = (san) => esc(sanFr(san));
const PREFS = 'coach-echecs:mes-parties';
const CACHE = 'coach-echecs:analyses-v1';
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

function load(k, d) { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return { ...d }; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage plein */ } }

export class GamesPage {
  constructor({ el, engine, client, getToken, openGame, openLine = null }) {
    this.el = el;
    this.openLine = openLine; // (san, color, label) : ligne ouverte sur l'échiquier Moteur
    this.engine = engine;
    this.client = client;
    this.getToken = getToken;
    this.openGame = openGame;
    this.prefs = load(PREFS, { lichess: '', chesscom: '', max: 20, speed: 'blitz', precision: 300 });
    this.cache = load(CACHE, {}); // id → evals (analyses terminées)
    this.partial = {}; // id → evals partielles (analyse mise en pause)
    this.games = [];
    this.status = {};
    this.data = null;
    this.selected = null;
    this.job = 0;
  }

  async show() {
    if (!this.data) {
      try { this.data = await (await fetch('./data/repertoire.json', { cache: 'no-cache' })).json(); } catch { this.data = { entries: [] }; }
    }
    if (this.pendingLocal) {
      // Bilan demandé depuis la page Moteur : la partie passe en tête de liste et s'analyse.
      const g = this.pendingLocal;
      this.pendingLocal = null;
      g.deviation = repertoireDeviation(g, this.data.entries);
      this.games = [g, ...this.games.filter((x) => x.id !== g.id)];
      this.selected = g.id;
      this.render();
      this.el.querySelector('[data-analysis]')?.scrollIntoView({ block: 'start' });
      if (!this.cache[g.id]) this.analyse(g);
      return;
    }
    if (!this.rendered) this.render();
    // Chargement automatique à la première ouverture si des pseudos sont enregistrés, puis
    // analyse de la plus récente partie non encore analysée.
    if (!this.autoDone && (this.prefs.lichess || this.prefs.chesscom) && !this.games.length) {
      this.autoDone = true;
      await this.importAll();
      const fresh = this.filtered().find((g) => !g.local && !this.cache[g.id]);
      if (fresh && this.visible() && !this.selected) this.analyse(fresh);
      return;
    }
    // Reprise automatique d'une analyse mise en pause quand on avait quitté la page.
    const paused = this.games.find((g) => g.id === this.selected && g.paused);
    if (paused) this.analyse(paused);
  }

  visible() { return !this.el.classList.contains('hidden'); }

  // Sorties de répertoire réelles → signalées dans la progression de l'Entraînement.
  noteSorties(games) {
    const p = loadProgress();
    for (const g of games) {
      const d = g.deviation;
      if (g.local) continue; // partie de l'échiquier Moteur : pas une vraie partie
      const pos = positionARevoir(g, d);
      if (pos || (d?.who === 'moi' && d.fiche)) {
        recordSortie(p, { gameId: g.id, ficheId: d.who === 'moi' ? d.fiche?.id || null : d.err?.id || null, rep: d.rep, ply: d.ply, date: g.date, pos, opp: g.color === 'w' ? g.black : g.white, url: g.url });
      }
    }
    saveProgress(p);
  }

  // À appeler avant d'afficher la page (l'analyse ne tourne que page visible).
  bilanLocal(game) { this.pendingLocal = localGame(game); }

  // ---------- Import ----------

  async fetchLichess(user, max) {
    const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&moves=true&opening=true&finished=true`;
    const headers = { accept: 'application/x-ndjson' };
    const tok = this.getToken();
    if (tok) headers.authorization = 'Bearer ' + tok;
    const r = await this.client.queue.run(url, { headers });
    const res = r.res;
    if (res.status === 404) throw new Error(tok ? 'compte introuvable ou export refusé par Lichess' : 'export refusé : ajoutez votre jeton Lichess (⚙ Réglages) et réessayez');
    if (res.status === 401) throw new Error('jeton Lichess refusé');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text.split('\n').filter(Boolean).map((l) => { try { return parseLichessGame(JSON.parse(l), user); } catch { return null; } }).filter(Boolean);
  }

  async fetchChessCom(user, max) {
    const base = `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games`;
    let r;
    try { r = await fetch(`${base}/archives`); } catch { throw new Error('Chess.com injoignable (réseau)'); }
    if (r.status === 404) throw new Error('compte Chess.com introuvable');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const archives = ((await r.json()).archives || []).slice().reverse();
    const out = [];
    for (const a of archives.slice(0, 4)) {
      const m = await fetch(a);
      if (!m.ok) continue;
      const games = ((await m.json()).games || []).slice().reverse();
      for (const g of games) {
        const p = parseChessComGame(g, user);
        if (p) out.push(p);
        if (out.length >= max) return out;
      }
    }
    return out;
  }

  async importAll() {
    const p = this.prefs;
    const max = Number(p.max) || 20;
    this.games = [];
    this.status = {};
    this.selected = null;
    const tasks = [];
    if (p.lichess) tasks.push(['Lichess', () => this.fetchLichess(p.lichess.trim(), max)]);
    if (p.chesscom) tasks.push(['Chess.com', () => this.fetchChessCom(p.chesscom.trim(), max)]);
    if (!tasks.length) { this.status.general = 'Indiquez au moins un pseudo.'; this.render(); return; }
    for (const [site] of tasks) this.status[site] = { state: 'loading' };
    this.render();
    await Promise.all(tasks.map(async ([site, fn]) => {
      try {
        const list = await fn();
        this.games.push(...list);
        this.status[site] = { state: 'ok', n: list.length };
      } catch (e) {
        this.status[site] = { state: 'error', error: e.message };
      }
      this.render();
    }));
    this.games.sort((a, b) => b.date.localeCompare(a.date));
    for (const g of this.games) g.deviation = repertoireDeviation(g, this.data.entries);
    // « Nouveau » : parties terminées depuis le dernier chargement.
    const last = this.prefs.lastSeen || '';
    for (const g of this.games) g.isNew = !!last && g.date > last;
    if (this.games.length) { this.prefs.lastSeen = this.games[0].date; save(PREFS, this.prefs); }
    this.noteSorties(this.games);
    this.render();
  }

  filtered() {
    const sp = this.prefs.speed;
    return this.games.filter((g) => g.local || g.site === 'PGN collé' || sp === 'toutes' || g.speed.toLowerCase() === { blitz: 'blitz', rapide: 'rapide', bullet: 'bullet' }[sp]);
  }

  // ---------- Analyse ----------

  async analyse(game) {
    const job = ++this.job;
    this.selected = game.id;
    const n = game.san.length;
    const c = new Chess();
    const ucis = game.san.map((s) => c.move(s).lan);
    const done = this.cache[game.id]?.evals;
    const part = this.partial[game.id];
    const evals = done?.length === n + 1 ? done : (part?.length === n + 1 ? part : new Array(n + 1).fill(null));
    game.progress = evals.filter(Boolean).length / (n + 1);
    this.render();
    const replay = new Chess();
    const fens = [replay.fen()];
    for (const s of game.san) { replay.move(s); fens.push(replay.fen()); }
    for (let i = 0; i <= n; i++) {
      if (evals[i]) continue;
      if (job !== this.job) return;
      // Le moteur est partagé : on s'arrête quand la page n'est plus affichée.
      if (!this.visible()) {
        game.paused = true;
        this.partial[game.id] = evals; // analyse partielle, reprise au retour sur la page
        return;
      }
      const pos = new Chess(fens[i]);
      if (pos.isCheckmate()) evals[i] = { cp: pos.turn() === 'w' ? -1000 : 1000, best: null };
      else if (pos.isStalemate() || pos.isInsufficientMaterial()) evals[i] = { cp: 0, best: null };
      else {
        let res;
        try {
          res = await this.engine.analyze({
            position: `position startpos${i ? ' moves ' + ucis.slice(0, i).join(' ') : ''}`,
            movetime: Number(this.prefs.precision) || 300,
            token: { gameId: `analyse-${game.id}`, branchId: 'analyse', revision: i, ply: i },
          });
        } catch (e) {
          game.error = `Moteur indisponible : ${e.message}`;
          this.render();
          return;
        }
        if (res.cancelled) { game.paused = true; this.render(); return; }
        evals[i] = { cp: whiteCp(res.info?.score, pos.turn()), best: res.bestmove };
      }
      game.progress = evals.filter(Boolean).length / (n + 1);
      if (i % 4 === 0) this.renderAnalysis();
    }
    game.paused = false;
    delete this.partial[game.id];
    this.cache[game.id] = { evals, at: Date.now() };
    // Cache limité aux 40 dernières analyses.
    const ids = Object.keys(this.cache).sort((a, b) => this.cache[b].at - this.cache[a].at);
    for (const id of ids.slice(40)) delete this.cache[id];
    save(CACHE, this.cache);
    this.render();
    this.deepen(game);
  }

  // Rapport détaillé : variantes de Stockfish (meilleur coup et réfutation du coup joué)
  // pour chaque erreur principale. Mises en cache avec l'analyse.
  async deepen(game) {
    const c = this.cache[game.id];
    if (!c || c.deep || this.deepening === game.id) return;
    this.deepening = game.id;
    const job = this.job;
    const replay = new Chess();
    const ucis = game.san.map((s) => replay.move(s).lan);
    const b = bilan(game, analyseGame(game, c.evals), game.deviation);
    const deep = {};
    try {
      for (const i of keyPlies(b)) {
        for (const [k, n] of [['best', i], ['played', i + 1]]) {
          if (job !== this.job || !this.visible() || this.selected !== game.id) return;
          const pos = new Chess();
          for (const u of ucis.slice(0, n)) pos.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
          if (pos.isGameOver()) continue;
          const res = await this.engine.analyze({
            position: `position startpos${n ? ' moves ' + ucis.slice(0, n).join(' ') : ''}`,
            movetime: Math.max(1000, 3 * (Number(this.prefs.precision) || 300)),
            token: { gameId: `rapport-${game.id}`, branchId: 'rapport', revision: n, ply: n },
          });
          if (res.cancelled) return;
          (deep[i] ||= {})[k] = { pv: (res.info?.pv || []).slice(0, 10), cp: whiteCp(res.info?.score, pos.turn()) };
        }
      }
      c.deep = deep;
      save(CACHE, this.cache);
      if (this.selected === game.id) this.renderAnalysis();
    } catch (e) {
      c.deepError = e.message;
    } finally {
      this.deepening = null;
    }
  }

  // ---------- Rendu ----------

  render() {
    this.rendered = true;
    const p = this.prefs;
    const st = (site) => {
      const s = this.status[site];
      if (!s) return '';
      if (s.state === 'loading') return `<li><span class="spinner"></span> ${site} : chargement…</li>`;
      if (s.state === 'error') return `<li class="error-text">${site} : ${esc(s.error)}</li>`;
      return `<li>${site} : ${s.n} partie(s) importée(s)</li>`;
    };
    this.el.innerHTML = `
      <div class="card games-form">
        <h2>Mes parties</h2>
        <div class="games-inputs">
          <label>Pseudo Lichess <input type="text" data-p="lichess" value="${esc(p.lichess)}" autocapitalize="off" spellcheck="false" placeholder="ex. MonPseudo"></label>
          <label>Pseudo Chess.com <input type="text" data-p="chesscom" value="${esc(p.chesscom)}" autocapitalize="off" spellcheck="false" placeholder="ex. MonPseudo"></label>
          <label>Parties par site <select data-p="max">${[10, 20, 40].map((n) => `<option ${Number(p.max) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Cadence <select data-p="speed">${[['blitz', 'Blitz'], ['rapide', 'Rapide'], ['bullet', 'Bullet'], ['toutes', 'Toutes']].map(([v, l]) => `<option value="${v}" ${p.speed === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Analyse <select data-p="precision"><option value="300" ${Number(p.precision) === 300 ? 'selected' : ''}>Rapide (0,3 s par position)</option><option value="800" ${Number(p.precision) === 800 ? 'selected' : ''}>Précise (0,8 s par position)</option></select></label>
        </div>
        <div class="actions"><button type="button" class="primary" data-import>Charger mes parties</button></div>
        <ul class="games-status">${st('Lichess')}${st('Chess.com')}${this.status.general ? `<li class="error-text">${esc(this.status.general)}</li>` : ''}</ul>
        <p class="muted small">Lichess : l’export utilise votre jeton (⚙) s’il est enregistré. Chess.com : API publique, sans compte. Rien n’est envoyé ailleurs ; l’analyse est faite par Stockfish sur votre appareil.</p>
      </div>
      ${this.pgnHtml()}
      ${this.summaryHtml()}
      <div data-analysis></div>
      ${this.listHtml()}`;
    this.bind();
    this.renderAnalysis();
  }

  // ---------- Partie collée en PGN ----------

  pgnHtml() {
    const a = this.pgnAlert;
    const alert = a ? `<div class="card pgn-alert ${a.niveau}" data-pgn-alert role="status">
        <p>${a.niveau === 'warn' ? '⚠ ' : a.niveau === 'ok' ? '✔ ' : 'ℹ '}${esc(a.texte)}</p>
        <div class="actions">${a.ligne ? `<button type="button" class="primary" data-pgn-line>${esc(a.bouton)}</button>` : ''}
          <button type="button" data-open="${esc(a.id)}">Ouvrir la partie sur l’échiquier</button>
          <button type="button" data-analyse="${esc(a.id)}">Analyser avec Stockfish</button></div>
      </div>` : '';
    return `<details class="card pgn-paste" ${this.pgnOpen ? 'open' : ''}>
        <summary><strong>📋 Coller une partie PGN</strong> <span class="muted small">(Lichess, Chess.com…)</span></summary>
        <textarea data-pgn rows="5" spellcheck="false" placeholder="[White &quot;…&quot;] [Black &quot;…&quot;]&#10;1. d4 d5 2. c4 …" aria-label="Partie au format PGN"></textarea>
        <label class="row">Je jouais <select data-pgn-color><option value="auto">Détecter (mes pseudos)</option><option value="w">les Blancs</option><option value="b">les Noirs</option></select></label>
        <div class="actions"><button type="button" class="primary" data-pgn-go>Comparer avec mon répertoire</button></div>
        <p class="error-text small" data-pgn-err></p>
      </details>${alert}`;
  }

  pastePgn() {
    const errEl = this.el.querySelector('[data-pgn-err]');
    const raw = this.el.querySelector('[data-pgn]').value;
    let c;
    try { c = loadPgnTolerant(raw); } catch (e) { errEl.textContent = `PGN illisible : ${e.message}`; return; }
    const san = c.history();
    if (!san.length) { errEl.textContent = 'Aucun coup trouvé dans ce PGN.'; return; }
    const h = (c.getHeaders?.() || c.header?.() || {});
    const low = (x) => String(x || '').trim().toLowerCase();
    const mine = [this.prefs.lichess, this.prefs.chesscom].map(low).filter(Boolean);
    let color = this.el.querySelector('[data-pgn-color]').value;
    if (color === 'auto') color = mine.includes(low(h.White)) ? 'w' : mine.includes(low(h.Black)) ? 'b' : (san[0] === 'e4' ? 'b' : 'w');
    const base = localGame({ san, color, result: h.Result || '*', white: h.White && h.White !== '?' ? h.White : null, black: h.Black && h.Black !== '?' ? h.Black : null });
    const d = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(h.Date || h.UTCDate || '');
    const g = {
      ...base, site: 'PGN collé', id: base.id.replace(/^moteur-/, 'pgn-'), local: false, speed: 'PGN',
      url: /^https:\/\//.test(h.Site || h.Link || '') ? (h.Site?.startsWith('https://') ? h.Site : h.Link) : null,
      date: d ? new Date(Date.UTC(+d[1], +d[2] - 1, +d[3])).toISOString() : base.date,
      whiteElo: Number(h.WhiteElo) || null, blackElo: Number(h.BlackElo) || null,
    };
    g.deviation = repertoireDeviation(g, this.data?.entries || []);
    this.games = [g, ...this.games.filter((x) => x.id !== g.id)];
    this.noteSorties([g]);
    this.pgnAlert = { id: g.id, color, ...alertePgn(g, g.deviation) };
    this.pgnOpen = true;
    this.render();
    this.el.querySelector('[data-pgn-alert]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  summaryHtml() {
    const list = this.filtered().filter((g) => !g.local);
    if (!list.length) return '';
    const by = (fn) => { const g = list.filter(fn); const w = g.filter((x) => x.outcome === 'victoire').length; const d = g.filter((x) => x.outcome === 'nulle').length; return { n: g.length, w, d, l: g.length - w - d }; };
    const fmt = (s) => (s.n ? `${s.n} partie(s) : ${s.w} V · ${s.d} N · ${s.l} D` : 'aucune');
    const all = by(() => true);
    const whiteRep = by((g) => g.color === 'w' && g.san[0] === 'd4');
    const whiteOther = by((g) => g.color === 'w' && g.san[0] !== 'd4');
    const caro = by((g) => g.color === 'b' && g.san[0] === 'e4' && g.san[1] === 'c6');
    const blackE4Other = by((g) => g.color === 'b' && g.san[0] === 'e4' && g.san[1] !== 'c6');
    const devs = {};
    for (const g of list) {
      const d = g.deviation;
      if (d?.who === 'moi' && d.expected) {
        const k = `${moveNo(d.ply)} ${sanFr(d.played)} au lieu de ${d.expected.map(sanFr).join(' ou ')}`;
        devs[k] = (devs[k] || 0) + 1;
      }
    }
    const topDev = Object.entries(devs).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const analysed = list.filter((g) => this.cache[g.id]);
    let agg = '';
    if (analysed.length) {
      let gaffes = 0; let erreurs = 0; let tot = 0; let n = 0;
      const phases = {};
      for (const g of analysed) {
        const plies = analyseGame(g, this.cache[g.id].evals);
        const b = bilan(g, plies, g.deviation);
        gaffes += b.counts.gaffe; erreurs += b.counts.erreur;
        if (b.avg != null) { tot += b.avg; n++; }
        for (const e of plies.filter((x) => x.mover === g.color && x.cls)) phases[e.phase] = (phases[e.phase] || 0) + 1;
      }
      const ph = Object.entries(phases).sort((a, b) => b[1] - a[1])[0];
      agg = `<p><strong>Sur ${analysed.length} partie(s) analysée(s)</strong> : ${gaffes} gaffe(s), ${erreurs} erreur(s)${n ? `, perte moyenne ${(tot / n / 100).toFixed(2).replace('.', ',')} pion/coup` : ''}${ph ? ` ; phase la plus fragile : ${ph[0]}` : ''}.</p>`;
    }
    return `<div class="card games-summary">
      <h2>Vue d’ensemble (${esc(this.prefs.speed === 'toutes' ? 'toutes cadences' : this.prefs.speed)})</h2>
      <p>Total : ${fmt(all)}</p>
      <ul>
        <li>Blancs avec 1.d4 (votre répertoire) : ${fmt(whiteRep)}</li>
        ${whiteOther.n ? `<li>Blancs sans 1.d4 : ${fmt(whiteOther)}</li>` : ''}
        <li>Noirs, Caro-Kann contre 1.e4 : ${fmt(caro)}</li>
        ${blackE4Other.n ? `<li>Noirs, autre réponse à 1.e4 : ${fmt(blackE4Other)}</li>` : ''}
      </ul>
      ${topDev.length ? `<p><strong>Vos sorties de répertoire les plus fréquentes :</strong></p><ul>${topDev.map(([k, n]) => `<li>${esc(k)} (${n} fois)</li>`).join('')}</ul>` : ''}
      ${agg}
    </div>`;
  }

  deviationText(g) {
    const d = g.deviation;
    if (!d || !d.rep) return '<span class="muted">Hors répertoire</span>';
    if (d.who === 'moi') return `<span class="ko">Sortie du répertoire : ${moveNo(d.ply)} ${fr(d.played)} (fiche : ${d.expected.map(fr).join(' ou ')})</span>`;
    if (d.who === 'adversaire-erreur') return d.punished ? `<span class="ok">Erreur adverse ${moveNo(d.ply)} ${fr(d.played)} punie ✔</span>` : `<span class="ko">Erreur adverse ${moveNo(d.ply)} ${fr(d.played)} non punie (${fr(d.expected[0])})</span>`;
    if (d.who === 'adversaire') return `<span class="muted">L’adversaire sort des fiches : ${moveNo(d.ply)} ${fr(d.played)}</span>`;
    return '<span class="ok">Répertoire suivi jusqu’au bout des fiches ✔</span>';
  }

  listHtml() {
    const list = this.filtered();
    if (!this.games.length) return '';
    if (!list.length) return '<p class="muted pad">Aucune partie pour cette cadence.</p>';
    return `<div class="games-list">${list.map((g) => {
      const opp = g.color === 'w' ? `${g.black} (${g.blackElo ?? '?'})` : `${g.white} (${g.whiteElo ?? '?'})`;
      const done = this.cache[g.id];
      return `<article class="card game-card ${g.id === this.selected ? 'selected' : ''}">
        <div class="game-top">${g.isNew ? '<span class="badge ok">Nouveau</span> ' : ''}<span class="badge">${esc(g.site)}</span> <span class="badge">${esc(g.speed)}</span>
          <span class="res ${g.outcome === 'victoire' ? 'ok' : g.outcome === 'défaite' ? 'ko' : ''}">${esc(g.outcome)}</span>
          <span class="muted small">${new Date(g.date).toLocaleDateString('fr-FR')}</span></div>
        <p><span class="dot ${g.color}"></span> ${g.color === 'w' ? 'Blancs' : 'Noirs'} contre <strong>${esc(opp)}</strong> · ${Math.ceil(g.san.length / 2)} coups</p>
        <p class="small muted">${esc(g.opening)}</p>
        <p class="small">${this.deviationText(g)}</p>
        <div class="actions">
          <button type="button" class="${done ? '' : 'primary'}" data-analyse="${esc(g.id)}">${done ? 'Voir l’analyse' : 'Analyser'}</button>
          <button type="button" data-open="${esc(g.id)}">Ouvrir sur l’échiquier</button>
          ${g.url ? `<a class="btn-link" href="${esc(g.url)}" target="_blank" rel="noopener">Sur ${esc(g.site)}</a>` : ''}
        </div>
      </article>`;
    }).join('')}</div>`;
  }

  renderAnalysis() {
    const box = this.el.querySelector('[data-analysis]');
    if (!box) return;
    const g = this.games.find((x) => x.id === this.selected);
    if (!g) { box.innerHTML = ''; return; }
    const cached = this.cache[g.id];
    const head = `<h2>Analyse : ${g.color === 'w' ? 'Blancs' : 'Noirs'} contre ${esc(g.color === 'w' ? g.black : g.white)} <span class="muted small">(${esc(g.site)}, ${esc(g.outcome)})</span></h2>`;
    if (!cached) {
      const pc = Math.round((g.progress || 0) * 100);
      box.innerHTML = `<div class="card">${head}
        ${g.error ? `<p class="errbox">${esc(g.error)}</p>` : g.paused
          ? `<p>Analyse interrompue (le moteur a servi ailleurs). <button type="button" data-resume>Reprendre</button></p>`
          : `<p class="state"><span class="spinner"></span> Stockfish analyse la partie : ${pc} %</p><div class="progress"><span style="width:${pc}%"></span></div>`}
        <p class="small">${this.deviationText(g)}</p></div>`;
      box.querySelector('[data-resume]')?.addEventListener('click', () => this.analyse(g));
      return;
    }
    const plies = analyseGame(g, cached.evals);
    const b = bilan(g, plies, g.deviation);
    const line = (p) => `${moveNo(p.i)} ${fr(p.san)}`;
    box.innerHTML = `<div class="card analysis-card">${head}
      <p class="small">${this.deviationText(g)}</p>
      ${this.graphHtml(cached.evals, g.color)}
      <div class="analysis-grid">
        <div><div class="board-wrap" data-review-board></div><p class="small muted" data-review-caption>Touchez un coup pour voir la position (flèche verte : meilleur coup, rouge : coup joué).</p></div>
        <div>
          <h3>Bilan</h3>
          <p class="small">${b.counts.gaffe} gaffe(s) · ${b.counts.erreur} erreur(s) · ${b.counts.imprecision} imprécision(s)${b.avg != null ? ` · perte moyenne ${(b.avg / 100).toFixed(2).replace('.', ',')} pion/coup` : ''}</p>
          <h3>Moments décisifs</h3>
          ${b.decisive.length ? `<ul>${b.decisive.map((p) => `<li><button type="button" class="link-btn" data-ply="${p.i}">${line(p)}</button> (${p.mover === g.color ? 'vous' : 'adversaire'}) : ${esc(formatScore({ type: 'cp', value: p.cpBefore }))} → ${esc(formatScore({ type: 'cp', value: p.cpAfter }))}</li>`).join('')}</ul>` : '<p class="small muted">Aucun basculement majeur.</p>'}
          <h3>Vos erreurs principales</h3>
          ${b.errors.length ? `<ul>${b.errors.map((p) => `<li><button type="button" class="link-btn" data-ply="${p.i}">${line(p)}</button> — ${esc(p.cls.label)} ; le moteur préférait <strong>${fr(p.bestSan)}</strong> (perte ≈ ${(Math.min(p.loss, 1000) / 100).toFixed(1).replace('.', ',')})</li>`).join('')}</ul>` : '<p class="small muted">Aucune erreur détectée à ce niveau d’analyse.</p>'}
          <h3>Trois pistes de travail</h3>
          <ol>${b.pistes.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ol>
          <p class="muted tiny">Pistes déduites des calculs de Stockfish (${this.prefs.precision} ms par position) et des règles, sans IA.</p>
        </div>
      </div>
      ${this.reportHtml(g, plies, b, cached)}
      <h3>Coups</h3>
      <p class="moves-annot">${plies.map((p) => `<button type="button" class="m ${p.mover === g.color ? 'mine' : ''} ${p.cls ? 'c-' + p.cls.id : ''}" data-ply="${p.i}">${p.i % 2 === 0 ? `${p.i / 2 + 1}.` : ''}${fr(p.san)}${p.cls && p.mover === g.color ? p.cls.mark : ''}</button>`).join(' ')}</p>
    </div>`;
    const bel = box.querySelector('[data-review-board]');
    this.reviewBoard = new Board(bel, { piecesUrl: './pieces/' });
    this.reviewBoard.setOrientation(g.color);
    this.showPly(g, plies, b.errors[0]?.i ?? 0);
    box.querySelectorAll('[data-ply]').forEach((el) => el.addEventListener('click', () => this.showPly(g, plies, Number(el.dataset.ply))));
    box.querySelectorAll('[data-exo]').forEach((el) => el.addEventListener('click', () => {
      this.showPly(g, plies, Number(el.dataset.exo), { exo: true });
      box.querySelector('[data-review-board]').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    if (!cached.deep) this.deepen(g);
  }

  reportHtml(g, plies, b, cached) {
    const r = rapport(g, plies, b, g.deviation, cached.deep || {});
    const at = (i, label) => `<button type="button" class="link-btn" data-ply="${i}">${label}</button>`;
    const pending = !cached.deep ? '<p class="state small"><span class="spinner"></span> Stockfish approfondit vos erreurs (variantes « ce qui aurait pu se passer »)…</p>' : '';
    return `<section class="card report" data-report>
      <h3>📝 Rapport détaillé</h3>
      <p class="report-note ${r.note.ton ? 'note-' + r.note.ton : ''}"><strong>${esc(r.note.titre)}.</strong> ${esc(r.synthese)}</p>
      <h4>Déroulement</h4>
      <ul>${r.phases.map((x) => `<li><strong>${esc(x.phase[0].toUpperCase() + x.phase.slice(1))}</strong> : ${esc(x.avis)}${x.coups ? ` <span class="muted">(${x.coups} coups${x.loss != null ? `, perte moyenne ${(x.loss / 100).toFixed(2).replace('.', ',')}` : ''})</span>` : ''}</li>`).join('')}</ul>
      <h4>✔ Vos bons coups</h4>
      ${r.bons.length ? `<ul>${r.bons.map((x) => `<li>${at(x.i, '▸')} ${esc(x.text)}</li>`).join('')}</ul>` : '<p class="small muted">Pas de coup marquant détecté (aucune erreur adverse à sanctionner, ou pas de longue série sans faute).</p>'}
      <h4>✘ Vos erreurs, expliquées</h4>
      ${pending}
      ${r.erreurs.length ? r.erreurs.map((e) => `<div class="report-err">
        <p><strong>${at(e.i, esc(e.coup))}</strong> — ${esc(e.cls.label)} (${esc(e.phase)}). Évaluation pour vous : ${esc(e.avant)} → <strong>${esc(e.apres)}</strong> (perte ≈ ${esc(e.perte)} pion${e.perte === '1,0' ? '' : 's'}).</p>
        ${e.pourquoi.length ? `<p><strong>Pourquoi :</strong> ${esc(e.pourquoi.join(' ; '))}.</p>` : ''}
        ${e.refutation ? `<p><strong>Ce qui pouvait suivre :</strong> <span class="line">${esc(e.refutation)}</span>${e.refutationEval ? ` → ${esc(e.refutationEval)} pour vous` : ''}.</p>` : ''}
        <p><strong>Le meilleur coup :</strong> ${esc(e.meilleurCoup)}${e.meilleureLigne ? `, par exemple <span class="line">${esc(e.meilleureLigne)}</span>` : ''} → ${esc(e.meilleureEval)} pour vous${e.gains.length ? ` (${esc(e.gains.join(', '))})` : ''}.</p>
      </div>`).join('') : '<p class="small muted">Aucune erreur détectée à ce niveau d’analyse. 👏</p>'}
      ${r.occasions.length ? `<h4>💡 Occasions manquées</h4><ul>${r.occasions.map((x) => `<li>${at(x.i, '▸')} ${esc(x.text)}</li>`).join('')}</ul>` : ''}
      <h4>🧠 À retenir pour la prochaine partie</h4>
      <ul>${r.aRetenir.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${r.exercices.length ? `<h4>🎯 Exercices sur vos positions</h4><ul>${r.exercices.map((x) => `<li><button type="button" class="link-btn" data-exo="${x.i}">${esc(x.text)}</button></li>`).join('')}</ul>` : ''}
      <p class="muted tiny">Rapport rédigé automatiquement à partir des calculs de Stockfish (évaluations et variantes) et des règles du jeu (chess.js), sans IA. Les variantes sont des calculs du moteur, pas des certitudes sur ce qu’aurait joué votre adversaire.</p>
    </section>`;
  }

  showPly(g, plies, i, { exo = false } = {}) {
    const p = plies[i];
    if (!p || !p.fenBefore) return;
    if (exo) {
      // Exercice : position seule, sans flèche ni solution.
      this.reviewBoard.setPosition(new Chess(p.fenBefore), { lastMove: null });
      this.reviewBoard.setArrows([]);
      const cap = this.el.querySelector('[data-review-caption]');
      if (cap) cap.innerHTML = `🎯 Exercice : ${p.mover === 'w' ? 'les Blancs' : 'les Noirs'} jouent. Trouvez le meilleur coup, puis touchez <button type="button" class="link-btn" data-sol="${i}">voir la solution</button>.`;
      cap?.querySelector('[data-sol]')?.addEventListener('click', () => this.showPly(g, plies, i));
      return;
    }
    this.reviewBoard.setPosition(new Chess(p.fenBefore), { lastMove: i > 0 ? { from: plies[i - 1].uci?.slice(0, 2), to: plies[i - 1].uci?.slice(2, 4) } : null });
    const arrows = [{ from: p.uci.slice(0, 2), to: p.uci.slice(2, 4), kind: 'threat' }];
    if (p.bestUci) arrows.push({ from: p.bestUci.slice(0, 2), to: p.bestUci.slice(2, 4), kind: 'best' });
    this.reviewBoard.setArrows(arrows);
    const cap = this.el.querySelector('[data-review-caption]');
    if (cap) {
      cap.innerHTML = `Avant ${moveNo(i)} ${fr(p.san)} (${p.mover === g.color ? 'vous' : 'adversaire'}) : évaluation ${esc(formatScore({ type: 'cp', value: p.cpBefore }))}`
        + (p.bestSan ? ` · meilleur coup : <strong>${fr(p.bestSan)}</strong>` : ' · coup joué = meilleur coup du moteur')
        + (p.cls ? ` · <strong>${esc(p.cls.label)}</strong>` : '');
    }
    this.el.querySelectorAll('.moves-annot .m').forEach((b) => b.classList.toggle('current', Number(b.dataset.ply) === i));
  }

  graphHtml(evals, color) {
    const w = 600; const h = 90;
    const pts = evals.map((e, i) => {
      const v = Math.max(-500, Math.min(500, e?.cp ?? 0));
      return `${((i / Math.max(1, evals.length - 1)) * w).toFixed(1)},${(h / 2 - (v / 500) * (h / 2 - 4)).toFixed(1)}`;
    }).join(' ');
    return `<svg class="eval-graph" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Courbe d’évaluation (au-dessus : avantage Blancs)">
      <rect x="0" y="0" width="${w}" height="${h / 2}" class="g-white"/><rect x="0" y="${h / 2}" width="${w}" height="${h / 2}" class="g-black"/>
      <polyline points="${pts}" class="g-line"/></svg>
      <p class="muted tiny">Courbe d’évaluation Stockfish (haut : avantage Blancs, bas : avantage Noirs) — vous avez les ${color === 'w' ? 'Blancs' : 'Noirs'}.</p>`;
  }

  bind() {
    this.el.querySelectorAll('[data-p]').forEach((inp) => inp.addEventListener('change', () => {
      this.prefs[inp.dataset.p] = inp.value.trim();
      save(PREFS, this.prefs);
      if (inp.dataset.p === 'speed') this.render();
    }));
    this.el.querySelector('[data-import]').addEventListener('click', () => {
      this.el.querySelectorAll('[data-p]').forEach((inp) => { this.prefs[inp.dataset.p] = inp.value.trim(); });
      save(PREFS, this.prefs);
      this.importAll();
    });
    this.el.querySelectorAll('[data-analyse]').forEach((b) => b.addEventListener('click', () => {
      const g = this.games.find((x) => x.id === b.dataset.analyse);
      if (!g) return;
      if (this.cache[g.id]) { this.selected = g.id; this.render(); } else this.analyse(g);
      this.el.querySelector('[data-analysis]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    this.el.querySelector('[data-pgn-go]')?.addEventListener('click', () => this.pastePgn());
    this.el.querySelector('[data-pgn-line]')?.addEventListener('click', () => {
      const a = this.pgnAlert;
      if (a?.ligne) this.openLine?.(a.ligne, a.color, a.bouton === 'Voir la réfutation' ? 'la réfutation de la fiche' : 'le coup de la fiche');
    });
    this.el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      const g = this.games.find((x) => x.id === b.dataset.open);
      if (g) this.openGame(g);
    }));
  }
}
