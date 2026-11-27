// Bouton unique « Se connecter avec Lichess » à la place des messages « jeton requis » : les
// statistiques Lichess (Opening Explorer) demandent la connexion officielle. Le clic est géré une
// fois pour toute l'appli (main.js) ; on revient ensuite sur la page où l'on était.
import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

export function boutonLichess(texte = null, { petit = true } = {}) {
  const t = texte || L('♞ Se connecter avec Lichess pour voir les statistiques', '♞ Log in with Lichess to see the statistics');
  return `<button type="button" class="${petit ? 'small-btn ' : ''}lichess-connect" data-lichess-connect>${t}</button>`;
}
