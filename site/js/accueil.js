// Page d'accueil publique (#/accueil) : présentation de BlitzRefute, ouvertures couvertes,
// formule Gratuit / Pro, puis « Choisir mes ouvertures ». Montrée à la première visite.
// Aucun témoignage ni chiffre inventé : les nombres de fiches viennent de data/repertoire.json.
import { GROUPES, REPERTOIRES, parGroupe, aChoisi } from './mon-repertoire.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FEATURES = [
  ['♟', 'Moteur d’analyse', 'Stockfish 18 dans votre navigateur : le meilleur coup, trois candidats comparés, l’explication de chaque conseil. Gratuit, même hors connexion.'],
  ['📚', 'Encyclopédie des ouvertures', 'Pour chaque variante : plan, structure, cases clés, pièges et réfutations vérifiés par Stockfish, statistiques Lichess et vidéos choisies.'],
  ['⏱', 'Réflexes anti-trash', 'Les coups douteux qu’on croise en Blitz, et la punition à trouver avant la fin du chrono.'],
  ['📖', 'Cours et répétition espacée', 'Chaque variante en leçon pas à pas, puis à rejouer de mémoire : les positions ratées reviennent jusqu’à ce qu’elles soient acquises.'],
  ['🎯', 'Vos vraies parties', 'Vos parties Lichess et Chess.com analysées : sorties de répertoire et punitions manquées deviennent des exercices.'],
  ['📱', 'Sur téléphone et ordinateur', 'Rien à installer ; l’appli s’ajoute à l’écran d’accueil et fonctionne hors connexion.'],
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
      const data = await (await fetch('./data/repertoire.json', { cache: 'no-cache' })).json();
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
      return `<li class="acc-opening"><span>${r.couleur === 'w' ? '♙' : '♟'} ${esc(r.titre)}</span>${c ? (n ? `<span class="badge ok">${n} fiches</span>` : '<span class="badge soon-badge">bientôt</span>') : ''}</li>`;
    };
    const cta = aChoisi() ? 'Modifier mes ouvertures' : 'Choisir mes ouvertures';
    this.el.innerHTML = `<div class="acc">
      <section class="acc-hero">
        <span class="brand-mark acc-mark" aria-hidden="true">⚡</span>
        <h2 class="acc-title">BlitzRefute</h2>
        <p class="acc-tagline">L’encyclopédie interactive et l’arme fatale pour maîtriser tes ouvertures et détruire les pièges en Blitz.</p>
        <div class="acc-cta">
          <a class="pro-cta acc-main" href="#/ouvertures" data-acc-choix>${cta} →</a>
          <a class="btn-like" href="#/moteur">Analyser une position (gratuit)</a>
        </div>
        <p class="muted small">Stockfish calcule, chess.js vérifie les règles : aucune évaluation, aucun piège ni aucune statistique n’est inventé.</p>
      </section>

      <section class="acc-features" aria-label="Ce que fait BlitzRefute">
        ${FEATURES.map(([i, t, d]) => `<article class="card acc-feature"><span class="pro-ico" aria-hidden="true">${i}</span><h3>${esc(t)}</h3><p class="small">${esc(d)}</p></article>`).join('')}
      </section>

      <section class="card acc-openings">
        <h2>Les ouvertures</h2>
        <p class="small muted">Choisissez les vôtres : l’appli ne vous montre que celles-là.${total ? ` ${total} fiches publiées à ce jour ; les ouvertures « bientôt » sont en préparation.` : ''}</p>
        <div class="acc-groups">
          ${Object.values(GROUPES).map((g) => `<div><h3>${esc(g.titre)}</h3><ul class="acc-list">${parGroupe(g.id).map(opening).join('')}</ul></div>`).join('')}
        </div>
      </section>

      <section class="card acc-steps">
        <h2>Comment ça marche</h2>
        <ol>
          <li><strong>Choisissez vos ouvertures</strong> : avec les Blancs, contre 1.e4, contre 1.d4.</li>
          <li><strong>Apprenez</strong> chaque variante en leçon, avec ses pièges et ses punitions à jouer sur l’échiquier.</li>
          <li><strong>Entraînez-vous</strong> : lignes de mémoire, réflexes anti-trash chronométrés, et vos propres erreurs tirées de vos parties.</li>
        </ol>
      </section>

      <section class="acc-pricing" aria-label="Formules">
        <article class="card acc-plan">
          <h3>Gratuit</h3>
          <p class="acc-price">0 €</p>
          <ul class="small"><li>Moteur d’analyse Stockfish</li><li>Mes parties : import et analyse</li><li>Une variante de base par ouverture (fiche et leçon)</li></ul>
        </article>
        <article class="card acc-plan pro">
          <h3>Pro</h3>
          <p class="acc-price">29 € <span class="small muted">accès à vie</span></p>
          <ul class="small"><li>Toutes les variantes de vos ouvertures</li><li>Réflexes anti-trash et répétition espacée</li><li>Mes vraies erreurs, tous les cours</li></ul>
          <p class="pro-soon small">Le paiement en ligne ouvre bientôt.</p>
        </article>
      </section>

      <p class="acc-bottom"><a class="pro-cta acc-main" href="#/ouvertures">${cta} →</a></p>
    </div>`;
  }
}

export { REPERTOIRES };
