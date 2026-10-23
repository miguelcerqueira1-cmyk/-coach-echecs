import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIGNES, REPERTOIRES, BADGES } from '../../site/data/repertoire.js';
import { playLine, entryFingerprint } from '../../site/js/lines.js';

const verif = JSON.parse(readFileSync(new URL('../../data/verification.json', import.meta.url), 'utf8'));
const generated = JSON.parse(readFileSync(new URL('../../site/data/repertoire.json', import.meta.url), 'utf8'));

test('identifiants uniques et champs obligatoires remplis', () => {
  const ids = new Set();
  for (const e of LIGNES) {
    assert.ok(!ids.has(e.id), `doublon ${e.id}`);
    ids.add(e.id);
    assert.ok(REPERTOIRES[e.rep], e.id);
    assert.ok(BADGES[e.badge], e.id);
    for (const k of ['famille', 'nom', 'plan', 'structure', 'cases', 'echanger', 'conserver']) {
      assert.ok(typeof e[k] === 'string' && e[k].length > 3, `${e.id}.${k}`);
    }
    assert.ok(e.video?.recherche, `${e.id}.video.recherche`);
    // Aucun lien vidéo inventé : un lien n'est accepté que s'il est horodaté et marqué vérifié.
    if (e.video.url) {
      assert.match(e.video.url, /^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}&t=\d+s$/);
      assert.equal(e.video.verifie, true, `${e.id} : lien non vérifié`);
    }
  }
});

test('vidéos choisies : identifiant, titre, chaîne, langue, source ; horodatage seulement depuis un chapitre publié', () => {
  let fiches = 0;
  for (const e of LIGNES) {
    const liens = e.video.liens;
    if (liens === undefined) continue;
    assert.ok(Array.isArray(liens) && liens.length >= 1 && liens.length <= 4, `${e.id} : 1 à 4 liens`);
    fiches++;
    const ids = new Set();
    for (const l of liens) {
      const where = `${e.id} → ${l.url}`;
      assert.match(l.url, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}(&t=\d+s)?$/, where);
      const id = l.url.slice(32, 43);
      assert.ok(!ids.has(id), `${where} : doublon`);
      ids.add(id);
      assert.ok(typeof l.titre === 'string' && l.titre.trim().length >= 2, `${where} : titre`);
      // Chaîne obligatoire, sauf pour un résultat de recherche web qui ne l'affichait pas :
      // null explicite, la CI (oEmbed) indique alors la vraie chaîne à recopier.
      if (l.chaine === null) assert.equal(l.source, 'recherche web', `${where} : chaîne inconnue hors recherche web`);
      else assert.ok(typeof l.chaine === 'string' && l.chaine.trim().length >= 2, `${where} : chaîne`);
      assert.match(l.langue, /^[a-z]{2}$/, `${where} : langue`);
      assert.equal(l.verifie, true, `${where} : lien non vérifié`);
      assert.ok(['recherche web', 'vidéothèque Lichess'].includes(l.source), `${where} : source`);
      // Un passage précis n'est publié que s'il figure dans les chapitres donnés par l'auteur.
      if (/&t=/.test(l.url)) {
        assert.ok(l.chapitre, `${where} : horodatage sans chapitre publié`);
        const secs = Number(l.url.match(/&t=(\d+)s/)[1]);
        const stamp = l.chapitre.match(/(\d+:)?\d{1,2}:\d{2}/)[0].split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
        assert.equal(secs, stamp, `${where} : horodatage différent du chapitre`);
      } else {
        assert.equal(l.chapitre, undefined, `${where} : chapitre sans horodatage`);
      }
    }
  }
  assert.ok(fiches >= 45, `seulement ${fiches} fiches avec vidéo`);
  // Vidéos en français : au moins une par grande famille d'ouverture.
  const fr = (pred) => LIGNES.some((e) => pred(e) && e.video.liens?.some((l) => l.langue === 'fr'));
  for (const [nom, pred] of Object.entries({
    'Gambit Dame Refusé': (e) => e.famille === 'Gambit Dame Refusé',
    'Gambit Dame Accepté': (e) => e.famille === 'Gambit Dame Accepté',
    'Slave / Semi-Slave': (e) => /Slave/.test(e.famille),
    'Caro-Kann Avance': (e) => e.famille === 'Variante d’avance',
    'Caro-Kann Classique': (e) => e.famille === 'Variante classique',
    'Caro-Kann Échange/Panov': (e) => e.famille === 'Variante d’échange',
    'Caro-Kann Deux Cavaliers': (e) => e.famille === 'Deux Cavaliers',
    'Caro-Kann Fantaisie': (e) => e.famille === 'Attaque Fantaisie',
  })) assert.ok(fr(pred), `aucune vidéo en français : ${nom}`);
  // Les liens sont publiés tels quels dans le JSON généré.
  const byId = Object.fromEntries(generated.entries.map((e) => [e.id, e]));
  for (const e of LIGNES) assert.deepEqual(byId[e.id].video, e.video, `${e.id} : JSON à régénérer (npm run build)`);
});

test('les champs vidéo ne changent pas l’empreinte vérifiée par Stockfish', () => {
  for (const e of LIGNES) {
    const autre = { ...e, video: { recherche: 'x', url: null, liens: [] } };
    assert.equal(entryFingerprint(autre), entryFingerprint(e), e.id);
  }
});

test('toutes les lignes sont légales et dans le bon répertoire', () => {
  for (const e of LIGNES) {
    const main = playLine(e.ligne);
    if (e.rep === 'gd') assert.deepEqual(main.san.slice(0, 1), ['d4'], e.id);
    if (e.rep === 'ck') assert.deepEqual(main.san.slice(0, 2), ['e4', 'c6'], e.id);
    const us = REPERTOIRES[e.rep].couleur;
    if (e.punition) {
      const l = playLine(e.punition.ligne);
      assert.ok(l.marked >= 0, `${e.id} : coup fautif non marqué`);
      assert.notEqual(l.moves[l.marked].color, us, `${e.id} : la punition doit sanctionner une erreur adverse`);
      assert.ok(l.moves.length - l.marked - 1 <= 9, `${e.id} : réfutation trop longue`);
    }
    if (e.piege) {
      const l = playLine(e.piege.ligne);
      assert.ok(l.marked >= 0, `${e.id} : coup fautif non marqué`);
      assert.equal(l.moves[l.marked].color, us, `${e.id} : le piège doit être une erreur de notre camp`);
    }
  }
});

test('chaque affirmation tactique est confirmée par Stockfish pour le contenu actuel', () => {
  for (const e of LIGNES) {
    const v = verif.entries[e.id];
    assert.ok(v, `${e.id} non vérifiée`);
    assert.equal(v.fp, entryFingerprint(e), `${e.id} modifiée depuis la vérification (npm run verify:repertoire)`);
    if (e.punition) assert.equal(v.punition.ok, true, `${e.id} punition`);
    if (e.piege) assert.equal(v.piege.ok, true, `${e.id} piège`);
  }
});

test('codes ECO attribués automatiquement', () => {
  assert.equal(generated.entries.length, LIGNES.length);
  for (const e of generated.entries) {
    assert.match(e.eco, /^[A-E]\d\d$/, e.id);
    assert.ok(e.ecoNom.length > 3, e.id);
  }
  const byId = Object.fromEntries(generated.entries.map((e) => [e.id, e]));
  assert.equal(byId['ck-karpov'].eco, 'B17');
  assert.equal(byId['gd-meran'].eco, 'D47');
  assert.equal(byId['gd-englund'].eco, 'A40');
});

test('les deux répertoires contiennent les trois types de badges', () => {
  for (const rep of ['gd', 'ck']) {
    const badges = new Set(LIGNES.filter((e) => e.rep === rep).map((e) => e.badge));
    assert.ok(badges.has('theorie') && badges.has('loufoque'), rep);
  }
  assert.ok(LIGNES.some((e) => e.badge === 'piege'));
});
