// Écran « Mes ouvertures » (#/ouvertures) : choix en 3 étapes (avec les Blancs, contre 1.e4,
// contre 1.d4), un ou plusieurs répertoires par étape, étape passable. Enregistré dans
// Mon répertoire ; l'application est ensuite rechargée pour que toutes les pages suivent le choix.
import { GROUPES, REPERTOIRES, parGroupe, choisis, aChoisi, enregistrer } from './mon-repertoire.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ETAPES = Object.keys(GROUPES);

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
    this.error = '';
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
    const g = GROUPES[ETAPES[this.step]];
    const last = this.step === ETAPES.length - 1;
    const card = (r) => {
      const n = this.counts?.[r.id] || 0;
      const on = this.sel.has(r.id);
      return `<button type="button" class="choix-card" data-rep="${esc(r.id)}" aria-pressed="${on}">
        <span class="choix-top"><strong>${r.couleur === 'w' ? '♙' : '♟'} ${esc(r.titre)}</strong>${this.counts ? (n ? `<span class="badge ok">${n} fiches</span>` : '<span class="badge soon-badge">bientôt</span>') : ''}</span>
        <span class="small muted">${esc(r.sousTitre)}</span>
        <span class="choix-check" aria-hidden="true">${on ? '✔' : ''}</span>
      </button>`;
    };
    const resume = [...this.sel].map((id) => REPERTOIRES[id]?.titre).filter(Boolean);
    this.el.innerHTML = `<div class="choix">
      <ol class="choix-steps" aria-label="Étapes">${ETAPES.map((id, i) => `<li class="${i === this.step ? 'on' : i < this.step ? 'done' : ''}">${i + 1}. ${esc(GROUPES[id].titre)}</li>`).join('')}</ol>
      <h2 data-choix-q>${esc(g.question)}</h2>
      <p class="small muted">Un ou plusieurs choix, ou aucun : passez l’étape. Les ouvertures « bientôt » sont en préparation (fiches vérifiées par Stockfish avant publication).</p>
      <div class="choix-grid">${parGroupe(g.id).map(card).join('')}</div>
      ${last ? `<p class="small choix-recap">Votre répertoire : ${resume.length ? `<strong>${resume.map(esc).join(' · ')}</strong>` : '<span class="muted">aucune ouverture choisie pour l’instant</span>'}</p>` : ''}
      <p class="error-text small" data-choix-err role="alert">${esc(this.error)}</p>
      <div class="actions choix-nav">
        ${this.step ? '<button type="button" data-choix-prev>← Retour</button>' : ''}
        <button type="button" class="primary" data-choix-next>${last ? 'Valider mes ouvertures' : 'Suivant →'}</button>
      </div>
    </div>`;
    this.el.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.rep;
      if (this.sel.has(id)) this.sel.delete(id); else this.sel.add(id);
      this.error = '';
      this.render();
    }));
    this.el.querySelector('[data-choix-prev]')?.addEventListener('click', () => { this.step--; this.error = ''; this.render(); });
    this.el.querySelector('[data-choix-next]').addEventListener('click', () => {
      if (!last) { this.step++; this.render(); window.scrollTo(0, 0); return; }
      try {
        enregistrer([...this.sel]);
      } catch (e) {
        this.error = e.message;
        this.render();
        return;
      }
      this.onSaved?.();
    });
  }
}
