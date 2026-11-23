// English text of the « Défense hollandaise » lines (same ids as ../hollandaise.js).
// Moves in English notation (N, B, R, Q, K). Lines, evaluations and checks are NOT here:
// they come from the French file and from Stockfish (data/verification.json).
export default {
  'hol-leningrad': {
    famille: 'Leningrad',
    nom: 'Leningrad 2.g3 Nf6 3.Bg2 g6',
    plan: 'Fianchetto the bishop on g7, castle, …d6 then …Qe8 and …e5: the central break frees the game and opens the diagonal of the g7 bishop.',
    structure: 'Pawns on f5/d6, a powerful g7 bishop; Black aims for e5 and the kingside.',
    cases: 'e5 (break), e4, h5',
    echanger: 'The f6 knight for a White knight arriving on d5',
    conserver: 'g7 bishop',
  },
  'hol-stonewall': {
    famille: 'Stonewall',
    nom: 'Stonewall …e6, …d5, …c6',
    plan: 'Pawn wall c6/d5/e6/f5: the knight settles on e4, the d6 bishop eyes h2, then a kingside attack (…g5, …Rh6). Weakness to watch: the e5 square and the c8 bishop.',
    structure: 'Stonewall: strong e4 square for Black, weak e5 square; the c8 bishop often comes out via …b6/…Bb7 or …Bd7-e8-h5.',
    cases: 'e4 (outpost), e5 (hole), h2',
    echanger: 'The d6 bishop for White’s dark-squared bishop',
    conserver: 'e4 knight',
  },
  'hol-staunton': {
    famille: 'Staunton Gambit',
    nom: 'Staunton Gambit 2.e4 fxe4',
    plan: 'Take the e4 pawn and keep it with pieces (…Nf6, …Nc6); against d5, the knight goes via e5 and f7 to protect the king and e5.',
    structure: 'An extra Black pawn on e4; White has development and aims at the kingside.',
    cases: 'e4 (extra pawn), f7, h7',
    echanger: 'The g5 bishop for the f6 knight if useful',
    conserver: 'e4 pawn',
  },
  'hol-fg5': {
    famille: 'Sidelines',
    nom: '2.Bg5 h6 3.Bh4 g5',
    plan: 'Chase the bishop (…h6, …g5) then develop normally with …Nf6 and …d6. The Black king stays exposed: do not play …f4 and …h5 without calculating.',
    structure: 'Advanced Black kingside (pawns g5, h6, f5): space, but weak squares around the king.',
    piege: 'Trying to trap the g3 bishop with …f4 and …h5 is tempting, but …Rh6 opens the e8-h5 diagonal: queen sacrifice on h5 and Bg6 is mate!',
    cases: 'e8-h5 (the king’s diagonal), g6, h5',
    echanger: 'The f6 knight for the g3 bishop if White traps it',
    conserver: 'King safety',
  },
  'hol-cc3': {
    famille: 'Sidelines',
    nom: '2.Nc3 d5 3.Bf4',
    plan: 'Against 2.Nc3, which prepares e4, block with …d5 and go into a Stonewall: …Nf6, …e6, …Bd6 to trade the f4 bishop.',
    structure: 'Stonewall structure (d5/e6/f5): Black holds e4.',
    cases: 'e4, e5, d6',
    echanger: 'The d6 bishop for the f4 bishop',
    conserver: 'd5 pawn',
  },
};
