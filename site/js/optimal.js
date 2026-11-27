// Panneau « Coup optimal » de la page Moteur.
// Sources clairement séparées :
//   1. Stockfish local (calcul en direct sur l'appareil, fourni par main.js) ;
//   2. Lichess Cloud Eval (évaluation déjà en cache chez Lichess, si elle existe) ;
//   3. Opening Explorer (fréquences de résultats dans des parties réelles, filtrées par niveau) ;
//   4. Élite blitz/rapide (data/elite.json : fréquences chez les meilleurs joueurs en ligne).
// Un fort % de victoire ne signifie pas que le coup est objectivement le meilleur.
import { Chess } from '../vendor/chess.js';
import { boutonLichess } from './lien-lichess.js';
import {
  RATING_BUCKETS, SPEEDS, SPEED_LABELS, PRESETS, bucketLabel, enrichMoves, bestByWinRate,
} from './lichess.js';
import { sanFr, formatScore, COLOR_NAMES } from './analysis.js';
import { loadElite, lookupElite, eliteSummary, absentText, splitText, eliteHeaders, SOURCE_LABELS, NOCAMP_TEXT, CAMP_LABEL } from './elite.js';
import { loadSettings } from './storage.js';
import { langue } from './i18n.js';

// Phrases en français ou en anglais selon la langue de l'interface.
const L = (fr, en) => (langue() === 'en' ? en : fr);
const LOC = () => L('fr-FR', 'en-US');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p1 = (x) => L(x.toFixed(1).replace('.', ',') + ' %', x.toFixed(1) + '%');
const camp = (turn) => (turn === 'w' ? L('Blancs', 'White') : L('Noirs', 'Black'));

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
      this.elite = r.status === 'ok' ? { ...lookupElite(r.data, fen, { camp: !!loadSettings().eliteCamp, side: game.playerColor || 'w' }), meta: r.data.meta, source: r.source } : r;
      this.render();
    });

    this.client.cloudEval(fen, { isStale }).then((r) => {
      if (r.stale || isStale()) return;
      if (r.status === 'absent') this.cloud = { status: 'absent' };
      else {
        const pv = r.pvs[0];
        const san = pv?.moves[0] ? uciToSan(fen, pv.moves[0]) : null;
        if (!san) this.cloud = { status: 'error', error: L('Coup Cloud Eval illégal ou absent : ignoré.', 'Cloud Eval move illegal or missing: ignored.') };
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
    const head = `<h2>${L('Coup optimal', 'Best move')} <span class="muted small">— ${L(`trait aux ${side}`, `${camp(turn)} to move`)}</span></h2>`;
    if (this.hidden) {
      this.el.innerHTML = `${head}
        <p class="muted">${L('Masqué en mode « Indice d’abord » : touchez « Montrer le coup » pour voir le coup du moteur et les statistiques.', 'Hidden in “Hint first” mode: tap “Show the move” to see the engine move and the statistics.')}</p>`;
      return;
    }
    this.el.innerHTML = `
      ${head}
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
    if (this.engineStatus === 'error') body = `<span class="error-text">${L('Moteur indisponible', 'Engine unavailable')}</span>`;
    else if (!a) body = `<span class="state"><span class="spinner"></span>${L('calcul…', 'computing…')}</span>`;
    else body = `<strong class="mv-best">${esc(sanFr(a.best.san))}</strong> <span class="eval">${esc(a.scoreText)}</span>
      <span class="muted small">${L('prof.', 'depth')} ${a.depth ?? '—'}, ${L(((a.timeMs || 0) / 1000).toFixed(1).replace('.', ','), ((a.timeMs || 0) / 1000).toFixed(1))} s</span>`;
    return `<div class="opt-block"><p class="label">${L('1 · Meilleur coup — Stockfish (cet appareil)', '1 · Best move — Stockfish (this device)')}</p><p>${body}</p></div>`;
  }

  blockCloud() {
    const c = this.cloud;
    let body;
    if (c.status === 'loading') body = '<span class="state"><span class="spinner"></span>Lichess…</span>';
    else if (c.status === 'absent') body = `<span class="muted">${L('Position absente du cache Lichess (aucune évaluation cloud).', 'Position not in the Lichess cache (no cloud evaluation).')}</span>`;
    else if (c.status === 'error') body = `<span class="error-text">${esc(c.error)}</span>`;
    else if (c.status === 'ok') {
      body = `<strong>${esc(sanFr(c.san))}</strong> <span class="eval">${esc(formatScore(c.score))}</span>
        <span class="muted small">${L('prof.', 'depth')} ${c.depth}, ${Math.round(c.knodes / 1000)} ${L('M nœuds', 'M nodes')}</span>`;
    } else body = '—';
    return `<div class="opt-block"><p class="label">${L('Évaluation Lichess Cloud Eval', 'Lichess Cloud Eval evaluation')}</p><p>${body}</p></div>`;
  }

  blockStats(turn) {
    const e = this.explorer;
    let body;
    if (e.status === 'loading') body = '<span class="state"><span class="spinner"></span>Opening Explorer…</span>';
    else if (e.status === 'notoken') body = boutonLichess();
    else if (e.status === 'error') body = `<span class="error-text">${esc(e.error)}</span>`;
    else if (e.status === 'ok') {
      if (!e.total) body = `<span class="muted">${L('Aucune partie trouvée avec ce filtre.', 'No games found with this filter.')}</span>`;
      else if (!e.best) body = `<span class="muted">${L(`Aucun coup n’atteint ${e.filter.minGames} parties : échantillon trop petit pour conclure.`, `No move reaches ${e.filter.minGames} games: sample too small to conclude.`)}</span>`;
      else {
        body = `<strong class="mv-stat">${esc(sanFr(e.best.san))}</strong> <span class="eval">${L(`${p1(e.best.win)} de victoires ${turn === 'w' ? 'blanches' : 'noires'}`, `${p1(e.best.win)} ${camp(turn)} wins`)}</span>
          <span class="muted small">${L(`sur ${e.best.stats.total.toLocaleString('fr-FR')} parties`, `out of ${e.best.stats.total.toLocaleString('en-US')} games`)}</span>`;
      }
    } else body = '—';
    return `<div class="opt-block"><p class="label">${L('2 · Meilleur % de victoire — parties réelles Lichess', '2 · Best win % — real Lichess games')}</p><p>${body}</p>
      <p class="muted small">${L('Fréquence observée à ce niveau, pas une évaluation : un coup peut gagner souvent parce que l’adversaire se trompe.', 'Observed frequency at this level, not an evaluation: a move can win often because the opponent goes wrong.')}</p></div>`;
  }

  blockMasters(turn) {
    const m = this.masters;
    let body;
    if (m.status === 'loading') body = `<span class="state"><span class="spinner"></span>${L('Base des maîtres…', 'Masters database…')}</span>`;
    else if (m.status === 'notoken') body = `<span class="muted">${L('Avec la connexion Lichess (bouton ci-dessus).', 'With the Lichess login (button above).')}</span>`;
    else if (m.status === 'error') body = `<span class="error-text">${esc(m.error)}</span>`;
    else if (m.status === 'ok') {
      if (!m.total || !m.top) body = `<span class="muted">${L('Position jamais atteinte dans les parties de maîtres : vous êtes hors de la théorie.', 'Position never reached in masters’ games: you are out of theory.')}</span>`;
      else {
        const share = (100 * m.top.stats.total) / m.total;
        body = `<strong class="mv-master">${esc(sanFr(m.top.san))}</strong> <span class="eval">${p1(share)} ${L('des parties', 'of games')}</span>
          <span class="muted small">${m.total.toLocaleString(LOC())} ${L('parties', 'games')} · score ${camp(turn)} ${p1(m.top.score)}</span>`;
      }
    } else body = '—';
    return `<div class="opt-block"><p class="label">${L('Coup des maîtres — joueurs titrés 2200+ FIDE', 'Masters’ move — titled players 2200+ FIDE')}</p><p>${body}</p>${this.masterGames()}</div>`;
  }

  masterGames() {
    const m = this.masters;
    if (m.status !== 'ok' || !m.games.length) return '';
    const res = (g) => (g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½');
    return `<details class="master-games"><summary>${L('Parties de référence', 'Reference games')} (${m.games.length})</summary><ul>
      ${m.games.map((g) => `<li><button type="button" class="link-btn" data-master="${esc(g.id)}">${esc(g.white.name)} (${g.white.rating}) – ${esc(g.black.name)} (${g.black.rating})</button>
        <span class="muted small">${res(g)}, ${esc(String(g.year))}${g.uci ? ' · ' + esc(sanFr(uciToSan(this.game.fen(), g.uci) || g.uci)) : ''}</span></li>`).join('')}
    </ul><p class="muted tiny">${L('Toucher une partie l’ouvre sur l’échiquier (votre partie actuelle est sauvegardée).', 'Tapping a game opens it on the board (your current game is saved).')}</p></details>`;
  }

  blockElite(turn) {
    const e = this.elite;
    let body;
    if (e.status === 'loading') body = `<span class="state"><span class="spinner"></span>${L('Jeu de données Élite…', 'Elite dataset…')}</span>`;
    else if (e.status === 'unavailable') body = `<span class="muted">${L(`Jeu de données Élite non publié sur ce site (${esc(e.error)}).`, `Elite dataset not published on this site (${esc(e.error)}).`)}</span>`;
    else if (e.status === 'nocamp') body = `<span class="muted elite-absent">${esc(NOCAMP_TEXT)}</span>`;
    else if (e.status === 'absent') body = `<span class="muted elite-absent">${esc(absentText(e.meta, e.camp))}</span>`; else if (e.status === 'ok' && e.top) {
      const share = (100 * e.top.stats.total) / e.total;
      body = `<strong class="mv-elite">${esc(sanFr(e.top.san))}</strong> <span class="eval">${p1(share)} ${L('des parties', 'of games')}</span>
        <span class="muted small">${e.total.toLocaleString(LOC())} ${L('parties', 'games')} · score ${camp(turn)} ${p1(e.top.score)} · ${splitText(e.split)}</span>`;
    } else body = '—';
    const meta = e.meta ? `<p class="muted tiny elite-fresh">${esc(eliteSummary(e.meta))} ${L('Source :', 'Source:')} ${esc(SOURCE_LABELS[e.source] || '?')}.</p>` : '';
    return `<div class="opt-block elite-block"><p class="label">${L(`Élite blitz/rapide — top ${e.meta?.filters?.top ?? 50} Lichess et Chess.com`, `Elite blitz/rapid — top ${e.meta?.filters?.top ?? 50} Lichess and Chess.com`)}${e.camp ? ` · ${CAMP_LABEL}` : ''}</p><p>${body}</p>
      <p class="muted small">${L('Fréquences observées chez les meilleurs joueurs en ligne (blitz/rapide), pas une évaluation moteur.', 'Observed frequencies among the best online players (blitz/rapid), not an engine evaluation.')}</p>${meta}${this.eliteGames()}</div>`;
  }

  eliteGames() {
    const e = this.elite;
    if (e.status !== 'ok' || !e.games.length) return '';
    return `<details class="master-games elite-games"><summary>${L('Parties exemples', 'Example games')} (${e.games.length})</summary><ul>
      ${e.games.map((g, i) => `<li><button type="button" class="link-btn" data-elite-game="${i}">${esc(g.label)}</button>
        <span class="muted small">${esc(g.r.replace('1/2-1/2', '½-½'))}, ${esc(String(g.y))} · ${esc(g.platform)} ${esc(SPEED_LABELS[g.s] || g.s)}</span>
        <a class="tiny" href="${esc(g.url)}" target="_blank" rel="noopener" title="${L(`Voir la partie sur ${esc(g.platform)}`, `View the game on ${esc(g.platform)}`)}">↗</a></li>`).join('')}
    </ul><p class="muted tiny">${L('Toucher une partie l’ouvre sur l’échiquier (votre partie actuelle est sauvegardée).', 'Tapping a game opens it on the board (your current game is saved).')}</p></details>`;
  }

  filters(f) {
    const presetOpts = Object.entries(PRESETS).map(([k, v]) => `<option value="${k}" ${f.preset === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
    return `<details class="opt-filters" ${f.open ? 'open' : ''}>
      <summary>${L('3 · Filtre de niveau :', '3 · Level filter:')} ${esc(this.filterSummary(f))}</summary>
      <label class="row">${L('Préréglage', 'Preset')}
        <select data-f="preset"><option value="perso" ${f.preset === 'perso' ? 'selected' : ''}>${L('Personnalisé', 'Custom')}</option>${presetOpts}</select>
      </label>
      <fieldset><legend>${L('Classement Lichess', 'Lichess rating')}</legend>
        ${RATING_BUCKETS.map((r) => `<label><input type="checkbox" data-f="rating" value="${r}" ${f.ratings.includes(r) ? 'checked' : ''}> ${bucketLabel(r)}</label>`).join('')}
      </fieldset>
      <fieldset><legend>${L('Cadence', 'Time control')}</legend>
        ${SPEEDS.map((s) => `<label><input type="checkbox" data-f="speed" value="${s}" ${f.speeds.includes(s) ? 'checked' : ''}> ${SPEED_LABELS[s]}</label>`).join('')}
      </fieldset>
      <label class="row">${L('Minimum de parties par coup', 'Minimum games per move')}
        <input type="number" min="1" max="100000" step="1" data-f="min" value="${f.minGames}">
      </label>
      <p class="muted small">${L('Classements Lichess uniquement (Chess.com ne publie pas de statistiques d’ouvertures par niveau). À niveau égal, les classements Lichess sont en général plus élevés que ceux de Chess.com : un « 1000 Chess.com » correspond plutôt à une tranche Lichess supérieure.', 'Lichess ratings only (Chess.com does not publish opening statistics by level). At equal strength, Lichess ratings are usually higher than Chess.com ones: a “1000 Chess.com” rather matches a higher Lichess bracket.')}</p>
    </details>`;
  }

  filterSummary(f) {
    const r = f.ratings.length ? f.ratings.map(bucketLabel).join(', ') : L('tous classements', 'all ratings');
    const s = f.speeds.length ? f.speeds.map((x) => SPEED_LABELS[x]).join(', ') : L('toutes cadences', 'all time controls');
    return `${s} · ${r}`;
  }

  table(fen) {
    const src = this.tableSource;
    const e = { niveau: this.explorer, maitres: this.masters, elite: this.elite }[src];
    const toggle = `<div class="seg" role="tablist">
      <button type="button" data-src="niveau" aria-selected="${src === 'niveau'}">${L('Mon niveau', 'My level')}</button>
      <button type="button" data-src="maitres" aria-selected="${src === 'maitres'}">${L('Maîtres', 'Masters')}</button>
      <button type="button" data-src="elite" aria-selected="${src === 'elite'}">${L('Élite blitz/rapide', 'Elite blitz/rapid')}</button></div>`;
    if (e.status !== 'ok' || !e.moves.length) {
      const empty = { niveau: L('Aucune partie à ce niveau.', 'No games at this level.'), maitres: L('Aucune partie de maître dans cette position.', 'No master games in this position.'), elite: L('Position absente du jeu Élite (ou jeu de données non publié).', 'Position not in the Elite dataset (or dataset not published).') }[src];
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
        <td><button type="button" class="link-btn" data-play="${m.uci}" title="${L('Jouer ce coup sur l’échiquier', 'Play this move on the board')}">${esc(sanFr(m.san))}</button></td>
        <td class="num">${s.total.toLocaleString(LOC())}</td>
        <td><div class="wdl-bar" title="${L(`Blancs ${p1(s.white)} · nulles ${p1(s.draws)} · Noirs ${p1(s.black)}`, `White ${p1(s.white)} · draws ${p1(s.draws)} · Black ${p1(s.black)}`)}">
          <span class="w" style="width:${s.white}%"></span><span class="d" style="width:${s.draws}%"></span><span class="b" style="width:${s.black}%"></span></div>
          <span class="tiny">${p1(s.white)} / ${p1(s.draws)} / ${p1(s.black)}</span></td>
        <td class="num">${p1(m.win)}</td>
        ${elite && e.split ? `<td class="num tiny">${m.li} / ${m.cc}${e.split.bc ? ` / ${m.bc}` : ''}</td>` : ''}
      </tr>`;
    }).join('');
    const total = e.stats;
    const note = {
      niveau: L(` Source : ${e.mode === 'relais' ? 'relais Cloudflare' : 'jeton personnel'}.`, ` Source: ${e.mode === 'relais' ? 'Cloudflare relay' : 'personal token'}.`),
      maitres: L(' Base Lichess des parties à la cadence classique de joueurs titrés.', ' Lichess database of classical games by titled players.'),
      elite: L(` Parties blitz/rapide des meilleurs joueurs Lichess et Chess.com (${splitText(e.split)}) : fréquences observées, pas une évaluation.`, ` Blitz/rapid games of the best Lichess and Chess.com players (${splitText(e.split)}): observed frequencies, not an evaluation.`),
    }[src];
    return `<div class="opt-table">
      ${toggle}
      ${opening}
      <p class="muted small">${L(`${e.total.toLocaleString('fr-FR')} parties ${{ niveau: '', maitres: 'de maîtres ', elite: 'Élite ' }[src]}dans cette position (Blancs ${p1(total.white)} · nulles ${p1(total.draws)} · Noirs ${p1(total.black)}).`, `${e.total.toLocaleString('en-US')} ${{ niveau: '', maitres: 'master ', elite: 'Elite ' }[src]}games in this position (White ${p1(total.white)} · draws ${p1(total.draws)} · Black ${p1(total.black)}).`)}${note}</p>
      <table>
        <thead><tr><th>${L('Coup', 'Move')}</th><th>${L('Parties', 'Games')}</th><th>${L('Blancs / nulles / Noirs', 'White / draws / Black')}</th><th>${L(`% victoire ${e.turn === 'w' ? 'Blancs' : 'Noirs'}`, `${camp(e.turn)} win %`)}</th>${elite && e.split ? `<th title="${L(`Parties Lichess / Chess.com${e.split.bc ? ' / tournois retransmis' : ''}`, `Lichess / Chess.com games${e.split.bc ? ' / broadcast tournaments' : ''}`)}">Li / C.com${e.split.bc ? L(' / Tourn.', ' / Tourn.') : ''}</th>` : ''}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="muted small">${src === 'niveau' ? L(`Grisé : moins de ${e.filter.minGames} parties. `, `Greyed out: fewer than ${e.filter.minGames} games. `) : ''}${L('Toucher un coup le joue sur l’échiquier.', 'Tapping a move plays it on the board.')}</p>
    </div>`;
  }

  bind() {
    this.el.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => { this.tableSource = b.dataset.src; this.render(); }));
    this.el.querySelectorAll('[data-master]').forEach((b) => b.addEventListener('click', () => this.onOpenMaster?.(b.dataset.master)));
    this.el.querySelectorAll('[data-elite-game]').forEach((b) => b.addEventListener('click', () => {
      const g = this.elite.games?.[Number(b.dataset.eliteGame)];
      if (g) this.onOpenGame?.(g.san, L(`la partie ${g.label}`, `the game ${g.label}`), eliteHeaders(g));
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
