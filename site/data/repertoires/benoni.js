// Fiches du répertoire « Benoni / Gambit Benko » (format et conventions : en-tête de site/data/repertoire.js).
// Toute ligne tactique (punition, piège) doit être vérifiée par Stockfish : npm run verify:repertoire.
//
// 1.d4 Cf6 2.c4 c5 3.d5 : Benoni moderne (3…e6, majorité noire à l'aile dame, Fou g7) ou Gambit
// Benko (3…b5, un pion donné pour les colonnes a et b ouvertes).

export default [
  {
    id: 'ben-moderne', rep: 'benoni', famille: 'Benoni moderne', nom: '3.d5 e6 4.Cc3 exd5 5.cxd5 d6 6.e4 g6', badge: 'theorie',
    ligne: '1. d4 Nf6 2. c4 c5 3. d5 e6 4. Nc3 exd5 5. cxd5 d6 6. e4 g6 7. Nf3 Bg7 8. Be2 O-O 9. O-O Re8 10. Nd2 Na6',
    plan: 'Échanger en d5 pour obtenir une majorité de pions à l’aile dame (a7, b7, c5), puis fianchetto, roque et …Te8 contre e4. Plans : …Ca6-c7, …a6 et …b5 ; parfois le coup tactique …Cxe4 quand le pion e4 est peu défendu.',
    structure: 'Pion blanc d5 avancé, pion noir d6 ; majorité blanche au centre (e4-e5), majorité noire à l’aile dame (…b5).',
    punition: null,
    piege: null,
    cases: 'e4, e5 (à surveiller), b5',
    echanger: 'Fou g7 contre le Cavalier c3 seulement si cela gagne e4',
    conserver: 'Fou g7',
    video: { recherche: 'Modern Benoni main line plans Re8 Na6', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=3NSjEZEeLzE', titre: 'Echecs - Tout savoir sur la Defense Benoni - Stratégie', chaine: null, langue: 'fr', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=R3sT1d_npnQ', titre: 'The Modern Benoni is No Baloney: Part 1 - Chess Openings Explained', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'ben-fianchetto', rep: 'benoni', famille: 'Benoni moderne', nom: '6.Cf3 g6 7.g3 (fianchetto)', badge: 'theorie',
    ligne: '1. d4 Nf6 2. c4 c5 3. d5 e6 4. Nc3 exd5 5. cxd5 d6 6. Nf3 g6 7. g3 Bg7 8. Bg2 O-O 9. O-O Re8',
    plan: 'Contre le fianchetto blanc, même développement ; …Ce4 (si possible) échange un Cavalier, puis …Cbd7, …a6 et …b5 à l’aile dame.',
    structure: 'Pion d5 blanc soutenu par le Fou g2 ; jeu noir à l’aile dame.',
    punition: null,
    piege: null,
    cases: 'e4, b5, c4',
    echanger: 'Cavalier e4 contre le Cavalier c3',
    conserver: 'Fou g7',
    video: { recherche: 'Modern Benoni fianchetto variation', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=3NSjEZEeLzE', titre: 'Echecs - Tout savoir sur la Defense Benoni - Stratégie', chaine: null, langue: 'fr', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=R3sT1d_npnQ', titre: 'The Modern Benoni is No Baloney: Part 1 - Chess Openings Explained', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'ben-taimanov', rep: 'benoni', famille: 'Benoni moderne', nom: '6.e4 g6 7.f4 Fg7 8.Fb5+ Cfd7', badge: 'theorie',
    ligne: '1. d4 Nf6 2. c4 c5 3. d5 e6 4. Nc3 exd5 5. cxd5 d6 6. e4 g6 7. f4 Bg7 8. Bb5+ Nfd7 9. a4 O-O 10. Nf3 Na6 11. O-O Nb4',
    plan: 'L’attaque la plus dangereuse : contre Fb5+, interposer le Cavalier f6 en d7 (pas le Fou : e5 devient très fort). Ensuite roque, …Ca6-b4 et …Te8 contre e5.',
    structure: 'Pions blancs e4/f4 menaçants ; les Noirs bloquent e5 avec leurs pièces.',
    punition: null,
    piege: null,
    cases: 'e5 (à bloquer), b4, c4',
    echanger: 'Cavalier b4 contre une pièce blanche active',
    conserver: 'Cavalier d7 (contrôle e5)',
    video: { recherche: 'Benoni Taimanov attack 8.Bb5+ Nfd7', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=3NSjEZEeLzE', titre: 'Echecs - Tout savoir sur la Defense Benoni - Stratégie', chaine: null, langue: 'fr', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=R3sT1d_npnQ', titre: 'The Modern Benoni is No Baloney: Part 1 - Chess Openings Explained', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'ben-cf3', rep: 'benoni', famille: 'Déviations', nom: '3.Cf3 cxd4 4.Cxd4 e6', badge: 'theorie',
    ligne: '1. d4 Nf6 2. c4 c5 3. Nf3 cxd4 4. Nxd4 e6 5. Nc3 Bb4',
    plan: 'Si les Blancs n’avancent pas d5, échanger en d4 puis …e6 et …Fb4 : on obtient une position d’Anglaise symétrique, avec le clouage du Cavalier c3.',
    structure: 'Centre ouvert, pions noirs d7/e6 souples.',
    punition: null,
    piege: null,
    cases: 'c3 (clouage), d5, e4',
    echanger: 'Fou b4 contre le Cavalier c3 si cela double les pions blancs',
    conserver: 'Pion d7 (rupture …d5 plus tard)',
    video: { recherche: '1.d4 Nf6 2.c4 c5 3.Nf3 cxd4 4.Nxd4 e6', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=3NSjEZEeLzE', titre: 'Echecs - Tout savoir sur la Defense Benoni - Stratégie', chaine: null, langue: 'fr', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=R3sT1d_npnQ', titre: 'The Modern Benoni is No Baloney: Part 1 - Chess Openings Explained', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'benko-accepte', rep: 'benoni', famille: 'Gambit Benko', nom: '3…b5 4.cxb5 a6 5.bxa6 Fxa6', badge: 'theorie',
    ligne: '1. d4 Nf6 2. c4 c5 3. d5 b5 4. cxb5 a6 5. bxa6 Bxa6 6. Nc3 d6 7. e4 Bxf1 8. Kxf1 g6 9. g3 Bg7 10. Kg2 O-O 11. Nf3 Nbd7',
    plan: 'Un pion donné pour l’initiative durable : colonnes a et b ouvertes pour les Tours, Fou g7 sur la grande diagonale. Plans : …Da5, …Tfb8, …Cb6 ; la pression sur a2 et b2 dure jusqu’en finale.',
    structure: 'Pion de moins mais colonnes a/b ouvertes ; le roi blanc a perdu le roque (Fxf1 Rxf1).',
    punition: null,
    piege: null,
    cases: 'a2, b2, colonnes a et b',
    echanger: 'Fou a6 contre le Fou f1 (le roi blanc ne roque plus)',
    conserver: 'Fou g7',
    video: { recherche: 'Benko Gambit accepted main line plans', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=_bG3XLZPqbw', titre: 'GAMBIT BENKO [Petite présentation + piège]', chaine: null, langue: 'fr', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=-qGlSDA4w6M', titre: 'Chess Openings: Benko Gambit', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
  {
    id: 'benko-refuse', rep: 'benoni', famille: 'Gambit Benko', nom: '4.cxb5 a6 5.e3 (pion rendu)', badge: 'theorie',
    ligne: '1. d4 Nf6 2. c4 c5 3. d5 b5 4. cxb5 a6 5. e3 g6 6. Nc3 Bg7 7. a4 O-O',
    plan: 'Si les Blancs ne prennent pas en a6, fianchetto et roque, puis …axb5 et …Fa6 : les Noirs récupèrent le pion ou gardent l’initiative à l’aile dame.',
    structure: 'Pion blanc b5 isolé de ses voisins ; Fou g7 actif.',
    punition: null,
    piege: null,
    cases: 'b5, a6, d5',
    echanger: 'Fou a6 contre le Fou f1',
    conserver: 'Fou g7',
    video: { recherche: 'Benko Gambit 5.e3 declined', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=_bG3XLZPqbw', titre: 'GAMBIT BENKO [Petite présentation + piège]', chaine: null, langue: 'fr', verifie: false, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=-qGlSDA4w6M', titre: 'Chess Openings: Benko Gambit', chaine: null, langue: 'en', verifie: false, source: 'recherche web' },
      ] },
  },
];
