// Formule Gratuit / Pro de BlitzRefute.
// - Gratuit : page Moteur, Mes parties, et 3 variantes de base (fiche, leçon) ;
// - Pro : encyclopédie complète, entraînement (lignes, révision espacée, anti-trash, séance du
//   jour, mes vraies erreurs).
// LIMITE ASSUMÉE : tout se passe sur l'appareil (site statique, aucun serveur de licences) ; le
// drapeau Pro est dans localStorage et le contenu reste dans le code public. C'est un écran de
// vente, pas une protection : une vraie vente exige une vérification côté serveur.
// Le code d'accès n'est jamais écrit en clair ici : seule son empreinte SHA-256 est comparée.

const KEY = 'coach-echecs:pro';
// Empreinte SHA-256 du code administrateur (le code lui-même n'est pas dans le dépôt).
const CODE_HASHES = ['96c385bdf2fc8a78972ab9b37af0d4375c2a459080f437b4a8002323adf10248'];

// Variantes de base offertes : la ligne principale de chaque répertoire, plus l'Avance (Caro-Kann).
export const FREE_FICHES = ['gd-orthodoxe', 'ck-classique', 'ck-avance-short'];

export const PRO_FEATURES = [
  ['📚', 'L’encyclopédie complète', 'Les 58 variantes : plans, pièges, réfutations vérifiées par Stockfish, vidéos'],
  ['⏱', 'Réflexes anti-trash', 'Punitions chronométrées des coups douteux du Blitz'],
  ['🧠', 'Répétition espacée', 'Les lignes reviennent juste avant que vous les oubliiez'],
  ['🎯', 'Mes vraies erreurs', 'Vos sorties de répertoire Lichess / Chess.com transformées en exercices'],
  ['📖', 'Tous les cours', 'Chaque variante en leçon pas à pas, piège et punition à jouer'],
];

export function isPro() {
  try { return !!JSON.parse(localStorage.getItem(KEY) || 'null')?.pro; } catch { return false; }
}

export const isFreeFiche = (id) => FREE_FICHES.includes(id);
export const canOpenFiche = (id) => isPro() || isFreeFiche(id);

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Code saisi (administrateur, ou plus tard licence) : débloque Pro sur cet appareil.
export async function unlockWithCode(code) {
  const h = await sha256Hex(String(code || '').trim());
  if (!CODE_HASHES.includes(h)) return false;
  try { localStorage.setItem(KEY, JSON.stringify({ pro: true, via: 'code', at: new Date().toISOString() })); } catch { return false; }
  window.dispatchEvent(new CustomEvent('pro-change'));
  return true;
}

export function lockPro() {
  try { localStorage.removeItem(KEY); } catch { /* rien */ }
  window.dispatchEvent(new CustomEvent('pro-change'));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Fenêtre « Passer Pro ». reason : ce que l'utilisateur essayait d'ouvrir. paymentUrl : lien de
// paiement publié dans config.json (vide = paiement pas encore ouvert, dit clairement).
let PAYMENT_URL = '';
export function setPaymentUrl(url) { PAYMENT_URL = /^https:\/\//.test(url || '') ? url : ''; }

export function openPaywall({ reason = '', paymentUrl = PAYMENT_URL } = {}) {
  const dlg = document.getElementById('dlg-pro');
  if (!dlg) return;
  dlg.querySelector('[data-pro-reason]').innerHTML = reason
    ? `<span class="pro-lock">🔒</span> <strong>${esc(reason)}</strong> fait partie de BlitzRefute Pro.` : '';
  dlg.querySelector('[data-pro-list]').innerHTML = PRO_FEATURES.map(([i, t, d]) => `<li><span class="pro-ico" aria-hidden="true">${i}</span><span><strong>${esc(t)}</strong><br><span class="muted small">${esc(d)}</span></span></li>`).join('');
  const buy = dlg.querySelector('[data-pro-buy]');
  const soon = dlg.querySelector('[data-pro-soon]');
  buy.hidden = !paymentUrl;
  if (paymentUrl) buy.href = paymentUrl;
  soon.hidden = !!paymentUrl;
  dlg.querySelector('[data-pro-msg]').textContent = '';
  dlg.querySelector('[data-pro-code]').value = '';
  if (!dlg.open) dlg.showModal();
}

export function bindPaywall() {
  const dlg = document.getElementById('dlg-pro');
  if (!dlg || dlg.dataset.bound) return;
  dlg.dataset.bound = '1';
  dlg.querySelector('[data-pro-close]').addEventListener('click', () => dlg.close());
  dlg.querySelector('[data-pro-form]').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = dlg.querySelector('[data-pro-msg]');
    const ok = await unlockWithCode(dlg.querySelector('[data-pro-code]').value);
    msg.textContent = ok ? '✔ BlitzRefute Pro est activé sur cet appareil.' : 'Code non reconnu.';
    msg.className = ok ? 'small ok-text' : 'small error-text';
    if (ok) setTimeout(() => dlg.close(), 900);
  });
}

// Badge de formule et bouton « Passer Pro » du header.
export function renderPlan() {
  const pro = isPro();
  const pill = document.getElementById('plan-pill');
  if (pill) { pill.textContent = pro ? 'Pro' : 'Gratuit'; pill.classList.toggle('pro', pro); }
  const btn = document.getElementById('btn-pro');
  if (btn) btn.hidden = pro;
}
