// Page « Répertoire » : tableau des fiches (Gambit Dame / Caro-Kann) et arbre dynamique.
// Colonnes statiques : fiches rédigées + vérification Stockfish faite à la construction.
// Colonnes dynamiques : Cloud Eval et Opening Explorer, chargés à la demande (file série).
import { Chess } from '../vendor/chess.js';
import { START_FEN } from './lines.js';
import { enrichMoves, bucketLabel, SPEED_LABELS } from './lichess.js';
import { sanFr, formatScore, formatLine } from './analysis.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p1 = (x) => x.toFixed(1).replace('.', ',') + ' %';
const VIDEO_KEY = 'coach-echecs:videos-perso';

const BADGE_CLASS = { theorie: 'b-theorie', piege: 'b-piege', loufoque: 'b-loufoque' };

function sanLine(san, startFen = START_FEN) {
  const c = new Chess(startFen);
  const moves = san.map((s) => c.move(s));
  return formatLine(moves, startFen);
}

// Ligne complète numérotée, en notation française, avec le coup fautif surligné.
function markedLineHtml(san, markIndex) {
  const c = new Chess();
  let no = 1;
  const out = [];
  san.forEach((m, i) => {
    const mv = c.move(m);
    let t = esc(sanFr(mv.san));
    if (i === markIndex) t = `<mark title="Coup fautif">${t} ?</mark>`;
    out.push(mv.color === 'w' ? `${no}. ${t}` : (i === 0 ? `${no}… ${t}` : t));
    if (mv.color === 'b') no++;
  });
  return out.join(' ');
}

function scoreText(v) {
  if (!v) return '—';
  if (v.mated) return 'Mat';
  return formatScore({ type: v.type, value: v.value });
}

// Score enregistré « du point de vue de pov » → point de vue des Blancs pour l'affichage.
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

function loadVideos() {
  try { return JSON.parse(localStorage.getItem(VIDEO_KEY) || '{}'); } catch { return {}; }
}
function saveVideos(v) {
  try { localStorage.setItem(VIDEO_KEY, JSON.stringify(v)); } catch { /* stockage indisponible */ }
}

export class RepertoirePage {
  constructor({ el, client, getFilter, openLine }) {
    this.el = el;
    this.client = client;
    this.getFilter = getFilter;
    this.openLine = openLine;
    this.data = null;
    this.rep = 'gd';
    this.badge = '';
    this.query = '';
    this.live = new Map(); // id → { cloud, explorer, filterKey }
    this.tree = null; // { entryId|null, path: [uci] }
    this.videos = loadVideos();
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
    const q = this.query.trim().toLowerCase();
    return this.data.entries.filter((e) => e.rep === this.rep && (!this.badge || e.badge === this.badge) &&
      (!q || [e.nom, e.famille, e.eco, e.ecoNom, e.plan, e.structure].join(' ').toLowerCase().includes(q)));
  }

  render() {
    const d = this.data;
    const f = this.getFilter();
    const reps = Object.values(d.repertoires);
    const list = this.entries();
    const filt = `${f.speeds.map((s) => SPEED_LABELS[s]).join(', ') || 'toutes cadences'} · ${f.ratings.map(bucketLabel).join(', ') || 'tous classements'}`;
    this.el.innerHTML = `
      <div class="rep-head">
        <div class="rep-tabs" role="tablist">
          ${reps.map((r) => `<button type="button" role="tab" data-rep="${r.id}" aria-selected="${r.id === this.rep}">${esc(r.titre)} <span class="muted small">(${r.couleur === 'w' ? 'Blancs' : 'Noirs'})</span></button>`).join('')}
        </div>
        <p class="muted small">${esc(d.repertoires[this.rep].sousTitre)}</p>
        <div class="rep-filters">
          <select data-badge aria-label="Type de ligne">
            <option value="">Tous les types</option>
            <option value="theorie" ${this.badge === 'theorie' ? 'selected' : ''}>Théorie</option>
            <option value="piege" ${this.badge === 'piege' ? 'selected' : ''}>Piège Blitz</option>
            <option value="loufoque" ${this.badge === 'loufoque' ? 'selected' : ''}>Coup loufoque</option>
          </select>
          <input type="search" data-q placeholder="Rechercher (nom, ECO, structure…)" value="${esc(this.query)}">
        </div>
        <p class="small muted">Statistiques : ${esc(filt)} (filtre réglable dans « Coup optimal », page Moteur). Évaluations vérifiées : ${esc(d.moteur.nom)}, profondeur ${d.moteur.profondeur} (${esc(d.moteur.date)}). Codes ECO et noms : base Lichess chess-openings (CC0) ; il n’existe pas de nomenclature FIDE officielle des variantes.</p>
      </div>
      <div class="rep-table-wrap">
        <table class="rep-table">
          <thead><tr>
            <th>ECO · Nom</th><th>Séquence</th><th>Évaluation</th><th>Statistiques</th><th>Plan & structure</th>
            <th>Punition tactique</th><th>Piège à éviter</th><th>Cases & pièces</th><th>Vidéo</th>
          </tr></thead>
          <tbody>${list.map((e) => this.row(e)).join('') || '<tr><td colspan="9" class="muted">Aucune fiche pour ce filtre.</td></tr>'}</tbody>
        </table>
      </div>
      <section class="card tree-card" id="rep-tree">${this.treeHtml()}</section>
    `;
    this.bind();
    this.observe();
  }

  row(e) {
    const v = e.verification;
    const live = this.live.get(e.id) || {};
    const color = this.data.repertoires[e.rep].couleur;
    const mainEval = v ? `<div class="small">Stockfish (vérif.) : <strong>${esc(scoreText(toWhite(v.main, v.main.pov)))}</strong></div>` : '';
    return `<tr data-id="${e.id}">
      <td data-label="ECO · Nom">
        <span class="badge eco">${esc(e.eco)}</span> <span class="badge ${BADGE_CLASS[e.badge]}">${esc(this.badgeLabel(e.badge))}</span>
        <div class="rep-name">${esc(e.nom)}</div>
        <div class="muted tiny">${esc(e.ecoNom)}</div>
        <div class="row-actions">
          <button type="button" class="link-btn" data-open="${e.id}">Ouvrir sur l’échiquier</button>
          <button type="button" class="link-btn" data-tree="${e.id}">Arbre Lichess</button>
        </div>
      </td>
      <td data-label="Séquence" class="line">${esc(sanLine(e.san))}</td>
      <td data-label="Évaluation">${this.cloudCell(live.cloud)}${mainEval}</td>
      <td data-label="Statistiques">${this.statsCell(live.explorer)}</td>
      <td data-label="Plan & structure"><p class="small">${esc(e.plan)}</p><p class="small"><strong>Structure :</strong> ${esc(e.structure)}</p></td>
      <td data-label="Punition tactique">${this.claimCell(e.punition, v?.punition, color, 'punition')}</td>
      <td data-label="Piège à éviter">${this.claimCell(e.piege, v?.piege, color, 'piege')}</td>
      <td data-label="Cases & pièces" class="small"><p><strong>Cases clés :</strong> ${esc(e.cases)}</p><p><strong>À échanger :</strong> ${esc(e.echanger)}</p><p><strong>À conserver :</strong> ${esc(e.conserver)}</p></td>
      <td data-label="Vidéo">${this.videoCell(e)}</td>
    </tr>`;
  }

  badgeLabel(b) {
    return { theorie: 'Théorie', piege: 'Piège Blitz', loufoque: 'Coup loufoque à réfuter' }[b] || b;
  }

  cloudCell(c) {
    if (!c) return '<span class="muted small">Cloud Eval : en attente</span>';
    if (c.status === 'loading') return '<span class="state small"><span class="spinner"></span>Cloud Eval…</span>';
    if (c.status === 'absent') return '<span class="muted small">Cloud Eval : position absente du cache Lichess</span>';
    if (c.status === 'error') return `<span class="error-text small">${esc(c.error)}</span>`;
    return `<div><strong>${esc(formatScore(c.score))}</strong> <span class="muted tiny">Cloud Eval, prof. ${c.depth}</span></div>
      <div class="tiny">Meilleur : ${esc(sanFr(c.san))}</div>`;
  }

  statsCell(x) {
    if (!x) return '<span class="muted small">En attente</span>';
    if (x.status === 'loading') return '<span class="state small"><span class="spinner"></span>Explorer…</span>';
    if (x.status === 'notoken') return '<span class="muted small">Jeton Lichess requis (⚙)</span>';
    if (x.status === 'error') return `<span class="error-text small">${esc(x.error)}</span>`;
    const s = x.stats;
    if (!s.total) return '<span class="muted small">Aucune partie avec ce filtre</span>';
    return `<div class="wdl-bar"><span class="w" style="width:${s.white}%"></span><span class="d" style="width:${s.draws}%"></span><span class="b" style="width:${s.black}%"></span></div>
      <div class="tiny">Blancs ${p1(s.white)} · nulles ${p1(s.draws)} · Noirs ${p1(s.black)}</div>
      <div class="muted tiny">${s.total.toLocaleString('fr-FR')} parties</div>`;
  }

  claimCell(c, v, color, kind) {
    if (!c) return '<span class="muted small">—</span>';
    const lineHtml = markedLineHtml(c.san, c.marked);
    const rest = c.san.slice(c.marked);
    let verdict = '<span class="badge">non vérifié</span>';
    if (v) {
      const fin = v.final.mated ? (v.final.mated === color ? 'mat contre nous' : 'mat') : formatScore({ type: v.final.type, value: v.final.value });
      verdict = v.ok
        ? `<span class="badge ok" title="Évaluation finale du point de vue de notre camp">✔ Stockfish : ${esc(fin)}</span>`
        : `<span class="badge err">✘ non confirmé (${esc(fin)})</span>`;
    }
    const engineAlt = v && v.afterError?.best && kind === 'punition' && v.afterError.best !== rest[1]
      ? `<div class="muted tiny">Meilleure suite selon le moteur après l’erreur : ${esc(v.afterError.pv.slice(0, 4).map(sanFr).join(' '))}</div>` : '';
    return `<div class="line small">${lineHtml}</div><p class="small">${esc(c.texte)}</p>${verdict}${engineAlt}`;
  }

  videoCell(e) {
    const perso = this.videos[e.id];
    const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(e.video.recherche)}`;
    const verified = e.video.url && e.video.verifie
      ? `<a class="btn-link" href="${esc(e.video.url)}" target="_blank" rel="noopener">▶ Vidéo (passage précis)</a>` : '';
    const mine = perso
      ? `<a class="btn-link" href="${esc(perso)}" target="_blank" rel="noopener">▶ Mon lien horodaté</a> <button type="button" class="link-btn tiny" data-video-del="${e.id}">retirer</button>`
      : `<button type="button" class="link-btn" data-video-add="${e.id}">+ Ajouter mon lien horodaté</button>`;
    return `${verified}<a class="btn-link" href="${search}" target="_blank" rel="noopener">Rechercher sur YouTube</a><div>${mine}</div>`;
  }

  // ---------- Données dynamiques ----------

  observe() {
    this.io?.disconnect();
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
    this.el.querySelectorAll('tr[data-id]').forEach((tr) => this.io.observe(tr));
  }

  load(e) {
    if (this.live.has(e.id)) return;
    const gen = this.generation;
    const st = { cloud: { status: 'loading' }, explorer: this.client.explorerMode() ? { status: 'loading' } : { status: 'notoken' } };
    this.live.set(e.id, st);
    this.updateRow(e);
    const isStale = () => gen !== this.generation || this.el.classList.contains('hidden');
    this.client.cloudEval(e.fenFinale, { isStale }).then((r) => {
      if (r.stale) { this.live.delete(e.id); return; }
      if (gen !== this.generation) return;
      if (r.status === 'absent') st.cloud = { status: 'absent' };
      else {
        const u = r.pvs[0]?.moves[0];
        let san = null;
        try { san = new Chess(e.fenFinale).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san; } catch { /* coup invalide ignoré */ }
        st.cloud = san ? { status: 'ok', score: r.pvs[0].score, depth: r.depth, san } : { status: 'error', error: 'Réponse Cloud Eval invalide' };
      }
      this.updateRow(e);
    }).catch((err) => { if (gen === this.generation) { st.cloud = { status: 'error', error: err.message }; this.updateRow(e); } });
    if (st.explorer.status === 'notoken') return;
    const f = this.getFilter();
    this.client.explorer({ fen: START_FEN, play: e.uci, ratings: f.ratings, speeds: f.speeds, moves: 1, isStale }).then((r) => {
      if (r.stale) { this.live.delete(e.id); return; }
      if (gen !== this.generation) return;
      st.explorer = { status: 'ok', stats: r.stats };
      this.updateRow(e);
    }).catch((err) => { if (gen === this.generation) { st.explorer = { status: 'error', error: err.message }; this.updateRow(e); } });
  }

  updateRow(e) {
    const tr = this.el.querySelector(`tr[data-id="${e.id}"]`);
    if (!tr) return;
    const live = this.live.get(e.id) || {};
    tr.querySelector('[data-label="Évaluation"]').innerHTML = this.cloudCell(live.cloud) +
      (e.verification ? `<div class="small">Stockfish (vérif.) : <strong>${esc(scoreText(toWhite(e.verification.main, e.verification.main.pov)))}</strong></div>` : '');
    tr.querySelector('[data-label="Statistiques"]').innerHTML = this.statsCell(live.explorer);
  }

  // ---------- Arbre dynamique ----------

  treeHtml() {
    if (!this.tree) {
      return `<h2>Arbre des coups joués (Lichess)</h2><p class="muted small">Touchez « Arbre Lichess » sur une fiche, ou <button type="button" class="link-btn" data-tree-root>partez de la racine du répertoire</button>, pour explorer tous les coups réellement joués au niveau choisi — y compris les coups rares ou loufoques.</p>`;
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
          <td><div class="wdl-bar"><span class="w" style="width:${s.white}%"></span><span class="d" style="width:${s.draws}%"></span><span class="b" style="width:${s.black}%"></span></div><span class="tiny">${p1(s.white)} / ${p1(s.draws)} / ${p1(s.black)}</span></td>
          <td class="num">${p1(m.win)}</td>
        </tr>`;
      }).join('');
      body = `${n.opening ? `<p class="small"><span class="badge eco">${esc(n.opening.eco)}</span> ${esc(n.opening.name)}</p>` : ''}
        <p class="muted small">${n.total.toLocaleString('fr-FR')} parties · trait aux ${turn === 'w' ? 'Blancs' : 'Noirs'}</p>
        <table class="tree-table"><thead><tr><th>Coup</th><th>Parties</th><th>Blancs / nulles / Noirs</th><th>% victoire ${turn === 'w' ? 'Blancs' : 'Noirs'}</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="muted">Aucun coup joué ici avec ce filtre.</td></tr>'}</tbody></table>`;
    }
    return `<h2>Arbre des coups joués (Lichess)</h2>
      <p class="crumbs"><button type="button" class="link-btn" data-crumb="0">Départ</button> ${crumbs}</p>
      ${body}
      <p class="muted small">« fiche » : coup couvert par une fiche du répertoire. Coups validés par chess.js avant affichage.</p>`;
  }

  // Coups suivants couverts par une fiche du répertoire (toutes lignes confondues).
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
    this.tree = { path, node: { status: 'loading' } };
    this.renderTree();
    if (!this.client.explorerMode()) {
      this.tree.node = { status: 'notoken' };
      this.renderTree();
      return;
    }
    const f = this.getFilter();
    const isStale = () => this.tree?.path !== path || gen !== this.generation;
    this.client.explorer({ fen: START_FEN, play: path, ratings: f.ratings, speeds: f.speeds, moves: 30, isStale }).then((r) => {
      if (r.stale || isStale()) return;
      const c = new Chess();
      path.forEach((u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }));
      const fen = c.fen();
      const legal = (u) => { try { new Chess(fen).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); return true; } catch { return false; } };
      this.tree.node = { status: 'ok', moves: enrichMoves(r.moves.filter((m) => legal(m.uci)), c.turn()), total: r.stats.total, opening: r.opening };
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

  // ---------- Événements ----------

  bind() {
    this.el.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => { this.rep = b.dataset.rep; this.render(); }));
    this.el.querySelector('[data-badge]').addEventListener('change', (ev) => { this.badge = ev.target.value; this.render(); });
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
    const tbody = this.el.querySelector('.rep-table tbody');
    tbody.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const entry = (id) => this.data.entries.find((x) => x.id === id);
      if (b.dataset.open) this.openLine(entry(b.dataset.open));
      if (b.dataset.tree) {
        this.openTree(entry(b.dataset.tree).uci);
        this.el.querySelector('#rep-tree').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
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
    el.querySelector('[data-tree-root]')?.addEventListener('click', () => this.openTree(this.rep === 'gd' ? ['d2d4', 'd7d5', 'c2c4'] : ['e2e4', 'c7c6']));
    el.querySelectorAll('[data-child]').forEach((b) => b.addEventListener('click', () => this.openTree([...this.tree.path, b.dataset.child])));
    el.querySelectorAll('[data-crumb]').forEach((b) => b.addEventListener('click', () => this.openTree(this.tree.path.slice(0, Number(b.dataset.crumb)))));
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
}
