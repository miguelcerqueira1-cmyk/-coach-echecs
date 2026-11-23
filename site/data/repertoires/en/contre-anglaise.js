// English text of the « Contre l'Anglaise (1.c4 e5) » lines (same ids as ../contre-anglaise.js).
// Moves in English notation (N, B, R, Q, K). Lines, evaluations and checks are NOT here:
// they come from the French file and from Stockfish (data/verification.json).
export default {
  'ca-dragon-inverse': {
    famille: 'Reversed Dragon',
    nom: '2.Nc3 Nf6 3.g3 d5',
    plan: 'Take the centre with …d5, retreat the knight to b6 when attacked, then classical development (…Nc6, …Be7, castle, …Be6). Black has a solid e5 centre.',
    structure: 'Reversed Dragon Sicilian: Black e5 pawn, White g2 bishop on the long diagonal.',
    cases: 'e5, d4, the h1-a8 diagonal',
    echanger: 'The e6 bishop for a knight on d5',
    conserver: 'e5 pawn',
    punition: 'The b7 pawn looks undefended, but the c8 bishop protects it: Bxb7?? simply loses the bishop.',
  },
  'ca-fermee': {
    famille: 'Closed English',
    nom: '2.Nc3 Nc6 3.g3 g6',
    plan: 'Closed position: White attacks on the queenside (Rb1, b4-b5), Black on the kingside (…f5, …Nf6, castle, then …f4 or …g5).',
    structure: 'Black pawns on d6/e5/f5: space on the kingside; the d4 square is often occupied by a knight.',
    cases: 'd4, f4, e4',
    echanger: 'The g7 bishop only for an important piece',
    conserver: 'e5 pawn',
  },
  'ca-4cav': {
    famille: 'Four Knights',
    nom: '2.Nc3 Nf6 3.Nf3 Nc6 4.g3 Bb4',
    plan: 'The b4 bishop pins the c3 knight, then …e4 gains space. After Ng5, …Bxc3 and …Re8 defend e4; …e3 blocks White’s development.',
    structure: 'Black pawn advanced to e4 (then e3): space, and the d3/f3 squares are awkward for White.',
    cases: 'e4, d3, e3',
    echanger: 'The b4 bishop for the c3 knight',
    conserver: 'e4 pawn',
  },
  'ca-g3': {
    famille: 'Reversed Dragon',
    nom: '2.g3 Nf6 3.Bg2 d5',
    plan: 'The same plan against the immediate fianchetto: …Nf6 and …d5, retreat to b6, then …Nc6, …Be7 and castle.',
    structure: 'Black e5 pawn against the g2 bishop; Black has a pleasant centre.',
    cases: 'e5, d4, b6',
    echanger: 'Nothing forced',
    conserver: 'e5 pawn',
  },
  'ca-cf3': {
    famille: 'Sidelines',
    nom: '2.Nf3 e4 3.Nd4 Nc6',
    plan: 'Against 2.Nf3, push …e4 to chase the knight; after the trade on c6, Black has active pieces and the open d-file.',
    structure: 'Advanced Black e4 pawn, doubled c-pawns but easy development.',
    cases: 'e4, d3, d-file',
    echanger: 'The c6 knight for the d4 knight',
    conserver: 'e4 pawn',
  },
};
