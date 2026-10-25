// Progression de l'entraînement (logique pure, testée sans navigateur).
// - lignes : lignes complètes rejouées (module « Lignes ») ;
// - drills : punitions chronométrées (module « Anti-trash ») ;
// - jours : jours d'entraînement (série 🔥) ;
// - sorties : sorties de répertoire repérées dans vos vraies parties (« Mes parties »).
// La maîtrise d'une fiche combine la révision espacée de ses positions (70 %) et la
// réussite aux exercices de cette fiche (30 %) ; sans exercice, seules les positions comptent.
import { key } from './training-core.js';

export const PROGRESS_KEY = 'coach-echecs:progression-v1';
const DAY = 86400000;

export function emptyProgress() {
  return { lignes: {}, drills: {}, jours: [], sorties: [], cours: {} };
}

// Leçon suivie jusqu'au bout (module « Apprendre »).
export function recordLesson(p, id, now = Date.now()) {
  p.cours = { ...(p.cours || {}), [id]: { vue: now, n: ((p.cours || {})[id]?.n || 0) + 1 } };
  return touchDay(p, now);
}

export function loadProgress(storage = globalThis.localStorage) {
  try { return { ...emptyProgress(), ...JSON.parse(storage?.getItem(PROGRESS_KEY) || '{}') }; } catch { return emptyProgress(); }
}

export function saveProgress(p, storage = globalThis.localStorage) {
  try { storage?.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* stockage plein */ }
}

const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

export function touchDay(p, now = Date.now()) {
  const d = dayOf(now);
  if (!p.jours.includes(d)) p.jours = [...p.jours, d].slice(-400);
  return p;
}

// Jours consécutifs d'entraînement jusqu'à aujourd'hui (ou hier, si pas encore aujourd'hui).
export function streak(p, now = Date.now()) {
  const set = new Set(p.jours);
  let t = set.has(dayOf(now)) ? now : now - DAY;
  let n = 0;
  while (set.has(dayOf(t))) { n++; t -= DAY; }
  return n;
}

export function recordLine(p, id, ok, now = Date.now()) {
  const r = p.lignes[id] || { ok: 0, ko: 0 };
  p.lignes[id] = { ...r, ok: r.ok + (ok ? 1 : 0), ko: r.ko + (ok ? 0 : 1), last: now };
  return touchDay(p, now);
}

export function recordDrill(p, id, ok, ms = null, now = Date.now()) {
  const r = p.drills[id] || { ok: 0, ko: 0, best: null };
  const best = ok && ms != null ? (r.best == null ? ms : Math.min(r.best, ms)) : r.best;
  p.drills[id] = { ok: r.ok + (ok ? 1 : 0), ko: r.ko + (ok ? 0 : 1), best, last: now };
  return touchDay(p, now);
}

// Sortie de répertoire (ou punition manquée) vue dans une vraie partie, une fois par partie.
// pos : position à retravailler (positionARevoir) ; corrige : date de validation dans le module
// « Mes vraies erreurs ».
export function recordSortie(p, { gameId, ficheId = null, rep, ply, date, pos = null, opp = null, url = null }) {
  if (!ficheId && !pos) return p;
  const old = p.sorties.find((x) => x.gameId === gameId);
  if (old && (old.moves || !pos)) return p;
  const rec = { gameId, ficheId, rep, ply, date };
  if (pos) Object.assign(rec, { kind: pos.kind, moves: pos.moves, expected: pos.expected, played: pos.played, color: pos.color, texte: pos.texte, ficheNom: pos.ficheNom, opp, url });
  // Enregistrement antérieur sans position (avant « Mes vraies erreurs ») : complété.
  p.sorties = old ? p.sorties.map((x) => (x === old ? rec : x)) : [...p.sorties, rec].slice(-200);
  return p;
}

// Positions de vraies parties encore à corriger (les plus récentes d'abord).
export function vraiesErreurs(p) {
  return (p.sorties || []).filter((x) => x.moves && x.expected?.length && !x.corrige)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function markCorrige(p, gameId, now = Date.now()) {
  p.sorties = p.sorties.map((x) => (x.gameId === gameId ? { ...x, corrige: new Date(now).toISOString() } : x));
  return p;
}

// Positions de la fiche où c'est à nous de jouer (clés de révision espacée).
export function ficheKeys(entry, color) {
  const out = [];
  entry.uci.forEach((_, i) => { if ((i % 2 === 0 ? 'w' : 'b') === color) out.push(key(entry.uci.slice(0, i))); });
  return out;
}

const posScore = (st) => {
  if (!st) return 0;
  if (st.reps >= 3) return 1;
  if (st.reps === 2) return 0.85;
  if (st.reps === 1) return 0.6;
  return 0.25; // vue mais ratée la dernière fois
};

export function mastery(entry, color, states, p, now = Date.now()) {
  const keys = ficheKeys(entry, color);
  const pos = keys.length ? keys.reduce((a, k) => a + posScore(states[k]), 0) / keys.length : 0;
  const l = p.lignes[entry.id] || { ok: 0, ko: 0 };
  const d = p.drills[entry.id] || { ok: 0, ko: 0 };
  const tries = l.ok + l.ko + d.ok + d.ko;
  const ex = tries ? (l.ok + d.ok) / tries : null;
  const value = ex == null ? pos : 0.7 * pos + 0.3 * ex;
  const due = keys.filter((k) => states[k] && states[k].due <= now).length;
  const seen = keys.filter((k) => states[k]).length;
  return { pct: Math.round(100 * value), due, seen, total: keys.length, lignes: l, drills: d };
}

// Tableau de bord : une ligne par fiche, plus faibles d'abord ; résumé par répertoire.
export function dashboard(data, revision, p, now = Date.now()) {
  const fiches = data.entries.map((e) => {
    const color = data.repertoires[e.rep].couleur;
    const m = mastery(e, color, revision[e.rep] || {}, p, now);
    const sorties = p.sorties.filter((x) => x.ficheId === e.id && x.kind !== 'punition').length;
    return { id: e.id, rep: e.rep, nom: e.nom, eco: e.eco, badge: e.badge, punition: !!e.punition, sorties, cours: !!(p.cours || {})[e.id], ...m };
  });
  const byRep = {};
  for (const rep of Object.keys(data.repertoires)) {
    const fs = fiches.filter((f) => f.rep === rep);
    byRep[rep] = {
      pct: fs.length ? Math.round(fs.reduce((a, f) => a + f.pct, 0) / fs.length) : 0,
      due: fs.reduce((a, f) => a + f.due, 0),
      maitrisees: fs.filter((f) => f.pct >= 80).length,
      total: fs.length,
    };
  }
  const drills = Object.values(p.drills);
  return {
    fiches: fiches.sort((a, b) => (b.sorties > 0) - (a.sorties > 0) || a.pct - b.pct || b.due - a.due),
    byRep,
    streak: streak(p, now),
    drillsOk: drills.reduce((a, d) => a + d.ok, 0),
    drillsTotal: drills.reduce((a, d) => a + d.ok + d.ko, 0),
    bestDrill: drills.map((d) => d.best).filter((x) => x != null).sort((a, b) => a - b)[0] ?? null,
  };
}

// Fiches à travailler en priorité : sorties en partie réelle, positions à revoir, maîtrise faible.
export function pickFiches(board, { rep = null, n = 3, needPunition = false } = {}) {
  return board.fiches
    .filter((f) => (!rep || f.rep === rep) && (!needPunition || f.punition))
    .sort((a, b) => (b.sorties > 0) - (a.sorties > 0) || (b.due > 0) - (a.due > 0) || a.pct - b.pct)
    .slice(0, n)
    .map((f) => f.id);
}
