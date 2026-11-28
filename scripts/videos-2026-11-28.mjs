// Vidéos trouvées par recherche web le 2026-11-28 (identifiants copiés tels quels des résultats,
// jamais devinés), par fiche : [identifiant, titre affiché dans le résultat, langue].
// Titre et chaîne sont confirmés ensuite par oEmbed en CI (verify-videos.mjs --json).
const petrov = ['DyDVQPwk6fY', 'Chess Openings: Petrov Defense', 'en'];
const elephant = ['S8fEZJuBMkI', 'Watch Out for The Elephant Gambit!', 'en'];
const letton = [['2flPdsk9uz4', 'Chess Openings: Latvian Gambit', 'en'], ['zV3no3AK_P0', 'Chess For Beginners: Annihilating The Latvian Gambit', 'en']];
const deuxCav = ['NKI-7UwuGTM', 'The Two Knights Defense', 'en'];
const fermee = [['5bsKlnGLI7g', 'Closed Sicilian: Ideas, Principles and Common Variations · Chess Openings', 'en'], ['vYtXb1Fl7NU', 'The Closed Sicilian explained by GM Alex Colovic', 'en']];
const moscou = ['XI9_mUSzAF4', 'The Moscow Variation of the Sicilian (3.Bb5+)', 'en'];
const rossolimo = ['TIQ9-8xp5II', 'Opening Basics #7: Sicilian defense - Rossolimo and related variations', 'en'];
const kia = ['yVEq05yABzw', 'How to play the KIA Sicilian', 'en'];
const colle = ['FN7xJhjCxkY', 'The Colle System - Plans, Structures, Patterns, Variations · Chess Openings', 'en'];
const torre = [['xbUgaJGb5Ps', 'The Torre Attack - Plans, Structures, Patterns, Variations · Chess Openings', 'en'], ['mvsiaWzHFyk', 'Magnus Carlsen Teaches How to Beat the Torre Attack', 'en']];
const jobava = [['8o5UitW0bRM', 'Introduction to the Jobava London System', 'en'], ['sBJzmRqfbWo', 'Fighting Annoying Jobava London System!!', 'en']];
const qid = [['9Jt3AypZ59c', 'Introduction to the Queen’s Indian Defense · Chess Openings', 'en'], ['1cdvhAziDTg', 'Queen’s Indian Defense Main Line · Chess Openings', 'en']];
const cozio = ['CScN9zlPuXc', 'Ruy Lopez, Cozio Defense · Complete Chess Openings', 'en'];
export default {
  'ita-petrov': [petrov], 'esp-petrov': [petrov], 'eco-petrov': [petrov],
  'ita-elephant': [elephant], 'esp-elephant': [elephant], 'eco-elephant': [elephant],
  'ita-letton': letton, 'esp-letton': letton, 'eco-letton': letton,
  'ita-deux-cavaliers-d4': [deuxCav], 'ita-deux-cavaliers-d3': [deuxCav], 'ita-dc-cg5-fd7': [deuxCav], 'e5-dc-d3': [deuxCav],
  'ita-traxler': [['te4yVda5mhI', 'Chess Openings: Traxler Counter Attack', 'en']],
  'ita-moller': [['C0ArOkXBG5Q', 'Chess Openings: Giuoco Piano / Moeller attack', 'en']],
  'esp-steinitz': [['FNRh5E1Ocqg', 'Ruy Lopez, (Old) Steinitz Defense · Complete Chess Openings', 'en']],
  'esp-schliemann': [['ne67RDbXVsU', 'Ruy Lopez - Schliemann Defense', 'en']],
  'esp-arkhangelsk': [['gf-5PDa619E', 'Ruy Lopez - Archangel (Arkhangelsk) Variation ⎸Chess Openings', 'en']],
  'esp-moller': [['wxeIrtY5Onw', 'Ruy Lopez - ...a6 with ...Bc5 Variations', 'en']],
  'esp-cozio': [cozio], 'esp-cozio-differee': [cozio],
  'esp-norvegienne': [['l9egatXy9Dk', 'Ruy Lopez - Norwegian Defense', 'en']],
  'esp-smyslov': [['4gLWs4rWCIo', 'Ruy Lopez, Fianchetto Defense · Complete Chess Openings', 'en']],
  'e5-quatre-cavaliers': [['EmuVOf5RmzU', 'Four Knights Game: Spanish Variation (4. Bb5)', 'en']],
  'e5-fou-c4': [['CmZKgWY--L8', 'Bishop\'s Opening Explained in 15 Minutes [Crash Course]', 'en']],
  'e5-centre': [['4ArTPSjSJbs', 'Center Game Full Guide for beginners(Key ideas,Best traps, Main Variations)', 'en']],
  'e5-goring': [['20bcUsEPPTI', 'A Shot of Scotch #4: Göring Gambit', 'en']],
  'sic-wing': [['9HRdGZlfZYY', 'Partie n°22 Blancs: Gambit de l\'aile sur la sicilienne: 1.e4 c5 2.b4!? et miniature!', 'fr'], ['NkD12gJcbO4', 'GM Analysis #9: Williams vs Dragun: Sicilian Wing Gambit 2 b4!?', 'en']],
  'sic-bowdler': [['NOp-Xkfxkxc', 'Jouer contre l\'attaque Bowdler', 'fr'], ['WiSu6wSd4l8', 'Quickly Crush The Dubious Bowdler Attack!!', 'en']],
  'sic-est-indienne': [kia], 'sic-g3': [kia],
  'sic-fb5': [rossolimo], 'sic-cc3-fb5': [rossolimo],
  'sic-fermee': fermee, 'naj-fermee': fermee, 'drg-fermee': fermee,
  'naj-moscou': [moscou], 'drg-moscou': [moscou],
  // vT4FQsKzX2A (Chekhover) retirée : oEmbed « restreinte » le 2026-11-28.
  'gdrn-colle': [colle], 'nq-colle': [colle],
  'gdrn-torre': torre, 'nq-torre': torre,
  'gdrn-jobava': jobava, 'nq-jobava': jobava,
  'nq-trompowsky': [['2fQdICXQvks', 'Introduction to the Trompowsky Attack · Plans, Ideas, Structures and Common Variations', 'en']],
  'qid-principale': qid, 'qid-petrossian': qid,
};
