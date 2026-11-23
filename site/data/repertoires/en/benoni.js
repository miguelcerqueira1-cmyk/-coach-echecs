// English text of the « Benoni / Gambit Benko » lines (same ids as ../benoni.js).
// Moves in English notation (N, B, R, Q, K). Lines, evaluations and checks are NOT here:
// they come from the French file and from Stockfish (data/verification.json).
export default {
  'ben-moderne': {
    famille: 'Modern Benoni',
    nom: '3.d5 e6 4.Nc3 exd5 5.cxd5 d6 6.e4 g6',
    plan: 'Trade on d5 to get a queenside pawn majority (a7, b7, c5), then fianchetto, castle and …Re8 against e4. Plans: …Na6-c7, …a6 and …b5; sometimes the tactical …Nxe4 when the e4 pawn is poorly defended.',
    structure: 'Advanced White d5 pawn, Black d6 pawn; White majority in the centre (e4-e5), Black majority on the queenside (…b5).',
    cases: 'e4, e5 (to watch), b5',
    echanger: 'The g7 bishop for the c3 knight only if it wins e4',
    conserver: 'g7 bishop',
  },
  'ben-fianchetto': {
    famille: 'Modern Benoni',
    nom: '6.Nf3 g6 7.g3 (fianchetto)',
    plan: 'Against the White fianchetto, same development; …Ne4 (if possible) trades a knight, then …Nbd7, …a6 and …b5 on the queenside.',
    structure: 'White d5 pawn supported by the g2 bishop; Black plays on the queenside.',
    cases: 'e4, b5, c4',
    echanger: 'The e4 knight for the c3 knight',
    conserver: 'g7 bishop',
  },
  'ben-taimanov': {
    famille: 'Modern Benoni',
    nom: '6.e4 g6 7.f4 Bg7 8.Bb5+ Nfd7',
    plan: 'The most dangerous attack: against Bb5+, block with the f6 knight on d7 (not the bishop: e5 becomes very strong). Then castle, …Na6-b4 and …Re8 against e5.',
    structure: 'Threatening White pawns on e4/f4; Black blockades e5 with pieces.',
    cases: 'e5 (to blockade), b4, c4',
    echanger: 'The b4 knight for an active White piece',
    conserver: 'd7 knight (controls e5)',
  },
  'ben-cf3': {
    famille: 'Sidelines',
    nom: '3.Nf3 cxd4 4.Nxd4 e6',
    plan: 'If White does not push d5, trade on d4 then …e6 and …Bb4: you get a Symmetrical English type of position, with the pin on the c3 knight.',
    structure: 'Open centre, flexible Black pawns on d7/e6.',
    cases: 'c3 (pin), d5, e4',
    echanger: 'The b4 bishop for the c3 knight if it doubles White’s pawns',
    conserver: 'd7 pawn (…d5 break later)',
  },
  'benko-accepte': {
    famille: 'Benko Gambit',
    nom: '3…b5 4.cxb5 a6 5.bxa6 Bxa6',
    plan: 'A pawn given for lasting initiative: open a- and b-files for the rooks, g7 bishop on the long diagonal. Plans: …Qa5, …Rfb8, …Nb6; the pressure on a2 and b2 lasts into the endgame.',
    structure: 'A pawn down but open a/b-files; the White king has lost castling (Bxf1 Kxf1).',
    cases: 'a2, b2, a- and b-files',
    echanger: 'The a6 bishop for the f1 bishop (the White king can no longer castle)',
    conserver: 'g7 bishop',
  },
  'benko-refuse': {
    famille: 'Benko Gambit',
    nom: '4.cxb5 a6 5.e3 (pawn returned)',
    plan: 'If White does not take on a6, fianchetto and castle, then …axb5 and …Ba6: Black wins the pawn back or keeps the initiative on the queenside.',
    structure: 'White b5 pawn cut off from its neighbours; active g7 bishop.',
    cases: 'b5, a6, d5',
    echanger: 'The a6 bishop for the f1 bishop',
    conserver: 'g7 bishop',
  },
};
