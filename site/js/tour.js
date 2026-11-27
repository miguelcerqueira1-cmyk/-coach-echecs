// Visite guidée (premier lancement, après le choix des ouvertures ; relançable depuis ⚙ et l'Aide).
// Une bulle fixée en bas de l'écran (lisible sur téléphone), l'élément présenté entouré et amené à
// l'écran ; on change de page par le hash. Aucune donnée envoyée nulle part.

import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

export const KEY = 'coach-echecs:visite'; // 'a-faire' | 'faite'

export const ETAPES = [
  { page: '#/entrainement', cible: '[data-routine]', titre: L('📅 Ta routine du jour', '📅 Your daily routine'), texte: L('Ton programme de chaque jour, adapté à ton temps : problèmes, théorie, parties. Commence toujours ici.', 'Your plan for each day, fitted to your time: puzzles, theory, games. Always start here.') },
  { page: '#/entrainement', cible: '.tuiles', titre: L('📖 Apprendre et s’entraîner', '📖 Learn and practise'), texte: L('Quatre sections : Apprendre (tes ouvertures en leçons), S’entraîner (de mémoire, sur tes erreurs), Réflexes (Rush et anti-trash) et Plus (problèmes, finales, Stockfish).', 'Four sections: Learn (your openings as lessons), Practise (from memory, on your mistakes), Reflexes (Rush and anti-trash) and More (puzzles, endgames, Stockfish).') },
  { page: '#/repertoire', cible: '#page-repertoire', titre: L('📚 Le répertoire', '📚 The repertoire'), texte: L('L’encyclopédie de tes ouvertures : chaque variante avec son plan, ses pièges et comment punir les erreurs adverses.', 'The encyclopedia of your openings: each line with its plan, its traps and how to punish your opponent’s mistakes.') },
  { page: '#/parties', cible: '.games-form', titre: L('🎮 Mes parties', '🎮 My games'), texte: L('Connecte Lichess ou indique ton pseudo Chess.com : l’appli analyse tes parties, ton temps et l’endroit où tu quittes ton répertoire.', 'Connect Lichess or enter your Chess.com username: the app analyses your games, your time and where you leave your repertoire.') },
  { page: '#/moteur', cible: '#board', titre: L('♟ L’échiquier', '♟ The board'), texte: L('Joue n’importe quelle position : Stockfish te conseille le meilleur coup et t’explique pourquoi.', 'Play any position: Stockfish suggests the best move and explains why.') },
  { page: null, cible: '#btn-settings', titre: L('⚙ Réglages et aide', '⚙ Settings and help'), texte: L('Apparence, installation de l’appli sur ton téléphone, tes données, et l’aide si tu as une question. Bon jeu !', 'Appearance, installing the app on your phone, your data, and help if you have a question. Enjoy!') },
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
  bulle.setAttribute('aria-label', L('Visite guidée', 'Guided tour'));
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
      <div class="tour-actions"><button type="button" data-tour-passer>${L('Passer', 'Skip')}</button><button type="button" class="primary" data-tour-suivant>${i === etapes.length - 1 ? L('C’est parti !', 'Let’s go!') : L('Suivant →', 'Next →')}</button></div>`;
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
