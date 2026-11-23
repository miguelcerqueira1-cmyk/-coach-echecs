// Fiches dans la langue de l'interface : en anglais, les textes (famille, nom, plan, structure,
// cases, à échanger / conserver, textes du piège et de la punition) viennent du champ `en` de
// repertoire.json (site/data/repertoires/en/<id>.js) ; les coups, vérifications et statistiques
// ne changent pas. Texte manquant → le français reste affiché.
import { langue } from './i18n.js';

const CHAMPS = ['famille', 'nom', 'plan', 'structure', 'cases', 'echanger', 'conserver'];

export function localiserFiche(e, l = langue()) {
  if (l !== 'en' || !e?.en) return e;
  const t = e.en;
  const out = { ...e };
  for (const k of CHAMPS) if (t[k]) out[k] = t[k];
  if (e.punition && t.punition) out.punition = { ...e.punition, texte: t.punition };
  if (e.piege && t.piege) out.piege = { ...e.piege, texte: t.piege };
  return out;
}

export function localiserData(data, l = langue()) {
  if (l !== 'en' || !data?.entries) return data;
  return { ...data, entries: data.entries.map((e) => localiserFiche(e, l)) };
}
