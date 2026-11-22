// Visite guidée (premier lancement, après le choix des ouvertures ; relançable depuis ⚙ et l'Aide).
// Une bulle fixée en bas de l'écran (lisible sur téléphone), l'élément présenté entouré et amené à
// l'écran ; on change de page par le hash. Aucune donnée envoyée nulle part.

export const KEY = 'coach-echecs:visite'; // 'a-faire' | 'faite'

export const ETAPES = [
  { page: '#/entrainement', cible: '[data-routine]', titre: '📅 Ta routine du jour', texte: 'Ton programme de chaque jour, adapté à ton temps : problèmes, théorie, parties. Commence toujours ici.' },
  { page: '#/entrainement', cible: '.hub-learn', titre: '📖 Apprendre', texte: 'Tes ouvertures en leçons, une variante à la fois : les coups, les pièges, puis tu rejoues toi-même.' },
  { page: '#/repertoire', cible: '#page-repertoire', titre: '📚 Le répertoire', texte: 'L’encyclopédie de tes ouvertures : chaque variante avec son plan, ses pièges et comment punir les erreurs adverses.' },
  { page: '#/parties', cible: '.games-form', titre: '🎮 Mes parties', texte: 'Connecte Lichess ou indique ton pseudo Chess.com : l’appli analyse tes parties, ton temps et l’endroit où tu quittes ton répertoire.' },
  { page: '#/moteur', cible: '#board', titre: '♟ L’échiquier', texte: 'Joue n’importe quelle position : Stockfish te conseille le meilleur coup et t’explique pourquoi.' },
  { page: null, cible: '#btn-settings', titre: '⚙ Réglages et aide', texte: 'Apparence, installation de l’appli sur ton téléphone, tes données, et l’aide si tu as une question. Bon jeu !' },
];

export function aFaire(storage = localStorage) {
  try { return storage.getItem(KEY) === 'a-faire'; } catch { return false; }
}

export function marquer(etat, storage = localStorage) {
  try { storage.setItem(KEY, etat); } catch { /* stockage bloqué */ }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function lancerVisite({ etapes = ETAPES } = {}) {
  document.querySelector('.tour-bulle')?.remove();
  let i = 0;
  let cible = null;
  const bulle = document.createElement('div');
  bulle.className = 'tour-bulle';
  bulle.setAttribute('role', 'dialog');
  bulle.setAttribute('aria-label', 'Visite guidée');
  document.body.append(bulle);

  const nettoyer = () => { cible?.classList.remove('tour-cible'); cible = null; };
  const fin = () => { nettoyer(); bulle.remove(); marquer('faite'); };

  const attendre = (sel, ms = 3000) => new Promise((res) => {
    const t0 = performance.now();
    const essai = () => {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) res(el);
      else if (performance.now() - t0 > ms) res(null);
      else setTimeout(essai, 100);
    };
    essai();
  });

  const montrer = async () => {
    const e = etapes[i];
    nettoyer();
    if (e.page && location.hash !== e.page) location.hash = e.page;
    bulle.innerHTML = `<p class="tour-num">${i + 1} / ${etapes.length}</p><h3>${esc(e.titre)}</h3><p>${esc(e.texte)}</p>
      <div class="tour-actions"><button type="button" data-tour-passer>Passer</button><button type="button" class="primary" data-tour-suivant>${i === etapes.length - 1 ? 'C’est parti !' : 'Suivant →'}</button></div>`;
    bulle.querySelector('[data-tour-passer]').addEventListener('click', fin);
    bulle.querySelector('[data-tour-suivant]').addEventListener('click', () => {
      if (i >= etapes.length - 1) { fin(); return; }
      i++;
      montrer();
    });
    bulle.querySelector('[data-tour-suivant]').focus({ preventScroll: true });
    const el = await attendre(e.cible);
    if (etapes[i] !== e || !bulle.isConnected) return;
    if (el) {
      cible = el;
      el.classList.add('tour-cible');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  montrer();
}
