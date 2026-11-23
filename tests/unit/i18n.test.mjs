import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traducteur, langue } from '../../site/js/i18n.js';
import * as EN from '../../site/js/i18n-en.js';
import { sanFr } from '../../site/js/analysis.js';
import { REPERTOIRES, GROUPES } from '../../site/data/repertoires/meta.js';

const t = traducteur(EN);

test('traduction : exacte, motifs, symboles en tête, cadenas, inconnu', () => {
  assert.equal(t('Réglages'), 'Settings');
  assert.equal(t('♙ Gambit Dame'), '♙ Queen’s Gambit');
  assert.equal(t('Fourchette 🔒'), 'Fork 🔒');
  assert.equal(t('Gambit Dame (31 fiches)'), 'Queen’s Gambit (31 lines)');
  assert.equal(t('✔ Stockfish : +1,60'), '✔ Stockfish: +1.60');
  assert.equal(t('— Pion de d2 vers d4'), '— Pawn from d2 to d4');
  assert.equal(t('Problème 3 / 10'), 'Puzzle 3 / 10');
  assert.equal(t('Un texte inconnu'), null);
});

test('tous les répertoires et groupes ont un titre et une description en anglais', () => {
  for (const r of Object.values(REPERTOIRES)) {
    assert.ok(t(r.titre), r.titre);
    assert.ok(t(r.sousTitre), r.sousTitre);
  }
  for (const g of Object.values(GROUPES)) { assert.ok(t(g.titre), g.titre); assert.ok(t(g.question), g.question); }
});

test('hors navigateur : français, notation française', () => {
  assert.equal(langue(), 'fr');
  assert.equal(sanFr('Nf3'), 'Cf3');
});
