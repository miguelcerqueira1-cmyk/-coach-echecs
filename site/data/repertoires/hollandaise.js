// Fiches du répertoire « Défense hollandaise » (format et conventions : en-tête de site/data/repertoire.js).
// Toute ligne tactique (punition, piège) doit être vérifiée par Stockfish : npm run verify:repertoire.
//
// 1.d4 f5 : jeu déséquilibré, contrôle de e4 ; systèmes Leningrad (…g6) et Stonewall (…e6/…d5).

export default [
  {
    id: 'hol-leningrad', rep: 'hollandaise', famille: 'Leningrad', nom: 'Leningrad 2.g3 Cf6 3.Fg2 g6', badge: 'theorie',
    ligne: '1. d4 f5 2. g3 Nf6 3. Bg2 g6 4. Nf3 Bg7 5. O-O O-O 6. c4 d6 7. Nc3 Qe8',
    plan: 'Fianchetto du Fou en g7, roque, …d6 puis …De8 et …e5 : la rupture centrale libère le jeu et ouvre la diagonale du Fou g7.',
    structure: 'Pions f5/d6, Fou g7 puissant ; les Noirs visent e5 et l’aile roi.',
    punition: null,
    piege: null,
    cases: 'e5 (rupture), e4, h5',
    echanger: 'Cavalier f6 contre un Cavalier blanc qui arrive en d5',
    conserver: 'Fou g7',
    video: { recherche: 'Leningrad Dutch plans Qe8 e5', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=cB2qK299FNQ', titre: 'Défense hollandaise (1) : Partie d\'échecs pédagogique', chaine: null, langue: 'fr', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=ukmYs93gey8', titre: 'How to Play the Leningrad Dutch Defence', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'hol-stonewall', rep: 'hollandaise', famille: 'Stonewall', nom: 'Stonewall …e6, …d5, …c6', badge: 'theorie',
    ligne: '1. d4 f5 2. c4 Nf6 3. g3 e6 4. Bg2 d5 5. Nf3 c6 6. O-O Bd6 7. b3 Qe7',
    plan: 'Mur de pions c6/d5/e6/f5 : le Cavalier s’installe en e4, le Fou d6 vise h2, puis attaque à l’aile roi (…g5, …Th6). Faiblesse à surveiller : la case e5 et le Fou c8.',
    structure: 'Stonewall : case e4 forte pour les Noirs, case e5 faible ; Fou c8 souvent ressorti par …b6/…Fb7 ou …Fd7-e8-h5.',
    punition: null,
    piege: null,
    cases: 'e4 (avant-poste), e5 (trou), h2',
    echanger: 'Fou d6 contre le Fou de cases noires blanc',
    conserver: 'Cavalier e4',
    video: { recherche: 'Stonewall Dutch plans for black', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=cB2qK299FNQ', titre: 'Défense hollandaise (1) : Partie d\'échecs pédagogique', chaine: null, langue: 'fr', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=7DVRqdwnleQ', titre: 'How to Play the Stonewall Dutch Defence', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'hol-staunton', rep: 'hollandaise', famille: 'Gambit Staunton', nom: 'Gambit Staunton 2.e4 fxe4', badge: 'theorie',
    ligne: '1. d4 f5 2. e4 fxe4 3. Nc3 Nf6 4. Bg5 Nc6 5. d5 Ne5 6. Qd4 Nf7',
    plan: 'Prendre le pion e4 et le garder avec les pièces (…Cf6, …Cc6) ; contre d5, le Cavalier passe par e5 et f7 pour protéger le roi et e5.',
    structure: 'Pion e4 noir de plus ; les Blancs ont du développement et visent l’aile roi.',
    punition: null,
    piege: null,
    cases: 'e4 (pion de plus), f7, h7',
    echanger: 'Le Fou g5 contre le Cavalier f6 si utile',
    conserver: 'Pion e4',
    video: { recherche: 'Staunton Gambit Dutch 2.e4 fxe4 black', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=cB2qK299FNQ', titre: 'Défense hollandaise (1) : Partie d\'échecs pédagogique', chaine: null, langue: 'fr', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'hol-fg5', rep: 'hollandaise', famille: 'Déviations', nom: '2.Fg5 h6 3.Fh4 g5', badge: 'piege',
    ligne: '1. d4 f5 2. Bg5 h6 3. Bh4 g5 4. Bg3 Nf6 5. e3 d6',
    plan: 'Chasser le Fou (…h6, …g5) puis développer normalement avec …Cf6 et …d6. Le roi noir reste exposé : ne pas jouer …f4 et …h5 sans calculer.',
    structure: 'Aile roi noire avancée (pions g5, h6, f5) : de l’espace, mais des cases faibles autour du roi.',
    punition: null,
    piege: {
      ligne: '1. d4 f5 2. Bg5 h6 3. Bh4 g5 4. Bg3 f4 5. e3 h5 6. Bd3 Rh6? 7. Qxh5+ Rxh5 8. Bg6#',
      texte: 'Vouloir enfermer le Fou g3 avec …f4 et …h5 est tentant, mais …Th6 ouvre la diagonale e8-h5 : sacrifice de Dame en h5 et Fg6 mat !',
    },
    cases: 'e8-h5 (diagonale du roi), g6, h5',
    echanger: 'Cavalier f6 contre le Fou g3 si les Blancs l’enferment',
    conserver: 'La sécurité du roi',
    video: { recherche: 'Dutch Defense 2.Bg5 h6 3.Bh4 g5 trap Bg6 mate', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=cB2qK299FNQ', titre: 'Défense hollandaise (1) : Partie d\'échecs pédagogique', chaine: null, langue: 'fr', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'hol-cc3', rep: 'hollandaise', famille: 'Déviations', nom: '2.Cc3 d5 3.Ff4', badge: 'theorie',
    ligne: '1. d4 f5 2. Nc3 d5 3. Bf4 Nf6 4. e3 e6 5. Nf3 Bd6',
    plan: 'Contre 2.Cc3 qui prépare e4, bloquer avec …d5 et entrer dans un Stonewall : …Cf6, …e6, …Fd6 pour échanger le Fou f4.',
    structure: 'Structure Stonewall (d5/e6/f5) : e4 tenu par les Noirs.',
    punition: null,
    piege: null,
    cases: 'e4, e5, d6',
    echanger: 'Fou d6 contre le Fou f4',
    conserver: 'Pion d5',
    video: { recherche: 'Dutch Defense 2.Nc3 d5 Stonewall', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=cB2qK299FNQ', titre: 'Défense hollandaise (1) : Partie d\'échecs pédagogique', chaine: null, langue: 'fr', verifie: false, source: 'recherche web' },
      ] },
  },
];
