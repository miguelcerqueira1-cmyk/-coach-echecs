// Contrôle des traductions anglaises des fiches (site/data/repertoires/en/<id>.js).
//   node scripts/verifie-en.mjs [id …]   → liste ce qui manque ou semble resté en français
// Règles : chaque fiche a une entrée ; chaque champ texte présent en français l'est en anglais ;
// pas de notation française (Cf3, Fg4, Txe1, Dd4 → Nf3, Bg4, Rxe1, Qd4) ; pas de lettres accentuées
// françaises (sauf noms propres : Grünfeld, Réti, Sämisch… listés plus bas).
import { LIGNES, REPERTOIRES } from '../site/data/repertoire.js';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CHAMPS = ['famille', 'nom', 'plan', 'structure', 'cases', 'echanger', 'conserver'];
const PROPRES = /Grünfeld|Réti|Sämisch|Rubinstein|Tchigorine|Chigorin|Méran|Lékó|Nimzowitsch|Bogoljubov|Alekhine|Capablanca|Karlsbad|Rossolimo/g;
const FR_NOTATION = /(?:^|[\s(,;:.!?…«»"“”'’])(?:\d+\.(?:\.\.|…)?\s?)?[CFTD](?:[a-h]|[1-8])?x?[a-h][1-8](?:=[CFTD])?[+#]?(?=$|[\s),;:.!?…»"“”'’])/;
const FR_MOTS = /\b(le|la|les|des|une|du|pour|avec|dans|sur|est|et|puis|contre|aux|qui|pas)\b/;

export async function chargerEn(id) {
  const f = join(root, `site/data/repertoires/en/${id}.js`);
  if (!existsSync(f)) return null;
  return (await import(pathToFileURL(f).href + `?t=${Date.now()}`)).default;
}

export async function controler(ids = Object.keys(REPERTOIRES)) {
  const pb = [];
  for (const id of ids) {
    const en = await chargerEn(id);
    const fiches = LIGNES.filter((e) => e.rep === id);
    if (!en) { pb.push(`${id} : fichier en/${id}.js absent (${fiches.length} fiches)`); continue; }
    for (const e of fiches) {
      const t = en[e.id];
      if (!t) { pb.push(`${e.id} : traduction absente`); continue; }
      const champs = [...CHAMPS.filter((k) => e[k]), ...(e.punition ? ['punition'] : []), ...(e.piege ? ['piege'] : [])];
      for (const k of champs) {
        const v = t[k];
        if (typeof v !== 'string' || !v.trim()) { pb.push(`${e.id}.${k} : manquant`); continue; }
        const s = v.replace(PROPRES, '');
        if (FR_NOTATION.test(s)) pb.push(`${e.id}.${k} : notation française ? « ${v.match(FR_NOTATION)[0].trim()} »`);
        if (/[éèêàùçœ]/i.test(s) || FR_MOTS.test(s)) pb.push(`${e.id}.${k} : reste du français ? « ${v.slice(0, 80)} »`);
      }
      for (const k of Object.keys(t)) if (![...CHAMPS, 'punition', 'piege'].includes(k)) pb.push(`${e.id} : champ inconnu « ${k} »`);
    }
    for (const k of Object.keys(en)) if (!fiches.some((e) => e.id === k)) pb.push(`${id} : fiche inconnue « ${k} »`);
  }
  return pb;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ids = process.argv.slice(2);
  const pb = await controler(ids.length ? ids : undefined);
  if (pb.length) { console.log(pb.join('\n')); console.log(`\n${pb.length} problème(s).`); process.exit(1); }
  console.log('Traductions anglaises des fiches : complètes.');
}
