// Ligne « ouverture reconnue » (Moteur, bilan) : nom de l'ouverture et de la variante la plus précise,
// sortie des lignes connues, erreur connue d'une fiche, accès à la fiche / à l'entraînement.
// Calcul local et instantané (ouverture-core.js) ; données chargées une fois (site/data/ouvertures.json).
import { Chess } from '../vendor/chess.js';
import { reconnaitre, cle as cleFen } from './ouverture-core.js';
import { nomFr } from './lesson-core.js';
import { sanFr } from './analysis.js';
import { langue } from './i18n.js';
import { choisis } from './mon-repertoire.js';
import { canOpenFiche } from './pro.js';

const L = (fr, en) => (langue() === 'en' ? en : fr);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let donnees = null;
let promesse = null;
export function chargerOuvertures(url = './data/ouvertures.json') {
  promesse ??= fetch(url).then((r) => (r.ok ? r.json() : null)).then((d) => { donnees = d; return d; }).catch(() => { promesse = null; return null; });
  return promesse;
}
export const ouverturesPretes = () => donnees;

// Numéro de coup lisible : demi-coup 1 = « 1. », 2 = « 1… » (partie depuis la position initiale).
export function numero(ply, startFen) {
  const parts = (startFen || '').split(' ');
  const debut = Number(parts[5] || 1), noirs = parts[1] === 'b' ? 1 : 0;
  const k = ply - 1 + noirs;
  return `${debut + Math.floor(k / 2)}${k % 2 ? '…' : '.'}`;
}

const nomFiche = (f) => (langue() === 'en' ? f[4] || f[2] : f[2]);

function sanDe(fen, uci) {
  try { return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san; } catch { return null; }
}

// Fiche à proposer : d'abord une fiche d'un répertoire choisi (le Répertoire n'affiche que ceux-là).
function ficheProposee(data, idxs) {
  const mes = choisis();
  const i = idxs.find((x) => mes.includes(data.fiches[x][1]));
  return i === undefined ? null : { id: data.fiches[i][0], rep: data.fiches[i][1], nom: nomFiche(data.fiches[i]) };
}

// Résultat structuré (utile aux tests) : fens[i] = position après i demi-coups, sans[i] = coup i+1.
export function etatOuverture(fens, sans, data = donnees) {
  if (!data || !fens?.length) return null;
  const r = reconnaitre(data, fens, sans);
  const fiche = r.fiche ? ficheProposee(data, r.fiche.idx) : null;
  let erreur = null;
  if (r.erreur) {
    // Réfutation à montrer : celle jouée, sinon d'abord une fiche ouverte (gratuite / Pro) d'un répertoire choisi.
    if (r.erreur.trouvee !== true) {
      const mes = choisis();
      const rang = (x) => (canOpenFiche(data.fiches[x.idx][0]) ? 0 : 2) + (mes.includes(data.fiches[x.idx][1]) ? 0 : 1);
      Object.assign(r.erreur, [...r.erreur.liste].sort((a, b) => rang(a) - rang(b))[0]);
    }
    const [id, rep] = data.fiches[r.erreur.idx];
    const nom = nomFiche(data.fiches[r.erreur.idx]);
    const visible = canOpenFiche(id);
    erreur = { ...r.erreur, id, rep, nom, visible, coup: sans[r.erreur.ply - 1], refuteSan: sanDe(fens[r.erreur.ply], r.erreur.refute), choisie: choisis().includes(rep) };
  }
  return { ...r, fiche, erreur };
}

// HTML de la ligne (vide si rien à dire). startFen sert aux numéros de coups.
export function ligneOuvertureHtml(etat, { startFen, boutons = true } = {}) {
  if (!etat) return '';
  const morceaux = [];
  if (etat.nom) {
    morceaux.push(`<span class="ouv-nom" title="${esc(etat.nom.name)}">📖 ${esc(nomFr(etat.nom.name))} <span class="muted">(${esc(etat.nom.eco)})</span></span>`);
  } else if (!etat.sortie && !etat.erreur) {
    return '';
  }
  if (etat.erreur) {
    const e = etat.erreur;
    const coup = e.coup ? `${numero(e.ply, startFen)}${sanFr(e.coup)}` : '';
    const ref = e.refuteSan ? `${numero(e.ply + 1, startFen)}${sanFr(e.refuteSan)}` : '';
    const fiche = `« ${esc(e.nom)} »`;
    let txt;
    if (e.kind === 'd') {
      // Coup douteux (pas une réfutation chiffrée ≥ 1,5) : la fiche montre simplement la bonne réponse.
      if (e.trouvee === true) txt = L(`✅ Bonne réponse au coup douteux : ${ref} (fiche ${fiche})`, `✅ Good answer to the dubious move: ${ref} (line ${fiche})`);
      else if (e.trouvee === false) txt = e.visible ? L(`ℹ La fiche ${fiche} répondait ${ref} à ${coup}`, `ℹ The line ${fiche} answered ${coup} with ${ref}`) : L(`ℹ Coup douteux ${coup} : réponse dans la fiche Pro ${fiche}`, `ℹ Dubious move ${coup}: answer in the Pro line ${fiche}`);
      else txt = e.visible ? L(`⚠ Coup douteux connu : ${coup} — la fiche ${fiche} répond ${ref}`, `⚠ Known dubious move: ${coup} — the line ${fiche} answers ${ref}`) : L(`⚠ Coup douteux connu : ${coup} — réponse dans la fiche Pro ${fiche}`, `⚠ Known dubious move: ${coup} — answer in the Pro line ${fiche}`);
    } else if (e.trouvee === true) txt = L(`✅ Réfutation jouée : ${ref} (fiche ${fiche})`, `✅ Refutation played: ${ref} (line ${fiche})`);
    else if (e.trouvee === false) txt = e.visible ? L(`⚠ Réfutation manquée : ${ref} punissait ${coup} (fiche ${fiche})`, `⚠ Refutation missed: ${ref} punished ${coup} (line ${fiche})`) : L(`⚠ Réfutation manquée après ${coup} : voir la fiche Pro ${fiche}`, `⚠ Refutation missed after ${coup}: see the Pro line ${fiche}`);
    else txt = e.visible ? L(`⚠ Erreur connue : ${coup} — la réfutation est ${ref} (fiche ${fiche})`, `⚠ Known mistake: ${coup} — the refutation is ${ref} (line ${fiche})`) : L(`⚠ Erreur connue : ${coup} — réfutation dans la fiche Pro ${fiche}`, `⚠ Known mistake: ${coup} — refutation in the Pro line ${fiche}`);
    morceaux.push(`<span class="ouv-alerte ${e.trouvee === true ? 'ok' : ''}">${txt}</span>`);
  } else if (etat.sortie) {
    const s = etat.sortie.san ? `${numero(etat.sortie.ply, startFen)}${sanFr(etat.sortie.san)}` : '';
    morceaux.push(`<span class="ouv-hors">${s ? L(`Hors des lignes connues depuis ${s}`, `Out of known lines since ${s}`) : L('Hors des lignes connues', 'Out of known lines')}</span>`);
  }
  const f = etat.erreur?.choisie ? { id: etat.erreur.id, nom: etat.erreur.nom } : etat.fiche;
  if (boutons && f) {
    morceaux.push(`<span class="ouv-actions"><button type="button" class="link-btn" data-ouv-fiche="${esc(f.id)}">${L('Voir la fiche', 'Open the line')}</button>${canOpenFiche(f.id) ? ` · <button type="button" class="link-btn" data-ouv-entrainer="${esc(f.id)}">${L('S’entraîner', 'Train')}</button>` : ''}</span>`);
  }
  return morceaux.join(' ');
}

// Résumé d'une partie entière (bilan) : ouverture la plus précise, sortie des lignes connues et
// chaque erreur connue d'une fiche rencontrée (réfutation trouvée ou non).
export function resumeOuverture(fens, sans, data = donnees) {
  const e = etatOuverture(fens, sans, data);
  if (!e) return null;
  const erreurs = [];
  for (let i = 1; i < fens.length - 1; i++) {
    if (!data.err[cleFen(fens[i])]) continue;
    const x = etatOuverture(fens.slice(0, i + 2), sans.slice(0, i + 1), data)?.erreur;
    if (x && x.ply === i) erreurs.push(x);
  }
  return { ...e, erreur: null, erreurs };
}

export function resumeOuvertureHtml(res, { startFen } = {}) {
  if (!res?.nom) return '';
  const lignes = [ligneOuvertureHtml({ ...res, erreur: null }, { startFen })];
  for (const e of res.erreurs) lignes.push(ligneOuvertureHtml({ nom: null, sortie: null, fiche: null, erreur: e }, { startFen }));
  return lignes.filter(Boolean).map((l) => `<p class="opening-line">${l}</p>`).join('');
}
