// Génère le jeu de données « Élite » : parties blitz/rapide récentes des meilleurs joueurs Lichess
// et Chess.com, limitées au répertoire (Blancs 1.d4 d5 2.c4 ; Noirs 1.e4 c6), agrégées par position.
//
//   node scripts/elite.mjs [options]                        mode complet (reconstruction)
//   node scripts/elite.mjs --incremental etat.json [options] mode incrémental (nouvelles parties)
//     --top 50            joueurs par cadence et par plateforme
//     --perfs blitz,rapid cadences
//     --max-games 100     dernières parties prises en compte par joueur et par cadence
//     --months 3          fenêtre glissante (parties plus anciennes retirées)
//     --plies 24          demi-coups agrégés (les fiches vont jusqu'à 24)
//     --min-position 2    parties minimum pour publier une position
//     --samples 3         parties exemples par position
//     --recent 10         « Nouvelles parties » publiées
//     --max-bytes 1500000 taille visée : --min-position est relevé automatiquement au-delà
//     --sources li,cc,bc  sources interrogées (bc : tournois retransmis sur Lichess)
//     --max-games-suivis 200  plafond par joueur suivi et par cadence (scripts/elite-suivis.mjs)
//     --bc-months 6       fenêtre des tournois ; --bc-min-elo 2600 ; --bc-tier 5 ; --bc-pages 9
//     --joueurs <fichier> index de recherche par joueur (défaut : joueurs.json à côté de --out)
//     --out site/data/elite.json
//     --state <fichier>   écrit aussi l'état (etat.json) ; implicite avec --incremental
//     --fixture <dossier> hors ligne : réponses lues dans des fichiers (tests)
//     --record <dossier>  enregistre les réponses réelles (pour fabriquer des fixtures)
//     --now <date ISO>    date de référence de la fenêtre (tests sur fixtures datées)
//
// Mode incrémental : l'état (etat.json) garde, par joueur × cadence, la date de la dernière partie
// vue, son nombre de parties classées et ses dernières parties ; seules les parties plus récentes
// sont demandées (Lichess : une requête groupée /api/users donne les compteurs, puis since pour les
// seuls joueurs dont le compteur a bougé ;
// Chess.com : archive du mois en cours, et du mois précédent si besoin, avec ETag). L'agrégat est
// recalculé à chaque passage à partir des parties gardées. État absent → mode complet.
//
// Jeton Lichess facultatif : variable d'environnement LICHESS_TOKEN (jamais écrite ni affichée).
// Règles d'usage : une requête à la fois, une minute de pause après un 429 ; User-Agent avec
// l'adresse du dépôt. Une source en échec est notée dans les métadonnées ; aucune donnée n'est
// inventée ni complétée (en incrémental, la liste du top précédente est alors conservée).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  normalizeLichess, normalizeChessCom, parseNdjson, aggregate, compact, countGames,
  emptyState, ownerKey, recordDownload, pruneState, stateGames, recentGames, publicGame, MONTH_MS,
  splitPgn, pgnHeaders, normalizeBroadcast, keepBroadcast, keepTour, FIDE_TC,
} from './elite-core.mjs';
import { SUIVIS, verifyAccount, lichessProfile, chessComProfile, suiviByName } from './elite-suivis.mjs';
import { nameMatches, displayFideName, normalizeName } from '../site/js/joueurs.js';
import { buildEcoIndex, classify } from '../site/js/lines.js';
import { Chess } from '../site/vendor/chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_URL = process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}`
  : 'https://github.com/miguelcerqueira1-cmyk/-coach-echecs';
const USER_AGENT = `coach-echecs-elite/1.0 (+${REPO_URL})`;
// Lichess : since porte sur le début de partie ; une partie commencée avant le dernier passage
// peut finir après : on redemande la dernière heure (les doublons sont écartés par identifiant).
export const LICHESS_OVERLAP_MS = 3600000;

export const DEFAULTS = {
  top: 50, perfs: ['blitz', 'rapid'], maxGames: 100, months: 3, plies: 24, minPosition: 2, samples: 3, recent: 10,
  maxBytes: 1500000, sources: ['li', 'cc', 'bc'], maxGamesSuivis: 200, bcMonths: 6, bcMinElo: 2600, bcTier: 5, bcPages: 9, joueurs: null, maxIndexBytes: 2000000, out: 'site/data/elite.json', state: null, incremental: null, fixture: null, record: null, now: null,
};

export function parseArgs(argv) {
  const o = { ...DEFAULTS };
  const num = (v, k) => { const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new Error(`--${k} : nombre attendu`); return n; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => { if (i + 1 >= argv.length) throw new Error(`${a} : valeur manquante`); return argv[++i]; };
    switch (a) {
      case '--top': o.top = num(v(), 'top'); break;
      case '--perfs': o.perfs = v().split(',').filter(Boolean); break;
      case '--max-games': o.maxGames = num(v(), 'max-games'); break;
      case '--months': o.months = num(v(), 'months'); break;
      case '--plies': o.plies = num(v(), 'plies'); break;
      case '--min-position': o.minPosition = num(v(), 'min-position'); break;
      case '--samples': o.samples = num(v(), 'samples'); break;
      case '--recent': o.recent = num(v(), 'recent'); break;
      case '--max-bytes': o.maxBytes = num(v(), 'max-bytes'); break;
      case '--sources': o.sources = v().split(',').filter(Boolean); break;
      case '--out': o.out = v(); break;
      case '--max-games-suivis': o.maxGamesSuivis = num(v(), 'max-games-suivis'); break;
      case '--bc-months': o.bcMonths = num(v(), 'bc-months'); break;
      case '--bc-min-elo': o.bcMinElo = num(v(), 'bc-min-elo'); break;
      case '--bc-tier': o.bcTier = num(v(), 'bc-tier'); break;
      case '--bc-pages': o.bcPages = num(v(), 'bc-pages'); break;
      case '--joueurs': o.joueurs = v(); break;
      case '--state': o.state = v(); break;
      case '--incremental': o.incremental = v(); break;
      case '--fixture': o.fixture = v(); break;
      case '--record': o.record = v(); break;
      case '--now': o.now = Date.parse(v()); if (!Number.isFinite(o.now)) throw new Error('--now : date ISO attendue'); break;
      default: throw new Error(`Option inconnue : ${a}`);
    }
  }
  if (o.perfs.some((p) => !['blitz', 'rapid'].includes(p))) throw new Error('--perfs : blitz et/ou rapid');
  if (o.incremental) o.state ??= o.incremental;
  return o;
}

// Nom de fichier de fixture pour une adresse (requête ignorée : un chemin = une réponse).
export function fixtureName(url) {
  const u = new URL(url);
  return (u.host + u.pathname).replace(/[^a-zA-Z0-9._-]+/g, '_');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Client HTTP série : une requête à la fois par plateforme, pause d'une minute sur 429.
export class Http {
  constructor({ fixture = null, record = null, lichessToken = '', pauseOn429Ms = 60000, minIntervalMs = { li: 1000, cc: 300 }, fetchImpl = (...a) => fetch(...a), log = () => {} } = {}) {
    Object.assign(this, { fixture, record, lichessToken, pauseOn429Ms, minIntervalMs, fetchImpl, log });
    this.last = {};
    this.requests = 0;
  }

  // etag : envoyé en If-None-Match (réponse 304 = inchangé) ; body : requête POST (texte).
  async get(url, { accept = 'application/json', platform, etag = null, body = null } = {}) {
    this.requests++;
    if (this.fixture) {
      const f = join(this.fixture, fixtureName(url));
      return existsSync(f) ? { status: 200, text: readFileSync(f, 'utf8'), etag: null } : { status: 404, text: '', etag: null };
    }
    const headers = { accept, 'user-agent': USER_AGENT };
    if (platform === 'li' && this.lichessToken) headers.authorization = `Bearer ${this.lichessToken}`;
    if (etag) headers['if-none-match'] = etag;
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = (this.last[platform] || 0) + (this.minIntervalMs[platform] || 0) - Date.now();
      if (wait > 0) await sleep(wait);
      let res;
      try {
        res = await this.fetchImpl(url, body == null ? { headers } : { method: 'POST', headers: { ...headers, 'content-type': 'text/plain' }, body });
      } catch (e) {
        this.last[platform] = Date.now();
        throw new Error(`réseau : ${e.cause?.message || e.cause?.code || e.message}`);
      }
      if (res.status === 429) {
        this.log(`429 sur ${new URL(url).host} : pause de ${this.pauseOn429Ms / 1000} s`);
        await sleep(this.pauseOn429Ms);
        this.last[platform] = Date.now();
        continue;
      }
      const text = res.status === 304 ? '' : await res.text();
      this.last[platform] = Date.now();
      if (this.record && res.ok) {
        mkdirSync(this.record, { recursive: true });
        writeFileSync(join(this.record, fixtureName(url)), text);
      }
      return { status: res.status, text, etag: res.headers?.get?.('etag') || null };
    }
    throw new Error('429 répétés : abandon');
  }

  async json(url, opts) {
    const r = await this.get(url, opts);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return JSON.parse(r.text);
  }
}

const newSrc = () => ({ status: 'ok', players: 0, requests: 0, gamesDownloaded: 0, newGames: 0, gamesKept: 0, errors: [] });
const finish = (src, tops) => {
  src.players = new Set(Object.values(tops).flat().map((u) => u.u.toLowerCase())).size;
  if (!src.players) src.status = 'erreur';
  else if (src.errors.length) src.status = 'partiel';
  return src;
};

// ---------- Joueurs suivis ----------

// Note le verdict de vérification d'un compte suivi dans l'état (clé « li:compte » / « cc:compte »).
function setVerdict(state, p, s, compte, verdict, now) {
  state.suivis[`${p}:${compte.toLowerCase()}`] = { p, compte, nom: s.nom, ok: verdict.ok, statut: verdict.statut, raison: verdict.raison, at: now };
}
const verifiedAccounts = (state, p) => Object.values(state.suivis || {}).filter((v) => v.p === p && v.ok);

// ---------- Lichess ----------

export async function syncLichess(http, o, state, { log, windowStart, incremental, now, suivis = SUIVIS }) {
  const src = newSrc();
  const tops = {};
  for (const perf of o.perfs) {
    try {
      const d = await http.json(`https://lichess.org/api/player/top/${o.top}/${perf}`, { accept: 'application/vnd.lichess.v3+json', platform: 'li' });
      tops[perf] = (d.users || []).map((u) => ({ u: u.username, t: u.title || null, r: u.perfs?.[perf]?.rating ?? null }));
    } catch (e) {
      tops[perf] = incremental ? (state.tops.li?.[perf] || []) : [];
      src.errors.push(`classement ${perf} : ${e.message}${tops[perf].length ? ' (liste précédente conservée)' : ''}`);
    }
  }
  state.tops.li = tops;
  const followed = suivis.flatMap((s) => s.li.map((u) => ({ s, u })));
  // Une requête groupée (jusqu'à 300 comptes) : profils des joueurs suivis (vérification) et
  // compteurs de parties classées par cadence (un joueur dont le compteur n'a pas bougé depuis le
  // passage précédent n'a pas fini de partie : inutile d'exporter).
  let users = null;
  const ids = [...new Set([...Object.values(tops).flat().map((u) => u.u), ...followed.map((f) => f.u)].map((x) => x.toLowerCase()))];
  if (ids.length) {
    try {
      const r = await http.get('https://lichess.org/api/users', { platform: 'li', body: ids.slice(0, 300).join(',') });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      users = new Map(JSON.parse(r.text).map((u) => [u.id, u]));
    } catch (e) {
      src.errors.push(`profils et compteurs : ${e.message} (tous les joueurs sont interrogés)`);
    }
  }
  for (const { s, u } of followed) {
    if (users) setVerdict(state, 'li', s, u, verifyAccount(s, lichessProfile(users.get(u.toLowerCase()))), now);
    else if (!state.suivis[`li:${u.toLowerCase()}`]) setVerdict(state, 'li', s, u, { ok: false, statut: 'non vérifié', raison: 'API Lichess injoignable' }, now);
  }
  // Cibles : top 50 de chaque cadence + comptes suivis vérifiés (plafond plus large).
  const targets = new Map();
  const add = (u, perf, cap) => {
    const key = ownerKey('li', u, perf);
    const t = targets.get(key);
    targets.set(key, { u: t?.u || u, perf, cap: Math.max(cap, t?.cap || 0) });
  };
  for (const perf of o.perfs) for (const u of tops[perf]) add(u.u, perf, o.maxGames);
  for (const v of verifiedAccounts(state, 'li')) for (const perf of o.perfs) add(v.compte, perf, o.maxGamesSuivis);
  src.skipped = 0;
  const owners = new Set();
  for (const [key, { u, perf, cap }] of targets) {
    owners.add(key);
    const prev = state.owners[key];
    const n = users?.get(u.toLowerCase())?.perfs?.[perf]?.games ?? null;
    if (incremental && prev && n != null && prev.n === n) { src.skipped++; continue; }
    const since = incremental && prev ? Math.max(windowStart, prev.last - LICHESS_OVERLAP_MS) : windowStart;
    const qs = new URLSearchParams({
      max: String(cap), perfType: perf, rated: 'true', since: String(Math.round(since)),
      moves: 'true', clocks: 'false', evals: 'false', opening: 'false', pgnInJson: 'false',
    });
    try {
      const r = await http.get(`https://lichess.org/api/games/user/${encodeURIComponent(u)}?${qs}`, { accept: 'application/x-ndjson', platform: 'li' });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const { items, bad } = parseNdjson(r.text);
      if (bad) src.errors.push(`${u} (${perf}) : ${bad} ligne(s) NDJSON illisible(s)`);
      const list = items.filter((g) => g.speed === perf && g.rated !== false && g.createdAt >= windowStart);
      src.gamesDownloaded += list.length;
      src.newGames += recordDownload(state, key, list.map((g) => ({ id: g.id, t: g.createdAt, game: normalizeLichess(g, u, [perf]) })), { maxGames: cap });
      state.owners[key].n = n;
    } catch (e) {
      src.errors.push(`${u} (${perf}) : ${e.message}`);
    }
  }
  log(`Lichess : ${targets.size} joueurs × cadence (${src.skipped} sans nouvelle partie), ${src.newGames} nouvelles parties du répertoire`);
  return { src: finish(src, tops), owners };
}

// ---------- Chess.com ----------

const CC_BOARDS = { blitz: 'live_blitz', rapid: 'live_rapid' };
const monthUrl = (user, d) => `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const REVERIFY_MS = 7 * 86400000;

export async function syncChessCom(http, o, state, { log, windowStart, incremental, now, suivis = SUIVIS }) {
  const src = newSrc();
  const tops = {};
  try {
    const d = await http.json('https://api.chess.com/pub/leaderboards', { platform: 'cc' });
    for (const perf of o.perfs) tops[perf] = (d[CC_BOARDS[perf]] || []).slice(0, o.top).map((u) => ({ u: u.username, t: u.title || null, r: u.score ?? null }));
  } catch (e) {
    for (const perf of o.perfs) tops[perf] = incremental ? (state.tops.cc?.[perf] || []) : [];
    src.errors.push(`classements : ${e.message}${Object.values(tops).flat().length ? ' (listes précédentes conservées)' : ''}`);
  }
  state.tops.cc = tops;
  // Comptes suivis : profil vérifié en reconstruction complète, puis au plus une fois par semaine.
  for (const s of suivis) {
    for (const u of s.cc) {
      const prev = state.suivis[`cc:${u.toLowerCase()}`];
      if (incremental && prev && prev.statut !== 'non vérifié' && now - prev.at < REVERIFY_MS) continue;
      try {
        const r = await http.get(`https://api.chess.com/pub/player/${encodeURIComponent(u.toLowerCase())}`, { platform: 'cc' });
        if (r.status === 404) setVerdict(state, 'cc', s, u, verifyAccount(s, chessComProfile(null)), now);
        else if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        else setVerdict(state, 'cc', s, u, verifyAccount(s, chessComProfile(JSON.parse(r.text))), now);
      } catch (e) {
        if (!prev) setVerdict(state, 'cc', s, u, { ok: false, statut: 'non vérifié', raison: `API Chess.com : ${e.message}` }, now);
      }
    }
  }
  const byUser = new Map(); // compte → { perfs, cap }
  const add = (name, perf, cap) => {
    const k = name.toLowerCase();
    const x = byUser.get(k) || { perfs: [], cap: 0 };
    if (!x.perfs.includes(perf)) x.perfs.push(perf);
    x.cap = Math.max(x.cap, cap);
    byUser.set(k, x);
  };
  for (const perf of o.perfs) for (const u of tops[perf]) add(u.u, perf, o.maxGames);
  for (const v of verifiedAccounts(state, 'cc')) for (const perf of o.perfs) add(v.compte, perf, o.maxGamesSuivis);
  const owners = new Set();
  const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  for (const [user, { perfs, cap }] of byUser) {
    const keys = Object.fromEntries(perfs.map((p) => [p, ownerKey('cc', user, p)]));
    Object.values(keys).forEach((k) => owners.add(k));
    const known = incremental && perfs.every((p) => state.owners[keys[p]]);
    try {
      let urls;
      if (known) {
        // Mois en cours ; le mois précédent tant qu'aucune partie du mois en cours n'a été vue.
        urls = [monthUrl(user, new Date(now))];
        if (perfs.some((p) => state.owners[keys[p]].last < monthStart)) urls.push(monthUrl(user, new Date(monthStart - 86400000)));
      } else {
        const a = await http.json(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`, { platform: 'cc' });
        urls = (a.archives || []).slice(-Math.max(1, Math.ceil(o.months))).reverse(); // plus récente d'abord
      }
      const items = Object.fromEntries(perfs.map((p) => [p, []]));
      for (const url of urls) {
        if (!known && perfs.every((p) => items[p].length >= cap)) break;
        let list;
        try {
          const r = await http.get(url, { platform: 'cc', etag: known ? state.etags[url] : null });
          if (r.status === 304 || r.status === 404) continue; // inchangé, ou aucune partie ce mois-là
          if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
          list = (JSON.parse(r.text).games || []).slice().sort((x, y) => (y.end_time || 0) - (x.end_time || 0));
          if (r.etag) state.etags[url] = r.etag;
        } catch (e) {
          // Un mois illisible n'empêche pas les autres ; il sera redemandé au prochain passage.
          src.errors.push(`${user} ${url.split('/games/')[1]} : ${e.message}`);
          continue;
        }
        for (const g of list) {
          const p = g.time_class;
          const t = (g.end_time || 0) * 1000;
          if (!items[p] || g.rated === false || g.rules !== 'chess' || t < windowStart) continue;
          if (known && t <= state.owners[keys[p]].last) continue;
          if (items[p].length >= cap) continue;
          const id = String(g.url || '').split('/').pop();
          if (!id) continue;
          items[p].push({ id, t, game: normalizeChessCom(g, user, [p]) });
        }
      }
      for (const p of perfs) {
        src.gamesDownloaded += items[p].length;
        src.newGames += recordDownload(state, keys[p], items[p], { maxGames: cap });
      }
    } catch (e) {
      src.errors.push(`${user} : ${e.message}`);
    }
  }
  log(`Chess.com : ${byUser.size} joueurs, ${src.newGames} nouvelles parties du répertoire`);
  // Les URL d'archives des joueurs sortis du top ne servent plus.
  for (const url of Object.keys(state.etags)) {
    const user = decodeURIComponent(url.split('/player/')[1]?.split('/')[0] || '');
    if (!byUser.has(user)) delete state.etags[url];
  }
  return { src: finish(src, tops), owners };
}

// ---------- Retransmissions Lichess (tournois) ----------

const roundIdOf = (url) => String(url || '').split('/').filter(Boolean).at(-1);

// Tournois retenus : catégorie la plus haute (tier 5) ou joueur suivi annoncé. Reconstruction :
// pages de /api/broadcast/top + une recherche par joueur suivi ; incrémental : page 1 seulement
// (tournois en cours et tout juste finis). Puis, par tournoi, les rondes terminées pas encore lues.
export async function syncBroadcasts(http, o, state, { log, incremental, now, suivis = SUIVIS }) {
  const src = { ...newSrc(), events: 0 };
  const bc = (state.bc ??= { tours: {}, rounds: {} });
  const start = now - o.bcMonths * MONTH_MS;
  const mentionsSuivi = (players) => players.split(',').some((n) => suivis.some((s) => nameMatches(n, [s.cles[0]])));
  const candidates = new Map();
  const consider = (x) => {
    const t = x?.tour;
    if (!t?.id || candidates.has(t.id)) return;
    const end = Math.max(...(t.dates || [0]));
    if (end && end < start) return;
    if (keepTour(t, { minTier: o.bcTier, mentionsSuivi })) candidates.set(t.id, t);
  };
  const pages = incremental ? 1 : o.bcPages;
  for (let page = 1; page <= pages; page++) {
    try {
      const d = await http.json(`https://lichess.org/api/broadcast/top?page=${page}`, { platform: 'li' });
      (d.active || []).forEach(consider);
      const res = d.past?.currentPageResults || [];
      res.forEach(consider);
      const oldest = Math.min(...res.map((x) => Math.max(...(x.tour?.dates || [now]))));
      if (!d.past?.nextPage || oldest < start) break;
    } catch (e) {
      // Pages anciennes refusées par Lichess (« resource too old ») : fin de la liste.
      if (page === 1) src.errors.push(`liste des retransmissions : ${e.message}`);
      break;
    }
  }
  if (!incremental) {
    for (const s of suivis) {
      try {
        const d = await http.json(`https://lichess.org/api/broadcast/search?q=${encodeURIComponent(s.cles[0])}&page=1`, { platform: 'li' });
        (d.currentPageResults || []).forEach(consider);
      } catch (e) {
        src.errors.push(`recherche « ${s.cles[0]} » : ${e.message}`);
      }
    }
  }
  // En incrémental, les tournois déjà suivis et encore en cours restent interrogés.
  for (const [id, t] of Object.entries(bc.tours)) if (!candidates.has(id) && t.end >= now - 86400000) candidates.set(id, { id, name: t.name, tier: t.tier, info: { fideTC: t.tc }, dates: [t.end] });
  const isSuivi = (name) => !!suiviByName(name, suivis);
  for (const [tourId, t] of candidates) {
    let detail;
    try {
      detail = await http.json(`https://lichess.org/api/broadcast/${tourId}`, { platform: 'li' });
    } catch (e) {
      src.errors.push(`${t.name} : ${e.message}`);
      continue;
    }
    const tour = detail.tour || t;
    const speed = FIDE_TC[tour.info?.fideTC] || FIDE_TC[t.info?.fideTC] || 'classical';
    const dates = tour.dates || t.dates || [];
    bc.tours[tourId] = { name: tour.name, tier: tour.tier ?? null, tc: tour.info?.fideTC || null, end: Math.max(...dates, 0), url: tour.url || null };
    const roundNames = Object.fromEntries((detail.rounds || []).map((r) => [r.id, r.name]));
    const rounds = (detail.rounds || []).filter((r) => r.finished && !bc.rounds[r.id] && (r.finishedAt || r.startsAt || now) >= start);
    if (!rounds.length) continue;
    const key = `bc:${tourId}`;
    // Tournoi jamais lu : un seul export de toutes les rondes ; ensuite, ronde par ronde.
    const fresh = !Object.keys(roundNames).some((id) => bc.rounds[id]);
    const exports = fresh ? [{ url: `https://lichess.org/api/broadcast/${tourId}.pgn?clocks=false&comments=false`, label: 'toutes les rondes', rounds }]
      : rounds.map((r) => ({ url: `https://lichess.org/api/broadcast/round/${r.id}.pgn?clocks=false&comments=false`, label: r.name, rounds: [r] }));
    for (const x of exports) {
      try {
        const res = await http.get(x.url, { platform: 'li', accept: 'application/x-chess-pgn' });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const games = splitPgn(res.text);
        src.gamesDownloaded += games.length;
        const items = [];
        for (const pgn of games) {
          const rid = roundIdOf(pgnHeaders(pgn).BroadcastURL);
          const g = normalizeBroadcast(pgn, { speed, event: tour.name, roundName: roundNames[rid] || '', displayName: displayFideName });
          if (!g || !keepBroadcast(g, { minElo: o.bcMinElo, isSuivi }) || g.t < start) continue;
          items.push({ id: g.id, t: g.t, game: g });
        }
        src.newGames += recordDownload(state, key, items, { maxGames: Infinity });
        for (const r of x.rounds) bc.rounds[r.id] = r.finishedAt || now;
      } catch (e) {
        src.errors.push(`${tour.name} / ${x.label} : ${e.message}`);
      }
    }
  }
  // Tournois de la fenêtre : propriétaires actifs (leurs parties restent) ; les autres sont oubliés.
  const owners = new Set();
  for (const [id, t] of Object.entries(bc.tours)) {
    if (t.end && t.end < start) { delete bc.tours[id]; continue; }
    owners.add(`bc:${id}`);
  }
  for (const [rid, at] of Object.entries(bc.rounds)) if (at < start) delete bc.rounds[rid];
  src.events = Object.keys(bc.tours).length;
  src.players = src.events;
  if (src.errors.length) src.status = candidates.size ? 'partiel' : 'erreur';
  log(`Tournois : ${candidates.size} retransmissions examinées, ${src.newGames} nouvelles parties retenues`);
  return { src, owners };
}

// ---------- Assemblage ----------

let ecoIndex = null;
function openingOf(san) {
  ecoIndex ??= buildEcoIndex('abcde'.split('').map((f) => readFileSync(join(root, `data/chess-openings/${f}.tsv`), 'utf8')));
  const c = new Chess();
  const fens = [];
  for (const m of san.slice(0, 30)) {
    try { c.move(m); } catch { break; }
    fens.push(c.fen());
  }
  return classify(ecoIndex, fens);
}

export function playersOf(state) {
  const out = [];
  for (const [p, tops] of Object.entries(state.tops)) {
    for (const [perf, list] of Object.entries(tops || {})) for (const u of list) out.push({ p, u: u.u, t: u.t, perf, r: u.r });
  }
  return out;
}

// Noms usuels des joueurs suivis attachés aux parties (comptes vérifiés ; noms FIDE des tournois).
export function withCanonicalNames(games, state, suivis = SUIVIS) {
  const byAccount = new Map(Object.values(state.suivis || {}).filter((v) => v.ok).map((v) => [`${v.p}:${v.compte.toLowerCase()}`, v.nom]));
  const canon = (p, name) => (p === 'bc' ? suiviByName(name, suivis)?.nom : byAccount.get(`${p}:${String(name).toLowerCase()}`)) || null;
  return games.map((g) => {
    const wn = canon(g.p, g.w);
    const bn = canon(g.p, g.b);
    return wn || bn ? { ...g, ...(wn && { wn }), ...(bn && { bn }) } : g;
  });
}

// Index de recherche par joueur (joueurs.json) : toutes les parties gardées (coups complets,
// ouverture nommée) et, par joueur, ses parties et sa couleur. Joueurs suivis vérifiés et joueurs
// du top présents même sans partie (suggestions ; « aucune partie dans nos ouvertures »).
export function buildPlayersIndex(games, state, { now = Date.now(), opening = () => null, suivis = SUIVIS } = {}) {
  const list = games.slice().sort((a, b) => b.t - a.t || (a.id < b.id ? -1 : 1));
  const joueurs = new Map();
  const get = (key, init) => {
    if (!joueurs.has(key)) joueurs.set(key, { ...init, g: [], sd: '' });
    return joueurs.get(key);
  };
  const verified = Object.values(state.suivis || {}).filter((v) => v.ok);
  for (const s of suivis) {
    const c = verified.filter((v) => v.nom === s.nom).map((v) => ({ p: v.p, u: v.compte }));
    if (c.length) get(`s:${s.nom}`, { n: s.nom, s: 1, c });
  }
  for (const [p, tops] of Object.entries(state.tops || {})) {
    for (const l of Object.values(tops || {})) for (const u of l) {
      const nom = verified.find((v) => v.p === p && v.compte.toLowerCase() === u.u.toLowerCase())?.nom;
      if (!nom) get(`${p}:${u.u.toLowerCase()}`, { n: u.u, c: [{ p, u: u.u }] });
    }
  }
  const games2 = list.map((g, i) => {
    for (const side of ['w', 'b']) {
      const name = g[side];
      const canon = g[`${side}n`];
      let j;
      if (canon) j = get(`s:${canon}`, { n: canon, s: 1, c: [] });
      else if (g.p === 'bc') j = get(`bc:${normalizeName(name)}`, { n: name });
      else j = get(`${g.p}:${String(name).toLowerCase()}`, { n: name, c: [{ p: g.p, u: name }] });
      j.g.push(i);
      j.sd += side;
    }
    const op = opening(g.san || String(g.m).split(' '));
    return { ...publicGame(g), m: g.m || g.san.join(' '), eco: op?.eco || null, n: op?.name || null };
  });
  return {
    meta: {
      generatedAt: new Date(now).toISOString(),
      suivis: suivis.map((s) => ({ nom: s.nom, verifie: verified.some((v) => v.nom === s.nom) })),
      tournois: Object.values(state.bc?.tours || {}).map((t) => t.name),
    },
    joueurs: [...joueurs.values()],
    games: games2,
  };
}

export function buildDataset({ state, sources, o, run = {}, now = Date.now() }) {
  const games = withCanonicalNames(stateGames(state), state);
  const agg = aggregate(games, { plies: o.plies, minPositionGames: o.minPosition, samples: o.samples });
  const counts = countGames(agg.games);
  for (const [k, s] of Object.entries(sources)) if (k in counts) s.gamesKept = counts[k];
  const recent = recentGames({ games: Object.fromEntries(games.map((g) => [`${g.p}:${g.id}`, { ...g, m: g.san.join(' ') }])) }, o.recent, openingOf);
  const make = (min) => {
    const c = compact(agg, min);
    return {
      meta: {
        version: 2,
        generatedAt: new Date(now).toISOString(),
        description: 'Fréquences observées dans les parties récentes des meilleurs joueurs en ligne (blitz/rapide), de grands maîtres suivis et des tournois retransmis ; pas une évaluation moteur.',
        filters: {
          gd: '1.d4 d5 2.c4 (Gambit Dame, Blancs)', ck: '1.e4 c6 (Caro-Kann, Noirs)', rated: true, speeds: o.perfs,
          top: o.top, maxGamesPerPlayerPerSpeed: o.maxGames, maxGamesFollowed: o.maxGamesSuivis, months: o.months, plies: o.plies,
          minPositionGames: min, samplesPerPosition: o.samples,
          broadcasts: { months: o.bcMonths, minElo: o.bcMinElo, tier: o.bcTier },
        },
        run,
        sources,
        games: { total: agg.games.length, li: counts.li, cc: counts.cc, bc: counts.bc, gd: counts.gd, ck: counts.ck },
        positions: Object.keys(c.positions).length,
        positionsDropped: c.dropped,
        players: playersOf(state),
      },
      recent,
      positions: c.positions,
      games: c.games,
    };
  };
  let min = o.minPosition;
  let data = make(min);
  let json = JSON.stringify(data);
  while (json.length > o.maxBytes && min < 1000) {
    min++;
    data = make(min);
    json = JSON.stringify(data);
  }
  // Index de recherche : ≈ 2 Mo au plus ; au-delà, les coups publiés sont raccourcis (la partie
  // complète reste accessible par son lien d'origine), d'abord à 80 puis 50 demi-coups.
  const index = buildPlayersIndex(games, state, { now, opening: openingOf });
  let indexJson = JSON.stringify(index);
  for (const plies of [80, 50, 30]) {
    if (indexJson.length <= o.maxIndexBytes) break;
    for (const g of index.games) g.m = g.m.split(' ').slice(0, plies).join(' ');
    index.meta.coupsTronques = plies;
    indexJson = JSON.stringify(index);
  }
  return { data, json, index, indexJson };
}

// Source « joueurs suivis » : verdict de chaque compte candidat.
function suivisSource(state) {
  const comptes = Object.values(state.suivis || {}).map(({ at, ...v }) => v);
  const verified = comptes.filter((v) => v.ok).length;
  return {
    status: verified ? (comptes.some((v) => v.statut === 'non vérifié') ? 'partiel' : 'ok') : (comptes.length ? 'erreur' : 'ignoré'),
    players: new Set(comptes.filter((v) => v.ok).map((v) => v.nom)).size, verified, comptes, errors: [], gamesDownloaded: 0, newGames: 0,
  };
}

export async function run(o, { log = console.log, http, now = o.now ?? Date.now() } = {}) {
  const t0 = Date.now();
  http ??= new Http({ fixture: o.fixture, record: o.record, lichessToken: process.env.LICHESS_TOKEN || '', log });
  const statePath = o.state ? resolve(root, o.state) : null;
  let state = null;
  if (o.incremental && existsSync(resolve(root, o.incremental))) state = JSON.parse(readFileSync(resolve(root, o.incremental), 'utf8'));
  else if (o.incremental) log(`elite: ${o.incremental} absent : reconstruction complète.`);
  const incremental = !!state;
  state ??= emptyState();
  state.tops ??= { li: {}, cc: {} };
  state.etags ??= {};
  state.suivis ??= {};
  state.bc ??= { tours: {}, rounds: {} };
  const windowStart = now - o.months * MONTH_MS;
  const sources = {};
  const active = new Set();
  for (const [platform, fn] of [['li', syncLichess], ['cc', syncChessCom], ['bc', syncBroadcasts]]) {
    if (!o.sources.includes(platform)) {
      sources[platform] = { ...newSrc(), status: 'ignoré' };
      // Source non interrogée : en incrémental, ses joueurs et parties restent tels quels.
      if (incremental) Object.keys(state.owners).filter((k) => k.startsWith(`${platform}:`)).forEach((k) => active.add(k));
      else if (platform === 'bc') state.bc = { tours: {}, rounds: {} };
      else state.tops[platform] = {};
      continue;
    }
    const before = http.requests;
    const r = await fn(http, o, state, { log, windowStart, incremental, now });
    r.src.requests = http.requests - before;
    r.owners.forEach((k) => active.add(k));
    sources[platform] = r.src;
  }
  // Comptes suivis qui ne font plus partie de la configuration : oubliés.
  const configured = new Set(SUIVIS.flatMap((x) => [...x.li.map((u) => `li:${u.toLowerCase()}`), ...x.cc.map((u) => `cc:${u.toLowerCase()}`)]));
  for (const k of Object.keys(state.suivis)) if (!configured.has(k)) delete state.suivis[k];
  sources.su = suivisSource(state);
  const removed = pruneState(state, { now, months: o.months, activeOwners: active, monthsBy: { bc: o.bcMonths } });
  const added = sources.li.newGames + sources.cc.newGames + sources.bc.newGames;
  const runInfo = { mode: incremental ? 'incrémental' : 'complet', newGames: added, removedGames: removed, requests: http.requests, durationMs: Date.now() - t0 };
  const { data, json, indexJson } = buildDataset({ state, sources, o, run: runInfo, now });
  const out = resolve(root, o.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  const joueursPath = resolve(root, o.joueurs || join(dirname(o.out), 'joueurs.json'));
  writeFileSync(joueursPath, indexJson);
  if (statePath) {
    state.updatedAt = new Date(now).toISOString();
    state.params = { top: o.top, perfs: o.perfs, maxGames: o.maxGames, maxGamesSuivis: o.maxGamesSuivis, months: o.months, bcMonths: o.bcMonths };
    state.lastRun = { ...runInfo, sources: Object.fromEntries(Object.entries(sources).map(([k, s]) => [k, { status: s.status, errors: s.errors.slice(0, 20) }])) };
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state));
  }
  const m = data.meta;
  log(`elite (${runInfo.mode}) : +${added} / −${removed} parties ; ${m.games.total} parties (Lichess ${m.games.li}, Chess.com ${m.games.cc}, tournois ${m.games.bc}), ${m.positions} positions (≥ ${m.filters.minPositionGames} parties), ${(json.length / 1024).toFixed(0)} Ko + joueurs.json ${(indexJson.length / 1024).toFixed(0)} Ko, ${http.requests} requêtes, ${(runInfo.durationMs / 1000).toFixed(0)} s → ${o.out}`);
  for (const [k, s] of Object.entries(m.sources)) {
    if (k === 'su') { log(`  su : ${s.status}, ${s.verified} comptes vérifiés sur ${s.comptes.length} (${s.comptes.filter((c) => !c.ok).map((c) => `${c.p}:${c.compte} ${c.statut}`).join(', ') || 'aucun rejet'})`); continue; }
    log(`  ${k} : ${s.status}, ${k === 'bc' ? `${s.events} tournois` : `${s.players} joueurs`}, ${s.requests ?? 0} requêtes, ${s.gamesDownloaded} parties téléchargées, ${s.newGames} nouvelles du répertoire, ${s.gamesKept} gardées${s.errors.length ? `, ${s.errors.length} erreur(s) : ${s.errors.slice(0, 3).join(' | ')}` : ''}`);
  }
  // Aucune partie : échec explicite (en CI, rien n'est alors publié et l'ancien fichier reste).
  if (!m.games.total) {
    console.error('elite: aucune partie obtenue (sources en échec ?) : fichier écrit pour diagnostic, code de sortie 2.');
    process.exitCode = 2;
  }
  return { data, state, run: runInfo, index: JSON.parse(indexJson) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = parseArgs(process.argv.slice(2));
  // Node 22 n'utilise le proxy HTTPS de l'environnement que si NODE_USE_ENV_PROXY=1.
  if (!o.fixture && (process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } });
    process.exit(r.status ?? 1);
  }
  run(o).catch((e) => { console.error(`elite: ${e.message}`); process.exitCode = 1; });
}
