// Les répertoires proposés (description seulement, sans les fiches) : partagés par les scripts,
// les tests et le site (écran de choix, accueil, filtres). Les fiches de chaque répertoire sont
// dans site/data/repertoires/<id>.js ; un répertoire sans fiche est affiché « bientôt ».
//
// - couleur : camp joué ('w' Blancs, 'b' Noirs) ;
// - groupe : 'blancs' | 'contre-e4' | 'contre-d4' (étapes de l'écran de choix) ;
// - racine : coups SAN qui définissent l'entrée dans le répertoire (point de départ de l'arbre) ;
// - gratuites : fiches ouvertes dans la formule gratuite (au plus une par répertoire, sauf
//   historique : la Caro-Kann en garde deux) ;
// - elite : données Élite collectées (scripts/elite.mjs) pour ce répertoire.

export const GROUPES = {
  blancs: { id: 'blancs', titre: 'Avec les Blancs', question: 'Avec les Blancs, je joue…' },
  'contre-e4': { id: 'contre-e4', titre: 'Contre 1.e4', question: 'Avec les Noirs, contre 1.e4, je joue…' },
  'contre-d4': { id: 'contre-d4', titre: 'Contre 1.d4', question: 'Avec les Noirs, contre 1.d4, je joue…' },
};

export const REPERTOIRES = {
  gd: { id: 'gd', titre: 'Gambit Dame', couleur: 'w', groupe: 'blancs', racine: ['d4', 'd5', 'c4'], sousTitre: 'Joué avec les Blancs : 1.d4 d5 2.c4 et déviations adverses', gratuites: ['gd-orthodoxe'], elite: true },
  italienne: { id: 'italienne', titre: 'Partie italienne', couleur: 'w', groupe: 'blancs', racine: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], sousTitre: 'Jouée avec les Blancs : 1.e4 e5 2.Cf3 Cc6 3.Fc4', gratuites: [], elite: false },
  espagnole: { id: 'espagnole', titre: 'Partie espagnole', couleur: 'w', groupe: 'blancs', racine: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], sousTitre: 'Jouée avec les Blancs : 1.e4 e5 2.Cf3 Cc6 3.Fb5', gratuites: [], elite: false },
  londres: { id: 'londres', titre: 'Système de Londres', couleur: 'w', groupe: 'blancs', racine: ['d4'], sousTitre: 'Joué avec les Blancs : 1.d4 puis Ff4, e3, c3 contre presque tout', gratuites: [], elite: false },
  anglaise: { id: 'anglaise', titre: 'Ouverture anglaise', couleur: 'w', groupe: 'blancs', racine: ['c4'], sousTitre: 'Jouée avec les Blancs : 1.c4', gratuites: [], elite: false },
  ck: { id: 'ck', titre: 'Défense Caro-Kann', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'c6'], sousTitre: 'Jouée avec les Noirs : 1.e4 c6 et tentatives adverses', gratuites: ['ck-classique', 'ck-avance-short'], elite: true },
  sicilienne: { id: 'sicilienne', titre: 'Défense sicilienne', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'c5'], sousTitre: 'Jouée avec les Noirs : 1.e4 c5', gratuites: [], elite: false },
  francaise: { id: 'francaise', titre: 'Défense française', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'e6'], sousTitre: 'Jouée avec les Noirs : 1.e4 e6', gratuites: [], elite: false },
  scandinave: { id: 'scandinave', titre: 'Défense scandinave', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'd5'], sousTitre: 'Jouée avec les Noirs : 1.e4 d5', gratuites: [], elite: false },
  'indienne-roi': { id: 'indienne-roi', titre: 'Défense indienne du Roi', couleur: 'b', groupe: 'contre-d4', racine: ['d4', 'Nf6', 'c4', 'g6'], sousTitre: 'Jouée avec les Noirs : 1.d4 Cf6 2.c4 g6, puis …Fg7, …d6, …O-O', gratuites: [], elite: false },
  'gdr-noirs': { id: 'gdr-noirs', titre: 'Gambit Dame refusé / Slave (Noirs)', couleur: 'b', groupe: 'contre-d4', racine: ['d4', 'd5'], sousTitre: 'Joué avec les Noirs : 1.d4 d5 2.c4 e6 ou 2…c6', gratuites: [], elite: false },
  'nimzo-qid': { id: 'nimzo-qid', titre: 'Nimzo-indienne / Indienne de la Dame', couleur: 'b', groupe: 'contre-d4', racine: ['d4', 'Nf6', 'c4', 'e6'], sousTitre: 'Jouées avec les Noirs : 1.d4 Cf6 2.c4 e6 3.Cc3 Fb4 ou 3.Cf3 b6', gratuites: [], elite: false },
};

// Choix par défaut d'un utilisateur existant (avant le passage grand public) : rien ne change.
export const CHOIX_HISTORIQUE = ['gd', 'ck'];

export const couleurDe = (rep) => REPERTOIRES[rep]?.couleur || null;

// Fiches gratuites de tous les répertoires (pro.js).
export const FICHES_GRATUITES = Object.values(REPERTOIRES).flatMap((r) => r.gratuites);
