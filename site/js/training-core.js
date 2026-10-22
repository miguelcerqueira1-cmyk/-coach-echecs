// Logique pure du mode Entraînement (testée sans navigateur).
//
// Arbre construit à partir des fiches du répertoire :
//  - coups « du répertoire » pour notre camp : lignes principales et punitions ;
//  - coups adverses possibles (mode « fiches seulement ») : mêmes lignes ;
//  - pièges : notre coup fautif marqué dans chaque fiche (à ne pas jouer) ;
//  - erreurs adverses connues : coup fautif marqué dans les punitions (à punir).

export const key = (path) => path.join(',');

export function buildTree(entries, rep) {
  const tree = { ours: new Map(), theirs: new Map(), traps: new Map(), errors: new Map(), color: null };
  const add = (map, k, uci, info) => {
    if (!map.has(k)) map.set(k, new Map());
    const m = map.get(k);
    if (!m.has(uci)) m.set(uci, []);
    m.get(uci).push(info);
  };
  for (const e of entries) {
    if (e.rep !== rep) continue;
    const color = rep === 'gd' ? 'w' : 'b';
    tree.color = color;
    const lines = [{ uci: e.uci, kind: 'ligne' }];
    if (e.punition) lines.push({ uci: e.punition.uci, kind: 'punition', marked: e.punition.marked });
    for (const l of lines) {
      for (let i = 0; i < l.uci.length; i++) {
        const mover = i % 2 === 0 ? 'w' : 'b';
        const k = key(l.uci.slice(0, i));
        const info = { id: e.id, nom: e.nom, kind: l.kind };
        if (mover === color) add(tree.ours, k, l.uci[i], info);
        else add(tree.theirs, k, l.uci[i], info);
        if (l.kind === 'punition' && i === l.marked) {
          tree.errors.set(key(l.uci.slice(0, i + 1)), { id: e.id, nom: e.nom, texte: e.punition.texte, suite: l.uci.slice(i + 1) });
        }
      }
    }
    if (e.piege) {
      const m = e.piege.marked;
      tree.traps.set(key(e.piege.uci.slice(0, m)), { uci: e.piege.uci[m], id: e.id, nom: e.nom, texte: e.piege.texte });
    }
  }
  return tree;
}

// Tirage pondéré par le nombre de parties ; `rng` injectable pour les tests.
export function weightedPick(moves, rng = Math.random) {
  const total = moves.reduce((a, m) => a + m.weight, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const m of moves) {
    r -= m.weight;
    if (r < 0) return m;
  }
  return moves.at(-1);
}

// Verdict sur notre coup. `loss` : perte d'évaluation en centipions (≥ 0) par rapport au
// meilleur coup du moteur, ou null si le coup est du répertoire (pas d'analyse nécessaire).
export function verdict({ inBook, isBookMove, isTrap, loss }) {
  if (isTrap) return { level: 'piege', ok: false };
  if (isBookMove) return { level: 'repertoire', ok: true };
  if (loss == null) return { level: 'inconnu', ok: true };
  if (loss <= 40) return { level: inBook ? 'bon-hors-fiche' : 'bon', ok: true };
  if (loss <= 120) return { level: 'imprecision', ok: false };
  if (loss <= 300) return { level: 'erreur', ok: false };
  return { level: 'gaffe', ok: false };
}

export const VERDICT_TEXT = {
  repertoire: '✔ Coup du répertoire',
  bon: '✔ Bon coup (le moteur est d’accord)',
  'bon-hors-fiche': '✔ Bon coup, mais ce n’est pas celui de votre répertoire',
  inconnu: '✔ Coup joué',
  imprecision: '≈ Imprécision',
  erreur: '✘ Erreur',
  gaffe: '✘ Gaffe',
  piege: '✘ C’est le piège de la fiche !',
};

// Évaluation (score UCI du camp au trait) → centipions du point de vue de `color`.
export function cpFrom(score, turn, color) {
  if (!score) return null;
  const v = score.type === 'mate' ? Math.sign(score.value || -1) * (10000 - Math.abs(score.value)) : score.value;
  return turn === color ? v : -v;
}
