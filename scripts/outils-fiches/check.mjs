// Pour chaque ligne : chaque coup du camp `col` comparé au meilleur coup (profondeur 14), perte en cp.
import { NodeEngine } from '../uci-node.mjs';
import { playLine } from '../../site/js/lines.js';
import { Chess } from '../../site/vendor/chess.js';
const [col, ...lines] = process.argv.slice(2);
const e = await new NodeEngine().init();
const cp = (s) => s.type === 'mate' ? (s.value > 0 ? 10000 : -10000) : s.value;
for (const l of lines) {
  let r; try { r = playLine(l); } catch (x) { console.log('ILLEGAL', l, x.message); continue; }
  const bad = [];
  for (let i = 0; i < r.uci.length; i++) {
    const c = new Chess(r.fens[i]); if (c.turn() !== col) continue;
    const b = await e.evaluate(r.fens[i], 14);
    const a = await e.evaluate(r.fens[i + 1], 13);
    const loss = cp(b.score) + cp(a.score);
    if (loss >= 40) bad.push(`${Math.floor(i/2)+1}${i%2?'…':'.'}${r.san[i]} perd ${loss} (SF ${new Chess(r.fens[i]).move({from:b.bestmove.slice(0,2),to:b.bestmove.slice(2,4),promotion:b.bestmove[4]}).san})`);
  }
  const fin = await e.evaluate(r.fens.at(-1), 18); const c = new Chess(r.fens.at(-1));
  const w = cp(fin.score) * (c.turn() === 'w' ? 1 : -1);
  console.log(`[fin ${w} Blancs] ${l}\n   ${bad.join(' | ') || 'OK'}`);
}
e.quit();
