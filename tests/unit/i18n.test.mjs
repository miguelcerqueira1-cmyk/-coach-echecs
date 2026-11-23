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

test('fiches : les 269 ont leur texte anglais, appliqué seulement en anglais', async () => {
  const { readFileSync } = await import('node:fs');
  const { localiserFiche, localiserData } = await import('../../site/js/donnees-langue.js');
  const d = JSON.parse(readFileSync(new URL('../../site/data/repertoire.json', import.meta.url), 'utf8'));
  assert.ok(d.entries.every((e) => e.en && e.en.plan), 'chaque fiche a un plan en anglais');
  const e = d.entries.find((x) => x.punition && x.en?.punition);
  const en = localiserFiche(e, 'en');
  assert.equal(en.plan, e.en.plan);
  assert.equal(en.punition.texte, e.en.punition);
  assert.deepEqual(en.punition.san, e.punition.san); // coups inchangés
  assert.equal(localiserFiche(e, 'fr').plan, e.plan);
  assert.equal(localiserData(d, 'fr'), d);
});

test('commentaires de leçon et explication en anglais', async () => {
  const { commentaires } = await import('../../site/js/lesson-core.js');
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  assert.deepEqual(commentaires(start, 'e4', 'en'), ['Pawn to the centre on e4: it occupies and controls the central squares.']);
  assert.deepEqual(commentaires(start, 'Nf3', 'fr'), ['Développement : le Cavalier quitte sa case de départ pour f3.']);
});
