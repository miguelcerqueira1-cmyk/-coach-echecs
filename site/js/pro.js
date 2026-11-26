// Formule Gratuit / Pro de BlitzRefute.
// - Gratuit : page Moteur, Mes parties, et une variante de base par ouverture (fiche, leçon) ;
// - Pro : encyclopédie complète, entraînement (lignes, révision espacée, anti-trash, séance du
//   jour, mes vraies erreurs).
// LIMITE ASSUMÉE : tout se passe sur l'appareil (site statique, aucun serveur de licences) ; le
// drapeau Pro est dans localStorage et le contenu reste dans le code public. C'est un écran de
// vente, pas une protection : une vraie vente exige une vérification côté serveur.
// Le code d'accès n'est jamais écrit en clair ici : seule son empreinte SHA-256 est comparée.

import { FICHES_GRATUITES } from '../data/repertoires/meta.js';
import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

const KEY = 'coach-echecs:pro';
// Empreinte SHA-256 du code administrateur (le code lui-même n'est pas dans le dépôt).
const CODE_HASHES = ['96c385bdf2fc8a78972ab9b37af0d4375c2a459080f437b4a8002323adf10248'];

// Variantes de base offertes : listées par répertoire dans site/data/repertoires/meta.js
// (`gratuites`, une fiche par répertoire dès qu'il a du contenu ; la Caro-Kann en garde deux).
export const FREE_FICHES = FICHES_GRATUITES;

export const PRO_FEATURES = [
  ['📚', L('L’encyclopédie complète', 'The complete encyclopedia'), L('Toutes les variantes de vos ouvertures : plans, pièges, réfutations vérifiées par Stockfish, vidéos', 'All the lines of your openings: plans, traps, refutations checked by Stockfish, videos')],
  ['⏱', L('Réflexes anti-trash', 'Anti-trash reflexes'), L('Punitions chronométrées des coups douteux du Blitz', 'Timed punishments of dubious Blitz moves')],
  ['🧠', L('Répétition espacée', 'Spaced repetition'), L('Les lignes reviennent juste avant que vous les oubliiez', 'Lines come back just before you forget them')],
  ['🎯', L('Positions de mes parties', 'Positions from my games'), L('Vos sorties de répertoire Lichess / Chess.com transformées en exercices', 'Your Lichess / Chess.com repertoire deviations turned into exercises')],
  ['📖', L('Tous les cours', 'All the lessons'), L('Chaque variante en leçon pas à pas, piège et punition à jouer', 'Each line as a step-by-step lesson, with a trap and a punishment to play')],
  ['♚', L('Toutes les finales essentielles', 'All the essential endgames'), L('Lucena, Philidor, opposition, règle du carré : jouées contre Stockfish', 'Lucena, Philidor, opposition, rule of the square: played against Stockfish')],
];

// Comparatif Gratuit / Pro (accueil et fenêtre Pro) : reflète exactement les verrous de l'appli
// (FREE_FICHES, finales.gratuit, problemes-core gratuit, niveaux Stockfish 1–4, modules `need`).
export function comparatif() {
  const n = FREE_FICHES.length;
  return [
    [L('Moteur d’analyse Stockfish', 'Stockfish analysis engine'), '✔', '✔'],
    [L('Mes parties : import, analyse, rapport', 'My games: import, analysis, report'), '✔', '✔'],
    [L('Variantes de mes ouvertures (fiches)', 'Lines of my openings'), L(`1 par ouverture (${n})`, `1 per opening (${n})`), L('Toutes, et les nouvelles', 'All, and new ones')],
    [L('Leçons pas à pas', 'Step-by-step lessons'), L('1 par ouverture', '1 per opening'), L('Toutes', 'All')],
    [L('S’entraîner (répétition espacée)', 'Practice (spaced repetition)'), '—', '✔'],
    [L('Réflexes anti-trash chronométrés', 'Timed anti-trash reflexes'), '—', '✔'],
    [L('⚡ Rush réfutations', '⚡ Refutation rush'), L('variantes gratuites', 'free lines'), L('toutes mes ouvertures', 'all my openings')],
    [L('Positions ratées de mes parties', 'Missed positions from my games'), '—', '✔'],
    [L('Problèmes par thème', 'Puzzles by theme'), L('3 thèmes', '3 themes'), L('26 thèmes', '26 themes')],
    [L('Finales essentielles', 'Essential endgames'), '3', '8'],
    [L('Partie contre Stockfish', 'Game against Stockfish'), L('niveaux 1 à 4', 'levels 1 to 4'), L('10 niveaux', '10 levels')],
  ];
}

export function comparatifHtml() {
  const cell = (v) => (v === '✔' ? '<span class="ok-text" aria-label="oui">✔</span>' : v === '—' ? '<span class="muted" aria-label="non">—</span>' : esc(v));
  return `<table class="pro-compare">
    <thead><tr><th scope="col"></th><th scope="col">${L('Gratuit', 'Free')}</th><th scope="col" class="pro-col">Pro</th></tr></thead>
    <tbody>${comparatif().map(([f, g, p]) => `<tr><th scope="row">${esc(f)}</th><td>${cell(g)}</td><td class="pro-col">${cell(p)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th scope="row">${L('Prix', 'Price')}</th><td>0 €</td><td class="pro-col"><strong>29 €</strong></td></tr></tfoot>
  </table>
  <p class="pro-price-note small">${L('<strong>29 € une seule fois</strong> : accès à vie, sans abonnement, mises à jour et nouvelles variantes comprises.', '<strong>€29 one-off</strong>: lifetime access, no subscription, updates and new lines included.')}</p>`;
}

export function getPaymentUrl() { return PAYMENT_URL; }

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
    ? `<span class="pro-lock">🔒</span> <strong>${esc(reason)}</strong> ${L('fait partie de BlitzRefute Pro.', 'is part of BlitzRefute Pro.')}` : '';
  dlg.querySelector('[data-pro-compare]').innerHTML = comparatifHtml();
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
  dlg.querySelectorAll('[data-pro-cgv]').forEach((a) => a.addEventListener('click', () => dlg.close()));
  dlg.querySelector('[data-pro-form]').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = dlg.querySelector('[data-pro-msg]');
    const ok = await unlockWithCode(dlg.querySelector('[data-pro-code]').value);
    msg.textContent = ok ? L('✔ BlitzRefute Pro est activé sur cet appareil.', '✔ BlitzRefute Pro is active on this device.') : L('Code non reconnu.', 'Code not recognised.');
    msg.className = ok ? 'small ok-text' : 'small error-text';
    if (ok) setTimeout(() => dlg.close(), 900);
  });
}

// Badge de formule et bouton « Passer Pro » du header.
export function renderPlan() {
  const pro = isPro();
  const pill = document.getElementById('plan-pill');
  if (pill) { pill.textContent = pro ? 'Pro' : L('Gratuit', 'Free'); pill.classList.toggle('pro', pro); }
  const btn = document.getElementById('btn-pro');
  if (btn) btn.hidden = pro;
}
