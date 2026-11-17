// Local-only static preview and recording sink for the external Chrome take.
// Build first, then: node tests/e2e/chrome-capture-server.mjs
import { createServer } from 'node:http';
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '../..');
const output = resolve(app, '../docs/revision3/video/chrome');
const origin = 'http://cyclone.localhost:8082';
mkdirSync(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (req.method === 'POST') {
      const match = /^\/__capture\/(workflow|details|endcard|preflight|quality)\.(webm|json|png)$/.exec(url.pathname);
      if (!match || req.headers.origin !== origin) { res.writeHead(403).end(); return; }
      const file = resolve(output, `${match[1]}.${match[2]}`);
      await pipeline(req, createWriteStream(file));
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ saved: file, bytes: statSync(file).size }));
      console.log(`Saved ${file} (${statSync(file).size} bytes)`);
      return;
    }
    const module = /^\/__capture\/(chrome-capture|probe)\.mjs$/.exec(url.pathname);
    const root = module ? here : resolve(app, 'dist');
    const file = module ? resolve(here, `${module[1]}.mjs`) : resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const size = statSync(file).size;
    const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = +range[1], end = range[2] ? Math.min(+range[2], size - 1) : size - 1;
      if (start > end) { res.writeHead(416).end(); return; }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') res.end(); else createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': size });
      if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
    }
  } catch (error) { console.error(error); if (!res.headersSent) res.writeHead(500); res.end(); }
}).listen(8082, '127.0.0.1', () => console.log(`External Chrome preview: ${origin}/?mode=onboarding&capture=1`));
