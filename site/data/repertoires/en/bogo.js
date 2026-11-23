// English text of the « Défense bogo-indienne » lines (same ids as ../bogo.js).
// Moves in English notation (N, B, R, Q, K). Lines, evaluations and checks are NOT here:
// they come from the French file and from Stockfish (data/verification.json).
export default {
  'bogo-de7': {
    famille: '4.Bd2',
    nom: '4.Bd2 Qe7 5.g3 Nc6',
    plan: 'The queen protects the b4 bishop; …Nc6, …d6 and …e5 build a solid centre. After d5, the knight retreats to b8 to come back via a6 or d7; …a5 fixes the queenside.',
    structure: 'Closed centre (d5/e5); dark-squared bishops traded, good Black knights.',
    cases: 'e5, c5, a5',
    echanger: 'The b4 bishop for the d2 bishop',
    conserver: 'e5 pawn',
  },
  'bogo-fxd2': {
    famille: '4.Bd2',
    nom: '4.Bd2 Bxd2+ 5.Qxd2',
    plan: 'Trade bishops at once, castle and block with …d5: a solid Queen’s Gambit Declined position, with no bad dark-squared bishop to keep.',
    structure: 'Queen’s Gambit Declined structure (d5/e6); calm play.',
    cases: 'e4, d5, c4',
    echanger: 'The b4 bishop for the d2 bishop',
    conserver: 'd5 pawn',
    piege: 'Jumping to e4 attacks the queen, but after Qc2 the knight must be defended (…d5 or …f5). …Qf6 does not protect it: Qxe4 wins a piece.',
  },
  'bogo-a5': {
    famille: '4.Bd2',
    nom: '4.Bd2 a5 5.g3 d5',
    plan: '…a5 supports the b4 bishop (it can stay on b4 without being traded); then …d5, …Nbd7, …c6 and castle: a solid Closed Catalan.',
    structure: 'Black pawns on a5/c6/d5/e6; if Bxb4 …axb4, the a-file opens for the Black rook.',
    cases: 'b4, e4, c4',
    echanger: 'The b4 bishop only if White takes (…axb4)',
    conserver: 'd5 pawn',
  },
  'bogo-cbd2': {
    famille: '4.Nbd2',
    nom: '4.Nbd2 b6 5.a3 Bxd2+',
    plan: 'Against Nbd2 (which keeps the bishop pair), …b6 and …Bb7 control e4; after a3, trade on d2 and play …d6, …Nbd7 and …e5 against the two White bishops.',
    structure: 'White bishop pair; Black closes the centre to neutralise it.',
    cases: 'e4, e5, d6',
    echanger: 'The b4 bishop for the d2 knight',
    conserver: 'b7 bishop',
  },
  'bogo-fe7': {
    famille: '4.Bd2',
    nom: '4.Bd2 Be7 (retreat)',
    plan: 'Retreat the bishop to e7: the White d2 bishop is badly placed and must move again. You reach a Queen’s Gambit Declined where Black has gained a tempo.',
    structure: 'Queen’s Gambit Declined; White bishop that has lost a tempo (d2 then f4).',
    cases: 'd5, c5, e4',
    echanger: 'The d5 pawn for c4 at the right moment (…dxc4)',
    conserver: 'd5 pawn',
  },
};
