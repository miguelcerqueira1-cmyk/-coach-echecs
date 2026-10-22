import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from '../../site/vendor/chess.js';
import { entryToPgn, repertoireToPgn } from '../../site/js/repertoire-pgn.js';

const data = JSON.parse(readFileSync(new URL('../../site/data/repertoire.json', import.meta.url), 'utf8'));

test('chaque fiche exportée est un PGN valide qui rejoue la ligne principale', () => {
  for (const e of data.entries) {
    const pgn = entryToPgn(e, { repTitle: 'T', colorName: 'Blancs' });
    const c = new Chess();
    assert.doesNotThrow(() => c.loadPgn(pgn), `${e.id} : PGN invalide\n${pgn}`);
    const hist = c.history();
    // La ligne principale exportée commence par la ligne de la fiche.
    assert.deepEqual(hist.slice(0, e.san.length), e.san, e.id);
    assert.match(pgn, new RegExp(`\\[ECO "${e.eco}"\\]`));
  }
});

test('punitions et pièges présents en variantes, coup fautif annoté', () => {
  const e = data.entries.find((x) => x.id === 'gd-echange');
  const pgn = entryToPgn(e, { repTitle: 'Gambit Dame', colorName: 'Blancs' });
  assert.match(pgn, /\{ Punition :/);
  assert.match(pgn, /\{ Piège à éviter :/);
  assert.match(pgn, /Nxd5 \$2/);
  assert.match(pgn, /\(/);
});

test('export par répertoire : nombre de parties ≤ 64 (limite d’une étude Lichess)', () => {
  for (const rep of ['gd', 'ck']) {
    const pgn = repertoireToPgn(data.entries, data.repertoires, rep);
    const n = (pgn.match(/^\[Event /gm) || []).length;
    assert.equal(n, data.entries.filter((e) => e.rep === rep).length);
    assert.ok(n <= 64);
  }
});
