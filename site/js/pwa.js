// Application installable : enregistrement du service worker (sw.js), bandeau
// « Nouvelle version disponible » et aide à l'installation dans ⚙ Réglages.
// Importé pour ses effets par main.js ; aucune dépendance au reste de l'application.

const $ = (id) => document.getElementById(id);
const UPDATE_CHECK_MS = 30 * 60 * 1000;

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

function injectStyle() {
  const style = document.createElement('style');
  style.textContent = `
.pwa-update { position: fixed; left: 50%; bottom: max(12px, env(safe-area-inset-bottom)); transform: translateX(-50%);
  z-index: 1000; display: flex; align-items: center; gap: .7rem; width: max-content; max-width: calc(100vw - 32px);
  padding: .55rem .6rem .55rem .9rem; border: 1px solid var(--border); border-radius: 999px;
  background: var(--surface-2); color: var(--text); box-shadow: var(--shadow); font-size: .9rem; }
.pwa-update span { white-space: nowrap; }
.pwa-update button { border-radius: 999px; background: var(--accent); color: var(--accent-contrast); border: 0;
  padding: .35rem .8rem; font: inherit; font-weight: 600; cursor: pointer; }`;
  document.head.append(style);
}

function showUpdateBanner(reg) {
  if (document.querySelector('.pwa-update')) return;
  const bar = document.createElement('div');
  bar.className = 'pwa-update';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>Nouvelle version disponible</span><button type="button">Recharger</button>';
  bar.querySelector('button').onclick = () => {
    const waiting = reg.waiting;
    if (!waiting) { location.reload(); return; }
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloaded) { reloaded = true; location.reload(); }
    });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };
  document.body.append(bar);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  let reg;
  try {
    reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch { return; /* navigation privée, stockage refusé… : l'application marche en ligne */ }
  // Une version attend déjà (installée lors d'une visite précédente).
  if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg);
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    sw?.addEventListener('statechange', () => {
      // Sans contrôleur, c'est la première installation : rien à annoncer.
      if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(reg);
    });
  });
  // Application installée : souvent laissée ouverte des jours. Vérification au retour au premier plan.
  let last = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - last > UPDATE_CHECK_MS) {
      last = Date.now();
      reg.update().catch(() => {});
    }
  });
}

// Section « Installer l'application » ajoutée aux Réglages (avant « Avancé »).
function installHelp() {
  const form = $('form-settings');
  if (!form) return;
  const box = document.createElement('section');
  box.id = 'pwa-install';
  box.innerHTML = `<h3>Application sur l’écran d’accueil</h3>
    <p class="muted small" id="pwa-install-text"></p>
    <div class="dlg-actions left"><button type="button" id="pwa-install-btn" hidden>Installer l’application</button></div>`;
  form.insertBefore(box, form.querySelector('details') || form.querySelector('.dlg-actions:last-of-type'));
  const text = $('pwa-install-text');
  const btn = $('pwa-install-btn');
  const offline = 'Après une première visite en ligne, le moteur, les fiches du répertoire et l’entraînement fonctionnent hors connexion.';
  if (standalone()) text.textContent = `Application installée. ${offline}`;
  else if (isIos()) text.textContent = `Sur iPhone/iPad (Safari) : Partager → « Sur l’écran d’accueil ». ${offline}`;
  else text.textContent = `Menu du navigateur → « Installer l’application » (Chrome, Edge) ou « Ajouter à l’écran d’accueil ». ${offline}`;
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // pas de bandeau imposé : le bouton reste discret dans les Réglages
    deferred = e;
    btn.hidden = false;
  });
  btn.onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* rien */ }
    deferred = null;
    btn.hidden = true;
  };
  window.addEventListener('appinstalled', () => {
    btn.hidden = true;
    text.textContent = `Application installée. ${offline}`;
  });
}

injectStyle();
installHelp();
if (document.readyState === 'complete') registerServiceWorker();
else window.addEventListener('load', registerServiceWorker, { once: true });
