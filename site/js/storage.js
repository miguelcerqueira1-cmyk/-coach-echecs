// Sauvegarde locale (sur l'appareil). La partie est enregistrée après chaque modification.
const KEY_GAME = 'coach-echecs:partie:v1';
const KEY_BACKUP = 'coach-echecs:partie-precedente:v1';
const KEY_CORRUPT = 'coach-echecs:partie-illisible';
const KEY_SETTINGS = 'coach-echecs:reglages:v1';
const KEY_CODE = 'coach-echecs:code-acces';
const KEY_LICHESS = 'coach-echecs:jeton-lichess';

function get(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function set(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function del(key) {
  try { localStorage.removeItem(key); } catch { /* rien */ }
}

export function saveGame(record) { return set(KEY_GAME, JSON.stringify(record)); }

export function loadGameRecord() {
  const raw = get(KEY_GAME);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { corrupt: raw }; }
}

// Conserve la partie remplacée (nouvelle partie / import) pour pouvoir la récupérer.
export function backupGame() {
  const raw = get(KEY_GAME);
  if (raw) set(KEY_BACKUP, raw);
}
export function loadBackupRecord() {
  const raw = get(KEY_BACKUP);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function keepCorrupt(raw) { set(KEY_CORRUPT, typeof raw === 'string' ? raw : JSON.stringify(raw)); }

export const DEFAULT_SETTINGS = {
  budget: 'standard',
  level: 'intermediaire',
  autoExplain: true,
  showOpponentArrow: true,
  apiUrl: '', // vide = valeur publiée dans config.json
};

export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(get(KEY_SETTINGS) || '{}')) }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) { set(KEY_SETTINGS, JSON.stringify(s)); }

export function getAccessCode() { return get(KEY_CODE) || ''; }
export function setAccessCode(code) { if (code) set(KEY_CODE, code); else del(KEY_CODE); }

// Jeton Lichess personnel (créé SANS aucune permission) pour l'Opening Explorer.
export function getLichessToken() { return get(KEY_LICHESS) || ''; }
export function setLichessToken(t) { if (t) set(KEY_LICHESS, t); else del(KEY_LICHESS); }
