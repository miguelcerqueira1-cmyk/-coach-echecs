// Reconnaissance locale de l'ouverture, coup par coup (aucun appel réseau ni IA).
// Données : site/data/ouvertures.json, produit par scripts/ouvertures-site.mjs depuis la base ECO
// CC0 (lichess-org/chess-openings) et les fiches du répertoire :
//   eco  : clé de position → [code ECO, nom anglais officiel]
//   pos  : clé de position → indices de fiches dont la ligne principale passe par cette position
//   err  : clé de position → [[indice de fiche, 'p' | 't', coup qui réfute (UCI), demi-coup fautif]]
//          ('p' = punition d'une erreur adverse, 't' = piège : erreur du camp de la fiche,
//           'd' = coup douteux « ?! » de la ligne principale d'une fiche, suivi de la réponse de la fiche)
//   fiches : [id, rep, nom (français), couleur du répertoire, nom anglais]
// Une clé = empreinte de la position (placement, trait, roques ; la prise en passant est ignorée).

// Empreinte sur 48 bits (deux FNV-1a 32 bits) : collisions négligeables pour ≈ 12 000 positions.
export function cle(fen) {
  const s = fen.split(' ').slice(0, 3).join(' ');
  let a = 2166136261, b = 0x811c9dc5 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a ^= c; a = Math.imul(a, 16777619);
    b ^= c; b = Math.imul(b, 0x01000193) ^ (b >>> 13);
  }
  return (a >>> 0).toString(36) + '.' + ((b >>> 0) & 0xffff).toString(36);
}

// Analyse d'une suite de positions (fens[0] = départ, fens[i] = après le demi-coup i).
// sans[i] = coup SAN du demi-coup i+1 (anglais). Renvoie :
//   nom      : { eco, name, ply } ouverture nommée la plus profonde atteinte (transpositions comprises)
//   connu    : dernier demi-coup dont la position est connue (base ECO ou fiche)
//   sortie   : { ply, san } premier coup hors des lignes connues (null si toujours dans la théorie)
//   fiche    : { idx, ply } fiche la plus avancée qui passe par une position atteinte
//   erreur   : { idx, kind, refute, liste, ply, trouvee } erreur connue d'une fiche jouée au dernier ou à
//              l'avant-dernier demi-coup ; liste = toutes les réfutations connues (une par fiche) ;
//              trouvee = une réfutation a été jouée (true/false ; null si c'est le dernier coup)
export function reconnaitre(data, fens, sans = []) {
  const n = fens.length - 1;
  let nom = null, connu = 0, fiche = null, erreur = null;
  const keys = fens.map(cle);
  for (let i = 0; i <= n; i++) {
    const k = keys[i];
    const e = data.eco[k];
    if (e) nom = { eco: e[0], name: e[1], ply: i };
    const p = data.pos[k];
    if (e || p || data.err[k]) connu = i;
    if (p && i > 0) fiche = { idx: p, ply: i };
  }
  for (const i of [n, n - 1]) {
    if (i < 1 || !data.err[keys[i]]) continue;
    // Plusieurs fiches peuvent réfuter la même erreur (réfutations différentes, toutes vérifiées).
    const liste = data.err[keys[i]].map(([idx, kind, refute]) => ({ idx, kind, refute }));
    const joue = i === n ? null : uciDe(fens[i], fens[i + 1]);
    const bonne = joue && liste.find((x) => x.refute === joue);
    const trouvee = i === n ? null : !!bonne;
    erreur = { ...(bonne || liste[0]), liste, ply: i, trouvee };
    break;
  }
  // La sortie n'est signalée que si on était dans la théorie au moins un coup (pas depuis une FEN inconnue).
  const sortie = connu < n && (connu > 0 || data.eco[keys[0]] || n === 0) ? { ply: connu + 1, san: sans[connu] ?? null } : null;
  return { nom, connu, sortie, fiche, erreur };
}

// Coup UCI qui mène de la position a à la position b (comparaison des placements, sans chess.js).
// Suffisant pour reconnaître la réfutation attendue : on compare les cases de départ et d'arrivée.
export function uciDe(fenA, fenB) {
  const grille = (fen) => {
    const g = {};
    fen.split(' ')[0].split('/').forEach((rang, r) => {
      let f = 0;
      for (const ch of rang) {
        if (/\d/.test(ch)) f += Number(ch);
        else { g['abcdefgh'[f] + (8 - r)] = ch; f++; }
      }
    });
    return g;
  };
  const a = grille(fenA), b = grille(fenB);
  const trait = fenA.split(' ')[1];
  const mien = (p) => p && (trait === 'w' ? p === p.toUpperCase() : p === p.toLowerCase());
  const cases = new Set([...Object.keys(a), ...Object.keys(b)]);
  const quittees = [...cases].filter((s) => mien(a[s]) && b[s] !== a[s]);
  const arrivees = [...cases].filter((s) => mien(b[s]) && b[s] !== a[s]);
  if (quittees.length === 1 && arrivees.length === 1) {
    const promo = a[quittees[0]].toLowerCase() === 'p' && b[arrivees[0]].toLowerCase() !== 'p' ? b[arrivees[0]].toLowerCase() : '';
    return quittees[0] + arrivees[0] + promo;
  }
  // Roque : le Roi bouge de e1/e8 vers g ou c.
  const roi = trait === 'w' ? 'K' : 'k';
  const de = quittees.find((s) => a[s] === roi), vers = arrivees.find((s) => b[s] === roi);
  return de && vers ? de + vers : null;
}
