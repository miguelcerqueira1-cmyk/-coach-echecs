import { readFileSync } from 'node:fs';
import { Chess } from '../../site/vendor/chess.js';
const elite = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const p of process.argv.slice(3)) {
  const c = new Chess(); for (const s of p.split(' ').filter(Boolean)) c.move(s);
  const pos = elite.positions[c.fen().split(' ').slice(0, 4).join(' ')];
  console.log(p, '::', pos ? pos.m.map((m) => `${m[0]} ${m[1] + m[2] + m[3]}`).slice(0, 8).join(', ') : 'absent');
}
