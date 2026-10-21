import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RequestQueue, LichessClient, enrichMoves, bestByWinRate, parseCloudEval, nodeStats, bucketLabel, EXPLORER_URL,
} from '../../site/js/lichess.js';

const resp = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('pourcentages et meilleur % de victoire avec seuil de parties', () => {
  const moves = [
    { uci: 'e2e4', san: 'e4', white: 500, draws: 100, black: 400 },
    { uci: 'd2d4', san: 'd4', white: 300, draws: 100, black: 100 },
    { uci: 'g2g4', san: 'g4', white: 9, draws: 0, black: 1 },
  ];
  const w = enrichMoves(moves, 'w');
  assert.equal(Math.round(w[0].win), 50);
  assert.equal(Math.round(w[1].win), 60);
  assert.equal(bestByWinRate(w, 50).san, 'd4', 'g4 (10 parties) écarté malgré 90 %');
  assert.equal(bestByWinRate(w, 5).san, 'g4');
  assert.equal(bestByWinRate(w, 10000), null);
  const b = enrichMoves(moves, 'b');
  assert.equal(Math.round(b[0].win), 40, 'point de vue des Noirs');
  const s = nodeStats({ white: 1, draws: 2, black: 1 });
  assert.deepEqual([s.white, s.draws, s.black], [25, 50, 25]);
  assert.equal(bucketLabel(0), '< 1000');
  assert.equal(bucketLabel(1000), '1000–1199');
  assert.equal(bucketLabel(2500), '2500+');
});

test('Cloud Eval : centipions, mat, position absente', async () => {
  const pe = parseCloudEval({ depth: 40, knodes: 10, pvs: [{ moves: 'e2e4 e7e5', cp: 18 }, { moves: 'd1h5', mate: -3 }] });
  assert.deepEqual(pe.pvs[0].score, { type: 'cp', value: 18 });
  assert.deepEqual(pe.pvs[1].score, { type: 'mate', value: -3 });
  const calls = [];
  const q = new RequestQueue({ minIntervalMs: 0, fetchImpl: async (u) => { calls.push(u); return resp(404, {}); } });
  const c = new LichessClient({ queue: q });
  const r = await c.cloudEval('8/8/8/8/8/8/8/K1k5 w - - 0 1');
  assert.equal(r.status, 'absent');
  assert.match(calls[0], /^https:\/\/lichess\.org\/api\/cloud-eval\?fen=/);
  await c.cloudEval('8/8/8/8/8/8/8/K1k5 w - - 0 1');
  assert.equal(calls.length, 1, 'résultat mis en cache');
});

test('file d’attente : une requête à la fois, pause après 429, requêtes obsolètes abandonnées', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let n = 0;
  const q = new RequestQueue({
    minIntervalMs: 0,
    pauseOn429Ms: 200,
    fetchImpl: async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      n++;
      return n === 2 ? resp(429, {}) : resp(200, {});
    },
  });
  const results = await Promise.allSettled([q.run('a'), q.run('b'), q.run('c'), q.run('d', {}, { isStale: () => true })]);
  assert.equal(maxInFlight, 1);
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.kind, 'rate');
  assert.equal(results[3].value.stale, true);
  assert.ok(q.pausedUntil > 0);
});

test('Opening Explorer : jeton requis, envoi du jeton, ou relais du Worker', async () => {
  const none = new LichessClient({ queue: new RequestQueue({ minIntervalMs: 0, fetchImpl: async () => resp(200, {}) }) });
  await assert.rejects(none.explorer({ fen: 'x' }), (e) => e.kind === 'token');

  const seen = [];
  const fetchImpl = async (u, init) => { seen.push({ u, auth: init.headers.authorization }); return resp(200, { white: 6, draws: 2, black: 2, moves: [] }); };
  const direct = new LichessClient({ getToken: () => 'lip_secret', queue: new RequestQueue({ minIntervalMs: 0, fetchImpl }) });
  const d = await direct.explorer({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', play: ['d2d4', 'd7d5'], ratings: [0, 1000], speeds: ['blitz'] });
  assert.equal(d.mode, 'jeton');
  assert.equal(Math.round(d.stats.white), 60);
  assert.ok(seen[0].u.startsWith(EXPLORER_URL + '?'));
  assert.match(seen[0].u, /ratings=0%2C1000/);
  assert.match(seen[0].u, /speeds=blitz/);
  assert.match(seen[0].u, /play=d2d4%2Cd7d5/);
  assert.equal(seen[0].auth, 'Bearer lip_secret');

  const relay = new LichessClient({ getToken: () => 'lip_secret', getProxy: () => ({ url: 'https://api.test/', code: 'code' }), queue: new RequestQueue({ minIntervalMs: 0, fetchImpl }) });
  const r = await relay.explorer({ fen: 'f', ratings: [1000] });
  assert.equal(r.mode, 'relais');
  assert.match(seen[1].u, /^https:\/\/api\.test\/v1\/explorer\?/);
  assert.equal(seen[1].auth, 'Bearer code', 'le jeton Lichess ne part pas vers le relais');

  const bad = new LichessClient({ getToken: () => 't', queue: new RequestQueue({ minIntervalMs: 0, fetchImpl: async () => resp(401, {}) }) });
  await assert.rejects(bad.explorer({ fen: 'z' }), (e) => e.kind === 'token');
});
