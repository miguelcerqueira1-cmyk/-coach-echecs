// Page « Mes parties » : import des dernières parties (Lichess, Chess.com), repérage de la
// sortie du répertoire, analyse Stockfish coup par coup et bilan de chaque partie.
import { Chess } from '../vendor/chess.js';
import { localiserData } from './donnees-langue.js';
import { Board } from './board.js';
import { loadProgress, saveProgress, recordSortie, recordPartie, recordMoment, vraiesErreurs } from './progress.js';
import { demanderEntrainement } from './demande-entrainement.js';
import { isPro, openPaywall } from './pro.js';
import { loadPgnTolerant } from './game.js';
import { chargerOuvertures, resumeOuverture, resumeOuvertureHtml } from './ouverture.js';
import { choisis, REPERTOIRES } from './mon-repertoire.js';
import { sanFr, formatScore } from './analysis.js';
import {
  parseLichessGame, parseChessComGame, repertoireDeviation, localGame, analyseGame, bilan, whiteCp, moveNo, rapport, keyPlies,
  positionARevoir, alertePgn, ficheJouee, analyseTemps, bilanTempsParties, horlogesPgn, lireCadence, phaseTxt, outcomeTxt,
  momentsCles, positionMoment, evalTxt, avantageTxt, avantage,
} from './games-core.js';
import { langue } from './i18n.js';
import { connecter as connecterLichess, deconnecter as deconnecterLichess } from './lichess-auth.js';
import { chargerClassements, noterClassements, KEY as KEY_CLASSEMENTS } from './progression-core.js';
import { jour, charger as chargerRoutine, enregistrer as enregistrerRoutine, noter as noterRoutine } from './routine-core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fr = (san) => esc(sanFr(san));
const L = (fr, en) => (langue() === 'en' ? en : fr);
// Nombre décimal produit par le code : virgule en français, point en anglais.
const dec = (x) => (langue() === 'en' ? x : x.replace('.', ','));
// Nom affiché du site d'origine (les valeurs françaises restent les valeurs internes).
const siteTxt = (site) => L(site, { 'PGN collé': 'Pasted PGN', 'Échiquier': 'Board' }[site] || site);
const PREFS = 'coach-echecs:mes-parties';
const CACHE = 'coach-echecs:analyses-v1';
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

function load(k, d) { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return { ...d }; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage plein */ } }

export class GamesPage {
  constructor({ el, engine, client, getToken, setToken = () => {}, authMessage = '', openGame, openLine = null }) {
    this.setToken = setToken;
    this.authMsg = authMessage; // résultat de « Se connecter avec Lichess », affiché dans le bandeau
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
      try { this.data = localiserData(await (await fetch('./data/repertoire.json', { cache: 'no-cache' })).json()); } catch { this.data = { entries: [] }; }
    }
    if (this.pendingLocal) {
      // Bilan demandé depuis la page Moteur : la partie passe en tête de liste et s'analyse.
      const g = this.pendingLocal;
      this.pendingLocal = null;
      g.deviation = repertoireDeviation(g, this.data.entries, choisis());
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
      // Variante jouée et résultat (bilan par variante dans Entraînement > Apprendre).
      const couleurs = Object.fromEntries(Object.entries(this.data?.repertoires || {}).map(([id, r]) => [id, r.couleur]));
      // Sortie de fiche : la variante est celle que la fiche attendait ; sinon la plus suivie.
      const fj = d?.who === 'moi' && d.fiche ? { ficheId: d.fiche.id, rep: d.rep } : ficheJouee(g, this.data?.entries || [], choisis(), couleurs);
      if (fj) {
        recordPartie(p, {
          gameId: g.id, ficheId: fj.ficheId, rep: fj.rep, outcome: g.outcome, date: g.date, sortie: d?.who === 'moi', punition: d?.who === 'adversaire-erreur' && !d.punished,
          san: g.san, color: g.color, opp: g.color === 'w' ? g.black : g.white, url: g.url, ecart: d?.who === 'moi' ? d.ply : (fj.ply ?? null),
        });
      }
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
    const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&moves=true&opening=true&finished=true&clocks=true`;
    const headers = { accept: 'application/x-ndjson' };
    const tok = this.getToken();
    if (tok) headers.authorization = 'Bearer ' + tok;
    const r = await this.client.queue.run(url, { headers });
    const res = r.res;
    if (res.status === 404) throw new Error(tok ? L('compte introuvable ou export refusé par Lichess', 'account not found or export refused by Lichess') : L('Lichess demande une connexion : appuie sur « Se connecter avec Lichess » ci-dessus', 'Lichess requires a login: tap “Log in with Lichess” above'));
    if (res.status === 401) throw new Error(L('jeton Lichess refusé', 'Lichess token rejected'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text.split('\n').filter(Boolean).map((l) => { try { return parseLichessGame(JSON.parse(l), user); } catch { return null; } }).filter(Boolean);
  }

  async fetchChessCom(user, max) {
    const base = `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games`;
    let r;
    try { r = await fetch(`${base}/archives`); } catch { throw new Error(L('Chess.com injoignable (réseau)', 'Chess.com unreachable (network)')); }
    if (r.status === 404) throw new Error(L('compte Chess.com introuvable', 'Chess.com account not found'));
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
    if (!tasks.length) { this.status.general = L('Indiquez au moins un pseudo.', 'Enter at least one username.'); this.render(); return; }
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
    for (const g of this.games) g.deviation = repertoireDeviation(g, this.data.entries, choisis());
    // « Nouveau » : parties terminées depuis le dernier chargement.
    const last = this.prefs.lastSeen || '';
    for (const g of this.games) g.isNew = !!last && g.date > last;
    if (this.games.length) { this.prefs.lastSeen = this.games[0].date; save(PREFS, this.prefs); }
    this.noteSorties(this.games);
    this.noteRoutine(this.games);
    // Classement de chaque partie importée : courbe Chess.com de « Ma progression ».
    save(KEY_CLASSEMENTS, noterClassements(chargerClassements(), this.games));
    this.render();
  }

  // Suivi du soir de la routine : « Blitz perdus au temps » aujourd'hui, rempli s'il est vide.
  noteRoutine(games) {
    const today = jour();
    const blitz = games.filter((g) => g.speed === 'Blitz' && jour(new Date(g.date)) === today);
    if (!blitz.length) return;
    const d = chargerRoutine();
    if (d.jours[today]?.temps != null) return;
    enregistrerRoutine(noterRoutine(d, today, 'temps', blitz.filter((g) => g.finTemps === 'moi').length));
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
          game.error = L(`Moteur indisponible : ${e.message}`, `Engine unavailable: ${e.message}`);
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
      if (s.state === 'loading') return `<li><span class="spinner"></span> ${site}${L(' : chargement…', ': loading…')}</li>`;
      if (s.state === 'error') return `<li class="error-text">${site}${L(' : ', ': ')}${esc(s.error)}</li>`;
      return `<li>${L(`${site} : ${s.n} partie(s) importée(s)`, `${site}: ${s.n} game(s) imported`)}</li>`;
    };
    this.el.innerHTML = `
      <div class="card games-form">
        <h2>${L('Mes parties', 'My games')}</h2>
        ${this.lichessHtml()}
        <div class="games-inputs">
          <label>${L('Pseudo Lichess', 'Lichess username')} <input type="text" data-p="lichess" value="${esc(p.lichess)}" autocapitalize="off" spellcheck="false" placeholder="${L('ex. MonPseudo', 'e.g. MyUsername')}"></label>
          <label>${L('Pseudo Chess.com', 'Chess.com username')} <input type="text" data-p="chesscom" value="${esc(p.chesscom)}" autocapitalize="off" spellcheck="false" placeholder="${L('ex. MonPseudo', 'e.g. MyUsername')}"></label>
          <label>${L('Parties par site', 'Games per site')} <select data-p="max">${[10, 20, 40].map((n) => `<option ${Number(p.max) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>${L('Cadence', 'Time control')} <select data-p="speed">${[['blitz', 'Blitz'], ['rapide', L('Rapide', 'Rapid')], ['bullet', 'Bullet'], ['toutes', L('Toutes', 'All')]].map(([v, l]) => `<option value="${v}" ${p.speed === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>${L('Analyse', 'Analysis')} <select data-p="precision"><option value="300" ${Number(p.precision) === 300 ? 'selected' : ''}>${L('Rapide (0,3 s par position)', 'Fast (0.3 s per position)')}</option><option value="800" ${Number(p.precision) === 800 ? 'selected' : ''}>${L('Précise (0,8 s par position)', 'Accurate (0.8 s per position)')}</option></select></label>
        </div>
        <div class="actions"><button type="button" class="primary" data-import>${L('Charger mes parties', 'Load my games')}</button></div>
        <p class="small"><a href="#/progression">${L('📈 Voir ma progression', '📈 See my progress')}</a> ${L('(classements, routine, entraînement)', '(ratings, routine, training)')}</p>
        <ul class="games-status">${st('Lichess')}${st('Chess.com')}${this.status.general ? `<li class="error-text">${esc(this.status.general)}</li>` : ''}</ul>
        <p class="muted small">${L('Lichess : tes parties sont chargées grâce à la connexion (ou au jeton de ⚙). Chess.com : API publique, sans compte. Rien n’est envoyé ailleurs ; l’analyse est faite par Stockfish sur votre appareil.', 'Lichess: your games are loaded through the login (or the ⚙ token). Chess.com: public API, no account needed. Nothing is sent anywhere else; the analysis is done by Stockfish on your device.')}</p>
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
          <button type="button" data-open="${esc(a.id)}">${L('Ouvrir la partie sur l’échiquier', 'Open the game on the board')}</button>
          <button type="button" data-analyse="${esc(a.id)}">${L('Analyser avec Stockfish', 'Analyse with Stockfish')}</button></div>
      </div>` : '';
    return `<details class="card pgn-paste" ${this.pgnOpen ? 'open' : ''}>
        <summary><strong>${L('📋 Coller une partie PGN', '📋 Paste a PGN game')}</strong> <span class="muted small">(Lichess, Chess.com…)</span></summary>
        <textarea data-pgn rows="5" spellcheck="false" placeholder="[White &quot;…&quot;] [Black &quot;…&quot;]&#10;1. d4 d5 2. c4 …" aria-label="${L('Partie au format PGN', 'Game in PGN format')}"></textarea>
        <label class="row">${L('Je jouais', 'I was playing')} <select data-pgn-color><option value="auto">${L('Détecter (mes pseudos)', 'Detect (my usernames)')}</option><option value="w">${L('les Blancs', 'White')}</option><option value="b">${L('les Noirs', 'Black')}</option></select></label>
        <div class="actions"><button type="button" class="primary" data-pgn-go>${L('Comparer avec mon répertoire', 'Compare with my repertoire')}</button></div>
        <p class="error-text small" data-pgn-err></p>
      </details>${alert}`;
  }

  pastePgn() {
    const errEl = this.el.querySelector('[data-pgn-err]');
    const raw = this.el.querySelector('[data-pgn]').value;
    let c;
    try { c = loadPgnTolerant(raw); } catch (e) { errEl.textContent = L(`PGN illisible : ${e.message}`, `Unreadable PGN: ${e.message}`); return; }
    const san = c.history();
    if (!san.length) { errEl.textContent = L('Aucun coup trouvé dans ce PGN.', 'No moves found in this PGN.'); return; }
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
    // Pendules du PGN ([%clk …]) et fin au temps (« Time forfeit », « won on time »).
    const clocks = horlogesPgn(raw);
    const tc = lireCadence(h.TimeControl);
    if (tc && clocks.length === san.length) { g.clocks = clocks; g.tc = tc; }
    if (/time/i.test(h.Termination || '') && ['1-0', '0-1'].includes(h.Result)) g.finTemps = (h.Result === '1-0' ? 'b' : 'w') === color ? 'moi' : 'adversaire';
    g.deviation = repertoireDeviation(g, this.data?.entries || [], choisis());
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
    const fmt = (s) => (s.n ? L(`${s.n} partie(s) : ${s.w} V · ${s.d} N · ${s.l} D`, `${s.n} game(s): ${s.w} W · ${s.d} D · ${s.l} L`) : L('aucune', 'none'));
    const all = by(() => true);
    // Par répertoire choisi ; une réponse des Noirs hors répertoire dès le 1er coup compte à part.
    const dansRep = (g, id) => g.deviation?.rep === id && !(g.color === 'b' && g.deviation.who === 'moi' && g.deviation.ply === 1);
    const ids = choisis();
    const parRep = ids.map((id) => ({ id, s: by((g) => dansRep(g, id)) }));
    const horsBlancs = by((g) => g.color === 'w' && !ids.some((id) => dansRep(g, id)));
    const horsNoirs = by((g) => g.color === 'b' && !ids.some((id) => dansRep(g, id)));
    const camp = (id) => (REPERTOIRES[id]?.couleur === 'w' ? L('Blancs', 'White') : L('Noirs', 'Black'));
    const devs = {};
    for (const g of list) {
      const d = g.deviation;
      if (d?.who === 'moi' && d.expected) {
        const k = L(`${moveNo(d.ply)} ${sanFr(d.played)} au lieu de ${d.expected.map(sanFr).join(' ou ')}`, `${moveNo(d.ply)} ${sanFr(d.played)} instead of ${d.expected.map(sanFr).join(' or ')}`);
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
      agg = L(`<p><strong>Sur ${analysed.length} partie(s) analysée(s)</strong> : ${gaffes} gaffe(s), ${erreurs} erreur(s)${n ? `, perte moyenne ${(tot / n / 100).toFixed(2).replace('.', ',')} pion/coup` : ''}${ph ? ` ; phase la plus fragile : ${ph[0]}` : ''}.</p>`, `<p><strong>Over ${analysed.length} analysed game(s)</strong>: ${gaffes} blunder(s), ${erreurs} mistake(s)${n ? `, average loss ${(tot / n / 100).toFixed(2)} pawn/move` : ''}${ph ? `; weakest phase: ${phaseTxt(ph[0])}` : ''}.</p>`);
    }
    return `<div class="card games-summary">
      <h2>${L('Vue d’ensemble', 'Overview')} (${esc(this.prefs.speed === 'toutes' ? L('toutes cadences', 'all time controls') : L(this.prefs.speed, { blitz: 'blitz', rapide: 'rapid', bullet: 'bullet' }[this.prefs.speed] || this.prefs.speed))})</h2>
      <p>${L('Total : ', 'Total: ')}${fmt(all)}</p>
      <ul>
        ${parRep.map(({ id, s: st }) => `<li>${camp(id)}, ${esc(REPERTOIRES[id].titre)}${L(' : ', ': ')}${fmt(st)}</li>`).join('')}
        ${horsBlancs.n ? `<li>${L('Blancs, hors de vos répertoires : ', 'White, outside your repertoires: ')}${fmt(horsBlancs)}</li>` : ''}
        ${horsNoirs.n ? `<li>${L('Noirs, hors de vos répertoires : ', 'Black, outside your repertoires: ')}${fmt(horsNoirs)}</li>` : ''}
      </ul>
      ${topDev.length ? `<p><strong>${L('Vos sorties de répertoire les plus fréquentes :', 'Your most frequent repertoire deviations:')}</strong></p><ul>${topDev.map(([k, n]) => `<li>${esc(k)} ${L(`(${n} fois)`, `(${n} time${n > 1 ? 's' : ''})`)}</li>`).join('')}</ul>` : ''}
      ${agg}
    </div>`;
  }

  deviationText(g) {
    const d = g.deviation;
    if (!d || !d.rep) return `<span class="muted">${L('Hors répertoire', 'Outside repertoire')}</span>`;
    if (d.who === 'moi') return `<span class="ko">${L(`Sortie du répertoire : ${moveNo(d.ply)} ${fr(d.played)} (fiche : ${d.expected.map(fr).join(' ou ')})`, `Left the repertoire: ${moveNo(d.ply)} ${fr(d.played)} (line: ${d.expected.map(fr).join(' or ')})`)}</span>`;
    if (d.who === 'adversaire-erreur') return d.punished ? `<span class="ok">${L(`Erreur adverse ${moveNo(d.ply)} ${fr(d.played)} punie ✔`, `Opponent’s mistake ${moveNo(d.ply)} ${fr(d.played)} punished ✔`)}</span>` : `<span class="ko">${L(`Erreur adverse ${moveNo(d.ply)} ${fr(d.played)} non punie (${fr(d.expected[0])})`, `Opponent’s mistake ${moveNo(d.ply)} ${fr(d.played)} not punished (${fr(d.expected[0])})`)}</span>`;
    if (d.who === 'adversaire') return `<span class="muted">${L(`L’adversaire sort des fiches : ${moveNo(d.ply)} ${fr(d.played)}`, `Your opponent leaves your lines: ${moveNo(d.ply)} ${fr(d.played)}`)}</span>`;
    return `<span class="ok">${L('Répertoire suivi jusqu’au bout des fiches ✔', 'Repertoire followed to the end of your lines ✔')}</span>`;
  }

  // Résumé du temps sur les parties affichées : défaites au temps, temps moyen par coup et par phase.
  tempsResumeHtml(list) {
    const b = bilanTempsParties(list.filter((g) => !g.local));
    if (!b.avecPendule && !b.perduesTemps) return '';
    const sec = (x) => `${dec(x.toFixed(1))} s`;
    return `<div class="card temps-resume" data-temps-resume><h3>${L(`⏱ Mon temps sur ces ${b.parties} parties`, `⏱ My time over these ${b.parties} games`)}</h3>
      <p><strong>${b.perduesTemps}</strong> ${L('perdue(s) au temps', 'lost on time')}${b.gagneesTemps ? L(` · ${b.gagneesTemps} gagnée(s) au temps`, ` · ${b.gagneesTemps} won on time`) : ''}.</p>
      ${b.phases.length ? `<p class="small">${L('Temps moyen par coup : ', 'Average time per move: ')}${b.phases.map((p) => `${esc(phaseTxt(p.phase))} <strong>${sec(p.moy)}</strong>`).join(' · ')}</p>` : ''}
      <p class="muted tiny">${L('Calculé avec les pendules enregistrées par ', 'Calculated from the clocks recorded by ')}${esc([...new Set(list.filter((g) => g.clocks).map((g) => g.site))].join(L(' et ', ' and ')) || 'Lichess / Chess.com')}${L('. Ouvre une partie pour voir où ton temps est parti.', '. Open a game to see where your time went.')}</p></div>`;
  }

  // Analyse du temps d'une partie (section du bilan).
  tempsHtml(g, plies) {
    const a = analyseTemps(g, plies);
    if (!a) return g.finTemps === 'moi' ? `<section class="card temps"><h3>${L('⏱ Mon temps', '⏱ My time')}</h3><p>${L('⌛ Partie perdue au temps (pendules non disponibles pour le détail).', '⌛ Game lost on time (clocks not available for details).')}</p></section>` : '';
    const sec = (x) => `${dec(x.toFixed(1))} s`;
    const max = Math.max(...a.phases.map((p) => p.moy), 1);
    const verdict = a.perduAvecAvantage
      ? L(`⌛ <strong>Perdue au temps alors que tu étais mieux</strong> (${esc(formatScore({ type: 'cp', value: a.avantage }))} selon Stockfish à la fin). Le problème n'était pas l'échiquier mais la pendule.`, `⌛ <strong>Lost on time while you were better</strong> (${esc(formatScore({ type: 'cp', value: a.avantage }))} according to Stockfish at the end). The problem wasn’t the board but the clock.`)
      : a.finTemps === 'moi' ? L('⌛ <strong>Partie perdue au temps.</strong>', '⌛ <strong>Game lost on time.</strong>') : a.finTemps === 'adversaire' ? L('Ton adversaire a perdu au temps.', 'Your opponent lost on time.') : '';
    return `<section class="card temps" data-temps><h3>${L('⏱ Mon temps', '⏱ My time')}</h3>
      ${verdict ? `<p>${verdict}</p>` : ''}
      <p class="small">${L('Cadence', 'Time control')} ${g.tc.initial >= 60 ? `${Math.round(g.tc.initial / 60)}` : `${g.tc.initial} s `}+${g.tc.increment} · ${L('temps moyen par coup', 'average time per move')} <strong>${sec(a.moy)}</strong> · ${L('il te restait', 'you had')} <strong>${sec(a.resteFin)}</strong> ${L('après ton dernier coup.', 'left after your last move.')}</p>
      <div class="temps-phases">${a.phases.map((p) => `<div class="temps-ph"><span class="small">${esc(phaseTxt(p.phase))}</span><span class="temps-bar"><span style="width:${Math.round((100 * p.moy) / max)}%"></span></span><span class="small"><strong>${sec(p.moy)}</strong> ${L('/ coup', '/ move')} (${p.n})</span></div>`).join('')}</div>
      <h4>${L('Mes plus longues réflexions', 'My longest thinks')}</h4>
      ${a.longs.length ? `<ul>${a.longs.map((m) => `<li><button type="button" class="small-btn" data-temps-ply="${m.i}" data-temps-s="${m.s}" data-temps-reste="${m.reste}">${L('♟ Voir', '♟ See')} ${moveNo(m.i)} ${fr(m.san)}</button> <strong>${sec(m.s)}</strong>${m.facile ? L(' — <span class="warn-text">coup simple</span> : la position n’a presque pas changé (perte &lt; 0,5 pion). Ce temps aurait servi plus tard.', ' — <span class="warn-text">simple move</span>: the position barely changed (loss &lt; 0.5 pawn). That time would have been useful later.') : m.loss != null && m.loss >= 120 ? L(' — et le coup était une erreur malgré la réflexion.', ' — and the move was a mistake despite the thinking.') : ''}</li>`).join('')}</ul>` : `<p class="small">${L(`Aucune réflexion de plus de ${sec(a.seuil)} : bon rythme.`, `No think longer than ${sec(a.seuil)}: good pace.`)}</p>`}
      <p class="muted tiny">${L('Temps tiré des pendules de la partie ; « coup simple » d\'après l\'analyse Stockfish de la partie.', 'Times taken from the game’s clocks; “simple move” according to the Stockfish analysis of the game.')}</p>
    </section>`;
  }

  listHtml() {
    const list = this.filtered();
    if (!this.games.length) return '';
    if (!list.length) return `<p class="muted pad">${L('Aucune partie pour cette cadence.', 'No games for this time control.')}</p>`;
    const aCorriger = new Set(vraiesErreurs(loadProgress()).map((x) => x.gameId));
    return `${this.tempsResumeHtml(list)}<div class="games-list">${list.map((g) => {
      const opp = g.color === 'w' ? `${g.black} (${g.blackElo ?? '?'})` : `${g.white} (${g.whiteElo ?? '?'})`;
      const done = this.cache[g.id];
      return `<article class="card game-card ${g.id === this.selected ? 'selected' : ''}">
        <div class="game-top">${g.isNew ? `<span class="badge ok">${L('Nouveau', 'New')}</span> ` : ''}<span class="badge">${esc(siteTxt(g.site))}</span> <span class="badge">${esc(L(g.speed, { Rapide: 'Rapid', Classique: 'Classical', Correspondance: 'Correspondence' }[g.speed] || g.speed))}</span>
          <span class="res ${g.outcome === 'victoire' ? 'ok' : g.outcome === 'défaite' ? 'ko' : ''}">${esc(outcomeTxt(g.outcome))}</span>${g.finTemps === 'moi' ? L(' <span class="badge err" title="Partie perdue au temps">⌛ au temps</span>', ' <span class="badge err" title="Game lost on time">⌛ on time</span>') : g.finTemps === 'adversaire' ? L(' <span class="badge" title="L’adversaire a perdu au temps">⌛ gagnée au temps</span>', ' <span class="badge" title="The opponent lost on time">⌛ won on time</span>') : ''}
          <span class="muted small">${new Date(g.date).toLocaleDateString(L('fr-FR', 'en-GB'))}</span></div>
        <p><span class="dot ${g.color}"></span> ${L(`${g.color === 'w' ? 'Blancs' : 'Noirs'} contre <strong>${esc(opp)}</strong> · ${Math.ceil(g.san.length / 2)} coups`, `${g.color === 'w' ? 'White' : 'Black'} against <strong>${esc(opp)}</strong> · ${Math.ceil(g.san.length / 2)} moves`)}</p>
        <p class="small muted">${esc(g.opening)}</p>
        <p class="small">${this.deviationText(g)}</p>
        <div class="actions">
          ${aCorriger.has(g.id) ? `<button type="button" class="primary" data-travailler="${esc(g.id)}">${L('🎯 Travailler mon erreur', '🎯 Work on my mistake')}</button>` : ''}
          <button type="button" class="${done || aCorriger.has(g.id) ? '' : 'primary'}" data-analyse="${esc(g.id)}">${done ? L('Voir l’analyse', 'See the analysis') : L('Analyser', 'Analyse')}</button>
          <button type="button" data-open="${esc(g.id)}">${L('Ouvrir sur l’échiquier', 'Open on the board')}</button>
          ${/^https:\/\//.test(g.url || "") ? `<a class="btn-link" href="${esc(g.url)}" target="_blank" rel="noopener">${L('Sur', 'On')} ${esc(g.site)}</a>` : ''}
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
    const head = `<h2>${L(`Analyse : ${g.color === 'w' ? 'Blancs' : 'Noirs'} contre ${esc(g.color === 'w' ? g.black : g.white)}`, `Analysis: ${g.color === 'w' ? 'White' : 'Black'} against ${esc(g.color === 'w' ? g.black : g.white)}`)} <span class="muted small">(${esc(siteTxt(g.site))}, ${esc(outcomeTxt(g.outcome))})</span></h2>`;
    if (!cached) {
      const pc = Math.round((g.progress || 0) * 100);
      box.innerHTML = `<div class="card">${head}
        ${g.error ? `<p class="errbox">${esc(g.error)}</p>` : g.paused
          ? `<p>${L('Analyse interrompue (le moteur a servi ailleurs).', 'Analysis paused (the engine was used elsewhere).')} <button type="button" data-resume>${L('Reprendre', 'Resume')}</button></p>`
          : `<p class="state"><span class="spinner"></span> ${L(`Stockfish analyse la partie : ${pc} %`, `Stockfish is analysing the game: ${pc}%`)}</p><div class="progress"><span style="width:${pc}%"></span></div>`}
        <p class="small">${this.deviationText(g)}</p></div>`;
      box.querySelector('[data-resume]')?.addEventListener('click', () => this.analyse(g));
      return;
    }
    const plies = analyseGame(g, cached.evals);
    const b = bilan(g, plies, g.deviation);
    const line = (p) => `${moveNo(p.i)} ${fr(p.san)}`;
    const ouv = resumeOuverture([...plies.map((p) => p.fenBefore), plies.at(-1)?.fenAfter].filter(Boolean), plies.map((p) => p.san));
    box.innerHTML = `<div class="card analysis-card">${head}
      <div class="ouverture-bilan" data-ouverture>${resumeOuvertureHtml(ouv)}</div>
      <p class="small">${this.deviationText(g)}</p>
      ${this.graphHtml(cached.evals, g.color)}
      <div class="analysis-grid">
        <div><div class="board-wrap" data-review-board></div><p class="small muted" data-review-caption>${L('Touchez un coup pour voir la position (flèche verte : meilleur coup, rouge : coup joué).', 'Tap a move to see the position (green arrow: best move, red: move played).')}</p></div>
        <div>
          <h3>${L('Bilan', 'Summary')}</h3>
          <p class="small">${L(`${b.counts.gaffe} gaffe(s) · ${b.counts.erreur} erreur(s) · ${b.counts.imprecision} imprécision(s)${b.avg != null ? ` · perte moyenne ${(b.avg / 100).toFixed(2).replace('.', ',')} pion/coup` : ''}`, `${b.counts.gaffe} blunder(s) · ${b.counts.erreur} mistake(s) · ${b.counts.imprecision} inaccurac(y/ies)${b.avg != null ? ` · average loss ${(b.avg / 100).toFixed(2)} pawn/move` : ''}`)}</p>
          <h3>${L('Moments clés : qui prend l’avantage', 'Key moments: who takes the advantage')}</h3>
          ${this.momentsHtml(g, plies)}
          <h3>${L('Vos erreurs principales', 'Your main mistakes')}</h3>
          ${b.errors.length ? `<ul>${b.errors.map((p) => `<li><button type="button" class="link-btn" data-ply="${p.i}">${line(p)}</button> — ${esc(p.cls.label)}${L(' ; le moteur préférait ', '; the engine preferred ')}<strong>${fr(p.bestSan)}</strong> (${L('perte', 'loss')} ≈ ${dec((Math.min(p.loss, 1000) / 100).toFixed(1))})</li>`).join('')}</ul>` : `<p class="small muted">${L('Aucune erreur détectée à ce niveau d’analyse.', 'No mistake detected at this analysis depth.')}</p>`}
          <h3>${L('Trois pistes de travail', 'Three things to work on')}</h3>
          <ol>${b.pistes.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ol>
          <p class="muted tiny">${L(`Pistes déduites des calculs de Stockfish (${this.prefs.precision} ms par position) et des règles, sans IA.`, `Suggestions derived from Stockfish calculations (${this.prefs.precision} ms per position) and the rules, without AI.`)}</p>
        </div>
      </div>
      ${this.tempsHtml(g, plies)}
      ${this.reportHtml(g, plies, b, cached)}
      <h3>${L('Coups', 'Moves')}</h3>
      <p class="moves-annot">${plies.map((p) => `<button type="button" class="m ${p.mover === g.color ? 'mine' : ''} ${p.cls ? 'c-' + p.cls.id : ''}" data-ply="${p.i}">${p.i % 2 === 0 ? `${p.i / 2 + 1}.` : ''}${fr(p.san)}${p.cls && p.mover === g.color ? p.cls.mark : ''}</button>`).join(' ')}</p>
    </div>`;
    const bel = box.querySelector('[data-review-board]');
    this.reviewBoard = new Board(bel, { piecesUrl: './pieces/' });
    this.reviewBoard.setOrientation(g.color);
    this.showPly(g, plies, b.errors[0]?.i ?? 0);
    box.querySelectorAll('[data-ply]').forEach((el) => el.addEventListener('click', () => this.showPly(g, plies, Number(el.dataset.ply))));
    box.querySelectorAll('[data-rejouer]').forEach((el) => el.addEventListener('click', () => this.rejouerMoment(g, plies, Number(el.dataset.rejouer))));
    // Plus longues réflexions : la position au moment où j'ai réfléchi, échiquier ramené à l'écran.
    box.querySelectorAll('[data-temps-ply]').forEach((el) => el.addEventListener('click', () => {
      this.showPly(g, plies, Number(el.dataset.tempsPly), { temps: { s: Number(el.dataset.tempsS), reste: Number(el.dataset.tempsReste) } });
      box.querySelector('[data-review-board]').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    box.querySelectorAll('[data-exo]').forEach((el) => el.addEventListener('click', () => {
      this.showPly(g, plies, Number(el.dataset.exo), { exo: true });
      box.querySelector('[data-review-board]').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    if (!ouv) chargerOuvertures().then(() => { const el = box.querySelector('[data-ouverture]'); if (el) el.innerHTML = resumeOuvertureHtml(resumeOuverture([...plies.map((p) => p.fenBefore), plies.at(-1)?.fenAfter].filter(Boolean), plies.map((p) => p.san))); });
    box.querySelector('[data-ouverture]')?.addEventListener('click', (ev) => {
      const f = ev.target.closest('[data-ouv-fiche]');
      if (f) window.dispatchEvent(new CustomEvent('ouvrir-fiche', { detail: f.dataset.ouvFiche }));
      const t = ev.target.closest('[data-ouv-entrainer]');
      if (t) demanderEntrainement({ type: 'fiche', id: t.dataset.ouvEntrainer });
    });
    if (!cached.deep) this.deepen(g);
  }

  // Moments clés (occasion manquée / avantage donné / cadeau adverse), avec qui a l'avantage et son ampleur.
  momentsHtml(g, plies) {
    const ms = momentsCles(g, plies);
    if (!ms.length) return `<p class="small muted">${L('Aucun basculement majeur : l’avantage n’a pas changé de camp sur une erreur.', 'No major swing: the advantage never changed sides on a mistake.')}</p>`;
    const VOUS_AVIEZ = { leger: L('un léger avantage', 'a slight edge'), net: L('un net avantage', 'a clear advantage'), decisif: L('un avantage décisif', 'a decisive advantage') };
    const TYPE = {
      donne: L('⚠ Avantage donné', '⚠ Advantage given away'),
      occasion: L('💡 Occasion manquée', '💡 Missed opportunity'),
      cadeau: L('🎁 Erreur de l’adversaire', '🎁 Opponent’s mistake'),
    };
    return `<ul class="moments">${ms.map((m) => {
      const coup = `<button type="button" class="link-btn" data-ply="${m.i}">${moveNo(m.i)} ${fr(m.san)}</button>`;
      const chiffres = `<span class="muted">(${esc(evalTxt(m.avant))} → ${esc(evalTxt(m.apres))})</span>`;
      let detail;
      if (m.type === 'cadeau') {
        detail = L(`${avantageTxt(m.apres)} ${chiffres}. `, `${avantageTxt(m.apres)} ${chiffres}. `)
          + (m.saisi === true ? L('Vous en avez profité ✔', 'You took advantage of it ✔') : m.saisi === false ? L(`Vous ne l’avez pas exploitée : ${moveNo(m.i + 1)} ${fr(m.suite)} rendait une partie de l’avantage.`, `You did not exploit it: ${moveNo(m.i + 1)} ${fr(m.suite)} gave part of it back.`) : '');
      } else {
        const ctx = m.apresCadeau ? L(' juste après une erreur adverse', ' right after an opponent’s mistake') : '';
        detail = (m.type === 'donne'
          ? L(`Après votre coup${ctx}, ${avantageTxt(m.apres)} ${chiffres}.`, `After your move${ctx}, ${avantageTxt(m.apres)} ${chiffres}.`)
          : L(`Vous aviez ${VOUS_AVIEZ[avantage(m.avant)?.ampleur] || 'l’avantage'}${ctx} ; après votre coup : ${avantageTxt(m.apres)} ${chiffres}.`, `You had ${VOUS_AVIEZ[avantage(m.avant)?.ampleur] || 'the advantage'}${ctx}; after your move: ${avantageTxt(m.apres)} ${chiffres}.`))
          + (m.explication ? ` ${esc(m.explication)}` : '')
          + (positionMoment(g, plies, m) ? ` <button type="button" class="small-btn" data-rejouer="${m.i}">${L('🎯 Rejouer ce moment', '🎯 Replay this moment')}</button>` : '');
      }
      return `<li class="moment-${m.type}"><strong>${TYPE[m.type]}</strong> · ${coup} (${m.mover === g.color ? L('vous', 'you') : L('adversaire', 'opponent')})<br>${detail}</li>`;
    }).join('')}</ul>`;
  }

  // « Rejouer ce moment » : la position part dans « Positions de mes parties » (Entraînement).
  rejouerMoment(g, plies, i) {
    if (!isPro()) { openPaywall({ reason: L('« Positions de mes parties »', '“Positions from my games”') }); return; }
    const m = momentsCles(g, plies, 99).find((x) => x.i === i);
    const pos = m && positionMoment(g, plies, m);
    if (!pos) return;
    const p = loadProgress();
    recordMoment(p, { gameId: g.id, ply: i, date: g.date, pos, opp: g.color === 'w' ? g.black : g.white, url: g.url });
    saveProgress(p);
    demanderEntrainement({ type: 'reelle', gameId: `${g.id}#${i}` });
  }

  reportHtml(g, plies, b, cached) {
    const r = rapport(g, plies, b, g.deviation, cached.deep || {});
    const at = (i, label) => `<button type="button" class="link-btn" data-ply="${i}">${label}</button>`;
    const pending = !cached.deep ? `<p class="state small"><span class="spinner"></span> ${L('Stockfish approfondit vos erreurs (variantes « ce qui aurait pu se passer »)…', 'Stockfish is looking deeper into your mistakes (“what could have happened” lines)…')}</p>` : '';
    return `<section class="card report" data-report>
      <h3>${L('📝 Rapport détaillé', '📝 Detailed report')}</h3>
      <p class="report-note ${r.note.ton ? 'note-' + r.note.ton : ''}"><strong>${esc(r.note.titre)}.</strong> ${esc(r.synthese)}</p>
      <h4>${L('Déroulement', 'How the game went')}</h4>
      <ul>${r.phases.map((x) => `<li><strong>${esc(phaseTxt(x.phase)[0].toUpperCase() + phaseTxt(x.phase).slice(1))}</strong>${L(' : ', ': ')}${esc(x.avis)}${x.coups ? ` <span class="muted">(${L(`${x.coups} coups${x.loss != null ? `, perte moyenne ${(x.loss / 100).toFixed(2).replace('.', ',')}` : ''}`, `${x.coups} moves${x.loss != null ? `, average loss ${(x.loss / 100).toFixed(2)}` : ''}`)})</span>` : ''}</li>`).join('')}</ul>
      <h4>${L('✔ Vos bons coups', '✔ Your good moves')}</h4>
      ${r.bons.length ? `<ul>${r.bons.map((x) => `<li>${at(x.i, '▸')} ${esc(x.text)}</li>`).join('')}</ul>` : `<p class="small muted">${L('Pas de coup marquant détecté (aucune erreur adverse à sanctionner, ou pas de longue série sans faute).', 'No standout move detected (no opponent mistake to punish, or no long streak without errors).')}</p>`}
      <h4>${L('✘ Vos erreurs, expliquées', '✘ Your mistakes, explained')}</h4>
      ${pending}
      ${r.erreurs.length ? r.erreurs.map((e) => `<div class="report-err">
        <p><strong>${at(e.i, esc(e.coup))}</strong> — ${esc(e.cls.label)} (${esc(phaseTxt(e.phase))}). ${L('Évaluation pour vous : ', 'Evaluation for you: ')}${esc(e.avant)} → <strong>${esc(e.apres)}</strong> (${L(`perte ≈ ${esc(e.perte)} pion${e.perte === '1,0' ? '' : 's'}`, `loss ≈ ${esc(e.perte)} pawn${e.perte === '1.0' ? '' : 's'}`)}).</p>
        ${e.pourquoi.length ? `<p><strong>${L('Pourquoi :', 'Why:')}</strong> ${esc(e.pourquoi.join(L(' ; ', '; ')))}.</p>` : ''}
        ${e.refutation ? `<p><strong>${L('Ce qui pouvait suivre :', 'What could follow:')}</strong> <span class="line">${esc(e.refutation)}</span>${e.refutationEval ? ` → ${esc(e.refutationEval)}${L(' pour vous', ' for you')}` : ''}.</p>` : ''}
        <p><strong>${L('Le meilleur coup :', 'The best move:')}</strong> ${esc(e.meilleurCoup)}${e.meilleureLigne ? `${L(', par exemple ', ', for example ')}<span class="line">${esc(e.meilleureLigne)}</span>` : ''} → ${esc(e.meilleureEval)}${L(' pour vous', ' for you')}${e.gains.length ? ` (${esc(e.gains.join(', '))})` : ''}.</p>
      </div>`).join('') : `<p class="small muted">${L('Aucune erreur détectée à ce niveau d’analyse. 👏', 'No mistake detected at this analysis depth. 👏')}</p>`}
      ${r.occasions.length ? `<h4>${L('💡 Occasions manquées', '💡 Missed opportunities')}</h4><ul>${r.occasions.map((x) => `<li>${at(x.i, '▸')} ${esc(x.text)}</li>`).join('')}</ul>` : ''}
      <h4>${L('🧠 À retenir pour la prochaine partie', '🧠 Remember for your next game')}</h4>
      <ul>${r.aRetenir.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${r.exercices.length ? `<h4>${L('🎯 Exercices sur vos positions', '🎯 Exercises from your positions')}</h4><ul>${r.exercices.map((x) => `<li><button type="button" class="link-btn" data-exo="${x.i}">${esc(x.text)}</button></li>`).join('')}</ul>` : ''}
      <p class="muted tiny">${L('Rapport rédigé automatiquement à partir des calculs de Stockfish (évaluations et variantes) et des règles du jeu (chess.js), sans IA. Les variantes sont des calculs du moteur, pas des certitudes sur ce qu’aurait joué votre adversaire.', 'Report written automatically from Stockfish calculations (evaluations and lines) and the rules of the game (chess.js), without AI. The lines are engine calculations, not certainties about what your opponent would have played.')}</p>
    </section>`;
  }

  showPly(g, plies, i, { exo = false, temps = null } = {}) {
    const p = plies[i];
    if (!p || !p.fenBefore) return;
    if (exo) {
      // Exercice : position seule, sans flèche ni solution.
      this.reviewBoard.setPosition(new Chess(p.fenBefore), { lastMove: null });
      this.reviewBoard.setArrows([]);
      const cap = this.el.querySelector('[data-review-caption]');
      if (cap) cap.innerHTML = L(`🎯 Exercice : ${p.mover === 'w' ? 'les Blancs' : 'les Noirs'} jouent. Trouvez le meilleur coup, puis touchez <button type="button" class="link-btn" data-sol="${i}">voir la solution</button>.`, `🎯 Exercise: ${p.mover === 'w' ? 'White' : 'Black'} to play. Find the best move, then tap <button type="button" class="link-btn" data-sol="${i}">show the solution</button>.`);
      cap?.querySelector('[data-sol]')?.addEventListener('click', () => this.showPly(g, plies, i));
      return;
    }
    this.reviewBoard.setPosition(new Chess(p.fenBefore), { lastMove: i > 0 ? { from: plies[i - 1].uci?.slice(0, 2), to: plies[i - 1].uci?.slice(2, 4) } : null });
    const arrows = [{ from: p.uci.slice(0, 2), to: p.uci.slice(2, 4), kind: 'threat' }];
    if (p.bestUci) arrows.push({ from: p.bestUci.slice(0, 2), to: p.bestUci.slice(2, 4), kind: 'best' });
    this.reviewBoard.setArrows(arrows);
    const cap = this.el.querySelector('[data-review-caption]');
    if (cap) {
      cap.innerHTML = L(`Avant ${moveNo(i)} ${fr(p.san)} (${p.mover === g.color ? 'vous' : 'adversaire'}) : évaluation ${esc(formatScore({ type: 'cp', value: p.cpBefore }))}`, `Before ${moveNo(i)} ${fr(p.san)} (${p.mover === g.color ? 'you' : 'opponent'}): evaluation ${esc(formatScore({ type: 'cp', value: p.cpBefore }))}`)
        + (p.bestSan ? L(` · meilleur coup : <strong>${fr(p.bestSan)}</strong>`, ` · best move: <strong>${fr(p.bestSan)}</strong>`) : L(' · coup joué = meilleur coup du moteur', ' · move played = engine’s best move'))
        + (p.cls ? ` · <strong>${esc(p.cls.label)}</strong>` : '');
      if (temps) {
        const sec = (x) => `${dec(x.toFixed(1))} s`;
        // Pendule avant le coup = pendule après le coup + temps passé − incrément.
        const avant = temps.reste + temps.s - (g.tc?.increment || 0);
        cap.innerHTML = `<span class="temps-cap">${L(`⏱ <strong>Tu as réfléchi ${sec(temps.s)} ici</strong> (il te restait ${sec(Math.max(0, avant))} avant ce coup). Flèche rouge : ton coup ; verte : celui du moteur.`, `⏱ <strong>You thought for ${sec(temps.s)} here</strong> (you had ${sec(Math.max(0, avant))} left before this move). Red arrow: your move; green: the engine’s.`)}</span><br>${cap.innerHTML}`
          + (this.openLine ? `<br><button type="button" class="small-btn" data-temps-moteur>${L('▶ Analyser cette position sur l’échiquier', '▶ Analyse this position on the board')}</button>` : '');
        cap.querySelector('[data-temps-moteur]')?.addEventListener('click', () => this.openLine(g.san.slice(0, i), g.color, L(`ta partie contre ${g.color === 'w' ? g.black : g.white}, avant ${moveNo(i)} ${sanFr(p.san)}`, `your game against ${g.color === 'w' ? g.black : g.white}, before ${moveNo(i)} ${sanFr(p.san)}`)));
      }
    }
    this.el.querySelectorAll('.moves-annot .m').forEach((b) => b.classList.toggle('current', Number(b.dataset.ply) === i));
  }

  graphHtml(evals, color) {
    const w = 600; const h = 90;
    const pts = evals.map((e, i) => {
      const v = Math.max(-500, Math.min(500, e?.cp ?? 0));
      return `${((i / Math.max(1, evals.length - 1)) * w).toFixed(1)},${(h / 2 - (v / 500) * (h / 2 - 4)).toFixed(1)}`;
    }).join(' ');
    return `<svg class="eval-graph" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="${L('Courbe d’évaluation (au-dessus : avantage Blancs)', 'Evaluation graph (above: White advantage)')}">
      <rect x="0" y="0" width="${w}" height="${h / 2}" class="g-white"/><rect x="0" y="${h / 2}" width="${w}" height="${h / 2}" class="g-black"/>
      <polyline points="${pts}" class="g-line"/></svg>
      <p class="muted tiny">${L(`Courbe d’évaluation Stockfish (haut : avantage Blancs, bas : avantage Noirs) — vous avez les ${color === 'w' ? 'Blancs' : 'Noirs'}.`, `Stockfish evaluation graph (top: White advantage, bottom: Black advantage) — you have ${color === 'w' ? 'White' : 'Black'}.`)}</p>`;
  }

  // Bandeau Lichess : connecté (pseudo, se déconnecter) ou bouton de connexion.
  lichessHtml() {
    const tok = this.getToken();
    const msg = this.authMsg ? `<p class="small ${this.authMsg.startsWith('✔') ? 'ok-text' : 'error-text'}" data-lichess-msg>${esc(this.authMsg)}</p>` : '';
    if (tok) {
      const qui = this.prefs.lichessConnecte || this.prefs.lichess;
      return `<div class="lichess-auth ok" data-lichess-auth>${L('✔ Lichess connecté', '✔ Lichess connected')}${qui ? `${L(' : ', ': ')}<strong>${esc(qui)}</strong>` : ''} <button type="button" class="link-btn" data-lichess-logout>${L('Se déconnecter', 'Log out')}</button>${msg}</div>`;
    }
    return `<div class="lichess-auth" data-lichess-auth><button type="button" class="primary" data-lichess-login>${L('♞ Se connecter avec Lichess', '♞ Log in with Lichess')}</button>
      <p class="muted small">${L('Nécessaire pour charger tes parties Lichess. Connexion officielle sur lichess.org : ton mot de passe n’est jamais vu par l’appli.', 'Required to load your Lichess games. Official login on lichess.org: your password is never seen by the app.')}</p>${msg}</div>`;
  }

  bind() {
    this.el.querySelector('[data-lichess-login]')?.addEventListener('click', () => connecterLichess('#/parties'));
    this.el.querySelector('[data-lichess-logout]')?.addEventListener('click', async () => {
      await deconnecterLichess(this.getToken());
      this.setToken('');
      delete this.prefs.lichessConnecte;
      save(PREFS, this.prefs);
      this.authMsg = L('Déconnecté de Lichess sur cet appareil.', 'Logged out of Lichess on this device.');
      this.render();
    });
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
    this.el.querySelectorAll('[data-travailler]').forEach((b) => b.addEventListener('click', () => {
      if (!isPro()) { openPaywall({ reason: L('« Positions de mes parties »', '“Positions from my games”') }); return; }
      demanderEntrainement({ type: 'reelle', gameId: b.dataset.travailler });
    }));
    this.el.querySelectorAll('[data-analyse]').forEach((b) => b.addEventListener('click', () => {
      const g = this.games.find((x) => x.id === b.dataset.analyse);
      if (!g) return;
      if (this.cache[g.id]) { this.selected = g.id; this.render(); } else this.analyse(g);
      this.el.querySelector('[data-analysis]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    this.el.querySelector('[data-pgn-go]')?.addEventListener('click', () => this.pastePgn());
    this.el.querySelector('[data-pgn-line]')?.addEventListener('click', () => {
      const a = this.pgnAlert;
      if (a?.ligne) this.openLine?.(a.ligne, a.color, a.bouton === L('Voir la réfutation', 'Show the refutation') ? L('la réfutation de la fiche', 'the line’s refutation') : L('le coup de la fiche', 'the line’s move'));
    });
    this.el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      const g = this.games.find((x) => x.id === b.dataset.open);
      if (g) this.openGame(g);
    }));
  }
}
