// Construction des exercices (logique pure) : ligne complète d'une fiche, punition
// chronométrée d'un coup douteux (« anti-trash »).

const mover = (i) => (i % 2 === 0 ? 'w' : 'b');

// Ligne d'une fiche : chaque demi-coup, avec qui le joue.
export function lineSteps(entry, color) {
  return entry.uci.map((uci, i) => ({ uci, san: entry.san[i], ours: mover(i) === color, ply: i }));
}

// Drill anti-trash : position avant le coup douteux adverse, ce coup, puis la séquence de
// punition (au plus `maxOurs` de nos coups). null si la fiche n'a pas de punition adverse.
export function trashDrill(entry, color, maxOurs = 5) {
  const p = entry.punition;
  if (!p || p.marked == null || mover(p.marked) === color) return null;
  const steps = [];
  let ours = 0;
  for (let i = p.marked + 1; i < p.uci.length; i++) {
    const s = { uci: p.uci[i], san: p.san[i], ours: mover(i) === color, ply: i };
    if (s.ours) { if (ours === maxOurs) break; ours++; }
    steps.push(s);
  }
  while (steps.length && !steps.at(-1).ours) steps.pop(); // finir sur notre coup
  if (!ours) return null;
  return {
    id: entry.id,
    setup: p.uci.slice(0, p.marked),
    bad: { uci: p.uci[p.marked], san: p.san[p.marked], ply: p.marked },
    steps,
    ours: steps.filter((s) => s.ours).length,
    texte: p.texte,
  };
}
