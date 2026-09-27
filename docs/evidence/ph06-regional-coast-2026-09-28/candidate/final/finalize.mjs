import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const staging = path.resolve('.autopilot/ph06/regional-coast-staging'), sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const current = JSON.parse(readFileSync(path.join(staging, 'ready-manifest.json'), 'utf8'));
const finalFile = path.join(staging, 'checks/repair-1/verification.json'), verified = JSON.parse(readFileSync(finalFile, 'utf8'));
if (!verified.candidatePassed || verified.testsObserved !== 28 || verified.testsPassed !== 28 || verified.testFilesObserved.length !== 7 || !verified.sourceStable || !verified.identityStable) throw new Error('Missing the exact successful candidate check');
const after = JSON.parse(readFileSync(path.join(staging, 'checks/repair-1/sources-after.json'), 'utf8'));
for (const source of after.filter(source => source.file.endsWith('.ts') || source.file === 'tsconfig.json')) {
  if (sha(path.join(staging, source.file)) !== source.sha256) throw new Error(`Checked code changed after verification: ${source.file}`);
}
const identity = JSON.parse(readFileSync(path.join(staging, 'checks/repair-1/identity-after.json'), 'utf8'));
for (const dependency of identity.productionSources) if (sha(path.resolve(dependency.file)) !== dependency.sha256) throw new Error(`Runtime dependency changed after verification: ${dependency.file}`);
const list = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if (entry.isDirectory() && ['checks', '.vite-cache', 'node_modules'].includes(entry.name)) return [];
  return entry.isDirectory() ? list(path.join(directory, entry.name)) : [path.join(directory, entry.name)];
});
const files = list(staging).filter(file => !file.endsWith('ready-manifest.json')).map(file => ({ path: path.relative(staging, file).replaceAll('\\', '/'), sha256: sha(file) }));
const result = { ...current, recordedAt: new Date().toISOString(), status: 'candidate-cpu-passed-awaiting-review', cpuChecksRun: true,
  runtimeSourceOverlay: current.runtimeSourceOverlay.map(source => ({ ...source, sha256: sha(path.join(source.staged ? staging : process.cwd(), source.file)) })),
  files, actualIdentities: { natural: identity.natural.sha256, additive: identity.additive.sha256 },
  checks: { first: { path: 'checks/first/verification.json', sha256: sha(path.join(staging, 'checks/first/verification.json')), types: false, lint: false, unitPassed: 26, unitTotal: 28 },
    final: { path: 'checks/repair-1/verification.json', sha256: sha(finalFile), types: true, lint: true, unitPassed: 28, unitTotal: 28, testFiles: 7, sourceStable: true, identityStable: true } },
  candidateHashes: current.candidates.map(file => ({ file, sha256: sha(path.join(staging, file)) })),
  productionPromoted: false, gpuRun: false, visualAccepted: false, cloudWrites: false,
  note: 'Isolated CPU checks only. First failures and both original source snapshots retained. No renderer/build/device/cloud or natural-appearance acceptance.' };
writeFileSync(path.join(staging, 'ready-manifest.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, sha256: sha(path.join(staging, 'ready-manifest.json')), candidateHashes: result.candidateHashes, actualIdentities: result.actualIdentities }));
