import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noterVisite, plateforme, proposerInstallation, rappelSauvegarde, texteDerniereSauvegarde, aDesDonnees } from '../../site/js/installation-core.js';
import { exportData } from '../../site/js/transfer.js';

const d = (s) => new Date(`${s}T12:00:00Z`);

test('visites : jours distincts, 10 derniers, date des premières données', () => {
  let e = noterVisite({}, { now: d('2026-11-01') });
  e = noterVisite(e, { now: d('2026-11-01') });
  assert.deepEqual(e.jours, ['2026-11-01']);
  assert.equal(e.premiereDonnee, undefined);
  e = noterVisite(e, { now: d('2026-11-02'), donnees: true });
  assert.equal(e.premiereDonnee, '2026-11-02');
  e = noterVisite(e, { now: d('2026-11-09'), donnees: true });
  assert.equal(e.premiereDonnee, '2026-11-02');
  for (let i = 10; i < 25; i++) e = noterVisite(e, { now: d(`2026-11-${i}`) });
  assert.equal(e.jours.length, 10);
});

test('plateforme selon le navigateur', () => {
  assert.equal(plateforme('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1'), 'ios-safari');
  assert.equal(plateforme('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0 Mobile Safari/604.1'), 'ios-autre');
  assert.equal(plateforme('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15', 5), 'ios-safari'); // iPad
  assert.equal(plateforme('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile Safari/537.36'), 'android');
  assert.equal(plateforme('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36'), 'ordinateur');
});

test('bandeau d’installation : après la 1re visite, jamais si installée, calme après « Plus tard »', () => {
  const now = d('2026-11-23');
  assert.equal(proposerInstallation({ jours: ['2026-11-23'] }, { now }), false); // 1re visite
  const e = { jours: ['2026-11-20', '2026-11-23'] };
  assert.equal(proposerInstallation(e, { now }), true);
  assert.equal(proposerInstallation(e, { now, installee: true }), false);
  assert.equal(proposerInstallation(e, { now, mobile: false }), false);
  assert.equal(proposerInstallation({ ...e, installPlusTard: '2026-11-15', refusInstall: 1 }, { now }), false);
  assert.equal(proposerInstallation({ ...e, installPlusTard: '2026-11-01', refusInstall: 1 }, { now }), true);
  assert.equal(proposerInstallation({ ...e, refusInstall: 3 }, { now }), false);
});

test('rappel de sauvegarde : 7 jours sans sauvegarde, puis tous les 30 jours (14 si risque iPhone)', () => {
  const now = d('2026-11-23');
  assert.equal(rappelSauvegarde({ premiereDonnee: '2026-11-01' }, { now, donnees: false }), null);
  assert.equal(rappelSauvegarde({ premiereDonnee: '2026-11-20' }, { now, donnees: true }), null);
  assert.deepEqual(rappelSauvegarde({ premiereDonnee: '2026-11-10' }, { now, donnees: true }), { jamais: true, jours: 13 });
  assert.equal(rappelSauvegarde({ derniereSauvegarde: '2026-11-03T10:00:00Z' }, { now, donnees: true }), null);
  assert.deepEqual(rappelSauvegarde({ derniereSauvegarde: '2026-11-03T10:00:00Z' }, { now, donnees: true, risque: true }), { jamais: false, jours: 20 });
  assert.equal(rappelSauvegarde({ derniereSauvegarde: '2026-10-01', sauvegardePlusTard: '2026-11-20' }, { now, donnees: true }), null);
  assert.match(texteDerniereSauvegarde({}), /Aucune/);
  assert.match(texteDerniereSauvegarde({ derniereSauvegarde: '2026-11-22T10:00:00Z' }, now), /hier/);
});

test('données à protéger détectées ; état d’installation jamais exporté', () => {
  const m = new Map([['coach-echecs:routine-v1', '{}'], ['coach-echecs:installation-v1', '{"jours":[]}']]);
  const st = { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => m.get(k) ?? null };
  assert.equal(aDesDonnees(st), true);
  assert.deepEqual(Object.keys(exportData(st).data), ['coach-echecs:routine-v1']);
});
