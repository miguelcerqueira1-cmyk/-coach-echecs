// Joueurs suivis (« joueurs suivis ») : grands maîtres collectés même hors du top 50.
// Les comptes ci-dessous sont des CANDIDATS : chacun est vérifié à chaque collecte par l'API
// (profil existant et ouvert, titre GM, nom réel concordant quand le profil le donne). Un compte
// non vérifié est noté dans meta.sources.su et ignoré : aucune partie ne lui est attribuée.
// cles : mots du nom (sans accents) servant à vérifier le nom réel et à reconnaître le joueur dans
// les retransmissions (« Carlsen, Magnus ») ; nom : nom affiché et cherchable.
import { nameMatches } from '../site/js/joueurs.js';

export const SUIVIS = [
  { nom: 'Magnus Carlsen', cles: ['carlsen', 'magnus'], li: ['DrNykterstein', 'DrDrunkenstein'], cc: ['MagnusCarlsen'] },
  { nom: 'Hikaru Nakamura', cles: ['nakamura', 'hikaru'], li: [], cc: ['Hikaru'] },
  { nom: 'Alireza Firouzja', cles: ['firouzja', 'alireza'], li: ['alireza2003'], cc: ['Firouzja2003'] },
  { nom: 'Fabiano Caruana', cles: ['caruana', 'fabiano'], li: [], cc: ['FabianoCaruana'] },
  { nom: 'Ian Nepomniachtchi', cles: ['nepomniachtchi', 'ian'], li: [], cc: ['lachesisQ'] },
  { nom: 'Wesley So', cles: ['so', 'wesley'], li: [], cc: ['GMWSO'] },
  { nom: 'Anish Giri', cles: ['giri', 'anish'], li: ['AnishGiri'], cc: ['AnishGiri'] },
  { nom: 'Levon Aronian', cles: ['aronian', 'levon'], li: [], cc: ['LevonAronian'] },
  { nom: 'Maxime Vachier-Lagrave', cles: ['vachier', 'lagrave'], li: [], cc: ['LyonBeast'] },
  { nom: 'Jan-Krzysztof Duda', cles: ['duda', 'krzysztof'], li: [], cc: ['Polish_fighter3000'] },
  { nom: 'Arjun Erigaisi', cles: ['erigaisi', 'arjun'], li: [], cc: ['GHANDEEVAM2003'] },
  { nom: 'Gukesh Dommaraju', cles: ['gukesh'], li: [], cc: ['GukeshDommaraju'] },
  { nom: 'Praggnanandhaa Rameshbabu', cles: ['praggnanandhaa'], li: [], cc: ['rpragchess'] },
  { nom: 'Nodirbek Abdusattorov', cles: ['abdusattorov', 'nodirbek'], li: [], cc: ['ChessWarrior7197'] },
  { nom: 'Vincent Keymer', cles: ['keymer', 'vincent'], li: [], cc: ['VincentKeymer'] },
  { nom: 'Ding Liren', cles: ['ding', 'liren'], li: [], cc: ['dingliren'] },
];

// Verdict de vérification d'un compte. profile : réponse normalisée de l'API
// ({ exists, closed, title, name }) ; renvoie { ok, statut, raison }.
export function verifyAccount(suivi, profile) {
  if (!profile?.exists) return { ok: false, statut: 'introuvable', raison: 'compte inexistant' };
  if (profile.closed) return { ok: false, statut: 'fermé', raison: 'compte fermé ou suspendu' };
  if (profile.title !== 'GM') return { ok: false, statut: 'rejeté', raison: `titre ${profile.title || 'absent'} (GM exigé)` };
  const name = String(profile.name || '').trim();
  if (name) {
    return nameMatches(name, suivi.cles)
      ? { ok: true, statut: 'vérifié', raison: `GM, nom « ${name} »` }
      : { ok: false, statut: 'rejeté', raison: `nom « ${name} » ≠ ${suivi.nom}` };
  }
  return { ok: true, statut: 'vérifié (titre seul)', raison: 'GM ; le profil ne donne pas de nom réel' };
}

// Profil Lichess (/api/users) → forme commune.
export function lichessProfile(u) {
  if (!u) return { exists: false };
  const p = u.profile || {};
  return {
    exists: true,
    closed: !!(u.disabled || u.closed || u.tosViolation),
    title: u.title || null,
    name: p.realName || [p.firstName, p.lastName].filter(Boolean).join(' '),
  };
}

// Profil Chess.com (/pub/player/{u}) → forme commune.
export function chessComProfile(p) {
  if (!p) return { exists: false };
  return { exists: true, closed: /^closed/.test(p.status || ''), title: p.title || null, name: p.name || '' };
}

// Joueur suivi correspondant à un nom de retransmission (« Carlsen, Magnus »), ou null.
export function suiviByName(name, suivis = SUIVIS) {
  return suivis.find((s) => nameMatches(name, s.cles)) || null;
}
