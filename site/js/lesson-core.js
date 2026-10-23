// Cours d'ouverture (logique pure, testée sans navigateur).
// - noms d'ouverture : nom officiel (base CC0 lichess-org/chess-openings) + traduction française ;
// - commentaires des coups : uniquement des faits vérifiés par chess.js (développement, centre,
//   roque, prise, échec, attaque, clouage). Aucune intention stratégique n'est inventée : les
//   plans viennent du texte rédigé de la fiche.
import { Chess } from '../vendor/chess.js';
import { sanFr } from './analysis.js';

const HEADS = [
  ["Queen's Gambit Declined", 'Gambit Dame refusé'],
  ["Queen's Gambit Accepted", 'Gambit Dame accepté'],
  ["Queen's Gambit", 'Gambit Dame'],
  ["Queen's Pawn Game", 'Partie du pion Dame'],
  ["King's Pawn Game", 'Partie du pion Roi'],
  ['Caro-Kann Defense', 'Défense Caro-Kann'],
  ['Semi-Slav Defense', 'Défense semi-slave'],
  ['Slav Defense', 'Défense slave'],
  ['Tarrasch Defense', 'Défense Tarrasch'],
  ['Englund Gambit', 'Gambit Englund'],
  ['Borg Defense', 'Défense Borg'],
  ['Borg Gambit', 'Gambit Borg'],
  ['Albin Countergambit', 'Contre-gambit Albin'],
  ['Chigorin Defense', 'Défense Tchigorine'],
  ['Baltic Defense', 'Défense balte'],
  ['Marshall Defense', 'Défense Marshall'],
  ['Austrian Defense', 'Défense autrichienne'],
  ['Orthodox Defense', 'Défense orthodoxe'],
  ['Exchange Variation', 'Variante d’échange'],
  ['Advance Variation', 'Variante d’avance'],
  ['Main Line', 'Ligne principale'],
  ['Normal Line', 'Ligne normale'],
  ['Normal Variation', 'Variante normale'],
  ['Normal Defense', 'Défense normale'],
  ['Modern Variation', 'Variante moderne'],
  ['Modern Line', 'Ligne moderne'],
  ['Classical Variation', 'Variante classique'],
  ['Classical Defense', 'Défense classique'],
  ['Classical System', 'Système classique'],
  ['Old Variation', 'Variante ancienne'],
  ['Central Variation', 'Variante centrale'],
  ['Two Knights Variation', 'Variante des deux Cavaliers'],
  ['Two Knights Attack', 'Attaque des deux Cavaliers'],
  ['Three Knights Variation', 'Variante des trois Cavaliers'],
  ['Fianchetto Variation', 'Variante du fianchetto'],
  ["Queen's Knight Variation", 'Variante du Cavalier Dame'],
  ['Positional Variation', 'Variante positionnelle'],
  ['Fantasy Variation', 'Variante Fantaisie'],
  ['Dutch Variation', 'Variante hollandaise'],
  ['Czech Variation', 'Variante tchèque'],
  ['Prague Variation', 'Variante de Prague'],
  ['Moscow Variation', 'Variante de Moscou'],
  ['Carlsbad Variation', 'Variante de Carlsbad'],
  ['Panov Attack', 'Attaque Panov'],
  ['Accelerated Panov Attack', 'Attaque Panov accélérée'],
  ['Polish Defense', 'Défense polonaise'],
  ['Blackmar-Diemer Gambit Accepted', 'Gambit Blackmar-Diemer accepté'],
  ['Spassky Gambit Accepted', 'Gambit Spassky accepté'],
  ['Accelerated Move Order', 'Ordre de coups accéléré'],
  ['Traditional System', 'Système traditionnel'],
  ['Argentinian Gambit', 'Gambit argentin'],
  ['Neo-Orthodox Variation', 'Variante néo-orthodoxe'],
  ['Modern Defense', 'Défense moderne'],
  ['Exchange Line', 'Ligne d’échange'],
  ['Harrwitz Attack', 'Attaque Harrwitz'],
];
const GENERIC = [
  [/^(.+) Variation$/, 'Variante $1'],
  [/^(.+) Attack$/, 'Attaque $1'],
  [/^(.+) Defense$/, 'Défense $1'],
  [/^(.+) Countergambit$/, 'Contre-gambit $1'],
  [/^(.+) Gambit$/, 'Gambit $1'],
  [/^(.+) System$/, 'Système $1'],
  [/^(.+) Line$/, 'Ligne $1'],
  [/^(.+) Trap$/, 'Piège $1'],
];

// « Queen's Gambit Declined: Orthodox Defense, Main Line » → « Gambit Dame refusé : Défense orthodoxe, ligne principale »
export function nomFr(name) {
  if (!name) return '';
  const parts = name.split(/(: |, )/);
  return parts.map((p, i) => {
    if (p === ': ' || p === ', ') return p === ': ' ? ' : ' : ', ';
    const head = HEADS.find(([en]) => en === p);
    let fr = head ? head[1] : null;
    if (!fr) for (const [re, rep] of GENERIC) if (re.test(p)) { fr = p.replace(re, rep); break; }
    fr = (fr || p).replace(/\b([KQRBN])([a-h]?[1-8]?x?[a-h][1-8])\b/g, (m) => sanFr(m));
    return i > 0 && parts[i - 1] === ', ' ? fr[0].toLowerCase() + fr.slice(1) : fr;
  }).join('');
}

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NOM = { p: 'pion', n: 'Cavalier', b: 'Fou', r: 'Tour', q: 'Dame', k: 'Roi' };
const LE = { p: 'le pion', n: 'le Cavalier', b: 'le Fou', r: 'la Tour', q: 'la Dame', k: 'le Roi' };
const CENTRE = ['d4', 'e4', 'd5', 'e5'];
const DIRS = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
DIRS.q = [...DIRS.b, ...DIRS.r];

const sq = (f, r) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? 'abcdefgh'[f] + (r + 1) : null);
const fr = (s) => [s.charCodeAt(0) - 97, Number(s[1]) - 1];

// Clouage : une pièce adverse attaquée par la pièce jouée, avec derrière elle (même ligne)
// une pièce adverse de plus grande valeur.
function clouages(c, m) {
  const out = [];
  for (const [df, dr] of DIRS[m.piece] || []) {
    let [f, r] = fr(m.to);
    let first = null;
    for (;;) {
      f += df; r += dr;
      const s = sq(f, r);
      if (!s) break;
      const p = c.get(s);
      if (!p) continue;
      if (p.color === m.color) break;
      if (!first) { first = { ...p, square: s }; continue; }
      // Clouage utile seulement : pièce (pas un pion) clouée, ou pion cloué sur la Dame / le Roi.
      if (VAL[p.type] > VAL[first.type] && (first.type !== 'p' || p.type === 'q' || p.type === 'k')) out.push({ cloue: first, derriere: { ...p, square: s } });
      break;
    }
  }
  return out;
}

// Commentaires factuels d'un coup joué depuis `fen`.
export function commentaires(fen, san) {
  const c = new Chess(fen);
  const m = c.move(san);
  const out = [];
  if (m.san.startsWith('O-O')) out.push(m.san.startsWith('O-O-O') ? 'Grand roque : le Roi part à l’abri de l’autre côté et la Tour rejoint le centre.' : 'Petit roque : le Roi est à l’abri et la Tour entre en jeu.');
  if (m.captured) out.push(`Prend ${LE[m.captured]} en ${m.to}${m.isEnPassant() ? ' (prise en passant)' : ''}.`);
  if (m.promotion) out.push(`Promotion en ${NOM[m.promotion]}.`);
  if (m.piece === 'p' && !m.captured && CENTRE.includes(m.to)) out.push(`Pion au centre en ${m.to} : il occupe et contrôle les cases centrales.`);
  if ((m.piece === 'n' || m.piece === 'b') && (m.from[1] === '1' || m.from[1] === '8')) out.push(`Développement : ${LE[m.piece]} quitte sa case de départ pour ${m.to}.`);
  if (m.piece === 'q' && c.history().length <= 12 && !m.captured) out.push('La Dame sort tôt : elle peut devenir une cible pour les pièces adverses.');
  // Pièces adverses attaquées par la pièce jouée (pions compris pour la tension centrale).
  const cibles = [];
  for (const row of c.board()) for (const p of row) {
    if (!p || p.color === m.color || p.type === 'k') continue;
    if (c.attackers(p.square, m.color).includes(m.to)) cibles.push(p);
  }
  if (m.piece === 'p' && cibles.some((p) => p.type === 'p')) {
    const t = cibles.find((p) => p.type === 'p');
    out.push(`Attaque le pion en ${t.square} : tension au centre.`);
  } else if (cibles.some((p) => p.type !== 'p')) {
    out.push(`Attaque ${cibles.filter((p) => p.type !== 'p').map((p) => `${LE[p.type]} en ${p.square}`).join(' et ')}.`);
  }
  for (const k of clouages(c, m)) out.push(`Cloue ${LE[k.cloue.type]} en ${k.cloue.square} sur ${LE[k.derriere.type]} en ${k.derriere.square}.`);
  if (m.san.endsWith('#')) out.push('Échec et mat !');
  else if (m.san.endsWith('+')) out.push('Donne échec.');
  if (!out.length) out.push(m.piece === 'p' ? `Coup de pion ${m.from}-${m.to}.` : `${NOM[m.piece]} de ${m.from} vers ${m.to}.`);
  return out;
}

// Étapes d'une leçon : chaque demi-coup de la fiche, qui le joue, commentaires et nom atteint.
export function lessonSteps(entry, color) {
  const c = new Chess();
  const noms = new Map((entry.noms || []).map((n) => [n.ply, n]));
  return entry.san.map((san, i) => {
    const fen = c.fen();
    const no = `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'}`;
    const step = {
      ply: i, san, sanFr: sanFr(san), label: `${no} ${sanFr(san)}`, uci: entry.uci[i],
      ours: (i % 2 === 0 ? 'w' : 'b') === color, fen,
      notes: commentaires(fen, san),
      nom: noms.has(i) ? { ...noms.get(i), fr: nomFr(noms.get(i).name) } : null,
    };
    c.move(san);
    step.fenAfter = c.fen();
    return step;
  });
}

// Ordre conseillé des leçons : théorie d'abord, par famille, puis pièges et coups loufoques.
export function courseOrder(entries, rep) {
  const rank = { theorie: 0, piege: 1, loufoque: 2 };
  const fams = [];
  for (const e of entries) if (e.rep === rep && !fams.includes(e.famille)) fams.push(e.famille);
  return entries.filter((e) => e.rep === rep)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (rank[a.e.badge] ?? 3) - (rank[b.e.badge] ?? 3) || fams.indexOf(a.e.famille) - fams.indexOf(b.e.famille) || a.i - b.i)
    .map((x) => x.e);
}
