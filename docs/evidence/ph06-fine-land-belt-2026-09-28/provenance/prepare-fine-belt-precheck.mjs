import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const original = '.autopilot/ph06/v4-orography-visual-fix-staging';
const writer = '.autopilot/ph06/height-plane-diagnostic/writer-staging';
const target = '.autopilot/ph06/v4-fine-belt-staging';
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const check = (ok, why) => { if (!ok) throw new Error(why); };
check(!fs.existsSync(target), 'Combined stage exists, never overwrite');
const ready = read(`${original}/ready-manifest.json`), verified = read(`${writer}/checks/defines-fixed/verification.json`);
check(ready.numericalTests.passed === 21 && verified.passed && verified.sourceUnchanged, 'Both actual isolated prechecks required');
for (const row of ready.files) check(hash(row.candidate) === row.candidateSha256 && hash(row.target) === row.baselineSha256, 'Orography source changed');
const writerSource = `${writer}/src/world/generation/detail-shape-natural.ts`;
const checkedWriter = read(`${writer}/checks/defines-fixed/source-after.json`).find(r => r.path === writerSource);
check(checkedWriter && hash(writerSource) === checkedWriter.sha256, 'Actual checked writer changed');
const copies = [...ready.files.map(r => ({ source: r.candidate, target: `${target}/${r.target}` })),
  { source: writerSource, target: `${target}/src/world/generation/detail-shape-natural.ts` },
  { source: `${original}/src/world/generation/detail-natural-visual-repair.test.ts`, target: `${target}/src/world/generation/detail-natural-visual-repair.test.ts` }];
for (const row of copies) {
  fs.mkdirSync(path.dirname(row.target), { recursive: true });
  let content = fs.readFileSync(row.source, 'utf8');
  if (row.target.endsWith('detail-natural-visual-repair.test.ts')) content = content.replaceAll(original, target);
  fs.writeFileSync(row.target, content, { flag: 'wx' });
  row.sourceSha256 = hash(row.source); row.targetSha256 = hash(row.target);
}
let config = fs.readFileSync(`${original}/vitest.config.ts`, 'utf8').replaceAll(original, target)
  .replace("['detail-natural-relief.ts', 'detail-orography.ts']", "['detail-natural-relief.ts', 'detail-orography.ts', 'detail-shape-natural.ts']");
fs.writeFileSync(`${target}/vitest.config.ts`, config, { flag: 'wx' });
let runner = fs.readFileSync(`${original}/run.mjs`, 'utf8').replaceAll(original, target)
  .replace("['detail-natural-relief.ts', 'detail-orography.ts', 'detail-orography.test.ts', 'detail-natural-visual-repair.test.ts']", "['detail-natural-relief.ts', 'detail-orography.ts', 'detail-shape-natural.ts', 'detail-orography.test.ts', 'detail-natural-visual-repair.test.ts']")
  .replace("readFile(sources[3], 'utf8')", "readFile(sources[4], 'utf8')")
  .replace('sources.slice(0, 2).every', 'sources.slice(0, 3).every')
  .replace("resolve('src/world/generation/detail-shape-natural.ts')", "resolve(`${stage}/src/world/generation/detail-shape-natural.ts`)");
fs.writeFileSync(`${target}/run.mjs`, runner, { flag: 'wx' });
fs.writeFileSync(`${target}/preparation.json`, JSON.stringify({ time: new Date().toISOString(), copies, originalReadySha256: hash(`${original}/ready-manifest.json`), writerVerificationSha256: hash(`${writer}/checks/defines-fixed/verification.json`), expectedTests: 21, originalAssertionsUnchanged: true, productionChanged: false, visualAccepted: false }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ target, copied: copies.length, tests: 21, productionChanged: false }));
