// Client UCI pour Stockfish (WebAssembly, monothread) exécuté dans un Web Worker.
// Un seul calcul à la fois ; une nouvelle demande arrête le calcul en cours,
// dont le résultat est alors marqué « annulé » et jamais affiché.

const CACHE_PREFIX = 'coach-echecs-moteur-';

export function parseInfo(line) {
  if (!line.startsWith('info ') || line.includes(' string ')) return null;
  const t = line.split(' ');
  const info = {};
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': info.depth = +t[++i]; break;
      case 'seldepth': info.seldepth = +t[++i]; break;
      case 'multipv': info.multipv = +t[++i]; break;
      case 'nodes': info.nodes = +t[++i]; break;
      case 'nps': info.nps = +t[++i]; break;
      case 'time': info.time = +t[++i]; break;
      case 'hashfull': info.hashfull = +t[++i]; break;
      case 'score': {
        const type = t[++i];
        const value = +t[++i];
        info.score = { type, value }; // type : 'cp' ou 'mate', point de vue du camp au trait
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') info.bound = t[++i];
        break;
      }
      case 'wdl': info.wdl = [+t[++i], +t[++i], +t[++i]]; break; // ‰, camp au trait
      case 'pv': info.pv = t.slice(i + 1); i = t.length; break;
      default: break;
    }
  }
  return info;
}

export class Engine {
  constructor({ baseUrl = './engine/', onStatus = () => {} } = {}) {
    this.baseUrl = baseUrl;
    this.onStatus = onStatus;
    this.state = 'idle'; // idle | loading | ready | error
    this.worker = null;
    this.current = null;
    this.pending = null;
    this.listeners = new Set();
    this.lastGameId = null;
    this.name = '';
  }

  _setState(state, detail = {}) {
    this.state = state;
    this.onStatus({ state, ...detail });
  }

  // Télécharge le WASM (avec progression), le garde en cache sur l'appareil,
  // puis démarre le moteur et attend « uciok » / « readyok ».
  async load() {
    if (this.state === 'loading' || this.state === 'ready') return;
    this._setState('loading', { progress: 0 });
    try {
      const manifest = await (await fetch(this.baseUrl + 'manifest.json', { cache: 'no-cache' })).json();
      this.manifest = manifest;
      const bytes = await this._getWasm(manifest);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
      const jsUrl = new URL(this.baseUrl + 'stockfish.js?v=' + manifest.wasmSha256, location.href).href;
      this.worker = new Worker(jsUrl + '#' + encodeURIComponent(blobUrl));
      this.worker.onmessage = (e) => this._onLine(String(e.data));
      this.worker.onerror = (e) => this._fail('Erreur du moteur : ' + (e.message || 'inconnue'));
      this._send('uci');
      await this._waitFor((l) => l === 'uciok', 30000, 'Le moteur ne répond pas (uci)');
      // Pleine force : aucun « Skill Level » ni « UCI_LimitStrength ».
      this._send('setoption name UCI_ShowWDL value true');
      this._send('setoption name Hash value 32');
      this._send('setoption name Threads value 1');
      this._send('isready');
      await this._waitFor((l) => l === 'readyok', 30000, 'Le moteur ne répond pas (isready)');
      this._setState('ready', { name: this.name, manifest });
    } catch (e) {
      this._fail(e.message || String(e));
      throw e;
    }
  }

  async _getWasm(manifest) {
    const url = new URL(this.baseUrl + 'stockfish.wasm', location.href).href;
    const key = url + '?v=' + manifest.wasmSha256;
    let cache = null;
    try {
      if ('caches' in self) {
        cache = await caches.open(CACHE_PREFIX + manifest.wasmSha256);
        const hit = await cache.match(key);
        if (hit) {
          this._setState('loading', { progress: 1, cached: true });
          return await hit.arrayBuffer();
        }
        // Supprime les anciennes versions du moteur.
        for (const name of await caches.keys()) {
          if (name.startsWith(CACHE_PREFIX) && name !== CACHE_PREFIX + manifest.wasmSha256) await caches.delete(name);
        }
      }
    } catch { cache = null; }

    const res = await fetch(key);
    if (!res.ok) throw new Error(`Téléchargement du moteur impossible (HTTP ${res.status})`);
    const total = manifest.wasmBytes || Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) this._setState('loading', { progress: Math.min(received / total, 1), received, total });
    }
    const bytes = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.length; }
    if (cache) {
      try {
        await cache.put(key, new Response(bytes, { headers: { 'content-type': 'application/wasm' } }));
      } catch { /* stockage plein ou refusé : le moteur fonctionne quand même */ }
    }
    return bytes.buffer;
  }

  _send(cmd) { this.worker.postMessage(cmd); }

  _waitFor(pred, ms, msg) {
    return new Promise((resolve, reject) => {
      const fn = (line) => { if (pred(line)) { clearTimeout(timer); this.listeners.delete(fn); resolve(line); } };
      const timer = setTimeout(() => { this.listeners.delete(fn); reject(new Error(msg)); }, ms);
      this.listeners.add(fn);
    });
  }

  _onLine(line) {
    for (const fn of [...this.listeners]) fn(line);
    if (line.startsWith('id name ')) this.name = line.slice(8);
    const job = this.current;
    if (!job) return;
    if (line.startsWith('info ')) {
      const info = parseInfo(line);
      if (info && info.pv && info.score && (info.multipv || 1) === 1) {
        // Une borne (lowerbound/upperbound) n'est pas une évaluation exacte : on garde la dernière exacte.
        if (!info.bound || !job.last) job.last = info;
        if (!job.cancelled && job.onInfo) job.onInfo(info);
      }
    } else if (line.startsWith('bestmove')) {
      clearTimeout(job.watchdog);
      const parts = line.split(' ');
      const res = {
        bestmove: parts[1],
        ponder: parts[3] || null,
        info: job.last || null,
        movetime: job.movetime,
        elapsedMs: Math.round(performance.now() - job.started),
        token: job.token,
        engine: this.name,
      };
      this.current = null;
      job.resolve(job.cancelled ? { cancelled: true, token: job.token } : res);
      this._next();
    }
  }

  _fail(message) {
    const jobs = [this.current, this.pending].filter(Boolean);
    this.current = null;
    this.pending = null;
    for (const j of jobs) { clearTimeout(j.watchdog); j.reject(new Error(message)); }
    try { this.worker?.terminate(); } catch { /* déjà arrêté */ }
    this.worker = null;
    this._setState('error', { message });
  }

  // Lance un calcul. `token` identifie la partie/branche/révision demandée.
  analyze({ position, movetime, token, onInfo }) {
    if (this.state !== 'ready') return Promise.reject(new Error('Moteur indisponible'));
    return new Promise((resolve, reject) => {
      const job = { position, movetime, token, onInfo, resolve, reject, cancelled: false };
      if (this.pending) this.pending.resolve({ cancelled: true, token: this.pending.token });
      this.pending = job;
      if (this.current) {
        if (!this.current.cancelled) { this.current.cancelled = true; this._send('stop'); }
      } else {
        this._next();
      }
    });
  }

  // Interrompt le calcul en cours ; son résultat partiel est rendu normalement.
  stop() { if (this.current) this._send('stop'); }

  // Annule tout calcul (changement de position).
  cancelAll() {
    if (this.pending) { this.pending.resolve({ cancelled: true, token: this.pending.token }); this.pending = null; }
    if (this.current && !this.current.cancelled) { this.current.cancelled = true; this._send('stop'); }
  }

  _next() {
    const job = this.pending;
    if (!job || this.current) return;
    this.pending = null;
    this.current = job;
    if (job.token && job.token.gameId !== this.lastGameId) {
      this.lastGameId = job.token.gameId;
      this._send('ucinewgame');
    }
    this._send(job.position);
    job.started = performance.now();
    this._send(`go movetime ${job.movetime}`);
    // Si le moteur ne rend pas de « bestmove », on le déclare en panne au lieu d'inventer un conseil.
    job.watchdog = setTimeout(() => this._fail('Le moteur ne répond plus (délai dépassé)'), job.movetime + 20000);
  }

  async restart() {
    try { this.worker?.terminate(); } catch { /* rien */ }
    this.worker = null;
    this.state = 'idle';
    this.lastGameId = null;
    await this.load();
  }
}
