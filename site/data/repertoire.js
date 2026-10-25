// Répertoires d'ouvertures (agrégation) : description dans repertoires/meta.js, fiches dans
// repertoires/<id>.js (un fichier par répertoire). Ce fichier rassemble tout pour les scripts.
//
// Conventions :
// - Les coups sont en SAN anglaise (convertis en notation française à l'affichage).
// - Dans `punition.ligne` et `piege.ligne`, le coup fautif porte un « ? ».
//   punition : l'ADVERSAIRE commet l'erreur, la suite montre comment la punir.
//   piege    : NOUS commettons l'erreur (coup réflexe perdant), la suite montre la sanction.
// - Code ECO et nom d'ouverture : attribués automatiquement depuis la base CC0
//   lichess-org/chess-openings (scripts/repertoire.mjs), pas recopiés à la main.
// - Toute ligne tactique est contrôlée par Stockfish (scripts/verify-repertoire.mjs) ;
//   le résultat (évaluation, profondeur) est stocké dans data/verification.json.
// - Plans, structures et cases clés sont des explications rédigées (interprétation),
//   pas des résultats de calcul.
// - `video.recherche` sert à construire une recherche YouTube. Un lien horodaté précis
//   n'est indiqué que s'il a été vérifié (sinon `url: null`) ; l'utilisateur peut ajouter
//   le sien dans l'application.
// - `video.liens` : 1 à 3 vidéos choisies à la main, chacune trouvée telle quelle dans un
//   résultat réel (vidéothèque Lichess ou recherche web) : identifiant YouTube jamais
//   reconstruit, titre et chaîne recopiés, langue. `&t=` seulement depuis un chapitre publié
//   par l'auteur (recopié dans `chapitre`). Contrôle en ligne : scripts/verify-videos.mjs (CI).

import f_gd from './repertoires/gd.js';
import f_italienne from './repertoires/italienne.js';
import f_espagnole from './repertoires/espagnole.js';
import f_londres from './repertoires/londres.js';
import f_anglaise from './repertoires/anglaise.js';
import f_ck from './repertoires/ck.js';
import f_sicilienne from './repertoires/sicilienne.js';
import f_francaise from './repertoires/francaise.js';
import f_scandinave from './repertoires/scandinave.js';
import f_indienne_roi from './repertoires/indienne-roi.js';
import f_gdr_noirs from './repertoires/gdr-noirs.js';
import f_nimzo_qid from './repertoires/nimzo-qid.js';
import { REPERTOIRES, GROUPES } from './repertoires/meta.js';

export { REPERTOIRES, GROUPES };

export const BADGES = {
  theorie: { label: 'Théorie', desc: 'Ligne principale ou secondaire reconnue' },
  piege: { label: 'Piège Blitz', desc: 'Piège fréquent en partie rapide' },
  loufoque: { label: 'Coup loufoque à réfuter', desc: 'Coup adverse atypique, fréquent sous 1200' },
};

// Toutes les fiches, répertoire par répertoire (ordre de REPERTOIRES).
const PAR_REPERTOIRE = {
  'gd': f_gd,
  'italienne': f_italienne,
  'espagnole': f_espagnole,
  'londres': f_londres,
  'anglaise': f_anglaise,
  'ck': f_ck,
  'sicilienne': f_sicilienne,
  'francaise': f_francaise,
  'scandinave': f_scandinave,
  'indienne-roi': f_indienne_roi,
  'gdr-noirs': f_gdr_noirs,
  'nimzo-qid': f_nimzo_qid,
};

export const LIGNES = Object.keys(REPERTOIRES).flatMap((id) => PAR_REPERTOIRE[id] || []);
