import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { niveau, gagner, charger, initialiser, verifierBadges, pointsExistants, xpDuJour, vide, KEY } from '../../site/js/succes-core.js';
import { positionsDepart, plyCible, bilanDepart } from '../../site/js/depart-core.js';
import { Chess } from '../../site/vendor/chess.js';

const memoire = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const data = JSON.parse(readFileSync(new URL('../../site/data/repertoire.json', import.meta.url), 'utf8'));

test('niveaux : 1 au départ, 2 à 50 XP, 3 à 200 XP', () => {
  assert.equal(niveau(0).n, 1);
  assert.equal(niveau(49).n, 1);
  assert.equal(niveau(50).n, 2);
  assert.equal(niveau(200).n, 3);
  assert.deepEqual([niveau(125).bas, niveau(125).haut, niveau(125).pct], [50, 200, 50]);
});

test('points : gain du jour, total, départ des utilisateurs existants', () => {
  const st = memoire();
  const p = { lignes: { a: { ok: 2, ko: 1 } }, drills: { b: { ok: 1, ko: 0 } }, cours: { a: {} }, sorties: [{ corrige: 'x' }, {}] };
  assert.equal(pointsExistants(p), 20 + 2 + 10 + 20 + 15);
  const d = initialiser(p, st);
  assert.equal(d.total, 67);
  const now = Date.UTC(2026, 10, 27, 10);
  gagner(10, { now, storage: st });
  gagner(5, { now, storage: st });
  const e = charger(st);
  assert.equal(e.total, 82);
  assert.equal(xpDuJour(e, now), 15);
  assert.equal(initialiser({}, st).total, 82); // déjà initialisé : inchangé
  st.setItem(KEY, '{illisible');
  assert.equal(charger(st), null);
});

test('badges : débloqués une seule fois, d’après les vraies données', () => {
  const d = vide();
  const ctx = { lecons: 1, maitrisees: 0, serie: 3, rush: 12, corrigees: 0, problemes: 0, finales: 8, finalesTotal: 8 };
  const n1 = verifierBadges(d, ctx);
  assert.deepEqual(n1.sort(), ['finales', 'premiere-lecon', 'rush-10', 'serie-3']);
  assert.deepEqual(verifierBadges(d, ctx), []);
});

test('test de départ : positions à nous de jouer, coups attendus légaux, réparties entre ouvertures', () => {
  const pos = positionsDepart(data.entries, ['gd', 'ck']);
  assert.equal(pos.length, 5);
  assert.ok(pos.some((x) => x.rep === 'gd') && pos.some((x) => x.rep === 'ck'));
  for (const x of pos) {
    const c = new Chess();
    for (const u of x.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    assert.equal(c.turn(), x.color);
    for (const u of x.expected) assert.ok(c.moves({ verbose: true }).some((m) => m.lan === u), `${x.ficheId} ${u}`);
  }
  assert.equal(plyCible(['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3'], 'w', 3), 2);
  assert.deepEqual(bilanDepart([{ id: 'a', ok: true }, { id: 'b', ok: false }]), { ok: 1, total: 2, ratees: ['b'] });
});
