// Fiches du répertoire « Gambit Smith-Morra » (format et conventions : en-tête de site/data/repertoire.js).
// Toute ligne tactique (punition, piège) doit être vérifiée par Stockfish : npm run verify:repertoire.
//
// 1.e4 c5 2.d4 cxd4 3.c3 : un pion donné contre la Sicilienne, pour un développement rapide, des
// colonnes c et d ouvertes et une attaque directe.

export default [
  {
    id: 'sm-accepte', rep: 'smith-morra', famille: 'Gambit accepté', nom: '3…dxc3 4.Cxc3 Cc6 5.Cf3 d6', badge: 'theorie',
    ligne: '1. e4 c5 2. d4 cxd4 3. c3 dxc3 4. Nxc3 Nc6 5. Nf3 d6 6. Bc4 e6 7. O-O Nf6 8. Qe2 Be7 9. Rd1 e5 10. h3 O-O',
    plan: 'Le schéma type : Cc3, Cf3, Fc4, roque, De2, Td1 (contre d6) et Tc1 (colonne c). Ensuite Fe3 ou Fg5, et des coups comme Cb5 ou Cd5 quand les pièces noires sont mal placées.',
    structure: 'Pion de moins, mais avance de développement et colonnes c/d ouvertes.',
    punition: null,
    piege: null,
    cases: 'd6 (pion arriéré), d5, b5',
    echanger: 'Fou c4 contre le Fou e6 noir si la colonne f s’ouvre',
    conserver: 'Fou c4',
    video: { recherche: 'Smith-Morra Gambit accepted main line plans', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=zgWTEOIQyHo', titre: 'Le Gambit Morra | Partie pédagogique | Niveau 1800 Elo#22 | Echecs', chaine: 'Échecs - Chess Trainer 2000', langue: 'fr', verifie: true, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=aydv_HHLry0', titre: 'Smith-Morra Gambit: Chess Ideas and Model Games!!', chaine: 'Miodrag Perunovic', langue: 'en', verifie: true, source: 'recherche web' },
      ] },
  },
  {
    id: 'sm-siberien', rep: 'smith-morra', famille: 'Gambit accepté', nom: '5…e6 6.Fc4 Dc7 (piège sibérien)', badge: 'piege',
    ligne: '1. e4 c5 2. d4 cxd4 3. c3 dxc3 4. Nxc3 Nc6 5. Nf3 e6 6. Bc4 Qc7 7. Qe2 Nf6 8. O-O Ng4 9. Nb5 Qb8 10. h3',
    plan: 'Contre …e6 et …Dc7, développer avec De2 et roque. Si …Cg4 menace h2, ne PAS jouer h3 tout de suite : Cb5 chasse d’abord la Dame de la diagonale b8-h2.',
    structure: 'Dame noire sur la diagonale b8-h2 : h2 est la case à surveiller.',
    punition: null,
    piege: {
      ligne: '1. e4 c5 2. d4 cxd4 3. c3 dxc3 4. Nxc3 Nc6 5. Nf3 e6 6. Bc4 Qc7 7. Qe2 Nf6 8. O-O Ng4 9. h3? Nd4 10. Nxd4 Qh2#',
      texte: 'Le piège sibérien : h3 pour chasser le Cavalier permet …Cd4 ! qui attaque la Dame e2. Si on prend le Cavalier (Cxd4), …Dh2 est mat.',
    },
    cases: 'h2, b5, d4',
    echanger: 'Rien avant d’avoir chassé la Dame c7',
    conserver: 'Cavalier f3 (défend h2)',
    video: { recherche: 'Siberian trap Smith-Morra Qh2 mate', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=zgWTEOIQyHo', titre: 'Le Gambit Morra | Partie pédagogique | Niveau 1800 Elo#22 | Echecs', chaine: 'Échecs - Chess Trainer 2000', langue: 'fr', verifie: true, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=aydv_HHLry0', titre: 'Smith-Morra Gambit: Chess Ideas and Model Games!!', chaine: 'Miodrag Perunovic', langue: 'en', verifie: true, source: 'recherche web' },
      ] },
  },
  {
    id: 'sm-e6-a6', rep: 'smith-morra', famille: 'Gambit accepté', nom: '5…e6 6.Fc4 a6 7.O-O Cge7', badge: 'theorie',
    ligne: '1. e4 c5 2. d4 cxd4 3. c3 dxc3 4. Nxc3 Nc6 5. Nf3 e6 6. Bc4 a6 7. O-O Nge7 8. Bg5',
    plan: 'Contre le développement …e6, …a6 et …Cge7, Fg5 gêne le Cavalier e7 et la Dame ; De2, Tad1 et Tfd1 visent d7 et la colonne d.',
    structure: 'Pions noirs a6/e6 ; case d6 faible et colonne d ouverte.',
    punition: null,
    piege: null,
    cases: 'd6, e7, colonne d',
    echanger: 'Fou g5 contre le Cavalier e7',
    conserver: 'Fou c4',
    video: { recherche: 'Smith-Morra 5...e6 6.Bc4 a6 Nge7', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=zgWTEOIQyHo', titre: 'Le Gambit Morra | Partie pédagogique | Niveau 1800 Elo#22 | Echecs', chaine: 'Échecs - Chess Trainer 2000', langue: 'fr', verifie: true, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=aydv_HHLry0', titre: 'Smith-Morra Gambit: Chess Ideas and Model Games!!', chaine: 'Miodrag Perunovic', langue: 'en', verifie: true, source: 'recherche web' },
      ] },
  },
  {
    id: 'sm-cf6', rep: 'smith-morra', famille: 'Gambit refusé', nom: '3…Cf6 4.e5 Cd5', badge: 'theorie',
    ligne: '1. e4 c5 2. d4 cxd4 3. c3 Nf6 4. e5 Nd5 5. Qxd4 e6 6. Nf3 Nc6 7. Qe4',
    plan: 'Refus par …Cf6 : avancer e5 et reprendre en d4 avec la Dame. On obtient une Alapin avec de l’espace (pion e5) ; Cf3, Fc4 ou Fd3 et roque.',
    structure: 'Pion blanc e5 : espace et case d6 contrôlée.',
    punition: null,
    piege: null,
    cases: 'e5, d6, d4',
    echanger: 'Cavalier c3 contre le Cavalier d5',
    conserver: 'Pion e5',
    video: { recherche: 'Smith-Morra declined 3...Nf6 4.e5', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=zgWTEOIQyHo', titre: 'Le Gambit Morra | Partie pédagogique | Niveau 1800 Elo#22 | Echecs', chaine: 'Échecs - Chess Trainer 2000', langue: 'fr', verifie: true, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=aydv_HHLry0', titre: 'Smith-Morra Gambit: Chess Ideas and Model Games!!', chaine: 'Miodrag Perunovic', langue: 'en', verifie: true, source: 'recherche web' },
      ] },
  },
  {
    id: 'sm-d5', rep: 'smith-morra', famille: 'Gambit refusé', nom: '3…d5 4.exd5 Dxd5 5.cxd4', badge: 'theorie',
    ligne: '1. e4 c5 2. d4 cxd4 3. c3 d5 4. exd5 Qxd5 5. cxd4 Nc6 6. Nf3 Bg4 7. Nc3 Qa5',
    plan: 'Refus par …d5 : après les échanges, les Blancs ont un pion isolé en d4 mais un développement facile (Cf3, Cc3, Fe2, roque). Cc3 et d5 menacent souvent la Dame noire.',
    structure: 'Pion dame isolé blanc : actif en milieu de partie, faible en finale.',
    punition: {
      ligne: '1. e4 c5 2. d4 cxd4 3. c3 d5 4. exd5 Qxd5 5. cxd4 Nc6 6. Nf3 Bg4 7. Nc3 Qd6? 8. d5 Ne5 9. Bb5+',
      texte: 'La Dame en d6 se met devant le pion d : d5 ! chasse le Cavalier c6, puis Fb5+ gagne du temps contre un roi noir encore au centre.',
    },
    piege: null,
    cases: 'd5 (poussée), b5, d4',
    echanger: 'Rien de pressé : le pion isolé aime les pièces',
    conserver: 'Pion d4',
    video: { recherche: 'Smith-Morra declined 3...d5', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=zgWTEOIQyHo', titre: 'Le Gambit Morra | Partie pédagogique | Niveau 1800 Elo#22 | Echecs', chaine: 'Échecs - Chess Trainer 2000', langue: 'fr', verifie: true, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=aydv_HHLry0', titre: 'Smith-Morra Gambit: Chess Ideas and Model Games!!', chaine: 'Miodrag Perunovic', langue: 'en', verifie: true, source: 'recherche web' },
      ] },
  },
  {
    id: 'sm-d3', rep: 'smith-morra', famille: 'Gambit refusé', nom: '3…d3 4.Fxd3', badge: 'theorie',
    ligne: '1. e4 c5 2. d4 cxd4 3. c3 d3 4. Bxd3 Nc6 5. Nf3 d6 6. O-O Nf6 7. h3',
    plan: 'Si les Noirs rendent le pion par …d3, reprendre avec le Fou : on a un beau centre (e4) et un développement facile. Plan : c4, Cc3, Fe3, Td1.',
    structure: 'Pion blanc e4 seul au centre, Fou d3 actif.',
    punition: null,
    piege: null,
    cases: 'd5, e4, c4',
    echanger: 'Rien',
    conserver: 'Pion e4',
    video: { recherche: 'Smith-Morra 3...d3 declined', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=zgWTEOIQyHo', titre: 'Le Gambit Morra | Partie pédagogique | Niveau 1800 Elo#22 | Echecs', chaine: 'Échecs - Chess Trainer 2000', langue: 'fr', verifie: true, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=aydv_HHLry0', titre: 'Smith-Morra Gambit: Chess Ideas and Model Games!!', chaine: 'Miodrag Perunovic', langue: 'en', verifie: true, source: 'recherche web' },
      ] },
  },
];
