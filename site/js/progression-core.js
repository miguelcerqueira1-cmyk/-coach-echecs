// « Ma progression » (logique pure) : classements (historique Lichess public, classements tirés des
// parties importées, classement Chess.com actuel) et chiffres de la routine sur 4 semaines.
// Aucun chiffre n'est estimé : tout vient des API publiques ou des données enregistrées sur l'appareil.

import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

export const KEY = 'coach-echecs:classements-v1';
const JOUR = 86400000;
export const PERFS = { blitz: 'Blitz', rapid: L('Rapide', 'Rapid'), bullet: 'Bullet', classical: L('Classique', 'Classical') };

// GET /api/user/{u}/rating-history → séries par cadence : points [année, mois (0-11), jour, classement].
export function seriesLichess(json, now = Date.now()) {
  const out = [];
  for (const s of Array.isArray(json) ? json : []) {
    const id = String(s.name || '').toLowerCase();
    if (!PERFS[id] || !s.points?.length) continue;
    const points = s.points.map(([y, m, d, r]) => ({ t: Date.UTC(y, m, d), r })).sort((a, b) => a.t - b.t);
    out.push({ id, nom: PERFS[id], ...resume(points, now) });
  }
  return out.sort((a, b) => b.points.length - a.points.length);
}

// Classement actuel et évolution sur 30 et 90 jours (dernier point connu avant la date de départ).
export function resume(points, now = Date.now()) {
  const actuel = points.at(-1)?.r ?? null;
  const avant = (jours) => {
    const lim = now - jours * JOUR;
    const p = [...points].reverse().find((x) => x.t <= lim);
    return p ? actuel - p.r : null;
  };
  return { points, actuel, d30: avant(30), d90: avant(90), max: points.length ? Math.max(...points.map((p) => p.r)) : null };
}

// Partie importée → point de classement (mon classement au moment de la partie).
export function pointDePartie(g) {
  const r = g.color === 'w' ? g.whiteElo : g.blackElo;
  if (!r || !g.date || g.local) return null;
  return { id: g.id, t: Date.parse(g.date), site: g.site, speed: String(g.speed || '').toLowerCase(), r: Number(r) };
}

export function chargerClassements(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage.getItem(KEY) || 'null'); return v?.parties && typeof v.parties === 'object' ? v : { parties: {} }; } catch { return { parties: {} }; }
}

// Ajoute les parties importées (une entrée par partie, au plus 600, les plus récentes gardées).
export function noterClassements(data, games, max = 600) {
  for (const g of games) { const p = pointDePartie(g); if (p) data.parties[p.id] = p; }
  const tri = Object.values(data.parties).sort((a, b) => b.t - a.t).slice(0, max);
  data.parties = Object.fromEntries(tri.map((p) => [p.id, p]));
  return data;
}

// Séries par site et cadence, tirées des parties enregistrées (Chess.com surtout).
export function seriesParties(data, site, now = Date.now()) {
  const groupes = {};
  for (const p of Object.values(data.parties)) {
    if (p.site !== site) continue;
    (groupes[p.speed] ||= []).push({ t: p.t, r: p.r });
  }
  return Object.entries(groupes).map(([speed, pts]) => ({ id: speed, nom: speed ? speed[0].toUpperCase() + speed.slice(1) : L('Parties', 'Games'), ...resume(pts.sort((a, b) => a.t - b.t), now) }))
    .sort((a, b) => b.points.length - a.points.length);
}

// /pub/player/{u}/stats → classements actuels et records Chess.com.
export function statsChessCom(json) {
  const out = [];
  for (const [k, nom] of [['chess_blitz', 'Blitz'], ['chess_rapid', L('Rapide', 'Rapid')], ['chess_bullet', 'Bullet'], ['chess_daily', L('Partie par jour', 'Daily')]]) {
    const s = json?.[k];
    if (s?.last?.rating) out.push({ nom, actuel: s.last.rating, max: s.best?.rating ?? null, bilan: s.record ? { v: s.record.win, n: s.record.draw, d: s.record.loss } : null });
  }
  return out;
}

const jourIso = (t) => new Date(t).toISOString().slice(0, 10);

// Routine sur `semaines` semaines (la plus récente en dernier) : jours actifs, complets, moyennes.
// jours : routine-v1.jours ; totalDuJour(date) : nombre de blocs prévus ce jour-là.
export function routineParSemaine(jours, totalDuJour, today = jourIso(Date.now()), semaines = 4) {
  const t0 = Date.parse(`${today}T12:00:00Z`);
  const out = [];
  for (let w = semaines - 1; w >= 0; w--) {
    const s = { actifs: 0, complets: 0, problemes: [], menaces: [], temps: [] };
    for (let d = 0; d < 7; d++) {
      const date = jourIso(t0 - (w * 7 + d) * JOUR);
      const j = jours?.[date];
      if (!j) continue;
      if (j.faits?.length) s.actifs++;
      if (j.faits?.length >= totalDuJour(date)) s.complets++;
      for (const k of ['problemes', 'menaces', 'temps']) if (j[k] != null) s[k].push(j[k]);
    }
    const moy = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
    out.push({ actifs: s.actifs, complets: s.complets, problemes: moy(s.problemes), menaces: moy(s.menaces), temps: moy(s.temps) });
  }
  return out;
}

// Tendance entre la 1re et la dernière semaine ayant une valeur : 'mieux' | 'moins bien' | 'stable' | null.
// plusEstMieux : true pour les problèmes réussis, false pour les menaces ratées et les défaites au temps.
export function tendance(semaines, champ, plusEstMieux) {
  const v = semaines.map((s) => s[champ]).filter((x) => x != null);
  if (v.length < 2) return null;
  const diff = v.at(-1) - v[0];
  if (Math.abs(diff) < 0.5) return 'stable';
  return (diff > 0) === plusEstMieux ? 'mieux' : 'moins bien';
}

// Petite courbe SVG (sans axe) : points {t, r} → chemin dans une boîte w × h.
export function cheminCourbe(points, w = 300, h = 70) {
  if (points.length < 2) return '';
  const t0 = points[0].t;
  const t1 = points.at(-1).t || t0 + 1;
  const rs = points.map((p) => p.r);
  const min = Math.min(...rs);
  const max = Math.max(...rs);
  const dy = max - min || 1;
  return points.map((p, i) => `${i ? 'L' : 'M'}${(((p.t - t0) / (t1 - t0 || 1)) * w).toFixed(1)},${(h - 4 - ((p.r - min) / dy) * (h - 8)).toFixed(1)}`).join(' ');
}
