// Fiches du répertoire « Contre le Système de Londres (Noirs) » (format et conventions : en-tête de
// site/data/repertoire.js). Toute ligne tactique doit être vérifiée par Stockfish : npm run verify:repertoire.
//
// 1.d4 d5 2.Ff4 : le Londres est très fréquent en club ; plan noir principal avec …c5 et …Db6.

export default [
  {
    id: 'cl-c5-db6', rep: 'contre-londres', famille: 'Londres 2.Ff4 c5', nom: '2…c5 3.e3 Cc6 4.c3 Db6', badge: 'theorie',
    ligne: '1. d4 d5 2. Bf4 c5 3. e3 Nc6 4. c3 Qb6 5. Qb3 c4 6. Qc2 Bf5 7. Qc1 e6',
    plan: 'Frapper d4 tout de suite (…c5, …Cc6) et viser b2, la faiblesse laissée par le Fou parti en f4 (…Db6). Si les Blancs proposent l’échange des Dames en b3, …c4 gagne de l’espace et chasse la Dame.',
    structure: 'Avance noire à l’aile dame (…c4), Fou f5 actif ; les Blancs ont un pion e3 solide mais passif.',
    punition: null,
    piege: null,
    cases: 'b2 (pion faible), d4, c4',
    echanger: 'Fou f5 contre le Fou d3 blanc',
    conserver: 'Pression sur b2',
    video: { recherche: 'how to beat the London System c5 Qb6', url: null },
  },
  {
    id: 'cl-classique', rep: 'contre-londres', famille: 'Londres 2.Ff4 Cf6', nom: '2…Cf6 3.e3 e6 4.Cf3 c5', badge: 'theorie',
    ligne: '1. d4 d5 2. Bf4 Nf6 3. e3 e6 4. Nf3 c5 5. c3 Nc6 6. Nbd2 Bd6 7. Bg3 O-O 8. Bd3 b6',
    plan: 'Structure solide, puis …Fd6 pour échanger le Fou du Londres, son meilleur. Ensuite …b6 et …Fb7 ou …Fa6 pour échanger le Fou d3 blanc, et …Ce4 au bon moment.',
    structure: 'Centre d4/d5 fermé ; les Noirs échangent les Fous actifs blancs et gardent un jeu égal.',
    punition: null,
    piege: null,
    cases: 'e4 (case du Cavalier), d6 (échange des Fous), a6',
    echanger: 'Fou d6 contre le Fou du Londres ; Fou a6 contre le Fou d3',
    conserver: 'Pion d5',
    video: { recherche: 'London System black setup Bd6 b6', url: null },
  },
  {
    id: 'cl-ff5', rep: 'contre-londres', famille: 'Londres 2.Ff4 Ff5', nom: '2…Ff5 (symétrique) 3.e3 e6 4.c4', badge: 'theorie',
    ligne: '1. d4 d5 2. Bf4 Bf5 3. e3 e6 4. c4 Bb4+ 5. Nc3 Nf6 6. Qb3 Nc6',
    plan: 'Sortir son Fou c8 avant …e6, comme les Blancs. Contre c4, l’échec …Fb4+ cloue le Cavalier ; si Db3, le développement …Cc6 et …O-O suffit, b7 étant souvent empoisonné.',
    structure: 'Structure symétrique ; les deux Fous de cases blanches sont actifs.',
    punition: null,
    piege: null,
    cases: 'b7 (pion visé par Db3), c4, e4',
    echanger: 'Fou b4 contre le Cavalier c3 si les pions blancs se doublent',
    conserver: 'Fou f5',
    video: { recherche: 'London System symmetrical Bf5 black', url: null },
  },
  {
    id: 'cl-db6-piege', rep: 'contre-londres', famille: 'Londres 2.Ff4 c5', nom: '3…Db6 4.Cc3 (b2 empoisonné)', badge: 'piege',
    ligne: '1. d4 d5 2. Bf4 c5 3. e3 Qb6 4. Nc3 e6 5. Nb5 Na6 6. a4 Nf6',
    plan: 'Après 4.Cc3, le pion b2 est empoisonné : on joue …e6 et on se développe. Le Cavalier blanc qui vient en b5 ou d5 vise c7 : la case est tenue par …Ca6.',
    structure: 'Pression noire sur d4 ; Cavalier blanc avancé en b5.',
    punition: null,
    piege: {
      ligne: '1. d4 d5 2. Bf4 c5 3. e3 Qb6 4. Nc3 Qxb2? 5. Nxd5',
      texte: 'Prendre b2 avec la Dame est un réflexe perdant : Cxd5 ! reprend le pion avec une double menace, la fourchette Cc7+ (roi et Tour) et Tb1 qui enferme la Dame noire.',
    },
    cases: 'c7 (fourchette Cc7+), b2 (empoisonné), b5',
    echanger: 'Dames en b3 si les Blancs proposent l’échange : …c4 garde l’initiative',
    conserver: 'La Dame près du roi',
    video: { recherche: 'London System Qb6 Nc3 Qxb2 trap', url: null },
  },
];
