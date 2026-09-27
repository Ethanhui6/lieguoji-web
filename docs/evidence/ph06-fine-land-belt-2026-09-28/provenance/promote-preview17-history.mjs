import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const stage = '.autopilot/ph06/v4-preview17-history-staging';
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const check = (yes, why) => { if (!yes) throw new Error(why); };
const safe = file => typeof file === 'string' && !path.isAbsolute(file) && !file.includes('\\') && file.split('/').every(p => p && p !== '.' && p !== '..');
check(process.argv.length === 2, 'No arguments accepted');
const ready = read(`${stage}/ready-manifest.json`), evidence = ready.evidence;
check(evidence.source === `${stage}/evidence/preview17` && evidence.target === 'docs/evidence/ph06-preview17-generator-history-2026-09-28', 'Unexpected history source/destination');
check(hash('dist/build.json') === evidence.buildSha256 && hash(`${evidence.source}/build.json`) === evidence.buildSha256 && read('dist/build.json').version === '0.5.0-preview.17', 'Actual preview17 baseline changed');
check(hash(`${evidence.source}/inventory.json`) === evidence.inventorySha256 && hash(`${evidence.source}/provenance.json`) === evidence.provenanceSha256, 'Frozen inventory/provenance changed');
const inventory = [...read(`${evidence.source}/inventory.json`).files, { path: 'inventory.json', sha256: evidence.inventorySha256, bytes: fs.statSync(`${evidence.source}/inventory.json`).size }];
check(inventory.length === evidence.archiveFiles && inventory.length === 73, 'Expected 73 frozen originals');
for (const row of inventory) {
  check(safe(row.path) && hash(`${evidence.source}/${row.path}`) === row.sha256 && fs.statSync(`${evidence.source}/${row.path}`).size === row.bytes, `Frozen original changed: ${row.path}`);
  check(!fs.existsSync(`${evidence.target}/${row.path}`) || hash(`${evidence.target}/${row.path}`) === row.sha256, `Conflicting archive destination: ${row.path}`);
}
const expected = ['src/world/generation-history.ts', 'src/world/detail-preview17-history.test.ts'].sort();
check(JSON.stringify(ready.files.map(r => r.path).sort()) === JSON.stringify(expected), 'Unexpected source target');
for (const row of ready.files) {
  check(row.stagedPath === `${stage}/${row.path}` && hash(row.stagedPath) === row.sha256, `Candidate changed: ${row.path}`);
  const actual = fs.existsSync(row.path) ? hash(row.path) : null;
  check(actual === row.baselineSha256 || actual === row.sha256, `Production baseline changed: ${row.path}`);
}
for (const row of inventory) {
  const target = `${evidence.target}/${row.path}`;
  if (!fs.existsSync(target)) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(`${evidence.source}/${row.path}`, target, fs.constants.COPYFILE_EXCL); }
  check(hash(target) === row.sha256, `Archive copy mismatch: ${row.path}`);
}
for (const row of ready.files) { if (!fs.existsSync(row.path) || hash(row.path) !== row.sha256) fs.copyFileSync(row.stagedPath, row.path); check(hash(row.path) === row.sha256, `Source copy mismatch: ${row.path}`); }
const attrs = fs.readFileSync('.gitattributes', 'utf8'), rule = `${evidence.target}/** -text`;
if (!attrs.split(/\r?\n/).includes(rule)) fs.writeFileSync('.gitattributes', `${attrs}${attrs.endsWith('\n') ? '' : '\n'}${rule}\n`);
const receipt = { time: new Date().toISOString(), readySha256: hash(`${stage}/ready-manifest.json`), archiveFiles: inventory.length, sourceFiles: ready.files, historicalSourceIdentity: ready.sourceIdentity, cloudWrites: false };
const output = '.autopilot/ph06/preview17-history-promotion.json';
if (!fs.existsSync(output)) fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, archiveFiles: inventory.length, sourceTargets: ready.files.length, buildSha256: evidence.buildSha256 }));
