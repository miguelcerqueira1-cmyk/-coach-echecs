// Page « Répertoire » : encyclopédie du Gambit Dame (Blancs) et de la Caro-Kann (Noirs).
//  - filtres rapides (ouverture, type), recherche par nom, coup (FR/EN) ou code ECO ;
//  - tableau 9 colonnes : fiches rédigées + vérification Stockfish faite à la construction,
//    colonnes dynamiques (Cloud Eval, statistiques « mon niveau » et « maîtres ») ;
//  - vue « Anti-trash Blitz » : coups adverses loufoques et leur réfutation immédiate ;
//  - « Tester cette ligne » (lecture animée sur la page Moteur), export PGN ;
//  - arbre des coups réellement joués (mon niveau ou maîtres) ; vidéos YouTube multilingues.
import { Chess } from '../vendor/chess.js';
import { START_FEN } from './lines.js';
import { enrichMoves, bucketLabel, SPEED_LABELS } from './lichess.js';
import { sanFr, formatScore, formatLine } from './analysis.js';
import { repertoireToPgn } from './repertoire-pgn.js';
import { LANGS, searchLink, decodeEntities } from './youtube.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p1 = (x) => x.toFixed(1).replace('.', ',') + ' %';
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
  const numbered = lines.map((sans) => sans.map((s, i) => `${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'}${s} ${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'}${sanFr(s)}`).join(' ')).join(' ');
  return norm([e.id, e.nom, e.famille, e.eco, e.ecoNom, e.plan, e.structure, e.cases, numbered].join(' '));
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
function loadVideos() { try { return JSON.parse(localStorage.getItem(VIDEO_KEY) || '{}'); } catch { return {}; } }
function saveVideos(v) { try { localStorage.setItem(VIDEO_KEY, JSON.stringify(v)); } catch { /* stockage indisponible */ } }

const bar = (s) => `<div class="wdl-bar" title="Blancs ${p1(s.white)} · nulles ${p1(s.draws)} · Noirs ${p1(s.black)}"><span class="w" style="width:${s.white}%"></span><span class="d" style="width:${s.draws}%"></span><span class="b" style="width:${s.black}%"></span></div>`;

export class RepertoirePage {
  constructor({ el, client, getFilter, openSan, openMaster, youtube }) {
    this.el = el;
    this.client = client;
    this.getFilter = getFilter;
    this.openSan = openSan;
    this.openMaster = openMaster;
    this.youtube = youtube;
    this.data = null;
    this.view = 'gd'; // 'gd' | 'ck' | 'trash'
    this.badge = '';
    this.query = '';
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
    return this.data.entries.filter((e) => (this.view === 'trash' || e.rep === this.view)
      && (!this.badge || e.badge === this.badge) && (!q || e._search.includes(q)));
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
          <input type="search" data-q placeholder="Rechercher : nom, coup (Fg4, Bg4, 2…Fg4) ou code ECO (B12)" value="${esc(this.query)}">
          <details class="export-menu"><summary>⤓ Exporter en PGN</summary>
            <div class="export-box">
              <button type="button" data-export="gd">Gambit Dame (${count((e) => e.rep === 'gd')} fiches)</button>
              <button type="button" data-export="ck">Caro-Kann (${count((e) => e.rep === 'ck')} fiches)</button>
              <button type="button" data-export="all">Tout le répertoire</button>
              <p class="muted tiny">Lichess : Étude → « + » (nouveau chapitre) → onglet PGN → coller ou importer le fichier (64 chapitres max par étude : un fichier par ouverture). Chess.com : Analyse → Importer PGN. Les punitions et pièges sont inclus en variantes commentées.</p>
            </div>
          </details>
        </div>
        <p class="small muted">${list.length} fiche(s) affichée(s). Statistiques « mon niveau » : ${esc(filt)} (réglable dans « Coup optimal ») ; « maîtres » : joueurs titrés 2200+ FIDE. Évaluations vérifiées : ${esc(d.moteur.nom)}, profondeur ${d.moteur.profondeur}. Codes ECO et noms : base Lichess chess-openings (CC0) ; il n’existe pas de nomenclature FIDE officielle des variantes.</p>
      </div>
      ${this.view === 'trash' ? this.trashHtml(list) : this.tableHtml(list)}
      <section class="card tree-card" id="rep-tree">${this.treeHtml()}</section>
      <dialog class="video-dlg" data-video-dlg></dialog>
    `;
    this.bind();
    this.observe();
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
      <td data-label="Statistiques">${this.statsCell(live)}</td>
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

  statsCell(live) {
    const one = (x, label) => {
      if (!x) return `<div class="muted tiny">${label} : en attente</div>`;
      if (x.status === 'loading') return `<div class="state tiny"><span class="spinner"></span>${label}…</div>`;
      if (x.status === 'notoken') return `<div class="muted tiny">${label} : jeton Lichess requis (⚙)</div>`;
      if (x.status === 'error') return `<div class="error-text tiny">${label} : ${esc(x.error)}</div>`;
      const s = x.stats;
      if (!s.total) return `<div class="muted tiny">${label} : aucune partie</div>`;
      return `<div class="stat-line"><span class="tiny"><strong>${label}</strong> · ${s.total.toLocaleString('fr-FR')} parties</span>${bar(s)}<span class="tiny">Blancs ${p1(s.white)} · nulles ${p1(s.draws)} · Noirs ${p1(s.black)}</span></div>`;
    };
    return one(live.explorer, 'Mon niveau') + one(live.masters, 'Maîtres');
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
    return `${verified}<button type="button" class="small-btn" data-videos="${e.id}">🎬 Vidéos (${Object.keys(LANGS).length} langues)</button><div>${mine}</div>`;
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
    tr.querySelector('[data-label="Statistiques"]').innerHTML = this.statsCell(live);
  }

  // ---------- Arbre dynamique ----------

  treeHtml() {
    const src = this.treeSource;
    const toggle = `<div class="seg"><button type="button" data-tree-src="niveau" aria-selected="${src === 'niveau'}">Mon niveau</button><button type="button" data-tree-src="maitres" aria-selected="${src === 'maitres'}">Maîtres</button></div>`;
    if (!this.tree) {
      return `<h2>Arbre des coups joués</h2>${toggle}<p class="muted small">Touchez « Arbre des coups joués » sur une fiche, ou <button type="button" class="link-btn" data-tree-root>partez de la racine du répertoire</button>, pour explorer tous les coups réellement joués — à votre niveau (coups loufoques compris) ou chez les maîtres.</p>`;
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
      const games = src === 'maitres' && n.games?.length
        ? `<details class="master-games" open><summary>Parties de référence de maîtres (${n.games.length})</summary><ul>${n.games.map((g) => `<li><button type="button" class="link-btn" data-master="${esc(g.id)}">${esc(g.white.name)} (${g.white.rating}) – ${esc(g.black.name)} (${g.black.rating})</button> <span class="muted small">${res(g)}, ${esc(String(g.year))}</span></li>`).join('')}</ul></details>` : '';
      body = `${n.opening ? `<p class="small"><span class="badge eco">${esc(n.opening.eco)}</span> ${esc(n.opening.name)}</p>` : ''}
        <p class="muted small">${n.total.toLocaleString('fr-FR')} parties ${src === 'maitres' ? 'de maîtres' : 'à votre niveau'} · trait aux ${turn === 'w' ? 'Blancs' : 'Noirs'}</p>
        <table class="tree-table"><thead><tr><th>Coup</th><th>Parties</th><th>Blancs / nulles / Noirs</th><th>% victoire ${turn === 'w' ? 'Blancs' : 'Noirs'}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">Aucun coup joué ici ${src === 'maitres' ? 'par les maîtres' : 'avec ce filtre'}.</td></tr>`}</tbody></table>${games}`;
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
    this.tree = { path, node: { status: 'loading' } };
    this.renderTree();
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
    this.el.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => this.exportPgn(b.dataset.export)));
    const q = this.el.querySelector('[data-q]');
    q.addEventListener('input', () => {
      clearTimeout(this.qTimer);
      this.qTimer = setTimeout(() => {
        this.query = q.value;
        const pos = q.selectionStart;
        this.render();
        const q2 = this.el.querySelector('[data-q]');
        q2.focus();
        q2.setSelectionRange(pos, pos);
      }, 250);
    });
    const main = this.el.querySelector('.rep-table tbody, .trash');
    main?.addEventListener('click', (ev) => {
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
  }
}
