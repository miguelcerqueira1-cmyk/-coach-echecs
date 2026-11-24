// Guide d'installation et protection des données : logique pure (testée par node:test).
// Safari peut effacer le stockage d'un site NON installé après quelques semaines sans visite :
// on incite à installer l'appli et on rappelle de temps en temps d'exporter « Mes données ».
// État propre à l'appareil, jamais exporté : coach-echecs:installation-v1
//   { jours: ['AAAA-MM-JJ', …] (jours de visite, 10 derniers), premiereDonnee, derniereSauvegarde,
//     refusInstall: n, installPlusTard: date, sauvegardePlusTard: date }

import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

export const KEY = 'coach-echecs:installation-v1';
// Clés qui signalent un vrai travail à protéger (progression, révisions, routine, analyses…).
export const CLES_DONNEES = ['progression-v1', 'revision-v1', 'routine-v1', 'analyses-v1', 'finales-v1', 'classements-v1'].map((k) => `coach-echecs:${k}`);

const JOUR = 86400000;
export const jourDe = (d) => new Date(d).toISOString().slice(0, 10);
export const joursEntre = (a, b) => Math.floor((Date.parse(jourDe(b)) - Date.parse(jourDe(a))) / JOUR);

export function lire(storage = localStorage) {
  try { return JSON.parse(storage.getItem(KEY)) || {}; } catch { return {}; }
}
export function ecrire(etat, storage = localStorage) {
  try { storage.setItem(KEY, JSON.stringify(etat)); } catch { /* stockage bloqué */ }
}

export function aDesDonnees(storage = localStorage) {
  try { return CLES_DONNEES.some((k) => storage.getItem(k) != null); } catch { return false; }
}

// Visite du jour : enregistre le jour, et la date où des données sont apparues pour la 1re fois.
export function noterVisite(etat, { now = new Date(), donnees = false } = {}) {
  const j = jourDe(now);
  const jours = [...new Set([...(etat.jours || []), j])].sort().slice(-10);
  const out = { ...etat, jours };
  if (donnees && !out.premiereDonnee) out.premiereDonnee = j;
  return out;
}

// Plateforme, pour choisir les étapes à montrer.
export function plateforme(ua = '', touch = 0) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);
  if (ios) {
    if (/CriOS|FxiOS|EdgiOS/.test(ua)) return 'ios-autre';
    return 'ios-safari';
  }
  if (/Android/.test(ua)) return 'android';
  return 'ordinateur';
}

// Bandeau « Installer l'appli » : pas installée, à partir du 2e jour de visite (« après la 1re
// visite »), pas plus de 3 refus, et 14 jours de calme après un « Plus tard ».
export function proposerInstallation(etat, { now = new Date(), installee = false, mobile = true } = {}) {
  if (installee || !mobile) return false;
  if ((etat.jours || []).length < 2) return false;
  if ((etat.refusInstall || 0) >= 3) return false;
  if (etat.installPlusTard && joursEntre(etat.installPlusTard, now) < 14) return false;
  return true;
}

// Rappel de sauvegarde : des données existent depuis 7 jours sans aucune sauvegarde, ou la dernière
// date de plus de 30 jours (14 si l'appli n'est pas installée sur iPhone, où le risque est réel).
// « Plus tard » : 7 jours de calme.
export function rappelSauvegarde(etat, { now = new Date(), donnees = false, risque = false } = {}) {
  if (!donnees) return null;
  if (etat.sauvegardePlusTard && joursEntre(etat.sauvegardePlusTard, now) < 7) return null;
  const delai = risque ? 14 : 30;
  if (etat.derniereSauvegarde) {
    const n = joursEntre(etat.derniereSauvegarde, now);
    return n >= delai ? { jamais: false, jours: n } : null;
  }
  if (etat.premiereDonnee && joursEntre(etat.premiereDonnee, now) >= 7) return { jamais: true, jours: joursEntre(etat.premiereDonnee, now) };
  return null;
}

export function texteDerniereSauvegarde(etat, now = new Date()) {
  if (!etat.derniereSauvegarde) return L('Aucune sauvegarde faite depuis cet appareil.', 'No backup made from this device.');
  const n = joursEntre(etat.derniereSauvegarde, now);
  const quand = n <= 0 ? L('aujourd’hui', 'today') : n === 1 ? L('hier', 'yesterday') : L(`il y a ${n} jours`, `${n} days ago`);
  return L(`Dernière sauvegarde : ${quand} (${new Date(etat.derniereSauvegarde).toLocaleDateString('fr-FR')}).`, `Last backup: ${quand} (${new Date(etat.derniereSauvegarde).toLocaleDateString('en-GB')}).`);
}
