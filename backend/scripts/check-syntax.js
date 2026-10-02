// Parses every backend source file (and the Netlify function) so syntax errors fail the "build" step.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p); } else if (/\.(m?js)$/.test(f)) files.push(p);
  }
};
['src', 'scripts', 'tests', '../netlify/functions'].forEach((d) => { try { walk(resolve(root, d)); } catch { /* optional dir */ } });
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { failed++; console.error(`✗ ${f}\n${r.stderr}`); }
}
console.log(failed ? `${failed} file(s) failed` : `✓ ${files.length} backend files parse cleanly`);
process.exit(failed ? 1 : 0);
