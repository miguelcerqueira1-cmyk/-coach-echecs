// Sons et vibrations, fabriqués par le navigateur (Web Audio) : aucun fichier à télécharger,
// aucune licence. Réglages ⚙ « Sons » et « Vibrations » (reglages:v1.sons / .vibrations, activés
// par défaut). Le premier son n'est possible qu'après un geste de l'utilisateur (règle des navigateurs).
import { loadSettings } from './storage.js';

let ctx = null;
let reglages = null;
export function rechargerReglagesSons() { reglages = null; }
const actifs = () => { reglages ??= loadSettings(); return reglages; };

function audio() {
  if (!ctx) {
    const C = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Une note brève : fréquence, durée, forme, volume, décalage (s).
function note(f, dur, { type = 'sine', vol = 0.18, at = 0, glisse = null } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (glisse) o.frequency.exponentialRampToValueAtTime(glisse, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const jouer = (fn) => { if (actifs().sons !== false) { try { fn(); } catch { /* audio indisponible */ } } };
const vibrer = (motif) => { if (actifs().vibrations !== false) { try { navigator.vibrate?.(motif); } catch { /* rien */ } } };

export const sons = {
  coup: () => jouer(() => note(520, 0.07, { type: 'triangle', vol: 0.22, glisse: 380 })),
  prise: () => jouer(() => { note(300, 0.11, { type: 'triangle', vol: 0.28, glisse: 160 }); note(900, 0.04, { type: 'square', vol: 0.05 }); }),
  echec: () => jouer(() => { note(660, 0.09, { type: 'triangle', vol: 0.2 }); note(880, 0.12, { type: 'triangle', vol: 0.2, at: 0.09 }); }),
  reussite: () => jouer(() => { note(660, 0.1, { vol: 0.16 }); note(880, 0.1, { vol: 0.16, at: 0.08 }); note(1320, 0.16, { vol: 0.14, at: 0.16 }); }),
  erreur: () => { jouer(() => note(180, 0.22, { type: 'sawtooth', vol: 0.08, glisse: 120 })); vibrer([60, 40, 60]); },
};

// Son d'un coup joué d'après le coup chess.js (verbose) : échec > prise > coup.
export function sonDuCoup(mv) {
  if (!mv) return;
  if (/[+#]/.test(mv.san || '')) sons.echec();
  else if (mv.captured) sons.prise();
  else sons.coup();
}
