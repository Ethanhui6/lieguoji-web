import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const source = '.autopilot/country-ownership', target = 'docs/evidence/country-ownership-2026-10-03';
if (fs.existsSync(target)) throw new Error('Evidence already exists; never overwrite a round');
fs.mkdirSync(target, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), inventory = [];
function copy(from, to) {
  const data = fs.readFileSync(from), absolute = path.resolve(target, to), boundary = path.resolve(target) + path.sep;
  if (!absolute.startsWith(boundary) || fs.existsSync(absolute)) throw new Error('Invalid archive destination');
  fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, data);
  inventory.push({ path: to, bytes: data.length, sha256: sha(data), source: from });
}
function walk(from, prefix) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.isSymbolicLink()) throw new Error('Unexpected evidence symlink');
    if (e.name === 'legacy-before.json') continue;
    const p = `${from}/${e.name}`, to = `${prefix}${e.name}`;
    if (e.isDirectory()) walk(p, `${to}/`); else copy(p, to);
  }
}
walk(source, '');
const tracked = execFileSync('git', ['diff', '--name-only', '-z']).toString().split('\0');
const added = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z']).toString().split('\0');
for (const file of [...new Set([...tracked, ...added])].filter(p => /^(src|tests)\//.test(p) || ['package.json', 'package-lock.json'].includes(p))) copy(file, `sources/${file}`);
fs.writeFileSync(`${target}/inventory.json`, JSON.stringify(inventory, null, 2) + '\n');
const passed = inventory.every(row => { const b = fs.readFileSync(`${target}/${row.path}`); return b.length === row.bytes && sha(b) === row.sha256; });
const result = { createdAt: new Date().toISOString(), files: inventory.length, bytes: inventory.reduce((n, f) => n + f.bytes, 0), inventorySha256: sha(fs.readFileSync(`${target}/inventory.json`)), byteVerified: passed, originalFailuresRetained: true, cloudWrites: false, physicalDevice: false, wholePhaseAccepted: false };
fs.writeFileSync(`${target}/verification.json`, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result)); if (!passed) process.exitCode = 1;

