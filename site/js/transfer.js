// Transfert des données de l'appareil (progression, réglages, partie, analyses…) vers un
// autre appareil, par un fichier. Les secrets (jeton Lichess, code d'accès, clé YouTube) ne
// sont JAMAIS exportés : ils se ressaisissent dans ⚙ Réglages sur le nouvel appareil.

const PREFIX = 'coach-echecs:';
export const SECRETS = ['coach-echecs:jeton-lichess', 'coach-echecs:code-acces', 'coach-echecs:cle-youtube'];
const SKIP = [...SECRETS, 'coach-echecs:youtube-v1', 'coach-echecs:partie-illisible']; // caches et brouillons
export const FORMAT = 'coach-echecs-donnees';

function keysOf(storage) {
  const out = [];
  for (let i = 0; i < storage.length; i++) out.push(storage.key(i));
  return out;
}

export function exportData(storage = localStorage, now = new Date()) {
  const data = {};
  for (const k of keysOf(storage)) {
    if (!k?.startsWith(PREFIX) || SKIP.includes(k) || k.startsWith('coach-echecs:lichess-cache')) continue;
    data[k] = storage.getItem(k);
  }
  return { format: FORMAT, version: 1, exportedAt: now.toISOString(), data };
}

// Résumé lisible d'un export (pour la confirmation avant import).
export function describe(dump) {
  const k = Object.keys(dump.data || {});
  const has = (s) => k.includes(PREFIX + s);
  const parts = [];
  if (has('progression-v1')) parts.push('progression de l’entraînement');
  if (has('revision-v1')) parts.push('révisions');
  if (has('reglages:v1')) parts.push('réglages et apparence');
  if (has('partie:v1')) parts.push('partie en cours');
  if (has('analyses-v1')) parts.push('analyses de vos parties');
  if (has('mes-parties')) parts.push('pseudos de Mes parties');
  return parts.length ? parts.join(', ') : 'aucune donnée reconnue';
}

// Vérifie puis écrit l'export ; les clés inconnues ou les secrets sont ignorés.
export function importData(dump, storage = localStorage) {
  if (!dump || dump.format !== FORMAT || typeof dump.data !== 'object') throw new Error('Fichier non reconnu : ce n’est pas un export de Coach Échecs.');
  let n = 0;
  for (const [k, v] of Object.entries(dump.data)) {
    if (!k.startsWith(PREFIX) || SKIP.includes(k) || typeof v !== 'string') continue;
    storage.setItem(k, v);
    n++;
  }
  return n;
}
