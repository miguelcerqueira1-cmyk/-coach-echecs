// Génère site/data/repertoire.json : fiches + code ECO / nom (base CC0 lichess-org/chess-openings)
// + résultats de vérification Stockfish (data/verification.json) quand ils correspondent au contenu.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIGNES, REPERTOIRES } from '../site/data/repertoire.js';
import { playLine, buildEcoIndex, classify, entryFingerprint, epd } from '../site/js/lines.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsv = 'abcde'.split('').map((f) => readFileSync(join(root, `data/chess-openings/${f}.tsv`), 'utf8'));
const index = buildEcoIndex(tsv);
const verif = JSON.parse(readFileSync(join(root, 'data/verification.json'), 'utf8'));

const claim = (c) => {
  if (!c) return null;
  const l = playLine(c.ligne);
  return { ...c, san: l.san, uci: l.uci, marked: l.marked };
};

const entries = LIGNES.map((e) => {
  const main = playLine(e.ligne);
  const eco = classify(index, main.fens);
  if (!eco) throw new Error(`Aucun code ECO trouvé pour ${e.id}`);
  // Nom d'ouverture atteint coup par coup (pour les cours) : seulement quand il change.
  const noms = [];
  main.fens.slice(1).forEach((f, i) => {
    const hit = index.get(epd(f));
    if (hit && hit.name !== noms.at(-1)?.name) noms.push({ ply: i, eco: hit.eco, name: hit.name });
  });
  const v = verif.entries[e.id];
  const fresh = v && v.fp === entryFingerprint(e);
  return {
    ...e,
    eco: eco.eco,
    ecoNom: eco.name,
    noms,
    san: main.san,
    uci: main.uci,
    fenFinale: main.fens.at(-1),
    punition: claim(e.punition),
    piege: claim(e.piege),
    verification: fresh ? v : null,
  };
});

mkdirSync(join(root, 'site/data'), { recursive: true });
writeFileSync(join(root, 'site/data/repertoire.json'), JSON.stringify({
  repertoires: REPERTOIRES,
  moteur: { nom: verif.engine, profondeur: verif.depth, date: verif.date },
  entries,
}));
console.log(`repertoire: ${entries.length} fiches, ${entries.filter((e) => e.verification).length} vérifiées → site/data/repertoire.json`);
