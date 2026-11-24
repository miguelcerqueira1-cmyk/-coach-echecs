// Guide d'installation (bandeau après la 1re visite, étapes illustrées par appareil, bouton direct
// sur Android/ordinateur) et protection des données (stockage persistant demandé au navigateur,
// rappels de sauvegarde « Mes données »). Logique de décision : installation-core.js.
// Le bandeau ne s'affiche jamais pendant la visite guidée ni par-dessus une fenêtre ouverte.

import {
  lire, ecrire, aDesDonnees, noterVisite, plateforme, proposerInstallation, rappelSauvegarde,
  texteDerniereSauvegarde, jourDe,
} from './installation-core.js';
import { exportData, describe } from './transfer.js';
import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

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

// Copie de « Mes données » dans le presse-papiers (sans les secrets) : sur iPhone, l'appli
// installée n'a pas la même mémoire que le navigateur ; on colle ensuite dans l'appli.
export async function copierDonnees() {
  const texte = JSON.stringify(exportData());
  try { await navigator.clipboard.writeText(texte); return { ok: true, texte }; } catch { return { ok: false, texte }; }
}

// ---------- Icônes des étapes (dessinées ici, aucune image de marque) ----------
const ICONE = {
  partager: `<svg viewBox="0 0 24 24" width="22" height="22" aria-label="${L('bouton Partager', 'Share button')}" role="img"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6v10h12V10h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
  ajouter: `<svg viewBox="0 0 24 24" width="22" height="22" aria-label="${L('icône Ajouter', 'Add icon')}" role="img"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  menu: '<svg viewBox="0 0 24 24" width="22" height="22" aria-label="menu ⋮" role="img"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="22" height="22" aria-label="menu ⋯" role="img"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>',
  ecran: `<svg viewBox="0 0 24 24" width="22" height="22" aria-label="${L('écran', 'screen')}" role="img"><rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};
const etape = (n, icone, html) => `<li class="inst-etape"><span class="inst-num">${n}</span><span class="inst-ico">${icone || ''}</span><span>${html}</span></li>`;

const BOUTON_DIRECT = `<p><button type="button" class="primary" data-install-direct hidden>📲 ${L('Installer maintenant', 'Install now')}</button></p>`;

export const ETAPES = {
  'ios-safari': {
    titre: L('iPhone / iPad (Safari)', 'iPhone / iPad (Safari)'),
    html: `<ol class="inst-etapes">
      ${etape(1, ICONE.partager, L('Touche le bouton <strong>Partager</strong> (carré avec une flèche vers le haut), en bas de l’écran sur iPhone, en haut sur iPad. Tu ne le vois pas ? Touche d’abord <strong>⋯</strong> à côté de l’adresse.', 'Tap the <strong>Share</strong> button (a square with an upward arrow), at the bottom of the screen on iPhone, at the top on iPad. Can’t see it? First tap <strong>⋯</strong> next to the address.'))}
      ${etape(2, ICONE.ajouter, L('Fais défiler la liste et touche <strong>« Sur l’écran d’accueil »</strong>.', 'Scroll the list and tap <strong>“Add to Home Screen”</strong>.'))}
      ${etape(3, '', L('Touche <strong>« Ajouter »</strong> en haut à droite.', 'Tap <strong>“Add”</strong> at the top right.'))}
      ${etape(4, '♞', L('Ouvre ensuite BlitzRefute <strong>depuis son icône</strong> sur l’écran d’accueil (plus depuis Safari).', 'Then open BlitzRefute <strong>from its icon</strong> on the home screen (no longer from Safari).'))}
    </ol>`,
  },
  'ios-autre': {
    titre: L('iPhone / iPad (Chrome, Firefox, Edge)', 'iPhone / iPad (Chrome, Firefox, Edge)'),
    html: `<ol class="inst-etapes">
      ${etape(1, ICONE.partager, L('Touche le bouton <strong>Partager</strong> dans la barre d’adresse (ou dans le menu ⋯).', 'Tap the <strong>Share</strong> button in the address bar (or in the ⋯ menu).'))}
      ${etape(2, ICONE.ajouter, L('Touche <strong>« Sur l’écran d’accueil »</strong> puis <strong>« Ajouter »</strong>.', 'Tap <strong>“Add to Home Screen”</strong> then <strong>“Add”</strong>.'))}
      ${etape(3, '', L('Le choix n’apparaît pas ? Ouvre ce site dans <strong>Safari</strong> (bouton ci-dessous pour copier l’adresse) et suis les étapes Safari.', 'The option doesn’t appear? Open this site in <strong>Safari</strong> (button below to copy the address) and follow the Safari steps.'))}
    </ol>
    <p><button type="button" data-install-copier>📋 ${L('Copier l’adresse du site', 'Copy the site address')}</button> <span class="muted small" data-install-copie role="status"></span></p>`,
  },
  android: {
    titre: L('Android (Chrome, Samsung Internet)', 'Android (Chrome, Samsung Internet)'),
    html: `${BOUTON_DIRECT}<ol class="inst-etapes">
      ${etape(1, ICONE.menu, L('Dans Chrome, touche le menu <strong>⋮</strong> en haut à droite (Samsung Internet : menu <strong>≡</strong> en bas).', 'In Chrome, tap the <strong>⋮</strong> menu at the top right (Samsung Internet: <strong>≡</strong> menu at the bottom).'))}
      ${etape(2, ICONE.ajouter, L('Touche <strong>« Installer l’application »</strong> ou <strong>« Ajouter à l’écran d’accueil »</strong> (Samsung : « Ajouter la page à » → « Écran d’accueil »).', 'Tap <strong>“Install app”</strong> or <strong>“Add to Home screen”</strong> (Samsung: “Add page to” → “Home screen”).'))}
      ${etape(3, '', L('Confirme avec <strong>« Installer »</strong>. L’icône BlitzRefute apparaît avec tes autres applis.', 'Confirm with <strong>“Install”</strong>. The BlitzRefute icon appears with your other apps.'))}
    </ol>`,
  },
  ordinateur: {
    titre: L('Ordinateur (Chrome, Edge, Safari)', 'Computer (Chrome, Edge, Safari)'),
    html: `${BOUTON_DIRECT}<ol class="inst-etapes">
      ${etape(1, ICONE.ecran, L('Chrome ou Edge : clique sur l’icône <strong>Installer</strong> à droite de la barre d’adresse, ou menu → « Installer BlitzRefute ».', 'Chrome or Edge: click the <strong>Install</strong> icon on the right of the address bar, or menu → “Install BlitzRefute”.'))}
      ${etape(2, '', L('Safari sur Mac : menu <strong>Fichier → « Ajouter au Dock »</strong>.', 'Safari on Mac: <strong>File → “Add to Dock”</strong> menu.'))}
      ${etape(3, '', L('Firefox n’installe pas les applis web : le site marche quand même, pense à sauvegarder tes données.', 'Firefox doesn’t install web apps: the site still works, remember to back up your data.'))}
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
  dlg.innerHTML = `<form method="dialog"><h2 id="installer-title">📲 ${L('Installer BlitzRefute', 'Install BlitzRefute')}</h2><div data-installer-corps></div><div class="dlg-actions"><button value="close" class="primary">${L('Fermer', 'Close')}</button></div></form>`;
  document.body.append(dlg);
  return dlg;
}

export function ouvrirGuide() {
  fermerBandeau();
  const dlg = dialogue();
  const p = plat();
  const autres = Object.entries(ETAPES).filter(([k]) => k !== p);
  const etat = lire();
  const emporter = p.startsWith('ios') && !installee() && aDesDonnees()
    ? `<div class="inst-alerte"><p><strong>⚠ ${L('Avant d’installer : emporte tes données', 'Before installing: take your data with you')}</strong><br>${L('Sur iPhone, l’appli installée <strong>ne voit pas</strong> ce que tu as fait dans le navigateur : elle démarre vide.', 'On iPhone, the installed app <strong>cannot see</strong> what you did in the browser: it starts empty.')}</p>
      <ol class="inst-etapes">
        ${etape(1, '📋', L('Touche <strong>« Copier mes données »</strong> ci-dessous.', 'Tap <strong>“Copy my data”</strong> below.'))}
        ${etape(2, ICONE.ajouter, L('Installe l’appli (étapes plus bas).', 'Install the app (steps below).'))}
        ${etape(3, '📥', L('Ouvre l’appli depuis son icône → ⚙ Réglages → Mes données → <strong>« Coller des données »</strong>.', 'Open the app from its icon → ⚙ Settings → My data → <strong>“Paste data”</strong>.'))}
      </ol>
      <p><button type="button" class="primary" data-install-copier-donnees>📋 ${L('Copier mes données', 'Copy my data')}</button> <span class="muted small" data-install-copie-donnees role="status"></span></p></div>`
    : '';
  const deja = installee()
    ? `<p class="inst-ok">${L('✔ L’appli est installée sur cet appareil : tes données y sont mieux protégées.', '✔ The app is installed on this device: your data is better protected here.')}</p>`
    : `<h3>${esc(ETAPES[p].titre)}</h3>${ETAPES[p].html}`;
  dlg.querySelector('[data-installer-corps]').innerHTML = `
    <p>${L('L’appli s’ouvre en plein écran depuis son icône, marche <strong>hors connexion</strong> (échiquier, moteur, leçons) et <strong>garde mieux tes données</strong> : sur iPhone, Safari peut effacer les données d’un site non installé après quelques semaines sans visite.', 'The app opens full screen from its icon, works <strong>offline</strong> (board, engine, lessons) and <strong>keeps your data safer</strong>: on iPhone, Safari may erase the data of a site that is not installed after a few weeks without a visit.')}</p>
    ${emporter}${deja}
    <details class="inst-autres"><summary>${L('Autre appareil', 'Other device')}</summary>${autres.map(([, e]) => `<h4>${esc(e.titre)}</h4>${e.html}`).join('')}</details>
    <h3>💾 ${L('Sauvegarder mes données', 'Back up my data')}</h3>
    <p class="muted small">${L('Tout est enregistré uniquement sur cet appareil. Un fichier de sauvegarde (sans tes codes secrets) te permet de tout récupérer, ou de passer sur un autre appareil : ⚙ Réglages → Mes données → Importer.', 'Everything is saved only on this device. A backup file (without your secret codes) lets you recover everything, or move to another device: ⚙ Settings → My data → Import.')}</p>
    <p><button type="button" data-install-sauver>⤓ ${L('Sauvegarder maintenant', 'Back up now')}</button></p>
    <p class="muted small" data-install-derniere role="status">${esc(texteDerniereSauvegarde(etat))}</p>`;
  majBoutons();
  dlg.querySelectorAll('[data-install-direct]').forEach((b) => { b.onclick = () => installerDirect().then((ok) => { if (ok) dlg.close(); }); });
  dlg.querySelectorAll('[data-install-copier]').forEach((b) => {
    b.onclick = async () => {
      const out = b.parentElement.querySelector('[data-install-copie]');
      try { await navigator.clipboard.writeText(location.href.split('#')[0]); out.textContent = L('Adresse copiée : colle-la dans Safari.', 'Address copied: paste it into Safari.'); } catch { out.textContent = location.href.split('#')[0]; }
    };
  });
  dlg.querySelectorAll('[data-install-copier-donnees]').forEach((b) => {
    b.onclick = async () => {
      const r = await copierDonnees();
      b.parentElement.querySelector('[data-install-copie-donnees]').textContent = r.ok
        ? L('✔ Copié. Installe l’appli puis colle dans ⚙ Réglages → Mes données.', '✔ Copied. Install the app, then paste in ⚙ Settings → My data.')
        : L('Copie impossible ici : utilise plutôt « Sauvegarder maintenant » (fichier), puis « Importer un fichier » dans l’appli.', 'Copy not possible here: use “Back up now” (file) instead, then “Import a file” in the app.');
    };
  });
  dlg.querySelector('[data-install-sauver]').onclick = () => {
    const dump = sauvegarder();
    dlg.querySelector('[data-install-derniere]').textContent = L(`Fichier créé (${describe(dump)}). Range-le dans Fichiers, Drive ou tes e-mails.`, `File created (${describe(dump)}). Keep it in Files, Drive or your e-mails.`);
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
  bar.setAttribute('aria-label', L('Conseil', 'Tip'));
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
      `<p><strong>${L(`📲 Installe BlitzRefute sur ton ${ios || p === 'android' ? 'téléphone' : 'appareil'}`, `📲 Install BlitzRefute on your ${ios || p === 'android' ? 'phone' : 'device'}`)}</strong><br><span class="small">${L('Une icône comme une vraie appli, hors connexion, et ta progression mieux protégée.', 'An icon like a real app, offline, and your progress better protected.')}</span></p>`,
      [
        { label: L('Plus tard', 'Later'), run: () => { const e = lire(); ecrire({ ...e, refusInstall: (e.refusInstall || 0) + 1, installPlusTard: jourDe(now) }); } },
        { label: invitation && !ios ? L('Installer', 'Install') : L('Voir comment', 'See how'), primary: true, run: () => (invitation && !ios ? installerDirect() : ouvrirGuide()) },
      ],
    );
  }
  const r = rappelSauvegarde(etat, { now, donnees: aDesDonnees(), risque: risque() });
  if (r) {
    const txt = r.jamais ? L('Tu n’as encore jamais sauvegardé ta progression.', 'You have never backed up your progress yet.') : L(`Dernière sauvegarde il y a ${r.jours} jours.`, `Last backup ${r.jours} days ago.`);
    return bandeau(
      `<p><strong>${L('💾 Pense à sauvegarder', '💾 Remember to back up')}</strong><br><span class="small">${esc(txt)} ${L('Tes données ne sont que sur cet appareil : un fichier suffit pour tout récupérer.', 'Your data is only on this device: one file is enough to recover everything.')}</span></p>`,
      [
        { label: L('Plus tard', 'Later'), run: () => ecrire({ ...lire(), sauvegardePlusTard: jourDe(now) }) },
        { label: L('Sauvegarder', 'Back up'), primary: true, run: () => sauvegarder(now) },
      ],
    );
  }
  return null;
}

// Mémorisé pour la session seulement : écrire une clé coach-echecs:* ferait passer le
// visiteur pour un utilisateur existant (mon-repertoire.initChoix).
const RECUP_VU = 'blitzrefute-recup-proposee';
export function proposerRecuperation() {
  try { if (sessionStorage.getItem(RECUP_VU)) return null; } catch { /* stockage bloqué */ }
  if (document.querySelector('.inst-bandeau, dialog[open]')) return null;
  const vu = () => { try { sessionStorage.setItem(RECUP_VU, '1'); } catch { /* stockage bloqué */ } };
  return bandeau(
    `<p><strong>${L('📥 Tu utilisais BlitzRefute dans ton navigateur ?', '📥 Were you using BlitzRefute in your browser?')}</strong><br><span class="small">${L('L’appli installée démarre vide : tes données sont restées dans le navigateur. Copie-les là-bas (⚙ Réglages → Mes données → « Copier mes données » ou « Exporter »), puis colle-les ici.', 'The installed app starts empty: your data stayed in the browser. Copy it there (⚙ Settings → My data → “Copy my data” or “Export”), then paste it here.')}</span></p>`,
    [
      { label: L('Non, je commence', 'No, I’m new'), run: vu },
      { label: L('Récupérer mes données', 'Recover my data'), primary: true, run: () => {
        vu();
        $('btn-settings')?.click();
        setTimeout(() => {
          $('data-paste-box')?.classList.remove('hidden');
          $('data-titre')?.scrollIntoView({ block: 'start' });
        }, 200);
      } },
    ],
  );
}

// ---------- Réglages : section « Application sur l'écran d'accueil » + date de sauvegarde ----------
const HORS_LIGNE = L('Après une première visite en ligne, le moteur, les fiches du répertoire et l’entraînement fonctionnent hors connexion.', 'After a first online visit, the engine, the repertoire lines and training work offline.');

async function majReglages() {
  const text = $('pwa-install-text');
  if (text) {
    const prot = (await persistant()) ? L(' Stockage protégé par le navigateur ✔.', ' Storage protected by the browser ✔.') : '';
    text.textContent = installee() ? L(`Application installée. ${HORS_LIGNE}${prot}`, `App installed. ${HORS_LIGNE}${prot}`) : L(`Installe l’appli pour l’ouvrir depuis une icône et mieux protéger tes données. ${HORS_LIGNE}${prot}`, `Install the app to open it from an icon and better protect your data. ${HORS_LIGNE}${prot}`);
  }
  const last = $('data-last');
  if (last) last.textContent = texteDerniereSauvegarde(lire());
}

function sectionReglages() {
  const form = $('form-settings');
  if (!form || $('pwa-install')) return;
  const box = document.createElement('section');
  box.id = 'pwa-install';
  box.innerHTML = `<h3>${L('Application sur l’écran d’accueil', 'App on the home screen')}</h3>
    <p class="muted small" id="pwa-install-text"></p>
    <div class="dlg-actions left"><button type="button" id="pwa-install-btn" data-install-direct hidden>${L('Installer l’application', 'Install the app')}</button> <button type="button" id="pwa-guide-btn">📲 ${L('Comment installer l’appli', 'How to install the app')}</button></div>`;
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
  // Appli installée qui s'ouvre vide : les données sont peut-être restées dans le navigateur.
  try {
    if (!localStorage.getItem('coach-echecs:mon-repertoire')) {
      if (installee()) setTimeout(proposerRecuperation, Math.min(delai, 1500));
      return;
    }
  } catch { return; }
  ecrire(noterVisite(lire(), { now, donnees: aDesDonnees() }));
  if (installee()) demanderPersistance();
  setTimeout(() => montrerBandeau(now), delai);
}
