import test from 'node:test';
import assert from 'node:assert/strict';
import { FAQ, diagnostic, lienMail } from '../../site/js/aide.js';

test('aide : FAQ, diagnostic sans données personnelles, lien e-mail', () => {
  assert.ok(FAQ.length >= 6);
  for (const [q, r] of FAQ) { assert.ok(q.endsWith('?') || q.length > 10); assert.ok(r.length > 30); }
  const d = diagnostic({ build: 'abc1234', page: '#/parties', ua: 'Safari', ecran: '390×844', moteur: 'ready' });
  assert.match(d, /Page : #\/parties/);
  assert.match(d, /Version : abc1234/);
  assert.equal(lienMail('', 's', 'c'), null);
  assert.equal(lienMail('pas-une-adresse', 's', 'c'), null);
  const m = lienMail('contact@blitzrefute.fr', 'Sujet é', 'Ligne 1\nLigne 2');
  assert.ok(m.startsWith('mailto:contact@blitzrefute.fr?subject=Sujet%20%C3%A9&body='));
  assert.ok(m.includes('Ligne%201%0ALigne%202'));
});
