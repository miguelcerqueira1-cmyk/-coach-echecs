// Contrôle des explications « 💡 Pourquoi ce coup ? » (site/data/pourquoi/<rep>.json) :
// - chaque clé correspond à un coup d'une fiche du répertoire (rien d'orphelin) ;
// - textes français et anglais présents, 1 à 2 phrases (≤ 240 caractères) ;
// - aucune évaluation chiffrée (« +1,2 », « 0.5 », « % ») : les chiffres viennent de Stockfish, pas du texte ;
// - chaque coup de pièce cité (Fg5, Cxd4, Bg5, Nxd4…) est légal dans la position avant ou après le coup,
//   ou figure dans une fiche qui passe par cette position (plans de la ligne).
//   node scripts/verifie-pourquoi.mjs [rep…]   (sans argument : tous les fichiers présents)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../site/vendor/chess.js';
import { cleCoup } from '../site/js/pourquoi.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'site/data/pourquoi');
const data = JSON.parse(readFileSync(join(root, 'site/data/repertoire.json'), 'utf8'));
const FR = { N: 'C', B: 'F', R: 'T', Q: 'D', K: 'R' };
const enFr = (san) => san.replace(/^[NBRQK]/, (p) => FR[p]);

export function verifier(rep, table) {
  const erreurs = [];
  const coups = new Map(); // clé → { avant, apres, lignes: Set(san) }
  for (const e of data.entries.filter((x) => x.rep === rep)) {
    const c = new Chess();
    e.uci.forEach((u, i) => {
      const k = cleCoup(c.fen(), u);
      const avant = c.fen();
      c.move(e.san[i]);
      const x = coups.get(k) || { avant, apres: c.fen(), lignes: new Set() };
      e.san.forEach((s) => x.lignes.add(s));
      coups.set(k, x);
    });
  }
  const legaux = (fen) => new Chess(fen).moves();
  for (const [k, v] of Object.entries(table)) {
    const x = coups.get(k);
    if (!x) { erreurs.push(`${k} : aucun coup de fiche ne correspond`); continue; }
    if (!Array.isArray(v) || !v[0] || !v[1]) { erreurs.push(`${k} : texte français et anglais requis`); continue; }
    const permis = new Set([...legaux(x.avant), ...legaux(x.apres), ...x.lignes].map((s) => s.replace(/[+#]$/, '')));
    const permisFr = new Set([...permis].map(enFr));
    v.forEach((t, li) => {
      if (t.length > 240) erreurs.push(`${k} [${li ? 'en' : 'fr'}] : trop long (${t.length})`);
      if (/[+−-]\s?\d+([,.]\d+)?\b|\b\d+[,.]\d+\b|%/.test(t.replace(/\b\d+\.(?=[A-Za-z…])/g, ''))) erreurs.push(`${k} [${li ? 'en' : 'fr'}] : évaluation chiffrée interdite : « ${t} »`);
      const re = li === 0 ? /\b([CFTDR][a-h]?[1-8]?x?[a-h][1-8])\b/g : /\b([NBRQK][a-h]?[1-8]?x?[a-h][1-8])\b/g;
      for (const m of t.matchAll(re)) {
        if (!(li === 0 ? permisFr : permis).has(m[1])) erreurs.push(`${k} [${li ? 'en' : 'fr'}] : coup cité inconnu ici : ${m[1]}`);
      }
    });
  }
  return { erreurs, couverts: Object.keys(table).filter((k) => coups.has(k)).length, total: coups.size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const reps = process.argv.slice(2).length ? process.argv.slice(2) : (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : []);
  let ko = 0;
  for (const rep of reps) {
    const r = verifier(rep, JSON.parse(readFileSync(join(dir, `${rep}.json`), 'utf8')));
    console.log(`${rep} : ${r.couverts} / ${r.total} coups expliqués, ${r.erreurs.length} problème(s)`);
    for (const e of r.erreurs) console.log('  ✘ ' + e);
    ko += r.erreurs.length;
  }
  process.exit(ko ? 1 : 0);
}
