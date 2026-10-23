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
import { loadElite, lookupElite, eliteSummary, absentText, splitText, eliteHeaders, recentInfo, ago } from './elite.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p1 = (x) => x.toFixed(1).replace('.', ',') + ' %';
const SCORE_MIN_GAMES = 50; // en dessous, un % de score ne veut rien dire
const VIDEO_KEY = 'coach-echecs:videos-perso';
const BADGE_CLASS = { theorie: 'b-theorie', piege: 'b-piege', loufoque: 'b-loufoque' };
const BADGE_LABEL = { theorie: 'Théorie', piege: 'Piège Blitz', loufoque: 'Coup loufoque à réfuter' };

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
    if (i === markIndex) t = `<mark title="Coup fautif">${t} ?</mark>`;
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
  if (v.mated) return 'Mat';
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
    const at = debut ? ` · dès ${Math.floor(debut / 60)}:${String(debut % 60).padStart(2, '0')}` : '';
    return `<div class="small"><a class="btn-link" href="${esc(l.url)}" target="_blank" rel="noopener"${l.chapitre ? ` title="Chapitre : ${esc(l.chapitre)}"` : ''}>▶ ${esc(l.titre)}</a> <span class="muted tiny">(${l.chaine ? `${esc(l.chaine)}, ` : ''}${esc(String(l.langue).toUpperCase())}${at})</span></div>`;
  }).join('')}</div>`;
}
function loadVideos() { try { return JSON.parse(localStorage.getItem(VIDEO_KEY) || '{}'); } catch { return {}; } }
function saveVideos(v) { try { localStorage.setItem(VIDEO_KEY, JSON.stringify(v)); } catch { /* stockage indisponible */ } }

const bar = (s) => `<div class="wdl-bar" title="Blancs ${p1(s.white)} · nulles ${p1(s.draws)} · Noirs ${p1(s.black)}"><span class="w" style="width:${s.white}%"></span><span class="d" style="width:${s.draws}%"></span><span class="b" style="width:${s.black}%"></span></div>`;

export class RepertoirePage {
  constructor({ el, client, getFilter, openSan, openMaster, openGame = null, youtube, loadEliteData = loadElite }) {
    this.el = el;
    this.client = client;
    this.getFilter = getFilter;
    this.openSan = openSan;
    this.openMaster = openMaster;
    this.openGame = openGame;
    this.youtube = youtube;
    this.loadEliteData = loadEliteData;
    this.elite = { status: 'loading' }; // jeu Élite (branche donnees-elite ou data/elite.json)
    this.data = null;
    this.view = 'gd'; // 'gd' | 'ck' | 'trash'
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
      this.el.innerHTML = '<p class="state pad"><span class="spinner"></span> Chargement du répertoire…</p>';
      try {
        this.data = await (await fetch('./data/repertoire.json', { cache: 'no-cache' })).json();
      } catch {
        this.el.innerHTML = '<p class="errbox pad">Impossible de charger le répertoire (data/repertoire.json).</p>';
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
    if (!this.client.explorerMode() && this.sort !== 'eval') return '<p class="errbox small">Classement par parties : jeton Lichess requis (⚙ Réglages).</p>';
    const pending = this.sortPending(list);
    if (pending) return `<p class="state small"><span class="spinner"></span> Classement : statistiques en cours de chargement (${list.length - pending}/${list.length})…</p>`;
    const src = this.sort.endsWith('maitres') ? 'maîtres' : 'mon niveau';
    const name = (e) => `<button type="button" class="link-btn" data-goto="${e.id}">${esc(e.nom)}</button>`;
    if (this.sort === 'eval') {
      const top = list.filter((e) => this.sortValue(e) != null).slice(0, 3);
      return `<div class="card ranking small"><strong>Meilleure évaluation Stockfish pour vous</strong> (fin de la ligne, profondeur ${this.data.moteur.profondeur}) : ${top.map((e) => `${name(e)} (${esc(scoreText(toWhite(e.verification.main, 'w')))})`).join(' · ')}<p class="muted tiny">Évaluation de la position à la fin de la fiche, point de vue des Blancs. Une évaluation moteur n’est pas un taux de victoire.</p></div>`;
    }
    const withStats = list.map((e) => ({ e, s: this.sortStats(e) })).filter((x) => x.s?.total);
    if (!withStats.length) return `<p class="muted small">Aucune statistique (${src}) pour ces fiches.</p>`;
    const most = withStats.reduce((a, b) => (b.s.total > a.s.total ? b : a));
    const scored = withStats.filter((x) => x.s.total >= SCORE_MIN_GAMES);
    const best = scored.length ? scored.reduce((a, b) => (this.myScore(b.e, b.s) > this.myScore(a.e, a.s) ? b : a)) : null;
    const worst = scored.length ? scored.reduce((a, b) => (this.myScore(b.e, b.s) < this.myScore(a.e, a.s) ? b : a)) : null;
    return `<div class="card ranking small">
      <div>📊 <strong>La plus jouée</strong> (${src}) : ${name(most.e)} — ${most.s.total.toLocaleString('fr-FR')} parties</div>
      ${best ? `<div>🏆 <strong>Meilleur score pour vous</strong> : ${name(best.e)} — ${p1(this.myScore(best.e, best.s))} (${best.s.total.toLocaleString('fr-FR')} parties)</div>` : ''}
      ${worst && worst !== best ? `<div>⚠️ <strong>Score le plus faible</strong> : ${name(worst.e)} — ${p1(this.myScore(worst.e, worst.s))}</div>` : ''}
      <p class="muted tiny">Score = victoires + ½ nulles pour votre camp, dans les parties qui ont atteint la position finale de la fiche (au moins ${SCORE_MIN_GAMES} parties pour le score). Fréquences observées, pas une évaluation.</p>
    </div>`;
  }

  // ---------- Rendu ----------

  render() {
    const d = this.data;
    const f = this.getFilter();
    const filt = `${f.speeds.map((s) => SPEED_LABELS[s]).join(', ') || 'toutes cadences'} · ${f.ratings.map(bucketLabel).join(', ') || 'tous classements'}`;
    const list = this.entries();
    const count = (pred) => d.entries.filter(pred).length;
    const chip = (attr, val, cur, label, n) => `<button type="button" class="chip" ${attr}="${val}" aria-pressed="${cur === val}">${label}${n != null ? ` <span class="chip-n">${n}</span>` : ''}</button>`;
    this.el.innerHTML = `
      <div class="rep-head">
        <div class="chips" aria-label="Ouverture">
          ${chip('data-view', 'gd', this.view, '♙ Gambit Dame <span class="muted small">(Blancs)</span>', count((e) => e.rep === 'gd'))}
          ${chip('data-view', 'ck', this.view, '♟ Caro-Kann <span class="muted small">(Noirs)</span>', count((e) => e.rep === 'ck'))}
          ${chip('data-view', 'trash', this.view, '🗑 Anti-trash Blitz', count((e) => e.punition || e.piege || e.badge === 'loufoque'))}
        </div>
        <div class="chips" aria-label="Type de ligne">
          ${chip('data-badge-chip', '', this.badge, 'Tous types')}
          ${chip('data-badge-chip', 'theorie', this.badge, 'Théorie')}
          ${chip('data-badge-chip', 'piege', this.badge, 'Piège Blitz')}
          ${chip('data-badge-chip', 'loufoque', this.badge, 'Coup loufoque')}
        </div>
        <div class="rep-filters">
          <input type="search" data-q list="rep-joueurs" placeholder="Rechercher : nom, coup (Fg4, Bg4, 2…Fg4), code ECO (B12) ou joueur (Carlsen)" value="${esc(this.query)}">
          <datalist id="rep-joueurs">${datalistHtml(this.joueurs, this.query)}</datalist>
          ${this.view === 'trash' ? '' : `<select data-sort aria-label="Classer les variantes">
            ${[['', 'Ordre du répertoire'], ['joue-niveau', 'Les plus jouées (mon niveau)'], ['score-niveau', 'Meilleur score pour moi (mon niveau)'], ['joue-maitres', 'Les plus jouées (maîtres)'], ['score-maitres', 'Meilleur score pour moi (maîtres)'], ['eval', 'Meilleure évaluation Stockfish']].map(([v, l]) => `<option value="${v}"${this.sort === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>`}
          <details class="export-menu"><summary>⤓ Exporter en PGN</summary>
            <div class="export-box">
              <button type="button" data-export="gd">Gambit Dame (${count((e) => e.rep === 'gd')} fiches)</button>
              <button type="button" data-export="ck">Caro-Kann (${count((e) => e.rep === 'ck')} fiches)</button>
              <button type="button" data-export="all">Tout le répertoire</button>
              <p class="muted tiny">Lichess : Étude → « + » (nouveau chapitre) → onglet PGN → coller ou importer le fichier (64 chapitres max par étude : un fichier par ouverture). Chess.com : Analyse → Importer PGN. Les punitions et pièges sont inclus en variantes commentées.</p>
            </div>
          </details>
        </div>
        <p class="small muted"><span data-count>${list.length} fiche(s) affichée(s).</span> Statistiques « mon niveau » : ${esc(filt)} (réglable dans « Coup optimal ») ; « maîtres » : joueurs titrés 2200+ FIDE ; « Élite » : parties blitz/rapide des meilleurs joueurs Lichess et Chess.com (fréquences observées, pas une évaluation). Évaluations vérifiées : ${esc(d.moteur.nom)}, profondeur ${d.moteur.profondeur}. Codes ECO et noms : base Lichess chess-openings (CC0) ; il n’existe pas de nomenclature FIDE officielle des variantes.</p>
      </div>
      <div data-ranking>${this.rankingHtml(list)}</div>
      <section id="rep-players">${playersSectionHtml(this.joueurs, this.query, list.length)}</section>
      <div data-results>${this.view === 'trash' ? this.trashHtml(list) : this.tableHtml(list)}</div>
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
    this.el.querySelector('[data-count]').textContent = `${list.length} fiche(s) affichée(s).`;
    this.el.querySelector('[data-ranking]').innerHTML = this.rankingHtml(list);
    const sec = this.el.querySelector('#rep-players');
    sec.innerHTML = playersSectionHtml(this.joueurs, this.query, list.length);
    bindPlayers(sec, this.joueurs, this.openGame);
    this.el.querySelector('[data-results]').innerHTML = this.view === 'trash' ? this.trashHtml(list) : this.tableHtml(list);
    const dl = this.el.querySelector('#rep-joueurs');
    if (dl) dl.innerHTML = datalistHtml(this.joueurs, this.query);
    this.observe();
    if (this.sort && this.sort !== 'eval' && this.view !== 'trash') list.forEach((e) => this.load(e));
  }

  tableHtml(list) {
    return `<div class="rep-table-wrap">
      <table class="rep-table">
        <thead><tr>
          <th>ECO · Nom</th><th>Séquence</th><th>Évaluation</th><th>Statistiques</th><th>Plan & structure</th>
          <th>Punition tactique</th><th>Piège à éviter</th><th>Cases & pièces</th><th>Vidéo</th>
        </tr></thead>
        <tbody>${list.map((e) => this.row(e)).join('') || '<tr><td colspan="9" class="muted">Aucune fiche pour ce filtre.</td></tr>'}</tbody>
      </table>
    </div>`;
  }

  row(e) {
    const v = e.verification;
    const live = this.live.get(e.id) || {};
    const color = this.data.repertoires[e.rep].couleur;
    return `<tr data-id="${e.id}">
      <td data-label="ECO · Nom">
        <span class="badge eco">${esc(e.eco)}</span> <button type="button" class="badge badge-btn ${BADGE_CLASS[e.badge]}" data-badge-filter="${e.badge}" title="Afficher toutes les fiches de ce type">${esc(BADGE_LABEL[e.badge])}</button>
        <div class="rep-name">${esc(e.nom)}</div>
        <div class="muted tiny">${esc(e.ecoNom)}</div>
        <div class="row-actions">
          <button type="button" class="primary small-btn" data-test="${e.id}">▶ Tester cette ligne</button>
          <button type="button" class="link-btn" data-tree="${e.id}">Arbre des coups joués</button>
        </div>
      </td>
      <td data-label="Séquence" class="line">${esc(sanLine(e.san))}</td>
      <td data-label="Évaluation">${this.evalCell(e, live)}</td>
      <td data-label="Statistiques">${this.statsCell(live, e)}</td>
      <td data-label="Plan & structure"><p class="small">${esc(e.plan)}</p><p class="small"><strong>Structure :</strong> ${esc(e.structure)}</p></td>
      <td data-label="Punition tactique">${this.claimCell(e, 'punition', v?.punition, color)}</td>
      <td data-label="Piège à éviter">${this.claimCell(e, 'piege', v?.piege, color)}</td>
      <td data-label="Cases & pièces" class="small"><p><strong>Cases clés :</strong> ${esc(e.cases)}</p><p><strong>À échanger :</strong> ${esc(e.echanger)}</p><p><strong>À conserver :</strong> ${esc(e.conserver)}</p></td>
      <td data-label="Vidéo">${this.videoCell(e)}</td>
    </tr>`;
  }

  evalCell(e, live) {
    const c = live.cloud;
    let cloud;
    if (!c) cloud = '<span class="muted small">Cloud Eval : en attente</span>';
    else if (c.status === 'loading') cloud = '<span class="state small"><span class="spinner"></span>Cloud Eval…</span>';
    else if (c.status === 'absent') cloud = '<span class="muted small">Cloud Eval : position absente du cache Lichess</span>';
    else if (c.status === 'error') cloud = `<span class="error-text small">${esc(c.error)}</span>`;
    else cloud = `<div><strong>${esc(formatScore(c.score))}</strong> <span class="muted tiny">Cloud Eval, prof. ${c.depth}</span></div><div class="tiny">Meilleur : ${esc(sanFr(c.san))}</div>`;
    const v = e.verification;
    return cloud + (v ? `<div class="small">Stockfish (vérif.) : <strong>${esc(scoreText(toWhite(v.main, v.main.pov)))}</strong></div>` : '');
  }

  statsCell(live, e) {
    const one = (x, label) => {
      if (!x) return `<div class="muted tiny">${label} : en attente</div>`;
      if (x.status === 'loading') return `<div class="state tiny"><span class="spinner"></span>${label}…</div>`;
      if (x.status === 'notoken') return `<div class="muted tiny">${label} : jeton Lichess requis (⚙)</div>`;
      if (x.status === 'error') return `<div class="error-text tiny">${label} : ${esc(x.error)}</div>`;
      const s = x.stats;
      if (!s.total) return `<div class="muted tiny">${label} : aucune partie</div>`;
      return `<div class="stat-line"><span class="tiny"><strong>${label}</strong> · ${s.total.toLocaleString('fr-FR')} parties</span>${bar(s)}<span class="tiny">Blancs ${p1(s.white)} · nulles ${p1(s.draws)} · Noirs ${p1(s.black)}</span></div>`;
    };
    return one(live.explorer, 'Mon niveau') + one(live.masters, 'Maîtres') + this.eliteLine(e.fenFinale);
  }

  // Ligne « Élite » : lue dans le fichier statique, sans requête réseau supplémentaire.
  eliteLine(fen) {
    const el = this.elite;
    const label = 'Élite';
    if (el.status === 'loading') return `<div class="state tiny"><span class="spinner"></span>${label}…</div>`;
    if (el.status !== 'ok') return `<div class="muted tiny">${label} : jeu de données non publié</div>`;
    const x = lookupElite(el.data, fen);
    if (x.status !== 'ok') return `<div class="muted tiny elite-absent">${label} : position absente (aucune partie du top retenue)</div>`;
    const s = x.stats;
    return `<div class="stat-line stat-elite"><span class="tiny"><strong>${label}</strong> · ${s.total.toLocaleString('fr-FR')} parties · ensuite surtout ${esc(sanFr(x.top.san))} (${p1((100 * x.top.stats.total) / x.total)})</span>${bar(s)}<span class="tiny">Blancs ${p1(s.white)} · nulles ${p1(s.draws)} · Noirs ${p1(s.black)} · ${esc(splitText(x.split))}</span></div>`;
  }

  claimCell(e, kind, v, color) {
    const c = e[kind];
    if (!c) return '<span class="muted small">—</span>';
    let verdict = '<span class="badge">non vérifié</span>';
    if (v) {
      const fin = v.final.mated ? (v.final.mated === color ? 'mat contre nous' : 'mat') : formatScore({ type: v.final.type, value: v.final.value });
      verdict = v.ok
        ? `<span class="badge ok" title="Évaluation finale du point de vue de notre camp">✔ Stockfish : ${esc(fin)}</span>`
        : `<span class="badge err">✘ non confirmé (${esc(fin)})</span>`;
    }
    const rest = c.san.slice(c.marked);
    const engineAlt = v && v.afterError?.best && kind === 'punition' && v.afterError.best !== rest[1]
      ? `<div class="muted tiny">Meilleure suite selon le moteur après l’erreur : ${esc(v.afterError.pv.slice(0, 4).map(sanFr).join(' '))}</div>` : '';
    return `<div class="line small">${markedLineHtml(c.san, c.marked)}</div><p class="small">${esc(c.texte)}</p>${verdict}${engineAlt}
      <div><button type="button" class="link-btn small" data-test-claim="${e.id}:${kind}">▶ Tester</button></div>`;
  }

  videoCell(e) {
    const perso = this.videos[e.id];
    const verified = e.video.url && e.video.verifie
      ? `<a class="btn-link" href="${esc(e.video.url)}" target="_blank" rel="noopener">▶ Vidéo (passage précis)</a>` : '';
    const mine = perso
      ? `<a class="btn-link" href="${esc(perso)}" target="_blank" rel="noopener">▶ Mon lien horodaté</a> <button type="button" class="link-btn tiny" data-video-del="${e.id}">retirer</button>`
      : `<button type="button" class="link-btn" data-video-add="${e.id}">+ Ajouter mon lien horodaté</button>`;
    return `${verified}${curatedVideosHtml(e)}<button type="button" class="small-btn" data-videos="${e.id}">🎬 Vidéos (${Object.keys(LANGS).length} langues)</button><div>${mine}</div>`;
  }

  // ---------- Vue Anti-trash ----------

  trashHtml(list) {
    const reps = this.data.repertoires;
    const punitions = list.filter((e) => e.punition);
    const loufoques = list.filter((e) => !e.punition && e.badge === 'loufoque');
    const pieges = list.filter((e) => e.piege);
    const card = (e, kind) => {
      const c = e[kind];
      const v = e.verification?.[kind];
      const color = reps[e.rep].couleur;
      const fin = v ? (v.final.mated ? (v.final.mated === color ? 'mat contre nous' : 'mat') : formatScore({ type: v.final.type, value: v.final.value })) : null;
      const err = c.san[c.marked];
      const no = `${Math.floor(c.marked / 2) + 1}${c.marked % 2 ? '…' : '.'}`;
      return `<article class="card trash-card ${kind}">
        <div class="trash-top"><span class="badge">${esc(reps[e.rep].titre)}</span> <span class="badge eco">${esc(e.eco)}</span> ${v?.ok ? `<span class="badge ok">✔ Stockfish : ${esc(fin)}</span>` : ''}</div>
        <h3>${esc(e.nom)}</h3>
        <p class="trash-move">${kind === 'punition' ? 'Coup adverse' : 'Votre erreur à éviter'} : <mark>${esc(no)} ${esc(sanFr(err))} ?</mark></p>
        <p class="small"><strong>${kind === 'punition' ? 'Réfutation immédiate' : 'Sanction'} :</strong> <span class="line">${markedLineHtml(c.san, -1, c.marked + 1) || '—'}</span></p>
        <p class="small">${esc(c.texte)}</p>
        <div class="actions"><button type="button" class="primary small-btn" data-test-claim="${e.id}:${kind}">▶ Tester</button>
          <button type="button" class="link-btn" data-goto="${e.id}">Voir la fiche</button></div>
      </article>`;
    };
    const plain = (e) => `<article class="card trash-card">
        <div class="trash-top"><span class="badge">${esc(reps[e.rep].titre)}</span> <span class="badge eco">${esc(e.eco)}</span></div>
        <h3>${esc(e.nom)}</h3><p class="small line">${esc(sanLine(e.san))}</p><p class="small">${esc(e.plan)}</p>
        <div class="actions"><button type="button" class="primary small-btn" data-test="${e.id}">▶ Tester</button><button type="button" class="link-btn" data-goto="${e.id}">Voir la fiche</button></div>
      </article>`;
    return `<section class="trash">
      <p class="small">Coups bizarres fréquents en Blitz autour de 1000 Elo : sorties de Dame précoces, gambits douteux, poussées de pions hâtives, et vos propres réflexes perdants. Chaque réfutation est vérifiée par Stockfish.</p>
      <h2>Coups adverses à punir (${punitions.length})</h2><div class="trash-grid">${punitions.map((e) => card(e, 'punition')).join('') || '<p class="muted">Aucun.</p>'}</div>
      ${loufoques.length ? `<h2>Coups atypiques sans réfutation forcée (${loufoques.length})</h2><p class="muted small">Le moteur les juge inférieurs mais sans punition tactique immédiate : jouer simplement le plan indiqué.</p><div class="trash-grid">${loufoques.map(plain).join('')}</div>` : ''}
      <h2>Pièges à ne pas commettre (${pieges.length})</h2><div class="trash-grid">${pieges.map((e) => card(e, 'piege')).join('') || '<p class="muted">Aucun.</p>'}</div>
    </section>`;
  }

  // ---------- Données dynamiques ----------

  observe() {
    this.io?.disconnect();
    const rows = this.el.querySelectorAll('tr[data-id]');
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
        st.cloud = san ? { status: 'ok', score: r.pvs[0].score, depth: r.depth, san } : { status: 'error', error: 'Réponse Cloud Eval invalide' };
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
    tr.querySelector('[data-label="Évaluation"]').innerHTML = this.evalCell(e, live);
    tr.querySelector('[data-label="Statistiques"]').innerHTML = this.statsCell(live, e);
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
    const toggle = `<div class="seg"><button type="button" data-tree-src="niveau" aria-selected="${src === 'niveau'}">Mon niveau</button><button type="button" data-tree-src="maitres" aria-selected="${src === 'maitres'}">Maîtres</button><button type="button" data-tree-src="elite" aria-selected="${src === 'elite'}">Élite blitz/rapide</button></div>`;
    if (!this.tree) {
      return `<h2>Arbre des coups joués</h2>${toggle}<p class="muted small">Touchez « Arbre des coups joués » sur une fiche, ou <button type="button" class="link-btn" data-tree-root>partez de la racine du répertoire</button>, pour explorer tous les coups réellement joués — à votre niveau (coups loufoques compris), chez les maîtres ou chez les meilleurs joueurs blitz/rapide en ligne.</p>`;
    }
    const t = this.tree;
    const c = new Chess();
    const moves = t.path.map((u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }));
    const crumbs = moves.map((m, i) => `<button type="button" class="link-btn" data-crumb="${i + 1}">${esc((i % 2 === 0 ? `${i / 2 + 1}. ` : '') + sanFr(m.san))}</button>`).join(' ');
    const turn = c.turn();
    let body = '';
    const n = t.node;
    if (!n || n.status === 'loading') body = '<p class="state"><span class="spinner"></span> Chargement…</p>';
    else if (n.status === 'notoken') body = '<p class="muted">Jeton Lichess requis (⚙ Réglages) pour l’Opening Explorer.</p>';
    else if (n.status === 'unavailable') body = `<p class="muted">Jeu de données Élite non publié sur ce site (${esc(n.error)}).</p>`;
    else if (n.status === 'absent') body = `<p class="muted elite-absent">${esc(absentText(n.meta))}</p>`;
    else if (n.status === 'error') body = `<p class="errbox">${esc(n.error)}</p>`;
    else {
      const known = this.knownChildren(t.path);
      const rows = n.moves.map((m) => {
        const s = m.stats;
        const tag = known.get(m.uci);
        return `<tr>
          <td><button type="button" class="link-btn" data-child="${m.uci}">${esc(sanFr(m.san))}</button>${tag ? ` <span class="badge tiny" title="${esc(tag)}">fiche</span>` : ''}</td>
          <td class="num">${s.total.toLocaleString('fr-FR')}</td>
          <td>${bar(s)}<span class="tiny">${p1(s.white)} / ${p1(s.draws)} / ${p1(s.black)}</span></td>
          <td class="num">${p1(m.win)}</td>
        </tr>`;
      }).join('');
      const res = (g) => (g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½');
      let games = src === 'maitres' && n.games?.length
        ? `<details class="master-games" open><summary>Parties de référence de maîtres (${n.games.length})</summary><ul>${n.games.map((g) => `<li><button type="button" class="link-btn" data-master="${esc(g.id)}">${esc(g.white.name)} (${g.white.rating}) – ${esc(g.black.name)} (${g.black.rating})</button> <span class="muted small">${res(g)}, ${esc(String(g.year))}</span></li>`).join('')}</ul></details>` : '';
      if (src === 'elite' && n.games?.length) {
        games = `<details class="master-games elite-games" open><summary>Parties exemples du top (${n.games.length})</summary><ul>${n.games.map((g, i) => `<li><button type="button" class="link-btn" data-elite-game="${i}">${esc(g.label)}</button> <span class="muted small">${esc(g.r.replace('1/2-1/2', '½-½'))}, ${esc(String(g.y))} · ${esc(g.platform)} ${esc(SPEED_LABELS[g.s] || g.s)}</span> <a class="tiny" href="${esc(g.url)}" target="_blank" rel="noopener" title="Voir la partie sur ${esc(g.platform)}">↗</a></li>`).join('')}</ul></details>`;
      }
      const who = { niveau: 'à votre niveau', maitres: 'de maîtres', elite: `du top blitz/rapide (${esc(splitText(n.split))})` }[src];
      body = `${n.opening ? `<p class="small"><span class="badge eco">${esc(n.opening.eco)}</span> ${esc(n.opening.name)}</p>` : ''}
        <p class="muted small">${n.total.toLocaleString('fr-FR')} parties ${who} · trait aux ${turn === 'w' ? 'Blancs' : 'Noirs'}</p>
        ${src === 'elite' ? `<p class="muted tiny">Fréquences observées chez les meilleurs joueurs en ligne, pas une évaluation moteur. ${esc(eliteSummary(n.meta))}</p>` : ''}
        <table class="tree-table"><thead><tr><th>Coup</th><th>Parties</th><th>Blancs / nulles / Noirs</th><th>% victoire ${turn === 'w' ? 'Blancs' : 'Noirs'}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">Aucun coup joué ici ${{ niveau: 'avec ce filtre', maitres: 'par les maîtres', elite: 'dans le jeu Élite' }[src]}.</td></tr>`}</tbody></table>${games}`;
    }
    return `<h2>Arbre des coups joués</h2>${toggle}
      <p class="crumbs"><button type="button" class="link-btn" data-crumb="0">Départ</button> ${crumbs}</p>
      ${body}
      <p class="muted small">« fiche » : coup couvert par une fiche du répertoire. Coups validés par chess.js avant affichage.</p>`;
  }

  knownChildren(path) {
    const out = new Map();
    const lines = [];
    for (const e of this.data.entries) {
      lines.push([e.uci, e.nom]);
      if (e.punition) lines.push([e.punition.uci, `${e.nom} (punition)`]);
      if (e.piege) lines.push([e.piege.uci, `${e.nom} (piège)`]);
    }
    for (const [uci, nom] of lines) {
      if (uci.length > path.length && path.every((u, i) => uci[i] === u) && !out.has(uci[path.length])) out.set(uci[path.length], nom);
    }
    return out;
  }

  openTree(path) {
    const gen = this.generation;
    const src = this.treeSource;
    this.tree = { path, source: src, node: { status: 'loading' } };
    this.renderTree();
    if (src === 'elite') {
      // Lecture locale du fichier Élite (rechargé à la fin du chargement s'il est en cours).
      const el = this.elite;
      if (el.status === 'loading') return;
      if (el.status !== 'ok') this.tree.node = el;
      else {
        const c = new Chess();
        path.forEach((u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }));
        const x = lookupElite(el.data, c.fen());
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
    const head = '<h2>🔴 Nouvelles parties du top</h2>';
    if (el.status === 'loading') return `${head}<p class="state small"><span class="spinner"></span> Chargement…</p>`;
    if (el.status !== 'ok') return `${head}<p class="muted small">Jeu de données Élite non publié sur ce site.</p>`;
    const list = recentInfo(el.data);
    const rows = list.map((g, i) => `<li>
        <span class="tiny live-when" title="${esc(new Date(g.t).toLocaleString('fr-FR'))}">${esc(ago(g.t))}</span>
        <button type="button" class="link-btn" data-live-game="${i}">${esc(g.label)}</button>
        <span class="muted small">${esc(g.r.replace('1/2-1/2', '½-½'))} · ${esc(g.platform)} ${esc(SPEED_LABELS[g.s] || g.s)}${g.opening ? ` · ${esc(g.opening)}` : ''}</span>
        <a class="tiny" href="${esc(g.url)}" target="_blank" rel="noopener" title="Voir la partie sur ${esc(g.platform)}">↗</a></li>`).join('');
    return `${head}
      <p class="muted tiny">${esc(eliteSummary(el.data.meta))} Dernières parties des 50 meilleurs joueurs blitz/rapide de Lichess et Chess.com qui atteignent votre répertoire (Gambit Dame ou Caro-Kann, quel que soit l’ordre des coups) ; une partie apparaît au passage suivant sa fin (≈ toutes les 30 min, parfois plus tard).</p>
      ${rows ? `<ul class="live-list">${rows}</ul>` : '<p class="muted small">Aucune partie récente dans le jeu de données.</p>'}
      <p class="muted tiny">Toucher une partie l’ouvre sur l’échiquier (votre partie actuelle est sauvegardée).</p>`;
  }

  renderLive() {
    const el = this.el.querySelector('#rep-live');
    if (!el) return;
    el.innerHTML = this.liveHtml();
    this.bindLive(el);
  }

  bindLive(el) {
    el.querySelectorAll('[data-live-game]').forEach((b) => b.addEventListener('click', () => {
      const g = recentInfo(this.elite.data)[Number(b.dataset.liveGame)];
      if (g) this.openGame?.(g.san, g.color, `la partie ${g.label}`, eliteHeaders(g));
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
    const head = `<div class="vd-head"><h2>Vidéos : ${esc(e.nom)}</h2><button type="button" class="icon-btn" data-vclose aria-label="Fermer">✕</button></div>
      ${e.video?.liens?.length ? `<h3 class="small">Sélection vérifiée</h3>${curatedVideosHtml(e, 'vd-curated vd-curated-dlg')}<h3 class="small">Recherche par langue</h3>` : ''}
      <div class="chips">${Object.entries(LANGS).map(([k, l]) => `<button type="button" class="chip" data-vlang="${k}" aria-pressed="${k === lang}">${esc(l.label)}</button>`).join('')}</div>`;
    const render = (body) => {
      dlg.innerHTML = `${head}${body}<p class="muted tiny">L’application trouve et classe les vidéos ; elle ne les regarde pas. Pour garder un passage précis, utilisez « ⏱ Garder ce passage ».</p>`;
      dlg.querySelector('[data-vclose]').onclick = () => dlg.close();
      dlg.querySelectorAll('[data-vlang]').forEach((b) => { b.onclick = () => this.openVideos(id, b.dataset.vlang); });
      dlg.querySelectorAll('[data-vkeep]').forEach((b) => { b.onclick = () => this.keepVideo(id, `https://www.youtube.com/watch?v=${b.dataset.vkeep}`); });
    };
    if (!dlg.open) dlg.showModal();
    if (!this.youtube?.hasKey()) {
      render(`<p class="small">Sans clé API YouTube, l’application ouvre une recherche YouTube dans la langue choisie :</p>
        <p><a class="primary-link" href="${esc(searchLink(e, lang))}" target="_blank" rel="noopener">▶ Rechercher « ${esc(e.nom)} » en ${esc(LANGS[lang].label)}</a></p>
        <p class="muted small">Avec une clé gratuite (⚙ Réglages → Clé API YouTube), la liste des vidéos s’affiche ici avec chaîne, durée et vues.</p>`);
      return;
    }
    render('<p class="state"><span class="spinner"></span> Recherche des vidéos…</p>');
    try {
      const items = await this.youtube.search(e, lang);
      if (this.videoLang !== lang || !dlg.open) return;
      render(items.length ? `<ul class="vd-list">${items.map((it) => `<li>
          <a href="https://www.youtube.com/watch?v=${esc(it.id)}" target="_blank" rel="noopener" class="vd-thumb">${it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy">` : ''}</a>
          <div><a href="https://www.youtube.com/watch?v=${esc(it.id)}" target="_blank" rel="noopener" class="vd-title">${esc(decodeEntities(it.title))}</a>
          <div class="muted tiny">${esc(decodeEntities(it.channel))}${it.duration ? ` · ${esc(it.duration)}` : ''}${it.views ? ` · ${it.views.toLocaleString('fr-FR')} vues` : ''}${it.published ? ` · ${esc(it.published)}` : ''}</div>
          <button type="button" class="link-btn tiny" data-vkeep="${esc(it.id)}">⏱ Garder ce passage</button></div></li>`).join('')}</ul>`
        : `<p class="muted">Aucune vidéo trouvée en ${esc(LANGS[lang].label)}. <a href="${esc(searchLink(e, lang))}" target="_blank" rel="noopener">Recherche YouTube</a></p>`);
    } catch (err) {
      render(`<p class="errbox">${esc(err.message)}</p><p><a href="${esc(searchLink(e, lang))}" target="_blank" rel="noopener">Rechercher directement sur YouTube</a></p>`);
    }
  }

  keepVideo(id, url) {
    const time = window.prompt('Moment précis à garder (mm:ss, hh:mm:ss ou secondes ; vide = début) :', '');
    if (time === null) return;
    const link = buildVideoLink(url, time);
    if (!link) { window.alert('Horodatage non reconnu.'); return; }
    this.videos[id] = link;
    saveVideos(this.videos);
    this.el.querySelector('[data-video-dlg]').close();
    this.render();
  }

  addVideo(id) {
    const url = window.prompt('Adresse de la vidéo YouTube (youtube.com/watch?v=… ou youtu.be/…) :');
    if (!url) return;
    const time = window.prompt('Moment précis (mm:ss, hh:mm:ss ou secondes ; laisser vide pour le début) :', '');
    const link = buildVideoLink(url, time);
    if (!link) { window.alert('Adresse ou horodatage non reconnu.'); return; }
    this.videos[id] = link;
    saveVideos(this.videos);
    this.render();
  }

  // ---------- Export ----------

  exportPgn(which) {
    const d = this.data;
    const pgn = repertoireToPgn(d.entries, d.repertoires, which === 'all' ? null : which);
    const name = { gd: 'repertoire-gambit-dame', ck: 'repertoire-caro-kann', all: 'repertoire-complet' }[which];
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
    const label = kind ? `${e.nom} (${kind === 'punition' ? 'punition' : 'piège'})` : e.nom;
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
        this.openTree(entry(b.dataset.tree).uci);
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

  bindTree(el) {
    const root = () => (this.view === 'ck' ? ['e2e4', 'c7c6'] : ['d2d4', 'd7d5', 'c2c4']);
    el.querySelector('[data-tree-root]')?.addEventListener('click', () => this.openTree(root()));
    el.querySelectorAll('[data-tree-src]').forEach((b) => b.addEventListener('click', () => {
      this.treeSource = b.dataset.treeSrc;
      if (this.tree) this.openTree(this.tree.path); else this.renderTree();
    }));
    el.querySelectorAll('[data-child]').forEach((b) => b.addEventListener('click', () => this.openTree([...this.tree.path, b.dataset.child])));
    el.querySelectorAll('[data-crumb]').forEach((b) => b.addEventListener('click', () => this.openTree(this.tree.path.slice(0, Number(b.dataset.crumb)))));
    el.querySelectorAll('[data-master]').forEach((b) => b.addEventListener('click', () => {
      const color = this.view === 'ck' ? 'b' : 'w';
      this.openMaster(b.dataset.master, color);
    }));
    el.querySelectorAll('[data-elite-game]').forEach((b) => b.addEventListener('click', () => {
      const g = this.tree?.node?.games?.[Number(b.dataset.eliteGame)];
      if (g) this.openGame?.(g.san, this.view === 'ck' ? 'b' : 'w', `la partie ${g.label}`, eliteHeaders(g));
    }));
  }
}
