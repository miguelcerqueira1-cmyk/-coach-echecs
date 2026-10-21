// Client de l'API « entraîneur » (Cloudflare Worker → Claude).
// Claude ne reçoit que des données calculées par Stockfish et validées par chess.js ;
// tout coup qu'il cite est re-vérifié ici avant affichage.
import { sanFr, COLOR_NAMES } from './analysis.js';

export const LEVELS = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  confirme: 'Confirmé',
};

export class CoachError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

export class Coach {
  constructor({ getApiUrl, getCode }) {
    this.getApiUrl = getApiUrl;
    this.getCode = getCode;
  }

  configured() { return !!(this.getApiUrl() && this.getCode()); }

  missing() {
    if (!this.getApiUrl()) return 'Aucune API Claude n’est configurée pour ce site.';
    if (!this.getCode()) return 'Code d’accès non saisi (Réglages).';
    return null;
  }

  async _call(path, { method = 'GET', body, signal } = {}) {
    const url = this.getApiUrl().replace(/\/+$/, '') + path;
    let res;
    try {
      res = await fetch(url, {
        method,
        signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.getCode() },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new CoachError('API Claude injoignable (réseau).', 'network');
    }
    let data = null;
    try { data = await res.json(); } catch { /* corps vide */ }
    if (res.ok) return data;
    const msg = data?.error || `Erreur HTTP ${res.status}`;
    if (res.status === 401) throw new CoachError('Code d’accès refusé par le serveur.', 'auth');
    if (res.status === 429) throw new CoachError(msg, 'limit');
    if (res.status === 503) throw new CoachError(msg, 'unconfigured');
    throw new CoachError(msg, 'server');
  }

  status(signal) { return this._call('/v1/status', { signal }); }

  explain(payload, signal) { return this._call('/v1/explain', { method: 'POST', body: payload, signal }); }
}

// Données structurées envoyées à Claude. Rien n'y est estimé par le client :
// chaque valeur vient de l'état de partie ou du moteur.
export function buildCoachPayload({ game, advice, threat, level, lastReplyExpected }) {
  const moves = game.moves.map((m) => m.san);
  const last = game.lastMove();
  const st = game.status();
  return {
    version: 1,
    level,
    levelLabel: LEVELS[level] || level,
    playerColor: COLOR_NAMES[game.playerColor],
    sideToMove: COLOR_NAMES[game.turn()],
    mode: advice.isPlayerTurn ? 'tour_du_joueur' : 'tour_adversaire',
    fen: game.fen(),
    startFen: game.startFen,
    historyUnknownBeforeStart: game.historyUnknown,
    movesSan: moves.slice(-40),
    movesOmitted: Math.max(0, moves.length - 40),
    lastMove: last ? { san: last.san, fr: sanFr(last.san), by: COLOR_NAMES[last.color], description: describeLast(last) } : null,
    lastMoveDeviation: lastReplyExpected || null,
    inCheck: st.inCheck,
    claimableDraw: st.claimable,
    engine: {
      name: advice.engine,
      depth: advice.depth,
      timeMs: advice.timeMs,
      bestMove: { san: advice.best.san, fr: sanFr(advice.best.san), description: advice.bestDescription },
      evaluation: advice.scoreWhite
        ? (advice.scoreWhite.type === 'mate'
          ? { kind: 'mat', movesToMate: Math.abs(advice.scoreWhite.value), forSide: advice.scoreWhite.value > 0 ? 'Blancs' : 'Noirs' }
          : { kind: 'centipions', valueWhitePov: advice.scoreWhite.value, verdict: advice.verdict })
        : null,
      wdlPlayerPermille: advice.wdlPlayer,
      principalVariationSan: advice.line.map((m) => m.san),
      principalVariationFr: advice.lineText,
      opponentBestReply: advice.reply ? { san: advice.reply.san, fr: sanFr(advice.reply.san), description: advice.replyDescription } : null,
    },
    threat: threat ? {
      note: 'Coup que l’adversaire jouerait s’il avait le trait maintenant (analyse « coup nul »).',
      san: threat.san, fr: sanFr(threat.san), description: threat.description, lineSan: threat.lineSan,
    } : null,
  };
}

function describeLast(m) {
  return `${m.from}→${m.to}${m.captured ? ', prise' : ''}${m.san.includes('+') ? ', échec' : ''}`;
}

// Ensemble des coups que Claude a le droit de citer : ceux transmis dans les
// données (historique, variantes validées, menace) et les coups légaux actuels.
export function allowedMoveSet(payload, legalSans) {
  const calc = new Set();
  const legal = new Set();
  const adder = (set) => (s) => {
    if (!s) return;
    const clean = s.replace(/[+#!?]+$/, '');
    set.add(clean);
    set.add(sanFr(clean));
  };
  const addCalc = adder(calc);
  payload.movesSan.forEach(addCalc);
  payload.engine.principalVariationSan.forEach(addCalc);
  if (payload.engine.opponentBestReply) addCalc(payload.engine.opponentBestReply.san);
  if (payload.threat) payload.threat.lineSan.forEach(addCalc);
  legalSans.forEach(adder(legal));
  return { calc, legal };
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Met en forme la réponse et signale les coups cités qui ne figurent pas dans les données vérifiées.
export function renderCoachText(text, allowed) {
  const unverified = [];
  const html = escapeHtml(text).replace(/\[([^\][\n]{1,12})\]/g, (all, mv) => {
    const clean = mv.trim().replace(/^\d+\.+\s*/, '').replace(/…/, '').replace(/[+#!?]+$/, '');
    if (allowed.calc.has(clean)) return `<span class="mv ok">${escapeHtml(mv)}</span>`;
    // Coup légal mais absent des variantes calculées : affiché comme non évalué par le moteur.
    if (allowed.legal.has(clean)) return `<span class="mv legal" title="Coup légal, non évalué par le moteur">${escapeHtml(mv)}</span>`;
    unverified.push(mv);
    return `<span class="mv unverified" title="Coup non présent dans les variantes calculées">${escapeHtml(mv)} ⚠</span>`;
  }).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  return { html, unverified };
}
