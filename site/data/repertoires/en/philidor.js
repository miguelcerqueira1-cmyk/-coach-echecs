// English text of the « Défense Philidor » lines (same ids as ../philidor.js).
// Moves in English notation (N, B, R, Q, K). Lines, evaluations and checks are NOT here:
// they come from the French file and from Stockfish (data/verification.json).
export default {
  'phi-hanham': {
    famille: 'Hanham Variation',
    nom: '3.d4 Nf6 4.Nc3 Nbd7',
    plan: 'Keep the e5 pawn with …Nf6 then …Nbd7 (in that order: it guards against dxe5). Then …Be7, castle, …c6 and …Qc7; later …b5 or …exd4 followed by …d5.',
    structure: 'Solid closed centre (pawns on d6/e5); cramped position but no weakness.',
    cases: 'f7 (to protect), e5, d5',
    echanger: 'Nothing urgent',
    conserver: 'e5 pawn',
    piege: 'With …Nd7 played BEFORE …Nf6, the f7 pawn is poorly protected: after dxe5, Qd5 attacks f7 with the queen and the c4 bishop. White wins at least a pawn with a crushing position.',
  },
  'phi-exd4': {
    famille: 'Exchange Variation',
    nom: '3.d4 exd4 4.Nxd4 Nf6',
    plan: 'Give up the centre for active play: …Nf6, …Be7, castle, then …Re8, …Bf8 and the …d5 break, or …b5 against White’s queenside castling.',
    structure: 'Black d6 pawn against White e4: a Scheveningen Sicilian structure without the c-pawn.',
    cases: 'e4 (target), d5 (break), b5',
    echanger: 'The c6 knight for the d4 knight',
    conserver: 'e7 bishop',
  },
  'phi-fc4': {
    famille: 'Sidelines',
    nom: '3.Bc4 Be7',
    plan: 'Against the c4 bishop, …Be7 and …Nf6 protect the king; after d4, take then castle. The tactical …Nxe4 followed by …d5 is possible if the c4 bishop can be attacked.',
    structure: 'Open position, normal development.',
    cases: 'f7, e5, d5',
    echanger: 'Nothing',
    conserver: 'e7 bishop (protects the king)',
    piege: 'Legal’s Mate: pinning the f3 knight with …Bg4 without protecting e5 allows Nxe5! Taking the queen (…Bxd1) leads to mate with Bxf7+ and Nd5#. Black had to recapture on e5 (…dxe5) and accept losing a pawn.',
  },
  'phi-dxe5': {
    famille: 'Sidelines',
    nom: '3.d4 Nf6 4.dxe5 Nxe4 5.Qd5',
    plan: 'If White takes on e5 at once, …Nxe4 wins the pawn back; against Qd5 (threatening f7), …Nc5 defends, then …Be7 and …Qxd6. White keeps a small lead in development: play simply.',
    structure: 'Open centre; queens often traded early.',
    cases: 'f7, c5, d6',
    echanger: 'The queens (…Qxd6 then trade)',
    conserver: 'c5 knight',
  },
  'phi-cc3': {
    famille: 'Hanham Variation',
    nom: '3.Nc3 Nf6 4.d4 Nbd7',
    plan: 'The same Hanham structure through another move order: …Nf6, …Nbd7, …Be7, castle, then …c6 and …Qc7.',
    structure: 'Solid d6/e5 pawns; Black waits for the right moment for …b5 or …exd4.',
    cases: 'e5, f7, b5',
    echanger: 'Nothing urgent',
    conserver: 'e5 pawn',
  },
};
