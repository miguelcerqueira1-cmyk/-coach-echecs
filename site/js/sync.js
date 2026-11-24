// Synchronisation entre appareils (⚙ Réglages) : envoi et réception des données de l'appli
// (« Mes données », sans les secrets), chiffrées sur l'appareil avec le code de l'utilisateur
// (sync-core). Serveur : le Worker de l'appli (/v1/sync/<identifiant>). Automatique si activée :
// au démarrage (recevoir ce qui est plus récent, ou envoyer), et quand l'appli passe en arrière-plan.
import { nouveauCode, normaliser, valide, formater, identifiant, chiffrer, dechiffrer, empreinte, decision } from './sync-core.js';
import { exportData, importData, describe } from './transfer.js';
import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

export const CLE = 'coach-echecs:sync-cle'; // secret local, jamais exporté
export const ETAT = 'coach-echecs:sync-v1'; // { version, empreinte, date, auto }
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const lireCode = () => { try { return localStorage.getItem(CLE) || ''; } catch { return ''; } };
const lireEtat = () => { try { return { version: 0, auto: true, ...JSON.parse(localStorage.getItem(ETAT) || '{}') }; } catch { return { version: 0, auto: true }; } };
const ecrireEtat = (e) => { try { localStorage.setItem(ETAT, JSON.stringify(e)); } catch { /* stockage plein */ } };

let getApiUrl = () => '';
let occupe = false;

const base = () => String(getApiUrl() || '').replace(/\/+$/, '');
async function url(code) { return `${base()}/v1/sync/${await identifiant(code)}`; }

async function lireDistant(code) {
  const r = await fetch(await url(code), { cache: 'no-store' });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || L(`Serveur : erreur ${r.status}`, `Server: error ${r.status}`));
  return j;
}

// Envoie les données de l'appareil. Renvoie 'ok' | 'conflit'.
export async function envoyer(code = lireCode(), { forcer = false } = {}) {
  const etat = lireEtat();
  const dump = exportData();
  let version = etat.version || 0;
  if (forcer) version = (await lireDistant(code))?.version || 0;
  const r = await fetch(await url(code), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: await chiffrer(dump, code), version }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 409) return 'conflit';
  if (!r.ok) throw new Error(j.error || L(`Serveur : erreur ${r.status}`, `Server: error ${r.status}`));
  ecrireEtat({ ...etat, version: j.version, empreinte: await empreinte(dump), date: new Date().toISOString() });
  return 'ok';
}

// Remplace les données de l'appareil par celles du serveur (les secrets et l'état propre à
// l'appareil ne sont jamais touchés), puis recharge l'appli.
export async function recevoir(code = lireCode(), distant = null) {
  const d = distant || (await lireDistant(code));
  if (!d) throw new Error(L('Aucune donnée enregistrée pour ce code.', 'No data saved for this code.'));
  const dump = await dechiffrer(d.data, code);
  const avant = Object.keys(exportData().data);
  for (const k of avant) if (!(k in (dump.data || {}))) { try { localStorage.removeItem(k); } catch { /* rien */ } }
  importData(dump);
  ecrireEtat({ ...lireEtat(), version: d.version, empreinte: await empreinte(exportData()), date: new Date().toISOString() });
  return dump;
}

function bandeau(html, actions = []) {
  document.querySelector('.sync-bandeau')?.remove();
  const bar = document.createElement('div');
  bar.className = 'inst-bandeau sync-bandeau';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `${html}<div class="inst-actions">${actions.map((a, i) => `<button type="button" data-i="${i}"${a.primary ? ' class="primary"' : ''}>${esc(a.label)}</button>`).join('')}</div>`;
  bar.querySelectorAll('button').forEach((b) => { b.onclick = () => { bar.remove(); actions[Number(b.dataset.i)].run(); }; });
  document.body.append(bar);
  return bar;
}

// Synchronisation automatique (démarrage, retour au premier plan).
export async function synchroAuto({ silencieux = true, force = false } = {}) {
  const code = lireCode();
  const etat = lireEtat();
  if (!code || (!etat.auto && !force) || !base() || occupe || !navigator.onLine) return 'rien';
  occupe = true;
  try {
    const distant = await lireDistant(code);
    const actuelle = await empreinte(exportData());
    const quoi = decision({ local: etat, actuelle, distante: distant?.version || 0 });
    if (quoi === 'envoyer') {
      if ((await envoyer(code)) === 'conflit') conflit(code);
    } else if (quoi === 'recevoir') {
      await recevoir(code, distant);
      try { sessionStorage.setItem('coach-echecs:sync-recu', '1'); } catch { /* rien */ }
      location.reload();
    } else if (quoi === 'conflit') conflit(code, distant);
    return quoi;
  } catch (e) {
    if (!silencieux) throw e;
    return 'erreur';
  } finally { occupe = false; }
}

function conflit(code, distant = null) {
  bandeau(`<p><strong>${L('🔄 Données différentes sur tes deux appareils', '🔄 Different data on your two devices')}</strong><br><span class="small">${L('Les deux ont changé depuis la dernière synchronisation. Lesquelles garder ?', 'Both have changed since the last sync. Which should be kept?')}</span></p>`, [
    { label: L('Celles de cet appareil', 'This device’s'), run: () => envoyer(code, { forcer: true }).then(() => majReglages()).catch(() => {}) },
    { label: L('Celles de l’autre appareil', 'The other device’s'), primary: true, run: () => recevoir(code, distant).then(() => location.reload()).catch(() => {}) },
  ]);
}

// ---------- Réglages ----------
function message(t, err = false) { const m = $('sync-msg'); if (m) { m.textContent = t; m.classList.toggle('err', err); } }

function majReglages() {
  const box = $('sync-box');
  if (!box) return;
  const code = lireCode();
  const etat = lireEtat();
  if (!base()) {
    box.innerHTML = `<p class="small">${L('La synchronisation n’est pas encore disponible : le serveur de l’appli n’est pas en ligne. En attendant, utilise « Mes données » (fichier) ci-dessous.', 'Sync is not available yet: the app’s server is not online. Meanwhile, use “My data” (file) below.')}</p>`;
    return;
  }
  if (!code) {
    box.innerHTML = `<div class="dlg-actions left"><button type="button" id="sync-activer">${L('Activer sur cet appareil', 'Turn on for this device')}</button></div>
      <label>${L('J’ai déjà un code (autre appareil)', 'I already have a code (other device)')}
        <input id="sync-code-saisi" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-…">
      </label>
      <div class="dlg-actions left"><button type="button" id="sync-utiliser">${L('Utiliser ce code', 'Use this code')}</button></div>`;
    $('sync-activer').onclick = activer;
    $('sync-utiliser').onclick = utiliser;
    return;
  }
  box.innerHTML = `<p class="small">${L('Ton code :', 'Your code:')} <code id="sync-code" data-cache="1">••••-••••-••••-…</code> <button type="button" class="small-btn" id="sync-voir">${L('Afficher', 'Show')}</button> <button type="button" class="small-btn" id="sync-copier">${L('Copier', 'Copy')}</button></p>
    <p class="muted small">${L('Garde ce code pour toi : il donne accès à tes données. Saisis-le sur ton autre appareil (⚙ → Synchronisation → « J’ai déjà un code »).', 'Keep this code to yourself: it gives access to your data. Enter it on your other device (⚙ → Sync → “I already have a code”).')}</p>
    <p class="small">${etat.date ? L(`Dernière synchronisation : ${esc(new Date(etat.date).toLocaleString('fr-FR'))}.`, `Last sync: ${esc(new Date(etat.date).toLocaleString('en-GB'))}.`) : L('Pas encore synchronisé.', 'Not synced yet.')}</p>
    <label class="check"><input type="checkbox" id="sync-auto" ${etat.auto ? 'checked' : ''}> ${L('Synchroniser automatiquement', 'Sync automatically')}</label>
    <div class="dlg-actions left"><button type="button" id="sync-maintenant">🔄 ${L('Synchroniser maintenant', 'Sync now')}</button> <button type="button" id="sync-desactiver">${L('Désactiver sur cet appareil', 'Turn off on this device')}</button></div>`;
  $('sync-voir').onclick = () => { const c = $('sync-code'); const cache = c.dataset.cache === '1'; c.textContent = cache ? formater(code) : '••••-••••-••••-…'; c.dataset.cache = cache ? '0' : '1'; $('sync-voir').textContent = cache ? L('Masquer', 'Hide') : L('Afficher', 'Show'); };
  $('sync-copier').onclick = async () => { try { await navigator.clipboard.writeText(formater(code)); message(L('Code copié.', 'Code copied.')); } catch { message(formater(code)); } };
  $('sync-auto').onchange = (e) => ecrireEtat({ ...lireEtat(), auto: e.target.checked });
  $('sync-maintenant').onclick = maintenant;
  $('sync-desactiver').onclick = () => {
    if (!window.confirm(L('Désactiver la synchronisation sur cet appareil ? Tes données restent sur cet appareil et sur le serveur ; tu pourras la réactiver avec ton code.', 'Turn off sync on this device? Your data stays on this device and on the server; you can turn it back on with your code.'))) return;
    try { localStorage.removeItem(CLE); localStorage.removeItem(ETAT); } catch { /* rien */ }
    majReglages();
    message(L('Synchronisation désactivée sur cet appareil.', 'Sync turned off on this device.'));
  };
}

async function activer() {
  const code = nouveauCode();
  try { localStorage.setItem(CLE, normaliser(code)); } catch { message(L('Stockage impossible sur cet appareil.', 'Storage not possible on this device.'), true); return; }
  ecrireEtat({ version: 0, auto: true });
  message(L('Envoi de tes données…', 'Sending your data…'));
  try {
    if ((await envoyer(normaliser(code))) === 'conflit') throw new Error(L('Code déjà utilisé : réessaie.', 'Code already in use: try again.'));
    majReglages();
    message(L(`✔ Synchronisation activée. Ton code : ${code} — saisis-le sur ton autre appareil.`, `✔ Sync turned on. Your code: ${code} — enter it on your other device.`));
  } catch (e) {
    try { localStorage.removeItem(CLE); } catch { /* rien */ }
    majReglages();
    message(e.message || L('Serveur injoignable.', 'Server unreachable.'), true);
  }
}

async function utiliser() {
  const saisi = $('sync-code-saisi').value;
  if (!valide(saisi)) { message(L('Code invalide : 32 caractères (lettres et chiffres), comme XXXX-XXXX-…', 'Invalid code: 32 characters (letters and digits), like XXXX-XXXX-…'), true); return; }
  const code = normaliser(saisi);
  message(L('Recherche de tes données…', 'Looking for your data…'));
  try {
    const d = await lireDistant(code);
    if (!d) { message(L('Aucune donnée pour ce code. Vérifie-le sur ton autre appareil.', 'No data for this code. Check it on your other device.'), true); return; }
    const dump = await dechiffrer(d.data, code);
    if (!window.confirm(L(`Récupérer tes données (${describe(dump)}) ? Celles de cet appareil seront remplacées.`, `Retrieve your data (${describe(dump)})? The data on this device will be replaced.`))) { message(''); return; }
    try { localStorage.setItem(CLE, code); } catch { /* rien */ }
    ecrireEtat({ version: 0, auto: true });
    await recevoir(code, d);
    message(L('✔ Données récupérées. Rechargement…', '✔ Data retrieved. Reloading…'));
    setTimeout(() => location.reload(), 600);
  } catch (e) { message(e.message || L('Serveur injoignable.', 'Server unreachable.'), true); }
}

async function maintenant() {
  message(L('Synchronisation…', 'Syncing…'));
  try {
    const r = await synchroAuto({ silencieux: false, force: true });
    if (r === 'rien') message(L('✔ Déjà à jour.', '✔ Already up to date.'));
    else if (r === 'envoyer') message(L('✔ Données envoyées.', '✔ Data sent.'));
    else if (r === 'conflit') message(L('Les deux appareils ont changé : choisis lesquelles garder (bandeau en bas).', 'Both devices have changed: choose which data to keep (banner at the bottom).'));
    majReglages();
  } catch (e) { message(e.message || L('Serveur injoignable.', 'Server unreachable.'), true); }
}

function sectionReglages() {
  const form = $('form-settings');
  if (!form || $('sync-section')) return;
  const h = [...form.querySelectorAll('h3')].find((x) => (x.textContent.includes('Mes données') || x.textContent.includes('My data')));
  const sec = document.createElement('section');
  sec.id = 'sync-section';
  sec.innerHTML = `<h3>🔄 ${L('Synchronisation entre appareils', 'Sync between devices')}</h3>
    <p class="muted small">${L('Retrouve ta progression sur ton téléphone et ton ordinateur. Tes données sont chiffrées sur cet appareil avec ton code secret : le serveur ne peut pas les lire. Les codes Lichess, YouTube et d’accès ne sont jamais envoyés.', 'Find your progress on your phone and your computer. Your data is encrypted on this device with your secret code: the server cannot read it. Lichess, YouTube and access codes are never sent.')}</p>
    <div id="sync-box"></div>
    <p id="sync-msg" class="muted small" role="status"></p>`;
  form.insertBefore(sec, h || null);
  $('dlg-settings')?.addEventListener('toggle', majReglages);
  majReglages();
}

// Démarrage (main.js, après initChoix) : section des réglages, synchronisation automatique.
export function demarrerSync({ apiUrl }) {
  getApiUrl = apiUrl;
  sectionReglages();
  try {
    if (sessionStorage.getItem('coach-echecs:sync-recu')) {
      sessionStorage.removeItem('coach-echecs:sync-recu');
      bandeau(`<p><strong>${L('🔄 Données mises à jour', '🔄 Data updated')}</strong><br><span class="small">${L('Ta progression de ton autre appareil a été récupérée.', 'Your progress from your other device has been retrieved.')}</span></p>`, [{ label: 'OK', primary: true, run: () => {} }]);
      return;
    }
  } catch { /* rien */ }
  synchroAuto();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') synchroAuto();
  });
}
