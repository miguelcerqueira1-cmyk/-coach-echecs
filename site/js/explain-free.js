// Explication gratuite, sans IA : chaque phrase est déduite d'un calcul de Stockfish
// (coup conseillé, variante, évaluation, menace « coup nul ») ou d'une vérification
// de chess.js (pièces attaquées, défendues, échec, roque, développement).
// Aucune interprétation stratégique n'est inventée.
import { Chess } from '../vendor/chess.js';
import { sanFr, describeMove, formatScore, scoreVerdict, COLOR_NAMES } from './analysis.js';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { p: 'pion', n: 'Cavalier', b: 'Fou', r: 'Tour', q: 'Dame', k: 'Roi' };
const ART = { p: 'le pion', n: 'le Cavalier', b: 'le Fou', r: 'la Tour', q: 'la Dame', k: 'le Roi' };
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

const plural = (list, fmt) => list.map(fmt).join(', ').replace(/, ([^,]*)$/, ' et $1');
const pieceAt = (p) => `${ART[p.type]} en ${p.square}`;

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
  if (m.san.endsWith('#')) r.push('donne <strong>échec et mat</strong>');
  if (m.san.startsWith('O-O')) r.push('met le Roi à l’abri et active la Tour (roque)');
  if (m.captured) {
    const repris = after.attackers(m.to, other(m.color)).length > 0;
    const gain = VALUE[m.captured] - (repris ? VALUE[m.piece] : 0);
    r.push(`prend ${ART[m.captured]} en ${m.to}${repris
      ? (gain > 0 ? `, même si la pièce peut être reprise (bilan matériel favorable)` : ', avec reprise possible : c’est un échange')
      : ', <strong>sans reprise possible</strong>'}`);
  }
  if (m.san.endsWith('+')) r.push('donne échec : l’adversaire doit d’abord parer');
  if (m.promotion) r.push(`promeut le pion en ${NAME[m.promotion]}`);
  const home = m.color === 'w' ? '1' : '8';
  if ('nb'.includes(m.piece) && m.from[1] === home) r.push('développe une pièce mineure');
  if (m.piece === 'p' && ['d', 'e'].includes(m.to[0]) && ['3', '4', '5', '6'].includes(m.to[1])) r.push('occupe ou conteste le centre');
  const t = cibles(fenApres, m.to).filter((p) => p.type !== 'k');
  if (t.length) r.push(`attaque ${plural(t, pieceAt)}`);
  // Sécurité de la pièce jouée.
  const danger = piecesEnDanger(fenApres, m.color).find((p) => p.square === m.to);
  if (danger && !m.captured) r.push(`(la pièce en ${m.to} peut être attaquée : le moteur a jugé ce risque acceptable)`);
  return r;
}

function planFactuel(fen, color) {
  const c = new Chess(fen);
  const out = [];
  const rights = c.getCastlingRights(color);
  const kingHome = color === 'w' ? 'e1' : 'e8';
  const k = pieces(c, color).find((p) => p.type === 'k');
  if (k?.square === kingHome && (rights.k || rights.q)) out.push('votre Roi est encore au centre : le roque reste possible et souvent utile');
  const home = color === 'w' ? { b1: 'n', g1: 'n', c1: 'b', f1: 'b' } : { b8: 'n', g8: 'n', c8: 'b', f8: 'b' };
  const nonDev = Object.entries(home).filter(([sq, t]) => { const p = c.get(sq); return p && p.type === t && p.color === color; });
  if (nonDev.length) out.push(`pièces mineures pas encore développées : ${plural(nonDev, ([sq, t]) => `${ART[t]} en ${sq}`)}`);
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
export function explicationGratuite({ game, advice, threat, deviation }) {
  const sections = [];
  const color = game.playerColor;
  const fen = advice.fen;
  const last = game.lastMove();

  // 1. Dernier coup
  let d = last
    ? `Les ${COLOR_NAMES[last.color]} ont joué ${mv(last.san)} : ${esc(describeMove(last))}.`
    : 'Début de partie : aucun coup joué depuis la position de départ.';
  if (last) {
    const t = cibles(fen, last.to).filter((p) => p.type !== 'k');
    if (t.length) d += ` Cette pièce attaque maintenant ${plural(t, pieceAt)}.`;
  }
  if (deviation?.who === 'opponent') d += ` La ligne calculée prévoyait plutôt ${mv(deviation.expected)}.`;
  sections.push({ titre: 'Dernier coup', html: d });

  const evalTxt = `${esc(formatScore(advice.scoreWhite))} (${esc(scoreVerdict(advice.scoreWhite))})`;

  if (advice.isPlayerTurn) {
    // 2. Pourquoi ce coup
    const raisons = raisonsDuCoup(fen, advice.best);
    let p = `${mv(advice.best.san)} — ${esc(advice.bestDescription)}.`;
    if (raisons.length) p += ` Ce coup ${raisons.join(' ; ')}.`;
    if (threat && threat.move.to === advice.best.from) p += ' Il déplace aussi la pièce que l’adversaire menaçait.';
    p += ` Évaluation du moteur : ${evalTxt}.`;
    if (advice.reply) p += ` Meilleure réponse adverse calculée : ${mv(advice.reply.san)}.`;
    sections.push({ titre: 'Pourquoi ce coup', html: p });

    // 3. Menace
    const m = [];
    if (threat) {
      const cur = cpFor(advice.scoreWhite, color);
      const thr = cpFor(threat.scoreWhite, color);
      const swing = cur != null && thr != null ? cur - thr : null;
      let t = `Si l’adversaire pouvait rejouer maintenant, le moteur jouerait ${mv(threat.san)} (${esc(threat.description)})`;
      if (threat.move.captured) t += `, qui prendrait ${ART[threat.move.captured]} en ${threat.move.to}`;
      if (swing != null && swing >= 100) t += ` : <strong>menace sérieuse</strong> (environ ${(swing / 100).toFixed(1).replace('.', ',')} pion${swing >= 200 ? 's' : ''} d’écart)`;
      else if (swing != null) t += ' : pas de menace immédiate importante';
      m.push(t + '.');
    } else if (game.status().inCheck) {
      m.push('Vous êtes en échec : il faut d’abord le parer.');
    }
    const danger = piecesEnDanger(fen, color);
    if (danger.length) m.push(`Pièces actuellement attaquées et insuffisamment protégées : ${plural(danger, pieceAt)}.`);
    if (!m.length) m.push('Aucune pièce en prise et pas de menace détectée.');
    sections.push({ titre: 'Menace à surveiller', html: m.join(' ') });

    // 4. Plan (faits vérifiables + suite calculée)
    const plan = planFactuel(fen, color);
    let pl = plan.length ? `${plan.map((x) => x[0].toUpperCase() + x.slice(1)).join('. ')}. ` : '';
    pl += `Suite calculée par le moteur : <span class="line">${esc(advice.lineText)}</span>.`;
    sections.push({ titre: 'Plan', html: pl });
  } else {
    // Tour de l'adversaire
    const raisons = raisonsDuCoup(fen, advice.best);
    let r = `Le coup le plus fort pour l’adversaire selon le moteur est ${mv(advice.best.san)} — ${esc(advice.bestDescription)}.`;
    if (raisons.length) r += ` Il ${raisons.join(' ; ')}.`;
    r += ` Évaluation : ${evalTxt}. Un humain peut jouer autre chose : saisissez le coup réellement joué.`;
    sections.push({ titre: 'Meilleure réponse adverse calculée', html: r });
    const danger = piecesEnDanger(fen, color);
    sections.push({
      titre: 'À surveiller',
      html: danger.length
        ? `Vos pièces attaquées et insuffisamment protégées : ${plural(danger, pieceAt)}.`
        : 'Aucune de vos pièces n’est en prise pour l’instant.',
    });
  }
  return sections;
}

export function renderExplication(sections) {
  return sections.map((s) => `<p><strong>${esc(s.titre)} :</strong> ${s.html}</p>`).join('');
}
