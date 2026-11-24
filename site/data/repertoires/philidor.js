// Fiches du répertoire « Défense Philidor » (format et conventions : en-tête de site/data/repertoire.js).
// Toute ligne tactique (punition, piège) doit être vérifiée par Stockfish : npm run verify:repertoire.
//
// 1.e4 e5 2.Cf3 d6 : défense solide du pion e5 ; garder le pion e5 (Hanham …Cbd7) ou céder le
// centre (…exd4) pour un jeu de pièces.

export default [
  {
    id: 'phi-hanham', rep: 'philidor', famille: 'Variante Hanham', nom: '3.d4 Cf6 4.Cc3 Cbd7', badge: 'piege',
    ligne: '1. e4 e5 2. Nf3 d6 3. d4 Nf6 4. Nc3 Nbd7 5. Bc4 Be7 6. O-O O-O 7. Re1 c6 8. a4',
    plan: 'Garder le pion e5 avec …Cf6 puis …Cbd7 (dans cet ordre : il protège contre dxe5). Ensuite …Fe7, roque, …c6 et …Dc7 ; plus tard …b5 ou …exd4 suivi de …d5.',
    structure: 'Centre fermé solide (pions d6/e5) ; position resserrée mais sans faiblesse.',
    punition: null,
    piege: {
      ligne: '1. e4 e5 2. Nf3 d6 3. d4 Nd7 4. Bc4 Be7? 5. dxe5 dxe5 6. Qd5',
      texte: 'Avec …Cd7 joué AVANT …Cf6, le pion f7 est mal protégé : après dxe5, Dd5 attaque f7 avec la Dame et le Fou c4. Les Blancs gagnent au moins un pion avec une position écrasante.',
    },
    cases: 'f7 (à protéger), e5, d5',
    echanger: 'Rien de pressé',
    conserver: 'Pion e5',
    video: { recherche: 'Philidor Defense Hanham variation Nbd7', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=tlNZ9Eurb3k', titre: 'La défense Philidor (échecs débutant)', chaine: 'imineo Echecs', langue: 'fr', verifie: true, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=mAf-YuGPYMo', titre: 'Philidor Defense - Chess Openings', chaine: 'thechesswebsite', langue: 'en', verifie: true, source: 'recherche web' },
      ] },
  },
  {
    id: 'phi-exd4', rep: 'philidor', famille: 'Variante d’échange', nom: '3.d4 exd4 4.Cxd4 Cf6', badge: 'theorie',
    ligne: '1. e4 e5 2. Nf3 d6 3. d4 exd4 4. Nxd4 Nf6 5. Nc3 Be7 6. Bf4 O-O 7. Qd2 a6 8. O-O-O',
    plan: 'Céder le centre pour un jeu actif : …Cf6, …Fe7, roque, puis …Te8, …Ff8 et la rupture …d5 ou …b5 contre le grand roque blanc.',
    structure: 'Pion d6 noir contre e4 blanc : structure de Sicilienne Scheveningen sans pion c.',
    punition: null,
    piege: null,
    cases: 'e4 (cible), d5 (rupture), b5',
    echanger: 'Cavalier c6 contre le Cavalier d4',
    conserver: 'Fou e7',
    video: { recherche: 'Philidor exchange variation 3...exd4', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=tlNZ9Eurb3k', titre: 'La défense Philidor (échecs débutant)', chaine: 'imineo Echecs', langue: 'fr', verifie: true, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=mAf-YuGPYMo', titre: 'Philidor Defense - Chess Openings', chaine: 'thechesswebsite', langue: 'en', verifie: true, source: 'recherche web' },
      ] },
  },
  {
    id: 'phi-fc4', rep: 'philidor', famille: 'Déviations', nom: '3.Fc4 Fe7', badge: 'piege',
    ligne: '1. e4 e5 2. Nf3 d6 3. Bc4 Be7 4. d4 exd4 5. Nxd4 Nf6 6. Nc3 O-O 7. O-O',
    plan: 'Contre le Fou c4, …Fe7 et …Cf6 protègent le roi ; après d4, prendre puis roquer. Le coup tactique …Cxe4 suivi de …d5 est possible si le Fou c4 est attaquable.',
    structure: 'Position ouverte, développement normal.',
    punition: null,
    piege: {
      ligne: '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1? 6. Bxf7+ Ke7 7. Nd5#',
      texte: 'Le mat de Légal : clouer le Cavalier f3 avec …Fg4 sans protéger e5 permet Cxe5 ! Prendre la Dame (…Fxd1) mène au mat Fxf7+ et Cd5#. Il fallait reprendre en e5 (…dxe5) et accepter la perte d’un pion.',
    },
    cases: 'f7, e5, d5',
    echanger: 'Rien',
    conserver: 'Fou e7 (protège le roi)',
    video: { recherche: 'Legal trap Philidor Bg4 Nxe5', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=tlNZ9Eurb3k', titre: 'La défense Philidor (échecs débutant)', chaine: 'imineo Echecs', langue: 'fr', verifie: true, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=mAf-YuGPYMo', titre: 'Philidor Defense - Chess Openings', chaine: 'thechesswebsite', langue: 'en', verifie: true, source: 'recherche web' },
      ] },
  },
  {
    id: 'phi-dxe5', rep: 'philidor', famille: 'Déviations', nom: '3.d4 Cf6 4.dxe5 Cxe4 5.Dd5', badge: 'theorie',
    ligne: '1. e4 e5 2. Nf3 d6 3. d4 Nf6 4. dxe5 Nxe4 5. Qd5 Nc5 6. Bg5 Be7 7. exd6 Qxd6 8. Nc3',
    plan: 'Si les Blancs prennent tout de suite en e5, …Cxe4 récupère le pion ; contre Dd5 (menace f7), …Cc5 défend, puis …Fe7 et …Dxd6. Les Blancs gardent une petite avance de développement : jouer simplement.',
    structure: 'Centre ouvert ; Dames souvent échangées tôt.',
    punition: null,
    piege: null,
    cases: 'f7, c5, d6',
    echanger: 'Les Dames (…Dxd6 puis échange)',
    conserver: 'Cavalier c5',
    video: { recherche: 'Philidor 3...Nf6 4.dxe5 Nxe4 5.Qd5', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=tlNZ9Eurb3k', titre: 'La défense Philidor (échecs débutant)', chaine: 'imineo Echecs', langue: 'fr', verifie: true, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=mAf-YuGPYMo', titre: 'Philidor Defense - Chess Openings', chaine: 'thechesswebsite', langue: 'en', verifie: true, source: 'recherche web' },
      ] },
  },
  {
    id: 'phi-cc3', rep: 'philidor', famille: 'Variante Hanham', nom: '3.Cc3 Cf6 4.d4 Cbd7', badge: 'theorie',
    ligne: '1. e4 e5 2. Nf3 d6 3. Nc3 Nf6 4. d4 Nbd7 5. Bc4 Be7 6. O-O O-O',
    plan: 'Même structure Hanham par un autre ordre de coups : …Cf6, …Cbd7, …Fe7, roque, puis …c6 et …Dc7.',
    structure: 'Pions d6/e5 solides ; les Noirs attendent le bon moment pour …b5 ou …exd4.',
    punition: null,
    piege: null,
    cases: 'e5, f7, b5',
    echanger: 'Rien de pressé',
    conserver: 'Pion e5',
    video: { recherche: 'Philidor 3.Nc3 Nf6 4.d4 Nbd7', url: null,
      liens: [
        { url: 'https://www.youtube.com/watch?v=tlNZ9Eurb3k', titre: 'La défense Philidor (échecs débutant)', chaine: 'imineo Echecs', langue: 'fr', verifie: true, source: 'recherche web' },
        { url: 'https://www.youtube.com/watch?v=mAf-YuGPYMo', titre: 'Philidor Defense - Chess Openings', chaine: 'thechesswebsite', langue: 'en', verifie: true, source: 'recherche web' },
      ] },
  },
];
