// Page « Répertoire » : encyclopédie du Gambit Dame (Blancs) et de la Caro-Kann (Noirs).
//  - filtres rapides (ouverture, type), recherche par nom, coup (FR/EN) ou code ECO ;
//  - tableau 9 colonnes : fiches rédigées + vérification Stockfish faite à la construction,
//    colonnes dynamiques (Cloud Eval, statistiques « mon niveau », « maîtres » et « Élite ») ;
//  - vue « Anti-trash Blitz » : coups adverses loufoques et leur réfutation immédiate ;
//  - « Tester cette ligne » (lecture animée sur la page Moteur), export PGN ;
//  - arbre des coups réellement joués (mon niveau, maîtres ou Élite) ; vidéos YouTube multilingues.
import { Chess } from '../vendor/chess.js';
import { START_FEN } from './lines.js';
import { enrichMoves, bucketLabel, SPEED_LABELS } from './lichess.js';
import { sanFr, formatScore, formatLine } from './analysis.js';
import { repertoireToPgn } from './repertoire-pgn.js';
import { LANGS, searchLink, decodeEntities } from './youtube.js';
import { loadJoueurs } from './joueurs.js';
import { datalistHtml, playersSectionHtml, bindPlayers } from './joueurs-ui.js';
import { loadElite, lookupElite, eliteSummary, absentText, splitText, eliteHeaders, recentInfo, ago, NOCAMP_TEXT, CAMP_LABEL } from './elite.js';
import { loadSettings } from './storage.js';
import { canOpenFiche, openPaywall } from './pro.js';
import { filtrerData, REPERTOIRES } from './mon-repertoire.js';
import { couleurDe } from '../data/repertoires/meta.js';
import { langue } from './i18n.js';

// Phrases en français ou en anglais selon la langue de l'interface.
const L = (fr, en) => (langue() === 'en' ? en : fr);
const LOC = () => L('fr-FR', 'en-US');
const camp = (turn) => (turn === 'w' ? L('Blancs', 'White') : L('Noirs', 'Black'));

// Racine d'un répertoire en UCI (point de départ de l'arbre des coups).
const racineUci = (id) => {
  const c = new Chess();
  return (REPERTOIRES[id]?.racine || []).map((m) => c.move(m).lan);
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p1 = (x) => L(x.toFixed(1).replace('.', ',') + ' %', x.toFixed(1) + '%');
const SCORE_MIN_GAMES = 50; // en dessous, un % de score ne veut rien dire
const VIDEO_KEY = 'coach-echecs:videos-perso';
const BADGE_CLASS = { theorie: 'b-theorie', piege: 'b-piege', loufoque: 'b-loufoque' };
const BADGE_LABEL = { theorie: L('Théorie', 'Theory'), piege: L('Piège Blitz', 'Blitz trap'), loufoque: L('Coup loufoque à réfuter', 'Odd move to refute') };

function sanLine(san, startFen = START_FEN) {
  const c = new Chess(startFen);
  const moves = san.map((s) => c.move(s));
  return formatLine(moves, startFen);
}

// Ligne complète numérotée, en notation française, avec le coup fautif surligné.
function markedLineHtml(san, markIndex, from = 0) {
  const c = new Chess();
  const out = [];
  san.forEach((m, i) => {
    const mv = c.move(m);
    if (i < from) return;
    const no = Math.floor(i / 2) + 1;
    let t = esc(sanFr(mv.san));
    if (i === markIndex) t = `<mark title="${L('Coup fautif', 'Faulty move')}">${t} ?</mark>`;
    out.push(mv.color === 'w' ? `${no}. ${t}` : (i === from ? `${no}… ${t}` : t));
  });
  return out.join(' ');
}

// Texte de recherche : chaque coup avec son numéro, en anglais et en français.
function searchText(e) {
  const lines = [e.san, e.punition?.san, e.piege?.san].filter(Boolean);
  // Coups numérotés séparés par « | » : « 3.Fg4 » ne doit pas correspondre à « 13.Fg4 ».
  const numbered = lines.map((sans) => sans.map((s, i) => `|${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'}${s}|${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'}${sanFr(s)}`).join('')).join('');
  return norm([e.id, e.nom, e.famille, e.eco, e.ecoNom, e.plan, e.structure, e.cases].join(' ')) + norm(numbered);
}
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/…|\.\.\./g, '.').replace(/[\s+#!?]/g, '');

function scoreText(v) {
  if (!v) return '—';
  if (v.mated) return L('Mat', 'Mate');
  return formatScore({ type: v.type, value: v.value });
}
function toWhite(v, pov) {
  if (!v || v.mated) return v;
  return pov === 'w' ? v : { ...v, value: -v.value };
}

// Lien YouTube horodaté construit à partir d'une URL et d'un temps (mm:ss ou secondes).
export function buildVideoLink(url, time) {
  const m = String(url).match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/);
  if (!m) return null;
  let secs = 0;
  const t = String(time || '').trim();
  if (/^\d+$/.test(t)) secs = Number(t);
  else if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(t)) secs = t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
  else if (t) return null;
  return `https://www.youtube.com/watch?v=${m[1]}${secs ? `&t=${secs}s` : ''}`;
}
// Vidéos choisies à la main (video.liens) : « ▶ Titre (chaîne, EN) », ouvertes dans un nouvel onglet,
// en français d'abord, puis en anglais, puis les autres langues. Chaîne omise si non confirmée (null).
// Un horodatage n'existe que s'il vient d'un chapitre publié par l'auteur (champ `chapitre`).
function curatedVideosHtml(e, cls = 'vd-curated') {
  const rank = (l) => ({ fr: 0, en: 1 }[l.langue] ?? 2);
  const liens = (e.video?.liens || []).map((l, i) => [l, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([l]) => l);
  if (!liens.length) return '';
  return `<div class="${cls}" data-curated="${esc(e.id)}">${liens.map((l) => {
    const debut = l.chapitre ? (l.url.match(/&t=(\d+)s/) || [])[1] : null;
    const at = debut ? ` · ${L('dès', 'from')} ${Math.floor(debut / 60)}:${String(debut % 60).padStart(2, '0')}` : '';
    return `<div class="small"><a class="btn-link" href="${esc(l.url)}" target="_blank" rel="noopener"${l.chapitre ? ` title="${L('Chapitre :', 'Chapter:')} ${esc(l.chapitre)}"` : ''}>▶ ${esc(l.titre)}</a> <span class="muted tiny">(${l.chaine ? `${esc(l.chaine)}, ` : ''}${esc(String(l.langue).toUpperCase())}${at})</span></div>`;
  }).join('')}</div>`;
}
function loadVideos() { try { return JSON.parse(localStorage.getItem(VIDEO_KEY) || '{}'); } catch { return {}; } }
function saveVideos(v) { try { localStorage.setItem(VIDEO_KEY, JSON.stringify(v)); } catch { /* stockage indisponible */ } }

const wdl = (s) => L(`Blancs ${p1(s.white)} · nulles ${p1(s.draws)} · Noirs ${p1(s.black)}`, `White ${p1(s.white)} · draws ${p1(s.draws)} · Black ${p1(s.black)}`);
const bar = (s) => `<div class="wdl-bar" title="${wdl(s)}"><span class="w" style="width:${s.white}%"></span><span class="d" style="width:${s.draws}%"></span><span class="b" style="width:${s.black}%"></span></div>`;

export class RepertoirePage {
  constructor({ el, client, getFilter, openSan, openMaster, openGame = null, youtube, loadEliteData = loadElite }) {
    this.el = el;
    // « Débloquer avec Pro » (fiches verrouillées) : fenêtre BlitzRefute Pro.
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-unlock]');
      if (b) openPaywall({ reason: b.dataset.unlock });
    });
    this.client = client;
    this.getFilter = getFilter;
    this.openSan = openSan;
    this.openMaster = openMaster;
    this.openGame = openGame;
    this.youtube = youtube;
    this.loadEliteData = loadEliteData;
    this.elite = { status: 'loading' }; // jeu Élite (branche donnees-elite ou data/elite.json)
    this.data = null;
    this.view = ''; // identifiant d'un répertoire choisi, ou 'trash'
    this.badge = '';
    this.query = '';
    this.sort = ''; // '' | 'joue-niveau' | 'score-niveau' | 'joue-maitres' | 'score-maitres' | 'eval'
    this.live = new Map(); // id → { cloud, explorer, masters }
    this.tree = null; // { path, node, source }
    this.treeSource = 'niveau';
    this.videos = loadVideos();
    this.videoLang = 'fr';
    this.generation = 0; // invalide les réponses tardives après changement de filtre
  }

  async show() {
    if (!this.data) {
      this.el.innerHTML = `<p class="state pad"><span class="spinner"></span> ${L('Chargement du répertoire…', 'Loading the repertoire…')}</p>`;
      try {
        // Seulement les ouvertures choisies (Mon répertoire).
        this.data = filtrerData(await (await fetch('./data/repertoire.json', { cache: 'no-cache' })).json());
      } catch {
        this.el.innerHTML = `<p class="errbox pad">${L('Impossible de charger le répertoire (data/repertoire.json).', 'Could not load the repertoire (data/repertoire.json).')}</p>`;
        return;
      }
      for (const e of this.data.entries) e._search = searchText(e);
    }
    // À chaque affichage (rechargé au plus toutes les 5 min) : nouvelles parties visibles sans recharger la page.
    this.loadEliteData().then((r) => {
      if (r === this.eliteResult) return;
      this.eliteResult = r;
      this.elite = r;
      if (this.el.querySelector('.rep-table')) this.data.entries.forEach((e) => this.updateRow(e));
      this.renderLive();
      if (this.tree?.source === 'elite') this.openTree(this.tree.path);
    });
    const fk = this.filterKey();
    if (this.lastFilterKey && this.lastFilterKey !== fk) { this.live.clear(); this.generation++; }
    this.lastFilterKey = fk;
    this.render();
  }

  filterKey() {
    const f = this.getFilter();
    return JSON.stringify([f.ratings, f.speeds]);
  }

  entries() {
    const q = norm(this.query.trim());
    const list = this.data.entries.filter((e) => (this.view === 'trash' || e.rep === this.view)
      && (!this.badge || e.badge === this.badge) && (!q || e._search.includes(/^\d/.test(q) ? '|' + q : q)));
    if (!this.sort || this.view === 'trash') return list;
    // Tri stable : les fiches sans donnée (ou sous le seuil de parties) restent en fin de liste.
    const val = (e) => this.sortValue(e);
    return list.map((e, i) => ({ e, i, v: val(e) })).sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity) || a.i - b.i).map((x) => x.e);
  }

  // ---------- Classement des variantes ----------

  // Score du camp qui joue la fiche (Blancs pour le Gambit Dame, Noirs pour la Caro-Kann).
  myScore(e, s) {
    const mine = this.data.repertoires[e.rep].couleur === 'w' ? s.white : s.black;
    return mine + s.draws / 2;
  }

  sortStats(e) {
    const src = this.sort.endsWith('maitres') ? 'masters' : 'explorer';
    const x = this.live.get(e.id)?.[src];
    return x?.status === 'ok' ? x.stats : null;
  }

  sortValue(e) {
    if (this.sort === 'eval') {
      const m = e.verification?.main;
      if (!m) return null;
      const w = m.type === 'mate' ? Math.sign(m.value) * 100000 : m.value;
      return this.data.repertoires[e.rep].couleur === 'w' ? w : -w;
    }
    const s = this.sortStats(e);
    if (!s || !s.total) return null;
    if (this.sort.startsWith('joue')) return s.total;
    return s.total >= SCORE_MIN_GAMES ? this.myScore(e, s) : null;
  }

  // Toutes les données du classement sont-elles arrivées (ok, erreur ou absence de jeton) ?
  sortPending(list) {
    if (!this.sort || this.sort === 'eval') return 0;
    const src = this.sort.endsWith('maitres') ? 'masters' : 'explorer';
    return list.filter((e) => { const x = this.live.get(e.id)?.[src]; return !x || x.status === 'loading'; }).length;
  }

  rankingHtml(list) {
    if (!this.sort || this.view === 'trash') return '';
    if (!this.client.explorerMode() && this.sort !== 'eval') return `<p class="errbox small">${L('Classement par parties : jeton Lichess requis (⚙ Réglages).', 'Ranking by games: Lichess token required (⚙ Settings).')}</p>`;
    const pending = this.sortPending(list);
    if (pending) return `<p class="state small"><span class="spinner"></span> ${L(`Classement : statistiques en cours de chargement (${list.length - pending}/${list.length})…`, `Ranking: loading statistics (${list.length - pending}/${list.length})…`)}</p>`;
    const src = this.sort.endsWith('maitres') ? L('maîtres', 'masters') : L('mon niveau', 'my level');
    const name = (e) => `<button type="button" class="link-btn" data-goto="${e.id}">${esc(e.nom)}</button>`;
    if (this.sort === 'eval') {
      const top = list.filter((e) => this.sortValue(e) != null).slice(0, 3);
      return `<div class="card ranking small"><strong>${L('Meilleure évaluation Stockfish pour vous', 'Best Stockfish evaluation for you')}</strong> ${L(`(fin de la ligne, profondeur ${this.data.moteur.profondeur}) :`, `(end of the line, depth ${this.data.moteur.profondeur}):`)} ${top.map((e) => `${name(e)} (${esc(scoreText(toWhite(e.verification.main, 'w')))})`).join(' · ')}<p class="muted tiny">${L('Évaluation de la position à la fin de la fiche, point de vue des Blancs. Une évaluation moteur n’est pas un taux de victoire.', 'Evaluation of the position at the end of the line, from White’s point of view. An engine evaluation is not a win rate.')}</p></div>`;
    }
    const withStats = list.map((e) => ({ e, s: this.sortStats(e) })).filter((x) => x.s?.total);
    if (!withStats.length) return `<p class="muted small">${L(`Aucune statistique (${src}) pour ces fiches.`, `No statistics (${src}) for these lines.`)}</p>`;
    const most = withStats.reduce((a, b) => (b.s.total > a.s.total ? b : a));
    const scored = withStats.filter((x) => x.s.total >= SCORE_MIN_GAMES);
    const best = scored.length ? scored.reduce((a, b) => (this.myScore(b.e, b.s) > this.myScore(a.e, a.s) ? b : a)) : null;
    const worst = scored.length ? scored.reduce((a, b) => (this.myScore(b.e, b.s) < this.myScore(a.e, a.s) ? b : a)) : null;
    return `<div class="card ranking small">
      <div>📊 <strong>${L('La plus jouée', 'Most played')}</strong> (${src})${L(' :', ':')} ${name(most.e)} — ${most.s.total.toLocaleString(LOC())} ${L('parties', 'games')}</div>
      ${best ? `<div>🏆 <strong>${L('Meilleur score pour vous', 'Best score for you')}</strong>${L(' :', ':')} ${name(best.e)} — ${p1(this.myScore(best.e, best.s))} (${best.s.total.toLocaleString(LOC())} ${L('parties', 'games')})</div>` : ''}
      ${worst && worst !== best ? `<div>⚠️ <strong>${L('Score le plus faible', 'Lowest score')}</strong>${L(' :', ':')} ${name(worst.e)} — ${p1(this.myScore(worst.e, worst.s))}</div>` : ''}
      <p class="muted tiny">${L(`Score = victoires + ½ nulles pour votre camp, dans les parties qui ont atteint la position finale de la fiche (au moins ${SCORE_MIN_GAMES} parties pour le score). Fréquences observées, pas une évaluation.`, `Score = wins + ½ draws for your side, in games that reached the final position of the line (at least ${SCORE_MIN_GAMES} games for the score). Observed frequencies, not an evaluation.`)}</p>
    </div>`;
  }

  // ---------- Rendu ----------

  // Répertoire affiché (onglet), ou le premier répertoire choisi si l'onglet est « Anti-trash ».
  repVue() { return this.view !== 'trash' && this.data.choisis.includes(this.view) ? this.view : this.data.choisis[0]; }

  render() {
    const d = this.data;
    if (this.view !== 'trash') this.view = this.repVue();
    const f = this.getFilter();
    const filt = `${f.speeds.map((s) => SPEED_LABELS[s]).join(', ') || L('toutes cadences', 'all time controls')} · ${f.ratings.map(bucketLabel).join(', ') || L('tous classements', 'all ratings')}`;
    const list = this.entries();
    const count = (pred) => d.entries.filter(pred).length;
    const chip = (attr, val, cur, label, n) => `<button type="button" class="chip" ${attr}="${val}" aria-pressed="${cur === val}">${label}${n != null ? ` <span class="chip-n">${n}</span>` : ''}</button>`;
    this.el.innerHTML = `
      <div class="rep-head">
        <div class="chips" aria-label="${L('Ouverture', 'Opening')}">
          ${d.choisis.map((id) => {
            const n = count((e) => e.rep === id);
            return chip('data-view', id, this.view, `${couleurDe(id) === 'w' ? '♙' : '♟'} ${esc(REPERTOIRES[id].titre)} <span class="muted small">(${camp(couleurDe(id))})</span>${n ? '' : ` <span class="badge soon-badge">${L('bientôt', 'soon')}</span>`}`, n || null);
          }).join('')}
          ${chip('data-view', 'trash', this.view, L('🗑 Anti-trash Blitz', '🗑 Blitz anti-trash'), count((e) => e.punition || e.piege || e.badge === 'loufoque'))}
        </div>
        <div class="chips" aria-label="${L('Type de ligne', 'Line type')}">
          ${chip('data-badge-chip', '', this.badge, L('Tous types', 'All types'))}
          ${chip('data-badge-chip', 'theorie', this.badge, L('Théorie', 'Theory'))}
          ${chip('data-badge-chip', 'piege', this.badge, L('Piège Blitz', 'Blitz trap'))}
          ${chip('data-badge-chip', 'loufoque', this.badge, L('Coup loufoque', 'Odd move'))}
        </div>
        <div class="rep-filters">
          <input type="search" data-q list="rep-joueurs" placeholder="${L('Rechercher : nom, coup (Fg4, Bg4, 2…Fg4), code ECO (B12) ou joueur (Carlsen)', 'Search: name, move (Bg4, 2…Bg4), ECO code (B12) or player (Carlsen)')}" value="${esc(this.query)}">
          <datalist id="rep-joueurs">${datalistHtml(this.joueurs, this.query)}</datalist>
          ${this.view === 'trash' ? '' : `<select data-sort aria-label="${L('Classer les variantes', 'Sort the lines')}">
            ${[['', L('Ordre du répertoire', 'Repertoire order')], ['joue-niveau', L('Les plus jouées (mon niveau)', 'Most played (my level)')], ['score-niveau', L('Meilleur score pour moi (mon niveau)', 'Best score for me (my level)')], ['joue-maitres', L('Les plus jouées (maîtres)', 'Most played (masters)')], ['score-maitres', L('Meilleur score pour moi (maîtres)', 'Best score for me (masters)')], ['eval', L('Meilleure évaluation Stockfish', 'Best Stockfish evaluation')]].map(([v, l]) => `<option value="${v}"${this.sort === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>`}
          <details class="export-menu"><summary>⤓ ${L('Exporter en PGN', 'Export as PGN')}</summary>
            <div class="export-box">
              ${d.choisis.filter((id) => count((e) => e.rep === id)).map((id) => `<button type="button" data-export="${id}">${esc(REPERTOIRES[id].titre)} (${count((e) => e.rep === id)} ${L('fiches', 'lines')})</button>`).join('')}
              <button type="button" data-export="all">${L('Tout le répertoire', 'Whole repertoire')}</button>
              <p class="muted tiny">${L('Lichess : Étude → « + » (nouveau chapitre) → onglet PGN → coller ou importer le fichier (64 chapitres max par étude : un fichier par ouverture). Chess.com : Analyse → Importer PGN. Les punitions et pièges sont inclus en variantes commentées.', 'Lichess: Study → “+” (new chapter) → PGN tab → paste or import the file (64 chapters max per study: one file per opening). Chess.com: Analysis → Import PGN. Punishments and traps are included as commented variations.')}</p>
            </div>
          </details>
        </div>
        <p class="small muted"><span data-count>${L(`${list.length} fiche(s) affichée(s).`, `${list.length} line(s) shown.`)}</span> ${L(`Statistiques « mon niveau » : ${esc(filt)} (réglable dans « Coup optimal ») ; « maîtres » : joueurs titrés 2200+ FIDE ; « Élite » : parties blitz/rapide des meilleurs joueurs Lichess et Chess.com (fréquences observées, pas une évaluation). Évaluations vérifiées : ${esc(d.moteur.nom)}, profondeur ${d.moteur.profondeur}. Codes ECO et noms : base Lichess chess-openings (CC0) ; il n’existe pas de nomenclature FIDE officielle des variantes.`, `“My level” statistics: ${esc(filt)} (adjustable in “Best move”); “masters”: titled players 2200+ FIDE; “Elite”: blitz/rapid games of the best Lichess and Chess.com players (observed frequencies, not an evaluation). Verified evaluations: ${esc(d.moteur.nom)}, depth ${d.moteur.profondeur}. ECO codes and names: Lichess chess-openings database (CC0); there is no official FIDE nomenclature of variations.`)}</p>
      </div>
      <div data-ranking>${this.rankingHtml(list)}</div>
      <section id="rep-players">${playersSectionHtml(this.joueurs, this.query, list.length)}</section>
      <div data-results>${this.resultsHtml(list)}</div>
      <section class="card live-card" id="rep-live">${this.liveHtml()}</section>
      <section class="card tree-card" id="rep-tree">${this.treeHtml()}</section>
      <dialog class="video-dlg" data-video-dlg></dialog>
    `;
    this.bind();
    this.observe();
    if (this.sort && this.sort !== 'eval' && this.view !== 'trash') list.forEach((e) => this.load(e));
  }

  // Mise à jour des seuls résultats (saisie dans la recherche) : la case de recherche n'est
  // jamais recréée pendant la frappe (sinon Safari iPhone perd la saisie et se fige).
  renderResults() {
    const list = this.entries();
    this.el.querySelector('[data-count]').textContent = L(`${list.length} fiche(s) affichée(s).`, `${list.length} line(s) shown.`);
    this.el.querySelector('[data-ranking]').innerHTML = this.rankingHtml(list);
    const sec = this.el.querySelector('#rep-players');
    sec.innerHTML = playersSectionHtml(this.joueurs, this.query, list.length);
    bindPlayers(sec, this.joueurs, this.openGame);
    this.el.querySelector('[data-results]').innerHTML = this.resultsHtml(list);
    const dl = this.el.querySelector('#rep-joueurs');
    if (dl) dl.innerHTML = datalistHtml(this.joueurs, this.query);
    this.observe();
    if (this.sort && this.sort !== 'eval' && this.view !== 'trash') list.forEach((e) => this.load(e));
  }

  resultsHtml(list) {
    if (this.view === 'trash') return this.trashHtml(list);
    if (!this.data.entries.some((e) => e.rep === this.view)) return this.soonHtml(this.view);
    return this.tableHtml(list);
  }

  // Répertoire choisi sans fiche publiée : annoncé tel quel, rien d'inventé.
  soonHtml(id) {
    const r = REPERTOIRES[id];
    return `<section class="card soon-card" data-soon="${esc(id)}">
      <h2>${couleurDe(id) === 'w' ? '♙' : '♟'} ${esc(r.titre)} <span class="badge soon-badge">${L('bientôt', 'soon')}</span></h2>
      <p class="small muted">${esc(r.sousTitre)}</p>
      <p>${L('Les fiches de cette ouverture sont en préparation : chaque piège et chaque punition sera vérifié par Stockfish avant publication.', 'The lines of this opening are being prepared: every trap and every punishment will be checked by Stockfish before publication.')}</p>
      <p class="small">${L('En attendant, l’<strong>arbre des coups joués</strong> ci-dessous (statistiques Lichess, à votre niveau ou chez les maîtres) et le <strong>Moteur</strong> fonctionnent déjà pour cette ouverture.', 'Meanwhile, the <strong>tree of played moves</strong> below (Lichess statistics, at your level or among masters) and the <strong>Engine</strong> already work for this opening.')}</p>
    </section>`;
  }

  tableHtml(list) {
    return `<div class="rep-table-wrap">
      <table class="rep-table">
        <thead><tr>
          <th>${L('ECO · Nom', 'ECO · Name')}</th><th>${L('Séquence', 'Sequence')}</th><th>${L('Évaluation', 'Evaluation')}</th><th>${L('Statistiques', 'Statistics')}</th><th>${L('Plan & structure', 'Plan & structure')}</th>
          <th>${L('Punition tactique', 'Tactical punishment')}</th><th>${L('Piège à éviter', 'Trap to avoid')}</th><th>${L('Cases & pièces', 'Squares & pieces')}</th><th>${L('Vidéo', 'Video')}</th>
        </tr></thead>
        <tbody>${list.map((e) => this.row(e)).join('') || `<tr><td colspan="9" class="muted">${L('Aucune fiche pour ce filtre.', 'No line for this filter.')}</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  // Fiche réservée à BlitzRefute Pro : nom, code ECO et premiers coups visibles, le reste flouté.
  // Ce que contient une fiche verrouillée, sans en dévoiler la solution (aperçu avant achat).
  teaser(e) {
    const t = [
      e.piege && L('🪤 Un piège à connaître', '🪤 A trap to know'),
      e.punition && L('⚔ Une punition vérifiée par Stockfish', '⚔ A Stockfish-verified punishment'),
      L('📖 Leçon pas à pas', '📖 Step-by-step lesson'),
      e.video && L('🎬 Vidéo', '🎬 Video'),
      e.freq && L(`📊 ${e.freq.n} partie(s) du top`, `📊 ${e.freq.n} top game(s)`),
    ].filter(Boolean);
    return `<div class="locked-teaser">${t.map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</div>`;
  }

  lockedRow(e) {
    return `<tr data-id="${e.id}" data-locked class="locked-card">
      <td data-label="ECO · Nom" data-l="${L('ECO · Nom', 'ECO · Name')}">
        <span class="badge eco">${esc(e.eco)}</span> <span class="lock-badge">🔒 Pro</span>
        <div class="rep-name">${esc(e.nom)}</div>
        <div class="muted tiny">${esc(e.ecoNom)}</div>
        ${this.teaser(e)}
        <button type="button" class="primary small-btn unlock-btn" data-unlock="${L(`La fiche « ${esc(e.nom)} »`, `The line “${esc(e.nom)}”`)}">${L('Débloquer avec Pro', 'Unlock with Pro')}</button>
      </td>
      <td data-label="Séquence" data-l="${L('Séquence', 'Moves')}" class="line">${esc(sanLine(e.san.slice(0, 4)))} …</td>
      <td data-label="Contenu Pro" data-l="${L('Contenu Pro', 'Pro content')}" colspan="7"><p class="small locked-blur" aria-hidden="true">${esc(e.plan)}</p>
        <p class="small muted">${L('Plan, pièges, réfutation vérifiée par Stockfish, statistiques et vidéos dans BlitzRefute Pro.', 'Plan, traps, Stockfish-verified refutation, statistics and videos in BlitzRefute Pro.')}</p></td>
    </tr>`;
  }

  row(e) {
    if (!canOpenFiche(e.id)) return this.lockedRow(e);
    const v = e.verification;
    const live = this.live.get(e.id) || {};
    const color = this.data.repertoires[e.rep].couleur;
    return `<tr data-id="${e.id}">
      <td data-label="ECO · Nom" data-l="${L('ECO · Nom', 'ECO · Name')}">
        <span class="badge eco">${esc(e.eco)}</span> <button type="button" class="badge badge-btn ${BADGE_CLASS[e.badge]}" data-badge-filter="${e.badge}" title="${L('Afficher toutes les fiches de ce type', 'Show all lines of this type')}">${esc(BADGE_LABEL[e.badge])}</button>
        <div class="rep-name">${esc(e.nom)}</div>
        <div class="muted tiny">${esc(e.ecoNom)}</div>
        <div class="row-actions">
          <button type="button" class="primary small-btn" data-test="${e.id}">▶ ${L('Tester cette ligne', 'Test this line')}</button>
          <button type="button" class="link-btn" data-tree="${e.id}">${L('Arbre des coups joués', 'Tree of played moves')}</button>
        </div>
      </td>
      <td data-label="Séquence" data-l="${L('Séquence', 'Moves')}" class="line">${esc(sanLine(e.san))}</td>
      <td data-label="Évaluation" data-l="${L('Évaluation', 'Evaluation')}">${this.evalCell(e, live)}</td>
      <td data-label="Statistiques" data-l="${L('Statistiques', 'Statistics')}">${this.statsCell(live, e)}</td>
      <td data-label="Plan & structure" data-l="${L('Plan & structure', 'Plan & structure')}"><p class="small">${esc(e.plan)}</p><p class="small"><strong>${L('Structure :', 'Structure:')}</strong> ${esc(e.structure)}</p></td>
      <td data-label="Punition tactique" data-l="${L('Punition tactique', 'Tactical punishment')}">${this.claimCell(e, 'punition', v?.punition, color)}</td>
      <td data-label="Piège à éviter" data-l="${L('Piège à éviter', 'Trap to avoid')}">${this.claimCell(e, 'piege', v?.piege, color)}</td>
      <td data-label="Cases & pièces" data-l="${L('Cases & pièces', 'Squares & pieces')}" class="small"><p><strong>${L('Cases clés :', 'Key squares:')}</strong> ${esc(e.cases)}</p><p><strong>${L('À échanger :', 'To trade:')}</strong> ${esc(e.echanger)}</p><p><strong>${L('À conserver :', 'To keep:')}</strong> ${esc(e.conserver)}</p></td>
      <td data-label="Vidéo" data-l="${L('Vidéo', 'Video')}">${this.videoCell(e)}</td>
    </tr>`;
  }

  evalCell(e, live) {
    const c = live.cloud;
    let cloud;
    if (!c) cloud = `<span class="muted small">${L('Cloud Eval : en attente', 'Cloud Eval: pending')}</span>`;
    else if (c.status === 'loading') cloud = '<span class="state small"><span class="spinner"></span>Cloud Eval…</span>';
    else if (c.status === 'absent') cloud = `<span class="muted small">${L('Cloud Eval : position absente du cache Lichess', 'Cloud Eval: position not in the Lichess cache')}</span>`;
    else if (c.status === 'error') cloud = `<span class="error-text small">${esc(c.error)}</span>`;
    else cloud = `<div><strong>${esc(formatScore(c.score))}</strong> <span class="muted tiny">Cloud Eval, ${L('prof.', 'depth')} ${c.depth}</span></div><div class="tiny">${L('Meilleur :', 'Best:')} ${esc(sanFr(c.san))}</div>`;
    const v = e.verification;
    return cloud + (v ? `<div class="small">${L('Stockfish (vérif.) :', 'Stockfish (check):')} <strong>${esc(scoreText(toWhite(v.main, v.main.pov)))}</strong></div>` : '');
  }

  statsCell(live, e) {
    const one = (x, label) => {
      if (!x) return `<div class="muted tiny">${L(`${label} : en attente`, `${label}: pending`)}</div>`;
      if (x.status === 'loading') return `<div class="state tiny"><span class="spinner"></span>${label}…</div>`;
      if (x.status === 'notoken') return `<div class="muted tiny">${L(`${label} : jeton Lichess requis (⚙)`, `${label}: Lichess token required (⚙)`)}</div>`;
      if (x.status === 'error') return `<div class="error-text tiny">${label}${L(' :', ':')} ${esc(x.error)}</div>`;
      const s = x.stats;
      if (!s.total) return `<div class="muted tiny">${L(`${label} : aucune partie`, `${label}: no games`)}</div>`;
      return `<div class="stat-line"><span class="tiny"><strong>${label}</strong> · ${s.total.toLocaleString(LOC())} ${L('parties', 'games')}</span>${bar(s)}<span class="tiny">${wdl(s)}</span></div>`;
    };
    return one(live.explorer, L('Mon niveau', 'My level')) + one(live.masters, L('Maîtres', 'Masters')) + this.eliteLine(e.fenFinale, e.rep);
  }

  // Ligne « Élite » : lue dans le fichier statique, sans requête réseau supplémentaire.
  eliteLine(fen, rep = null) {
    const el = this.elite;
    const camp = !!loadSettings().eliteCamp;
    const E = L('Élite', 'Elite');
    const label = camp ? `${E} (${CAMP_LABEL})` : E;
    const sep = L(' :', ':');
    if (rep && !REPERTOIRES[rep]?.elite) return `<div class="muted tiny elite-absent">${label}${sep} ${L('données Élite pas encore collectées pour cette ouverture', 'Elite data not yet collected for this opening')}</div>`;
    if (el.status === 'loading') return `<div class="state tiny"><span class="spinner"></span>${label}…</div>`;
    if (el.status !== 'ok') return `<div class="muted tiny">${label}${sep} ${L('jeu de données non publié', 'dataset not published')}</div>`;
    const x = lookupElite(el.data, fen, { camp, side: REPERTOIRES[rep]?.couleur || 'w' });
    if (x.status === 'nocamp') return `<div class="muted tiny elite-absent">${label}${sep} ${esc(NOCAMP_TEXT)}</div>`;
    if (x.status !== 'ok') return `<div class="muted tiny elite-absent">${label}${sep} ${L('position absente (aucune partie du top retenue)', 'position missing (no top game kept)')}</div>`;
    const s = x.stats;
    return `<div class="stat-line stat-elite"><span class="tiny"><strong>${label}</strong> · ${s.total.toLocaleString(LOC())} ${L('parties', 'games')} · ${L('ensuite surtout', 'then mostly')} ${esc(sanFr(x.top.san))} (${p1((100 * x.top.stats.total) / x.total)})</span>${bar(s)}<span class="tiny">${wdl(s)} · ${esc(splitText(x.split))}</span></div>`;
  }

  claimCell(e, kind, v, color) {
    const c = e[kind];
    if (!c) return '<span class="muted small">—</span>';
    let verdict = `<span class="badge">${L('non vérifié', 'not verified')}</span>`;
    if (v) {
      const fin = v.final.mated ? (v.final.mated === color ? L('mat contre nous', 'mate against us') : L('mat', 'mate')) : formatScore({ type: v.final.type, value: v.final.value });
      verdict = v.ok
        ? `<span class="badge ok" title="${L('Évaluation finale du point de vue de notre camp', 'Final evaluation from our side’s point of view')}">✔ Stockfish${L(' :', ':')} ${esc(fin)}</span>`
        : `<span class="badge err">✘ ${L('non confirmé', 'not confirmed')} (${esc(fin)})</span>`;
    }
    const rest = c.san.slice(c.marked);
    const engineAlt = v && v.afterError?.best && kind === 'punition' && v.afterError.best !== rest[1]
      ? `<div class="muted tiny">${L('Meilleure suite selon le moteur après l’erreur :', 'Best continuation according to the engine after the mistake:')} ${esc(v.afterError.pv.slice(0, 4).map(sanFr).join(' '))}</div>` : '';
    return `<div class="line small">${markedLineHtml(c.san, c.marked)}</div><p class="small">${esc(c.texte)}</p>${verdict}${engineAlt}
      <div><button type="button" class="link-btn small" data-test-claim="${e.id}:${kind}">▶ ${L('Tester', 'Test')}</button></div>`;
  }

  videoCell(e) {
    const perso = this.videos[e.id];
    const verified = e.video.url && e.video.verifie
      ? `<a class="btn-link" href="${esc(e.video.url)}" target="_blank" rel="noopener">▶ ${L('Vidéo (passage précis)', 'Video (exact moment)')}</a>` : '';
    const mine = perso
      ? `<a class="btn-link" href="${esc(perso)}" target="_blank" rel="noopener">▶ ${L('Mon lien horodaté', 'My timestamped link')}</a> <button type="button" class="link-btn tiny" data-video-del="${e.id}">${L('retirer', 'remove')}</button>`
      : `<button type="button" class="link-btn" data-video-add="${e.id}">+ ${L('Ajouter mon lien horodaté', 'Add my timestamped link')}</button>`;
    return `${verified}${curatedVideosHtml(e)}<button type="button" class="small-btn" data-videos="${e.id}">🎬 ${L(`Vidéos (${Object.keys(LANGS).length} langues)`, `Videos (${Object.keys(LANGS).length} languages)`)}</button><div>${mine}</div>`;
  }

  // ---------- Vue Anti-trash ----------

  trashHtml(list) {
    const reps = this.data.repertoires;
    const punitions = list.filter((e) => e.punition);
    const loufoques = list.filter((e) => !e.punition && e.badge === 'loufoque');
    const pieges = list.filter((e) => e.piege);
    const lockedCard = (e) => `<article class="card trash-card locked-card">
        <div class="trash-top"><span class="badge">${esc(reps[e.rep].titre)}</span> <span class="badge eco">${esc(e.eco)}</span> <span class="lock-badge">🔒 Pro</span></div>
        <h3>${esc(e.nom)}</h3>
        ${this.teaser(e)}
        <button type="button" class="primary small-btn" data-unlock="${L(`La réfutation « ${esc(e.nom)} »`, `The refutation “${esc(e.nom)}”`)}">${L('Débloquer avec Pro', 'Unlock with Pro')}</button>
      </article>`;
    const card = (e, kind) => {
      if (!canOpenFiche(e.id)) return lockedCard(e);
      const c = e[kind];
      const v = e.verification?.[kind];
      const color = reps[e.rep].couleur;
      const fin = v ? (v.final.mated ? (v.final.mated === color ? L('mat contre nous', 'mate against us') : L('mat', 'mate')) : formatScore({ type: v.final.type, value: v.final.value })) : null;
      const err = c.san[c.marked];
      const no = `${Math.floor(c.marked / 2) + 1}${c.marked % 2 ? '…' : '.'}`;
      return `<article class="card trash-card ${kind}">
        <div class="trash-top"><span class="badge">${esc(reps[e.rep].titre)}</span> <span class="badge eco">${esc(e.eco)}</span> ${v?.ok ? `<span class="badge ok">✔ Stockfish${L(' :', ':')} ${esc(fin)}</span>` : ''}</div>
        <h3>${esc(e.nom)}</h3>
        <p class="trash-move">${kind === 'punition' ? L('Coup adverse', 'Opponent’s move') : L('Votre erreur à éviter', 'Your mistake to avoid')}${L(' :', ':')} <mark>${esc(no)} ${esc(sanFr(err))} ?</mark></p>
        <p class="small"><strong>${kind === 'punition' ? L('Réfutation immédiate', 'Immediate refutation') : L('Sanction', 'Penalty')}${L(' :', ':')}</strong> <span class="line">${markedLineHtml(c.san, -1, c.marked + 1) || '—'}</span></p>
        <p class="small">${esc(c.texte)}</p>
        <div class="actions"><button type="button" class="primary small-btn" data-test-claim="${e.id}:${kind}">▶ ${L('Tester', 'Test')}</button>
          <button type="button" class="link-btn" data-goto="${e.id}">${L('Voir la fiche', 'View the line')}</button></div>
      </article>`;
    };
    const plain = (e) => (!canOpenFiche(e.id) ? lockedCard(e) : `<article class="card trash-card">
        <div class="trash-top"><span class="badge">${esc(reps[e.rep].titre)}</span> <span class="badge eco">${esc(e.eco)}</span></div>
        <h3>${esc(e.nom)}</h3><p class="small line">${esc(sanLine(e.san))}</p><p class="small">${esc(e.plan)}</p>
        <div class="actions"><button type="button" class="primary small-btn" data-test="${e.id}">▶ ${L('Tester', 'Test')}</button><button type="button" class="link-btn" data-goto="${e.id}">${L('Voir la fiche', 'View the line')}</button></div>
      </article>`);
    return `<section class="trash">
      <p class="small">${L('Coups bizarres fréquents en Blitz autour de 1000 Elo : sorties de Dame précoces, gambits douteux, poussées de pions hâtives, et vos propres réflexes perdants. Chaque réfutation est vérifiée par Stockfish.', 'Odd moves common in Blitz around 1000 Elo: early queen sorties, dubious gambits, hasty pawn pushes, and your own losing reflexes. Every refutation is checked by Stockfish.')}</p>
      <h2>${L('Coups adverses à punir', 'Opponent moves to punish')} (${punitions.length})</h2><div class="trash-grid">${punitions.map((e) => card(e, 'punition')).join('') || `<p class="muted">${L('Aucun.', 'None.')}</p>`}</div>
      ${loufoques.length ? `<h2>${L('Coups atypiques sans réfutation forcée', 'Unusual moves without a forced refutation')} (${loufoques.length})</h2><p class="muted small">${L('Le moteur les juge inférieurs mais sans punition tactique immédiate : jouer simplement le plan indiqué.', 'The engine rates them as inferior but with no immediate tactical punishment: simply play the plan given.')}</p><div class="trash-grid">${loufoques.map(plain).join('')}</div>` : ''}
      <h2>${L('Pièges à ne pas commettre', 'Traps not to fall into')} (${pieges.length})</h2><div class="trash-grid">${pieges.map((e) => card(e, 'piege')).join('') || `<p class="muted">${L('Aucun.', 'None.')}</p>`}</div>
    </section>`;
  }

  // ---------- Données dynamiques ----------

  observe() {
    this.io?.disconnect();
    const rows = this.el.querySelectorAll('tr[data-id]:not([data-locked])');
    if (!rows.length) return;
    if (!('IntersectionObserver' in window)) {
      this.entries().forEach((e) => this.load(e));
      return;
    }
    this.io = new IntersectionObserver((items) => {
      for (const it of items) {
        if (!it.isIntersecting) continue;
        const e = this.data.entries.find((x) => x.id === it.target.dataset.id);
        if (e) this.load(e);
        this.io.unobserve(it.target);
      }
    }, { rootMargin: '200px' });
    rows.forEach((tr) => this.io.observe(tr));
  }

  load(e) {
    if (!canOpenFiche(e.id)) return; // fiche Pro verrouillée : aucune requête
    if (this.live.has(e.id)) return;
    const gen = this.generation;
    const hasToken = !!this.client.explorerMode();
    const st = { cloud: { status: 'loading' }, explorer: hasToken ? { status: 'loading' } : { status: 'notoken' }, masters: hasToken ? { status: 'loading' } : { status: 'notoken' } };
    this.live.set(e.id, st);
    this.updateRow(e);
    const isStale = () => gen !== this.generation || this.el.classList.contains('hidden');
    const done = (r) => { if (r?.stale) { this.live.delete(e.id); return false; } return gen === this.generation; };
    this.client.cloudEval(e.fenFinale, { isStale }).then((r) => {
      if (!done(r)) return;
      if (r.status === 'absent') st.cloud = { status: 'absent' };
      else {
        const u = r.pvs[0]?.moves[0];
        let san = null;
        try { san = new Chess(e.fenFinale).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san; } catch { /* coup invalide ignoré */ }
        st.cloud = san ? { status: 'ok', score: r.pvs[0].score, depth: r.depth, san } : { status: 'error', error: L('Réponse Cloud Eval invalide', 'Invalid Cloud Eval response') };
      }
      this.updateRow(e);
    }).catch((err) => { if (gen === this.generation) { st.cloud = { status: 'error', error: err.message }; this.updateRow(e); } });
    if (!hasToken) return;
    const f = this.getFilter();
    this.client.explorer({ fen: START_FEN, play: e.uci, ratings: f.ratings, speeds: f.speeds, moves: 1, isStale }).then((r) => {
      if (!done(r)) return;
      st.explorer = { status: 'ok', stats: r.stats };
      this.updateRow(e);
    }).catch((err) => { if (gen === this.generation) { st.explorer = { status: 'error', error: err.message }; this.updateRow(e); } });
    this.client.explorer({ fen: START_FEN, play: e.uci, db: 'masters', moves: 1, isStale }).then((r) => {
      if (!done(r)) return;
      st.masters = { status: 'ok', stats: r.stats };
      this.updateRow(e);
    }).catch((err) => { if (gen === this.generation) { st.masters = { status: 'error', error: err.message }; this.updateRow(e); } });
  }

  updateRow(e) {
    const tr = this.el.querySelector(`tr[data-id="${e.id}"]`);
    if (!tr) return;
    const live = this.live.get(e.id) || {};
    // Ligne verrouillée (formule gratuite) : pas de cellules à mettre à jour.
    const ev = tr.querySelector('[data-label=\"Évaluation\"]');
    const st = tr.querySelector('[data-label=\"Statistiques\"]');
    if (ev) ev.innerHTML = this.evalCell(e, live);
    if (st) st.innerHTML = this.statsCell(live, e);
    if (this.sort && this.sort !== 'eval') {
      clearTimeout(this.sortTimer);
      this.sortTimer = setTimeout(() => {
        const list = this.entries();
        const box = this.el.querySelector('[data-ranking]');
        if (box) box.innerHTML = this.rankingHtml(list);
        const order = [...this.el.querySelectorAll('.rep-table tbody tr[data-id]')].map((r) => r.dataset.id).join();
        if (!this.sortPending(list) && order !== list.map((x) => x.id).join()) this.renderResults();
      }, 200);
    }
  }

  // ---------- Arbre dynamique ----------

  treeHtml() {
    const src = this.treeSource;
    const toggle = `<div class="seg"><button type="button" data-tree-src="niveau" aria-selected="${src === 'niveau'}">${L('Mon niveau', 'My level')}</button><button type="button" data-tree-src="maitres" aria-selected="${src === 'maitres'}">${L('Maîtres', 'Masters')}</button><button type="button" data-tree-src="elite" aria-selected="${src === 'elite'}">${L('Élite blitz/rapide', 'Elite blitz/rapid')}</button></div>`;
    const titre = `<h2>${L('Arbre des coups joués', 'Tree of played moves')}</h2>`;
    if (!this.tree) {
      return `${titre}${toggle}<p class="muted small">${L('Touchez « Arbre des coups joués » sur une fiche, ou', 'Tap “Tree of played moves” on a line, or')} <button type="button" class="link-btn" data-tree-root>${L('partez de la racine du répertoire', 'start from the root of the repertoire')}</button>${L(', pour explorer tous les coups réellement joués — à votre niveau (coups loufoques compris), chez les maîtres ou chez les meilleurs joueurs blitz/rapide en ligne.', ', to explore every move actually played — at your level (odd moves included), among masters or among the best online blitz/rapid players.')}</p>`;
    }
    const t = this.tree;
    const c = new Chess();
    const moves = t.path.map((u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }));
    const crumbs = moves.map((m, i) => `<button type="button" class="link-btn" data-crumb="${i + 1}">${esc((i % 2 === 0 ? `${i / 2 + 1}. ` : '') + sanFr(m.san))}</button>`).join(' ');
    const turn = c.turn();
    let body = '';
    const n = t.node;
    if (!n || n.status === 'loading') body = `<p class="state"><span class="spinner"></span> ${L('Chargement…', 'Loading…')}</p>`;
    else if (n.status === 'notoken') body = `<p class="muted">${L('Jeton Lichess requis (⚙ Réglages) pour l’Opening Explorer.', 'Lichess token required (⚙ Settings) for the Opening Explorer.')}</p>`;
    else if (n.status === 'unavailable') body = `<p class="muted">${L(`Jeu de données Élite non publié sur ce site (${esc(n.error)}).`, `Elite dataset not published on this site (${esc(n.error)}).`)}</p>`;
    else if (n.status === 'nocamp') body = `<p class="muted elite-absent">${esc(NOCAMP_TEXT)}</p>`;
    else if (n.status === 'absent') body = `<p class="muted elite-absent">${esc(absentText(n.meta, n.camp))}</p>`;
    else if (n.status === 'error') body = `<p class="errbox">${esc(n.error)}</p>`;
    else {
      const known = this.knownChildren(t.path);
      const rows = n.moves.map((m) => {
        const s = m.stats;
        const tag = known.get(m.uci);
        return `<tr>
          <td><button type="button" class="link-btn" data-child="${m.uci}">${esc(sanFr(m.san))}</button>${tag ? ` <span class="badge tiny" title="${esc(tag)}">${L('fiche', 'line')}</span>` : ''}</td>
          <td class="num">${s.total.toLocaleString(LOC())}</td>
          <td>${bar(s)}<span class="tiny">${p1(s.white)} / ${p1(s.draws)} / ${p1(s.black)}</span></td>
          <td class="num">${p1(m.win)}</td>
        </tr>`;
      }).join('');
      const res = (g) => (g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½');
      let games = src === 'maitres' && n.games?.length
        ? `<details class="master-games" open><summary>${L('Parties de référence de maîtres', 'Masters’ reference games')} (${n.games.length})</summary><ul>${n.games.map((g) => `<li><button type="button" class="link-btn" data-master="${esc(g.id)}">${esc(g.white.name)} (${g.white.rating}) – ${esc(g.black.name)} (${g.black.rating})</button> <span class="muted small">${res(g)}, ${esc(String(g.year))}</span></li>`).join('')}</ul></details>` : '';
      if (src === 'elite' && n.games?.length) {
        games = `<details class="master-games elite-games" open><summary>${L('Parties exemples du top', 'Example games from the top')} (${n.games.length})</summary><ul>${n.games.map((g, i) => `<li><button type="button" class="link-btn" data-elite-game="${i}">${esc(g.label)}</button> <span class="muted small">${esc(g.r.replace('1/2-1/2', '½-½'))}, ${esc(String(g.y))} · ${esc(g.platform)} ${esc(SPEED_LABELS[g.s] || g.s)}</span> <a class="tiny" href="${esc(g.url)}" target="_blank" rel="noopener" title="${L(`Voir la partie sur ${esc(g.platform)}`, `View the game on ${esc(g.platform)}`)}">↗</a></li>`).join('')}</ul></details>`;
      }
      const who = { niveau: L('à votre niveau', 'at your level'), maitres: L('de maîtres', 'by masters'), elite: L(`du top blitz/rapide (${esc(splitText(n.split))})`, `from the blitz/rapid top (${esc(splitText(n.split))})`) }[src];
      body = `${n.opening ? `<p class="small"><span class="badge eco">${esc(n.opening.eco)}</span> ${esc(n.opening.name)}</p>` : ''}
        <p class="muted small">${L(`${n.total.toLocaleString(LOC())} parties ${who} · trait aux ${turn === 'w' ? 'Blancs' : 'Noirs'}`, `${n.total.toLocaleString('en-US')} games ${who} · ${camp(turn)} to move`)}</p>
        ${src === 'elite' ? `<p class="muted tiny">${L('Fréquences observées chez les meilleurs joueurs en ligne, pas une évaluation moteur.', 'Observed frequencies among the best online players, not an engine evaluation.')} ${esc(eliteSummary(n.meta))}</p>` : ''}
        <table class="tree-table"><thead><tr><th>${L('Coup', 'Move')}</th><th>${L('Parties', 'Games')}</th><th>${L('Blancs / nulles / Noirs', 'White / draws / Black')}</th><th>${L(`% victoire ${turn === 'w' ? 'Blancs' : 'Noirs'}`, `${camp(turn)} win %`)}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">${L(`Aucun coup joué ici ${{ niveau: 'avec ce filtre', maitres: 'par les maîtres', elite: 'dans le jeu Élite' }[src]}.`, `No move played here ${{ niveau: 'with this filter', maitres: 'by masters', elite: 'in the Elite dataset' }[src]}.`)}</td></tr>`}</tbody></table>${games}`;
    }
    return `${titre}${toggle}
      <p class="crumbs"><button type="button" class="link-btn" data-crumb="0">${L('Départ', 'Start')}</button> ${crumbs}</p>
      ${body}
      <p class="muted small">${L('« fiche » : coup couvert par une fiche du répertoire. Coups validés par chess.js avant affichage.', '“line”: move covered by a repertoire line. Moves validated by chess.js before display.')}</p>`;
  }

  knownChildren(path) {
    const out = new Map();
    const lines = [];
    for (const e of this.data.entries) {
      lines.push([e.uci, e.nom]);
      if (e.punition) lines.push([e.punition.uci, `${e.nom} (${L('punition', 'punishment')})`]);
      if (e.piege) lines.push([e.piege.uci, `${e.nom} (${L('piège', 'trap')})`]);
    }
    for (const [uci, nom] of lines) {
      if (uci.length > path.length && path.every((u, i) => uci[i] === u) && !out.has(uci[path.length])) out.set(uci[path.length], nom);
    }
    return out;
  }

  openTree(path, rep = this.tree?.rep) {
    const gen = this.generation;
    const src = this.treeSource;
    this.tree = { path, rep, source: src, node: { status: 'loading' } };
    this.renderTree();
    if (src === 'elite') {
      // Lecture locale du fichier Élite (rechargé à la fin du chargement s'il est en cours).
      const el = this.elite;
      if (el.status === 'loading') return;
      if (el.status !== 'ok') this.tree.node = el;
      else {
        const c = new Chess();
        path.forEach((u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }));
        const x = lookupElite(el.data, c.fen(), { camp: !!loadSettings().eliteCamp, side: REPERTOIRES[this.tree.rep]?.couleur || 'w' });
        this.tree.node = { ...x, meta: el.data.meta };
      }
      this.renderTree();
      return;
    }
    if (!this.client.explorerMode()) {
      this.tree.node = { status: 'notoken' };
      this.renderTree();
      return;
    }
    const f = this.getFilter();
    const isStale = () => this.tree?.path !== path || gen !== this.generation || this.treeSource !== src;
    const q = src === 'maitres'
      ? { db: 'masters', topGames: 8 }
      : { ratings: f.ratings, speeds: f.speeds };
    this.client.explorer({ fen: START_FEN, play: path, moves: 30, isStale, ...q }).then((r) => {
      if (r.stale || isStale()) return;
      const c = new Chess();
      path.forEach((u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }));
      const fen = c.fen();
      const legal = (u) => { try { new Chess(fen).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); return true; } catch { return false; } };
      this.tree.node = { status: 'ok', moves: enrichMoves(r.moves.filter((m) => legal(m.uci)), c.turn()), total: r.stats.total, opening: r.opening, games: r.topGames || [] };
      this.renderTree();
    }).catch((err) => {
      if (isStale()) return;
      this.tree.node = { status: 'error', error: err.message };
      this.renderTree();
    });
  }

  // ---------- Nouvelles parties du top (jeu Élite) ----------

  liveHtml() {
    const el = this.elite;
    const head = `<h2>🔴 ${L('Nouvelles parties du top', 'New games from the top')}</h2>`;
    if (el.status === 'loading') return `${head}<p class="state small"><span class="spinner"></span> ${L('Chargement…', 'Loading…')}</p>`;
    if (el.status !== 'ok') return `${head}<p class="muted small">${L('Jeu de données Élite non publié sur ce site.', 'Elite dataset not published on this site.')}</p>`;
    // Parties du top limitées aux ouvertures choisies dont les données Élite sont collectées.
    const suivis = this.data.choisis.filter((id) => REPERTOIRES[id]?.elite);
    if (!suivis.length) return `${head}<p class="muted small">${L(`Données Élite pas encore collectées pour vos ouvertures (${esc(this.data.choisis.map((id) => REPERTOIRES[id].titre).join(', '))}).`, `Elite data not yet collected for your openings (${esc(this.data.choisis.map((id) => REPERTOIRES[id].titre).join(', '))}).`)}</p>`;
    const list = recentInfo(el.data).filter((g) => suivis.includes(g.rep));
    this.liveList = list; // le numéro des boutons renvoie à CETTE liste filtrée
    const rows = list.map((g, i) => `<li>
        <span class="tiny live-when" title="${esc(new Date(g.t).toLocaleString(LOC()))}">${esc(ago(g.t))}</span>
        <button type="button" class="link-btn" data-live-game="${i}">${esc(g.label)}</button>
        <span class="muted small">${esc(g.r.replace('1/2-1/2', '½-½'))} · ${esc(g.platform)} ${esc(SPEED_LABELS[g.s] || g.s)}${g.opening ? ` · ${esc(g.opening)}` : ''}</span>
        <a class="tiny" href="${esc(g.url)}" target="_blank" rel="noopener" title="${L(`Voir la partie sur ${esc(g.platform)}`, `View the game on ${esc(g.platform)}`)}">↗</a></li>`).join('');
    return `${head}
      <p class="muted tiny">${esc(eliteSummary(el.data.meta))} ${L(`Dernières parties des 50 meilleurs joueurs blitz/rapide de Lichess et Chess.com qui atteignent votre répertoire (${esc(suivis.map((id) => REPERTOIRES[id].titre).join(' ou '))}, quel que soit l’ordre des coups) ; une partie apparaît au passage suivant sa fin (≈ toutes les 30 min, parfois plus tard).`, `Latest games of the 50 best blitz/rapid players on Lichess and Chess.com that reach your repertoire (${esc(suivis.map((id) => REPERTOIRES[id].titre).join(' or '))}, whatever the move order); a game appears on the next run after it ends (≈ every 30 min, sometimes later).`)}</p>
      ${rows ? `<ul class="live-list">${rows}</ul>` : `<p class="muted small">${L('Aucune partie récente dans le jeu de données.', 'No recent game in the dataset.')}</p>`}
      <p class="muted tiny">${L('Toucher une partie l’ouvre sur l’échiquier (votre partie actuelle est sauvegardée).', 'Tapping a game opens it on the board (your current game is saved).')}</p>`;
  }

  renderLive() {
    const el = this.el.querySelector('#rep-live');
    if (!el) return;
    el.innerHTML = this.liveHtml();
    this.bindLive(el);
  }

  bindLive(el) {
    el.querySelectorAll('[data-live-game]').forEach((b) => b.addEventListener('click', () => {
      const g = (this.liveList || [])[Number(b.dataset.liveGame)];
      if (g) this.openGame?.(g.san, g.color, L(`la partie ${g.label}`, `the game ${g.label}`), eliteHeaders(g));
    }));
  }

  renderTree() {
    const el = this.el.querySelector('#rep-tree');
    if (!el) return;
    el.innerHTML = this.treeHtml();
    this.bindTree(el);
  }

  // ---------- Vidéos ----------

  async openVideos(id, lang = this.videoLang) {
    const e = this.data.entries.find((x) => x.id === id);
    const dlg = this.el.querySelector('[data-video-dlg]');
    this.videoLang = lang;
    const head = `<div class="vd-head"><h2>${L('Vidéos :', 'Videos:')} ${esc(e.nom)}</h2><button type="button" class="icon-btn" data-vclose aria-label="${L('Fermer', 'Close')}">✕</button></div>
      ${e.video?.liens?.length ? `<h3 class="small">${L('Sélection vérifiée', 'Verified selection')}</h3>${curatedVideosHtml(e, 'vd-curated vd-curated-dlg')}<h3 class="small">${L('Recherche par langue', 'Search by language')}</h3>` : ''}
      <div class="chips">${Object.entries(LANGS).map(([k, l]) => `<button type="button" class="chip" data-vlang="${k}" aria-pressed="${k === lang}">${esc(l.label)}</button>`).join('')}</div>`;
    const render = (body) => {
      dlg.innerHTML = `${head}${body}<p class="muted tiny">${L('L’application trouve et classe les vidéos ; elle ne les regarde pas. Pour garder un passage précis, utilisez « ⏱ Garder ce passage ».', 'The app finds and sorts videos; it does not watch them. To keep an exact moment, use “⏱ Keep this moment”.')}</p>`;
      dlg.querySelector('[data-vclose]').onclick = () => dlg.close();
      dlg.querySelectorAll('[data-vlang]').forEach((b) => { b.onclick = () => this.openVideos(id, b.dataset.vlang); });
      dlg.querySelectorAll('[data-vkeep]').forEach((b) => { b.onclick = () => this.keepVideo(id, `https://www.youtube.com/watch?v=${b.dataset.vkeep}`); });
    };
    if (!dlg.open) dlg.showModal();
    if (!this.youtube?.hasKey()) {
      render(`<p class="small">${L('Sans clé API YouTube, l’application ouvre une recherche YouTube dans la langue choisie :', 'Without a YouTube API key, the app opens a YouTube search in the chosen language:')}</p>
        <p><a class="primary-link" href="${esc(searchLink(e, lang))}" target="_blank" rel="noopener">▶ ${L(`Rechercher « ${esc(e.nom)} » en ${esc(LANGS[lang].label)}`, `Search “${esc(e.nom)}” in ${esc(LANGS[lang].label)}`)}</a></p>
        <p class="muted small">${L('Avec une clé gratuite (⚙ Réglages → Clé API YouTube), la liste des vidéos s’affiche ici avec chaîne, durée et vues.', 'With a free key (⚙ Settings → YouTube API key), the list of videos is shown here with channel, length and views.')}</p>`);
      return;
    }
    render(`<p class="state"><span class="spinner"></span> ${L('Recherche des vidéos…', 'Searching videos…')}</p>`);
    try {
      const items = await this.youtube.search(e, lang);
      if (this.videoLang !== lang || !dlg.open) return;
      render(items.length ? `<ul class="vd-list">${items.map((it) => `<li>
          <a href="https://www.youtube.com/watch?v=${esc(it.id)}" target="_blank" rel="noopener" class="vd-thumb">${it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy">` : ''}</a>
          <div><a href="https://www.youtube.com/watch?v=${esc(it.id)}" target="_blank" rel="noopener" class="vd-title">${esc(decodeEntities(it.title))}</a>
          <div class="muted tiny">${esc(decodeEntities(it.channel))}${it.duration ? ` · ${esc(it.duration)}` : ''}${it.views ? ` · ${it.views.toLocaleString(LOC())} ${L('vues', 'views')}` : ''}${it.published ? ` · ${esc(it.published)}` : ''}</div>
          <button type="button" class="link-btn tiny" data-vkeep="${esc(it.id)}">⏱ ${L('Garder ce passage', 'Keep this moment')}</button></div></li>`).join('')}</ul>`
        : `<p class="muted">${L(`Aucune vidéo trouvée en ${esc(LANGS[lang].label)}.`, `No video found in ${esc(LANGS[lang].label)}.`)} <a href="${esc(searchLink(e, lang))}" target="_blank" rel="noopener">${L('Recherche YouTube', 'YouTube search')}</a></p>`);
    } catch (err) {
      render(`<p class="errbox">${esc(err.message)}</p><p><a href="${esc(searchLink(e, lang))}" target="_blank" rel="noopener">${L('Rechercher directement sur YouTube', 'Search directly on YouTube')}</a></p>`);
    }
  }

  keepVideo(id, url) {
    const time = window.prompt(L('Moment précis à garder (mm:ss, hh:mm:ss ou secondes ; vide = début) :', 'Exact moment to keep (mm:ss, hh:mm:ss or seconds; empty = start):'), '');
    if (time === null) return;
    const link = buildVideoLink(url, time);
    if (!link) { window.alert(L('Horodatage non reconnu.', 'Timestamp not recognised.')); return; }
    this.videos[id] = link;
    saveVideos(this.videos);
    this.el.querySelector('[data-video-dlg]').close();
    this.render();
  }

  addVideo(id) {
    const url = window.prompt(L('Adresse de la vidéo YouTube (youtube.com/watch?v=… ou youtu.be/…) :', 'YouTube video address (youtube.com/watch?v=… or youtu.be/…):'));
    if (!url) return;
    const time = window.prompt(L('Moment précis (mm:ss, hh:mm:ss ou secondes ; laisser vide pour le début) :', 'Exact moment (mm:ss, hh:mm:ss or seconds; leave empty for the start):'), '');
    const link = buildVideoLink(url, time);
    if (!link) { window.alert(L('Adresse ou horodatage non reconnu.', 'Address or timestamp not recognised.')); return; }
    this.videos[id] = link;
    saveVideos(this.videos);
    this.render();
  }

  // ---------- Export ----------

  exportPgn(which) {
    const d = this.data;
    const pgn = repertoireToPgn(d.entries, d.repertoires, which === 'all' ? null : which);
    const name = { gd: 'repertoire-gambit-dame', ck: 'repertoire-caro-kann', all: 'repertoire-complet' }[which] || `repertoire-${which}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
    a.download = `${name}.pgn`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    navigator.clipboard?.writeText(pgn).catch(() => {});
    this.lastExport = pgn;
  }

  // ---------- Événements ----------

  test(id, kind = null) {
    const e = this.data.entries.find((x) => x.id === id);
    const color = this.data.repertoires[e.rep].couleur;
    const san = kind ? e[kind].san : e.san;
    const label = kind ? `${e.nom} (${kind === 'punition' ? L('punition', 'punishment') : L('piège', 'trap')})` : e.nom;
    this.openSan(san, color, label);
  }

  bind() {
    this.el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { this.view = b.dataset.view; this.render(); }));
    this.el.querySelectorAll('[data-badge-chip]').forEach((b) => b.addEventListener('click', () => { this.badge = b.dataset.badgeChip; this.render(); }));
    this.el.querySelector('[data-sort]')?.addEventListener('change', (ev) => { this.sort = ev.target.value; this.render(); });
    this.el.querySelector('[data-ranking]').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-goto]');
      if (b) this.el.querySelector(`tr[data-id="${b.dataset.goto}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    this.el.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => this.exportPgn(b.dataset.export)));
    const q = this.el.querySelector('[data-q]');
    // Index des joueurs chargé à la demande (première saisie) : suggestions et parties par nom.
    const wantPlayers = () => {
      if (this.joueurs) return;
      this.joueurs = { status: 'loading' };
      loadJoueurs().then((r) => {
        this.joueurs = r;
        const dl = this.el.querySelector('#rep-joueurs');
        if (dl) dl.innerHTML = datalistHtml(r, this.query);
        const sec = this.el.querySelector('#rep-players');
        if (sec) {
          sec.innerHTML = playersSectionHtml(r, this.query, this.entries().length);
          bindPlayers(sec, r, this.openGame);
        }
      });
    };
    q.addEventListener('focus', wantPlayers);
    if (this.query) wantPlayers();
    bindPlayers(this.el.querySelector('#rep-players'), this.joueurs, this.openGame);
    q.addEventListener('input', () => {
      clearTimeout(this.qTimer);
      this.qTimer = setTimeout(() => {
        this.query = q.value;
        this.renderResults();
      }, 300);
    });
    // Délégation sur le conteneur des résultats : reste valable après renderResults().
    this.el.querySelector('[data-results]').addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const entry = (id) => this.data.entries.find((x) => x.id === id);
      if (b.dataset.badgeFilter) {
        this.badge = b.dataset.badgeFilter;
        this.render();
        this.el.querySelector('.rep-head').scrollIntoView({ block: 'start' });
        return;
      }
      if (b.dataset.test) this.test(b.dataset.test);
      if (b.dataset.testClaim) { const [id, kind] = b.dataset.testClaim.split(':'); this.test(id, kind); }
      if (b.dataset.goto) {
        const e = entry(b.dataset.goto);
        this.view = e.rep; this.badge = ''; this.query = e.id;
        this.render();
      }
      if (b.dataset.tree) {
        this.openTree(entry(b.dataset.tree).uci, entry(b.dataset.tree).rep);
        this.el.querySelector('#rep-tree').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (b.dataset.videos) this.openVideos(b.dataset.videos);
      if (b.dataset.videoAdd) this.addVideo(b.dataset.videoAdd);
      if (b.dataset.videoDel) {
        delete this.videos[b.dataset.videoDel];
        saveVideos(this.videos);
        this.render();
      }
    });
    this.bindTree(this.el.querySelector('#rep-tree'));
    this.bindLive(this.el.querySelector('#rep-live'));
  }

  // Règle de couleur changée dans ⚙ Réglages : lignes Élite et arbre relus (fichier déjà chargé).
  refreshElite() {
    this.render();
    if (this.tree && this.treeSource === 'elite') this.openTree(this.tree.path);
  }

  bindTree(el) {
    const root = () => racineUci(this.repVue());
    el.querySelector('[data-tree-root]')?.addEventListener('click', () => this.openTree(root()));
    el.querySelectorAll('[data-tree-src]').forEach((b) => b.addEventListener('click', () => {
      this.treeSource = b.dataset.treeSrc;
      if (this.tree) this.openTree(this.tree.path); else this.renderTree();
    }));
    el.querySelectorAll('[data-child]').forEach((b) => b.addEventListener('click', () => this.openTree([...this.tree.path, b.dataset.child])));
    el.querySelectorAll('[data-crumb]').forEach((b) => b.addEventListener('click', () => this.openTree(this.tree.path.slice(0, Number(b.dataset.crumb)))));
    el.querySelectorAll('[data-master]').forEach((b) => b.addEventListener('click', () => {
      const color = couleurDe(this.repVue());
      this.openMaster(b.dataset.master, color);
    }));
    el.querySelectorAll('[data-elite-game]').forEach((b) => b.addEventListener('click', () => {
      const g = this.tree?.node?.games?.[Number(b.dataset.eliteGame)];
      if (g) this.openGame?.(g.san, couleurDe(this.repVue()), L(`la partie ${g.label}`, `the game ${g.label}`), eliteHeaders(g));
    }));
  }
}
