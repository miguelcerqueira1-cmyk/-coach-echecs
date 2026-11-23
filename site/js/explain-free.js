// Explication gratuite, sans IA : chaque phrase est déduite d'un calcul de Stockfish
// (coup conseillé, variante, évaluation, menace « coup nul ») ou d'une vérification
// de chess.js (pièces attaquées, défendues, échec, roque, développement).
// Aucune interprétation stratégique n'est inventée.
import { Chess } from '../vendor/chess.js';
import { sanFr, describeMove, formatScore, scoreVerdict } from './analysis.js';
import { langue } from './i18n.js';

// Phrases en français ou en anglais selon la langue de l'interface.
const L = (fr, en) => (langue() === 'en' ? en : fr);

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = L({ p: 'pion', n: 'Cavalier', b: 'Fou', r: 'Tour', q: 'Dame', k: 'Roi' }, { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' });
const ART = L({ p: 'le pion', n: 'le Cavalier', b: 'le Fou', r: 'la Tour', q: 'la Dame', k: 'le Roi' }, { p: 'the pawn', n: 'the knight', b: 'the bishop', r: 'the rook', q: 'the queen', k: 'the king' });
const COULEUR = L({ w: 'Blancs', b: 'Noirs' }, { w: 'White', b: 'Black' });
const EN_ = L(' en ', ' on ');
const VIRG = (x) => L(x.replace('.', ','), x);
const other = (c) => (c === 'w' ? 'b' : 'w');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mv = (san) => `<strong>${esc(sanFr(san))}</strong>`;

function pieces(c, color) {
  const out = [];
  for (const row of c.board()) for (const p of row) if (p && p.color === color) out.push(p);
  return out;
}

// Pièces de `color` attaquées et en danger : non défendues, ou attaquées par une pièce de moindre valeur.
export function piecesEnDanger(fen, color) {
  const c = new Chess(fen);
  const res = [];
  for (const p of pieces(c, color)) {
    if (p.type === 'k') continue;
    const att = c.attackers(p.square, other(color));
    if (!att.length) continue;
    const def = c.attackers(p.square, color);
    const minAtt = Math.min(...att.map((sq) => VALUE[c.get(sq).type] || 0));
    if (!def.length || minAtt < VALUE[p.type]) res.push({ ...p, defended: def.length > 0 });
  }
  return res.sort((a, b) => VALUE[b.type] - VALUE[a.type]);
}

// Pièces adverses (hors pions) attaquées par la pièce arrivée en `square`.
function cibles(fen, square) {
  const c = new Chess(fen);
  const me = c.get(square);
  if (!me) return [];
  return pieces(c, other(me.color)).filter((p) => p.type !== 'p' && c.attackers(p.square, me.color).includes(square));
}

const plural = (list, fmt) => list.map(fmt).join(', ').replace(/, ([^,]*)$/, L(' et $1', ' and $1'));
const pieceAt = (p) => `${ART[p.type]}${EN_}${p.square}`;

// Score du point de vue d'une couleur, en centipions (mat = ±10000).
function cpFor(scoreWhite, color) {
  if (!scoreWhite) return null;
  const v = scoreWhite.type === 'mate' ? Math.sign(scoreWhite.value || 1) * 10000 : scoreWhite.value;
  return color === 'w' ? v : -v;
}

function raisonsDuCoup(fenAvant, m) {
  const r = [];
  const after = new Chess(fenAvant);
  after.move(m.san);
  const fenApres = after.fen();
  if (m.san.endsWith('#')) r.push(L('donne <strong>échec et mat</strong>', 'gives <strong>checkmate</strong>'));
  if (m.san.startsWith('O-O')) r.push(L('met le Roi à l’abri et active la Tour (roque)', 'puts the king in safety and activates the rook (castling)'));
  if (m.captured) {
    const repris = after.attackers(m.to, other(m.color)).length > 0;
    const gain = VALUE[m.captured] - (repris ? VALUE[m.piece] : 0);
    r.push(`${L('prend', 'takes')} ${ART[m.captured]}${EN_}${m.to}${repris
      ? (gain > 0 ? L(', même si la pièce peut être reprise (bilan matériel favorable)', ', even if the piece can be taken back (favourable material balance)') : L(', avec reprise possible : c’est un échange', ', it can be taken back: it is a trade'))
      : L(', <strong>sans reprise possible</strong>', ', <strong>with no recapture possible</strong>')}`);
  }
  if (m.san.endsWith('+')) r.push(L('donne échec : l’adversaire doit d’abord parer', 'gives check: the opponent must deal with it first'));
  if (m.promotion) r.push(L(`promeut le pion en ${NAME[m.promotion]}`, `promotes the pawn to a ${NAME[m.promotion]}`));
  const home = m.color === 'w' ? '1' : '8';
  if ('nb'.includes(m.piece) && m.from[1] === home) r.push(L('développe une pièce mineure', 'develops a minor piece'));
  if (m.piece === 'p' && ['d', 'e'].includes(m.to[0]) && ['3', '4', '5', '6'].includes(m.to[1])) r.push(L('occupe ou conteste le centre', 'occupies or contests the centre'));
  const t = cibles(fenApres, m.to).filter((p) => p.type !== 'k');
  if (t.length) r.push(`${L('attaque', 'attacks')} ${plural(t, pieceAt)}`);
  // Sécurité de la pièce jouée.
  const danger = piecesEnDanger(fenApres, m.color).find((p) => p.square === m.to);
  if (danger && !m.captured) r.push(L(`(la pièce en ${m.to} peut être attaquée : le moteur a jugé ce risque acceptable)`, `(the piece on ${m.to} can be attacked: the engine judged this risk acceptable)`));
  return r;
}

function planFactuel(fen, color) {
  const c = new Chess(fen);
  const out = [];
  const rights = c.getCastlingRights(color);
  const kingHome = color === 'w' ? 'e1' : 'e8';
  const k = pieces(c, color).find((p) => p.type === 'k');
  if (k?.square === kingHome && (rights.k || rights.q)) out.push(L('votre Roi est encore au centre : le roque reste possible et souvent utile', 'your king is still in the centre: castling is still possible and often useful'));
  const home = color === 'w' ? { b1: 'n', g1: 'n', c1: 'b', f1: 'b' } : { b8: 'n', g8: 'n', c8: 'b', f8: 'b' };
  const nonDev = Object.entries(home).filter(([sq, t]) => { const p = c.get(sq); return p && p.type === t && p.color === color; });
  if (nonDev.length) out.push(`${L('pièces mineures pas encore développées : ', 'minor pieces not yet developed: ')}${plural(nonDev, ([sq, t]) => `${ART[t]}${EN_}${sq}`)}`);
  return out;
}

// Vrai si la menace (analyse « coup nul ») coûterait au moins un pion au joueur.
export function menaceSerieuse(advice, threat, color) {
  if (!threat) return false;
  const cur = cpFor(advice.scoreWhite, color);
  const thr = cpFor(threat.scoreWhite, color);
  return cur != null && thr != null && cur - thr >= 100;
}

// Construit l'explication (liste de sections { titre, html }).
// masquer : version sans le coup conseillé ni la suite (mode « Indice d'abord »).
export function explicationGratuite({ game, advice, threat, deviation, masquer = false }) {
  const sections = [];
  const color = game.playerColor;
  const fen = advice.fen;
  const last = game.lastMove();

  // 1. Dernier coup
  let d = last
    ? L(`Les ${COULEUR[last.color]} ont joué ${mv(last.san)} : ${esc(describeMove(last))}.`, `${COULEUR[last.color]} played ${mv(last.san)}: ${esc(describeMove(last))}.`)
    : L('Début de partie : aucun coup joué depuis la position de départ.', 'Start of the game: no move played from the starting position.');
  if (last) {
    const t = cibles(fen, last.to).filter((p) => p.type !== 'k');
    if (t.length) d += L(` Cette pièce attaque maintenant ${plural(t, pieceAt)}.`, ` This piece now attacks ${plural(t, pieceAt)}.`);
  }
  if (deviation?.who === 'opponent') d += L(` La ligne calculée prévoyait plutôt ${mv(deviation.expected)}.`, ` The computed line expected ${mv(deviation.expected)} instead.`);
  sections.push({ titre: L('Dernier coup', 'Last move'), html: d });

  const evalTxt = `${esc(formatScore(advice.scoreWhite))} (${esc(scoreVerdict(advice.scoreWhite))})`;

  if (advice.isPlayerTurn) {
    // 2. Pourquoi ce coup
    if (!masquer) {
    const raisons = raisonsDuCoup(fen, advice.best);
    let p = `${mv(advice.best.san)} — ${esc(advice.bestDescription)}.`;
    if (raisons.length) p += L(` Ce coup ${raisons.join(' ; ')}.`, ` This move ${raisons.join('; ')}.`);
    if (threat && threat.move.to === advice.best.from) p += L(' Il déplace aussi la pièce que l’adversaire menaçait.', ' It also moves the piece the opponent was threatening.');
    p += L(` Évaluation du moteur : ${evalTxt}.`, ` Engine evaluation: ${evalTxt}.`);
    if (advice.reply) p += L(` Meilleure réponse adverse calculée : ${mv(advice.reply.san)}.`, ` Best computed opponent reply: ${mv(advice.reply.san)}.`);
    sections.push({ titre: L('Pourquoi ce coup', 'Why this move'), html: p });
    }

    // 3. Menace
    const m = [];
    if (threat) {
      const cur = cpFor(advice.scoreWhite, color);
      const thr = cpFor(threat.scoreWhite, color);
      const swing = cur != null && thr != null ? cur - thr : null;
      let t = L(`Si l’adversaire pouvait rejouer maintenant, le moteur jouerait ${mv(threat.san)} (${esc(threat.description)})`, `If the opponent could move again now, the engine would play ${mv(threat.san)} (${esc(threat.description)})`);
      if (threat.move.captured) t += L(`, qui prendrait ${ART[threat.move.captured]} en ${threat.move.to}`, `, which would take ${ART[threat.move.captured]} on ${threat.move.to}`);
      if (swing != null && swing >= 100) t += L(` : <strong>menace sérieuse</strong> (environ ${VIRG((swing / 100).toFixed(1))} pion${swing >= 200 ? 's' : ''} d’écart)`, `: <strong>serious threat</strong> (about ${VIRG((swing / 100).toFixed(1))} pawn${swing >= 200 ? 's' : ''} difference)`);
      else if (swing != null) t += L(' : pas de menace immédiate importante', ': no important immediate threat');
      m.push(t + '.');
    } else if (game.status().inCheck) {
      m.push(L('Vous êtes en échec : il faut d’abord le parer.', 'You are in check: deal with it first.'));
    }
    const danger = piecesEnDanger(fen, color);
    if (danger.length) m.push(L(`Pièces actuellement attaquées et insuffisamment protégées : ${plural(danger, pieceAt)}.`, `Pieces currently attacked and not sufficiently protected: ${plural(danger, pieceAt)}.`));
    if (!m.length) m.push(L('Aucune pièce en prise et pas de menace détectée.', 'No hanging piece and no threat detected.'));
    sections.push({ titre: L('Menace à surveiller', 'Threat to watch'), html: m.join(' ') });

    // 4. Plan (faits vérifiables + suite calculée)
    const plan = planFactuel(fen, color);
    let pl = plan.length ? `${plan.map((x) => x[0].toUpperCase() + x.slice(1)).join('. ')}. ` : '';
    if (!masquer) pl += `${L('Suite calculée par le moteur : ', 'Continuation computed by the engine: ')}<span class="line">${esc(advice.lineText)}</span>.`;
    else if (!plan.length) pl = L(`Évaluation actuelle : ${evalTxt}. Cherchez le coup qui améliore votre position.`, `Current evaluation: ${evalTxt}. Look for the move that improves your position.`);
    sections.push({ titre: 'Plan', html: pl });
  } else {
    // Tour de l'adversaire
    const raisons = raisonsDuCoup(fen, advice.best);
    let r = L(`Le coup le plus fort pour l’adversaire selon le moteur est ${mv(advice.best.san)} — ${esc(advice.bestDescription)}.`, `The strongest move for the opponent according to the engine is ${mv(advice.best.san)} — ${esc(advice.bestDescription)}.`);
    if (raisons.length) r += L(` Il ${raisons.join(' ; ')}.`, ` It ${raisons.join('; ')}.`);
    r += L(` Évaluation : ${evalTxt}. Un humain peut jouer autre chose : saisissez le coup réellement joué.`, ` Evaluation: ${evalTxt}. A human may play something else: enter the move actually played.`);
    sections.push({ titre: L('Meilleure réponse adverse calculée', 'Best computed opponent reply'), html: r });
    const danger = piecesEnDanger(fen, color);
    sections.push({
      titre: L('À surveiller', 'To watch'),
      html: danger.length
        ? L(`Vos pièces attaquées et insuffisamment protégées : ${plural(danger, pieceAt)}.`, `Your pieces attacked and not sufficiently protected: ${plural(danger, pieceAt)}.`)
        : L('Aucune de vos pièces n’est en prise pour l’instant.', 'None of your pieces is hanging for now.'),
    });
  }
  return sections;
}

export function renderExplication(sections) {
  return sections.map((s) => `<p><strong>${esc(s.titre)} :</strong> ${s.html}</p>`).join('');
}
