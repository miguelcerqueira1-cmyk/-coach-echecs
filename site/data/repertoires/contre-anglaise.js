// Fiches du répertoire « Contre l'Anglaise (1.c4 e5) » (format et conventions : en-tête de site/data/repertoire.js).
// Toute ligne tactique (punition, piège) doit être vérifiée par Stockfish : npm run verify:repertoire.
//
// 1.c4 e5 : une Sicilienne avec les couleurs inversées, où les Noirs ont un temps de moins mais
// des plans simples (…Cf6, …d5 ou …Cc6, …g6, …f5).

export default [
  {
    id: 'ca-dragon-inverse', rep: 'contre-anglaise', famille: 'Dragon inversé', nom: '2.Cc3 Cf6 3.g3 d5', badge: 'theorie',
    ligne: '1. c4 e5 2. Nc3 Nf6 3. g3 d5 4. cxd5 Nxd5 5. Bg2 Nb6 6. Nf3 Nc6 7. O-O Be7 8. d3 O-O',
    plan: 'Prendre le centre avec …d5, reculer le Cavalier en b6 quand il est attaqué, puis développement classique (…Cc6, …Fe7, roque, …Fe6). Les Noirs ont un centre e5 solide.',
    structure: 'Sicilienne Dragon inversée : pion e5 noir, Fou g2 blanc sur la grande diagonale.',
    punition: {
      ligne: '1. c4 e5 2. Nc3 Nf6 3. g3 d5 4. cxd5 Nxd5 5. Bg2 Nb6 6. Bxb7? Bxb7',
      texte: 'Le pion b7 a l’air sans défense, mais le Fou c8 le protège : Fxb7 ?? perd simplement le Fou.',
    },
    piege: null,
    cases: 'e5, d4, la diagonale h1-a8',
    echanger: 'Fou e6 contre un Cavalier en d5',
    conserver: 'Pion e5',
    video: { recherche: 'English opening reversed Dragon 1.c4 e5 2.Nc3 Nf6 3.g3 d5', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=5-RMWPyyuUM', titre: 'The English Opening: 1... e5 (Bc5 and Bb4)', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=u6LKx4cpayM', titre: 'Playing e5 against the English/c4 strategy', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'ca-fermee', rep: 'contre-anglaise', famille: 'Anglaise fermée', nom: '2.Cc3 Cc6 3.g3 g6', badge: 'theorie',
    ligne: '1. c4 e5 2. Nc3 Nc6 3. g3 g6 4. Bg2 Bg7 5. d3 d6 6. Rb1 f5 7. b4 Nf6 8. b5 Ne7',
    plan: 'Position fermée : les Blancs attaquent à l’aile dame (Tb1, b4-b5), les Noirs à l’aile roi (…f5, …Cf6, roque, puis …f4 ou …g5).',
    structure: 'Pions noirs d6/e5/f5 : espace à l’aile roi ; la case d4 est souvent occupée par un Cavalier.',
    punition: null,
    piege: null,
    cases: 'd4, f4, e4',
    echanger: 'Fou g7 seulement contre une pièce importante',
    conserver: 'Pion e5',
    video: { recherche: 'Closed English 1.c4 e5 2.Nc3 Nc6 3.g3 g6 f5', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=5-RMWPyyuUM', titre: 'The English Opening: 1... e5 (Bc5 and Bb4)', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=u6LKx4cpayM', titre: 'Playing e5 against the English/c4 strategy', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'ca-4cav', rep: 'contre-anglaise', famille: 'Quatre Cavaliers', nom: '2.Cc3 Cf6 3.Cf3 Cc6 4.g3 Fb4', badge: 'theorie',
    ligne: '1. c4 e5 2. Nc3 Nf6 3. Nf3 Nc6 4. g3 Bb4 5. Bg2 O-O 6. O-O e4 7. Ng5 Bxc3 8. bxc3 Re8 9. f3 e3',
    plan: 'Le Fou b4 cloue le Cavalier c3, puis …e4 gagne de l’espace. Après Cg5, …Fxc3 et …Te8 défendent e4 ; …e3 bloque le développement blanc.',
    structure: 'Pion noir avancé en e4 (puis e3) : espace et cases d3/f3 gênées pour les Blancs.',
    punition: null,
    piege: null,
    cases: 'e4, d3, e3',
    echanger: 'Fou b4 contre le Cavalier c3',
    conserver: 'Pion e4',
    video: { recherche: 'English four knights 4.g3 Bb4 e4', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=5-RMWPyyuUM', titre: 'The English Opening: 1... e5 (Bc5 and Bb4)', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=u6LKx4cpayM', titre: 'Playing e5 against the English/c4 strategy', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'ca-g3', rep: 'contre-anglaise', famille: 'Dragon inversé', nom: '2.g3 Cf6 3.Fg2 d5', badge: 'theorie',
    ligne: '1. c4 e5 2. g3 Nf6 3. Bg2 d5 4. cxd5 Nxd5 5. Nc3 Nb6 6. Nf3 Nc6',
    plan: 'Même plan contre le fianchetto immédiat : …Cf6 et …d5, reculer en b6, puis …Cc6, …Fe7 et roque.',
    structure: 'Pion e5 noir contre Fou g2 ; les Noirs ont un centre agréable.',
    punition: null,
    piege: null,
    cases: 'e5, d4, b6',
    echanger: 'Rien de forcé',
    conserver: 'Pion e5',
    video: { recherche: 'English 1.c4 e5 2.g3 Nf6 3.Bg2 d5', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=5-RMWPyyuUM', titre: 'The English Opening: 1... e5 (Bc5 and Bb4)', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=u6LKx4cpayM', titre: 'Playing e5 against the English/c4 strategy', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'ca-cf3', rep: 'contre-anglaise', famille: 'Déviations', nom: '2.Cf3 e4 3.Cd4 Cc6', badge: 'theorie',
    ligne: '1. c4 e5 2. Nf3 e4 3. Nd4 Nc6 4. Nxc6 dxc6',
    plan: 'Contre 2.Cf3, avancer …e4 pour chasser le Cavalier ; après l’échange en c6, les Noirs ont des pièces actives et la colonne d ouverte.',
    structure: 'Pion e4 noir avancé, pions doublés en c mais développement facile.',
    punition: null,
    piege: null,
    cases: 'e4, d3, colonne d',
    echanger: 'Cavalier c6 contre le Cavalier d4',
    conserver: 'Pion e4',
    video: { recherche: 'English 1.c4 e5 2.Nf3 e4 3.Nd4', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=5-RMWPyyuUM', titre: 'The English Opening: 1... e5 (Bc5 and Bb4)', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=u6LKx4cpayM', titre: 'Playing e5 against the English/c4 strategy', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
];
