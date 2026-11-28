// Logique pure de la page « Mes parties » : lecture des formats Lichess / Chess.com,
// sortie du répertoire, classement des erreurs (pertes d'évaluation Stockfish) et bilan.
// Tout chiffre affiché provient de Stockfish ; toute règle (pièce en prise…) de chess.js.
import { Chess } from '../vendor/chess.js';
import { START_FEN } from './lines.js';
import { buildTree, key } from './training-core.js';
import { piecesEnDanger } from './explain-free.js';
import { sanFr } from './analysis.js';
import { langue } from './i18n.js';
import { REPERTOIRES, couleurDe } from '../data/repertoires/meta.js';

const L = (fr, en) => (langue() === 'en' ? en : fr);
// Nombre décimal produit par le code : virgule en français, point en anglais.
const dec = (x) => (langue() === 'en' ? x : x.replace('.', ','));
// Noms affichés des phases et des résultats (les valeurs françaises restent les clés internes).
const PHASES_EN = { ouverture: 'opening', 'milieu de partie': 'middlegame', finale: 'endgame', 'répertoire': 'repertoire' };
export const phaseTxt = (ph) => L(ph, PHASES_EN[ph] || ph);
const OUTCOMES_EN = { victoire: 'win', 'défaite': 'loss', nulle: 'draw', 'en cours': 'in progress', inconnu: 'unknown' };
export const outcomeTxt = (o) => L(o, OUTCOMES_EN[o] || o);

const SPEED_FR = { ultraBullet: 'UltraBullet', bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapide', classical: 'Classique', correspondence: 'Correspondance', daily: 'Correspondance' };

function resultFor(result, color) {
  if (result === '1/2-1/2') return 'nulle';
  if (result === '1-0') return color === 'w' ? 'victoire' : 'défaite';
  if (result === '0-1') return color === 'b' ? 'victoire' : 'défaite';
  return 'inconnu';
}

function sanList(moves) {
  const c = new Chess();
  const out = [];
  for (const m of moves) {
    try { out.push(c.move(m).san); } catch { return null; }
  }
  return out;
}

// Une ligne NDJSON de l'export Lichess (/api/games/user/…).
export function parseLichessGame(g, username) {
  if (!g || g.variant !== 'standard' || g.initialFen) return null;
  const me = username.toLowerCase();
  const wName = g.players?.white?.user?.name || 'Anonyme';
  const bName = g.players?.black?.user?.name || 'Anonyme';
  const color = wName.toLowerCase() === me ? 'w' : bName.toLowerCase() === me ? 'b' : null;
  if (!color) return null;
  const san = sanList((g.moves || '').split(' ').filter(Boolean));
  if (!san) return null;
  const result = g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : (['draw', 'stalemate'].includes(g.status) ? '1/2-1/2' : '*');
  return {
    site: 'Lichess', id: `li-${g.id}`, url: `https://lichess.org/${g.id}`, date: new Date(g.createdAt || g.lastMoveAt || 0).toISOString(),
    speed: SPEED_FR[g.speed] || g.speed, rated: !!g.rated, color,
    white: wName, black: bName, whiteElo: g.players?.white?.rating ?? null, blackElo: g.players?.black?.rating ?? null,
    result, outcome: resultFor(result, color), opening: g.opening ? `${g.opening.eco} ${g.opening.name}` : '', san,
    ...tempsLichess(g, color, san.length),
  };
}

// ---------- Temps (pendule) ----------
// clocks[i] : secondes restantes au joueur qui vient de jouer le demi-coup i ; tc : cadence.
// finTemps : 'moi' | 'adversaire' | null (partie perdue au temps).
function tempsLichess(g, color, n) {
  const out = { clocks: null, tc: null, finTemps: null };
  // Lichess ajoute, après le dernier coup, la pendule du joueur au trait (0 s s'il est tombé).
  if (Array.isArray(g.clocks) && n && (g.clocks.length === n || g.clocks.length === n + 1) && g.clock) {
    out.clocks = g.clocks.slice(0, n).map((c) => c / 100);
    out.tc = { initial: g.clock.initial, increment: g.clock.increment || 0 };
  }
  if (g.status === 'outoftime' && g.winner) out.finTemps = (g.winner === 'white' ? 'b' : 'w') === color ? 'moi' : 'adversaire';
  return out;
}

// « 180+2 » → { initial: 180, increment: 2 } (null pour une cadence par jour « 1/86400 »).
export function lireCadence(tc) {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(String(tc || '').trim());
  return m ? { initial: +m[1], increment: +(m[2] || 0) } : null;
}

// Commentaires [%clk h:mm:ss(.d)] d'un PGN, dans l'ordre des coups → secondes.
export function horlogesPgn(pgn) {
  const out = [];
  for (const m of String(pgn || '').matchAll(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g)) out.push(+m[1] * 3600 + +m[2] * 60 + +m[3]);
  return out;
}

// Temps passé sur chaque demi-coup (secondes) : pendule précédente du même joueur − pendule
// actuelle + incrément. null si les pendules manquent.
export function tempsParCoup(game) {
  const { clocks, tc } = game;
  if (!clocks?.length || !tc) return null;
  return clocks.map((c, i) => {
    const avant = i >= 2 ? clocks[i - 2] : tc.initial;
    return Math.max(0, Math.round((avant - c + tc.increment) * 10) / 10);
  });
}

const PHASES_T = ['ouverture', 'milieu de partie', 'finale'];

// Analyse du temps d'une partie (mes coups) : moyenne par phase, plus longues réflexions (avec la
// perte Stockfish si l'analyse existe : réflexion longue sur un coup facile), temps restant à la fin.
// plies : analyseGame (facultatif) ; sans analyse, phase par numéro de coup.
export function analyseTemps(game, plies = []) {
  const t = tempsParCoup(game);
  if (!t) return null;
  const mine = [];
  for (let i = 0; i < t.length; i++) {
    if ((i % 2 === 0 ? 'w' : 'b') !== game.color) continue;
    const p = plies[i] || {};
    const phase = p.phase || (i < 20 ? 'ouverture' : i < 60 ? 'milieu de partie' : 'finale');
    mine.push({ i, san: game.san[i], s: t[i], phase, loss: p.loss ?? null, cpBefore: p.cpBefore ?? null, reste: game.clocks[i] });
  }
  if (!mine.length) return null;
  const total = mine.reduce((a, m) => a + m.s, 0);
  const phases = PHASES_T.map((ph) => {
    const l = mine.filter((m) => m.phase === ph);
    return l.length ? { phase: ph, n: l.length, moy: l.reduce((a, m) => a + m.s, 0) / l.length, total: l.reduce((a, m) => a + m.s, 0) } : null;
  }).filter(Boolean);
  // Réflexion longue : au moins 10 s et au moins 8 % du temps de départ.
  const seuil = Math.max(10, game.tc.initial * 0.08);
  const longs = mine.filter((m) => m.s >= seuil).sort((a, b) => b.s - a.s).slice(0, 3)
    .map((m) => ({ ...m, facile: m.loss != null && m.loss < 50 }));
  const fin = mine.at(-1);
  // Avantage au moment de la chute : dernière évaluation connue, de mon point de vue.
  const dernier = [...plies].reverse().find((p) => p?.cpAfter != null);
  const avantage = dernier ? (game.color === 'w' ? dernier.cpAfter : -dernier.cpAfter) : null;
  return {
    total, moy: total / mine.length, phases, longs, seuil,
    resteFin: fin.reste, finTemps: game.finTemps || null,
    perduAvecAvantage: game.finTemps === 'moi' && avantage != null && avantage >= 100,
    avantage,
  };
}

// Bilan du temps sur plusieurs parties : défaites au temps, moyenne par phase (sans analyse).
export function bilanTempsParties(games) {
  const avec = games.filter((g) => g.clocks?.length && g.tc);
  const parPhase = {};
  for (const g of avec) {
    const a = analyseTemps(g);
    for (const p of a?.phases || []) {
      const x = parPhase[p.phase] ||= { n: 0, total: 0 };
      x.n += p.n;
      x.total += p.total;
    }
  }
  return {
    parties: games.length,
    avecPendule: avec.length,
    perduesTemps: games.filter((g) => g.finTemps === 'moi').length,
    gagneesTemps: games.filter((g) => g.finTemps === 'adversaire').length,
    phases: PHASES_T.filter((p) => parPhase[p]).map((p) => ({ phase: p, moy: parPhase[p].total / parPhase[p].n })),
  };
}

// Une partie de l'archive mensuelle Chess.com (/pub/player/…/games/AAAA/MM).
export function parseChessComGame(g, username) {
  if (!g || g.rules !== 'chess' || !g.pgn) return null;
  const me = username.toLowerCase();
  const color = g.white?.username?.toLowerCase() === me ? 'w' : g.black?.username?.toLowerCase() === me ? 'b' : null;
  if (!color) return null;
  const c = new Chess();
  try { c.loadPgn(g.pgn); } catch { return null; }
  const h = c.getHeaders();
  if (h.SetUp === '1' && h.FEN && h.FEN !== START_FEN) return null;
  const result = ['1-0', '0-1', '1/2-1/2'].includes(h.Result) ? h.Result : '*';
  const ecoName = (h.ECOUrl || '').split('/').pop()?.replace(/-/g, ' ') || '';
  return {
    site: 'Chess.com', id: `cc-${(g.url || '').split('/').pop() || g.end_time}`, url: g.url, date: new Date((g.end_time || 0) * 1000).toISOString(),
    speed: SPEED_FR[g.time_class] || g.time_class, rated: !!g.rated, color,
    white: g.white.username, black: g.black.username, whiteElo: g.white.rating ?? null, blackElo: g.black.rating ?? null,
    result, outcome: resultFor(result, color), opening: [h.ECO, ecoName].filter(Boolean).join(' '), san: c.history(),
    ...tempsChessCom(g, h, color, c.history().length),
  };
}

function tempsChessCom(g, h, color, n) {
  const clocks = horlogesPgn(g.pgn);
  const tc = lireCadence(h.TimeControl || g.time_control);
  const moi = color === 'w' ? g.white : g.black;
  const lui = color === 'w' ? g.black : g.white;
  return {
    clocks: tc && clocks.length === n ? clocks : null,
    tc: tc && clocks.length === n ? tc : null,
    finTemps: moi?.result === 'timeout' ? 'moi' : lui?.result === 'timeout' ? 'adversaire' : null,
  };
}

// Partie jouée sur la page Moteur → même forme qu'une partie importée, pour le bilan.
// L'identifiant dépend des coups : la même partie réutilise son analyse en cache.
export function localGame({ san, color, result = '*', white, black, opening = '' }) {
  let h = 0;
  for (const ch of san.join(' ')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return {
    site: 'Échiquier', id: `moteur-${san.length}-${(h >>> 0).toString(36)}`, url: null, local: true,
    date: new Date().toISOString(), speed: L('Partie de l’échiquier', 'Board game'), rated: false, color,
    white: white || (color === 'w' ? L('Moi', 'Me') : L('Adversaire', 'Opponent')), black: black || (color === 'b' ? L('Moi', 'Me') : L('Adversaire', 'Opponent')),
    whiteElo: null, blackElo: null, result, outcome: result === '*' ? 'en cours' : resultFor(result, color), opening, san: san.slice(),
  };
}

// Répertoires candidats d'une partie, parmi `reps` (défaut : ceux des fiches), de la couleur jouée :
// Blancs, notre 1er coup est celui du répertoire (sinon la partie est hors répertoire) ;
// Noirs, le répertoire prévoit une réponse au 1er coup adverse (sinon hors répertoire).
export function repertoiresCandidats(game, entries, reps = null) {
  const ids = reps || [...new Set(entries.map((e) => e.rep))];
  let first;
  try { first = new Chess().move(game.san[0]).lan; } catch { return []; }
  const out = [];
  for (const rep of ids) {
    if (couleurDe(rep) !== game.color) continue;
    const tree = buildTree(entries, rep);
    const ok = game.color === 'w' ? tree.ours.get('')?.has(first) : tree.ours.has(key([first]));
    if (ok) out.push({ rep, tree });
  }
  return out;
}

// Répertoire concerné par la partie (null si hors répertoire) : celui dont les fiches sont
// suivies le plus longtemps.
export function repertoireOf(game, entries, reps = null) {
  return repertoireDeviation(game, entries, reps).rep;
}

// Premier écart avec les fiches : qui sort du répertoire, à quel coup, et ce qui était prévu.
// Plusieurs répertoires possibles (ex. Gambit Dame et Londres après 1.d4) : celui suivi le plus loin.
export function repertoireDeviation(game, entries, reps = null) {
  let best = { rep: null };
  for (const { rep, tree } of repertoiresCandidats(game, entries, reps)) {
    const d = deviationDans(game, tree, rep);
    if (best.rep === null || d.ply > best.ply) best = d;
  }
  if (best.who === 'moi' && best.ply === 1 && game.color === 'b') {
    best.note = L(`Votre répertoire (${REPERTOIRES[best.rep]?.titre || best.rep}) prévoit ${best.expected.map(sanFr).join(' ou ')} ici.`, `Your repertoire (${REPERTOIRES[best.rep]?.titre || best.rep}) expects ${best.expected.map(sanFr).join(' or ')} here.`);
  }
  return best;
}

function deviationDans(game, tree, rep) {
  const c = new Chess();
  const path = [];
  for (let i = 0; i < game.san.length; i++) {
    const mover = i % 2 === 0 ? 'w' : 'b';
    const k = key(path);
    const mv = c.move(game.san[i]);
    if (mover === game.color) {
      const book = tree.ours.get(k);
      if (!book) return { rep, who: 'fin', ply: i, note: L('Fin de la théorie des fiches.', 'End of the theory in your lines.') };
      const trap = tree.traps.get(k);
      if (trap && trap.uci === mv.lan) return { rep, who: 'moi', ply: i, played: mv.san, expected: [...book.keys()].map((u) => sanOf(path, u)), trap };
      if (!book.has(mv.lan)) {
        const fiche = book.get([...book.keys()][0])[0];
        return { rep, who: 'moi', ply: i, played: mv.san, expected: [...book.keys()].map((u) => sanOf(path, u)), fiche };
      }
    } else {
      const theirs = tree.theirs.get(k);
      const ours = tree.ours.get(key([...path, mv.lan]));
      if (!theirs || (!theirs.has(mv.lan) && !ours)) {
        path.push(mv.lan);
        const err = tree.errors.get(key(path));
        return { rep, who: 'adversaire', ply: i, played: mv.san, err };
      }
    }
    path.push(mv.lan);
    const err = tree.errors.get(key(path));
    if (err && mover !== game.color) {
      // Erreur adverse prévue par une fiche : l'utilisateur a-t-il trouvé la punition ?
      const next = game.san[i + 1];
      const expected = sanOf(path, err.suite[0]);
      return { rep, who: 'adversaire-erreur', ply: i, played: mv.san, err, punished: next === expected, expected: [expected], playedNext: next };
    }
  }
  return { rep, who: 'aucun', ply: game.san.length };
}

// Alerte d'une partie collée en PGN : où la partie quitte vos fiches et ce que disent les fiches.
// Faits uniquement (fiches vérifiées par Stockfish, chess.js) ; ligne = coups SAN à ouvrir sur
// l'échiquier (réfutation ou coup de la fiche), null s'il n'y a rien à montrer.
export function alertePgn(game, d) {
  const toSan = (prefix, ucis) => {
    const c = new Chess();
    const out = [];
    try {
      for (const s of prefix) out.push(c.move(s).san);
      for (const u of ucis) out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
    } catch { return null; }
    return out;
  };
  const coup = (ply, san) => `${moveNo(ply)} ${sanFr(san)}`;
  if (!d?.rep) return { niveau: 'info', texte: L('Partie hors de votre répertoire (Gambit Dame avec les Blancs, Caro-Kann avec les Noirs) : rien à comparer.', 'Game outside your repertoire (Queen’s Gambit with White, Caro-Kann with Black): nothing to compare.'), ligne: null };
  const err = d.err;
  if ((d.who === 'adversaire-erreur' || (d.who === 'adversaire' && err)) && err) {
    const ligne = toSan(game.san.slice(0, d.ply + 1), err.suite || []);
    const puni = d.who === 'adversaire-erreur' && d.punished;
    return {
      niveau: puni ? 'ok' : 'warn',
      texte: L(`Au coup ${coup(d.ply, d.played)}, l’adversaire a joué une déviation connue (fiche « ${err.nom} ») ! ${puni ? 'Vous l’avez punie ✔' : `Elle se punit : ${err.texte}`}`, `On move ${coup(d.ply, d.played)}, your opponent played a known deviation (line “${err.nom}”)! ${puni ? 'You punished it ✔' : `It can be punished: ${err.texte}`}`),
      ligne, bouton: L('Voir la réfutation', 'Show the refutation'),
    };
  }
  if (d.who === 'adversaire') return { niveau: 'info', texte: L(`Au coup ${coup(d.ply, d.played)}, l’adversaire quitte vos fiches avec un coup qu’elles ne couvrent pas : à partir d’ici, c’est le moteur qui juge.`, `On move ${coup(d.ply, d.played)}, your opponent leaves your lines with a move they don’t cover: from here on, the engine is the judge.`), ligne: null };
  if (d.who === 'moi') {
    const attendu = (d.expected || []).map(sanFr).join(L(' ou ', ' or '));
    const ligne = d.expected?.length ? (() => { const c = new Chess(); try { const l = game.san.slice(0, d.ply).map((s) => c.move(s).san); l.push(c.move(d.expected[0]).san); return l; } catch { return null; } })() : null;
    if (d.trap) return { niveau: 'warn', texte: L(`Au coup ${coup(d.ply, d.played)}, vous êtes tombé dans le piège de la fiche « ${d.trap.nom} » : ${d.trap.texte}`, `On move ${coup(d.ply, d.played)}, you fell into the trap of the line “${d.trap.nom}”: ${d.trap.texte}`), ligne, bouton: L('Voir le bon coup', 'Show the right move') };
    return { niveau: 'warn', texte: L(`Au coup ${coup(d.ply, d.played)}, vous sortez de la théorie de vos fiches : le coup prévu était ${attendu}.${d.note ? ` ${d.note}` : ''}`, `On move ${coup(d.ply, d.played)}, you leave the theory of your lines: the planned move was ${attendu}.${d.note ? ` ${d.note}` : ''}`), ligne, bouton: L('Voir le coup de la fiche', 'Show the line’s move') };
  }
  return { niveau: 'ok', texte: L('Vous avez suivi vos fiches jusqu’au bout ✔', 'You followed your lines to the end ✔'), ligne: null };
}

// Variante (fiche) jouée dans une vraie partie : la fiche de mes répertoires choisis, de ma couleur,
// qui suit la partie le plus loin (au moins 4 demi-coups en commun). null si aucune.
export function ficheJouee(game, entries, reps = null, couleurs = {}) {
  if (!game?.san?.length) return null;
  const c = new Chess();
  const uci = [];
  for (const s of game.san.slice(0, 40)) { try { uci.push(c.move(s).lan); } catch { break; } }
  let best = null;
  for (const e of entries) {
    if (reps && !reps.includes(e.rep)) continue;
    if ((couleurs[e.rep] || (e.rep === 'ck' ? 'b' : 'w')) !== game.color) continue;
    let k = 0;
    while (k < e.uci.length && k < uci.length && e.uci[k] === uci[k]) k++;
    if (k < 4) continue;
    if (!best || k > best.ply || (k === best.ply && e.uci.length < best.len)) best = { ficheId: e.id, rep: e.rep, nom: e.nom, ply: k, len: e.uci.length };
  }
  return best && { ficheId: best.ficheId, rep: best.rep, nom: best.nom, ply: best.ply };
}

// Position d'une vraie partie à retravailler (module « Positions de mes parties » de l'Entraînement) :
// - sortie : à vous de jouer, vous avez quitté les fiches (attendu : un coup des fiches) ;
// - punition : l'adversaire a commis l'erreur prévue par une fiche et vous ne l'avez pas punie
//   (attendu : le 1er coup de la punition, vérifiée par Stockfish).
// moves/expected en UCI depuis la position initiale ; null si rien à retravailler.
export function positionARevoir(game, d) {
  if (!d || !game?.san) return null;
  let kind;
  let upto;
  let expectedSan;
  let played;
  if (d.who === 'moi') { kind = 'sortie'; upto = d.ply; expectedSan = d.expected || []; played = d.played; } else if (d.who === 'adversaire-erreur' && !d.punished) { kind = 'punition'; upto = d.ply + 1; expectedSan = d.expected || []; played = d.playedNext || null; } else return null;
  const c = new Chess();
  const moves = [];
  for (const s of game.san.slice(0, upto)) {
    try { moves.push(c.move(s).lan); } catch { return null; }
  }
  const expected = [];
  for (const s of expectedSan) {
    try { expected.push(new Chess(c.fen()).move(s).lan); } catch { /* coup illisible : ignoré */ }
  }
  if (!expected.length) return null;
  return {
    kind, moves, expected, played, ply: upto, color: game.color,
    texte: kind === 'punition' ? d.err?.texte || null : d.trap?.texte || d.note || null,
    ficheNom: kind === 'punition' ? d.err?.nom || null : d.fiche?.nom || d.trap?.nom || null,
  };
}

function sanOf(path, uci) {
  const c = new Chess();
  for (const u of path) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
}

// Numéro de coup lisible pour un demi-coup (0 = 1.).
export function moveNo(ply) { return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`; }

// Score UCI du camp au trait → centipions côté Blancs, mats bornés à ±1000.
export function whiteCp(score, turn) {
  if (!score) return null;
  let v = score.type === 'mate' ? (score.value > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, score.value));
  if (score.type === 'mate' && score.value === 0) v = -1000;
  return turn === 'w' ? v : -v;
}

export const CLASSES = [
  { min: 300, id: 'gaffe', label: L('Gaffe', 'Blunder'), mark: '??' },
  { min: 120, id: 'erreur', label: L('Erreur', 'Mistake'), mark: '?' },
  { min: 50, id: 'imprecision', label: L('Imprécision', 'Inaccuracy'), mark: '?!' },
];
export const classify = (loss) => CLASSES.find((c) => loss >= c.min) || null;

function phase(fen, ply) {
  if (ply < 20) return 'ouverture';
  const c = new Chess(fen);
  let n = 0;
  for (const row of c.board()) for (const p of row) if (p && p.type !== 'k' && p.type !== 'p') n++;
  return n <= 6 ? 'finale' : 'milieu de partie';
}

// evals[i] : { cp (Blancs), best (uci) } pour la position AVANT le demi-coup i ; evals[n] : position finale.
export function analyseGame(game, evals) {
  const c = new Chess();
  const plies = [];
  for (let i = 0; i < game.san.length; i++) {
    const fenBefore = c.fen();
    const mv = c.move(game.san[i]);
    const e0 = evals[i];
    const e1 = evals[i + 1];
    if (!e0 || !e1 || e0.cp == null || e1.cp == null) { plies.push({ i, san: mv.san, mover: mv.color }); continue; }
    const sign = mv.color === 'w' ? 1 : -1;
    const loss = Math.max(0, sign * (e0.cp - e1.cp));
    let bestSan = null;
    if (e0.best && e0.best !== mv.lan) {
      try { bestSan = new Chess(fenBefore).move({ from: e0.best.slice(0, 2), to: e0.best.slice(2, 4), promotion: e0.best[4] }).san; } catch { /* ignoré */ }
    }
    const cls = bestSan ? classify(loss) : null; // si le coup joué est le meilleur, pas de faute
    plies.push({
      i, san: mv.san, uci: mv.lan, mover: mv.color, fenBefore, fenAfter: c.fen(), cpBefore: e0.cp, cpAfter: e1.cp,
      loss: bestSan ? loss : 0, bestSan, bestUci: bestSan ? e0.best : null, cls, phase: phase(fenBefore, i),
      hanging: piecesEnDanger(c.fen(), mv.color),
    });
  }
  return plies;
}

// Qui a l'avantage, d'après l'évaluation Stockfish côté Blancs (centipions, mats bornés à ±1000) :
// équilibré (< 0,5), léger (< 1,5), net (< 3), décisif (≥ 3 ou mat).
export function avantage(cp) {
  if (cp == null) return null;
  const a = Math.abs(cp);
  const ampleur = a < 50 ? 'equilibre' : a < 150 ? 'leger' : a < 300 ? 'net' : 'decisif';
  return { camp: ampleur === 'equilibre' ? null : cp > 0 ? 'w' : 'b', ampleur };
}

const CAMP = { w: L('les Blancs', 'White'), b: L('les Noirs', 'Black') };
export function avantageTxt(cp) {
  const a = avantage(cp);
  if (!a) return '';
  if (!a.camp) return L('position équilibrée', 'balanced position');
  const qui = CAMP[a.camp];
  return {
    leger: L(`léger avantage pour ${qui}`, `slight edge for ${qui}`),
    net: L(`net avantage pour ${qui}`, `clear advantage for ${qui}`),
    decisif: L(`avantage décisif pour ${qui}`, `decisive advantage for ${qui}`),
  }[a.ampleur];
}

// Évaluation lisible côté Blancs (« +0,3 », « −2,1 », « mat »).
export function evalTxt(cp) {
  if (cp == null) return '?';
  if (Math.abs(cp) >= 1000) return cp > 0 ? L('mat pour les Blancs', 'mate for White') : L('mat pour les Noirs', 'mate for Black');
  const v = (cp / 100).toFixed(1);
  return (cp > 0 ? '+' : cp < 0 ? '−' : '') + (L(v.replace('.', ','), v)).replace('-', '');
}

// Moments clés d'une partie, du point de vue du joueur (game.color) :
// - 'donne'    : votre coup laisse l'adversaire prendre l'avantage (≥ 0,5 pour lui après le coup,
//                alors que vous n'étiez pas déjà nettement moins bien) ;
// - 'occasion' : vous aviez (ou pouviez avoir) l'avantage (≥ 1) et votre coup en laisse filer une
//                grande partie (perte ≥ 1,2) sans pour autant donner l'avantage ;
// - 'cadeau'   : erreur adverse (perte ≥ 1,5) ; saisie = votre coup suivant ne la gâche pas (perte < 1).
// Chaque moment : avant / après (centipions côté Blancs), meilleur coup, explication factuelle.
export function momentsCles(game, plies, max = 5) {
  const pov = (cp) => (game.color === 'w' ? cp : -cp);
  const out = [];
  for (const p of plies) {
    if (p.cpBefore == null || p.cpAfter == null || !p.cls) continue;
    const avant = pov(p.cpBefore), apres = pov(p.cpAfter);
    if (p.mover === game.color) {
      if (p.loss < 120) continue;
      // Partie déjà nettement perdue avant le coup (≤ −1,5) : pas un « avantage donné ».
      const type = apres <= -50 && avant > -150 ? 'donne' : avant >= 100 && apres > -50 ? 'occasion' : null;
      if (!type) continue;
      const prev = plies[p.i - 1];
      const apresCadeau = !!(prev && prev.mover !== game.color && prev.loss >= 150);
      out.push({ ...base(p), type, apresCadeau, explication: explication(p) });
    } else if (p.loss >= 150 && pov(p.cpAfter) >= 50) {
      const next = plies[p.i + 1];
      out.push({ ...base(p), type: 'cadeau', saisi: next ? next.loss < 100 : null, suite: next?.san || null });
    }
  }
  return out.sort((a, b) => b.loss - a.loss).slice(0, max).sort((a, b) => a.i - b.i);
}

function base(p) {
  return { i: p.i, san: p.san, mover: p.mover, avant: p.cpBefore, apres: p.cpAfter, loss: p.loss, bestSan: p.bestSan, bestUci: p.bestUci, cls: p.cls };
}

// Explication courte et factuelle (aucune intention inventée) : pièce laissée en prise, mat, sinon le meilleur coup.
function explication(p) {
  const NOMS = L({ p: 'le pion', n: 'le Cavalier', b: 'le Fou', r: 'la Tour', q: 'la Dame' }, { p: 'the pawn', n: 'the knight', b: 'the bishop', r: 'the rook', q: 'the queen' });
  const h = (p.hanging || []).find((x) => x.type !== 'p') || p.hanging?.[0];
  const parts = [];
  if (Math.abs(p.cpAfter) >= 1000 && Math.sign(p.cpAfter) !== (p.mover === 'w' ? 1 : -1)) parts.push(L('après ce coup, l’adversaire a un mat forcé', 'after this move, the opponent has a forced mate'));
  else if (h) parts.push(L(h.defended ? `après ce coup, une pièce de moindre valeur peut prendre ${NOMS[h.type]} en ${h.square}` : `après ce coup, ${NOMS[h.type]} en ${h.square} reste sans défense`, `after this move, ${NOMS[h.type]} on ${h.square} ${h.defended ? 'can be taken by a cheaper piece' : 'is left undefended'}`));
  if (p.bestSan) parts.push(L(`le meilleur coup était ${sanFr(p.bestSan)}`, `the best move was ${sanFr(p.bestSan)}`));
  const t = parts.join(L(' ; ', '; '));
  return t ? t[0].toUpperCase() + t.slice(1) + '.' : '';
}

// Position d'un moment clé à rejouer (« Positions de mes parties ») : à vous de jouer, attendu = meilleur coup Stockfish.
export function positionMoment(game, plies, m) {
  if (!m.bestUci || m.mover !== game.color) return null;
  const moves = plies.slice(0, m.i).map((p) => p.uci);
  if (moves.length !== m.i || moves.some((u) => !u)) return null;
  return { kind: 'moment', moves, expected: [m.bestUci], played: m.san, color: game.color, texte: m.explication || null, ficheNom: null };
}

// Bilan d'une partie : moments décisifs, erreurs principales, trois pistes de travail.
export function bilan(game, plies, deviation) {
  const mine = plies.filter((p) => p.mover === game.color && p.loss != null && p.cpBefore != null);
  const theirs = plies.filter((p) => p.mover !== game.color && p.cpBefore != null);
  const errors = mine.filter((p) => p.cls).sort((a, b) => b.loss - a.loss);
  const decisive = plies.filter((p) => p.cpBefore != null && p.cls && p.loss >= 150).sort((a, b) => b.loss - a.loss).slice(0, 3)
    .sort((a, b) => a.i - b.i);
  const avg = mine.length ? Math.round(mine.reduce((a, p) => a + Math.min(p.loss, 1000), 0) / mine.length) : null;
  const count = (id) => mine.filter((p) => p.cls?.id === id).length;
  const pistes = [];
  if (deviation?.who === 'moi' && deviation.expected?.length) {
    pistes.push({ id: 'repertoire', text: L(`Revoir l’ouverture : au coup ${moveNo(deviation.ply)} vous avez joué ${sanFr(deviation.played)}, votre répertoire prévoit ${deviation.expected.map(sanFr).join(' ou ')}${deviation.fiche ? ` (par exemple fiche « ${deviation.fiche.nom} »)` : ''}. Le mode Entraînement permet de le répéter.`, `Review the opening: on move ${moveNo(deviation.ply)} you played ${sanFr(deviation.played)}, your repertoire expects ${deviation.expected.map(sanFr).join(' or ')}${deviation.fiche ? ` (for example line “${deviation.fiche.nom}”)` : ''}. Training mode lets you drill it.`) });
  } else if (deviation?.who === 'adversaire-erreur' && !deviation.punished) {
    pistes.push({ id: 'punition', text: L(`L’adversaire a commis une erreur connue au coup ${moveNo(deviation.ply)} (${sanFr(deviation.played)}) : la punition était ${sanFr(deviation.expected[0])} (fiche « ${deviation.err.nom} »).`, `Your opponent made a known mistake on move ${moveNo(deviation.ply)} (${sanFr(deviation.played)}): the punishment was ${sanFr(deviation.expected[0])} (line “${deviation.err.nom}”).`) });
  }
  const hangingBlunder = errors.find((p) => p.cls.id === 'gaffe' && p.hanging?.length);
  if (hangingBlunder) {
    pistes.push({ id: 'pieces', text: L(`Vérifier les pièces en prise avant chaque coup : après ${moveNo(hangingBlunder.i)} ${sanFr(hangingBlunder.san)}, la ou les pièces en ${hangingBlunder.hanging.map((h) => h.square).join(', ')} étaient mal protégées (le moteur préférait ${sanFr(hangingBlunder.bestSan)}).`, `Check for hanging pieces before every move: after ${moveNo(hangingBlunder.i)} ${sanFr(hangingBlunder.san)}, the piece(s) on ${hangingBlunder.hanging.map((h) => h.square).join(', ')} were poorly protected (the engine preferred ${sanFr(hangingBlunder.bestSan)}).`) });
  }
  const missed = theirs.filter((p) => p.cls?.id === 'gaffe').map((p) => plies[p.i + 1]).find((n) => n && n.mover === game.color && n.loss >= 150);
  if (missed) {
    pistes.push({ id: 'occasion', text: L(`Saisir les cadeaux : au coup ${moveNo(missed.i)}, après une gaffe adverse, ${sanFr(missed.bestSan)} gardait un net avantage ; vous avez joué ${sanFr(missed.san)} (perte ≈ ${(Math.min(missed.loss, 1000) / 100).toFixed(1).replace('.', ',')}).`, `Take the gifts: on move ${moveNo(missed.i)}, after an opponent’s blunder, ${sanFr(missed.bestSan)} kept a clear advantage; you played ${sanFr(missed.san)} (loss ≈ ${(Math.min(missed.loss, 1000) / 100).toFixed(1)}).`) });
  }
  const byPhase = {};
  for (const p of errors) byPhase[p.phase] = (byPhase[p.phase] || 0) + p.loss;
  const worst = Object.entries(byPhase).sort((a, b) => b[1] - a[1])[0];
  if (worst && pistes.length < 3) {
    pistes.push({ id: 'phase', text: L(`Phase la plus coûteuse : ${worst[0]} (${errors.filter((p) => p.phase === worst[0]).length} faute(s)).`, `Costliest phase: ${phaseTxt(worst[0])} (${errors.filter((p) => p.phase === worst[0]).length} error(s)).`) });
  }
  if (pistes.length < 3 && avg != null) {
    pistes.push({ id: 'precision', text: L(`Précision : perte moyenne de ${(avg / 100).toFixed(2).replace('.', ',')} pion par coup ; ${count('gaffe')} gaffe(s), ${count('erreur')} erreur(s), ${count('imprecision')} imprécision(s).`, `Accuracy: average loss of ${(avg / 100).toFixed(2)} pawn per move; ${count('gaffe')} blunder(s), ${count('erreur')} mistake(s), ${count('imprecision')} inaccurac(y/ies).`) });
  }
  return { errors: errors.slice(0, 3), decisive, avg, counts: { gaffe: count('gaffe'), erreur: count('erreur'), imprecision: count('imprecision') }, pistes: pistes.slice(0, 3) };
}

// ---------- Rapport détaillé (texte) ----------
// Rédigé uniquement à partir des calculs de Stockfish (évaluations, variantes) et de
// vérifications de chess.js (matériel, pièces en prise, fourchettes, échecs). Sans IA.

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NOM = L({ p: 'pion', n: 'Cavalier', b: 'Fou', r: 'Tour', q: 'Dame', k: 'Roi' }, { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' });
const LE = L({ p: 'le pion', n: 'le Cavalier', b: 'le Fou', r: 'la Tour', q: 'la Dame', k: 'le Roi' }, { p: 'the pawn', n: 'the knight', b: 'the bishop', r: 'the rook', q: 'the queen', k: 'the king' });
const toMv = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

// Évaluation (centipions côté Blancs) → texte du point de vue de `color`.
export function pourVous(cpWhite, color) {
  if (cpWhite == null) return '?';
  const v = color === 'w' ? cpWhite : -cpWhite;
  if (Math.abs(v) >= 1000) return v > 0 ? L('gagnant (mat en vue)', 'winning (mate in sight)') : L('perdant (mat en vue)', 'losing (mate in sight)');
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${dec((Math.abs(v) / 100).toFixed(1))}`;
}

// Variante UCI rejouée et convertie en SAN (tronquée au premier coup illégal).
export function lineSan(fen, uciPv, max = 8) {
  const c = new Chess(fen);
  const out = [];
  for (const u of (uciPv || []).slice(0, max)) {
    try { out.push(c.move(toMv(u)).san); } catch { break; }
  }
  return out;
}

// Variante numérotée en notation française : « 15. Fxe5 Cxe5 16. Dd4 ».
export function lineText(fen, sans) {
  const parts = fen.split(' ');
  let no = Number(parts[5] || 1);
  let turn = parts[1];
  return sans.map((s, i) => {
    const t = turn === 'w' ? `${no}. ${sanFr(s)}` : (i === 0 ? `${no}… ${sanFr(s)}` : sanFr(s));
    if (turn === 'b') no++;
    turn = turn === 'w' ? 'b' : 'w';
    return t;
  }).join(' ');
}

// Motifs tactiques le long d'une variante, vus par `color` (« moi ») : matériel, fourchettes,
// échecs et mat, pièces laissées en prise. `fen` = position avant le premier coup de `sans`.
export function motifs(fen, sans, color) {
  const c = new Chess(fen);
  const out = [];
  let bilanMat = 0; // matériel gagné (+) ou perdu (−) par « moi » sur la variante
  sans.forEach((san) => {
    let m;
    try { m = c.move(san); } catch { return; }
    if (m.captured) bilanMat += (m.color === color ? 1 : -1) * VAL[m.captured];
    if (m.promotion) bilanMat += (m.color === color ? 1 : -1) * (VAL[m.promotion] - 1);
    if (san.endsWith('#')) out.push({ id: 'mat', qui: m.color === color ? 'moi' : 'adv', san });
    // Fourchette : la pièce jouée attaque au moins deux pièces adverses de valeur (ou le Roi + une pièce).
    const cibles = [];
    for (const row of c.board()) for (const p of row) {
      if (!p || p.color === m.color || p.type === 'p') continue;
      if (c.attackers(p.square, m.color).includes(m.to) && (p.type === 'k' || VAL[p.type] >= VAL[m.piece] || !c.attackers(p.square, p.color).length)) cibles.push(p);
    }
    if (cibles.length >= 2 && !out.some((o) => o.id === 'fourchette')) out.push({ id: 'fourchette', qui: m.color === color ? 'moi' : 'adv', san, piece: m.piece, square: m.to, cibles });
  });
  if (bilanMat <= -2) out.push({ id: 'materiel-perdu', n: -bilanMat });
  if (bilanMat >= 2) out.push({ id: 'materiel-gagne', n: bilanMat });
  return out;
}

const RAPPELS = {
  'en-prise': L('Avant de jouer, vérifiez chaque pièce : est-elle attaquée ? est-elle défendue ? (une pièce non défendue est une cible)', 'Before moving, check every piece: is it attacked? is it defended? (an undefended piece is a target)'),
  fourchette: L('Repérez les cases de fourchette des Cavaliers et de la Dame adverses avant de placer deux pièces sur des cases attaquables ensemble.', 'Spot the fork squares of the opponent’s knights and queen before putting two pieces on squares that can be attacked together.'),
  mat: L('Quand le Roi est exposé, cherchez d’abord les échecs adverses (échecs, prises, menaces : dans cet ordre).', 'When the king is exposed, look for the opponent’s checks first (checks, captures, threats: in that order).'),
  'materiel-perdu': L('Calculez la réponse forcée de l’adversaire (prises et échecs) avant de jouer un coup qui semble actif.', 'Calculate the opponent’s forcing replies (captures and checks) before playing a move that looks active.'),
  occasion: L('Après chaque coup adverse, demandez-vous : « qu’est-ce qui a changé ? une pièce ne se défend plus ? un échec est possible ? »', 'After each opponent’s move, ask yourself: “what has changed? is a piece no longer defended? is a check possible?”'),
  repertoire: L('Révisez la ligne de votre répertoire (Entraînement → Révision espacée) jusqu’au coup où vous en êtes sorti.', 'Review the line of your repertoire (Training → Spaced repetition) up to the move where you left it.'),
  finale: L('En finale, activez le Roi et comptez les tempos des pions passés avant de vous lancer.', 'In the endgame, activate the king and count the tempi of passed pawns before committing.'),
  ouverture: L('Dans l’ouverture : développez, roquez, ne bougez pas deux fois la même pièce sans raison.', 'In the opening: develop, castle, don’t move the same piece twice without a reason.'),
};

// `deep[i]` (facultatif) : { best: { pv, cp }, played: { pv, cp } } — variantes de Stockfish
// pour le meilleur coup et pour la réfutation du coup joué au demi-coup i.
export function rapport(game, plies, b, deviation, deep = {}) {
  const color = game.color;
  const mine = plies.filter((p) => p.mover === color && p.cpBefore != null);
  const nMine = mine.length;
  const exact = mine.filter((p) => !p.cls).length;
  const precision = nMine ? Math.round((100 * exact) / nMine) : null;
  const avg = b.avg;
  let note;
  if (avg == null) note = { titre: L('Analyse incomplète', 'Incomplete analysis'), ton: '' };
  else if (avg <= 25 && !b.counts.gaffe) note = { titre: L('Très bonne partie', 'Very good game'), ton: 'ok' };
  else if (avg <= 50 && b.counts.gaffe <= 1) note = { titre: L('Bonne partie', 'Good game'), ton: 'ok' };
  else if (avg <= 100) note = { titre: L('Partie correcte, avec des moments à revoir', 'Decent game, with moments to review'), ton: '' };
  else note = { titre: L('Partie difficile', 'Tough game'), ton: 'ko' };
  const resultat = L({ victoire: 'Vous avez gagné', défaite: 'Vous avez perdu', nulle: 'Partie nulle', 'en cours': 'Partie non terminée' }, { victoire: 'You won', défaite: 'You lost', nulle: 'Draw', 'en cours': 'Game not finished' })[game.outcome] || L('Résultat inconnu', 'Unknown result');
  const synthese = L(`${resultat}. ${nMine} coups analysés : ${exact} sans faute (${precision ?? '?'} %), ${b.counts.imprecision} imprécision(s), ${b.counts.erreur} erreur(s), ${b.counts.gaffe} gaffe(s)${avg != null ? ` ; perte moyenne ${(avg / 100).toFixed(2).replace('.', ',')} pion par coup` : ''}.`, `${resultat}. ${nMine} moves analysed: ${exact} without error (${precision ?? '?'}%), ${b.counts.imprecision} inaccurac(y/ies), ${b.counts.erreur} mistake(s), ${b.counts.gaffe} blunder(s)${avg != null ? `; average loss ${(avg / 100).toFixed(2)} pawn per move` : ''}.`);

  // Phases : où la partie s'est jouée.
  const phases = ['ouverture', 'milieu de partie', 'finale'].map((ph) => {
    const ps = mine.filter((p) => p.phase === ph);
    if (!ps.length) return null;
    const err = ps.filter((p) => p.cls && p.cls.id !== 'imprecision').length;
    const loss = Math.round(ps.reduce((a, p) => a + Math.min(p.loss, 1000), 0) / ps.length);
    const avis = err === 0 && loss <= 40 ? L('solide', 'solid') : err === 0 ? L('quelques imprécisions', 'a few inaccuracies') : err === 1 ? L('une faute qui a coûté', 'one costly error') : L(`${err} fautes`, `${err} errors`);
    return { phase: ph, coups: ps.length, avis, loss };
  }).filter(Boolean);
  if (deviation?.who === 'moi' && deviation.expected) phases.unshift({ phase: 'répertoire', avis: L(`sorti au coup ${moveNo(deviation.ply)} (${sanFr(deviation.played)} au lieu de ${deviation.expected.map(sanFr).join(' ou ')})`, `left on move ${moveNo(deviation.ply)} (${sanFr(deviation.played)} instead of ${deviation.expected.map(sanFr).join(' or ')})`) });
  else if (deviation?.who === 'aucun' || deviation?.who === 'fin' || deviation?.who === 'adversaire') phases.unshift({ phase: 'répertoire', avis: L('suivi jusqu’à la sortie des fiches ✔', 'followed to the end of your lines ✔') });

  // Bons coups : erreurs adverses sanctionnées, plus longue série de coups exacts.
  const bons = [];
  for (const p of plies) {
    if (p.mover === color || !p.cls || p.cls.id === 'imprecision') continue;
    const r = plies[p.i + 1];
    if (r && r.mover === color && r.cpBefore != null && !r.cls) bons.push({ i: r.i, text: L(`${moveNo(r.i)} ${sanFr(r.san)} : bonne réponse à l’${p.cls.label.toLowerCase()} adverse ${moveNo(p.i)} ${sanFr(p.san)} (évaluation ${pourVous(r.cpAfter, color)} pour vous).`, `${moveNo(r.i)} ${sanFr(r.san)}: good answer to the opponent’s ${p.cls.label.toLowerCase()} ${moveNo(p.i)} ${sanFr(p.san)} (evaluation ${pourVous(r.cpAfter, color)} for you).`) });
  }
  let run = 0; let best = { len: 0, end: -1 };
  for (const p of mine) { run = p.cls ? 0 : run + 1; if (run > best.len) best = { len: run, end: p.i }; }
  if (best.len >= 6) {
    const start = mine[mine.findIndex((p) => p.i === best.end) - best.len + 1];
    bons.push({ i: start.i, text: L(`Série de ${best.len} coups sans faute, de ${moveNo(start.i)} à ${moveNo(best.end)}.`, `Streak of ${best.len} moves without error, from ${moveNo(start.i)} to ${moveNo(best.end)}.`) });
  }

  // Erreurs détaillées : ce qui a été joué, pourquoi c'était faux, ce que donnait le meilleur coup.
  const themes = new Set();
  const erreurs = [...b.errors].sort((x, y) => x.i - y.i).map((p) => {
    const d = deep[p.i] || {};
    const fenBefore = p.fenBefore;
    const refut = d.played?.pv ? lineSan(p.fenAfter, d.played.pv, 8) : [];
    const meilleur = d.best?.pv ? lineSan(fenBefore, d.best.pv, 8) : [];
    const pourquoi = [];
    if (p.hanging?.length) {
      const h = p.hanging[0];
      pourquoi.push(L(`${LE[h.type]} en ${h.square} reste ${h.defended ? 'insuffisamment protégé' : 'sans défense'}`, `${LE[h.type]} on ${h.square} is left ${h.defended ? 'insufficiently protected' : 'undefended'}`));
      themes.add('en-prise');
    }
    for (const m of motifs(p.fenAfter, refut, color)) {
      if (m.id === 'fourchette' && m.qui === 'adv') { pourquoi.push(L(`l’adversaire dispose d’une fourchette (${sanFr(m.san)} attaque ${m.cibles.map((x) => `${NOM[x.type]} ${x.square}`).join(' et ')})`, `the opponent has a fork (${sanFr(m.san)} attacks ${m.cibles.map((x) => `${NOM[x.type]} ${x.square}`).join(' and ')})`)); themes.add('fourchette'); }
      if (m.id === 'mat' && m.qui === 'adv') { pourquoi.push(L('le Roi peut être maté', 'the king can be mated')); themes.add('mat'); }
      if (m.id === 'materiel-perdu') { pourquoi.push(L(`la suite fait perdre environ ${m.n} point(s) de matériel`, `the continuation loses about ${m.n} point(s) of material`)); themes.add('materiel-perdu'); }
    }
    // Un mat possible prime sur le reste : c'est la vraie raison de l'erreur.
    if (pourquoi.some((x) => x.includes(L('maté', 'mated')))) pourquoi.splice(0, pourquoi.length, L('le Roi peut être maté', 'the king can be mated'));
    const gains = meilleur.length ? motifs(fenBefore, meilleur, color).filter((m) => m.qui === 'moi' || m.id === 'materiel-gagne') : [];
    return {
      i: p.i, cls: p.cls, coup: `${moveNo(p.i)} ${sanFr(p.san)}`, phase: p.phase,
      avant: pourVous(p.cpBefore, color), apres: pourVous(p.cpAfter, color), perte: dec((Math.min(p.loss, 1000) / 100).toFixed(1)),
      pourquoi,
      refutation: refut.length ? lineText(p.fenAfter, refut) : null,
      refutationEval: d.played?.cp != null ? pourVous(d.played.cp, color) : null,
      meilleurCoup: sanFr(p.bestSan),
      meilleureLigne: meilleur.length ? lineText(fenBefore, meilleur) : null,
      meilleureEval: d.best?.cp != null ? pourVous(d.best.cp, color) : pourVous(p.cpBefore, color),
      gains: gains.map((m) => (m.id === 'fourchette' ? L(`fourchette ${sanFr(m.san)}`, `fork ${sanFr(m.san)}`) : m.id === 'mat' ? L(`mat (${sanFr(m.san)})`, `mate (${sanFr(m.san)})`) : L(`gain d’environ ${m.n} point(s) de matériel`, `gain of about ${m.n} point(s) of material`))),
    };
  });

  // Occasions manquées : gaffe adverse non exploitée.
  const occasions = [];
  for (const p of plies) {
    if (p.mover === color || p.cls?.id !== 'gaffe') continue;
    const r = plies[p.i + 1];
    if (r && r.mover === color && r.cls && r.loss >= 150 && !b.errors.includes(r)) {
      occasions.push({ i: r.i, text: L(`Après ${moveNo(p.i)} ${sanFr(p.san)}?? de l’adversaire, ${sanFr(r.bestSan)} gardait l’avantage (${pourVous(r.cpBefore, color)}) ; ${sanFr(r.san)} l’a laissé passer (${pourVous(r.cpAfter, color)}).`, `After the opponent’s ${moveNo(p.i)} ${sanFr(p.san)}??, ${sanFr(r.bestSan)} kept the advantage (${pourVous(r.cpBefore, color)}); ${sanFr(r.san)} let it slip (${pourVous(r.cpAfter, color)}).`) });
      themes.add('occasion');
    }
  }
  if (b.pistes.some((x) => x.id === 'occasion')) themes.add('occasion');
  if (deviation?.who === 'moi' && deviation.expected) themes.add('repertoire');
  const pire = phases.filter((x) => x.loss != null).sort((a, z) => z.loss - a.loss)[0];
  if (pire && pire.loss > 60 && (pire.phase === 'finale' || pire.phase === 'ouverture')) themes.add(pire.phase);

  const aRetenir = [...themes].map((t) => RAPPELS[t]).filter(Boolean).slice(0, 5);
  if (!aRetenir.length) aRetenir.push(L('Rien de grave : continuez à vérifier les menaces adverses à chaque coup, c’est ce qui a fonctionné ici.', 'Nothing serious: keep checking the opponent’s threats on every move, that’s what worked here.'));
  const exercices = erreurs.map((e) => ({ i: e.i, text: L(`Position avant ${e.coup} : retrouvez ${e.meilleurCoup} (sans regarder la solution).`, `Position before ${e.coup}: find ${e.meilleurCoup} (without looking at the solution).`) }));
  return { note, synthese, precision, phases, bons: bons.slice(0, 5), erreurs, occasions: occasions.slice(0, 2), aRetenir, exercices };
}

// Demi-coups à approfondir avec Stockfish : erreurs principales du joueur.
export function keyPlies(b) {
  return b.errors.map((p) => p.i);
}
