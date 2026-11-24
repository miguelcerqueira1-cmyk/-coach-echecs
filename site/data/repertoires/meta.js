// Les répertoires proposés (description seulement, sans les fiches) : partagés par les scripts,
// les tests et le site (écran de choix, accueil, filtres). Les fiches de chaque répertoire sont
// dans site/data/repertoires/<id>.js ; un répertoire sans fiche est affiché « bientôt ».
//
// - couleur : camp joué ('w' Blancs, 'b' Noirs) ;
// - groupe : 'blancs' | 'contre-e4' | 'contre-d4' | 'autres' (étapes de l'écran de choix) ;
// - racine : coups SAN qui définissent l'entrée dans le répertoire (point de départ de l'arbre) ;
// - gratuites : fiches ouvertes dans la formule gratuite (au plus une par répertoire, sauf
//   historique : la Caro-Kann en garde deux) ;
// - elite : données Élite collectées (scripts/elite.mjs) pour ce répertoire.

import { langue } from '../../js/i18n.js';

export const GROUPES = {
  blancs: { id: 'blancs', titre: 'Avec les Blancs', question: 'Avec les Blancs, je joue…' },
  'contre-e4': { id: 'contre-e4', titre: 'Contre 1.e4', question: 'Avec les Noirs, contre 1.e4, je joue…' },
  'contre-d4': { id: 'contre-d4', titre: 'Contre 1.d4', question: 'Avec les Noirs, contre 1.d4, je joue…' },
  autres: { id: 'autres', titre: 'Contre 1.c4 / 1.Cf3', question: 'Avec les Noirs, contre 1.c4 ou 1.Cf3, je joue…' },
};

export const REPERTOIRES = {
  gd: { id: 'gd', titre: 'Gambit Dame', couleur: 'w', groupe: 'blancs', racine: ['d4', 'd5', 'c4'], sousTitre: 'Joué avec les Blancs : 1.d4 d5 2.c4 et déviations adverses', gratuites: ['gd-orthodoxe'], elite: true },
  italienne: { id: 'italienne', titre: 'Partie italienne', couleur: 'w', groupe: 'blancs', racine: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], sousTitre: 'Jouée avec les Blancs : 1.e4 e5 2.Cf3 Cc6 3.Fc4', gratuites: ['ita-giuoco-piano'], elite: true },
  espagnole: { id: 'espagnole', titre: 'Partie espagnole', couleur: 'w', groupe: 'blancs', racine: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], sousTitre: 'Jouée avec les Blancs : 1.e4 e5 2.Cf3 Cc6 3.Fb5', gratuites: ['esp-fermee'], elite: true },
  londres: { id: 'londres', titre: 'Système de Londres', couleur: 'w', groupe: 'blancs', racine: ['d4'], sousTitre: 'Joué avec les Blancs : 1.d4 puis Ff4, e3, c3 contre presque tout', gratuites: ['lon-classique'], elite: true },
  ecossaise: { id: 'ecossaise', titre: 'Partie écossaise', couleur: 'w', groupe: 'blancs', racine: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], sousTitre: 'Jouée avec les Blancs : 1.e4 e5 2.Cf3 Cc6 3.d4', gratuites: ['eco-fc5'], elite: true },
  catalane: { id: 'catalane', titre: 'Ouverture catalane', couleur: 'w', groupe: 'blancs', racine: ['d4', 'Nf6', 'c4', 'e6', 'g3'], sousTitre: 'Jouée avec les Blancs : 1.d4 Cf6 2.c4 e6 3.g3 (Fou en g2)', gratuites: ['cat-fermee'], elite: true },
  viennoise: { id: 'viennoise', titre: 'Partie viennoise', couleur: 'w', groupe: 'blancs', racine: ['e4', 'e5', 'Nc3'], sousTitre: 'Jouée avec les Blancs : 1.e4 e5 2.Cc3', gratuites: ['vie-gambit'], elite: true },
  'smith-morra': { id: 'smith-morra', titre: 'Gambit Smith-Morra', couleur: 'w', groupe: 'blancs', racine: ['e4', 'c5', 'd4', 'cxd4', 'c3'], sousTitre: 'Joué avec les Blancs contre la Sicilienne : 1.e4 c5 2.d4 cxd4 3.c3', gratuites: ['sm-accepte'], elite: true },
  anglaise: { id: 'anglaise', titre: 'Ouverture anglaise', couleur: 'w', groupe: 'blancs', racine: ['c4'], sousTitre: 'Jouée avec les Blancs : 1.c4', gratuites: ['ang-sicilienne-inversee'], elite: true },
  ck: { id: 'ck', titre: 'Défense Caro-Kann', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'c6'], sousTitre: 'Jouée avec les Noirs : 1.e4 c6 et tentatives adverses', gratuites: ['ck-classique', 'ck-avance-short'], elite: true },
  'e5-noirs': { id: 'e5-noirs', titre: '1…e5 (partie ouverte)', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'e5'], sousTitre: 'Jouée avec les Noirs : 1.e4 e5, contre l’Italienne, l’Espagnole, l’Écossaise, la Viennoise…', gratuites: ['e5-italienne'], elite: true },
  sicilienne: { id: 'sicilienne', titre: 'Défense sicilienne', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'c5'], sousTitre: 'Jouée avec les Noirs : 1.e4 c5', gratuites: ['sic-taimanov'], elite: true },
  francaise: { id: 'francaise', titre: 'Défense française', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'e6'], sousTitre: 'Jouée avec les Noirs : 1.e4 e6', gratuites: ['fr-avance'], elite: true },
  scandinave: { id: 'scandinave', titre: 'Défense scandinave', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'd5'], sousTitre: 'Jouée avec les Noirs : 1.e4 d5', gratuites: ['scan-da5'], elite: true },
  pirc: { id: 'pirc', titre: 'Défense Pirc', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'd6'], sousTitre: 'Jouée avec les Noirs : 1.e4 d6 2.d4 Cf6 3.Cc3 g6', gratuites: ['pirc-classique'], elite: true },
  alekhine: { id: 'alekhine', titre: 'Défense Alekhine', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'Nf6'], sousTitre: 'Jouée avec les Noirs : 1.e4 Cf6, provoquer puis attaquer les pions blancs', gratuites: ['ale-moderne'], elite: true },
  philidor: { id: 'philidor', titre: 'Défense Philidor', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'e5', 'Nf3', 'd6'], sousTitre: 'Jouée avec les Noirs : 1.e4 e5 2.Cf3 d6', gratuites: ['phi-hanham'], elite: true },
  najdorf: { id: 'najdorf', titre: 'Sicilienne Najdorf', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'c5', 'Nf3', 'd6'], sousTitre: 'Jouée avec les Noirs : 1.e4 c5 2.Cf3 d6 3.d4 cxd4 4.Cxd4 Cf6 5.Cc3 a6', gratuites: ['naj-anglaise'], elite: true },
  dragon: { id: 'dragon', titre: 'Sicilienne Dragon', couleur: 'b', groupe: 'contre-e4', racine: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'], sousTitre: 'Jouée avec les Noirs : 1.e4 c5 2.Cf3 d6 3.d4 cxd4 4.Cxd4 Cf6 5.Cc3 g6', gratuites: ['dragon-yougoslave'], elite: true },
  'indienne-roi': { id: 'indienne-roi', titre: 'Défense indienne du Roi', couleur: 'b', groupe: 'contre-d4', racine: ['d4', 'Nf6', 'c4', 'g6'], sousTitre: 'Jouée avec les Noirs : 1.d4 Cf6 2.c4 g6, puis …Fg7, …d6, …O-O', gratuites: ['kid-classique'], elite: true },
  'gdr-noirs': { id: 'gdr-noirs', titre: 'Gambit Dame refusé / Slave (Noirs)', couleur: 'b', groupe: 'contre-d4', racine: ['d4', 'd5'], sousTitre: 'Joué avec les Noirs : 1.d4 d5 2.c4 e6 ou 2…c6', gratuites: ['gdrn-orthodoxe'], elite: true },
  'contre-londres': { id: 'contre-londres', titre: 'Contre le Système de Londres', couleur: 'b', groupe: 'contre-d4', racine: ['d4', 'd5', 'Bf4'], sousTitre: 'Joué avec les Noirs : 1.d4 d5 2.Ff4, plans avec …c5 et …Db6', gratuites: ['cl-c5-db6'], elite: true },
  grunfeld: { id: 'grunfeld', titre: 'Défense Grünfeld', couleur: 'b', groupe: 'contre-d4', racine: ['d4', 'Nf6', 'c4', 'g6'], sousTitre: 'Jouée avec les Noirs : 1.d4 Cf6 2.c4 g6 3.Cc3 d5', gratuites: ['grun-echange'], elite: true },
  benoni: { id: 'benoni', titre: 'Benoni / Gambit Benko', couleur: 'b', groupe: 'contre-d4', racine: ['d4', 'Nf6', 'c4', 'c5'], sousTitre: 'Jouée avec les Noirs : 1.d4 Cf6 2.c4 c5 3.d5 e6 ou 3…b5', gratuites: ['ben-moderne'], elite: true },
  bogo: { id: 'bogo', titre: 'Défense bogo-indienne', couleur: 'b', groupe: 'contre-d4', racine: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4+'], sousTitre: 'Jouée avec les Noirs : 1.d4 Cf6 2.c4 e6 3.Cf3 Fb4+', gratuites: ['bogo-de7'], elite: true },
  hollandaise: { id: 'hollandaise', titre: 'Défense hollandaise', couleur: 'b', groupe: 'contre-d4', racine: ['d4', 'f5'], sousTitre: 'Jouée avec les Noirs : 1.d4 f5, systèmes Leningrad et Stonewall', gratuites: ['hol-leningrad'], elite: true },
  'nimzo-qid': { id: 'nimzo-qid', titre: 'Nimzo-indienne / Indienne de la Dame', couleur: 'b', groupe: 'contre-d4', racine: ['d4', 'Nf6', 'c4', 'e6'], sousTitre: 'Jouées avec les Noirs : 1.d4 Cf6 2.c4 e6 3.Cc3 Fb4 ou 3.Cf3 b6', gratuites: ['nimzo-rubinstein'], elite: true },
  'contre-anglaise': { id: 'contre-anglaise', titre: 'Contre l’Anglaise (1.c4 e5)', couleur: 'b', groupe: 'autres', racine: ['c4', 'e5'], sousTitre: 'Jouée avec les Noirs : 1.c4 e5, une Sicilienne inversée', gratuites: ['ca-dragon-inverse'], elite: true },
  'contre-reti': { id: 'contre-reti', titre: 'Contre 1.Cf3 (Réti)', couleur: 'b', groupe: 'autres', racine: ['Nf3', 'd5'], sousTitre: 'Jouée avec les Noirs : 1.Cf3 d5, avec …Cf6, …c6 et le Fou c8 dehors', gratuites: ['cr-kia'], elite: true },
};


// Version anglaise : titres et descriptions (appliqués au chargement si la langue est l'anglais ;
// les scripts Node restent en français).
const EN = {
 "gd": {
  "titre": "Queen’s Gambit",
  "sousTitre": "Played with White: 1.d4 d5 2.c4 and the opponent’s deviations"
 },
 "italienne": {
  "titre": "Italian Game",
  "sousTitre": "Played with White: 1.e4 e5 2.Nf3 Nc6 3.Bc4"
 },
 "espagnole": {
  "titre": "Ruy Lopez",
  "sousTitre": "Played with White: 1.e4 e5 2.Nf3 Nc6 3.Bb5"
 },
 "londres": {
  "titre": "London System",
  "sousTitre": "Played with White: 1.d4 then Bf4, e3, c3 against almost everything"
 },
 "ecossaise": {
  "titre": "Scotch Game",
  "sousTitre": "Played with White: 1.e4 e5 2.Nf3 Nc6 3.d4"
 },
 "catalane": {
  "titre": "Catalan Opening",
  "sousTitre": "Played with White: 1.d4 Nf6 2.c4 e6 3.g3 (bishop on g2)"
 },
 "viennoise": {
  "titre": "Vienna Game",
  "sousTitre": "Played with White: 1.e4 e5 2.Nc3"
 },
 "smith-morra": {
  "titre": "Smith-Morra Gambit",
  "sousTitre": "Played with White against the Sicilian: 1.e4 c5 2.d4 cxd4 3.c3"
 },
 "anglaise": {
  "titre": "English Opening",
  "sousTitre": "Played with White: 1.c4"
 },
 "ck": {
  "titre": "Caro-Kann Defence",
  "sousTitre": "Played with Black: 1.e4 c6 and the opponent’s tries"
 },
 "e5-noirs": {
  "titre": "1…e5 (open game)",
  "sousTitre": "Played with Black: 1.e4 e5, against the Italian, the Ruy Lopez, the Scotch, the Vienna…"
 },
 "sicilienne": {
  "titre": "Sicilian Defence",
  "sousTitre": "Played with Black: 1.e4 c5"
 },
 "francaise": {
  "titre": "French Defence",
  "sousTitre": "Played with Black: 1.e4 e6"
 },
 "scandinave": {
  "titre": "Scandinavian Defence",
  "sousTitre": "Played with Black: 1.e4 d5"
 },
 "pirc": {
  "titre": "Pirc Defence",
  "sousTitre": "Played with Black: 1.e4 d6 2.d4 Nf6 3.Nc3 g6"
 },
 "alekhine": {
  "titre": "Alekhine Defence",
  "sousTitre": "Played with Black: 1.e4 Nf6, provoke then attack White’s pawns"
 },
 "philidor": {
  "titre": "Philidor Defence",
  "sousTitre": "Played with Black: 1.e4 e5 2.Nf3 d6"
 },
 "najdorf": {
  "titre": "Sicilian Najdorf",
  "sousTitre": "Played with Black: 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6"
 },
 "dragon": {
  "titre": "Sicilian Dragon",
  "sousTitre": "Played with Black: 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 g6"
 },
 "indienne-roi": {
  "titre": "King’s Indian Defence",
  "sousTitre": "Played with Black: 1.d4 Nf6 2.c4 g6, then …Bg7, …d6, …O-O"
 },
 "gdr-noirs": {
  "titre": "Queen’s Gambit Declined / Slav (Black)",
  "sousTitre": "Played with Black: 1.d4 d5 2.c4 e6 or 2…c6"
 },
 "contre-londres": {
  "titre": "Against the London System",
  "sousTitre": "Played with Black: 1.d4 d5 2.Bf4, plans with …c5 and …Qb6"
 },
 "grunfeld": {
  "titre": "Grünfeld Defence",
  "sousTitre": "Played with Black: 1.d4 Nf6 2.c4 g6 3.Nc3 d5"
 },
 "benoni": {
  "titre": "Benoni / Benko Gambit",
  "sousTitre": "Played with Black: 1.d4 Nf6 2.c4 c5 3.d5 e6 or 3…b5"
 },
 "bogo": {
  "titre": "Bogo-Indian Defence",
  "sousTitre": "Played with Black: 1.d4 Nf6 2.c4 e6 3.Nf3 Bb4+"
 },
 "hollandaise": {
  "titre": "Dutch Defence",
  "sousTitre": "Played with Black: 1.d4 f5, Leningrad and Stonewall systems"
 },
 "nimzo-qid": {
  "titre": "Nimzo-Indian / Queen’s Indian",
  "sousTitre": "Played with Black: 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 or 3.Nf3 b6"
 },
 "contre-anglaise": {
  "titre": "Against the English (1.c4 e5)",
  "sousTitre": "Played with Black: 1.c4 e5, a reversed Sicilian"
 },
 "contre-reti": {
  "titre": "Against 1.Nf3 (Réti)",
  "sousTitre": "Played with Black: 1.Nf3 d5, with …Nf6, …c6 and the c8 bishop out"
 }
};
const EN_GROUPES = {"blancs": {"titre": "With White", "question": "With White, I play…"}, "contre-e4": {"titre": "Against 1.e4", "question": "With Black, against 1.e4, I play…"}, "contre-d4": {"titre": "Against 1.d4", "question": "With Black, against 1.d4, I play…"}, "autres": {"titre": "Against 1.c4 / 1.Nf3", "question": "With Black, against 1.c4 or 1.Nf3, I play…"}};
if (langue() === 'en') {
  for (const [id, t] of Object.entries(EN)) Object.assign(REPERTOIRES[id], t);
  for (const [id, t] of Object.entries(EN_GROUPES)) Object.assign(GROUPES[id], t);
}

// Choix par défaut d'un utilisateur existant (avant le passage grand public) : rien ne change.
export const CHOIX_HISTORIQUE = ['gd', 'ck'];

export const couleurDe = (rep) => REPERTOIRES[rep]?.couleur || null;

// Fiches gratuites de tous les répertoires (pro.js).
export const FICHES_GRATUITES = Object.values(REPERTOIRES).flatMap((r) => r.gratuites);
