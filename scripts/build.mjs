import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await rm(`${root}/dist`, { recursive: true, force: true }); await mkdir(`${root}/dist/src`, { recursive: true });
for (const path of ['index.html', 'src/journey', 'docs', 'examples']) await cp(`${root}/${path}`, `${root}/dist/${path}`, { recursive: true });
console.log('Built dependency-free history studio in dist/. Serve over HTTP on any static host.');
