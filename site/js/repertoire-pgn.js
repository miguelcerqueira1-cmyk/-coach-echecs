// Export du répertoire en PGN (une partie par fiche) : ligne principale, punitions et
// pièges en variantes, coup fautif annoté $2 (« ? »), plan et explications en commentaires.
// Importable dans une étude Lichess (64 chapitres max par étude) ou la bibliothèque Chess.com.

const clean = (s) => String(s || '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();

function wrap(text, width = 80) {
  const out = [];
  let line = '';
  for (const tok of text.split(' ')) {
    if (line && (line + ' ' + tok).length > width) { out.push(line); line = tok; } else line = line ? `${line} ${tok}` : tok;
  }
  if (line) out.push(line);
  return out.join('\n');
}

// Arbre : ligne principale + variantes ancrées sur un demi-coup.
function buildTree(entry) {
  let main = entry.san.slice();
  const extras = [];
  const claims = [
    entry.punition && { san: entry.punition.san, marked: entry.punition.marked, label: 'Punition', texte: entry.punition.texte },
    entry.piege && { san: entry.piege.san, marked: entry.piege.marked, label: 'Piège à éviter', texte: entry.piege.texte },
  ].filter(Boolean);
  for (const c of claims) {
    let d = 0;
    while (d < main.length && d < c.san.length && main[d] === c.san[d]) d++;
    if (d >= main.length) {
      // La ligne prolonge la ligne principale : on l'y ajoute directement.
      main = c.san.slice();
      extras.push({ prolonge: true, marked: c.marked, comment: `${c.label} : ${clean(c.texte)}` });
    } else {
      // Si le coup fautif est déjà dans la ligne principale, le commentaire suit le 1er coup de la variante.
      extras.push({ at: d, san: c.san.slice(d), marked: c.marked - d, comment: `${c.label} : ${clean(c.texte)}` });
    }
  }
  return { main, extras };
}

// markedComment : commentaire placé juste après le coup fautif (chess.js refuse un
// commentaire en tout début de variante).
function moveTokens(sans, startPly, { marked = -1, firstComment = null, markedComment = null, commentAt = marked, variationsAt = {} } = {}) {
  const out = [];
  let needNumber = true;
  if (firstComment) out.push(`{ ${firstComment} }`);
  sans.forEach((san, k) => {
    const ply = startPly + k;
    const no = Math.floor(ply / 2) + 1;
    if (ply % 2 === 0) out.push(`${no}.`);
    else if (needNumber) out.push(`${no}...`);
    out.push(san + (k === marked ? ' $2' : ''));
    needNumber = false;
    // Variantes d'abord, puis commentaire : chess.js refuse « ) { … } » comme « ( { … } ».
    const vs = variationsAt[k] || [];
    if (k === commentAt && markedComment && !vs.length) { out.push(`{ ${markedComment} }`); needNumber = true; }
    for (const v of vs) { out.push(v); needNumber = true; }
    if (k === commentAt && markedComment && vs.length) {
      // Commentaire rattaché à la variante : placé dans la dernière variante, avant « ) ».
      out[out.length - 1] = out[out.length - 1].replace(/ \)$/, ` { ${markedComment} } )`);
    }
  });
  return out.join(' ');
}

export function entryToPgn(entry, { repTitle, colorName } = {}) {
  const { main, extras } = buildTree(entry);
  const variationsAt = {};
  let mainMarked = -1;
  let mainComment = null;
  for (const x of extras) {
    if (x.prolonge) { mainMarked = x.marked; mainComment = x.comment; continue; }
    const at = x.marked >= 0 ? x.marked : 0;
    const v = `( ${moveTokens(x.san, x.at, { marked: x.marked, markedComment: x.comment, commentAt: at })} )`;
    (variationsAt[x.at] ||= []).push(v);
  }
  // Les variantes s'écrivent APRÈS le coup principal qu'elles remplacent.
  const after = {};
  for (const [k, vs] of Object.entries(variationsAt)) after[Number(k)] = vs;
  const intro = clean(`${entry.nom}. Plan : ${entry.plan} Structure : ${entry.structure} Cases clés : ${entry.cases}. À échanger : ${entry.echanger}. À conserver : ${entry.conserver}. (Textes rédigés ; lignes tactiques vérifiées par Stockfish.)`);
  const body = moveTokens(main, 0, { marked: mainMarked, markedComment: mainComment, firstComment: intro, variationsAt: after });
  const headers = [
    ['Event', `${repTitle || 'Répertoire'} — ${entry.nom}`],
    ['Site', 'Coach Échecs'],
    ['Date', '????.??.??'],
    ['Round', '-'],
    ['White', colorName === 'Blancs' ? 'Moi' : '?'],
    ['Black', colorName === 'Noirs' ? 'Moi' : '?'],
    ['Result', '*'],
    ['ECO', entry.eco],
    ['Opening', entry.ecoNom],
    ['Annotator', 'Coach Échecs'],
  ];
  return `${headers.map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n')}\n\n${wrap(body + ' *')}\n`;
}

export function repertoireToPgn(entries, repertoires, rep = null) {
  return entries
    .filter((e) => !rep || e.rep === rep)
    .map((e) => entryToPgn(e, { repTitle: repertoires[e.rep].titre, colorName: repertoires[e.rep].couleur === 'w' ? 'Blancs' : 'Noirs' }))
    .join('\n');
}
