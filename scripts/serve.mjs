// Serveur statique local qui reproduit le chemin GitHub Pages (/<dépôt>/).
// Usage : node scripts/serve.mjs [port] [dossier] [base]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.argv[2] || 4173);
const dir = process.argv[3] || 'dist';
const base = process.argv[4] || '/coach-echecs/';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith(base)) { res.writeHead(404); res.end('hors du site'); return; }
  let p = normalize(decodeURIComponent(url.pathname.slice(base.length))).replace(/^(\.\.[/\\])+/, '');
  if (p === '.' || p.endsWith('/')) p = (p === '.' ? '' : p) + 'index.html';
  const file = join(dir, p);
  try {
    if ((await stat(file)).isDirectory()) throw new Error('dir');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('introuvable');
  }
}).listen(port, () => console.log(`http://localhost:${port}${base} (${dir})`));
