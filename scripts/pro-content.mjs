// Séparation du répertoire entre site public et contenu Pro (servi par le Worker contre une
// licence valide, voir worker/src/index.js).
//
//   node scripts/pro-content.mjs   → écrit worker/src/pro-content.json (GÉNÉRÉ, non versionné)
//
// Site public : fiches gratuites (FREE_FICHES) complètes + fiches Pro réduites à un aperçu
// (nom, code ECO, famille, 4 premiers coups). Rien du plan, des pièges, des réfutations ni des vidéos.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FREE_FICHES } from '../site/js/pro.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PRO_CONTENT_PATH = join(root, 'worker/src/pro-content.json');
const PREVIEW_PLIES = 4;

export function preview(e) {
  return { id: e.id, rep: e.rep, famille: e.famille, nom: e.nom, badge: e.badge, eco: e.eco, ecoNom: e.ecoNom, san: (e.san || []).slice(0, PREVIEW_PLIES), pro: true };
}

// data : site/data/repertoire.json complet → { publicData, proData }.
export function splitRepertoire(data, freeIds = FREE_FICHES) {
  const free = new Set(freeIds);
  const publicData = { ...data, entries: data.entries.map((e) => (free.has(e.id) ? e : preview(e))), split: true };
  const proData = { version: data.moteur?.date || null, entries: data.entries.filter((e) => !free.has(e.id)) };
  return { publicData, proData };
}

export function writeProContent(data, path = PRO_CONTENT_PATH) {
  const { proData } = splitRepertoire(data);
  writeFileSync(path, JSON.stringify(proData));
  return proData.entries.length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = JSON.parse(readFileSync(join(root, 'site/data/repertoire.json'), 'utf8'));
  console.log(`contenu Pro : ${writeProContent(data)} fiches → worker/src/pro-content.json`);
}
