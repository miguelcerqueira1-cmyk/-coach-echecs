// Panneau « Coup optimal » de la page Moteur.
// Sources clairement séparées :
//   1. Stockfish local (calcul en direct sur l'appareil, fourni par main.js) ;
//   2. Lichess Cloud Eval (évaluation déjà en cache chez Lichess, si elle existe) ;
//   3. Opening Explorer (fréquences de résultats dans des parties réelles, filtrées par niveau) ;
//   4. Élite blitz/rapide (data/elite.json : fréquences chez les meilleurs joueurs en ligne).
// Un fort % de victoire ne signifie pas que le coup est objectivement le meilleur.
import { Chess } from '../vendor/chess.js';
import {
  RATING_BUCKETS, SPEEDS, SPEED_LABELS, PRESETS, bucketLabel, enrichMoves, bestByWinRate,
} from './lichess.js';
import { sanFr, formatScore, COLOR_NAMES } from './analysis.js';
import { loadElite, lookupElite, eliteSummary, absentText, splitText, eliteHeaders } from './elite.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p1 = (x) => x.toFixed(1).replace('.', ',') + ' %';

export const DEFAULT_FILTER = { preset: 'blitz-1000', ratings: [0, 1000], speeds: ['blitz'], minGames: 50 };

function uciToSan(fen, uci) {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch { return null; }
}

export class OptimalPanel {
  constructor({ el, client, getFilter, setFilter, onChange = () => {}, onPlay = null, onOpenMaster = null, onOpenGame = null, loadEliteData = loadElite }) {
    this.onOpenMaster = onOpenMaster;
    this.onOpenGame = onOpenGame; // (san, label, headers) : partie exemple Élite ouverte sur l'échiquier
    this.loadEliteData = loadEliteData;
    this.masters = { status: 'idle' };
    this.elite = { status: 'idle' };
    this.tableSource = 'niveau'; // 'niveau' | 'maitres' | 'elite'
    this.el = el;
    this.client = client;
    this.getFilter = getFilter;
    this.setFilter = setFilter;
    this.onChange = onChange; // nouvelle flèche ou nouveau résultat → re-rendu de l'échiquier
    this.onPlay = onPlay;
    this.token = null;
    this.cloud = { status: 'idle' };
    this.explorer = { status: 'idle' };
    this.engineAdvice = null;
    this.engineStatus = 'idle';
  }

  // Coup au meilleur % de victoire (pour la flèche bleue), seulement pour la position courante.
  statArrow(isCurrent) {
    const e = this.explorer;
    if (this.hidden || e.status !== 'ok' || !isCurrent(this.token) || !e.best) return null;
    return { from: e.best.uci.slice(0, 2), to: e.best.uci.slice(2, 4), kind: 'stat' };
  }

  // Mode « Indice d'abord » : aucun coup n'est affiché tant que l'utilisateur ne l'a pas demandé.
  setHidden(hidden) {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    this.render();
  }

  setEngine(status, advice) {
    this.engineStatus = status;
    this.engineAdvice = advice;
    this.render();
  }

  // Appelé à chaque changement de la partie réelle.
  update(game) {
    const token = game.token();
    this.token = token;
    this.game = game;
    const fen = game.fen();
    const isStale = () => !game.isCurrent(token);
    const st = game.status();
    if (st.over) {
      this.cloud = { status: 'idle' };
      this.explorer = { status: 'idle' };
      this.masters = { status: 'idle' };
      this.elite = { status: 'idle' };
      this.render();
      return;
    }
    this.cloud = { status: 'loading' };
    this.explorer = this.client.explorerMode() ? { status: 'loading' } : { status: 'notoken' };
    this.masters = this.client.explorerMode() ? { status: 'loading' } : { status: 'notoken' };
    this.elite = { status: 'loading' };
    this.render();

    // Élite : fichier statique publié avec le site (aucun jeton, aucune requête Lichess).
    this.loadEliteData().then((r) => {
      if (isStale()) return;
      this.elite = r.status === 'ok' ? { ...lookupElite(r.data, fen), meta: r.data.meta } : r;
      this.render();
    });

    this.client.cloudEval(fen, { isStale }).then((r) => {
      if (r.stale || isStale()) return;
      if (r.status === 'absent') this.cloud = { status: 'absent' };
      else {
        const pv = r.pvs[0];
        const san = pv?.moves[0] ? uciToSan(fen, pv.moves[0]) : null;
        if (!san) this.cloud = { status: 'error', error: 'Coup Cloud Eval illégal ou absent : ignoré.' };
        else this.cloud = { status: 'ok', san, uci: pv.moves[0], score: pv.score, depth: r.depth, knodes: r.knodes };
      }
      this.render();
    }).catch((e) => {
      if (isStale()) return;
      this.cloud = { status: 'error', error: e.message };
      this.render();
    });

    if (this.explorer.status === 'notoken') return;
    // Base des maîtres : coups joués par les joueurs titrés + parties de référence.
    this.client.explorer({ fen: game.startFen, play: game.moves.map((m) => m.uci), db: 'masters', moves: 15, topGames: 6, isStale }).then((r) => {
      if (r.stale || isStale()) return;
      const turn = game.turn();
      const moves = enrichMoves(r.moves, turn).filter((m) => uciToSan(fen, m.uci));
      const top = moves.slice().sort((a, b) => b.stats.total - a.stats.total)[0] || null;
      this.masters = { status: 'ok', moves, total: r.stats.total, stats: r.stats, opening: r.opening, top, games: r.topGames || [], turn };
      this.render();
    }).catch((e) => {
      if (isStale()) return;
      this.masters = { status: 'error', error: e.message };
      this.render();
    });
    const f = this.getFilter();
    this.client.explorer({
      fen: game.startFen,
      play: game.moves.map((m) => m.uci),
      ratings: f.ratings,
      speeds: f.speeds,
      isStale,
    }).then((r) => {
      if (r.stale || isStale()) return;
      const turn = game.turn();
      // Chaque coup renvoyé est revalidé par chess.js avant affichage.
      const moves = enrichMoves(r.moves, turn).filter((m) => uciToSan(fen, m.uci));
      this.explorer = {
        status: 'ok', moves, total: r.stats.total, stats: r.stats, opening: r.opening, mode: r.mode,
        best: bestByWinRate(moves, f.minGames), turn, filter: f,
      };
      this.render();
      this.onChange();
    }).catch((e) => {
      if (isStale()) return;
      this.explorer = { status: 'error', error: e.message, kind: e.kind };
      this.render();
    });
  }

  render() {
    if (!this.game) return;
    const f = this.getFilter();
    const fen = this.game.fen();
    const turn = this.game.turn();
    const side = COLOR_NAMES[turn];
    if (this.hidden) {
      this.el.innerHTML = `<h2>Coup optimal <span class="muted small">— trait aux ${side}</span></h2>
        <p class="muted">Masqué en mode « Indice d’abord » : touchez « Montrer le coup » pour voir le coup du moteur et les statistiques.</p>`;
      return;
    }
    this.el.innerHTML = `
      <h2>Coup optimal <span class="muted small">— trait aux ${side}</span></h2>
      <div class="opt-grid">
        ${this.blockEngine()}
        ${this.blockCloud()}
        ${this.blockStats(turn)}
        ${this.blockMasters(turn)}
        ${this.blockElite(turn)}
      </div>
      ${this.filters(f)}
      ${this.table(fen)}
    `;
    this.bind();
  }

  blockEngine() {
    const a = this.engineAdvice;
    let body;
    if (this.engineStatus === 'error') body = '<span class="error-text">Moteur indisponible</span>';
    else if (!a) body = '<span class="state"><span class="spinner"></span>calcul…</span>';
    else body = `<strong class="mv-best">${esc(sanFr(a.best.san))}</strong> <span class="eval">${esc(a.scoreText)}</span>
      <span class="muted small">prof. ${a.depth ?? '—'}, ${((a.timeMs || 0) / 1000).toFixed(1).replace('.', ',')} s</span>`;
    return `<div class="opt-block"><p class="label">1 · Meilleur coup — Stockfish (cet appareil)</p><p>${body}</p></div>`;
  }

  blockCloud() {
    const c = this.cloud;
    let body;
    if (c.status === 'loading') body = '<span class="state"><span class="spinner"></span>Lichess…</span>';
    else if (c.status === 'absent') body = '<span class="muted">Position absente du cache Lichess (aucune évaluation cloud).</span>';
    else if (c.status === 'error') body = `<span class="error-text">${esc(c.error)}</span>`;
    else if (c.status === 'ok') {
      body = `<strong>${esc(sanFr(c.san))}</strong> <span class="eval">${esc(formatScore(c.score))}</span>
        <span class="muted small">prof. ${c.depth}, ${Math.round(c.knodes / 1000)} M nœuds</span>`;
    } else body = '—';
    return `<div class="opt-block"><p class="label">Évaluation Lichess Cloud Eval</p><p>${body}</p></div>`;
  }

  blockStats(turn) {
    const e = this.explorer;
    let body;
    if (e.status === 'loading') body = '<span class="state"><span class="spinner"></span>Opening Explorer…</span>';
    else if (e.status === 'notoken') body = '<span class="muted">Indisponible : ajoutez un jeton Lichess (⚙ Réglages) ou configurez le relais.</span>';
    else if (e.status === 'error') body = `<span class="error-text">${esc(e.error)}</span>`;
    else if (e.status === 'ok') {
      if (!e.total) body = '<span class="muted">Aucune partie trouvée avec ce filtre.</span>';
      else if (!e.best) body = `<span class="muted">Aucun coup n’atteint ${e.filter.minGames} parties : échantillon trop petit pour conclure.</span>`;
      else {
        body = `<strong class="mv-stat">${esc(sanFr(e.best.san))}</strong> <span class="eval">${p1(e.best.win)} de victoires ${turn === 'w' ? 'blanches' : 'noires'}</span>
          <span class="muted small">sur ${e.best.stats.total.toLocaleString('fr-FR')} parties</span>`;
      }
    } else body = '—';
    return `<div class="opt-block"><p class="label">2 · Meilleur % de victoire — parties réelles Lichess</p><p>${body}</p>
      <p class="muted small">Fréquence observée à ce niveau, pas une évaluation : un coup peut gagner souvent parce que l’adversaire se trompe.</p></div>`;
  }

  blockMasters(turn) {
    const m = this.masters;
    let body;
    if (m.status === 'loading') body = '<span class="state"><span class="spinner"></span>Base des maîtres…</span>';
    else if (m.status === 'notoken') body = '<span class="muted">Jeton Lichess requis (⚙ Réglages).</span>';
    else if (m.status === 'error') body = `<span class="error-text">${esc(m.error)}</span>`;
    else if (m.status === 'ok') {
      if (!m.total || !m.top) body = '<span class="muted">Position jamais atteinte dans les parties de maîtres : vous êtes hors de la théorie.</span>';
      else {
        const share = (100 * m.top.stats.total) / m.total;
        body = `<strong class="mv-master">${esc(sanFr(m.top.san))}</strong> <span class="eval">${p1(share)} des parties</span>
          <span class="muted small">${m.total.toLocaleString('fr-FR')} parties · score ${turn === 'w' ? 'Blancs' : 'Noirs'} ${p1(m.top.score)}</span>`;
      }
    } else body = '—';
    return `<div class="opt-block"><p class="label">Coup des maîtres — joueurs titrés 2200+ FIDE</p><p>${body}</p>${this.masterGames()}</div>`;
  }

  masterGames() {
    const m = this.masters;
    if (m.status !== 'ok' || !m.games.length) return '';
    const res = (g) => (g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½');
    return `<details class="master-games"><summary>Parties de référence (${m.games.length})</summary><ul>
      ${m.games.map((g) => `<li><button type="button" class="link-btn" data-master="${esc(g.id)}">${esc(g.white.name)} (${g.white.rating}) – ${esc(g.black.name)} (${g.black.rating})</button>
        <span class="muted small">${res(g)}, ${esc(String(g.year))}${g.uci ? ' · ' + esc(sanFr(uciToSan(this.game.fen(), g.uci) || g.uci)) : ''}</span></li>`).join('')}
    </ul><p class="muted tiny">Toucher une partie l’ouvre sur l’échiquier (votre partie actuelle est sauvegardée).</p></details>`;
  }

  blockElite(turn) {
    const e = this.elite;
    let body;
    if (e.status === 'loading') body = '<span class="state"><span class="spinner"></span>Jeu de données Élite…</span>';
    else if (e.status === 'unavailable') body = `<span class="muted">Jeu de données Élite non publié sur ce site (${esc(e.error)}).</span>`;
    else if (e.status === 'absent') body = `<span class="muted elite-absent">${esc(absentText(e.meta))}</span>`; else if (e.status === 'ok' && e.top) {
      const share = (100 * e.top.stats.total) / e.total;
      body = `<strong class="mv-elite">${esc(sanFr(e.top.san))}</strong> <span class="eval">${p1(share)} des parties</span>
        <span class="muted small">${e.total.toLocaleString('fr-FR')} parties · score ${turn === 'w' ? 'Blancs' : 'Noirs'} ${p1(e.top.score)} · ${splitText(e.split)}</span>`;
    } else body = '—';
    const meta = e.meta ? `<p class="muted tiny">${esc(eliteSummary(e.meta))}</p>` : '';
    return `<div class="opt-block elite-block"><p class="label">Élite blitz/rapide — top ${e.meta?.filters?.top ?? 50} Lichess et Chess.com</p><p>${body}</p>
      <p class="muted small">Fréquences observées chez les meilleurs joueurs en ligne (blitz/rapide), pas une évaluation moteur.</p>${meta}${this.eliteGames()}</div>`;
  }

  eliteGames() {
    const e = this.elite;
    if (e.status !== 'ok' || !e.games.length) return '';
    return `<details class="master-games elite-games"><summary>Parties exemples (${e.games.length})</summary><ul>
      ${e.games.map((g, i) => `<li><button type="button" class="link-btn" data-elite-game="${i}">${esc(g.label)}</button>
        <span class="muted small">${esc(g.r.replace('1/2-1/2', '½-½'))}, ${esc(String(g.y))} · ${esc(g.platform)} ${esc(SPEED_LABELS[g.s] || g.s)}</span>
        <a class="tiny" href="${esc(g.url)}" target="_blank" rel="noopener" title="Voir la partie sur ${esc(g.platform)}">↗</a></li>`).join('')}
    </ul><p class="muted tiny">Toucher une partie l’ouvre sur l’échiquier (votre partie actuelle est sauvegardée).</p></details>`;
  }

  filters(f) {
    const presetOpts = Object.entries(PRESETS).map(([k, v]) => `<option value="${k}" ${f.preset === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
    return `<details class="opt-filters" ${f.open ? 'open' : ''}>
      <summary>3 · Filtre de niveau : ${esc(this.filterSummary(f))}</summary>
      <label class="row">Préréglage
        <select data-f="preset"><option value="perso" ${f.preset === 'perso' ? 'selected' : ''}>Personnalisé</option>${presetOpts}</select>
      </label>
      <fieldset><legend>Classement Lichess</legend>
        ${RATING_BUCKETS.map((r) => `<label><input type="checkbox" data-f="rating" value="${r}" ${f.ratings.includes(r) ? 'checked' : ''}> ${bucketLabel(r)}</label>`).join('')}
      </fieldset>
      <fieldset><legend>Cadence</legend>
        ${SPEEDS.map((s) => `<label><input type="checkbox" data-f="speed" value="${s}" ${f.speeds.includes(s) ? 'checked' : ''}> ${SPEED_LABELS[s]}</label>`).join('')}
      </fieldset>
      <label class="row">Minimum de parties par coup
        <input type="number" min="1" max="100000" step="1" data-f="min" value="${f.minGames}">
      </label>
      <p class="muted small">Classements Lichess uniquement (Chess.com ne publie pas de statistiques d’ouvertures par niveau). À niveau égal, les classements Lichess sont en général plus élevés que ceux de Chess.com : un « 1000 Chess.com » correspond plutôt à une tranche Lichess supérieure.</p>
    </details>`;
  }

  filterSummary(f) {
    const r = f.ratings.length ? f.ratings.map(bucketLabel).join(', ') : 'tous classements';
    const s = f.speeds.length ? f.speeds.map((x) => SPEED_LABELS[x]).join(', ') : 'toutes cadences';
    return `${s} · ${r}`;
  }

  table(fen) {
    const src = this.tableSource;
    const e = { niveau: this.explorer, maitres: this.masters, elite: this.elite }[src];
    const toggle = `<div class="seg" role="tablist">
      <button type="button" data-src="niveau" aria-selected="${src === 'niveau'}">Mon niveau</button>
      <button type="button" data-src="maitres" aria-selected="${src === 'maitres'}">Maîtres</button>
      <button type="button" data-src="elite" aria-selected="${src === 'elite'}">Élite blitz/rapide</button></div>`;
    if (e.status !== 'ok' || !e.moves.length) {
      const empty = { niveau: 'Aucune partie à ce niveau.', maitres: 'Aucune partie de maître dans cette position.', elite: 'Position absente du jeu Élite (ou jeu de données non publié).' }[src];
      return [this.explorer, this.masters, this.elite].some((x) => x.status === 'ok' || x.status === 'absent')
        ? `<div class="opt-table">${toggle}<p class="muted small">${empty}</p></div>` : '';
    }
    if (src !== 'niveau') e.filter = { minGames: 1 };
    const elite = src === 'elite';
    const opening = e.opening ? `<p class="small"><span class="badge">${esc(e.opening.eco)}</span> ${esc(e.opening.name)}</p>` : '';
    const rows = e.moves.map((m) => {
      const s = m.stats;
      const isBest = e.best && m.uci === e.best.uci;
      const small = s.total < e.filter.minGames;
      return `<tr class="${isBest ? 'best' : ''} ${small ? 'small-sample' : ''}">
        <td><button type="button" class="link-btn" data-play="${m.uci}" title="Jouer ce coup sur l’échiquier">${esc(sanFr(m.san))}</button></td>
        <td class="num">${s.total.toLocaleString('fr-FR')}</td>
        <td><div class="wdl-bar" title="Blancs ${p1(s.white)} · nulles ${p1(s.draws)} · Noirs ${p1(s.black)}">
          <span class="w" style="width:${s.white}%"></span><span class="d" style="width:${s.draws}%"></span><span class="b" style="width:${s.black}%"></span></div>
          <span class="tiny">${p1(s.white)} / ${p1(s.draws)} / ${p1(s.black)}</span></td>
        <td class="num">${p1(m.win)}</td>
        ${elite ? `<td class="num tiny">${m.li} / ${m.cc}</td>` : ''}
      </tr>`;
    }).join('');
    const total = e.stats;
    const note = {
      niveau: ` Source : ${e.mode === 'relais' ? 'relais Cloudflare' : 'jeton personnel'}.`,
      maitres: ' Base Lichess des parties à la cadence classique de joueurs titrés.',
      elite: ` Parties blitz/rapide des meilleurs joueurs Lichess et Chess.com (${splitText(e.split)}) : fréquences observées, pas une évaluation.`,
    }[src];
    return `<div class="opt-table">
      ${toggle}
      ${opening}
      <p class="muted small">${e.total.toLocaleString('fr-FR')} parties ${{ niveau: '', maitres: 'de maîtres ', elite: 'Élite ' }[src]}dans cette position (Blancs ${p1(total.white)} · nulles ${p1(total.draws)} · Noirs ${p1(total.black)}).${note}</p>
      <table>
        <thead><tr><th>Coup</th><th>Parties</th><th>Blancs / nulles / Noirs</th><th>% victoire ${e.turn === 'w' ? 'Blancs' : 'Noirs'}</th>${elite ? '<th title="Parties Lichess / Chess.com">Li / C.com</th>' : ''}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="muted small">${src === 'niveau' ? `Grisé : moins de ${e.filter.minGames} parties. ` : ''}Toucher un coup le joue sur l’échiquier.</p>
    </div>`;
  }

  bind() {
    this.el.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => { this.tableSource = b.dataset.src; this.render(); }));
    this.el.querySelectorAll('[data-master]').forEach((b) => b.addEventListener('click', () => this.onOpenMaster?.(b.dataset.master)));
    this.el.querySelectorAll('[data-elite-game]').forEach((b) => b.addEventListener('click', () => {
      const g = this.elite.games?.[Number(b.dataset.eliteGame)];
      if (g) this.onOpenGame?.(g.san, `la partie ${g.label}`, eliteHeaders(g));
    }));
    const f = { ...this.getFilter() };
    const apply = (patch) => {
      this.setFilter({ ...f, ...patch, open: true });
      if (this.game) this.update(this.game);
    };
    this.el.querySelector('[data-f=preset]')?.addEventListener('change', (ev) => {
      const p = PRESETS[ev.target.value];
      apply(p ? { preset: ev.target.value, ratings: [...p.ratings], speeds: [...p.speeds] } : { preset: 'perso' });
    });
    this.el.querySelectorAll('[data-f=rating]').forEach((cb) => cb.addEventListener('change', () => {
      const ratings = [...this.el.querySelectorAll('[data-f=rating]:checked')].map((x) => Number(x.value));
      apply({ preset: 'perso', ratings });
    }));
    this.el.querySelectorAll('[data-f=speed]').forEach((cb) => cb.addEventListener('change', () => {
      const speeds = [...this.el.querySelectorAll('[data-f=speed]:checked')].map((x) => x.value);
      apply({ preset: 'perso', speeds });
    }));
    this.el.querySelector('[data-f=min]')?.addEventListener('change', (ev) => {
      const v = Math.max(1, Number(ev.target.value) || 1);
      this.setFilter({ ...f, minGames: v, open: true });
      if (this.explorer.status === 'ok') {
        this.explorer.best = bestByWinRate(this.explorer.moves, v);
        this.explorer.filter = { ...this.explorer.filter, minGames: v };
        this.render();
        this.onChange();
      }
    });
    this.el.querySelector('details.opt-filters')?.addEventListener('toggle', (ev) => {
      this.setFilter({ ...this.getFilter(), open: ev.target.open });
    });
    this.el.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => this.onPlay?.(b.dataset.play)));
  }
}
