import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Chess } from '../../site/vendor/chess.js';
import {
  firstSans, normalizeLichess, normalizeChessCom, parseNdjson, aggregate, compact, dedupe, countGames,
  repertoireEntry, buildRepertoireIndex, TRANSPO_PLIES,
  emptyState, ownerKey, recordDownload, pruneState, stateGames, recentGames, MONTH_MS,
} from '../../scripts/elite-core.mjs';
import { parseArgs, fixtureName, Http, run, buildDataset, DEFAULTS, LICHESS_OVERLAP_MS } from '../../scripts/elite.mjs';
import { fenKey, lookupElite, repertoireOfSan, gameInfo, eliteSummary, absentText, splitText } from '../../site/js/elite.js';

const FIXTURE = new URL('../fixtures/elite/', import.meta.url).pathname;
const fenAfter = (san) => { const c = new Chess(); san.forEach((m) => c.move(m)); return c.fen(); };
const li = (id, moves, extra = {}) => ({
  id, rated: true, variant: 'standard', speed: 'blitz', createdAt: Date.UTC(2026, 9, 1), status: 'resign', winner: 'white',
  players: { white: { user: { name: 'TopA' }, rating: 3000 }, black: { user: { name: 'Adv' }, rating: 2800 } }, moves, ...extra,
});
const game = (p, id, san, r, wr = 3000, br = 2800) => ({ p, id, w: 'W', wr, b: 'B', br, y: 2026, r, s: 'blitz', san: san.split(' ') });

test('clé de position sans compteurs, racines du répertoire', () => {
  assert.equal(fenKey('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1'), 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -');
  assert.equal(repertoireOfSan(['d4', 'd5', 'c4', 'e6']), 'gd');
  assert.equal(repertoireOfSan(['e4', 'c6']), 'ck');
  assert.equal(repertoireOfSan(['d4', 'Nf6', 'c4']), null);
  assert.equal(repertoireOfSan(['c4', 'd5', 'd4']), null, 'ordre de coups littéral (1.d4 d5 2.c4)');
  assert.equal(repertoireOfSan(['e4', 'e5']), null);
});

test('premiers coups d’un PGN Chess.com (horloges, numéros 1...)', () => {
  assert.deepEqual(firstSans('1. d4 {[%clk 0:02:59.9]} 1... d5 {[%clk 0:02:59]} 2. c4 {[%clk 0:02:58]} 2... e6 1-0'), ['d4', 'd5', 'c4']);
  assert.deepEqual(firstSans('1.e4 c6 2.d4', 2), ['e4', 'c6']);
  assert.deepEqual(firstSans('1. e4 1-0', 3), ['e4']);
});

test('Lichess : seules les parties classées blitz/rapide du répertoire, terminées, sont gardées', () => {
  const g = normalizeLichess(li('abcd1234', 'd4 d5 c4 e6 Nc3'), 'TopA');
  assert.deepEqual(g, { p: 'li', id: 'abcd1234', w: 'TopA', wr: 3000, b: 'Adv', br: 2800, y: 2026, t: Date.UTC(2026, 9, 1), r: '1-0', s: 'blitz', san: ['d4', 'd5', 'c4', 'e6', 'Nc3'], rp: 'gd', e: 3 });
  assert.equal(normalizeLichess(li('x', 'e4 c6 d4', { winner: undefined, status: 'draw' }), 'TopA').r, '1/2-1/2');
  assert.equal(normalizeLichess(li('x', 'd4 Nf6 c4'), 'TopA'), null, 'hors répertoire');
  assert.equal(normalizeLichess(li('x', 'd4 d5 c4', { speed: 'bullet' }), 'TopA'), null, 'bullet');
  assert.equal(normalizeLichess(li('x', 'd4 d5 c4', { rated: false }), 'TopA'), null, 'amicale');
  assert.equal(normalizeLichess(li('x', 'd4 d5 c4', { variant: 'chess960' }), 'TopA'), null);
  assert.equal(normalizeLichess(li('x', 'd4 d5 c4', { winner: undefined, status: 'aborted' }), 'TopA'), null, 'sans résultat');
  assert.equal(normalizeLichess(li('x', 'd4 d5 c4 Ke3'), 'TopA'), null, 'coup illégal');
  assert.equal(normalizeLichess(li('x', 'd4 d5 c4', { speed: 'rapid' }), 'TopA', ['blitz']), null, 'cadence non demandée');
});

test('Chess.com : archive mensuelle, PGN avec horloges', () => {
  const pgn = '[Event "Live Chess"]\n[White "TopB"]\n[Black "Adv"]\n[Result "0-1"]\n\n1. e4 {[%clk 0:02:59.9]} 1... c6 {[%clk 0:02:59.9]} 2. d4 {[%clk 0:02:58]} 2... d5 0-1';
  const base = { url: 'https://www.chess.com/game/live/123456', pgn, rules: 'chess', time_class: 'rapid', rated: true, end_time: 1790000000, white: { username: 'TopB', rating: 2900 }, black: { username: 'Adv', rating: 2700 } };
  const g = normalizeChessCom(base, 'topb');
  assert.equal(g.p, 'cc');
  assert.equal(g.id, '123456');
  assert.equal(g.r, '0-1');
  assert.deepEqual(g.san, ['e4', 'c6', 'd4', 'd5']);
  assert.equal(normalizeChessCom({ ...base, time_class: 'bullet' }, 'topb'), null);
  assert.equal(normalizeChessCom({ ...base, rules: 'chess960' }, 'topb'), null);
  assert.equal(normalizeChessCom({ ...base, pgn: pgn.replace('1... c6', '1... e5') }, 'topb'), null, 'hors répertoire');
  assert.equal(gameInfo({ p: 'cc', id: '123456', w: 'a', wr: 1, b: 'b', br: 2, m: 'e4 c6' }).url, 'https://www.chess.com/game/live/123456');
});

test('NDJSON : lignes vides ou tronquées ignorées et comptées', () => {
  const r = parseNdjson('{"id":"a"}\n\n{"id":"b"}\n{"id":"c\n');
  assert.deepEqual(r.items.map((x) => x.id), ['a', 'b']);
  assert.equal(r.bad, 1);
});

test('agrégation : résultats, plateformes, Elo du joueur au trait, transpositions, limites', () => {
  const games = [
    game('li', 'g1', 'd4 d5 c4 e6 Nc3 Nf6', '1-0', 3000, 2800),
    game('cc', 'g2', 'd4 d5 c4 e6 Nf3 Nf6 Nc3', '0-1', 3100, 2900),
    game('li', 'g3', 'd4 d5 c4 c6', '1/2-1/2', 2900, 2700),
    game('cc', 'g4', 'e4 c6 d4 d5', '1-0', 3200, 3000),
    game('li', 'g5', 'e4 e5 Nf3', '1-0'), // hors répertoire : ignorée
  ];
  const agg = aggregate(games, { plies: 6, minPositionGames: 1, samples: 2 });
  assert.equal(agg.games.length, 4);
  const qg = agg.positions.get(fenKey(fenAfter(['d4', 'd5', 'c4'])));
  const e6 = qg.moves.get('e6');
  assert.deepEqual([e6.w, e6.d, e6.b, e6.li, e6.cc], [1, 0, 1, 1, 1]);
  assert.equal(e6.eloSum / e6.eloN, 2850, 'Elo moyen des Noirs qui jouent e6');
  assert.deepEqual([qg.moves.get('c6').d, qg.moves.get('c6').li], [1, 1]);
  assert.deepEqual(qg.samples.map((s) => agg.games[s.gi].id), ['g2', 'g1'], 'exemples : meilleure moyenne Elo d’abord, k = 2');
  // Positions avant la racine du répertoire : jamais agrégées (elles seraient biaisées par le filtre).
  assert.equal(agg.positions.has(fenKey(new Chess().fen())), false);
  assert.equal(agg.positions.has(fenKey(fenAfter(['e4']))), false);
  assert.ok(agg.positions.has(fenKey(fenAfter(['e4', 'c6']))));
  assert.equal(agg.positions.has(fenKey(fenAfter(['d4', 'd5', 'c4', 'e6', 'Nf3', 'Nf6']))), false, 'au-delà de plies');
  // Transposition : 4.Cc3 Cf6 5.Cf3 et 4.Cf3 Cf6 5.Cc3 rejoignent la même position.
  const t = aggregate([
    game('li', 'a', 'd4 d5 c4 e6 Nc3 Nf6 Nf3 Be7', '1-0'),
    game('cc', 'b', 'd4 d5 c4 e6 Nf3 Nf6 Nc3 c6', '0-1'),
  ], { plies: 10, minPositionGames: 1 });
  const joined = t.positions.get(fenKey(fenAfter(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3'])));
  assert.deepEqual([...joined.moves.keys()].sort(), ['Be7', 'c6']);
  assert.deepEqual([joined.moves.get('Be7').li, joined.moves.get('c6').cc], [1, 1]);
  assert.equal(countGames(t.games).gd, 2);
});

test('format compact : seuil de parties par position, exemples réindexés, données lues par le site', () => {
  const games = [
    game('li', 'g1', 'd4 d5 c4 e6 Nc3 Nf6', '1-0', 3000, 2800),
    game('cc', 'g2', 'd4 d5 c4 e6 Nf3', '0-1', 3100, 2900),
    game('cc', 'g3', 'd4 d5 c4 e6 Nf3', '1/2-1/2', 2500, 2400),
  ];
  const agg = aggregate(games, { plies: 10, minPositionGames: 2, samples: 2 });
  const c = compact(agg);
  const qg = fenKey(fenAfter(['d4', 'd5', 'c4']));
  assert.deepEqual(c.positions[qg].m, [['e6', 1, 1, 1, 2700, 1, 2, 0]]);
  assert.equal(c.positions[fenKey(fenAfter(['d4', 'd5', 'c4', 'e6', 'Nc3']))], undefined, 'une seule partie : position retirée');
  assert.ok(c.dropped > 0);
  assert.equal(c.games.length, 2);
  assert.equal(c.games[c.positions[qg].g[0]].id, 'g2');
  assert.equal(c.games.find((g) => g.id === 'g1').m, 'd4 d5 c4 e6 Nc3 Nf6');
  // Lecture côté site.
  const data = { meta: { filters: { plies: 10, minPositionGames: 2 } }, positions: { ...c.positions, [qg]: { ...c.positions[qg], m: [...c.positions[qg].m, ['Ke3', 9, 0, 0, 3000, 9, 0]] } }, games: c.games };
  const x = lookupElite(data, fenAfter(['d4', 'd5', 'c4']));
  assert.equal(x.status, 'ok');
  assert.equal(x.moves.length, 1, 'coup illégal ignoré');
  assert.equal(x.top.uci, 'e7e6');
  assert.equal(x.total, 3);
  assert.deepEqual(x.split, { li: 1, cc: 2, bc: 0 });
  assert.equal(Math.round(x.top.score), 50, 'score des Noirs : 1 victoire + 1 nulle sur 3');
  assert.equal(x.games[0].url, 'https://www.chess.com/game/live/g2');
  assert.deepEqual(x.games[0].san, ['d4', 'd5', 'c4', 'e6', 'Nf3']);
  assert.equal(lookupElite(data, new Chess().fen()).status, 'absent');
  assert.match(absentText(data.meta), /demi-coup 10.*au moins 2 parties.*Rien n’est extrapolé/);
  assert.equal(splitText({ li: 1, cc: 2 }), 'Lichess 1 · Chess.com 2');
  assert.equal(dedupe([games[0], games[0], games[1]]).length, 2);
});

test('taille visée : le seuil de parties par position est relevé automatiquement', () => {
  const games = [];
  for (let i = 0; i < 40; i++) games.push(game('li', `g${i}`, i % 2 ? 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7' : 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4', '1-0'));
  games.push(game('li', 'rare', 'd4 d5 c4 Nc6 Nc3 e5', '0-1'));
  const o = { ...DEFAULTS, minPosition: 1, plies: 10 };
  const state = emptyState();
  recordDownload(state, 'li:topa:blitz', games.map((g, i) => ({ id: g.id, t: 1000 + i, game: g })), { maxGames: 100 });
  const sources = () => ({ li: { status: 'ok', errors: [] }, cc: { status: 'ignoré', errors: [] } });
  const big = buildDataset({ state, sources: sources(), o });
  const small = buildDataset({ state, sources: sources(), o: { ...o, maxBytes: big.json.length - 1 } });
  assert.ok(small.json.length < big.json.length);
  assert.ok(small.data.meta.filters.minPositionGames > 1);
  assert.equal(big.data.meta.games.total, 41);
});

test('options, noms de fixtures, client HTTP (User-Agent, jeton Lichess seul, pause sur 429)', async () => {
  const o = parseArgs(['--top', '10', '--perfs', 'rapid', '--max-games', '5', '--sources', 'li']);
  assert.deepEqual([o.top, o.perfs, o.maxGames, o.sources, o.plies], [10, ['rapid'], 5, ['li'], 24]);
  assert.throws(() => parseArgs(['--perfs', 'bullet']));
  assert.throws(() => parseArgs(['--inconnu']));
  assert.equal(fixtureName('https://lichess.org/api/games/user/Abc_1?max=3'), 'lichess.org_api_games_user_Abc_1');
  const calls = [];
  let n = 0;
  const http = new Http({
    lichessToken: 'lip_secret', pauseOn429Ms: 5, minIntervalMs: {},
    fetchImpl: async (url, init) => {
      calls.push({ url, headers: init.headers });
      n++;
      return n === 1 ? { status: 429, ok: false, text: async () => '' } : { status: 200, ok: true, text: async () => '{"a":1}' };
    },
  });
  assert.deepEqual(await http.json('https://lichess.org/x', { platform: 'li' }), { a: 1 });
  assert.equal(calls.length, 2, 'nouvelle tentative après la pause');
  assert.equal(calls[1].headers.authorization, 'Bearer lip_secret');
  await http.json('https://api.chess.com/pub/leaderboards', { platform: 'cc' });
  assert.equal(calls[2].headers.authorization, undefined, 'jamais de jeton Lichess vers Chess.com');
  assert.match(calls[2].headers['user-agent'], /github\.com/);
});

test('génération hors ligne (fixtures) : métadonnées, échec partiel noté, aucune requête réseau', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'elite-'));
  try {
    const out = join(dir, 'elite.json');
    const o = parseArgs(['--fixture', FIXTURE, '--top', '2', '--out', out, '--now', '2026-10-22T12:00:00Z']);
    const http = new Http({ fixture: FIXTURE, fetchImpl: () => { throw new Error('réseau interdit en test'); } });
    await run(o, { log: () => {}, http });
    const data = JSON.parse(readFileSync(out, 'utf8'));
    const m = data.meta;
    assert.equal(m.sources.li.status, 'ok');
    assert.equal(m.sources.li.players, 4);
    assert.equal(m.sources.cc.status, 'partiel', 'archive manquante notée, la source continue');
    assert.match(m.sources.cc.errors.join(' '), /exemple_rapide_c 2026\/09 : /);
    assert.equal(m.run.mode, 'complet');
    assert.equal(data.recent.length, 10);
    assert.ok(data.recent.every((g, i) => i === 0 || data.recent[i - 1].t >= g.t), 'plus récentes d’abord');
    assert.ok(data.recent.every((g) => g.eco && g.n), 'ouverture nommée (base CC0)');
    assert.equal(m.games.cc, 10, 'bullet, amicale, hors répertoire et doublon écartés ; + 1 partie du compte suivi MagnusCarlsen');
    assert.equal(m.games.bc, 4, 'Norway Chess : 3 parties de Carlsen + 1 entre 2600+, la partie hors répertoire écartée');
    assert.equal(m.sources.bc.status, 'ok');
    assert.equal(m.sources.bc.events, 1);
    assert.equal(m.games.total, m.games.li + m.games.cc + m.games.bc);
    // Joueurs suivis : verdicts notés, aucun compte deviné.
    const su = m.sources.su;
    const verdict = (k) => su.comptes.find((c) => `${c.p}:${c.compte}` === k);
    assert.equal(verdict('li:DrNykterstein').statut, 'vérifié (titre seul)');
    assert.equal(verdict('li:alireza2003').statut, 'vérifié');
    assert.equal(verdict('cc:MagnusCarlsen').statut, 'vérifié');
    assert.equal(verdict('cc:lachesisQ').statut, 'rejeté', 'nom réel discordant');
    assert.equal(verdict('cc:dingliren').statut, 'introuvable');
    assert.equal(su.verified, su.comptes.filter((c) => c.ok).length);
    const carlsenGames = data.games.filter((g) => g.wn === 'Magnus Carlsen' || g.bn === 'Magnus Carlsen');
    assert.ok(carlsenGames.every((g) => g.p !== 'bc' || g.ev === 'Norway Chess 2026 | Open'));
    assert.ok(m.players.some((p) => p.p === 'cc' && p.u === 'Exemple_Blitz_A' && p.perf === 'blitz'));
    assert.ok(Object.keys(data.positions).length > 10);
    for (const pos of Object.values(data.positions)) {
      const total = pos.m.reduce((a, x) => a + x[1] + x[2] + x[3], 0);
      assert.ok(total >= m.filters.minPositionGames);
      assert.equal(pos.m.reduce((a, x) => a + x[5] + x[6] + x[7], 0), total, 'répartition Lichess + Chess.com + tournois = total');
      for (const g of pos.g) assert.ok(data.games[g]);
    }
    const root = lookupElite(data, fenAfter(['d4', 'd5', 'c4']));
    assert.equal(root.status, 'ok');
    assert.equal(root.split.cc, 6, 'QGD ×3 (dont la partie dédoublonnée), Slave, GDA ×2');
    assert.equal(root.split.bc, 3);
    assert.match(eliteSummary(m), /Lichess : \d+ parties de 4 joueurs ; Chess\.com : 10 parties de 3 joueurs \(récupération partielle\) ; Tournois \(retransmissions Lichess\) : 4 parties de 1 tournois ; joueurs suivis : \d+ comptes vérifiés/);
    // Index de recherche publié à côté.
    const idx = JSON.parse(readFileSync(join(dir, 'joueurs.json'), 'utf8'));
    const [mc] = searchPlayers(idx, 'carlsen');
    assert.equal(mc.n, 'Magnus Carlsen');
    const pg = playerGames(idx, mc);
    assert.deepEqual(pg.map((g) => g.p).sort(), ['bc', 'bc', 'bc', 'cc']);
    assert.ok(pg.find((g) => g.p === 'bc').source.startsWith('Norway Chess 2026 | Open, Round'));
    assert.equal(searchPlayers(idx, 'Gukesh')[0].n, 'Gukesh Dommaraju', 'nom FIDE « Gukesh D » → nom usuel');
    // Une seule source demandée : l'autre est notée « ignoré ».
    await run({ ...o, sources: ['cc'] }, { log: () => {}, http });
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).meta.sources.li.status, 'ignoré');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Mises à jour incrémentales ----------

test('état : dédoublonnage, plafond des dernières parties, fenêtre, joueurs sortis du top', () => {
  const st = emptyState();
  const g = (id, t, rep = true) => ({ id, t, game: rep ? { ...game('li', id, 'd4 d5 c4 e6', '1-0'), t } : null });
  const ka = ownerKey('li', 'TopA', 'blitz');
  const kb = ownerKey('li', 'TopB', 'blitz');
  assert.equal(ka, 'li:topa:blitz');
  assert.equal(recordDownload(st, ka, [g('a1', 100), g('a2', 200, false), g('ab', 300)], { maxGames: 3 }), 2);
  assert.equal(recordDownload(st, kb, [g('ab', 300)], { maxGames: 3 }), 0, 'même partie vue par deux joueurs du top : une seule fois');
  assert.deepEqual(st.games['li:ab'].o, [ka, kb]);
  assert.equal(recordDownload(st, ka, [g('ab', 300), g('a3', 400)], { maxGames: 3 }), 1, 'chevauchement : déjà connue');
  assert.equal(st.owners[ka].last, 400);
  assert.deepEqual(st.owners[ka].recent.map((r) => r[0]), ['a3', 'ab', 'a2'], '3 dernières parties seulement');
  // a1 n'est plus dans les 3 dernières de TopA : retirée ; ab reste (TopB).
  const now = 400 + MONTH_MS;
  assert.equal(pruneState(st, { now, months: 3, activeOwners: new Set([ka, kb]) }), 1);
  assert.deepEqual(Object.keys(st.games).sort(), ['li:a3', 'li:ab']);
  // TopB sort du top : ab ne tient plus que par TopA.
  pruneState(st, { now, months: 3, activeOwners: new Set([ka]) });
  assert.deepEqual(st.games['li:ab'].o, [ka]);
  assert.equal(st.owners[kb], undefined);
  // Fenêtre dépassée : tout est retiré, rien n'est inventé.
  assert.equal(pruneState(st, { now: 401 + 3 * MONTH_MS, months: 3, activeOwners: new Set([ka]) }), 2);
  assert.deepEqual(stateGames(st), []);
  assert.deepEqual(recentGames(st), []);
});

const resp = (status, body = '', etag = null) => ({
  status, ok: status >= 200 && status < 300,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  headers: { get: (h) => (h === 'etag' ? etag : null) },
});
const ndjson = (list) => list.map((x) => JSON.stringify(x)).join('\n');
const liGame = (id, user, opp, moves, createdAt, speed = 'blitz') => ({
  id, rated: true, variant: 'standard', speed, createdAt, status: 'resign', winner: 'white', moves,
  players: { white: { user: { name: user }, rating: 3000 }, black: { user: { name: opp }, rating: 2900 } },
});
const ccGame = (id, user, pgnMoves, endS) => ({
  url: `https://www.chess.com/game/live/${id}`, rules: 'chess', time_class: 'blitz', rated: true, end_time: endS,
  white: { username: user, rating: 3200 }, black: { username: 'Adv', rating: 3000 },
  pgn: `[White "${user}"]\n[Black "Adv"]\n[Result "1-0"]\n\n${pgnMoves} 1-0`,
});

test('incrémental : since après la dernière partie, nouveaux venus, ETag Chess.com, changement de mois', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'elite-inc-'));
  try {
    const out = join(dir, 'elite.json');
    const etat = join(dir, 'etat.json');
    const o = parseArgs(['--incremental', etat, '--out', out, '--top', '50']);
    const t0 = Date.UTC(2026, 9, 20, 12);
    const H = 3600000;
    let lichessTop = ['TopA'];
    const liByUser = {
      TopA: [liGame('g1', 'TopA', 'X', 'd4 d5 c4 e6', t0 - H), liGame('g2', 'TopA', 'X', 'e4 e5 Nf3', t0 - 2 * H), liGame('old', 'TopA', 'X', 'd4 d5 c4 c6', t0 - 4 * MONTH_MS)],
      NewB: [liGame('n1', 'NewB', 'X', 'e4 c6 d4 d5', t0 - 5 * H)],
    };
    let cc = { etag: '"v1"', games: [ccGame('c1', 'TopC', '1. d4 d5 2. c4 e6', t0 / 1000 - 3600)] };
    const calls = [];
    const fetchImpl = async (url, init) => {
      const u = new URL(url);
      calls.push({ url, headers: init.headers });
      if (u.pathname === '/api/player/top/50/blitz') return resp(200, { users: lichessTop.map((n) => ({ username: n, id: n.toLowerCase(), perfs: { blitz: { rating: 3000 } } })) });
      if (u.pathname === '/api/player/top/50/rapid') return resp(200, { users: [] });
      if (u.pathname === '/api/users') {
        // Compteur de parties classées blitz (le nombre de parties de l'exemple suffit ici).
        return resp(200, init.body.split(',').map((id) => ({ id, perfs: { blitz: { games: (Object.entries(liByUser).find(([n]) => n.toLowerCase() === id)?.[1] || []).length } } })));
      }
      const m = u.pathname.match(/^\/api\/games\/user\/(\w+)$/);
      if (m) {
        const since = Number(u.searchParams.get('since'));
        return resp(200, ndjson((liByUser[m[1]] || []).filter((g) => g.createdAt >= since)));
      }
      if (u.pathname === '/pub/leaderboards') return resp(200, { live_blitz: [{ username: 'TopC', score: 3300 }], live_rapid: [] });
      if (u.pathname === '/pub/player/topc/games/archives') return resp(200, { archives: ['https://api.chess.com/pub/player/topc/games/2026/09', 'https://api.chess.com/pub/player/topc/games/2026/10'] });
      if (u.pathname === '/pub/player/topc/games/2026/10') return init.headers['if-none-match'] === cc.etag ? resp(304) : resp(200, { games: cc.games }, cc.etag);
      return resp(404);
    };
    const http = () => new Http({ fetchImpl, minIntervalMs: {} });

    // 1. État absent : reconstruction complète.
    const r1 = await run(o, { log: () => {}, http: http(), now: t0 });
    assert.equal(r1.run.mode, 'complet');
    assert.deepEqual(Object.keys(r1.state.games).sort(), ['cc:c1', 'li:g1'], 'hors répertoire et hors fenêtre écartées');

    // 2. Trente minutes plus tard : une nouvelle partie de TopA, un nouveau venu, Chess.com inchangé.
    calls.length = 0;
    liByUser.TopA.unshift(liGame('g3', 'TopA', 'X', 'e4 c6 Nc3 d5', t0 + 10 * 60000));
    lichessTop = ['TopA', 'NewB'];
    const r2 = await run(o, { log: () => {}, http: http(), now: t0 + 30 * 60000 });
    assert.equal(r2.run.mode, 'incrémental');
    assert.equal(r2.run.newGames, 2, 'g3 et n1 ; g1 (chevauchement) déjà connue');
    const sinceA = Number(new URL(calls.find((c) => c.url.includes('/games/user/TopA')).url).searchParams.get('since'));
    assert.equal(sinceA, t0 - H - LICHESS_OVERLAP_MS, 'since = dernière partie vue − 1 h');
    assert.equal(calls.find((c) => c.url.endsWith('/api/users')).headers['content-type'], 'text/plain');
    const sinceB = Number(new URL(calls.find((c) => c.url.includes('/games/user/NewB')).url).searchParams.get('since'));
    assert.ok(sinceB < t0 - 2 * MONTH_MS, 'nouveau venu : toute la fenêtre');
    assert.equal(calls.filter((c) => c.url.includes('chess.com')).length, 2, 'classement + mois en cours (pas la liste des archives)');
    assert.equal(calls.find((c) => c.url.endsWith('/2026/10')).headers['if-none-match'], '"v1"');
    const d2 = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(d2.meta.games.total, 4);
    assert.equal(d2.recent[0].id, 'g3');
    assert.equal(d2.meta.run.newGames, 2);

    // 3. Nouveau mois : mois en cours vide (404) + mois précédent, avec une nouvelle partie Chess.com.
    //    Compteurs Lichess inchangés : aucun export demandé.
    calls.length = 0;
    cc = { etag: '"v2"', games: [...cc.games, ccGame('c2', 'TopC', '1. e4 c6 2. d4 d5', t0 / 1000 + 3600)] };
    const nov = Date.UTC(2026, 10, 1, 0, 10);
    const r3 = await run(o, { log: () => {}, http: http(), now: nov });
    assert.deepEqual(calls.filter((c) => c.url.includes('/topc/')).map((c) => c.url.split('/games/')[1]), ['2026/11', '2026/10']);
    assert.equal(r3.state.games['cc:c2']?.id, 'c2');
    assert.equal(calls.filter((c) => c.url.includes('/games/user/')).length, 0, 'compteurs inchangés : pas d’export Lichess');

    // 4. TopA sort du top Lichess : ses parties disparaissent ; la fenêtre retire le reste plus tard.
    lichessTop = ['NewB'];
    const r4 = await run(o, { log: () => {}, http: http(), now: nov + 60000 });
    assert.ok(!r4.state.games['li:g1'] && !r4.state.games['li:g3']);
    assert.ok(r4.state.games['li:n1']);
    const r5 = await run(o, { log: () => {}, http: http(), now: t0 + 4 * MONTH_MS });
    assert.equal(Object.keys(r5.state.games).length, 0);
    assert.equal(process.exitCode, 2, 'aucune partie : code de sortie 2');
    process.exitCode = 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Joueurs suivis, tournois retransmis, recherche par nom ----------

import { SUIVIS, verifyAccount, lichessProfile, chessComProfile, suiviByName } from '../../scripts/elite-suivis.mjs';
import { splitPgn, pgnHeaders, normalizeBroadcast, keepBroadcast, keepTour } from '../../scripts/elite-core.mjs';
import { withCanonicalNames, buildPlayersIndex } from '../../scripts/elite.mjs';
import { normalizeName, nameMatches, displayFideName, searchPlayers, playerGames } from '../../site/js/joueurs.js';
import { eliteHeaders, gameInfo as eliteGameInfo } from '../../site/js/elite.js';

const carlsen = SUIVIS.find((s) => s.nom === 'Magnus Carlsen');
const so = SUIVIS.find((s) => s.nom === 'Wesley So');

test('joueurs suivis : vérification des comptes (jamais deviné)', () => {
  assert.deepEqual(verifyAccount(carlsen, lichessProfile(undefined)).statut, 'introuvable');
  assert.equal(verifyAccount(carlsen, lichessProfile({ id: 'x', title: 'GM', disabled: true })).statut, 'fermé');
  assert.equal(verifyAccount(carlsen, lichessProfile({ id: 'x', title: 'GM', tosViolation: true })).ok, false);
  assert.match(verifyAccount(carlsen, lichessProfile({ id: 'x', title: 'IM' })).raison, /titre IM/);
  // Cas réel (Lichess, 2026-10-22) : le profil « gmwso » donne un autre nom réel que Wesley So ;
  // même avec un titre GM, un nom réel discordant fait rejeter le compte.
  const gmwso = verifyAccount(so, lichessProfile({ id: 'gmwso', title: 'GM', profile: { realName: 'onofre dignos' } }));
  assert.deepEqual([gmwso.ok, gmwso.statut], [false, 'rejeté']);
  assert.equal(verifyAccount(carlsen, chessComProfile({ title: 'GM', name: 'Magnus Carlsen', status: 'premium' })).statut, 'vérifié');
  assert.equal(verifyAccount(carlsen, chessComProfile({ title: 'GM', name: 'Magnus Carlsen', status: 'closed:fair_play_violations' })).statut, 'fermé');
  const seul = verifyAccount(carlsen, lichessProfile({ id: 'drnykterstein', title: 'GM' }));
  assert.deepEqual([seul.ok, seul.statut], [true, 'vérifié (titre seul)']);
  assert.equal(suiviByName('Carlsen, Magnus')?.nom, 'Magnus Carlsen');
  assert.equal(suiviByName('Vachier-Lagrave, Maxime')?.nom, 'Maxime Vachier-Lagrave');
  assert.equal(suiviByName('So, Wesley')?.nom, 'Wesley So');
  assert.equal(suiviByName('Sokolov, Ivan'), null, '« So » doit être un mot entier');
  assert.equal(suiviByName('Carlsen, Henrik'), null, 'prénom exigé quand il est dans les clés');
});

test('noms : accents, casse, format FIDE', () => {
  assert.equal(normalizeName('  Vachier-Lagrave, Maxime '), 'vachier lagrave maxime');
  assert.equal(normalizeName('Ñepomniachtchi'), 'nepomniachtchi');
  assert.equal(displayFideName('Carlsen, Magnus'), 'Magnus Carlsen');
  assert.equal(displayFideName('Gukesh D'), 'Gukesh D');
  assert.ok(nameMatches('Gukesh D', ['gukesh']));
  assert.ok(!nameMatches('', ['x']));
});

const BC_PGN = `[Event "U.S. Chess Championship"]
[Round "2.2"]
[White "Caruana, Fabiano"]
[Black "Oparin, Grigoriy"]
[Result "1-0"]
[WhiteElo "2784"]
[BlackElo "2638"]
[UTCDate "2026.10.21"]
[UTCTime "16:37:58"]
[BroadcastName "U.S. Chess Championships 2026 | Open"]
[GameURL "https://lichess.org/broadcast/us/round-2/kGvbCF8o/Bv37MO2o"]

1. e4 c6 2. d4 d5 3. e5 Bf5 1-0


[Event "U.S. Chess Championship"]
[Round "2.3"]
[White "Robson, Ray"]
[Black "Shankland, Sam"]
[Result "*"]
[GameURL "https://lichess.org/broadcast/us/round-2/kGvbCF8o/zzzzzzzz"]

1. d4 d5 2. c4 *


[Event "X"]
[White "A, B"]
[Black "C, D"]
[Result "0-1"]
[WhiteElo "2700"]
[BlackElo "2500"]
[UTCDate "2026.10.20"]
[GameURL "https://lichess.org/broadcast/x/r/abc/xyz12345"]

1. d4 d5 2. c4 e6 0-1`;

test('retransmissions : découpe, en-têtes, partie normalisée, filtres', () => {
  const parts = splitPgn(BC_PGN);
  assert.equal(parts.length, 3);
  assert.equal(pgnHeaders(parts[0]).BroadcastName, 'U.S. Chess Championships 2026 | Open');
  const g = normalizeBroadcast(parts[0], { speed: 'classical', event: 'U.S. Championships', roundName: 'Round 2', displayName: displayFideName });
  assert.deepEqual([g.p, g.id, g.w, g.wr, g.b, g.br, g.r, g.s, g.ev, g.rd], ['bc', 'Bv37MO2o', 'Fabiano Caruana', 2784, 'Grigoriy Oparin', 2638, '1-0', 'classical', 'U.S. Championships', 'Round 2']);
  assert.equal(g.t, Date.UTC(2026, 9, 21, 16, 37, 58));
  assert.equal(g.u, 'https://lichess.org/broadcast/us/round-2/kGvbCF8o/Bv37MO2o');
  assert.deepEqual(g.san, ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5']);
  assert.equal(normalizeBroadcast(parts[1]), null, 'partie en cours ignorée');
  const x = normalizeBroadcast(parts[2]);
  assert.equal(keepBroadcast(g), true, 'deux joueurs 2600+');
  assert.equal(keepBroadcast(x), false, '2500 : écartée');
  assert.equal(keepBroadcast(x, { isSuivi: (n) => n === 'C, D' }), true, 'joueur suivi : gardée');
  assert.equal(keepBroadcast({ ...g, br: null }), false, 'Elo inconnu : pas 2600+');
  assert.equal(normalizeBroadcast(parts[0].replace('1. e4 c6', '1. e4 e5')), null, 'hors répertoire');
  assert.equal(normalizeBroadcast(`[Variant "Chess960"]\n[Result "1-0"]\n\n1. d4 d5 2. c4 1-0`), null);
  assert.equal(keepTour({ tier: 5 }), true);
  assert.equal(keepTour({ tier: 4, info: { players: 'Carlsen, Keymer' } }, { mentionsSuivi: (p) => p.includes('Carlsen') }), true);
  assert.equal(keepTour({ tier: 3, info: { players: 'Urkedal' } }), false);
});

test('noms usuels attachés aux parties, index de recherche, en-têtes pour l’échiquier', () => {
  const state = {
    suivis: { 'li:drnykterstein': { p: 'li', compte: 'DrNykterstein', nom: 'Magnus Carlsen', ok: true }, 'cc:hikaru': { p: 'cc', compte: 'Hikaru', nom: 'Hikaru Nakamura', ok: false } },
    tops: { li: { blitz: [{ u: 'TopA' }] }, cc: {} },
    bc: { tours: { t1: { name: 'Norway Chess 2026 | Open' } } },
  };
  const games = withCanonicalNames([
    { ...game('li', 'g1', 'd4 d5 c4 e6', '1-0'), w: 'DrNykterstein', b: 'TopA', t: 3000, m: 'd4 d5 c4 e6' },
    { ...game('cc', 'g2', 'e4 c6', '0-1'), w: 'Hikaru', b: 'X', t: 2000, m: 'e4 c6' },
    { ...game('bc', 'g3', 'e4 c6 d4', '1/2-1/2'), w: 'Vincent Keymer', b: 'Magnus Carlsen', t: 1000, ev: 'Norway Chess 2026 | Open', rd: 'Round 3', u: 'https://lichess.org/broadcast/n/r/a/g3', m: 'e4 c6 d4' },
  ], state);
  assert.equal(games[0].wn, 'Magnus Carlsen');
  assert.equal(games[1].wn, undefined, 'compte non vérifié : aucun nom attribué');
  assert.equal(games[2].bn, 'Magnus Carlsen');
  assert.equal(games[2].wn, 'Vincent Keymer');
  const idx = buildPlayersIndex(games, state, { now: 5000, suivis: SUIVIS });
  const [mc] = searchPlayers(idx, 'CARLSEN');
  assert.equal(mc.n, 'Magnus Carlsen');
  assert.equal(mc.s, 1);
  assert.deepEqual(mc.c, [{ p: 'li', u: 'DrNykterstein' }]);
  const pg = playerGames(idx, mc);
  assert.deepEqual(pg.map((g) => [g.id, g.side, g.opponent]), [['g1', 'w', 'TopA'], ['g3', 'b', 'Vincent Keymer']]);
  assert.equal(searchPlayers(idx, 'drnyk')[0].n, 'Magnus Carlsen', 'par compte');
  assert.equal(searchPlayers(idx, 'magnus carlsen')[0].n, 'Magnus Carlsen');
  assert.equal(searchPlayers(idx, 'hikaru')[0].n, 'Hikaru', 'compte non vérifié : joueur ordinaire, sans nom usuel');
  assert.deepEqual(searchPlayers(idx, 'ca'), [], 'au moins 3 caractères');
  assert.deepEqual(searchPlayers(idx, 'kasparov'), []);
  assert.ok(idx.joueurs.some((j) => j.n === 'TopA'));
  assert.deepEqual(idx.meta.tournois, ['Norway Chess 2026 | Open']);
  assert.equal(idx.meta.suivis.find((s) => s.nom === 'Magnus Carlsen').verifie, true);
  // En-têtes affichés au-dessus de l'échiquier.
  const h = eliteHeaders(eliteGameInfo(idx.games.find((g) => g.id === 'g3')));
  assert.deepEqual(h, {
    Event: 'Norway Chess 2026 | Open, Round 3', Site: 'https://lichess.org/broadcast/n/r/a/g3', White: 'Vincent Keymer', Black: 'Magnus Carlsen',
    WhiteElo: '3000', BlackElo: '2800', Date: '1970.01.01', Result: '1/2-1/2',
  });
  const h1 = eliteHeaders(eliteGameInfo(idx.games.find((g) => g.id === 'g1')));
  assert.equal(h1.White, 'Magnus Carlsen (DrNykterstein)');
  assert.equal(h1.Event, 'Élite Lichess Blitz');
});

test('tournois en incrémental : seules les rondes terminées depuis le passage précédent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'elite-bc-'));
  try {
    const etat = join(dir, 'etat.json');
    const o = parseArgs(['--sources', 'bc', '--incremental', etat, '--out', join(dir, 'elite.json')]);
    const now = Date.UTC(2026, 9, 22, 12);
    const tour = { id: 'T1', name: 'Super Tournoi 2026', tier: 5, info: { fideTC: 'rapid' }, dates: [now - 86400000, now + 86400000] };
    const rounds = [{ id: 'R1', name: 'Round 1', finished: true, finishedAt: now - 3600000 }, { id: 'R2', name: 'Round 2', finished: false }];
    const pg = (id, rid, moves, res, we = 2700, be = 2650) => `[White "A, B"]\n[Black "C, D"]\n[Result "${res}"]\n[WhiteElo "${we}"]\n[BlackElo "${be}"]\n[UTCDate "2026.10.22"]\n[UTCTime "10:00:00"]\n[BroadcastURL "https://lichess.org/broadcast/s/r/${rid}"]\n[GameURL "https://lichess.org/broadcast/s/r/${rid}/${id}"]\n\n${moves} ${res}`;
    const calls = [];
    const fetchImpl = async (url) => {
      const u = new URL(url);
      calls.push(u.pathname);
      if (u.pathname === '/api/broadcast/top') return resp(200, { active: [{ tour }], past: { currentPageResults: [], nextPage: null } });
      if (u.pathname === '/api/broadcast/search') return resp(200, { currentPageResults: [] });
      if (u.pathname === '/api/broadcast/T1') return resp(200, { tour, rounds });
      if (u.pathname === '/api/broadcast/T1.pgn') return resp(200, [pg('g1', 'R1', '1. d4 d5 2. c4 e6', '1-0'), pg('g2', 'R1', '1. e4 c6 2. d4 d5', '0-1', 2550, 2500)].join('\n\n\n'));
      if (u.pathname === '/api/broadcast/round/R2.pgn') return resp(200, pg('g3', 'R2', '1. e4 c6 2. Nc3 d5', '1/2-1/2'));
      return resp(404);
    };
    const http = () => new Http({ fetchImpl, minIntervalMs: {} });
    const r1 = await run(o, { log: () => {}, http: http(), now });
    assert.deepEqual(Object.keys(r1.state.games), ['bc:g1'], 'g2 : joueurs sous 2600');
    assert.equal(r1.state.games['bc:g1'].rd, 'Round 1');
    assert.equal(r1.state.games['bc:g1'].s, 'rapid');
    assert.ok(calls.includes('/api/broadcast/T1.pgn'), 'premier passage : export de toutes les rondes');
    calls.length = 0;
    rounds[1] = { ...rounds[1], finished: true, finishedAt: now + 1000 };
    const r2 = await run(o, { log: () => {}, http: http(), now: now + 1800000 });
    assert.deepEqual(calls.filter((c) => c.endsWith('.pgn')), ['/api/broadcast/round/R2.pgn'], 'seule la ronde nouvellement terminée');
    assert.equal(r2.run.newGames, 1);
    assert.equal(r2.state.games['bc:g3'].rd, 'Round 2');
    calls.length = 0;
    await run(o, { log: () => {}, http: http(), now: now + 3600000 });
    assert.equal(calls.filter((c) => c.endsWith('.pgn')).length, 0, 'rien de nouveau : aucun export');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Transpositions ----------

const sanOf = (s) => s.split(' ');

test('transpositions : entrée dans le répertoire par position, quel que soit l’ordre des coups', () => {
  // Ordre littéral : entrée à la racine.
  assert.deepEqual(repertoireEntry(sanOf('d4 d5 c4 e6 Nc3 Nf6')), { rep: 'gd', ply: 3 });
  assert.deepEqual(repertoireEntry(sanOf('e4 c6 d4 d5')), { rep: 'ck', ply: 2 });
  // Gambit Dame par transposition : la Variante orthodoxe (fiche) est atteinte au 6e demi-coup.
  assert.deepEqual(repertoireEntry(sanOf('d4 Nf6 c4 e6 Nc3 d5 Bg5 Be7')), { rep: 'gd', ply: 6 });
  assert.deepEqual(repertoireEntry(sanOf('c4 e6 Nc3 d5 d4 Nf6 Bg5')), { rep: 'gd', ply: 5 }, '= 1.d4 d5 2.c4 e6 3.Cc3, Noirs au trait');
  assert.deepEqual(repertoireEntry(sanOf('Nf3 d5 d4 Nf6 c4 e6 Nc3 Be7')).rep, 'gd');
  // Caro-Kann par transposition : 1.c4 c6 2.e4 d5 / 1.Cc3 c6 2.e4 d5 rejoignent des fiches Caro-Kann.
  assert.equal(repertoireEntry(sanOf('Nc3 c6 e4 d5 Nf3 Bg4'))?.rep, 'ck');
  assert.equal(repertoireEntry(sanOf('Nc3 d5 e4 c6 Nf3 Bg4'))?.rep, 'ck', 'deux ordres, même position');
  // Mauvais camp au trait : même placement des pièces mais trait aux Blancs → pas la racine.
  const idx = buildRepertoireIndex([]);
  assert.equal(repertoireEntry(sanOf('d4 d5 Nf3 Nf6 c4'), { index: idx }), null, 'pièces différentes');
  assert.equal(idx.size, 2, 'sans fiche : les deux racines seulement');
  assert.equal(repertoireEntry(sanOf('c4 d5 d4'), { index: idx })?.rep, 'gd', '1.c4 d5 2.d4 = 1.d4 d5 2.c4, Noirs au trait');
  assert.equal(repertoireEntry(sanOf('c4 d5 d4 Nf6 Nc3'), { index: idx })?.ply, 3);
  assert.equal(repertoireEntry(sanOf('e4 c6 Nf3 Nf6 Ng1 Ng8'), { index: idx })?.ply, 2);
  // Position de la racine avec l'autre camp au trait (coups de va-et-vient) : refusée.
  assert.equal(repertoireEntry(sanOf('e3 c6 e4'), { index: idx }), null, '1.e3 c6 2.e4 : mêmes pièces que 1.e4 c6 mais Noirs au trait');
  // Jamais dans le répertoire, ou trop tard.
  assert.equal(repertoireEntry(sanOf('e4 e5 Nf3 Nc6 Bb5 a6')), null);
  assert.equal(repertoireEntry(sanOf('d4 Nf6 c4 g6 Nc3 Bg7')), null);
  const late = 'Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8 d4 d5 c4';
  assert.equal(repertoireEntry(sanOf(late)), null, `au-delà de ${TRANSPO_PLIES} demi-coups`);
  assert.equal(repertoireEntry(sanOf(late), { maxPlies: 20 })?.ply, 19);
  assert.equal(repertoireEntry(sanOf('d4 Ke3')), null, 'coup illégal');
  // Cache des préfixes : un début déjà vu puis un coup illégal, puis le même début légal.
  assert.equal(repertoireEntry(sanOf('Nf3 d5 Ke3 Nf6')), null);
  assert.equal(repertoireEntry(sanOf('Nf3 d5 d4 Nf6 c4 e6 Nc3 Be7'))?.rep, 'gd');
  assert.equal(repertoireEntry(sanOf('d4 d5 c4!? e6?! Nc3'))?.ply, 3, 'annotations ignorées');
});

test('transpositions : collecte et agrégation à partir de l’entrée dans le répertoire', () => {
  const g = normalizeLichess(li('tr1', 'd4 Nf6 c4 e6 Nc3 d5 Bg5 Be7'), 'TopA');
  assert.deepEqual([g.rp, g.e], ['gd', 6]);
  const agg = aggregate([{ ...game('li', 'tr1', 'd4 Nf6 c4 e6 Nc3 d5 Bg5 Be7', '1-0'), rp: 'gd', e: 6 },
    game('cc', 'lit', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7', '0-1')], { plies: 10, minPositionGames: 1 });
  // Positions d'avant l'entrée (1.d4 Cf6, 2.c4 e6…) : jamais comptées.
  assert.equal(agg.positions.has(fenKey(fenAfter(['d4', 'Nf6']))), false);
  assert.equal(agg.positions.has(fenKey(fenAfter(['d4', 'Nf6', 'c4', 'e6']))), false);
  // Position commune après 3.Cc3 : les deux parties s'y rejoignent.
  const joined = agg.positions.get(fenKey(fenAfter(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'])));
  const bg5 = joined.moves.get('Bg5');
  assert.deepEqual([bg5.w, bg5.b, bg5.li, bg5.cc], [1, 1, 1, 1]);
  assert.equal(countGames(agg.games).gd, 2);
  // État ancien sans rp/e : entrée recalculée.
  const old = { ...game('li', 'x', 'c4 e6 Nc3 d5 d4 Nf6 Bg5', '1-0') };
  assert.equal(aggregate([old], { plies: 10, minPositionGames: 1 }).games.length, 1);
});
