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
    en: { titre: "Mate with two rooks (the ladder)", methode: "The two rooks climb one after the other, rank by rank, like a ladder: one cuts off the king, the other gives check. Keep them far from the enemy king (otherwise it attacks them) and do not move your king." },
  },
  {
    id: 'dame', titre: 'Mat Roi + Dame contre Roi', but: 'mat', camp: 'w', limite: 20, gratuit: true,
    fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1',
    methode: 'Réduis la « boîte » du roi adverse avec ta Dame, à un saut de cavalier de lui. Quand il est collé au bord, arrête de pousser : amène ton roi, puis mate. Avant chaque coup de Dame, vérifie qu’il lui reste une case : sinon c’est pat (nulle) !',
    en: { titre: "Mate with king + queen against king", methode: "Shrink the enemy king’s “box” with your queen, a knight’s jump away from it. When it is stuck on the edge, stop pushing: bring your king, then mate. Before every queen move, check that it still has a square: otherwise it is stalemate (a draw)!" },
  },
  {
    id: 'tour', titre: 'Mat Roi + Tour contre Roi', but: 'mat', camp: 'w', limite: 30, gratuit: true,
    fen: '8/8/8/3k4/8/8/8/4K2R w - - 0 1',
    methode: 'La Tour coupe le roi adverse sur une rangée. Ton roi vient se placer face au sien (opposition), puis échec de la Tour : il recule d’une rangée. Recommence jusqu’au bord, puis mate. Si son roi attaque ta Tour, éloigne-la sur la même rangée.',
    en: { titre: "Mate with king + rook against king", methode: "The rook cuts off the enemy king on a rank. Your king comes to face its king (opposition), then a rook check: it steps back one rank. Repeat until the edge, then mate. If its king attacks your rook, move the rook away along the same rank." },
  },
  {
    id: 'opposition', titre: 'Roi et pion : gagner avec le roi devant', but: 'promotion', camp: 'w', limite: 15,
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    methode: 'Ton roi est devant ton pion, sur la 6e rangée : c’est gagnant. Le roi ouvre le chemin en contrôlant la case de promotion, le pion suit. Ne pousse pas le pion trop tôt si le roi adverse peut bloquer devant lui.',
    en: { titre: "King and pawn: win with the king in front", methode: "Your king is in front of your pawn, on the 6th rank: it is winning. The king clears the way by controlling the promotion square, the pawn follows. Do not push the pawn too early if the enemy king can block in front of it." },
  },
  {
    id: 'carre', titre: 'La règle du carré : rattraper le pion', but: 'nulle', camp: 'w', limite: 10,
    fen: '7k/8/8/p7/8/8/8/4K3 w - - 0 1',
    methode: 'Trace le carré qui va du pion à sa case de promotion. Si ton roi peut entrer dans ce carré, il rattrape le pion. Marche en diagonale vers lui : c’est le chemin le plus court.',
    en: { titre: "The rule of the square: catch the pawn", methode: "Draw the square from the pawn to its promotion square. If your king can enter this square, it catches the pawn. Walk diagonally towards it: it is the shortest way." },
  },
  {
    id: 'opposition-nulle', titre: 'Roi et pion : défendre avec l’opposition', but: 'nulle', camp: 'b', limite: 20,
    fen: '8/8/4k3/8/4P3/4K3/8/8 b - - 0 1',
    methode: 'Ton roi est devant le pion : garde-le sur sa colonne et prends l’opposition (ton roi en face du sien, une case entre les deux). Quand il faut reculer, recule droit devant le pion, pas sur le côté.',
    en: { titre: "King and pawn: defend with the opposition", methode: "Your king is in front of the pawn: keep it on the pawn’s file and take the opposition (your king facing its king, one square between them). When you must retreat, step straight back in front of the pawn, not to the side." },
  },
  {
    id: 'lucena', titre: 'Position de Lucena : construire un pont', but: 'promotion', camp: 'w', limite: 15,
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    methode: '1. Coupe le roi adverse encore une colonne plus loin avec ta Tour. 2. Monte la Tour sur la 4e rangée. 3. Sors ton roi : quand la Tour adverse donne des échecs, interpose ta Tour (c’est le « pont »), puis le pion va à dame.',
    en: { titre: "Lucena position: build a bridge", methode: "1. Cut off the enemy king one more file away with your rook. 2. Bring the rook up to the 4th rank. 3. Walk your king out: when the enemy rook gives checks, block with your rook (that is the “bridge”), then the pawn queens." },
  },
  {
    id: 'philidor', titre: 'Position de Philidor : tenir la nulle', but: 'nulle', camp: 'b', limite: 20,
    fen: '3k4/8/8/3PK3/8/8/7R/r7 b - - 0 1',
    methode: 'Place ta Tour sur ta 3e rangée (la 6e vue des Blancs) : le roi adverse ne peut plus avancer. Dès que le pion avance sur cette rangée, va donner des échecs par derrière, de loin.',
    en: { titre: "Philidor position: hold the draw", methode: "Put your rook on your 3rd rank (the 6th from White’s side): the enemy king can no longer advance. As soon as the pawn steps onto that rank, give checks from behind, from far away." },
  },
];
