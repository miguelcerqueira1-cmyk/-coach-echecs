// Finales essentielles : positions classiques de manuel, jouées contre Stockfish.
// but : 'mat' (mater en `limite` coups au plus), 'promotion' (aller à dame en gardant le gain),
// 'nulle' (tenir `limite` coups sans perdre). camp : le camp de l'utilisateur.
// Chaque position est vérifiée par Stockfish (scripts/verify-finales.mjs → data/finales-verif.json) :
// gain attendu pour 'mat' / 'promotion', nulle pour 'nulle'. Les textes expliquent la méthode
// classique ; aucune évaluation n'y est écrite à la main.
export default [
  {
    id: 'escalier', titre: 'Mat avec deux Tours (l’escalier)', but: 'mat', camp: 'w', limite: 15, gratuit: true,
    fen: '8/8/8/4k3/8/8/8/R3K2R w - - 0 1',
    methode: 'Les deux Tours montent l’une après l’autre, rangée par rangée, comme un escalier : l’une coupe le roi, l’autre donne échec. Garde-les loin du roi adverse (sinon il les attaque) et ne bouge pas ton roi.',
  },
  {
    id: 'dame', titre: 'Mat Roi + Dame contre Roi', but: 'mat', camp: 'w', limite: 20, gratuit: true,
    fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1',
    methode: 'Réduis la « boîte » du roi adverse avec ta Dame, à un saut de cavalier de lui. Quand il est collé au bord, arrête de pousser : amène ton roi, puis mate. Avant chaque coup de Dame, vérifie qu’il lui reste une case : sinon c’est pat (nulle) !',
  },
  {
    id: 'tour', titre: 'Mat Roi + Tour contre Roi', but: 'mat', camp: 'w', limite: 30, gratuit: true,
    fen: '8/8/8/3k4/8/8/8/4K2R w - - 0 1',
    methode: 'La Tour coupe le roi adverse sur une rangée. Ton roi vient se placer face au sien (opposition), puis échec de la Tour : il recule d’une rangée. Recommence jusqu’au bord, puis mate. Si son roi attaque ta Tour, éloigne-la sur la même rangée.',
  },
  {
    id: 'opposition', titre: 'Roi et pion : gagner avec le roi devant', but: 'promotion', camp: 'w', limite: 15,
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    methode: 'Ton roi est devant ton pion, sur la 6e rangée : c’est gagnant. Le roi ouvre le chemin en contrôlant la case de promotion, le pion suit. Ne pousse pas le pion trop tôt si le roi adverse peut bloquer devant lui.',
  },
  {
    id: 'carre', titre: 'La règle du carré : rattraper le pion', but: 'nulle', camp: 'w', limite: 10,
    fen: '7k/8/8/p7/8/8/8/4K3 w - - 0 1',
    methode: 'Trace le carré qui va du pion à sa case de promotion. Si ton roi peut entrer dans ce carré, il rattrape le pion. Marche en diagonale vers lui : c’est le chemin le plus court.',
  },
  {
    id: 'opposition-nulle', titre: 'Roi et pion : défendre avec l’opposition', but: 'nulle', camp: 'b', limite: 20,
    fen: '8/8/4k3/8/4P3/4K3/8/8 b - - 0 1',
    methode: 'Ton roi est devant le pion : garde-le sur sa colonne et prends l’opposition (ton roi en face du sien, une case entre les deux). Quand il faut reculer, recule droit devant le pion, pas sur le côté.',
  },
  {
    id: 'lucena', titre: 'Position de Lucena : construire un pont', but: 'promotion', camp: 'w', limite: 15,
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    methode: '1. Coupe le roi adverse encore une colonne plus loin avec ta Tour. 2. Monte la Tour sur la 4e rangée. 3. Sors ton roi : quand la Tour adverse donne des échecs, interpose ta Tour (c’est le « pont »), puis le pion va à dame.',
  },
  {
    id: 'philidor', titre: 'Position de Philidor : tenir la nulle', but: 'nulle', camp: 'b', limite: 20,
    fen: '3k4/8/8/3PK3/8/8/7R/r7 b - - 0 1',
    methode: 'Place ta Tour sur ta 3e rangée (la 6e vue des Blancs) : le roi adverse ne peut plus avancer. Dès que le pion avance sur cette rangée, va donner des échecs par derrière, de loin.',
  },
];
