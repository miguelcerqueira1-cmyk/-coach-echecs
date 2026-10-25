// Ouvertures choisies par l'utilisateur (« Mon répertoire ») : un ou plusieurs répertoires par
// groupe (Blancs, contre 1.e4, contre 1.d4). Toutes les pages ne montrent que ces répertoires.
// Enregistré dans `coach-echecs:mon-repertoire` (exporté par « Mes données »).
// - premier visiteur : aucun choix → page d'accueil, puis écran de choix ;
// - utilisateur d'avant le passage grand public (données déjà présentes) : Gambit Dame +
//   Caro-Kann, enregistré automatiquement pour que rien ne change.
import { REPERTOIRES, GROUPES, CHOIX_HISTORIQUE } from '../data/repertoires/meta.js';

export const KEY = 'coach-echecs:mon-repertoire';

function lire(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY) || 'null');
    return Array.isArray(v?.ids) ? v : null;
  } catch { return null; }
}

// Données d'un utilisateur existant (autres que l'apparence) : il garde Gambit Dame + Caro-Kann.
export function utilisateurExistant(storage = localStorage) {
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith('coach-echecs:') && k !== KEY) return true;
  }
  return false;
}

// À appeler au démarrage, avant toute écriture : décide s'il faut montrer l'accueil.
export function initChoix(storage = localStorage) {
  if (lire(storage)) return { premiereVisite: false };
  if (utilisateurExistant(storage)) {
    enregistrer(CHOIX_HISTORIQUE, storage, { auto: true });
    return { premiereVisite: false };
  }
  return { premiereVisite: true };
}

export function aChoisi(storage = localStorage) { return !!lire(storage); }

// Répertoires choisis, dans l'ordre de REPERTOIRES (défaut : Gambit Dame + Caro-Kann).
export function choisis(storage = localStorage) {
  const ids = (lire(storage)?.ids || CHOIX_HISTORIQUE).filter((id) => REPERTOIRES[id]);
  return Object.keys(REPERTOIRES).filter((id) => ids.includes(id));
}

export function enregistrer(ids, storage = localStorage, { auto = false } = {}) {
  const ok = Object.keys(REPERTOIRES).filter((id) => ids.includes(id));
  if (!ok.length) throw new Error('Choisissez au moins une ouverture.');
  try { storage.setItem(KEY, JSON.stringify({ ids: ok, auto, at: new Date().toISOString() })); } catch { /* stockage plein */ }
  return ok;
}

// Données du répertoire restreintes aux ouvertures choisies (toutes les fiches restent dans `tous`).
export function filtrerData(data, ids = choisis()) {
  const set = new Set(ids);
  const keep = ids.filter((id) => data.repertoires?.[id]);
  return {
    ...data, tous: data.entries, tousRepertoires: data.repertoires, choisis: keep,
    entries: data.entries.filter((e) => set.has(e.rep)),
    repertoires: Object.fromEntries(keep.map((id) => [id, data.repertoires[id]])),
  };
}

// Libellé court d'un choix (réglages) : « Gambit Dame · Caro-Kann ».
export function resume(ids = choisis()) {
  return ids.map((id) => REPERTOIRES[id]?.titre).filter(Boolean).join(' · ');
}

// Répertoires d'un groupe, dans l'ordre (écran de choix).
export const parGroupe = (groupe) => Object.values(REPERTOIRES).filter((r) => r.groupe === groupe);

export { REPERTOIRES, GROUPES };
