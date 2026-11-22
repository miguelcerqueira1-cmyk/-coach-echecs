// « Se connecter avec Lichess » : connexion OAuth2 officielle de Lichess (PKCE), sans secret ni
// inscription préalable de l'application. L'utilisateur accepte sur lichess.org ; l'appli reçoit un
// jeton sans permission particulière (suffisant pour exporter ses parties et l'Opening Explorer),
// gardé sur l'appareil comme le jeton saisi à la main (jamais exporté par « Mes données »).
// Le mot de passe Lichess n'est jamais vu par l'appli.

export const LICHESS = 'https://lichess.org';
export const CLIENT_ID = 'blitzrefute';
const PENDING = 'coach-echecs:lichess-oauth'; // connexion en cours (vérificateur PKCE, état, retour)
const MAX_AGE = 15 * 60 * 1000;

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function aleatoire(n = 32) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a);
}

export async function defiPkce(verifier) {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

// Adresse de retour : la page de l'appli, sans paramètres ni ancre.
export function adresseRetour(loc = location) { return loc.origin + loc.pathname; }

export function urlAutorisation({ challenge, state, redirect }) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: redirect,
    code_challenge_method: 'S256', code_challenge: challenge, state,
  });
  return `${LICHESS}/oauth?${q}`;
}

// Départ vers lichess.org. retour : page de l'appli à rouvrir ensuite (ex. « #/parties »).
export async function connecter(retour = '#/parties') {
  const verifier = aleatoire(48);
  const state = aleatoire(16);
  const redirect = adresseRetour();
  try { localStorage.setItem(PENDING, JSON.stringify({ verifier, state, retour, redirect, at: Date.now() })); } catch { /* stockage bloqué */ }
  location.assign(urlAutorisation({ challenge: await defiPkce(verifier), state, redirect }));
}

// Au démarrage : si l'adresse contient le retour de Lichess (?code=… ou ?error=…), termine la
// connexion. Retour : null (rien à faire) | { ok: true, username, token, retour } | { ok: false, message, retour }.
export async function terminerConnexion({ loc = location, fetchImpl = (...a) => fetch(...a), storage = localStorage } = {}) {
  const q = new URLSearchParams(loc.search);
  if (!q.has('code') && !q.has('error')) return null;
  let p = null;
  try { p = JSON.parse(storage.getItem(PENDING) || 'null'); } catch { p = null; }
  try { storage.removeItem(PENDING); } catch { /* rien */ }
  const retour = p?.retour || '#/parties';
  if (q.has('error')) return { ok: false, retour, message: q.get('error') === 'access_denied' ? 'Connexion à Lichess annulée.' : 'Lichess a refusé la connexion.' };
  if (!p || p.state !== q.get('state') || Date.now() - (p.at || 0) > MAX_AGE) {
    return { ok: false, retour, message: 'Connexion à Lichess expirée ou incomplète : réessaie.' };
  }
  try {
    const r = await fetchImpl(`${LICHESS}/api/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: q.get('code'), code_verifier: p.verifier, redirect_uri: p.redirect, client_id: CLIENT_ID }).toString(),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const token = (await r.json()).access_token;
    if (!token) throw new Error('aucun jeton');
    const a = await fetchImpl(`${LICHESS}/api/account`, { headers: { authorization: `Bearer ${token}` } });
    const username = a.ok ? (await a.json()).username || '' : '';
    return { ok: true, token, username, retour };
  } catch (e) {
    return { ok: false, retour, message: `Connexion à Lichess impossible (${e.message}). Réessaie plus tard.` };
  }
}

// Déconnexion : le jeton est révoqué chez Lichess (au mieux), puis effacé par l'appelant.
export async function deconnecter(token, fetchImpl = (...a) => fetch(...a)) {
  if (!token) return;
  try { await fetchImpl(`${LICHESS}/api/token`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }); } catch { /* hors ligne : effacé localement quand même */ }
}
