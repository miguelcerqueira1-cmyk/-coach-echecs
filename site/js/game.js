// Modèle de partie : source de vérité unique de l'application.
// Toute position est reconstruite en rejouant les coups réellement joués
// depuis la position de départ ; rien n'est déduit de la mémoire de Claude.
import { Chess, validateFen, DEFAULT_POSITION } from '../vendor/chess.js';

export const RECORD_VERSION = 1;
export const MAIN_BRANCH = 'main';

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// Clé de répétition : placement, trait, roques, prise en passant.
// chess.js n'écrit la case en passant que si la prise est réellement légale,
// ce qui correspond à la définition FIDE d'une « même position ».
export function repetitionKey(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function normalizeFen(fen) {
  const parts = fen.trim().split(/\s+/);
  // Tolère une FEN sans compteurs (4 champs) en ajoutant « 0 1 ».
  if (parts.length === 4) parts.push('0', '1');
  return parts.join(' ');
}

export class Game {
  constructor(record) {
    this.record = record;
    this._replay();
  }

  // ---------- Création ----------

  static create({ playerColor = 'w', fen = null, level = 'intermediaire' } = {}) {
    let startFen = DEFAULT_POSITION;
    let type = 'initial';
    let historyUnknown = false;
    if (fen) {
      startFen = normalizeFen(fen);
      const v = validateFen(startFen);
      if (!v.ok) throw new Error('FEN invalide : ' + v.error);
      if (startFen !== DEFAULT_POSITION) {
        type = 'fen';
        // Une FEN isolée ne contient pas les positions antérieures :
        // les répétitions passées sont inconnues et ne sont pas inventées.
        historyUnknown = true;
      }
    }
    return new Game(Game._newRecord({ playerColor, level, startFen, type, historyUnknown, moves: [], headers: {} }));
  }

  static fromPgn(pgn, { playerColor = 'w', level = 'intermediaire' } = {}) {
    const c = loadPgnTolerant(pgn);
    const headers = c.getHeaders();
    const startFen = headers.FEN && headers.SetUp === '1' ? normalizeFen(headers.FEN) : DEFAULT_POSITION;
    const moves = c.history({ verbose: true }).map((m) => ({ uci: m.lan, san: m.san }));
    const keep = {};
    for (const k of ['Event', 'Site', 'Date', 'Round', 'White', 'Black']) {
      if (headers[k] && !/^\?+(\.\?+)*$/.test(headers[k])) keep[k] = headers[k];
    }
    const rec = Game._newRecord({
      playerColor, level, startFen,
      type: 'pgn',
      // Si le PGN part d'une FEN, l'historique antérieur à cette FEN reste inconnu.
      historyUnknown: startFen !== DEFAULT_POSITION,
      moves, headers: keep,
    });
    return new Game(rec);
  }

  static fromRecord(record) {
    if (!record || record.v !== RECORD_VERSION) throw new Error('Sauvegarde incompatible');
    return new Game(record);
  }

  static _newRecord({ playerColor, level, startFen, type, historyUnknown, moves, headers }) {
    const now = new Date().toISOString();
    return {
      v: RECORD_VERSION,
      id: uid(),
      createdAt: now,
      updatedAt: now,
      playerColor,
      level,
      start: { type, fen: startFen, historyUnknown },
      // Ligne réellement jouée. Ne contient jamais de coup simplement proposé.
      branchId: MAIN_BRANCH,
      moves,
      // Révision strictement croissante : chaque modification (coup, annulation,
      // import) l'incrémente, même si la position redevient identique.
      revision: 1,
      // Phase 2 : variantes d'analyse, stockées à part, jamais mêlées à `moves`.
      analysisBranches: [],
      headers,
      result: null,
    };
  }

  // ---------- Rejeu ----------

  _replay() {
    const c = new Chess(this.record.start.fen);
    const fens = [c.fen()];
    const verbose = [];
    for (let i = 0; i < this.record.moves.length; i++) {
      const m = this.record.moves[i];
      let mv;
      try {
        mv = c.move(uciToMoveObj(m.uci));
      } catch {
        throw new Error(`Coup ${i + 1} (${m.san || m.uci}) illégal lors du rejeu`);
      }
      verbose.push(mv);
      fens.push(c.fen());
    }
    this._chess = c;
    this._fens = fens;
    this._verbose = verbose;
  }

  get id() { return this.record.id; }
  get revision() { return this.record.revision; }
  get branchId() { return this.record.branchId; }
  get playerColor() { return this.record.playerColor; }
  get ply() { return this.record.moves.length; }
  get moves() { return this.record.moves; }
  get startFen() { return this.record.start.fen; }
  get historyUnknown() { return this.record.start.historyUnknown; }

  // Jeton d'identification d'un état précis de la partie.
  token() {
    return { gameId: this.record.id, branchId: this.record.branchId, revision: this.record.revision, ply: this.ply };
  }

  isCurrent(token) {
    return !!token && token.gameId === this.record.id && token.branchId === this.record.branchId &&
      token.revision === this.record.revision;
  }

  fen(ply = this.ply) { return this._fens[ply]; }
  turn() { return this._chess.turn(); }
  isPlayerTurn() { return this.turn() === this.record.playerColor; }
  verboseMove(i) { return this._verbose[i]; }
  lastMove() { return this._verbose[this.ply - 1] || null; }

  // Copie indépendante de la position (courante ou passée) pour l'affichage et les calculs.
  chessAt(ply = this.ply) {
    if (ply === this.ply) return new Chess(this._chess.fen()); // l'historique n'est pas nécessaire
    return new Chess(this._fens[ply]);
  }

  legalMoves() { return this._chess.moves({ verbose: true }); }

  // ---------- Modifications ----------

  _touch() {
    this.record.revision += 1;
    this.record.updatedAt = new Date().toISOString();
  }

  // `input` : {from, to, promotion} ou chaîne UCI. Lève une erreur si le coup est illégal.
  play(input) {
    if (this.status().over) throw new Error('La partie est terminée');
    const obj = typeof input === 'string' ? uciToMoveObj(input) : input;
    let mv;
    try {
      mv = this._chess.move(obj);
    } catch {
      throw new Error('Coup illégal dans cette position');
    }
    this.record.moves.push({ uci: mv.lan, san: mv.san });
    this._verbose.push(mv);
    this._fens.push(this._chess.fen());
    this._touch();
    return mv;
  }

  undo() {
    if (!this.record.moves.length) return null;
    const removed = this.record.moves.pop();
    this._chess.undo();
    this._verbose.pop();
    this._fens.pop();
    this.record.result = null;
    this._touch();
    return removed;
  }

  setLevel(level) { this.record.level = level; }

  // ---------- Règles de fin de partie ----------

  repetitionCount(ply = this.ply) {
    const key = repetitionKey(this._fens[ply]);
    let n = 0;
    for (let i = 0; i <= ply; i++) if (repetitionKey(this._fens[i]) === key) n++;
    return n;
  }

  // chess.js classe la triple répétition et les 50 coups dans isGameOver() :
  // selon la FIDE ce sont des nulles *réclamables*. Fins automatiques traitées
  // ici : mat, pat, matériel insuffisant (cas reconnus par chess.js),
  // quintuple répétition et règle des 75 coups.
  status() {
    const c = this._chess;
    const turn = c.turn();
    const halfmove = Number(this._fens[this.ply].split(' ')[4] || 0);
    const reps = this.repetitionCount();
    const base = { turn, inCheck: c.inCheck(), halfmove, repetitions: reps, claimable: [], over: false, result: null, reason: null };
    if (c.isCheckmate()) {
      return { ...base, over: true, result: turn === 'w' ? '0-1' : '1-0', reason: 'mat' };
    }
    if (c.isStalemate()) return { ...base, over: true, result: '1/2-1/2', reason: 'pat' };
    if (c.isInsufficientMaterial()) return { ...base, over: true, result: '1/2-1/2', reason: 'materiel' };
    if (reps >= 5) return { ...base, over: true, result: '1/2-1/2', reason: 'quintuple' };
    if (halfmove >= 150) return { ...base, over: true, result: '1/2-1/2', reason: '75coups' };
    if (reps >= 3) base.claimable.push('triple');
    if (halfmove >= 100) base.claimable.push('50coups');
    return base;
  }

  // ---------- Moteur et export ----------

  // Commande UCI complète : position de départ + tous les coups, pour que le
  // moteur connaisse l'historique (répétitions, règle des 50 coups).
  uciPosition() {
    const moves = this.record.moves.map((m) => m.uci).join(' ');
    const base = this.record.start.fen === DEFAULT_POSITION ? 'position startpos' : `position fen ${this.record.start.fen}`;
    return moves ? `${base} moves ${moves}` : base;
  }

  pgn() {
    const c = new Chess(this.record.start.fen);
    const h = this.record.headers || {};
    const pc = this.record.playerColor;
    c.setHeader('Event', h.Event || "Partie d'entraînement");
    c.setHeader('Site', h.Site || 'Coach Échecs');
    c.setHeader('Date', h.Date || this.record.createdAt.slice(0, 10).replace(/-/g, '.'));
    c.setHeader('White', h.White || (pc === 'w' ? 'Moi' : 'Adversaire'));
    c.setHeader('Black', h.Black || (pc === 'b' ? 'Moi' : 'Adversaire'));
    if (this.record.start.fen !== DEFAULT_POSITION) {
      c.setHeader('SetUp', '1');
      c.setHeader('FEN', this.record.start.fen);
    }
    for (const m of this.record.moves) c.move(uciToMoveObj(m.uci));
    const st = this.status();
    c.setHeader('Result', st.over ? st.result : (this.record.result || '*'));
    return c.pgn();
  }

  toJSON() { return this.record; }
}

export function uciToMoveObj(uci) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error('UCI invalide : ' + uci);
  const o = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
  if (uci.length === 5) o.promotion = uci[4];
  return o;
}

// ---------- Import PGN tolérant ----------

// Nettoie un PGN collé : caractères invisibles, fins de ligne Windows, espaces insécables.
// Si plusieurs parties sont collées, seule la première est gardée.
export function cleanPgn(text) {
  let t = String(text || '').replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\u2060]/g, '')
    .replace(/\u00A0/g, ' ').replace(/\r\n?/g, '\n').trim();
  const second = t.search(/\n\s*\n\s*\[Event /);
  const firstMoves = t.search(/\n\s*\n\s*[^[\s]/);
  if (second > 0 && firstMoves > 0 && second > firstMoves) t = t.slice(0, second).trim();
  // Commentaires { … } (pendules [%clk], évaluations [%eval], texte) retirés de la partie
  // « coups » : inutiles ici, et chess.js refuse deux commentaires consécutifs ou un
  // commentaire tronqué (PGN Lichess fréquents). Les en-têtes [ … ] ne sont pas touchés.
  const lines = t.split('\n');
  const headerEnd = lines.findIndex((l) => l.trim() && !/^\s*\[.*\]\s*$/.test(l));
  if (headerEnd >= 0) {
    const moves = lines.slice(headerEnd).join('\n').replace(/\{[^}]*\}/g, ' ').replace(/\{[^}]*$/, ' ')
      .replace(/;[^\n]*/g, ' ').replace(/[ \t]+/g, ' ');
    t = [...lines.slice(0, headerEnd), moves].join('\n').trim();
  }
  return t;
}

// Notation française (R, D, T, F, C) → anglaise, uniquement dans la partie « coups »
// (hors en-têtes et commentaires).
export function frenchToEnglishPgn(text) {
  const map = { R: 'K', D: 'Q', T: 'R', F: 'B', C: 'N' };
  const lines = text.split('\n');
  return lines.map((line) => {
    if (/^\s*\[/.test(line)) return line;
    return line.replace(/(\{[^}]*\})|(^|[\s.)(])([RDTFC])(?=[a-h1-8x]*[a-h][1-8])/g, (all, comment, pre, piece) => (comment ? comment : pre + map[piece]))
      .replace(/=([DTFC])/g, (_, p) => '=' + map[p]);
  }).join('\n');
}

export function loadPgnTolerant(raw) {
  const text = cleanPgn(raw);
  if (!String(raw || '').trim()) throw new Error('Le texte est vide : collez le PGN de la partie.');
  if (!text) throw new Error('Ce texte n’est pas un PGN lisible (aucun coup trouvé).');
  if (/^https?:\/\//i.test(text)) {
    throw new Error('Vous avez collé un lien. Collez plutôt le texte PGN : sur Lichess, « Partager & exporter » → PGN ; sur Chess.com, « Partager » → onglet PGN → Copier.');
  }
  let firstError;
  for (const candidate of [text, frenchToEnglishPgn(text)]) {
    const c = new Chess();
    try {
      c.loadPgn(candidate);
      return c;
    } catch (e) {
      firstError ??= e;
    }
  }
  const m = String(firstError?.message || '').match(/Invalid move in PGN: (\S+)/);
  if (m) throw new Error(`Coup illégal ou non reconnu dans le PGN : « ${m[1]} ». Vérifiez que le PGN est complet et commence bien à la position initiale (ou contient l’en-tête FEN).`);
  throw new Error('Ce texte n’est pas un PGN lisible. Copiez le PGN complet depuis Lichess (« Partager & exporter » → PGN) ou Chess.com (« Partager » → PGN).');
}

// ---------- Saisie en notation ----------

const FR_TO_EN = { R: 'K', D: 'Q', T: 'R', F: 'B', C: 'N' };

function cleanSan(s) {
  return s.replace(/[+#!?]+$/g, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O').replace(/=/g, '');
}

// Interprète une saisie (SAN anglaise, SAN française ou UCI) et renvoie
// la liste des coups légaux possibles. Plusieurs résultats = saisie ambiguë.
export function parseMoveText(chess, text) {
  const raw = text.trim();
  if (!raw) return [];
  const legal = chess.moves({ verbose: true });
  const found = new Map();
  const uci = raw.toLowerCase().replace(/[-x ]/g, '');
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    for (const m of legal) {
      if (m.from === uci.slice(0, 2) && m.to === uci.slice(2, 4) && (m.promotion || '') === (uci[4] || (m.promotion ? 'q' : ''))) {
        found.set(m.lan, { move: m, how: 'UCI' });
      }
    }
    if (found.size) return [...found.values()];
  }
  const target = cleanSan(raw);
  const en = (s) => cleanSan(s);
  for (const m of legal) if (en(m.san) === target) found.set(m.lan, { move: m, how: 'anglais' });
  // Notation française : pièces R/D/T/F/C, promotion « e8=D ».
  const fr = target.replace(/^[RDTFC]/, (p) => FR_TO_EN[p]).replace(/([a-h][18])([DTFC])$/, (_, sq, p) => sq + FR_TO_EN[p]);
  if (fr !== target || /[DTFC]$/.test(target) || /^R/.test(target)) {
    for (const m of legal) if (en(m.san) === fr && !found.has(m.lan)) found.set(m.lan, { move: m, how: 'français' });
  }
  return [...found.values()];
}
