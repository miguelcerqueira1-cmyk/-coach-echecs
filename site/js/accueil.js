// Page d'accueil publique (#/accueil) : présentation de BlitzRefute, ouvertures couvertes,
// formule Gratuit / Pro, puis « Choisir mes ouvertures ». Montrée à la première visite.
// Aucun témoignage ni chiffre inventé : les nombres de fiches viennent de data/repertoire.json.
import { localiserData } from './donnees-langue.js';
import { GROUPES, REPERTOIRES, parGroupe, aChoisi } from './mon-repertoire.js';
import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FEATURES = [
  ['♟', L('Moteur d’analyse', 'Analysis engine'), L('Stockfish 18 dans votre navigateur : le meilleur coup, trois candidats comparés, l’explication de chaque conseil. Gratuit, même hors connexion.', 'Stockfish 18 in your browser: the best move, three candidates compared, an explanation for each suggestion. Free, even offline.')],
  ['📚', L('Encyclopédie des ouvertures', 'Openings encyclopedia'), L('Pour chaque variante : plan, structure, cases clés, pièges et réfutations vérifiés par Stockfish, statistiques Lichess et vidéos choisies.', 'For each line: plan, structure, key squares, traps and refutations checked by Stockfish, Lichess statistics and selected videos.')],
  ['⏱', L('Réflexes anti-trash', 'Anti-trash reflexes'), L('Les coups douteux qu’on croise en Blitz, et la punition à trouver avant la fin du chrono.', 'The dubious moves you meet in Blitz, and the punishment to find before the clock runs out.')],
  ['📖', L('Cours et répétition espacée', 'Lessons and spaced repetition'), L('Chaque variante en leçon pas à pas, puis à rejouer de mémoire : les positions ratées reviennent jusqu’à ce qu’elles soient acquises.', 'Each line as a step-by-step lesson, then replayed from memory: missed positions come back until they are learned.')],
  ['🎯', L('Vos vraies parties', 'Your real games'), L('Vos parties Lichess et Chess.com analysées : sorties de répertoire et punitions manquées deviennent des exercices.', 'Your Lichess and Chess.com games analysed: repertoire deviations and missed punishments become exercises.')],
  ['📱', L('Sur téléphone et ordinateur', 'On phone and computer'), L('Rien à installer ; l’appli s’ajoute à l’écran d’accueil et fonctionne hors connexion.', 'Nothing to install; the app adds itself to the home screen and works offline.')],
];

export class AccueilPage {
  constructor({ el }) {
    this.el = el;
    this.counts = null;
  }

  async show() {
    this.render();
    if (this.counts) return;
    try {
      const data = localiserData(await (await fetch('./data/repertoire.json', { cache: 'no-cache' })).json());
      this.counts = {};
      for (const e of data.entries) this.counts[e.rep] = (this.counts[e.rep] || 0) + 1;
    } catch { this.counts = {}; }
    this.render();
  }

  render() {
    const c = this.counts;
    const total = c ? Object.values(c).reduce((a, b) => a + b, 0) : null;
    const opening = (r) => {
      const n = c?.[r.id] || 0;
      return `<li class="acc-opening"><span>${r.couleur === 'w' ? '♙' : '♟'} ${esc(r.titre)}</span>${c ? (n ? `<span class="badge ok">${n} ${L('fiches', 'lines')}</span>` : `<span class="badge soon-badge">${L('bientôt', 'soon')}</span>`) : ''}</li>`;
    };
    const cta = aChoisi() ? L('Modifier mes ouvertures', 'Change my openings') : L('Choisir mes ouvertures', 'Choose my openings');
    this.el.innerHTML = `<div class="acc">
      <section class="acc-hero">
        <span class="brand-mark acc-mark" aria-hidden="true">⚡</span>
        <h2 class="acc-title">BlitzRefute</h2>
        <p class="acc-tagline">${L('L’encyclopédie interactive et l’arme fatale pour maîtriser tes ouvertures et détruire les pièges en Blitz.', 'The interactive encyclopedia and the ultimate weapon to master your openings and crush traps in Blitz.')}</p>
        <div class="acc-cta">
          <a class="pro-cta acc-main" href="#/ouvertures" data-acc-choix>${cta} →</a>
          <a class="btn-like" href="#/moteur">${L('Analyser une position (gratuit)', 'Analyse a position (free)')}</a>
        </div>
        <p class="muted small">${L('Stockfish calcule, chess.js vérifie les règles : aucune évaluation, aucun piège ni aucune statistique n’est inventé.', 'Stockfish calculates, chess.js checks the rules: no evaluation, trap or statistic is made up.')}</p>
        <p class="muted tiny">${L('Fonctionne avec tes comptes Lichess et Chess.com. BlitzRefute est une application indépendante, ni affiliée ni approuvée par Lichess ou Chess.com.', 'Works with your Lichess and Chess.com accounts. BlitzRefute is an independent app, neither affiliated with nor endorsed by Lichess or Chess.com.')}</p>
      </section>

      <section class="acc-features" aria-label="${L('Ce que fait BlitzRefute', 'What BlitzRefute does')}">
        ${FEATURES.map(([i, t, d]) => `<article class="card acc-feature"><span class="pro-ico" aria-hidden="true">${i}</span><h3>${esc(t)}</h3><p class="small">${esc(d)}</p></article>`).join('')}
      </section>

      <section class="card acc-openings">
        <h2>${L('Les ouvertures', 'The openings')}</h2>
        <p class="small muted">${L('Choisissez les vôtres : l’appli ne vous montre que celles-là.', 'Choose yours: the app only shows you those.')}${total ? L(` ${total} fiches publiées à ce jour ; les ouvertures « bientôt » sont en préparation.`, ` ${total} lines published so far; openings marked “soon” are in preparation.`) : ''}</p>
        <div class="acc-groups">
          ${Object.values(GROUPES).map((g) => `<div><h3>${esc(g.titre)}</h3><ul class="acc-list">${parGroupe(g.id).map(opening).join('')}</ul></div>`).join('')}
        </div>
      </section>

      <section class="card acc-steps">
        <h2>${L('Comment ça marche', 'How it works')}</h2>
        <ol>
          <li>${L('<strong>Choisissez vos ouvertures</strong> : avec les Blancs, contre 1.e4, contre 1.d4.', '<strong>Choose your openings</strong>: with White, against 1.e4, against 1.d4.')}</li>
          <li>${L('<strong>Apprenez</strong> chaque variante en leçon, avec ses pièges et ses punitions à jouer sur l’échiquier.', '<strong>Learn</strong> each line as a lesson, with its traps and punishments to play on the board.')}</li>
          <li>${L('<strong>Entraînez-vous</strong> : lignes de mémoire, réflexes anti-trash chronométrés, et vos propres erreurs tirées de vos parties.', '<strong>Train</strong>: lines from memory, timed anti-trash reflexes, and your own mistakes taken from your games.')}</li>
        </ol>
      </section>

      <section class="acc-pricing" aria-label="${L('Formules', 'Plans')}">
        <article class="card acc-plan">
          <h3>${L('Gratuit', 'Free')}</h3>
          <p class="acc-price">0 €</p>
          <ul class="small"><li>${L('Moteur d’analyse Stockfish', 'Stockfish analysis engine')}</li><li>${L('Mes parties : import et analyse', 'My games: import and analysis')}</li><li>${L('Une variante de base par ouverture (fiche et leçon)', 'One basic line per opening (line and lesson)')}</li></ul>
        </article>
        <article class="card acc-plan pro">
          <h3>Pro</h3>
          <p class="acc-price">29 € <span class="small muted">${L('accès à vie', 'lifetime access')}</span></p>
          <ul class="small"><li>${L('Toutes les variantes de vos ouvertures', 'All the lines of your openings')}</li><li>${L('Réflexes anti-trash et répétition espacée', 'Anti-trash reflexes and spaced repetition')}</li><li>${L('Positions de mes parties, tous les cours', 'Positions from my games, all the lessons')}</li></ul>
          <p class="pro-soon small">${L('Le paiement en ligne ouvre bientôt.', 'Online payment opens soon.')}</p>
        </article>
      </section>

      <p class="acc-bottom"><a class="pro-cta acc-main" href="#/ouvertures">${cta} →</a></p>
    </div>`;
  }
}

export { REPERTOIRES };
