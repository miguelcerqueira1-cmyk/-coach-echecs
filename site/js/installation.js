// Guide d'installation (bandeau après la 1re visite, étapes illustrées par appareil, bouton direct
// sur Android/ordinateur) et protection des données (stockage persistant demandé au navigateur,
// rappels de sauvegarde « Mes données »). Logique de décision : installation-core.js.
// Le bandeau ne s'affiche jamais pendant la visite guidée ni par-dessus une fenêtre ouverte.

import {
  lire, ecrire, aDesDonnees, noterVisite, plateforme, proposerInstallation, rappelSauvegarde,
  texteDerniereSauvegarde, jourDe,
} from './installation-core.js';
import { exportData, describe } from './transfer.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const installee = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const plat = () => plateforme(navigator.userAgent, navigator.maxTouchPoints || 0);

// Invitation d'installation du navigateur (Chrome, Edge, Android) : gardée pour un bouton direct.
let invitation = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // pas de fenêtre imposée : nos boutons la déclenchent
  invitation = e;
  majBoutons();
});
window.addEventListener('appinstalled', () => {
  invitation = null;
  fermerBandeau();
  demanderPersistance();
  majBoutons();
  majReglages();
});

function majBoutons() {
  document.querySelectorAll('[data-install-direct]').forEach((b) => { b.hidden = !invitation; });
}

async function installerDirect() {
  if (!invitation) return false;
  const e = invitation;
  invitation = null;
  e.prompt();
  let ok = false;
  try { ok = (await e.userChoice)?.outcome === 'accepted'; } catch { /* rien */ }
  majBoutons();
  if (ok) { demanderPersistance(); fermerBandeau(); }
  return ok;
}

// Stockage persistant : le navigateur s'engage à ne pas effacer les données de l'appli sans
// demander (accordé d'office à une appli installée sur Chrome/Android ; sans effet ailleurs).
export async function demanderPersistance() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}
async function persistant() {
  try { return !!(await navigator.storage?.persisted?.()); } catch { return false; }
}

// Sauvegarde : fichier téléchargé (sans les secrets), date notée sur l'appareil.
export function sauvegarder(now = new Date()) {
  const dump = exportData();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(dump)], { type: 'application/json' }));
  a.download = `blitzrefute-donnees-${dump.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  const etat = lire();
  delete etat.sauvegardePlusTard;
  ecrire({ ...etat, derniereSauvegarde: now.toISOString() });
  demanderPersistance();
  majReglages();
  return dump;
}

// ---------- Icônes des étapes (dessinées ici, aucune image de marque) ----------
const ICONE = {
  partager: '<svg viewBox="0 0 24 24" width="22" height="22" aria-label="bouton Partager" role="img"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6v10h12V10h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  ajouter: '<svg viewBox="0 0 24 24" width="22" height="22" aria-label="icône Ajouter" role="img"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="22" height="22" aria-label="menu ⋮" role="img"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="22" height="22" aria-label="menu ⋯" role="img"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>',
  ecran: '<svg viewBox="0 0 24 24" width="22" height="22" aria-label="écran" role="img"><rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};
const etape = (n, icone, html) => `<li class="inst-etape"><span class="inst-num">${n}</span><span class="inst-ico">${icone || ''}</span><span>${html}</span></li>`;

const BOUTON_DIRECT = '<p><button type="button" class="primary" data-install-direct hidden>📲 Installer maintenant</button></p>';

export const ETAPES = {
  'ios-safari': {
    titre: 'iPhone / iPad (Safari)',
    html: `<ol class="inst-etapes">
      ${etape(1, ICONE.partager, 'Touche le bouton <strong>Partager</strong> (carré avec une flèche vers le haut), en bas de l’écran sur iPhone, en haut sur iPad. Tu ne le vois pas ? Touche d’abord <strong>⋯</strong> à côté de l’adresse.')}
      ${etape(2, ICONE.ajouter, 'Fais défiler la liste et touche <strong>« Sur l’écran d’accueil »</strong>.')}
      ${etape(3, '', 'Touche <strong>« Ajouter »</strong> en haut à droite.')}
      ${etape(4, '♞', 'Ouvre ensuite BlitzRefute <strong>depuis son icône</strong> sur l’écran d’accueil (plus depuis Safari).')}
    </ol>`,
  },
  'ios-autre': {
    titre: 'iPhone / iPad (Chrome, Firefox, Edge)',
    html: `<ol class="inst-etapes">
      ${etape(1, ICONE.partager, 'Touche le bouton <strong>Partager</strong> dans la barre d’adresse (ou dans le menu ⋯).')}
      ${etape(2, ICONE.ajouter, 'Touche <strong>« Sur l’écran d’accueil »</strong> puis <strong>« Ajouter »</strong>.')}
      ${etape(3, '', 'Le choix n’apparaît pas ? Ouvre ce site dans <strong>Safari</strong> (bouton ci-dessous pour copier l’adresse) et suis les étapes Safari.')}
    </ol>
    <p><button type="button" data-install-copier>📋 Copier l’adresse du site</button> <span class="muted small" data-install-copie role="status"></span></p>`,
  },
  android: {
    titre: 'Android (Chrome, Samsung Internet)',
    html: `${BOUTON_DIRECT}<ol class="inst-etapes">
      ${etape(1, ICONE.menu, 'Dans Chrome, touche le menu <strong>⋮</strong> en haut à droite (Samsung Internet : menu <strong>≡</strong> en bas).')}
      ${etape(2, ICONE.ajouter, 'Touche <strong>« Installer l’application »</strong> ou <strong>« Ajouter à l’écran d’accueil »</strong> (Samsung : « Ajouter la page à » → « Écran d’accueil »).')}
      ${etape(3, '', 'Confirme avec <strong>« Installer »</strong>. L’icône BlitzRefute apparaît avec tes autres applis.')}
    </ol>`,
  },
  ordinateur: {
    titre: 'Ordinateur (Chrome, Edge, Safari)',
    html: `${BOUTON_DIRECT}<ol class="inst-etapes">
      ${etape(1, ICONE.ecran, 'Chrome ou Edge : clique sur l’icône <strong>Installer</strong> à droite de la barre d’adresse, ou menu → « Installer BlitzRefute ».')}
      ${etape(2, '', 'Safari sur Mac : menu <strong>Fichier → « Ajouter au Dock »</strong>.')}
      ${etape(3, '', 'Firefox n’installe pas les applis web : le site marche quand même, pense à sauvegarder tes données.')}
    </ol>`,
  },
};

// ---------- Fenêtre du guide ----------
function dialogue() {
  let dlg = $('dlg-installer');
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.id = 'dlg-installer';
  dlg.className = 'dlg-installer';
  dlg.setAttribute('aria-labelledby', 'installer-title');
  dlg.innerHTML = '<form method="dialog"><h2 id="installer-title">📲 Installer BlitzRefute</h2><div data-installer-corps></div><div class="dlg-actions"><button value="close" class="primary">Fermer</button></div></form>';
  document.body.append(dlg);
  return dlg;
}

export function ouvrirGuide() {
  fermerBandeau();
  const dlg = dialogue();
  const p = plat();
  const autres = Object.entries(ETAPES).filter(([k]) => k !== p);
  const etat = lire();
  const deja = installee()
    ? '<p class="inst-ok">✔ L’appli est installée sur cet appareil : tes données y sont mieux protégées.</p>'
    : `<h3>${esc(ETAPES[p].titre)}</h3>${ETAPES[p].html}`;
  dlg.querySelector('[data-installer-corps]').innerHTML = `
    <p>L’appli s’ouvre en plein écran depuis son icône, marche <strong>hors connexion</strong> (échiquier, moteur, leçons) et <strong>garde mieux tes données</strong> : sur iPhone, Safari peut effacer les données d’un site non installé après quelques semaines sans visite.</p>
    ${deja}
    <details class="inst-autres"><summary>Autre appareil</summary>${autres.map(([, e]) => `<h4>${esc(e.titre)}</h4>${e.html}`).join('')}</details>
    <h3>💾 Sauvegarder mes données</h3>
    <p class="muted small">Tout est enregistré uniquement sur cet appareil. Un fichier de sauvegarde (sans tes codes secrets) te permet de tout récupérer, ou de passer sur un autre appareil : ⚙ Réglages → Mes données → Importer.</p>
    <p><button type="button" data-install-sauver>⤓ Sauvegarder maintenant</button></p>
    <p class="muted small" data-install-derniere role="status">${esc(texteDerniereSauvegarde(etat))}</p>`;
  majBoutons();
  dlg.querySelectorAll('[data-install-direct]').forEach((b) => { b.onclick = () => installerDirect().then((ok) => { if (ok) dlg.close(); }); });
  dlg.querySelectorAll('[data-install-copier]').forEach((b) => {
    b.onclick = async () => {
      const out = b.parentElement.querySelector('[data-install-copie]');
      try { await navigator.clipboard.writeText(location.href.split('#')[0]); out.textContent = 'Adresse copiée : colle-la dans Safari.'; } catch { out.textContent = location.href.split('#')[0]; }
    };
  });
  dlg.querySelector('[data-install-sauver]').onclick = () => {
    const dump = sauvegarder();
    dlg.querySelector('[data-install-derniere]').textContent = `Fichier créé (${describe(dump)}). Range-le dans Fichiers, Drive ou tes e-mails.`;
  };
  if (!dlg.open) dlg.showModal();
}

// ---------- Bandeau (installation ou sauvegarde, un seul à la fois) ----------
function fermerBandeau() { document.querySelector('.inst-bandeau')?.remove(); }

function occupe() {
  return !!(document.querySelector('.tour-bulle, dialog[open], .pwa-update') || localStorage.getItem('coach-echecs:visite') === 'a-faire');
}

function bandeau(html, actions) {
  fermerBandeau();
  const bar = document.createElement('div');
  bar.className = 'inst-bandeau';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Conseil');
  bar.innerHTML = `${html}<div class="inst-actions">${actions.map((a, i) => `<button type="button" data-i="${i}"${a.primary ? ' class="primary"' : ''}>${esc(a.label)}</button>`).join('')}</div>`;
  bar.querySelectorAll('button').forEach((b) => { b.onclick = () => { fermerBandeau(); actions[Number(b.dataset.i)].run(); }; });
  document.body.append(bar);
  return bar;
}

const mobile = (p) => p !== 'ordinateur';
const risque = () => !installee() && plat().startsWith('ios');

export function montrerBandeau(now = new Date()) {
  if (occupe() || document.querySelector('.inst-bandeau')) return null;
  const etat = lire();
  const p = plat();
  if (proposerInstallation(etat, { now, installee: installee(), mobile: mobile(p) || !!invitation })) {
    const ios = p.startsWith('ios');
    return bandeau(
      `<p><strong>📲 Installe BlitzRefute sur ton ${ios || p === 'android' ? 'téléphone' : 'appareil'}</strong><br><span class="small">Une icône comme une vraie appli, hors connexion, et ta progression mieux protégée.</span></p>`,
      [
        { label: 'Plus tard', run: () => { const e = lire(); ecrire({ ...e, refusInstall: (e.refusInstall || 0) + 1, installPlusTard: jourDe(now) }); } },
        { label: invitation && !ios ? 'Installer' : 'Voir comment', primary: true, run: () => (invitation && !ios ? installerDirect() : ouvrirGuide()) },
      ],
    );
  }
  const r = rappelSauvegarde(etat, { now, donnees: aDesDonnees(), risque: risque() });
  if (r) {
    const txt = r.jamais ? 'Tu n’as encore jamais sauvegardé ta progression.' : `Dernière sauvegarde il y a ${r.jours} jours.`;
    return bandeau(
      `<p><strong>💾 Pense à sauvegarder</strong><br><span class="small">${esc(txt)} Tes données ne sont que sur cet appareil : un fichier suffit pour tout récupérer.</span></p>`,
      [
        { label: 'Plus tard', run: () => ecrire({ ...lire(), sauvegardePlusTard: jourDe(now) }) },
        { label: 'Sauvegarder', primary: true, run: () => sauvegarder(now) },
      ],
    );
  }
  return null;
}

// ---------- Réglages : section « Application sur l'écran d'accueil » + date de sauvegarde ----------
const HORS_LIGNE = 'Après une première visite en ligne, le moteur, les fiches du répertoire et l’entraînement fonctionnent hors connexion.';

async function majReglages() {
  const text = $('pwa-install-text');
  if (text) {
    const prot = (await persistant()) ? ' Stockage protégé par le navigateur ✔.' : '';
    text.textContent = installee() ? `Application installée. ${HORS_LIGNE}${prot}` : `Installe l’appli pour l’ouvrir depuis une icône et mieux protéger tes données. ${HORS_LIGNE}${prot}`;
  }
  const last = $('data-last');
  if (last) last.textContent = texteDerniereSauvegarde(lire());
}

function sectionReglages() {
  const form = $('form-settings');
  if (!form || $('pwa-install')) return;
  const box = document.createElement('section');
  box.id = 'pwa-install';
  box.innerHTML = `<h3>Application sur l’écran d’accueil</h3>
    <p class="muted small" id="pwa-install-text"></p>
    <div class="dlg-actions left"><button type="button" id="pwa-install-btn" data-install-direct hidden>Installer l’application</button> <button type="button" id="pwa-guide-btn">📲 Comment installer l’appli</button></div>`;
  form.insertBefore(box, form.querySelector('details') || form.querySelector('.dlg-actions:last-of-type'));
  $('pwa-install-btn').onclick = () => installerDirect();
  $('pwa-guide-btn').onclick = () => { $('dlg-settings')?.close(); ouvrirGuide(); };
  $('dlg-settings')?.addEventListener('toggle', majReglages);
  majBoutons();
  majReglages();
}

// Démarrage (appelé par main.js APRÈS initChoix : l'écriture de l'état ne doit pas masquer une
// première visite). Bandeau proposé quelques secondes après l'ouverture, jamais pendant la visite guidée.
export function demarrer({ delai = 4000, now = new Date() } = {}) {
  sectionReglages();
  // Pas encore d'ouvertures choisies (page d'accueil) : rien n'est écrit, la 1re visite reste une 1re visite.
  try { if (!localStorage.getItem('coach-echecs:mon-repertoire')) return; } catch { return; }
  ecrire(noterVisite(lire(), { now, donnees: aDesDonnees() }));
  if (installee()) demanderPersistance();
  setTimeout(() => montrerBandeau(now), delai);
}
