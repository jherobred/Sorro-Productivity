// Writes out/sw.js: scripts/sw.js plus this build's version and precache list.
// The version changes every build, which is what makes browsers install the new worker.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';

const OUT = 'out';
// Pages, RSC payloads and app code. Skips images and the 21 MB on-device AI
// model, which the hidden AI panel is the only user of.
const KEEP = /\.(html|txt|js|mjs|css|woff2|webmanifest)$/;
const SKIP = 2_000_000;

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (KEEP.test(name) && stat.size < SKIP && name !== 'sw.js') files.push('/' + relative(OUT, path).split(sep).join('/'));
  }
};
walk(OUT);
// `/calendar/index.html` is requested as `/calendar/`.
const urls = files.map((f) => f.replace(/index\.html$/, '')).sort();
// Chunk names carry their content hash; pages do not, so hash those directly.
const hash = createHash('sha256').update(urls.join('\n'));
for (const f of files) if (f.endsWith('.html')) hash.update(readFileSync(join(OUT, f)));
const version = hash.digest('hex').slice(0, 12);

writeFileSync(join(OUT, 'sw.js'), `const PRECACHE = ${JSON.stringify({ version, files: urls })};\n${readFileSync('scripts/sw.js', 'utf8')}`);
console.log(`sw.js: ${urls.length} files, version ${version}`);
