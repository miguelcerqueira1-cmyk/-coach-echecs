import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPERTOIRES, GROUPES, FICHES_GRATUITES } from '../../site/data/repertoires/meta.js';
import { LIGNES } from '../../site/data/repertoire.js';
import { initChoix, choisis, enregistrer, filtrerData, resume, aChoisi, KEY } from '../../site/js/mon-repertoire.js';
import { repertoireDeviation, positionARevoir, alertePgn } from '../../site/js/games-core.js';
import { playLine } from '../../site/js/lines.js';

const data = JSON.parse(readFileSync(new URL('../../site/data/repertoire.json', import.meta.url), 'utf8'));

class Mem {
  constructor(o = {}) { this.m = new Map(Object.entries(o)); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
}

test('répertoires : 12, trois groupes, racines légales, fiches gratuites existantes', () => {
  assert.equal(Object.keys(REPERTOIRES).length, 12);
  for (const r of Object.values(REPERTOIRES)) {
    assert.ok(GROUPES[r.groupe], r.id);
    assert.equal(r.couleur, r.groupe === 'blancs' ? 'w' : 'b', r.id);
    assert.doesNotThrow(() => playLine(r.racine.map((m, i) => (i % 2 ? m : `${i / 2 + 1}. ${m}`)).join(' ')), r.id);
  }
  const ids = new Set(LIGNES.map((e) => e.id));
  for (const id of FICHES_GRATUITES) assert.ok(ids.has(id), id);
  assert.deepEqual(FICHES_GRATUITES, ['gd-orthodoxe', 'ita-giuoco-piano', 'esp-fermee', 'lon-classique', 'ang-sicilienne-inversee', 'ck-classique', 'ck-avance-short']);
  // Une fiche gratuite appartient à son répertoire ; un répertoire avec contenu en a au moins une.
  for (const r of Object.values(REPERTOIRES)) {
    for (const id of r.gratuites) assert.equal(LIGNES.find((e) => e.id === id).rep, r.id);
    if (LIGNES.some((e) => e.rep === r.id)) assert.ok(r.gratuites.length, `${r.id} : fiche gratuite à désigner`);
  }
});

test('choix : première visite sans données, utilisateur existant → Gambit Dame + Caro-Kann', () => {
  const neuf = new Mem();
  assert.deepEqual(initChoix(neuf), { premiereVisite: true });
  assert.equal(aChoisi(neuf), false);
  assert.deepEqual(choisis(neuf), ['gd', 'ck'], 'sans choix : répertoires historiques');
  const ancien = new Mem({ 'coach-echecs:progression-v1': '{}' });
  assert.deepEqual(initChoix(ancien), { premiereVisite: false });
  assert.deepEqual(JSON.parse(ancien.getItem(KEY)).ids, ['gd', 'ck']);
  // Choix enregistré : ordre des répertoires, inconnus ignorés, au moins une ouverture.
  assert.deepEqual(enregistrer(['indienne-roi', 'londres', 'xx', 'sicilienne'], neuf), ['londres', 'sicilienne', 'indienne-roi']);
  assert.deepEqual(choisis(neuf), ['londres', 'sicilienne', 'indienne-roi']);
  assert.equal(resume(choisis(neuf)), 'Système de Londres · Défense sicilienne · Défense indienne du Roi');
  assert.throws(() => enregistrer([], neuf), /au moins une ouverture/);
  assert.deepEqual(initChoix(neuf), { premiereVisite: false });
});

test('données filtrées par le choix : fiches et répertoires choisis seulement', () => {
  const f = filtrerData(data, ['gd', 'sicilienne']);
  assert.ok(f.entries.length > 0 && f.entries.every((e) => e.rep === 'gd'));
  assert.deepEqual(Object.keys(f.repertoires), ['gd', 'sicilienne']);
  assert.deepEqual(f.choisis, ['gd', 'sicilienne']);
  assert.equal(f.tous.length, data.entries.length);
});

// Fiches fictives (forme de repertoire.json) pour vérifier la détection sur d'autres répertoires.
const fiche = (id, rep, ligne) => { const l = playLine(ligne); return { id, rep, nom: id, san: l.san, uci: l.uci, punition: null, piege: null }; };

test('sortie de répertoire générique : Sicilienne, et plusieurs répertoires Blancs (le plus suivi l’emporte)', () => {
  const entries = [
    fiche('sic-1', 'sicilienne', '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4'),
    fiche('lon-1', 'londres', '1. d4 d5 2. Bf4 Nf6 3. e3 e6'),
    fiche('gd-1', 'gd', '1. d4 d5 2. c4 e6'),
  ];
  const g1 = { san: ['e4', 'c5', 'Nf3', 'd6'], color: 'b' };
  const d1 = repertoireDeviation(g1, entries, ['sicilienne']);
  assert.equal(d1.rep, 'sicilienne');
  assert.equal(d1.who, 'moi');
  assert.deepEqual(d1.expected, ['Nc6']);
  assert.deepEqual(positionARevoir(g1, d1).expected, ['b8c6']);
  // Contre 1.e4 sans répertoire choisi : hors répertoire.
  assert.equal(repertoireDeviation(g1, entries, ['londres']).rep, null);
  // 1.d4 avec Gambit Dame et Londres choisis : la partie suit le Londres plus loin.
  const g2 = { san: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5'], color: 'w' };
  const d2 = repertoireDeviation(g2, entries, ['gd', 'londres']);
  assert.equal(d2.rep, 'londres');
  assert.equal(d2.who, 'adversaire');
  assert.match(alertePgn(g2, d2).texte, /l’adversaire quitte vos fiches/);
  // 1.e4 avec les Blancs alors que le répertoire Blancs commence par 1.d4 : hors répertoire.
  assert.equal(repertoireDeviation({ san: ['e4', 'e5'], color: 'w' }, entries, ['gd', 'londres']).rep, null);
  // 1…e5 contre 1.e4 avec la Sicilienne : sortie dès le 1er coup, avec le rappel du répertoire.
  const d3 = repertoireDeviation({ san: ['e4', 'e5'], color: 'b' }, entries, ['sicilienne']);
  assert.equal(d3.ply, 1);
  assert.match(d3.note, /Défense sicilienne\) prévoit c5 ici/);
});
