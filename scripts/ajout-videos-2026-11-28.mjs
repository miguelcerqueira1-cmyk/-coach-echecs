// Ajout (2026-11-28) de vidéos aux fiches qui n'en ont pas.
// Étape 1 : vidéos DÉJÀ présentes dans d'autres fiches et déjà confirmées par oEmbed (verifie: true,
// chaîne connue), reprises telles quelles quand elles traitent de l'ouverture ou de la variante.
// Étape 2 : vidéos trouvées par recherche web (identifiant tel quel, jamais deviné), ajoutées avec
// `chaine: null, verifie: false` ; la CI (verify-videos.mjs --json) confirme titre et chaîne.
// N'ajoute rien aux fiches qui ont déjà des vidéos.
//   node scripts/ajout-videos-2026-11-28.mjs          → affiche le plan
//   node scripts/ajout-videos-2026-11-28.mjs --ecrire → modifie site/data/repertoires/*.js
import fs from 'node:fs';
import path from 'node:path';
import { LIGNES } from '../site/data/repertoire.js';

// Vidéos déjà vérifiées, indexées par identifiant (liens sans &t= seulement).
const EX = new Map();
for (const e of LIGNES) for (const l of e.video?.liens || []) {
  const m = l.url.match(/[?&]v=([\w-]{11})$/);
  if (m && l.verifie && l.chaine && !EX.has(m[1])) EX.set(m[1], l);
}
const X = (...ids) => ids.map((id) => { const l = EX.get(id); if (!l) throw new Error('vidéo inconnue ' + id); return l; });
const V = (id, titre, langue) => ({ url: `https://www.youtube.com/watch?v=${id}`, titre, chaine: null, langue, verifie: false, source: 'recherche web' });
let NOUVELLES = {};
try { NOUVELLES = (await import('./videos-2026-11-28.mjs')).default; } catch { /* étape 2 pas encore écrite */ }
const N = (k) => (NOUVELLES[k] || []).map(([id, titre, langue]) => V(id, titre, langue));

const P = {
  anglaise: X('3aedSwUI9UU'), catalane: X('dnBrQ7Oz64w', 'eGkEKQpt3Zg'), nimzo: X('htNc9zFPdQs'),
  kid: X('YN10K7hOm1I', 'DlkMDRh4iKs'), francaise: X('vVz6xqqtP1U'), avanceFr: X('RC_L_EhQMU8'), tarrasch: X('wV-6gYnR5Lk'),
  scand: X('7HZcMHBz2X0', '4Rrt0Lm176I'), pirc: X('VI-jpSwp1zc', 'tX6Ym8AFplU'), alekhine: X('IzDJNLdAlos', 'lbMHf80bFb8'),
  philidor: X('tlNZ9Eurb3k', 'mAf-YuGPYMo'), legal: X('rtC6XhBLtqs'), vienne: X('FV67KSxkJQw'), gambitViennois: X('jeuEDHDgIM4'),
  ecossaise: X('QRSg2GNkcRA', 'af8Air9_kKY'), gambitEcossais: X('xjMYoxjqgms'), e5Plans: X('rzipGOopnKA'),
  najdorf: X('7RX0Iq4bvOM', 'qyfsb56Cy9g'), dragon: X('u1Jji8Z4YS0'), yougo: X('TCPfXd3L3FM'),
  grandPrix: X('y_nTGCFsrUc'), alapin: X('dKqefFmq-qg'), morra: X('zgWTEOIQyHo', 'aydv_HHLry0'), taimanov: X('q-Mzn45iCeg', '9Uxbb_lPGkk'),
  grunfeld: X('0DPvL4lDPwk', 'n7wI5Z--G0Q'), benoni: X('3NSjEZEeLzE', 'R3sT1d_npnQ'), benko: X('_bG3XLZPqbw', '-qGlSDA4w6M'),
  bogo: X('mfe1Jb22VHM', '1cmNaYOXZII'), hollandaise: X('cB2qK299FNQ'), leningrad: X('ukmYs93gey8'),
  contreLondres: X('Gc5ZKOhNanA', '7I8vBgNzvVw'), contreAnglaise: X('5-RMWPyyuUM', 'u6LKx4cpayM'), contreReti: X('46xrC53FaBc', '6b9BLyJ2xf8'),
  slave: X('U1A2fGvilsU'), slaveEchange: X('Cw5wQQT6iZg'), semiSlave: X('AdiwIMRwPSk'), ragozine: X('6oRtSS4lENo'),
  semiTarrasch: X('KNg5A_XZGfY'), gda: X('DXPrQwSRiBw'), marshallGambit: X('Lvi3O2HknCQ'), gdContre: X('-m_oNZnQoYI', 'xZ6pb498C0s'),
  londres: X('S_OYdWbJMKM'), londresD5: X('9z0NuNeDU6M'), londresKid: X('8riYW7EC1lQ'), londresQid: X('3ZOcEWKPSOc'),
  espEchange: X('W72Vw-DxvA0'), berlin: X('eM1yKnw2g2w', 'eFzZYlsYMhE'), espFermee: X('50Awfc3m6NI', 'AUKqRZanVQ8'),
  pianissimo: X('9Q2oa73y5PU'), giuoco: X('4x5Y62g4UhI'), polerio: [], ckAvance: X('PiMswlCna_k'), bdg: X('54aTSbPQIHI'),
};
const ID = (id, ...l) => [id, l.flat()];
const PAR_ID = new Map([
  // Gambit Dame refusé / Slave (Noirs)
  ...['gdrn-slave', 'gdrn-slave-e3', 'gdrn-slave-g3', 'gdrn-slave-dc2'].map((i) => ID(i, P.slave)),
  ID('gdrn-slave-echange', P.slaveEchange, P.slave), ID('gdrn-slave-cxd5', P.slaveEchange, P.slave), ID('gdrn-semi-slave', P.semiSlave),
  ID('gdrn-cf3-orthodoxe', P.gdContre), ID('gdrn-cf3-cf6', P.gdContre), ID('gdrn-cc3-ff4', P.gdContre), ID('gdrn-cf3-ff4', P.gdContre),
  ID('gdrn-catalane', P.catalane), ID('gdrn-londres-cf3', P.contreLondres), ID('gdrn-bdg', N('bdg'), P.bdg),
  // Contre 1.Cf3
  ...['cr-slave', 'cr-slave-d4', 'cr-slave-e3', 'cr-slave-g3', 'cr-slave-dc2'].map((i) => ID(i, P.slave)),
  ID('cr-slave-cxd5', P.slaveEchange, P.slave), ID('cr-londres', P.contreLondres),
  // Anglaise
  ID('ang-ragozine', P.ragozine, P.anglaise), ID('ang-semi-slave', P.semiSlave, P.anglaise), ID('ang-semi-tarrasch', P.semiTarrasch, P.anglaise),
  ID('ang-dxc4', P.gda, P.anglaise), ID('ang-e6-c6', P.marshallGambit, P.anglaise), ID('ang-gd', P.anglaise),
  // Anti-siciliennes (Najdorf, Dragon)
  ...['naj', 'drg'].flatMap((r) => [ID(`${r}-grand-prix`, P.grandPrix), ID(`${r}-alapin`, P.alapin), ID(`${r}-morra`, P.morra)]),
  ID('sic-alapin-cf3', P.alapin), ID('drg-dd2-cg4', P.dragon, P.yougo), ID('drg-10cxc6', P.dragon, P.yougo),
  // 1…e5 et ouvertures ouvertes
  ID('e5-esp-echange', P.espEchange, P.e5Plans), ID('esp-echange-df6', P.espEchange), ID('esp-anti-marshall-b4', P.espFermee),
  ID('e5-berlin-d3', P.berlin, P.e5Plans), ID('e5-berlin-te1', P.berlin, P.e5Plans), ID('e5-esp-d3', P.espFermee, P.e5Plans),
  ID('e5-ita-d3', P.pianissimo, P.e5Plans), ID('e5-ita-d4', P.giuoco, P.e5Plans), ID('e5-vienne-fc4', P.vienne, P.e5Plans),
  ID('e5-gambit-ecossais', P.gambitEcossais, P.e5Plans), ID('e5-quatre-cav-ecossais', P.ecossaise, P.e5Plans),
  ID('ita-pianissimo-a5', P.pianissimo), ID('ita-dc-d3-fc5', P.pianissimo), ID('ita-dc-d3-h6', P.pianissimo), ID('ita-giuoco-d6', P.giuoco),
  ...['ita-philidor', 'esp-philidor', 'eco-philidor'].map((i) => ID(i, P.philidor, P.legal)),
  ID('eco-gambit-cf6', P.gambitEcossais, P.ecossaise),
  // Londres (Blancs)
  ID('lon-moderne', P.londresKid, P.londres), ID('lon-d6', P.londresKid, P.londres), ID('lon-b6', P.londresQid, P.londres),
  ID('lon-e6', P.londresQid, P.londres), ID('lon-slave-db6', P.londresD5, P.londres), ID('lon-c6', P.londresD5, P.londres),
  ID('ita-moller', P.giuoco), ID('esp-arche', X('ydMe19P7dR8', 'W7RD4QZ8VPI')), ID('esp-d6-fg4', P.espFermee),
  ID('lon-cc6-e5', X('z43Nz5-bU6E'), P.londres), ID('lon-gambit-e5', P.londresD5, P.londres), ID('lon-c5-direct', P.londresD5, P.londres),
  ID('lon-fd6', P.londresD5, P.londres), ID('lon-ch5', P.londresD5, P.londres), ID('lon-cxd4', P.londresD5, P.londres),
  ID('lon-hollandaise', P.londres), ID('lon-benoni', P.londres), ID('lon-db6-tb1', P.londres),
  ID('sic-c3', P.alapin), ID('nq-londres', P.contreLondres),
  // Caro-Kann
  ID('ck-avance-fd3', P.ckAvance), ID('ck-avance-fe3', P.ckAvance),
]);

// Vidéos d'une fiche sans vidéo.
export function videosPour(e) {
  const nouv = N(e.id);
  if (PAR_ID.has(e.id)) return [...nouv, ...PAR_ID.get(e.id)];
  const f = e.famille || '';
  const parRep = {
    anglaise: P.anglaise, catalane: P.catalane, 'indienne-roi': P.kid, scandinave: P.scand, pirc: P.pirc, alekhine: P.alekhine,
    philidor: P.philidor, viennoise: P.vienne, ecossaise: P.ecossaise, grunfeld: P.grunfeld, bogo: P.bogo,
    'contre-londres': P.contreLondres, 'contre-anglaise': P.contreAnglaise, 'contre-reti': P.contreReti, 'smith-morra': P.morra,
    francaise: [...P.francaise, ...(/avance/i.test(f) ? P.avanceFr : []), ...(/Tarrasch/i.test(e.nom + f) ? P.tarrasch : [])],
    benoni: /Benko/i.test(f) ? P.benko : P.benoni,
    hollandaise: [...P.hollandaise, ...(/Leningrad/.test(f) ? P.leningrad : [])],
    dragon: /Attaque yougoslave/.test(f) ? [...P.dragon, ...P.yougo] : /Déviations|Variante classique/.test(f) ? P.dragon : [],
    najdorf: /Najdorf/.test(f) ? P.najdorf : [],
    sicilienne: /Taimanov/.test(f) ? P.taimanov : [],
    'nimzo-qid': /Catalane/.test(f) ? P.catalane : /Nimzo/i.test(f) ? P.nimzo : [],
  }[e.rep] || [];
  // Les vidéos d'ouverture viennent après les vidéos ciblées.
  const vus = new Set(); return [...nouv, ...parRep].filter((v) => !vus.has(v.url) && vus.add(v.url));
}

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const lien = (l) => `        { url: ${q(l.url)}, titre: ${q(l.titre)}, chaine: ${l.chaine == null ? 'null' : q(l.chaine)}, langue: ${q(l.langue)}, verifie: ${l.verifie}, source: ${q(l.source)} },`;

const dir = 'site/data/repertoires';
const ecrire = process.argv.includes('--ecrire');
let total = 0; const sans = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'meta.js')) {
  const p = path.join(dir, f);
  const fiches = (await import(path.resolve(p))).default;
  if (!Array.isArray(fiches)) continue;
  let src = fs.readFileSync(p, 'utf8');
  for (const e of fiches) {
    if (e.video?.liens?.length) continue;
    const vids = videosPour(e);
    if (!vids.length) { sans.push(e.id); continue; }
    const i = src.indexOf(`id: '${e.id}'`);
    const fin = src.indexOf(`id: '`, i + 5);
    const zone = src.slice(i, fin === -1 ? undefined : fin);
    const m = zone.match(/video: \{ recherche: ((?:'(?:[^'\\]|\\.)*')|(?:"(?:[^"\\]|\\.)*")), url: null \}/);
    if (!m) { console.error(`✗ ${e.id} : bloc video introuvable`); process.exitCode = 1; continue; }
    const neuf = `video: { recherche: ${m[1]}, url: null,\n      liens: [\n${vids.map(lien).join('\n')}\n      ] }`;
    src = src.slice(0, i) + zone.replace(m[0], neuf) + (fin === -1 ? '' : src.slice(fin));
    total++;
    if (!ecrire) console.log(`${e.id.padEnd(26)} ${vids.map((v) => v.url.slice(-11) + (v.verifie ? '' : '*')).join(' ')}`);
  }
  if (ecrire) fs.writeFileSync(p, src);
}
console.log(`${total} fiches ${ecrire ? 'complétées' : 'à compléter'} ; restent sans vidéo (${sans.length}) : ${sans.join(' ')}`);
