// Reconnaissance locale de l'ouverture (site/js/ouverture-core.js) sur les vraies données (ouvertures.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from '../../site/vendor/chess.js';
import { reconnaitre, cle, uciDe } from '../../site/js/ouverture-core.js';

const data = JSON.parse(readFileSync(new URL('../../site/data/ouvertures.json', import.meta.url), 'utf8'));
const ligne = (txt) => { const c = new Chess(); const fens = [c.fen()]; const sans = []; for (const s of txt.split(' ')) { sans.push(c.move(s).san); fens.push(c.fen()); } return { fens, sans }; };

test('nom de l’ouverture le plus précis, transpositions comprises', () => {
  const { fens, sans } = ligne('d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5');
  const r = reconnaitre(data, fens, sans);
  assert.match(r.nom.name, /^Queen's Gambit Declined/);
  assert.equal(r.nom.eco.slice(0, 1), 'D');
  assert.equal(r.sortie, null);
  // Même position par un autre ordre de coups : même nom.
  const t = ligne('c4 e6 Nc3 d5 d4 Nf6 cxd5 exd5');
  assert.equal(reconnaitre(data, t.fens, t.sans).nom.name, r.nom.name);
});

test('sortie des lignes connues : premier coup hors théorie', () => {
  const { fens, sans } = ligne('e4 e5 Nf3 Nc6 Bc4 Bc5 Ke2 Nf6');
  const r = reconnaitre(data, fens, sans);
  assert.ok(r.nom);
  assert.ok(r.sortie, '7.Re2 sort des lignes connues');
  assert.equal(r.sortie.ply, 7);
  assert.equal(r.sortie.san, 'Ke2');
  assert.equal(r.sortie.ply, r.connu + 1);
  assert.equal(r.sortie.san, sans[r.connu]);
});

test('erreur connue d’une fiche, puis réfutation trouvée ou manquée', () => {
  // Gambit Dame : 2…Fg4 ?! (fiche gd-fg4), réfutation 3.Db3.
  const a = ligne('d4 d5 c4 Bg4');
  const r = reconnaitre(data, a.fens, a.sans);
  assert.ok(r.erreur, 'erreur connue détectée');
  assert.equal(r.erreur.ply, 4);
  assert.equal(r.erreur.trouvee, null);
  const ok = ligne(`d4 d5 c4 Bg4 ${new Chess(a.fens[4]).move({ from: r.erreur.refute.slice(0, 2), to: r.erreur.refute.slice(2, 4) }).san}`);
  assert.equal(reconnaitre(data, ok.fens, ok.sans).erreur.trouvee, true);
  const ko = ligne('d4 d5 c4 Bg4 Nc3');
  if (r.erreur.refute !== 'b1c3') assert.equal(reconnaitre(data, ko.fens, ko.sans).erreur.trouvee, false);
});

test('fiche correspondante et empreinte des positions', () => {
  const { fens, sans } = ligne('e4 c6 d4 d5 e5');
  const r = reconnaitre(data, fens, sans);
  assert.ok(r.fiche && r.fiche.idx.length);
  assert.ok(r.fiche.idx.some((i) => data.fiches[i][1] === 'ck'));
  assert.notEqual(cle(fens[1]), cle(fens[2]));
  assert.equal(uciDe(fens[0], fens[1]), 'e2e4');
  const roque = ligne('e4 e5 Nf3 Nc6 Bc4 Bc5 O-O');
  assert.equal(uciDe(roque.fens[6], roque.fens[7]), 'e1g1');
});
