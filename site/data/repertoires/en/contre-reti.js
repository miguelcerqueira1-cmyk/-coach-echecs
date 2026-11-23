// English text of the « Contre 1.Cf3 (Réti) » lines (same ids as ../contre-reti.js).
// Moves in English notation (N, B, R, Q, K). Lines, evaluations and checks are NOT here:
// they come from the French file and from Stockfish (data/verification.json).
export default {
  'cr-kia': {
    famille: 'King’s Indian Attack (KIA)',
    nom: '2.g3 Nf6 3.Bg2 c6 4.O-O Bg4',
    plan: 'Against the fianchetto + d3 + e4 system, build a solid centre (…c6, …d5, …e5), bring the bishop out to g4 before closing with …e6, then castle.',
    structure: 'Black centre c6/e5 against White e4; the g4 bishop bothers the f3 knight.',
    cases: 'e5, d4, g4',
    echanger: 'The g4 bishop for the f3 knight if useful',
    conserver: 'e5 pawn',
  },
  'cr-reti-b3': {
    famille: 'Réti 2.c4',
    nom: '2.c4 c6 3.b3 Nf6 4.g3 Bf5',
    plan: 'Against the double-fianchetto Réti: the …c6/…d5 structure, the c8 bishop out to f5 BEFORE …e6, then …Nbd7, …Be7 and castle. Solid, risk-free position.',
    structure: 'Slav structure; active f5 bishop, no bad bishop.',
    cases: 'd5, e4, c5',
    echanger: 'Nothing forced',
    conserver: 'd5 pawn',
  },
  'cr-echange': {
    famille: 'Réti 2.c4',
    nom: '2.c4 c6 3.cxd5 cxd5',
    plan: 'After the trade on d5, you reach an Exchange Slav: symmetrical development (…Nf6, …Nc6, …Bf5 or …Bg4, …e6), balanced position.',
    structure: 'Symmetrical structure, open c-file.',
    cases: 'c-file, e4, b4',
    echanger: 'The rooks on the c-file',
    conserver: 'd5 pawn',
  },
  'cr-e3': {
    famille: 'Réti 2.c4',
    nom: '2.c4 c6 3.e3 Nf6 4.Nc3 e6',
    plan: 'Against the Réti with e3, a Semi-Slav structure: …Nf6, …e6, …Nbd7, …Bd6, then castle and …e5 to free the game.',
    structure: 'Black pawns on c6/d5/e6; the …e5 break is the main plan.',
    cases: 'e5 (break), e4, c4',
    echanger: 'The d5 pawn for c4 (…dxc4) once the White bishop has already moved',
    conserver: 'd6 bishop',
  },
  'cr-d4': {
    famille: 'Sidelines',
    nom: '2.d4 Nf6 3.e3 Bf5',
    plan: 'Against the Colle System (e3, Bd3), bring the bishop out to f5 to trade it for the d3 bishop: White’s best attacker disappears.',
    structure: 'Doubled f-pawns but control of e4; solid position.',
    cases: 'e4, f5, d5',
    echanger: 'The f5 bishop for the d3 bishop',
    conserver: 'd5 pawn',
  },
  'cr-b3': {
    famille: 'Sidelines',
    nom: '2.b3 Bg4 (Nimzo-Larsen)',
    plan: 'Against the queenside fianchetto, the g4 bishop pins the f3 knight; …Nbd7, …Ngf6 and …e6: solid centre, then …c6 and …Bd6.',
    structure: 'Black d5 pawn, White b2 bishop aiming at e5: Black watches e5 with …Nd7.',
    cases: 'e5, e4, h5',
    echanger: 'The h5 bishop for the f3 knight if useful',
    conserver: 'd5 pawn',
  },
};
