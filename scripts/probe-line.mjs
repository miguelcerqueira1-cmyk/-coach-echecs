// Évalue une ou plusieurs lignes avec Stockfish (profondeur 18) pour préparer une fiche.
// Usage : node scripts/probe-line.mjs "1. d4 d5 2. c4 Bg4 3. Qb3" ["…"]
import { NodeEngine } from './uci-node.mjs';
import { playLine } from '../site/js/lines.js';
import { Chess } from '../site/vendor/chess.js';
const lines = process.argv.slice(2);
const e = await new NodeEngine().init();
for (const l of lines) {
  let r; try { r = playLine(l); } catch (x) { console.log('ILLEGAL', x.message); continue; }
  const fen = r.fens.at(-1); const c = new Chess(fen);
  if (c.isCheckmate()) { console.log('MAT', l); continue; }
  const v = await e.evaluate(fen, 18);
  const w = v.score.value * (c.turn() === 'w' ? 1 : -1);
  const san = []; for (const u of v.pv.slice(0, 8)) { try { san.push(c.move({ from: u.slice(0,2), to: u.slice(2,4), promotion: u[4] }).san); } catch { break; } }
  console.log(`${v.score.type} ${w} (Blancs) | ${l}\n    → ${san.join(' ')}`);
}
e.quit();
