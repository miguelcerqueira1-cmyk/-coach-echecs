// Ajout ponctuel (2026-11-24) de vidéos YouTube trouvées par recherche web pour les répertoires
// qui n'en avaient pas. Chaque identifiant vient tel quel d'un résultat de recherche (jamais
// deviné) ; la chaîne est laissée à `null` : la CI (verify-videos.mjs, oEmbed) indique la vraie
// chaîne et le vrai titre, à reporter ensuite. N'ajoute rien aux fiches qui ont déjà des vidéos.
//   node scripts/ajout-videos-2026-11-24.mjs          → affiche le plan
//   node scripts/ajout-videos-2026-11-24.mjs --ecrire → modifie site/data/repertoires/*.js
import fs from 'node:fs';
import path from 'node:path';

const V = (id, titre, langue) => ({ url: `https://www.youtube.com/watch?v=${id}`, titre, chaine: null, langue, verifie: false, source: 'recherche web' });

const P = {
  pirc: [V('VI-jpSwp1zc', 'La DÉFENSE PIRC aux Échecs : Contre-attaquez Rapidement !', 'fr'), V('tX6Ym8AFplU', 'Chess Openings: Learn to Play the Pirc Defense!', 'en')],
  alekhine: [V('IzDJNLdAlos', 'Défense Alekhine [Présentation rapide]', 'fr'), V('lbMHf80bFb8', 'Alekhine Defense Opening Masterclass', 'en')],
  catalane: [V('dnBrQ7Oz64w', 'OUVERTURE CATALANE (découverte de la partie catalane)', 'fr'), V('eGkEKQpt3Zg', 'Learn the Catalan', 'en')],
  grunfeld: [V('0DPvL4lDPwk', 'Défense Grünfeld [Présentation rapide]', 'fr'), V('n7wI5Z--G0Q', 'Chess Openings: Learn to Play the Grunfeld Defense!', 'en')],
  dragonGiri: V('u1Jji8Z4YS0', 'HOW TO PLAY Sicilian Defense DRAGON Variation by Grandmaster Anish Giri', 'en'),
  dragonYougo: V('TCPfXd3L3FM', 'Sicilian Dragon Variation Plans and Pawn Structure, Yugoslav Attack (Chess Openings)', 'en'),
  francaise: V('vVz6xqqtP1U', 'LA DÉFENSE FRANÇAISE aux Échecs : Une Défense Solide avec les Noirs !', 'fr'),
  francaiseAvance: V('RC_L_EhQMU8', 'Défense Française variante d\'avance 1. e4 e6 2. d4 d5 3. e5 - Leçon d\'échecs', 'fr'),
  francaiseTarrasch: V('wV-6gYnR5Lk', 'Expliquez moi cette ouverture - La Tarrasch', 'fr'),
  najdorf: [V('7RX0Iq4bvOM', 'SICILIENNE NAJDORF: l\'ouverture appréciée des grands maîtres', 'fr'), V('qyfsb56Cy9g', 'HOW TO PLAY Sicilian Defense Najdorf Variation by Grandmaster Anish Giri', 'en')],
  najdorfAnglaise: V('wgGPke_l1H0', 'Sicilienne Najdorf "Attaque Anglaise"', 'fr'),
  benoni: [V('3NSjEZEeLzE', 'Echecs - Tout savoir sur la Defense Benoni - Stratégie', 'fr'), V('R3sT1d_npnQ', 'The Modern Benoni is No Baloney: Part 1 - Chess Openings Explained', 'en')],
  benko: [V('_bG3XLZPqbw', 'GAMBIT BENKO [Petite présentation + piège]', 'fr'), V('-qGlSDA4w6M', 'Chess Openings: Benko Gambit', 'en')],
  bogo: [V('mfe1Jb22VHM', 'Introduction to the Bogo-Indian Defense', 'en'), V('1cmNaYOXZII', 'How to play the Bogo-indian Defense', 'en')],
  contreLondres: [V('Gc5ZKOhNanA', 'How to Play Against The London', 'en'), V('7I8vBgNzvVw', 'My 3 Setups to Beat the London System', 'en')],
  ecossaise: [V('QRSg2GNkcRA', 'Répertoire blanc: introduction à l\'ouverture Écossaise', 'fr'), V('af8Air9_kKY', 'Scotch Game Basics - Main Lines, Ideas, Traps', 'en')],
  gambitEcossais: V('xjMYoxjqgms', 'Gambit écossais (1) : Partie d\'échecs pédagogique', 'fr'),
  hollandaise: V('cB2qK299FNQ', 'Défense hollandaise (1) : Partie d\'échecs pédagogique', 'fr'),
  leningrad: V('ukmYs93gey8', 'How to Play the Leningrad Dutch Defence', 'en'),
  stonewall: V('7DVRqdwnleQ', 'How to Play the Stonewall Dutch Defence', 'en'),
  estIndienne: [V('YN10K7hOm1I', 'La DÉFENSE EST-INDIENNE aux Échecs : Une Arme REDOUTABLE contre 1.d4 !', 'fr'), V('DlkMDRh4iKs', 'La défense Est-Indienne - Echecs leçon', 'fr')],
  nimzo: V('htNc9zFPdQs', 'Chess Openings: Nimzo-Indian Defense', 'en'),
  nimzoClassique: V('3SzZnyyWpIA', 'The Nimzo-Indian Defence, Classical Variation - Chess Openings Explained', 'en'),
  philidor: [V('tlNZ9Eurb3k', 'La défense Philidor (échecs débutant)', 'fr'), V('mAf-YuGPYMo', 'Philidor Defense - Chess Openings', 'en')],
  scandinave: [V('7HZcMHBz2X0', 'La défense Scandinave aux échecs', 'fr'), V('iTUWt25Z2e4', 'Défense Scandinave (par le GMI Christian Bauer) - Echecs ouverture', 'fr'), V('4Rrt0Lm176I', 'Chess Openings: Scandinavian Defense', 'en')],
  taimanov: [V('q-Mzn45iCeg', 'The Taimanov Sicilian explained by GM Pentala Harikrishna', 'en'), V('9Uxbb_lPGkk', 'Opening Basics #9: Sicilian defense - Taimanov and Kan variations', 'en')],
  alapinNoirs: V('dKqefFmq-qg', 'GM Sam Shankland Explains how to play the Alapin as Black', 'en'),
  grandPrix: V('y_nTGCFsrUc', 'The Grand Prix Attack against the Sicilian', 'en'),
  morra: [V('zgWTEOIQyHo', 'Le Gambit Morra', 'fr'), V('aydv_HHLry0', 'Smith-Morra Gambit: Chess Ideas and Model Games!!', 'en')],
  vienne: V('FV67KSxkJQw', 'The Vienna Game: Ideas, Principles and Common Variations · Chess Openings', 'en'),
  gambitViennois: V('jeuEDHDgIM4', 'Chess Openings: Vienna Gambit - Forgotten but Tricky!!', 'en'),
  contreAnglaise: [V('5-RMWPyyuUM', 'The English Opening: 1... e5 (Bc5 and Bb4)', 'en'), V('u6LKx4cpayM', 'Playing e5 against the English/c4 strategy', 'en')],
  contreReti: [V('46xrC53FaBc', 'Beat the Reti Opening', 'en'), V('6b9BLyJ2xf8', 'Reti Opening: COMPLETE Guide Against d5', 'en')],
  gdContre: V('-m_oNZnQoYI', 'Comment jouer contre le GAMBIT DAME?', 'fr'),
  // Déjà présente (avec sa chaîne confirmée) dans une fiche du Gambit Dame.
  fouC8: { url: 'https://www.youtube.com/watch?v=xZ6pb498C0s', titre: 'Pourquoi le Fou c8 est bloqué dans le gambit dame', chaine: 'Blitzstream Facile', langue: 'fr', verifie: true, source: 'recherche web' },
  e5Plans: V('rzipGOopnKA', '1. e4 e5 avec les noirs, sans théorie, que les plans à 1200 Elo |Parties pédagogiques', 'fr'),
  berlin: V('bdtGxUZANxs', 'Ruy Lopez - Berlin Defense ⎸Chess Openings', 'en'),
  espFermee: V('50Awfc3m6NI', 'Ruy Lopez - Closed Ruy Lopez ⎸Chess Openings', 'en'),
  espClassique: V('BXWdBp8qvpc', 'Ruy Lopez - Classical Defense', 'en'),
  espBird: V('cACtJz6PM28', 'Bird\'s Defense: Ruy Lopez Chess Opening', 'en'),
};

// Vidéos d'une fiche (sans vidéo) selon son répertoire, sa famille et son identifiant.
export function videosPour(e) {
  const f = e.famille || '';
  switch (e.rep) {
    case 'pirc': case 'alekhine': case 'catalane': case 'grunfeld': case 'philidor': case 'scandinave':
    case 'bogo': case 'contre-anglaise':
      return P[{ 'contre-anglaise': 'contreAnglaise' }[e.rep] || e.rep];
    case 'contre-reti': return P.contreReti;
    case 'contre-londres': return P.contreLondres;
    case 'smith-morra': return P.morra;
    case 'indienne-roi': return P.estIndienne;
    case 'dragon': return /yougoslave/i.test(f) ? [P.dragonGiri, P.dragonYougo] : [P.dragonGiri];
    case 'francaise': return [P.francaise, ...(/avance/i.test(f) ? [P.francaiseAvance] : []), ...(/Tarrasch/i.test(f) ? [P.francaiseTarrasch] : [])];
    case 'najdorf': return /Anti-sicilienne/.test(f) ? [] : [...P.najdorf, ...(/anglaise/i.test(f) ? [P.najdorfAnglaise] : [])];
    case 'benoni': return /Benko/i.test(f) ? P.benko : P.benoni;
    case 'ecossaise': return [...P.ecossaise, ...(/Gambit/i.test(f) ? [P.gambitEcossais] : [])];
    case 'hollandaise': return [P.hollandaise, ...(/Leningrad/.test(f) ? [P.leningrad] : []), ...(/Stonewall/.test(f) ? [P.stonewall] : [])];
    case 'viennoise': return [P.vienne, ...(/Gambit/i.test(f) ? [P.gambitViennois] : [])];
    case 'nimzo-qid':
      if (/nimzo/i.test(f)) return [P.nimzo, ...(e.id === 'nimzo-classique' ? [P.nimzoClassique] : [])];
      if (/Catalane/.test(f)) return [P.catalane[1]];
      return [];
    case 'sicilienne':
      if (/Taimanov/.test(f)) return P.taimanov;
      return { 'sic-alapin': [P.alapinNoirs], 'sic-grand-prix': [P.grandPrix], 'sic-morra': P.morra }[e.id] || [];
    case 'gdr-noirs':
      if (/Gambit Dame refusé/.test(f)) return [P.gdContre, P.fouC8];
      return e.id === 'gdrn-londres' ? P.contreLondres : [];
    case 'e5-noirs':
      return [P.e5Plans, ...({ 'e5-berlin': [P.berlin], 'e5-espagnole-fermee': [P.espFermee], 'e5-ecossaise': [P.ecossaise[1]], 'e5-viennoise': [P.vienne, P.gambitViennois] }[e.id] || [])];
    case 'espagnole':
      return { 'esp-cordel': [P.espClassique], 'esp-bird': [P.espBird], 'esp-marshall': [P.espFermee], 'esp-anti-marshall': [P.espFermee] }[e.id] || [];
    default: return [];
  }
}

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const lien = (l) => `        { url: ${q(l.url)}, titre: ${q(l.titre)}, chaine: ${l.chaine == null ? 'null' : q(l.chaine)}, langue: ${q(l.langue)}, verifie: ${l.verifie}, source: ${q(l.source)} },`;

const dir = 'site/data/repertoires';
const ecrire = process.argv.includes('--ecrire');
let total = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'meta.js')) {
  const p = path.join(dir, f);
  const fiches = (await import(path.resolve(p))).default;
  if (!Array.isArray(fiches)) continue;
  let src = fs.readFileSync(p, 'utf8');
  for (const e of fiches) {
    if (e.video?.liens?.length) continue;
    const vids = videosPour(e);
    if (!vids.length) continue;
    const i = src.indexOf(`id: '${e.id}'`);
    const fin = src.indexOf(`id: '`, i + 5);
    const zone = src.slice(i, fin === -1 ? undefined : fin);
    const m = zone.match(/video: \{ recherche: ((?:'(?:[^'\\]|\\.)*')|(?:"(?:[^"\\]|\\.)*")), url: null \}/);
    if (!m) { console.error(`✗ ${e.id} : bloc video introuvable`); process.exitCode = 1; continue; }
    const neuf = `video: { recherche: ${m[1]}, url: null,\n      liens: [\n${vids.map(lien).join('\n')}\n      ] }`;
    src = src.slice(0, i) + zone.replace(m[0], neuf) + (fin === -1 ? '' : src.slice(fin));
    total++;
    console.log(`${e.id.padEnd(26)} ${vids.map((v) => v.url.slice(-11)).join(' ')}`);
  }
  if (ecrire) fs.writeFileSync(p, src);
}
console.log(`${total} fiches ${ecrire ? 'complétées' : 'à compléter'}`);
