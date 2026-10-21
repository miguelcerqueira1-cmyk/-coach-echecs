// Accès aux API Lichess depuis le navigateur.
// - Cloud Eval (public, sans jeton) : évaluations Stockfish déjà calculées et mises en cache par Lichess.
//   Une position absente du cache renvoie 404 : on l'affiche comme « absente », sans rien inventer.
// - Opening Explorer (explorer.lichess.org) : statistiques de parties réelles. La spécification
//   officielle exige un jeton OAuth2 ; on passe soit par un jeton personnel (sans permission)
//   conservé sur l'appareil, soit par le relais du Worker Cloudflare (jeton côté serveur).
// Règles d'usage Lichess respectées : une requête à la fois, et une minute de pause après un 429.

export const CLOUD_EVAL_URL = 'https://lichess.org/api/cloud-eval';
export const EXPLORER_URL = 'https://explorer.lichess.org/lichess';

export const RATING_BUCKETS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
export const SPEEDS = ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence'];
export const SPEED_LABELS = { ultraBullet: 'UltraBullet', bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapide', classical: 'Classique', correspondence: 'Correspondance' };

export function bucketLabel(r) {
  const i = RATING_BUCKETS.indexOf(r);
  const next = RATING_BUCKETS[i + 1];
  if (r === 0) return '< 1000';
  return next ? `${r}–${next - 1}` : `${r}+`;
}

export const PRESETS = {
  'blitz-1000': { label: 'Blitz ≈ 1000 Elo Lichess', ratings: [0, 1000], speeds: ['blitz'] },
  'blitz-1200': { label: 'Blitz 1000–1400', ratings: [1000, 1200], speeds: ['blitz'] },
  'rapide-1400': { label: 'Rapide 1400–1800', ratings: [1400, 1600], speeds: ['rapid'] },
  'club': { label: 'Blitz/Rapide 1600–2000', ratings: [1600, 1800], speeds: ['blitz', 'rapid'] },
  'fort': { label: 'Joueurs forts 2200+', ratings: [2200, 2500], speeds: ['blitz', 'rapid', 'classical'] },
};

export class LichessError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

// File d'attente série : une seule requête Lichess en vol à la fois.
export class RequestQueue {
  constructor({ minIntervalMs = 250, pauseOn429Ms = 60000, fetchImpl = (...a) => fetch(...a) } = {}) {
    this.minIntervalMs = minIntervalMs;
    this.pauseOn429Ms = pauseOn429Ms;
    this.fetchImpl = fetchImpl;
    this.chain = Promise.resolve();
    this.pausedUntil = 0;
    this.last = 0;
  }

  // `isStale()` permet d'abandonner une requête devenue inutile avant son envoi.
  run(url, init = {}, { isStale = () => false } = {}) {
    const task = this.chain.then(async () => {
      if (isStale()) return { stale: true };
      const wait = Math.max(this.pausedUntil - Date.now(), this.last + this.minIntervalMs - Date.now(), 0);
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (isStale()) return { stale: true };
      this.last = Date.now();
      let res;
      try {
        res = await this.fetchImpl(url, init);
      } catch {
        throw new LichessError('Lichess injoignable (réseau ou CORS).', 'network');
      }
      if (res.status === 429) {
        this.pausedUntil = Date.now() + this.pauseOn429Ms;
        throw new LichessError('Trop de requêtes vers Lichess : pause d’une minute.', 'rate');
      }
      return { res };
    });
    this.chain = task.catch(() => {});
    return task;
  }
}

class MemoCache {
  constructor(max = 500) { this.max = max; this.map = new Map(); }
  get(k) { return this.map.get(k); }
  set(k, v) {
    this.map.set(k, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}

// ---------- Calculs sur les statistiques ----------

export function pct(n, total) { return total ? (100 * n) / total : 0; }

// Statistiques d'un nœud (position ou coup) : pourcentages Blancs / nulles / Noirs.
export function nodeStats(n) {
  const total = (n.white || 0) + (n.draws || 0) + (n.black || 0);
  return {
    total,
    white: pct(n.white || 0, total),
    draws: pct(n.draws || 0, total),
    black: pct(n.black || 0, total),
  };
}

// Pour chaque coup : % de victoire et score du camp qui le joue.
export function enrichMoves(moves, sideToMove) {
  return (moves || []).map((m) => {
    const s = nodeStats(m);
    const win = sideToMove === 'w' ? s.white : s.black;
    const loss = sideToMove === 'w' ? s.black : s.white;
    return { ...m, stats: s, win, loss, score: win + s.draws / 2 };
  });
}

// Coup au meilleur % de victoire parmi ceux qui ont assez de parties.
// Un coup joué 3 fois avec 100 % ne dit rien : le seuil évite ce piège.
export function bestByWinRate(enriched, minGames = 50) {
  const eligible = enriched.filter((m) => m.stats.total >= minGames);
  if (!eligible.length) return null;
  return eligible.reduce((a, b) => (b.win > a.win || (b.win === a.win && b.stats.total > a.stats.total) ? b : a));
}

// Évaluation Cloud Eval → point de vue des Blancs (Lichess donne déjà ce point de vue).
export function parseCloudEval(data) {
  const pvs = (data.pvs || []).map((p) => ({
    moves: (p.moves || '').split(' ').filter(Boolean),
    score: p.mate !== undefined ? { type: 'mate', value: p.mate } : { type: 'cp', value: p.cp },
  }));
  return { depth: data.depth, knodes: data.knodes, pvs };
}

// ---------- Client ----------

export class LichessClient {
  constructor({ getToken = () => '', getProxy = () => null, queue = new RequestQueue() } = {}) {
    this.getToken = getToken;
    this.getProxy = getProxy; // { url, code } du Worker si le relais est disponible
    this.queue = queue;
    this.cache = new MemoCache();
  }

  explorerMode() {
    if (this.getProxy()) return 'relais';
    if (this.getToken()) return 'jeton';
    return null;
  }

  async cloudEval(fen, { multiPv = 1, isStale } = {}) {
    const url = `${CLOUD_EVAL_URL}?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`;
    const hit = this.cache.get(url);
    if (hit) return hit;
    const r = await this.queue.run(url, {}, { isStale });
    if (r.stale) return { stale: true };
    let out;
    if (r.res.status === 404) out = { status: 'absent' };
    else if (!r.res.ok) throw new LichessError(`Cloud Eval : erreur HTTP ${r.res.status}`, 'server');
    else out = { status: 'ok', ...parseCloudEval(await r.res.json()) };
    this.cache.set(url, out);
    return out;
  }

  // fen : position de départ ; play : coups UCI depuis cette position (nécessaire pour le nom d'ouverture).
  async explorer({ fen, play = [], ratings, speeds, moves = 15, isStale } = {}) {
    const mode = this.explorerMode();
    if (!mode) throw new LichessError('Jeton Lichess requis pour l’Opening Explorer (Réglages).', 'token');
    const qs = new URLSearchParams({ variant: 'standard', fen, play: play.join(','), moves: String(moves), topGames: '0', recentGames: '0' });
    if (ratings?.length) qs.set('ratings', ratings.join(','));
    if (speeds?.length) qs.set('speeds', speeds.join(','));
    const key = qs.toString();
    const hit = this.cache.get(key);
    if (hit) return hit;
    let url;
    const init = { headers: {} };
    if (mode === 'relais') {
      const p = this.getProxy();
      url = `${p.url.replace(/\/+$/, '')}/v1/explorer?${key}`;
      init.headers.authorization = 'Bearer ' + p.code;
    } else {
      url = `${EXPLORER_URL}?${key}`;
      init.headers.authorization = 'Bearer ' + this.getToken();
    }
    const r = await this.queue.run(url, init, { isStale });
    if (r.stale) return { stale: true };
    if (r.res.status === 401) {
      throw new LichessError(mode === 'relais' ? 'Relais : code d’accès refusé.' : 'Jeton Lichess refusé ou expiré.', 'token');
    }
    if (!r.res.ok) throw new LichessError(`Opening Explorer : erreur HTTP ${r.res.status}`, 'server');
    const data = await r.res.json();
    const out = { ...data, mode, stats: nodeStats(data) };
    this.cache.set(key, out);
    return out;
  }
}
