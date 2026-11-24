// Fiches du répertoire « Sicilienne Dragon » (format et conventions : en-tête de site/data/repertoire.js).
// Toute ligne tactique (punition, piège) doit être vérifiée par Stockfish : npm run verify:repertoire.
//
// 1.e4 c5 2.Cf3 d6 3.d4 cxd4 4.Cxd4 Cf6 5.Cc3 g6 : Fou en fianchetto g7, roque, attaque par la
// colonne c et la grande diagonale.

export default [
  {
    id: 'dragon-yougoslave', rep: 'dragon', famille: 'Attaque yougoslave', nom: '9.Fc4 Fd7 10.O-O-O Tc8', badge: 'theorie',
    ligne: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6 9. Bc4 Bd7 10. O-O-O Rc8 11. Bb3 Ne5 12. h4 h5',
    plan: 'Roques opposés : les Blancs attaquent par h4-h5, les Noirs par la colonne c (…Tc8, …Ce5-c4, souvent le sacrifice de qualité …Txc3). …h5 freine l’attaque blanche.',
    structure: 'Fou g7 sur la grande diagonale, colonne c semi-ouverte : la case c4 est le point de rencontre des pièces noires.',
    punition: null,
    piege: null,
    cases: 'c4, c3 (sacrifice de qualité), h5',
    echanger: 'Cavalier e5-c4 contre le Fou e3 ou le Fou b3',
    conserver: 'Fou g7',
    video: { recherche: 'Dragon Yugoslav Attack 9.Bc4 Bd7 Soltis h5', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=u1Jji8Z4YS0', titre: 'HOW TO PLAY Sicilian Defense DRAGON Variation by Grandmaster Anish Giri', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=TCPfXd3L3FM', titre: 'Sicilian Dragon Variation Plans and Pawn Structure, Yugoslav Attack (Chess Openings)', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'dragon-9ooo', rep: 'dragon', famille: 'Attaque yougoslave', nom: '9.O-O-O d5', badge: 'theorie',
    ligne: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6 9. O-O-O d5 10. exd5 Nxd5 11. Nxc6 bxc6 12. Bd4 e5',
    plan: 'Contre le grand roque immédiat, …d5 ! ouvre le centre avant que l’attaque blanche démarre. Après les échanges, …e5 chasse le Fou d4 et les pièces noires visent le roi blanc par la colonne b.',
    structure: 'Pion c6 isolé mais colonne b ouverte vers le roi blanc ; centre ouvert.',
    punition: null,
    piege: null,
    cases: 'd5, colonne b, e5',
    echanger: 'Cavalier d5 contre le Cavalier c3 si utile',
    conserver: 'Fou g7',
    video: { recherche: 'Dragon Yugoslav 9.O-O-O d5', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=u1Jji8Z4YS0', titre: 'HOW TO PLAY Sicilian Defense DRAGON Variation by Grandmaster Anish Giri', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=TCPfXd3L3FM', titre: 'Sicilian Dragon Variation Plans and Pawn Structure, Yugoslav Attack (Chess Openings)', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'dragon-9g4', rep: 'dragon', famille: 'Attaque yougoslave', nom: '9.g4 Fe6 10.O-O-O Cxd4', badge: 'theorie',
    ligne: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6 9. g4 Be6 10. O-O-O Nxd4 11. Bxd4 Qa5',
    plan: 'Contre g4 (h5 prépare l’ouverture de la colonne h), développer …Fe6, échanger en d4 puis …Da5 et …Tfc8 : attaque rapide sur le roi blanc par la colonne c.',
    structure: 'Roques opposés, Dame noire en a5 visant a2 et c3.',
    punition: null,
    piege: null,
    cases: 'c3, a2, colonne c',
    echanger: 'Cavalier c6 contre le Cavalier d4',
    conserver: 'Fou g7',
    video: { recherche: 'Dragon Yugoslav 9.g4 Be6', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=u1Jji8Z4YS0', titre: 'HOW TO PLAY Sicilian Defense DRAGON Variation by Grandmaster Anish Giri', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=TCPfXd3L3FM', titre: 'Sicilian Dragon Variation Plans and Pawn Structure, Yugoslav Attack (Chess Openings)', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'dragon-classique', rep: 'dragon', famille: 'Variante classique', nom: '6.Fe2 Fg7 7.O-O O-O', badge: 'piege',
    ligne: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be2 Bg7 7. O-O O-O 8. Be3 Nc6 9. Nb3 Be6 10. f4 Qc8',
    plan: 'Contre le roque blanc du même côté, jeu calme : …Cc6, …Fe6, …Dc8 et …Td8, puis la rupture …d5 ou …b5. Le Fou g7 reste la meilleure pièce.',
    structure: 'Roques du même côté : jeu positionnel, pression sur c3 et e4.',
    punition: null,
    piege: {
      ligne: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. Be2 Ng4? 8. Bxg4 Bxg4 9. Qxg4 Bxd4',
      texte: 'L’idée …Cg4 contre le Fou e3 ne marche PAS quand le Fou e2 couvre g4 : Fxg4 …Fxg4 Dxg4, et les Noirs ont perdu une pièce (…Fxd4 ne la récupère pas, le Fou e3 reprend).',
    },
    cases: 'd5, c4, g4',
    echanger: 'Fou e6 contre un Cavalier blanc qui gêne',
    conserver: 'Fou g7',
    video: { recherche: 'Dragon classical 6.Be2 Bg7 7.O-O O-O', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=u1Jji8Z4YS0', titre: 'HOW TO PLAY Sicilian Defense DRAGON Variation by Grandmaster Anish Giri', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'dragon-fc4', rep: 'dragon', famille: 'Déviations', nom: '6.Fc4 Fg7 7.O-O O-O', badge: 'theorie',
    ligne: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Bc4 Bg7 7. O-O O-O 8. Bb3 Nc6 9. Re1 Nxd4 10. Qxd4 Ng4',
    plan: 'Contre le Fou c4, développement normal ; l’échange en d4 puis …Cg4 active le Fou g7 sur la Dame d4.',
    structure: 'Fou g7 face à la Dame blanche centralisée.',
    punition: {
      ligne: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Bc4 Bg7 7. Be3 Ng4 8. Bb5+ Kf8 9. Qxg4? Bxd4 10. Bxd4 Bxg4',
      texte: 'Avec le Fou en c4 (et non en e2), Fe3 permet …Cg4 ! qui attaque le Fou e3. Après Fb5+ …Rf8, prendre le Cavalier avec Dxg4 ? perd la Dame : …Fxd4 ! puis …Fxg4.',
    },
    piege: null,
    cases: 'g4, d4, la diagonale h8-a1',
    echanger: 'Cavalier g4 contre le Fou e3',
    conserver: 'Fou g7',
    video: { recherche: 'Dragon 6.Bc4 Ng4 trap Be3', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=u1Jji8Z4YS0', titre: 'HOW TO PLAY Sicilian Defense DRAGON Variation by Grandmaster Anish Giri', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'dragon-levenfish', rep: 'dragon', famille: 'Déviations', nom: '6.f4 Cbd7 (Levenfish)', badge: 'piege',
    ligne: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. f4 Nbd7 7. Nf3 Qc7 8. Bd3 Bg7',
    plan: 'Contre f4 (qui prépare e5), …Cbd7 ! surveille e5 avant de fianchettoer. Ensuite …Dc7, …Fg7 et roque.',
    structure: 'Les Noirs contrôlent e5 : le pion f4 blanc a affaibli e3 et la diagonale du roi.',
    punition: null,
    piege: {
      ligne: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. f4 Bg7 7. e5 dxe5 8. fxe5 Ng4? 9. Bb5+ Kf8 10. Ne6+ fxe6 11. Qxg4',
      texte: 'Le fianchetto automatique 6…Fg7 permet e5 ! et après …Cg4 ?, Fb5+ puis Ce6+ ! désorganise tout : les Blancs récupèrent le Cavalier g4 avec une attaque gagnante.',
    },
    cases: 'e5, d7, f4',
    echanger: 'Rien avant d’avoir stoppé e5',
    conserver: 'Cavalier d7 (garde e5)',
    video: { recherche: 'Dragon Levenfish 6.f4 Nbd7', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=u1Jji8Z4YS0', titre: 'HOW TO PLAY Sicilian Defense DRAGON Variation by Grandmaster Anish Giri', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'dragon-g3', rep: 'dragon', famille: 'Déviations', nom: '6.g3 Cc6 (fianchetto)', badge: 'theorie',
    ligne: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. g3 Nc6 7. Nde2 Bg7 8. Bg2 O-O 9. O-O Rb8',
    plan: 'Contre le double fianchetto, jeu à l’aile dame : …Tb8 et …b5-b4 pour chasser le Cavalier c3 et affaiblir e4.',
    structure: 'Positions calmes, Fous en fianchetto des deux côtés.',
    punition: null,
    piege: null,
    cases: 'b4, e4, d4',
    echanger: 'Pion b contre le Cavalier c3 (…b4)',
    conserver: 'Fou g7',
    video: { recherche: 'Dragon fianchetto 6.g3 Nc6', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=u1Jji8Z4YS0', titre: 'HOW TO PLAY Sicilian Defense DRAGON Variation by Grandmaster Anish Giri', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
];
