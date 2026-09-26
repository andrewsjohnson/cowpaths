import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), args = process.argv.slice(2), portArg = args.indexOf('--port'), hostArg = args.indexOf('--host');
const port = Number(portArg >= 0 ? args[portArg + 1] : process.env.PORT || 8080), host = hostArg >= 0 ? args[hostArg + 1] : '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
const allowed = ['index.html', 'src/journey/', 'docs/', 'examples/'];
const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html', target = resolve(root, name);
    if (!target.startsWith(root + (root.endsWith(sep) ? '' : sep)) || !allowed.some(a => a.endsWith('/') ? name.startsWith(a) : name === a) || name.split('/').some(p => p.startsWith('.'))) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!(await stat(target)).isFile()) throw new Error('Not a file');
    const contents = await readFile(target); res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : contents);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; }); server.listen(port, host, () => console.log(`Cowpaths history studio: http://${host}:${port}`));
