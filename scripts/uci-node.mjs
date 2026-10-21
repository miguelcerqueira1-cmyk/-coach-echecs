// Pilote Stockfish (même binaire WASM que le site) depuis Node, pour les vérifications.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export class NodeEngine {
  // Même fichier que celui copié dans site/engine/ (le paquet stockfish n'est pas un module ES).
  constructor(file = join(root, 'node_modules/stockfish/bin/stockfish-18-lite-single.js')) {
    this.proc = spawn(process.execPath, [file], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.waiters = [];
    this.lines = [];
    createInterface({ input: this.proc.stdout }).on('line', (l) => {
      this.lines.push(l);
      for (const w of [...this.waiters]) if (w.pred(l)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(l); }
    });
  }
  send(c) { this.proc.stdin.write(c + '\n'); }
  wait(pred) { return new Promise((resolve) => this.waiters.push({ pred, resolve })); }
  async init() {
    this.send('uci');
    const name = await this.wait((l) => l.startsWith('id name'));
    await this.wait((l) => l === 'uciok');
    this.send('setoption name Hash value 64');
    this.send('isready');
    await this.wait((l) => l === 'readyok');
    this.name = name.slice(8);
    return this;
  }
  // Évaluation du point de vue du camp au trait (cp ou mate) + meilleur coup + variante.
  async evaluate(fen, depth) {
    this.lines = [];
    this.send('ucinewgame');
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
    const best = await this.wait((l) => l.startsWith('bestmove'));
    const infos = this.lines.filter((l) => l.startsWith('info depth') && l.includes(' pv ') && !l.includes('bound'));
    const last = infos.at(-1) || '';
    const sc = last.match(/score (cp|mate) (-?\d+)/);
    const d = last.match(/ depth (\d+)/);
    return {
      bestmove: best.split(' ')[1],
      score: sc ? { type: sc[1], value: Number(sc[2]) } : null,
      depth: d ? Number(d[1]) : null,
      pv: (last.split(' pv ')[1] || '').split(' ').filter(Boolean),
    };
  }
  quit() { this.send('quit'); this.proc.stdin.end(); }
}
