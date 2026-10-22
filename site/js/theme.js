// Apparence : thème de l'interface, style d'échiquier et couleur principale.
// Appliqués par attributs sur <html> (data-theme, data-board) et variables CSS ;
// les couleurs elles-mêmes sont dans css/app.css. Le petit script en tête de
// index.html applique déjà les réglages enregistrés avant l'affichage (pas de flash).

export const THEMES = {
  neon: { label: 'Nuit néon', board: 'neon', meta: '#0b0d1e' },
  sombre: { label: 'Sombre classique', board: 'classique', meta: '#0f1312' },
  clair: { label: 'Clair', board: 'classique-clair', meta: '#f4f2ec' },
};

export const BOARDS = {
  auto: 'Assorti au thème',
  neon: 'Néon',
  erable: 'Érable',
  noyer: 'Noyer',
  marbre: 'Marbre',
  ardoise: 'Ardoise bleue',
  sapin: 'Sapin',
  corail: 'Corail',
  encre: 'Encre et papier',
  classique: 'Classique (vert)',
};

// Texte lisible sur la couleur principale : sombre sur une couleur claire, blanc sinon.
export function contrastOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.25 ? '#0b0d1e' : '#ffffff';
}

export function applyAppearance({ theme = 'neon', board = 'auto', accent = '' } = {}, root = document.documentElement) {
  const t = THEMES[theme] ? theme : 'neon';
  root.dataset.theme = t === 'sombre' ? 'dark' : t === 'clair' ? 'light' : 'neon';
  root.dataset.board = !board || board === 'auto' || !BOARDS[board] ? THEMES[t].board : board;
  const on = contrastOn(accent);
  if (on) {
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-contrast', on);
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-contrast');
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[t].meta);
}
