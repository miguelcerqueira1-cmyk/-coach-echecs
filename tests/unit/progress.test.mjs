import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  emptyProgress, recordLine, recordDrill, recordSortie, streak, mastery, dashboard, ficheKeys, pickFiches,
} from '../../site/js/progress.js';
import { lineSteps, trashDrill } from '../../site/js/drills-core.js';

const data = JSON.parse(readFileSync(new URL('../../site/data/repertoire.json', import.meta.url), 'utf8'));
const DAY = 86400000;
const t0 = Date.UTC(2026, 9, 22, 12);

test('série de jours et résultats des exercices', () => {
  const p = emptyProgress();
  recordLine(p, 'a', true, t0 - 2 * DAY);
  recordDrill(p, 'b', true, 4200, t0 - DAY);
  recordDrill(p, 'b', true, 3100, t0);
  recordDrill(p, 'b', false, null, t0);
  assert.equal(streak(p, t0), 3);
  assert.equal(streak(p, t0 + 2 * DAY), 0);
  assert.deepEqual({ ok: p.drills.b.ok, ko: p.drills.b.ko, best: p.drills.b.best }, { ok: 2, ko: 1, best: 3100 });
  recordSortie(p, { gameId: 'g1', ficheId: 'gd-echange', rep: 'gd', ply: 8 });
  recordSortie(p, { gameId: 'g1', ficheId: 'gd-echange', rep: 'gd', ply: 8 });
  assert.equal(p.sorties.length, 1);
});

test('maîtrise d’une fiche : positions révisées et exercices', () => {
  const e = data.entries.find((x) => x.id === 'gd-orthodoxe');
  const keys = ficheKeys(e, 'w');
  assert.equal(keys[0], '');
  assert.equal(keys.length, Math.ceil(e.uci.length / 2));
  const p = emptyProgress();
  assert.equal(mastery(e, 'w', {}, p, t0).pct, 0);
  const all = Object.fromEntries(keys.map((k) => [k, { reps: 3, due: t0 + DAY, lapses: 0 }]));
  assert.equal(mastery(e, 'w', all, p, t0).pct, 100);
  recordLine(p, e.id, false, t0);
  assert.equal(mastery(e, 'w', all, p, t0).pct, 70); // 70 % positions + 0 % exercices
  const half = { [keys[0]]: { reps: 1, due: t0 - 1, lapses: 0 } };
  const m = mastery(e, 'w', half, emptyProgress(), t0);
  assert.equal(m.due, 1);
  assert.equal(m.seen, 1);
});

test('tableau de bord : fiches faibles et sorties réelles d’abord', () => {
  const p = emptyProgress();
  recordSortie(p, { gameId: 'g', ficheId: 'ck-karpov', rep: 'ck', ply: 7 });
  const b = dashboard(data, { gd: {}, ck: {} }, p, t0);
  assert.equal(b.fiches.length, data.entries.length);
  assert.equal(b.fiches[0].id, 'ck-karpov');
  assert.equal(b.byRep.gd.total + b.byRep.ck.total, data.entries.length);
  assert.deepEqual(pickFiches(b, { n: 1 }), ['ck-karpov']);
  const withPun = pickFiches(b, { n: 50, needPunition: true });
  assert.ok(withPun.length > 5 && withPun.every((id) => data.entries.find((e) => e.id === id).punition));
});

test('exercices : ligne complète et drill anti-trash', () => {
  const e = data.entries.find((x) => x.id === 'gd-orthodoxe');
  const st = lineSteps(e, 'w');
  assert.equal(st.length, e.uci.length);
  assert.ok(st[0].ours && !st[1].ours);
  let n = 0;
  for (const x of data.entries) {
    const color = data.repertoires[x.rep].couleur;
    const d = trashDrill(x, color);
    if (!d) continue;
    n++;
    assert.ok(d.ours >= 1 && d.ours <= 5, x.id);
    assert.ok(d.steps[0].ours && d.steps.at(-1).ours, x.id);
    assert.equal((d.bad.ply % 2 === 0 ? 'w' : 'b') === color, false, x.id);
  }
  assert.ok(n >= 10, `${n} drills`);
});

import { seuilAutreCoup } from '../../site/js/drills-core.js';

test('drill : seuil d’un autre coup calé sur la punition vérifiée', () => {
  const mk = (value, type = 'cp') => ({ verification: { punition: { final: { type, value } } } });
  assert.equal(seuilAutreCoup(mk(300), 'w'), 150); // grosse punition : il faut au moins +1,5
  assert.equal(seuilAutreCoup(mk(160), 'w'), 100);
  assert.equal(seuilAutreCoup(mk(80), 'w'), 50); // petit gain de pion : plancher +0,5
  assert.equal(seuilAutreCoup(mk(-200), 'b'), 140); // Noirs : point de vue inversé
  assert.equal(seuilAutreCoup(mk(3, 'mate'), 'w'), 150);
  assert.equal(seuilAutreCoup({}, 'w'), 150);
});
