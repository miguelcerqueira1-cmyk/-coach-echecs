// « 💡 Pourquoi ce coup ? » : explications rédigées une fois par coup des fiches (site/data/pourquoi/
// <répertoire>.json, { cle: [fr, en] }), vérifiées par scripts/verifie-pourquoi.mjs. Clé = position
// (4 premiers champs de la FEN) + coup UCI : un coup partagé par plusieurs fiches a une seule explication.
export const cleCoup = (fen, uci) => `${fen.split(' ').slice(0, 4).join(' ')}|${uci}`;

const cache = new Map();
// Charge les explications d'un répertoire (null si aucune n'existe encore).
export async function chargerPourquoi(rep, fetchImpl = (...a) => fetch(...a)) {
  if (!cache.has(rep)) {
    cache.set(rep, fetchImpl(`./data/pourquoi/${rep}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(rep);
}

export function pourquoi(table, fen, uci, langue = 'fr') {
  const t = table?.[cleCoup(fen, uci)];
  if (!t) return null;
  return langue === 'en' ? t[1] || t[0] : t[0];
}
