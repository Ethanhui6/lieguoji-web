// Prepared only. The root executor reviews this plan, then explicitly invokes
// --apply after coordinating the remaining candidates and unified checks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd(), staging = path.resolve(root, '.autopilot/ph06/ocean-material-staging');
const manifest = JSON.parse(fs.readFileSync(path.join(staging, 'ready-manifest.json'), 'utf8'));
const allowed = [
  'src/world/terrain-material.ts', 'src/world/terrain-mesh.ts', 'src/world/renderer.ts',
  'src/world/terrain-material.test.ts', 'src/world/terrain-mesh.test.ts', 'src/world/renderer.test.ts',
  'src/world/ocean-material.test.ts', 'src/world/ocean-material-cache.test.ts',
  'src/world/test-fixtures/preview21-terrain-material.ts',
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (manifest.status !== 'candidate-cpu-passed-awaiting-integration' || !manifest.cpuEvidence?.candidatePassed) throw Error('Candidate has not passed its CPU gate');
if (JSON.stringify(manifest.promotionPlan.map(file => file.target).sort()) !== JSON.stringify([...allowed].sort())) throw Error('Unexpected promotion scope');
const checked = JSON.parse(fs.readFileSync(path.join(staging, manifest.cpuEvidence.verification), 'utf8'));
if (!checked.candidatePassed || !checked.sourceStable || !checked.dependenciesStable || !checked.identitiesUnchanged || checked.testsPassed !== 140) throw Error('Invalid exact checked evidence');
const planned = manifest.promotionPlan.map(file => {
  const source = path.join(staging, file.source), bytes = fs.readFileSync(source);
  if (hash(bytes) !== file.sourceSha256) throw Error(`Unreviewed candidate edit: ${file.source}`);
  let output = bytes;
  if (file.rewriteFixtureImport) {
    const text = bytes.toString('utf8'), from = '../../baseline/preview21-terrain-material', to = './test-fixtures/preview21-terrain-material';
    if (text.split(from).length !== 2) throw Error('Expected exactly one independent oracle import');
    output = Buffer.from(text.replace(from, to));
  }
  if (hash(output) !== file.outputSha256) throw Error(`Promotion transform drift: ${file.target}`);
  const target = path.resolve(root, file.target);
  if (!target.startsWith(path.resolve(root, 'src/world') + path.sep)) throw Error('Promotion target outside world source');
  const existing = fs.existsSync(target) ? hash(fs.readFileSync(target)) : null;
  if (existing !== file.previousSha256 && existing !== file.outputSha256) throw Error(`Preserve other edits: ${file.target}`);
  return { ...file, target, output, alreadyApplied: existing === file.outputSha256 };
});
if (process.argv.includes('--apply')) {
  // Every destination and original source was verified before the first write.
  for (const file of planned) if (!file.alreadyApplied) {
    fs.mkdirSync(path.dirname(file.target), { recursive: true }); fs.writeFileSync(file.target, file.output);
  }
}
console.log(JSON.stringify({ applied: process.argv.includes('--apply'), files: planned.map(file => ({ target: path.relative(root, file.target), sha256: file.outputSha256, alreadyApplied: file.alreadyApplied })),
  productionChecksStillRequired: true, buildRun: false, gpuRun: false, cloudWrites: false }, null, 2));
