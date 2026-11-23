// Synchronisation entre appareils (logique pure, testée par node:test avec WebCrypto).
// Un CODE secret (160 bits, alphabet base32 de Crockford, groupé par 4) est créé sur le premier
// appareil et saisi sur les autres. De ce code sont dérivés :
//   - l'identifiant de stockage sur le serveur : SHA-256("blitzrefute-sync-id:" + code) en hexadécimal ;
//   - la clé de chiffrement AES-GCM 256 : SHA-256("blitzrefute-sync-cle:" + code).
// Le serveur ne reçoit que l'identifiant et un bloc chiffré : il ne peut pas lire les données.
// Le code ne quitte jamais l'appareil (secret local, jamais exporté par « Mes données »).

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const te = new TextEncoder();
const td = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export function nouveauCode(rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  const b = rand(20); // 160 bits → 32 caractères base32
  let bits = 0;
  let val = 0;
  let out = '';
  for (const x of b) {
    val = (val << 8) | x;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return formater(out);
}

// Saisie tolérante : minuscules, espaces, tirets, O→0, I/L→1.
export function normaliser(code) {
  return String(code || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}
export const valide = (code) => new RegExp(`^[${ALPHABET}]{32}$`).test(normaliser(code));
export const formater = (code) => normaliser(code).match(/.{1,4}/g)?.join('-') || '';

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (buf) => { let s = ''; for (const x of new Uint8Array(buf)) s += String.fromCharCode(x); return btoa(s); };
const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function identifiant(code) {
  return hex(await subtle().digest('SHA-256', te.encode(`blitzrefute-sync-id:${normaliser(code)}`)));
}
async function cle(code) {
  const brut = await subtle().digest('SHA-256', te.encode(`blitzrefute-sync-cle:${normaliser(code)}`));
  return subtle().importKey('raw', brut, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Compression gzip si le navigateur la propose (sinon texte brut) — indiquée dans l'en-tête.
async function transformer(bytes, Stream) {
  const s = new Blob([bytes]).stream().pipeThrough(new Stream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// Objet JS → « v1.<gz 0|1>.<iv base64>.<chiffré base64> ».
export async function chiffrer(objet, code) {
  let bytes = te.encode(JSON.stringify(objet));
  let gz = 0;
  if (typeof CompressionStream !== 'undefined') { bytes = await transformer(bytes, CompressionStream); gz = 1; }
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, await cle(code), bytes);
  return `v1.${gz}.${b64(iv)}.${b64(ct)}`;
}

export async function dechiffrer(texte, code) {
  const [v, gz, iv, ct] = String(texte).split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('Données de synchronisation illisibles.');
  let bytes;
  try { bytes = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: deb64(iv) }, await cle(code), deb64(ct))); } catch { throw new Error('Code de synchronisation incorrect (déchiffrement impossible).'); }
  if (gz === '1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas décompresser ces données : mettez-le à jour.');
    bytes = await transformer(bytes, DecompressionStream);
  }
  return JSON.parse(td.decode(bytes));
}

// Empreinte des données exportées (pour savoir si l'appareil a changé depuis la dernière synchro).
// La date d'export est ignorée ; les clés sont triées.
export async function empreinte(dump) {
  const d = dump?.data || {};
  const s = JSON.stringify(Object.keys(d).sort().map((k) => [k, d[k]]));
  return hex(await subtle().digest('SHA-256', te.encode(s))).slice(0, 32);
}

// Que faire au démarrage ? local = { version, empreinte } (dernière synchro réussie),
// actuelle = empreinte des données de l'appareil, distante = version sur le serveur (0 si rien).
// → 'rien' | 'envoyer' | 'recevoir' | 'conflit'
export function decision({ local, actuelle, distante }) {
  const change = actuelle !== local.empreinte;
  const nouveau = distante > (local.version || 0);
  if (nouveau && change) return 'conflit';
  if (nouveau) return 'recevoir';
  if (change) return 'envoyer';
  return 'rien';
}
