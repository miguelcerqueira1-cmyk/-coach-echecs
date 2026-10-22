// Génère site/data/elite.json : parties blitz/rapide récentes des meilleurs joueurs Lichess et
// Chess.com, limitées au répertoire (Blancs 1.d4 d5 2.c4 ; Noirs 1.e4 c6), agrégées par position.
//
//   node scripts/elite.mjs [options]
//     --top 50            joueurs par cadence et par plateforme
//     --perfs blitz,rapid cadences
//     --max-games 100     parties récentes au plus par joueur et par cadence
//     --months 3          Lichess : fenêtre (since) ; Chess.com : archives mensuelles lues au plus
//     --plies 24          demi-coups agrégés (les fiches vont jusqu'à 24)
//     --min-position 2    parties minimum pour publier une position
//     --samples 3         parties exemples par position
//     --max-bytes 1500000 taille visée : --min-position est relevé automatiquement au-delà
//     --sources li,cc     plateformes interrogées
//     --out site/data/elite.json
//     --fixture <dossier> hors ligne : réponses lues dans des fichiers (tests)
//     --record <dossier>  enregistre les réponses réelles (pour fabriquer des fixtures)
//
// Jeton Lichess facultatif : variable d'environnement LICHESS_TOKEN (jamais écrite ni affichée).
// Règles d'usage : une requête à la fois, une minute de pause après un 429 ; User-Agent avec
// l'adresse du dépôt pour Chess.com. Une source en échec est notée dans les métadonnées ; aucune
// donnée n'est inventée ni complétée.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  normalizeLichess, normalizeChessCom, parseNdjson, aggregate, compact, countGames, dedupe,
} from './elite-core.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_URL = process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}`
  : 'https://github.com/miguelcerqueira1-cmyk/-coach-echecs';
const USER_AGENT = `coach-echecs-elite/1.0 (+${REPO_URL})`;

export const DEFAULTS = {
  top: 50, perfs: ['blitz', 'rapid'], maxGames: 100, months: 3, plies: 24, minPosition: 2, samples: 3,
  maxBytes: 1500000, sources: ['li', 'cc'], out: 'site/data/elite.json', fixture: null, record: null,
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
      case '--max-bytes': o.maxBytes = num(v(), 'max-bytes'); break;
      case '--sources': o.sources = v().split(',').filter(Boolean); break;
      case '--out': o.out = v(); break;
      case '--fixture': o.fixture = v(); break;
      case '--record': o.record = v(); break;
      default: throw new Error(`Option inconnue : ${a}`);
    }
  }
  if (o.perfs.some((p) => !['blitz', 'rapid'].includes(p))) throw new Error('--perfs : blitz et/ou rapid');
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
  constructor({ fixture = null, record = null, lichessToken = '', pauseOn429Ms = 60000, minIntervalMs = { li: 600, cc: 300 }, fetchImpl = (...a) => fetch(...a), log = () => {} } = {}) {
    Object.assign(this, { fixture, record, lichessToken, pauseOn429Ms, minIntervalMs, fetchImpl, log });
    this.last = {};
    this.requests = 0;
  }

  async get(url, { accept = 'application/json', platform } = {}) {
    this.requests++;
    if (this.fixture) {
      const f = join(this.fixture, fixtureName(url));
      return existsSync(f) ? { status: 200, text: readFileSync(f, 'utf8') } : { status: 404, text: '' };
    }
    const headers = { accept, 'user-agent': USER_AGENT };
    if (platform === 'li' && this.lichessToken) headers.authorization = `Bearer ${this.lichessToken}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = (this.last[platform] || 0) + (this.minIntervalMs[platform] || 0) - Date.now();
      if (wait > 0) await sleep(wait);
      let res;
      try {
        res = await this.fetchImpl(url, { headers });
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
      const text = await res.text();
      this.last[platform] = Date.now();
      if (this.record && res.ok) {
        mkdirSync(this.record, { recursive: true });
        writeFileSync(join(this.record, fixtureName(url)), text);
      }
      return { status: res.status, text };
    }
    throw new Error('429 répétés : abandon');
  }

  async json(url, opts) {
    const r = await this.get(url, opts);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return JSON.parse(r.text);
  }
}

// ---------- Lichess ----------

export async function fetchLichess(http, o, log) {
  const src = { status: 'ok', players: 0, requests: 0, gamesDownloaded: 0, gamesKept: 0, errors: [] };
  const players = [];
  const byUser = new Map(); // id → { name, title, perfs: { blitz: rating } }
  for (const perf of o.perfs) {
    try {
      const d = await http.json(`https://lichess.org/api/player/top/${o.top}/${perf}`, { accept: 'application/vnd.lichess.v3+json', platform: 'li' });
      for (const u of d.users || []) {
        const p = byUser.get(u.id) || { name: u.username, title: u.title || null, perfs: {} };
        p.perfs[perf] = u.perfs?.[perf]?.rating ?? null;
        byUser.set(u.id, p);
      }
    } catch (e) {
      src.errors.push(`classement ${perf} : ${e.message}`);
    }
  }
  const since = Date.now() - o.months * 30.44 * 86400000;
  const games = [];
  for (const [, u] of byUser) {
    for (const perf of Object.keys(u.perfs)) {
      players.push({ p: 'li', u: u.name, t: u.title, perf, r: u.perfs[perf] });
      const qs = new URLSearchParams({
        max: String(o.maxGames), perfType: perf, rated: 'true', since: String(Math.round(since)),
        moves: 'true', clocks: 'false', evals: 'false', opening: 'false', pgnInJson: 'false',
      });
      try {
        const r = await http.get(`https://lichess.org/api/games/user/${encodeURIComponent(u.name)}?${qs}`, { accept: 'application/x-ndjson', platform: 'li' });
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        const { items, bad } = parseNdjson(r.text);
        if (bad) src.errors.push(`${u.name} (${perf}) : ${bad} ligne(s) NDJSON illisible(s)`);
        src.gamesDownloaded += items.length;
        for (const g of items) {
          const n = normalizeLichess(g, u.name, [perf]);
          if (n) games.push(n);
        }
      } catch (e) {
        src.errors.push(`${u.name} (${perf}) : ${e.message}`);
      }
    }
    log(`Lichess ${u.name} : ${games.length} parties du répertoire jusqu’ici`);
  }
  src.players = byUser.size;
  if (!byUser.size) src.status = 'erreur';
  else if (src.errors.length) src.status = 'partiel';
  return { src, players, games };
}

// ---------- Chess.com ----------

const CC_BOARDS = { blitz: 'live_blitz', rapid: 'live_rapid' };

export async function fetchChessCom(http, o, log) {
  const src = { status: 'ok', players: 0, requests: 0, gamesDownloaded: 0, gamesKept: 0, errors: [] };
  const players = [];
  const byUser = new Map();
  try {
    const d = await http.json('https://api.chess.com/pub/leaderboards', { platform: 'cc' });
    for (const perf of o.perfs) {
      for (const u of (d[CC_BOARDS[perf]] || []).slice(0, o.top)) {
        const k = String(u.username).toLowerCase();
        const p = byUser.get(k) || { name: u.username, title: u.title || null, perfs: {} };
        p.perfs[perf] = u.score ?? null;
        byUser.set(k, p);
      }
    }
  } catch (e) {
    src.errors.push(`classements : ${e.message}`);
  }
  const games = [];
  for (const [k, u] of byUser) {
    for (const perf of Object.keys(u.perfs)) players.push({ p: 'cc', u: u.name, t: u.title, perf, r: u.perfs[perf] });
    try {
      const a = await http.json(`https://api.chess.com/pub/player/${encodeURIComponent(k)}/games/archives`, { platform: 'cc' });
      const archives = (a.archives || []).slice(-o.months).reverse(); // plus récente d'abord
      const count = Object.fromEntries(Object.keys(u.perfs).map((p) => [p, 0]));
      for (const url of archives) {
        if (Object.values(count).every((n) => n >= o.maxGames)) break;
        const month = await http.json(url, { platform: 'cc' });
        const list = (month.games || []).slice().sort((x, y) => (y.end_time || 0) - (x.end_time || 0));
        for (const g of list) {
          if (!(g.time_class in count) || count[g.time_class] >= o.maxGames || g.rated === false || g.rules !== 'chess') continue;
          count[g.time_class]++;
          src.gamesDownloaded++;
          const n = normalizeChessCom(g, k, [g.time_class]);
          if (n) games.push(n);
        }
      }
    } catch (e) {
      src.errors.push(`${u.name} : ${e.message}`);
    }
    log(`Chess.com ${u.name} : ${games.length} parties du répertoire jusqu’ici`);
  }
  src.players = byUser.size;
  if (!byUser.size) src.status = 'erreur';
  else if (src.errors.length) src.status = 'partiel';
  return { src, players, games };
}

// ---------- Assemblage ----------

export function buildDataset({ results, o, now = new Date() }) {
  const all = dedupe(results.flatMap((r) => r.games));
  const agg = aggregate(all, { plies: o.plies, minPositionGames: o.minPosition, samples: o.samples });
  const counts = countGames(agg.games);
  const sources = {};
  for (const r of results) {
    r.src.gamesKept = counts[r.platform];
    sources[r.platform] = r.src;
  }
  const make = (min) => {
    const c = compact(agg, min);
    return {
      meta: {
        version: 1,
        generatedAt: now.toISOString(),
        description: 'Fréquences observées dans les parties blitz/rapide récentes des meilleurs joueurs en ligne ; pas une évaluation moteur.',
        filters: {
          gd: '1.d4 d5 2.c4 (Gambit Dame, Blancs)', ck: '1.e4 c6 (Caro-Kann, Noirs)', rated: true, speeds: o.perfs,
          top: o.top, maxGamesPerPlayerPerSpeed: o.maxGames, months: o.months, plies: o.plies,
          minPositionGames: min, samplesPerPosition: o.samples,
        },
        sources,
        games: { total: agg.games.length, li: counts.li, cc: counts.cc, gd: counts.gd, ck: counts.ck },
        positions: Object.keys(c.positions).length,
        positionsDropped: c.dropped,
        players: results.flatMap((r) => r.players),
      },
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

export async function run(o, { log = console.log, http } = {}) {
  http ??= new Http({ fixture: o.fixture, record: o.record, lichessToken: process.env.LICHESS_TOKEN || '', log });
  const results = [];
  const skipped = (platform) => ({ platform, src: { status: 'ignoré', players: 0, gamesDownloaded: 0, gamesKept: 0, errors: [] }, players: [], games: [] });
  for (const [platform, fn] of [['li', fetchLichess], ['cc', fetchChessCom]]) {
    if (!o.sources.includes(platform)) { results.push(skipped(platform)); continue; }
    const before = http.requests;
    const r = await fn(http, o, log);
    r.src.requests = http.requests - before;
    results.push({ platform, ...r });
  }
  const { data, json } = buildDataset({ results, o });
  const out = resolve(root, o.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  const m = data.meta;
  log(`elite: ${m.games.total} parties (Lichess ${m.games.li}, Chess.com ${m.games.cc}), ${m.positions} positions (≥ ${m.filters.minPositionGames} parties), ${(json.length / 1024).toFixed(0)} Ko → ${o.out}`);
  for (const [k, s] of Object.entries(m.sources)) {
    log(`  ${k} : ${s.status}, ${s.players} joueurs, ${s.requests ?? 0} requêtes, ${s.gamesDownloaded} parties téléchargées, ${s.gamesKept} gardées${s.errors.length ? `, ${s.errors.length} erreur(s) : ${s.errors.slice(0, 3).join(' | ')}` : ''}`);
  }
  // Aucune partie : échec explicite (en CI, la publication garde alors le fichier déjà en ligne).
  if (!m.games.total) {
    console.error('elite: aucune partie obtenue (sources en échec ?) : fichier écrit pour diagnostic, code de sortie 2.');
    process.exitCode = 2;
  }
  return data;
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
