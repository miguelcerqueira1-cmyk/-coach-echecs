// Écran « Mes ouvertures » (#/ouvertures) : choix en 4 étapes (avec les Blancs, contre 1.e4,
// contre 1.d4, contre 1.c4 / 1.Cf3), un ou plusieurs répertoires par étape, étape passable. Enregistré dans
// Mon répertoire ; l'application est ensuite rechargée pour que toutes les pages suivent le choix.
// Accueil unique du premier lancement : tant que la routine n'a pas de profil, deux étapes de plus
// (où et à quelle cadence je joue ; temps par jour et niveau) remplissent la routine (routine-core.js) :
// la routine du jour est alors prête, bâtie sur les ouvertures choisies. Rien ne quitte l'appareil.
import { localiserData } from './donnees-langue.js';
import { GROUPES, REPERTOIRES, parGroupe, choisis, aChoisi, enregistrer } from './mon-repertoire.js';
import { marquer as marquerVisite } from './tour.js';
import { langue } from './i18n.js';
import { charger as chargerRoutine, enregistrer as enregistrerRoutine, profilDe, normaliserProfil, TEMPS, SITES, CADENCES } from './routine-core.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ETAPES = Object.keys(GROUPES);
// Niveau approximatif → difficulté des problèmes de la routine (NIVEAUX de routine-core.js).
export const COTES = [
  { id: 'moins1000', niveau: 'easiest', nom: L('Moins de 1000', 'Under 1000') },
  { id: '1000-1400', niveau: 'easier', nom: '1000 – 1400' },
  { id: 'plus1400', niveau: 'normal', nom: L('Plus de 1400', 'Over 1400') },
  { id: 'inconnu', niveau: 'easiest', nom: L('Je ne sais pas', 'I don’t know') },
];

const TITRES_ROUTINE = { jeu: L('Où je joue', 'Where I play'), temps: L('Mon temps', 'My time') };

export class ChoixPage {
  constructor({ el, onSaved }) {
    this.el = el;
    this.onSaved = onSaved;
    this.counts = null;
  }

  async show() {
    // Point de départ : le choix enregistré, sinon rien de coché (première visite).
    this.sel = new Set(aChoisi() ? choisis() : []);
    this.step = 0;
    // Premier lancement (aucun choix d'ouvertures encore) et routine pas encore configurée :
    // étapes « jeu » et « temps » en plus. « Modifier mes ouvertures » ensuite : ouvertures seules.
    this.avecRoutine = !aChoisi() && !profilDe(chargerRoutine());
    this.etapes = [...ETAPES, ...(this.avecRoutine ? ['jeu', 'temps'] : [])];
    this.profil ??= { temps: 45, sites: [], cadences: [], cote: null };
    this.error = '';
    this.render();
    if (this.counts) return;
    try {
      const data = localiserData(await (await fetch('./data/repertoire.json', { cache: 'no-cache' })).json());
      this.counts = {};
      for (const e of data.entries) this.counts[e.rep] = (this.counts[e.rep] || 0) + 1;
    } catch { this.counts = {}; }
    this.render();
  }

  // Étapes de la routine (premier lancement) : boutons-cartes cochables, comme pour les ouvertures.
  routineHtml(id) {
    const p = this.profil;
    const puce = (groupe, val, label, on) => `<button type="button" class="choix-card choix-mini" data-rt="${groupe}" data-val="${esc(val)}" aria-pressed="${on}"><strong>${esc(label)}</strong><span class="choix-check" aria-hidden="true">${on ? '✔' : ''}</span></button>`;
    if (id === 'jeu') {
      return `<h2 data-choix-q>${L('Où et à quelle cadence joues-tu ?', 'Where and at what time control do you play?')}</h2>
        <p class="small muted">${L('Ta routine du jour te proposera des liens et des exercices adaptés (par exemple Puzzle Storm sur Lichess, Puzzle Rush sur Chess.com).', 'Your daily routine will offer matching links and exercises (for example Puzzle Storm on Lichess, Puzzle Rush on Chess.com).')}</p>
        <h3 class="small">${L('🌐 Sites', '🌐 Sites')}</h3>
        <div class="choix-grid choix-grid-mini">${Object.entries(SITES).map(([k, l]) => puce('sites', k, l, p.sites.includes(k))).join('')}</div>
        <h3 class="small">${L('⚡ Cadences', '⚡ Time controls')}</h3>
        <div class="choix-grid choix-grid-mini">${Object.entries(CADENCES).map(([k, l]) => puce('cadences', k, l, p.cadences.includes(k))).join('')}</div>`;
    }
    const recap = [...this.sel].map((r) => REPERTOIRES[r]?.titre).filter(Boolean);
    return `<h2 data-choix-q>${L('Combien de temps par jour, et quel est ton niveau ?', 'How much time per day, and what is your level?')}</h2>
      <h3 class="small">${L('⏱ Temps par jour', '⏱ Time per day')}</h3>
      <div class="choix-grid choix-grid-mini">${TEMPS.map((t) => puce('temps', t, `${t} min`, Number(p.temps) === t)).join('')}</div>
      <h3 class="small">${L('📈 Ta cote environ (pour régler la difficulté des problèmes)', '📈 Your rating, roughly (to set the puzzle difficulty)')}</h3>
      <div class="choix-grid choix-grid-mini">${COTES.map((c) => puce('cote', c.id, c.nom, p.cote === c.id)).join('')}</div>
      <p class="small choix-recap">${L('Ta routine sera bâtie sur :', 'Your routine will be built on:')} <strong>${recap.map(esc).join(' · ')}</strong> · ${esc(L(`${p.temps} min par jour`, `${p.temps} min a day`))} · ${esc(p.sites.map((x) => SITES[x]).join(' + '))} · ${esc(p.cadences.map((x) => CADENCES[x]).join(', '))}.
      <span class="muted">${L('Tout reste sur ton appareil ; modifiable ensuite (Entraînement → Ma routine → ⚙ Modifier).', 'Everything stays on your device; you can change it later (Training → My routine → ⚙ Edit).')}</span></p>`;
  }

  render() {
    const etape = this.etapes[this.step];
    const g = GROUPES[etape];
    const last = this.step === this.etapes.length - 1;
    const derniereOuverture = this.step === ETAPES.length - 1;
    const card = (r) => {
      const n = this.counts?.[r.id] || 0;
      const on = this.sel.has(r.id);
      return `<button type="button" class="choix-card" data-rep="${esc(r.id)}" aria-pressed="${on}">
        <span class="choix-top"><strong>${r.couleur === 'w' ? '♙' : '♟'} ${esc(r.titre)}</strong>${this.counts ? (n ? `<span class="badge ok">${n} ${L('fiches', 'lines')}</span>` : `<span class="badge soon-badge">${L('bientôt', 'soon')}</span>`) : ''}</span>
        <span class="small muted">${esc(r.sousTitre)}</span>
        <span class="choix-check" aria-hidden="true">${on ? '✔' : ''}</span>
      </button>`;
    };
    const resume = [...this.sel].map((id) => REPERTOIRES[id]?.titre).filter(Boolean);
    this.el.innerHTML = `<div class="choix">
      <ol class="choix-steps" aria-label="${L('Étapes', 'Steps')}">${this.etapes.map((id, i) => `<li class="${i === this.step ? 'on' : i < this.step ? 'done' : ''}">${i + 1}. ${esc(GROUPES[id]?.titre || TITRES_ROUTINE[id])}</li>`).join('')}</ol>
      ${g ? `<h2 data-choix-q>${esc(g.question)}</h2>
      <p class="small muted">${L('Un ou plusieurs choix, ou aucun : passez l’étape. Les ouvertures « bientôt » sont en préparation (fiches vérifiées par Stockfish avant publication).', 'One or more choices, or none: skip the step. Openings marked “soon” are in preparation (lines checked by Stockfish before publication).')}</p>
      <div class="choix-grid">${parGroupe(g.id).map(card).join('')}</div>` : this.routineHtml(etape)}
      ${derniereOuverture ? `<p class="small choix-recap">${L('Votre répertoire :', 'Your repertoire:')} ${resume.length ? `<strong>${resume.map(esc).join(' · ')}</strong>` : `<span class="muted">${L('aucune ouverture choisie pour l’instant', 'no opening chosen yet')}</span>`}</p>` : ''}
      <p class="error-text small" data-choix-err role="alert">${esc(this.error)}</p>
      <div class="actions choix-nav">
        ${this.step ? `<button type="button" data-choix-prev>${L('← Retour', '← Back')}</button>` : ''}
        <button type="button" class="primary" data-choix-next>${last ? (this.avecRoutine ? L('Créer ma routine et commencer', 'Create my routine and start') : L('Valider mes ouvertures', 'Confirm my openings')) : L('Suivant →', 'Next →')}</button>
      </div>
    </div>`;
    this.el.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.rep;
      if (this.sel.has(id)) this.sel.delete(id); else this.sel.add(id);
      this.error = '';
      this.render();
    }));
    this.el.querySelectorAll('[data-rt]').forEach((b) => b.addEventListener('click', () => {
      const { rt, val } = b.dataset;
      const p = this.profil;
      if (rt === 'temps') p.temps = Number(val);
      else if (rt === 'cote') p.cote = val;
      else p[rt] = p[rt].includes(val) ? p[rt].filter((x) => x !== val) : [...p[rt], val];
      this.error = '';
      this.render();
    }));
    this.el.querySelector('[data-choix-prev]')?.addEventListener('click', () => { this.step--; this.error = ''; this.render(); });
    this.el.querySelector('[data-choix-next]').addEventListener('click', () => {
      if (derniereOuverture && !this.sel.size) { this.error = L('Choisissez au moins une ouverture.', 'Choose at least one opening.'); this.render(); return; }
      if (etape === 'jeu' && (!this.profil.sites.length || !this.profil.cadences.length)) { this.error = L('Choisis au moins un site et une cadence.', 'Choose at least one site and one time control.'); this.render(); return; }
      if (!last) { this.step++; this.error = ''; this.render(); window.scrollTo(0, 0); return; }
      try {
        const premierChoix = !aChoisi();
        enregistrer([...this.sel]);
        if (this.avecRoutine) {
          const d = chargerRoutine();
          d.profil = normaliserProfil(this.profil);
          d.niveau = (COTES.find((c) => c.id === this.profil.cote) || COTES[0]).niveau;
          enregistrerRoutine(d);
        }
        if (premierChoix) marquerVisite('a-faire'); // nouvel utilisateur : visite guidée au rechargement
      } catch (e) {
        this.error = e.message;
        this.render();
        return;
      }
      this.onSaved?.();
    });
  }
}
