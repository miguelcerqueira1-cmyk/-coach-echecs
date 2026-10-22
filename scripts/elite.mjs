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
//     --sources li,cc     plateformes interrogées
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
  emptyState, ownerKey, recordDownload, pruneState, stateGames, recentGames, MONTH_MS,
} from './elite-core.mjs';
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
  maxBytes: 1500000, sources: ['li', 'cc'], out: 'site/data/elite.json', state: null, incremental: null, fixture: null, record: null, now: null,
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

// ---------- Lichess ----------

export async function syncLichess(http, o, state, { log, windowStart, incremental }) {
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
  // Compteurs de parties classées par cadence, en une requête (jusqu'à 300 joueurs) : un joueur dont
  // le compteur n'a pas bougé depuis le passage précédent n'a pas fini de partie, inutile d'exporter.
  let counts = null;
  const ids = [...new Set(Object.values(tops).flat().map((u) => u.u.toLowerCase()))];
  if (ids.length) {
    try {
      const r = await http.get('https://lichess.org/api/users', { platform: 'li', body: ids.slice(0, 300).join(',') });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      counts = new Map(JSON.parse(r.text).map((u) => [u.id, u.perfs || {}]));
    } catch (e) {
      if (incremental) src.errors.push(`compteurs de parties : ${e.message} (tous les joueurs sont interrogés)`);
    }
  }
  src.skipped = 0;
  const owners = new Set();
  for (const perf of o.perfs) {
    for (const u of tops[perf]) {
      const key = ownerKey('li', u.u, perf);
      owners.add(key);
      const prev = state.owners[key];
      const n = counts?.get(u.u.toLowerCase())?.[perf]?.games ?? null;
      if (incremental && prev && n != null && prev.n === n) { src.skipped++; continue; }
      const since = incremental && prev ? Math.max(windowStart, prev.last - LICHESS_OVERLAP_MS) : windowStart;
      const qs = new URLSearchParams({
        max: String(o.maxGames), perfType: perf, rated: 'true', since: String(Math.round(since)),
        moves: 'true', clocks: 'false', evals: 'false', opening: 'false', pgnInJson: 'false',
      });
      try {
        const r = await http.get(`https://lichess.org/api/games/user/${encodeURIComponent(u.u)}?${qs}`, { accept: 'application/x-ndjson', platform: 'li' });
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        const { items, bad } = parseNdjson(r.text);
        if (bad) src.errors.push(`${u.u} (${perf}) : ${bad} ligne(s) NDJSON illisible(s)`);
        const list = items.filter((g) => g.speed === perf && g.rated !== false && g.createdAt >= windowStart);
        src.gamesDownloaded += list.length;
        src.newGames += recordDownload(state, key, list.map((g) => ({ id: g.id, t: g.createdAt, game: normalizeLichess(g, u.u, [perf]) })), o);
        state.owners[key].n = n;
      } catch (e) {
        src.errors.push(`${u.u} (${perf}) : ${e.message}`);
      }
    }
    log(`Lichess ${perf} : ${tops[perf].length} joueurs (${src.skipped} sans nouvelle partie jusqu’ici), ${src.newGames} nouvelles parties du répertoire jusqu’ici`);
  }
  return { src: finish(src, tops), owners };
}

// ---------- Chess.com ----------

const CC_BOARDS = { blitz: 'live_blitz', rapid: 'live_rapid' };
const monthUrl = (user, d) => `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export async function syncChessCom(http, o, state, { log, windowStart, incremental, now }) {
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
  const byUser = new Map();
  for (const perf of o.perfs) {
    for (const u of tops[perf]) {
      const k = u.u.toLowerCase();
      byUser.set(k, [...(byUser.get(k) || []), perf]);
    }
  }
  const owners = new Set();
  const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  for (const [user, perfs] of byUser) {
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
        if (!known && perfs.every((p) => items[p].length >= o.maxGames)) break;
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
          if (items[p].length >= o.maxGames) continue;
          const id = String(g.url || '').split('/').pop();
          if (!id) continue;
          items[p].push({ id, t, game: normalizeChessCom(g, user, [p]) });
        }
      }
      for (const p of perfs) {
        src.gamesDownloaded += items[p].length;
        src.newGames += recordDownload(state, keys[p], items[p], o);
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

export function buildDataset({ state, sources, o, run = {}, now = Date.now() }) {
  const games = stateGames(state);
  const agg = aggregate(games, { plies: o.plies, minPositionGames: o.minPosition, samples: o.samples });
  const counts = countGames(agg.games);
  for (const [k, s] of Object.entries(sources)) s.gamesKept = counts[k];
  const recent = recentGames(state, o.recent, openingOf);
  const make = (min) => {
    const c = compact(agg, min);
    return {
      meta: {
        version: 1,
        generatedAt: new Date(now).toISOString(),
        description: 'Fréquences observées dans les parties blitz/rapide récentes des meilleurs joueurs en ligne ; pas une évaluation moteur.',
        filters: {
          gd: '1.d4 d5 2.c4 (Gambit Dame, Blancs)', ck: '1.e4 c6 (Caro-Kann, Noirs)', rated: true, speeds: o.perfs,
          top: o.top, maxGamesPerPlayerPerSpeed: o.maxGames, months: o.months, plies: o.plies,
          minPositionGames: min, samplesPerPosition: o.samples,
        },
        run,
        sources,
        games: { total: agg.games.length, li: counts.li, cc: counts.cc, gd: counts.gd, ck: counts.ck },
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
  return { data, json };
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
  const windowStart = now - o.months * MONTH_MS;
  const sources = {};
  const active = new Set();
  for (const [platform, fn] of [['li', syncLichess], ['cc', syncChessCom]]) {
    if (!o.sources.includes(platform)) {
      sources[platform] = { ...newSrc(), status: 'ignoré' };
      // Plateforme non interrogée : en incrémental, ses joueurs et parties restent tels quels.
      if (incremental) Object.keys(state.owners).filter((k) => k.startsWith(`${platform}:`)).forEach((k) => active.add(k));
      else state.tops[platform] = {};
      continue;
    }
    const before = http.requests;
    const r = await fn(http, o, state, { log, windowStart, incremental, now });
    r.src.requests = http.requests - before;
    r.owners.forEach((k) => active.add(k));
    sources[platform] = r.src;
  }
  const removed = pruneState(state, { now, months: o.months, activeOwners: active });
  const added = sources.li.newGames + sources.cc.newGames;
  const runInfo = { mode: incremental ? 'incrémental' : 'complet', newGames: added, removedGames: removed, requests: http.requests, durationMs: Date.now() - t0 };
  const { data, json } = buildDataset({ state, sources, o, run: runInfo, now });
  const out = resolve(root, o.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  if (statePath) {
    state.updatedAt = new Date(now).toISOString();
    state.params = { top: o.top, perfs: o.perfs, maxGames: o.maxGames, months: o.months };
    state.lastRun = { ...runInfo, sources: Object.fromEntries(Object.entries(sources).map(([k, s]) => [k, { status: s.status, errors: s.errors.slice(0, 20) }])) };
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state));
  }
  const m = data.meta;
  log(`elite (${runInfo.mode}) : +${added} / −${removed} parties ; ${m.games.total} parties (Lichess ${m.games.li}, Chess.com ${m.games.cc}), ${m.positions} positions (≥ ${m.filters.minPositionGames} parties), ${(json.length / 1024).toFixed(0)} Ko, ${http.requests} requêtes, ${(runInfo.durationMs / 1000).toFixed(0)} s → ${o.out}`);
  for (const [k, s] of Object.entries(m.sources)) {
    log(`  ${k} : ${s.status}, ${s.players} joueurs, ${s.requests ?? 0} requêtes, ${s.gamesDownloaded} parties téléchargées, ${s.newGames} nouvelles du répertoire, ${s.gamesKept} gardées${s.errors.length ? `, ${s.errors.length} erreur(s) : ${s.errors.slice(0, 3).join(' | ')}` : ''}`);
  }
  // Aucune partie : échec explicite (en CI, rien n'est alors publié et l'ancien fichier reste).
  if (!m.games.total) {
    console.error('elite: aucune partie obtenue (sources en échec ?) : fichier écrit pour diagnostic, code de sortie 2.');
    process.exitCode = 2;
  }
  return { data, state, run: runInfo };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = parseArgs(process.argv.slice(2));
  // Node 22 n'utilise le proxy HTTPS de l'environnement que si NODE_USE_ENV_PROXY=1.
  if (!o.fixture && (process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } });
    process.exit(r.status ?? 1);
  }
  run(o).catch((e) => { console.error(`elite: ${e.message}`); process.exitCode = 1; });
}
