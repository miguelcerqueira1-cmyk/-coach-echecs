// Langue de l'interface (français par défaut, anglais au choix). Les pages restent écrites en
// français ; en anglais, la traduction est faite au moment de l'affichage (textes, menus,
// placeholder / aria-label / title) grâce au dictionnaire de i18n-en.js, chargé seulement si besoin.
// La notation des coups (sanFr) et les noms d'ouverture (nomFr) suivent aussi la langue.
export const KEY = 'coach-echecs:langue';

export function langue() {
  try { return globalThis.localStorage?.getItem(KEY) === 'en' ? 'en' : 'fr'; } catch { return 'fr'; }
}

export function choisirLangue(l) {
  try { localStorage.setItem(KEY, l === 'en' ? 'en' : 'fr'); } catch { /* stockage bloqué */ }
  location.reload();
}

// Traduction d'un texte (sans espaces autour). Renvoie null si inconnu.
export function traducteur({ EXACT, MOTIFS }) {
  const memo = new Map();
  const t = (s) => {
    if (memo.has(s)) return memo.get(s);
    let r = EXACT[s] ?? null;
    if (r === null) for (const [re, f] of MOTIFS) { const m = s.match(re); if (m) { r = f(m, (x) => t(x) ?? x); if (r !== null && r !== undefined) break; r = null; } }
    if (r === null) {
      // Symbole ou emoji en tête (♙, ♟, 📖…), cadenas en fin.
      const m = s.match(/^([^\p{L}\p{N}«“(]{1,3}\s)(.+)$/u) || null;
      if (m) { const x = t(m[2]); if (x !== null) r = m[1] + x; }
      const c = r === null && s.match(/^(.+?)(\s🔒)$/u);
      if (c) { const x = t(c[1]); if (x !== null) r = x + c[2]; }
    }
    memo.set(s, r);
    return r;
  };
  return t;
}

const ATTRS = ['placeholder', 'aria-label', 'title'];

function traduireNoeud(n, t) {
  const v = n.nodeValue;
  if (!v || !/\p{L}/u.test(v)) return;
  const m = v.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const x = t(m[2].replace(/\s+/g, ' '));
  if (x !== null && x !== m[2]) n.nodeValue = m[1] + x + m[3];
}

function traduireArbre(root, t) {
  if (root.nodeType === 3) { if (!root.parentElement?.closest('[data-no-i18n],script,style')) traduireNoeud(root, t); return; }
  if (root.nodeType !== 1 || root.closest('[data-no-i18n],script,style')) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) if (!n.parentElement.closest('[data-no-i18n],script,style')) traduireNoeud(n, t);
  for (const el of [root, ...root.querySelectorAll('[placeholder],[aria-label],[title]')]) {
    for (const a of ATTRS) {
      const v = el.getAttribute?.(a);
      if (v) { const x = t(v.trim()); if (x !== null && x !== v) el.setAttribute(a, x); }
    }
  }
}

// Démarrage : en anglais, traduit la page puis tout ce qui s'affiche ensuite.
export async function initLangue() {
  document.documentElement.lang = langue();
  if (langue() !== 'en') return null;
  const t = traducteur(await import('./i18n-en.js'));
  traduireArbre(document.body, t);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') traduireArbre(m.target, t);
      else if (m.type === 'attributes') traduireArbre(m.target, t);
      else m.addedNodes.forEach((x) => traduireArbre(x, t));
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // Boîtes de dialogue du navigateur.
  const conf = window.confirm.bind(window);
  window.confirm = (msg) => conf(t(String(msg)) ?? msg);
  return t;
}
