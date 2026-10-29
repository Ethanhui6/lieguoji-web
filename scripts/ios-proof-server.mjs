// Test-only static server: no Vite middleware, no CORS headers, no root fallback.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('.autopilot/ios-proof-dist');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.mp3':'audio/mpeg', '.m4a':'audio/mp4' };
createServer(async (req,res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!pathname.startsWith('/ios-proof/')) { res.writeHead(404).end(); return; }
  const path = resolve(root, pathname.slice('/ios-proof/'.length) || 'index.html');
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { const data = await readFile(path); res.writeHead(200, { 'Content-Type':mime[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-store' }); res.end(data); }
  catch { res.writeHead(404).end(); }
}).listen(4175, '127.0.0.1');
