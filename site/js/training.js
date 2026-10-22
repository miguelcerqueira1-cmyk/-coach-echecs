// Page « Entraînement » : l'application joue l'adversaire, l'utilisateur doit trouver
// le coup de son répertoire. Coups adverses tirés des parties Lichess du niveau choisi
// (fréquences réelles, coups loufoques compris) ou, à défaut, des fiches du répertoire.
// Les coups hors répertoire sont jugés par Stockfish (perte d'évaluation).
import { Chess } from '../vendor/chess.js';
import { Board } from './board.js';
import { START_FEN } from './lines.js';
import { sanFr, formatScore } from './analysis.js';
import { buildTree, key, weightedPick, verdict, VERDICT_TEXT, cpFrom } from './training-core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PREFS = 'coach-echecs:entrainement';
const pct = (x) => x.toFixed(0) + ' %';
const toObj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

function loadPrefs() {
  try { return { rep: 'gd', source: 'lichess', length: 8, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { rep: 'gd', source: 'lichess', length: 8 }; }
}

export class TrainingPage {
  constructor({ el, engine, client, getFilter, filterLabel }) {
    this.el = el;
    this.engine = engine;
    this.client = client;
    this.getFilter = getFilter;
    this.filterLabel = filterLabel;
    this.data = null;
    this.s = null; // session en cours
    this.prefs = loadPrefs();
    this.sessionNo = 0;
  }

  async show() {
    if (!this.data) {
      try {
        this.data = await (await fetch('./data/repertoire.json', { cache: 'no-cache' })).json();
      } catch {
        this.el.innerHTML = '<p class="errbox pad">Impossible de charger le répertoire.</p>';
        return;
      }
    }
    if (!this.s) this.renderSetup();
  }

  // ---------- Écran de départ ----------

  renderSetup() {
    const p = this.prefs;
    const hasLichess = !!this.client.explorerMode();
    this.el.innerHTML = `<div class="train-setup card">
      <h2>Entraînement du répertoire</h2>
      <p class="small">L’application joue l’adversaire ; à vous de trouver le coup de votre répertoire, sans aide. Chaque coup est vérifié (fiche ou Stockfish).</p>
      <label class="row">Répertoire
        <select data-p="rep">
          <option value="gd" ${p.rep === 'gd' ? 'selected' : ''}>Gambit Dame (vous avez les Blancs)</option>
          <option value="ck" ${p.rep === 'ck' ? 'selected' : ''}>Caro-Kann (vous avez les Noirs)</option>
        </select>
      </label>
      <label class="row">Coups de l’adversaire
        <select data-p="source">
          <option value="lichess" ${p.source === 'lichess' ? 'selected' : ''} ${hasLichess ? '' : 'disabled'}>Parties réelles Lichess (${esc(this.filterLabel())})</option>
          <option value="fiches" ${p.source === 'fiches' || !hasLichess ? 'selected' : ''}>Lignes des fiches seulement</option>
        </select>
      </label>
      ${hasLichess ? '' : '<p class="muted small">Pour des adversaires tirés des vraies parties de votre niveau, ajoutez votre jeton Lichess (⚙).</p>'}
      <label class="row">Nombre de vos coups
        <select data-p="length">${[5, 8, 12, 16].map((n) => `<option value="${n}" ${Number(p.length) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <p class="muted small">Le filtre de niveau se règle dans « Coup optimal », page Moteur.</p>
      <div class="actions"><button type="button" class="primary" data-start>Commencer</button></div>
    </div>`;
    this.el.querySelectorAll('[data-p]').forEach((sel) => sel.addEventListener('change', () => {
      this.prefs[sel.dataset.p] = sel.value;
      try { localStorage.setItem(PREFS, JSON.stringify(this.prefs)); } catch { /* rien */ }
    }));
    this.el.querySelector('[data-start]').addEventListener('click', () => this.start());
  }

  // ---------- Session ----------

  start() {
    const p = this.prefs;
    const color = p.rep === 'gd' ? 'w' : 'b';
    const source = p.source === 'lichess' && this.client.explorerMode() ? 'lichess' : 'fiches';
    this.sessionNo++;
    this.s = {
      id: `entrainement-${this.sessionNo}`, rep: p.rep, color, source, length: Number(p.length) || 8,
      chess: new Chess(), path: [], ours: 0, results: [], log: [], busy: false, done: false, pending: null, rev: 0,
      tree: buildTree(this.data.entries, p.rep),
    };
    this.el.innerHTML = `<div class="train-layout">
      <section><div class="train-status" data-status></div><div class="board-wrap" data-board></div>
        <div class="actions"><button type="button" data-stop>Arrêter</button><button type="button" data-restart>Recommencer</button></div></section>
      <section class="card train-panel"><div data-score></div><ol class="train-log" data-log></ol></section>
    </div>`;
    this.board = new Board(this.el.querySelector('[data-board]'), { piecesUrl: './pieces/', onMove: (mv) => this.onUserMove(mv) });
    this.board.setOrientation(color);
    this.el.querySelector('[data-stop]').addEventListener('click', () => this.finish('Session arrêtée.'));
    this.el.querySelector('[data-restart]').addEventListener('click', () => this.start());
    this.render();
    if (color === 'b') this.opponentMove();
  }

  token() { return { gameId: this.s.id, branchId: 'entrainement', revision: ++this.s.rev, ply: this.s.path.length }; }
  alive(s) { return this.s === s && !s.done; }

  msg(html, cls = '') { this.s.log.unshift({ html, cls }); }

  render() {
    const s = this.s;
    if (!s) return;
    const myTurn = s.chess.turn() === s.color && !s.busy && !s.done && !s.pending;
    const last = s.chess.history({ verbose: true }).at(-1) || null;
    this.board.setPosition(s.chess, { lastMove: last, interactive: myTurn });
    this.board.setArrows(s.pending?.arrow ? [s.pending.arrow] : []);
    const st = this.el.querySelector('[data-status]');
    st.className = 'train-status ' + (s.done ? 'over' : myTurn ? 'player' : 'opponent');
    st.innerHTML = s.done ? 'Session terminée'
      : s.busy ? '<span class="spinner"></span> ' + esc(s.busy)
      : s.pending ? 'Choisissez : réessayer ou continuer'
      : myTurn ? `À vous (${s.color === 'w' ? 'Blancs' : 'Noirs'}) : trouvez le coup de votre répertoire` : 'L’adversaire réfléchit…';
    const ok = s.results.filter((r) => r.ok).length;
    const book = s.results.filter((r) => r.level === 'repertoire').length;
    this.el.querySelector('[data-score]').innerHTML = `<h2>Score : ${ok} / ${s.results.length}</h2>
      <p class="small muted">${book} coup(s) du répertoire · coup ${s.ours} / ${s.length} · adversaire : ${s.source === 'lichess' ? 'parties Lichess (' + esc(this.filterLabel()) + ')' : 'lignes des fiches'}</p>
      ${s.pending ? `<div class="actions"><button type="button" data-retry>↺ Réessayer</button><button type="button" class="primary" data-fix>Continuer avec ${esc(sanFr(s.pending.bestSan))}</button></div>` : ''}
      ${s.done ? '<div class="actions"><button type="button" class="primary" data-again>Nouvelle session</button><button type="button" data-setup>Changer de réglages</button></div>' : ''}`;
    this.el.querySelector('[data-log]').innerHTML = s.log.map((l) => `<li class="${l.cls}">${l.html}</li>`).join('');
    this.el.querySelector('[data-retry]')?.addEventListener('click', () => this.retry());
    this.el.querySelector('[data-fix]')?.addEventListener('click', () => this.continueWithBest());
    this.el.querySelector('[data-again]')?.addEventListener('click', () => this.start());
    this.el.querySelector('[data-setup]')?.addEventListener('click', () => { this.s = null; this.renderSetup(); });
  }

  play(uci) {
    const mv = this.s.chess.move(toObj(uci));
    this.s.path.push(mv.lan);
    return mv;
  }

  // ---------- Coup de l'adversaire ----------

  async opponentMove() {
    const s = this.s;
    if (!this.alive(s)) return;
    if (s.ours >= s.length) { this.finish('Objectif atteint.'); return; }
    if (s.chess.isGameOver()) { this.finish('Fin de partie sur l’échiquier.'); return; }
    s.busy = 'L’adversaire choisit son coup…';
    this.render();
    let pick = null;
    let info = '';
    if (s.rep === 'ck' && s.path.length === 0) {
      pick = { uci: 'e2e4' };
      info = 'ouverture imposée pour la Caro-Kann';
    } else if (s.source === 'lichess') {
      try {
        const f = this.getFilter();
        const r = await this.client.explorer({ fen: START_FEN, play: s.path, ratings: f.ratings, speeds: f.speeds, moves: 30, isStale: () => !this.alive(s) });
        if (r.stale || !this.alive(s)) return;
        const legal = (u) => { try { new Chess(s.chess.fen()).move(toObj(u)); return true; } catch { return false; } };
        const moves = (r.moves || []).filter((m) => legal(m.uci)).map((m) => ({ uci: m.uci, weight: m.white + m.draws + m.black }));
        const total = moves.reduce((a, m) => a + m.weight, 0);
        pick = weightedPick(moves);
        if (pick) info = `joué dans ${pct((100 * pick.weight) / total)} des ${total.toLocaleString('fr-FR')} parties de ce niveau`;
      } catch (e) {
        this.msg(`Lichess indisponible (${esc(e.message)}) : coups tirés des fiches.`, 'muted');
      }
    }
    if (!pick) {
      const opts = s.tree.theirs.get(key(s.path));
      if (opts) {
        pick = weightedPick([...opts.entries()].map(([uci, infos]) => ({ uci, weight: infos.length })));
        if (pick) info = info || 'ligne des fiches';
      }
    }
    if (!this.alive(s)) return;
    s.busy = false;
    if (!pick) { this.finish(s.source === 'lichess' ? 'Plus aucune partie connue dans cette position avec ce filtre.' : 'Fin des lignes des fiches.'); return; }
    const mv = this.play(pick.uci);
    this.msg(`Adversaire : <strong>${esc(sanFr(mv.san))}</strong> <span class="muted">(${esc(info)})</span>`);
    const err = s.tree.errors.get(key(s.path));
    if (err) this.msg(`⚠ Erreur adverse connue (fiche « ${esc(err.nom)} ») : trouvez la punition !`, 'warn');
    if (s.chess.isGameOver()) { this.finish('Fin de partie sur l’échiquier.'); return; }
    this.render();
  }

  // ---------- Notre coup ----------

  async onUserMove(input) {
    const s = this.s;
    if (!this.alive(s) || s.busy || s.pending || s.chess.turn() !== s.color) return;
    const before = s.chess.fen();
    const k = key(s.path);
    let mv;
    try { mv = new Chess(before).move(input); } catch { return; }
    const uci = mv.lan;
    const book = s.tree.ours.get(k);
    const trap = s.tree.traps.get(k);
    const isBookMove = !!book?.has(uci);
    const isTrap = trap?.uci === uci;
    let best = null;
    let loss = null;
    if (!isBookMove) {
      s.busy = 'Stockfish vérifie votre coup…';
      this.play(uci);
      this.render();
      try {
        const rb = await this.engine.analyze({ position: `position fen ${before}`, movetime: 800, token: this.token() });
        if (rb.cancelled || !this.alive(s)) { if (this.alive(s)) { s.busy = false; this.render(); } return; }
        best = rb.bestmove;
        const cpBest = cpFrom(rb.info?.score, s.color, s.color);
        const after = new Chess(s.chess.fen());
        let cpAfter;
        if (after.isCheckmate()) cpAfter = 10000;
        else if (after.isDraw()) cpAfter = 0;
        else {
          const ra = await this.engine.analyze({ position: `position fen ${after.fen()}`, movetime: 800, token: this.token() });
          if (ra.cancelled || !this.alive(s)) { if (this.alive(s)) { s.busy = false; this.render(); } return; }
          cpAfter = cpFrom(ra.info?.score, after.turn(), s.color);
        }
        if (cpBest != null && cpAfter != null) loss = Math.max(0, cpBest - cpAfter);
      } catch (e) {
        this.msg(`Moteur indisponible (${esc(e.message)}) : coup non vérifié.`, 'muted');
      }
      s.chess.undo();
      s.path.pop();
      s.busy = false;
    }
    const v = verdict({ inBook: !!book, isBookMove, isTrap, loss });
    s.results.push({ ...v, san: mv.san });
    let html = `Vous : <strong>${esc(sanFr(mv.san))}</strong> — ${esc(VERDICT_TEXT[v.level])}`;
    if (loss != null && v.level !== 'repertoire') html += ` <span class="muted">(perte ≈ ${(loss / 100).toFixed(1).replace('.', ',')})</span>`;
    const bookMoves = book ? [...book.keys()] : [];
    const bookSan = bookMoves.map((u) => new Chess(before).move(toObj(u)).san);
    if (book && !isBookMove) {
      const fiche = book.get(bookMoves[0])[0];
      html += `<br><span class="small">Votre répertoire joue ${bookSan.map((x) => `<strong>${esc(sanFr(x))}</strong>`).join(' ou ')} (fiche « ${esc(fiche.nom)} »).</span>`;
    }
    if (isTrap) html += `<br><span class="small">${esc(trap.texte)}</span>`;
    const bestUci = bookMoves[0] || best;
    const bestSan = bestUci ? new Chess(before).move(toObj(bestUci)).san : null;
    if (!v.ok && best && !book) html += `<br><span class="small">Meilleur coup selon Stockfish : <strong>${esc(sanFr(new Chess(before).move(toObj(best)).san))}</strong>.</span>`;
    this.msg(html, v.ok ? 'ok' : 'ko');
    if (!v.ok && bestUci) {
      // On montre le coup joué, puis on laisse choisir : réessayer ou continuer avec le bon coup.
      this.play(uci);
      s.pending = { played: uci, bestUci, bestSan, arrow: { from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), kind: 'best' } };
      this.render();
      return;
    }
    this.play(uci);
    s.ours++;
    this.render();
    setTimeout(() => this.opponentMove(), 450);
  }

  retry() {
    const s = this.s;
    s.chess.undo();
    s.path.pop();
    s.results.pop();
    s.pending = null;
    this.msg('↺ Nouvel essai.', 'muted');
    this.render();
  }

  continueWithBest() {
    const s = this.s;
    s.chess.undo();
    s.path.pop();
    const mv = this.play(s.pending.bestUci);
    s.pending = null;
    s.ours++;
    this.msg(`On continue avec <strong>${esc(sanFr(mv.san))}</strong>.`, 'muted');
    this.render();
    setTimeout(() => this.opponentMove(), 450);
  }

  finish(reason) {
    const s = this.s;
    if (!s || s.done) return;
    s.done = true;
    s.busy = false;
    const ok = s.results.filter((r) => r.ok).length;
    const n = s.results.length;
    const fautes = s.results.filter((r) => !r.ok).map((r) => sanFr(r.san));
    this.msg(`<strong>${esc(reason)}</strong> Score : ${ok}/${n}${n ? ` (${Math.round((100 * ok) / n)} %)` : ''}.${fautes.length ? ` À revoir : ${fautes.map(esc).join(', ')}.` : ''}`, 'end');
    this.render();
  }
}
