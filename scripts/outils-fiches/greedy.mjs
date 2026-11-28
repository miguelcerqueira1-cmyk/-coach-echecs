// Coups « gourmands » adverses (prises, échecs) le long des lignes : ceux qui donnent ≥ +1,5 à `col`.
import { NodeEngine } from '../uci-node.mjs';
import { playLine } from '../../site/js/lines.js';
import { Chess } from '../../site/vendor/chess.js';
const [col, ...lines] = process.argv.slice(2);
const e = await new NodeEngine().init();
const cp = (s) => s.type === 'mate' ? (s.value > 0 ? 10000 : -10000) : s.value;
for (const l of lines) {
  const r = playLine(l);
  for (let i = 0; i < r.uci.length; i++) {
    const c = new Chess(r.fens[i]); if (c.turn() === col) continue;
    for (const m of c.moves({ verbose: true })) {
      if (!m.captured && !m.san.includes('+')) continue;
      if (m.san === r.san[i]) continue;
      const d = new Chess(r.fens[i]); d.move(m.san);
      if (d.isCheckmate()) continue;
      const v = await e.evaluate(d.fen(), 12);
      const us = cp(v.score);
      if (us >= 150) {
        const san = []; for (const u of v.pv.slice(0, 6)) { try { san.push(d.move({ from: u.slice(0,2), to: u.slice(2,4), promotion: u[4] }).san); } catch { break; } }
        console.log(`${us}  ${r.san.slice(0, i).join(' ')} ${m.san}? → ${san.join(' ')}`);
      }
    }
  }
}
e.quit();
