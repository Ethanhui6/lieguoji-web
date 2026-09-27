import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd(), staging = path.resolve(root, '.autopilot/ph06/ocean-material-staging'), round = 'checks/repair-1';
const bytesHash = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), hash = file => bytesHash(fs.readFileSync(file));
const read = file => JSON.parse(fs.readFileSync(path.join(staging, file), 'utf8'));
const manifest = read('ready-manifest.json'), verification = read(`${round}/verification.json`), after = read(`${round}/source-after.json`), identity = read(`${round}/identity-after.json`);
if (!verification.candidatePassed || !verification.sourceStable || !verification.dependenciesStable || !verification.identitiesUnchanged || verification.testsPassed !== 140) throw Error('Checked candidate is not complete');
for (const source of after.filter(source => source.file.endsWith('.ts') || source.file === 'tsconfig.json')) {
  if (hash(path.join(staging, source.file)) !== source.sha256) throw Error(`Changed after CPU check: ${source.file}`);
}
const sourceMap = new Map(after.map(source => [source.file, source.sha256]));
manifest.runtimeSourceOverlay = manifest.runtimeSourceOverlay.map(source => source.staged ? { ...source, sha256: sourceMap.get(source.file) } : source);
const existingTests = ['terrain-material.test.ts', 'terrain-mesh.test.ts', 'renderer.test.ts'].map(file => `src/world/${file}`);
const reverseFixedColors = file => {
  let text = fs.readFileSync(path.join(staging, file), 'utf8');
  const replacements = file.endsWith('/terrain-material.test.ts') ? [['0x1b4c61', '0x1b5269'], ['0x29596a', '0x28798d'], ['0x51868a', '0x4c97a8'], ['0x3d707a', '0x3a889b']]
    : file.endsWith('/terrain-mesh.test.ts') ? [['[81, 134, 138, 255]', '[76, 151, 168, 255]'], ['[97, 141, 139, 255]', '[121, 186, 192, 255]']]
    : [['0x51868a', '0x4c97a8']];
  for (const [from, to] of replacements) { if (text.split(from).length !== 2) throw Error(`Fixed color count drift: ${file}`); text = text.replace(from, to); }
  return text.replace(/\r\n/g, '\n');
};
for (const file of existingTests) {
  if (reverseFixedColors(file) !== fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')) throw Error(`Unexpected old regression edit: ${file}`);
  fs.copyFileSync(path.join(root, file), path.join(staging, 'baseline', `preview21-${path.basename(file)}`), fs.constants.COPYFILE_EXCL);
}
for (const source of manifest.baselineFiles) if (hash(path.join(root, source.file)) !== source.sha256) throw Error(`Production candidate base changed: ${source.file}`);
const promotedFiles = [...manifest.candidates, ...manifest.stagedTests];
manifest.promotionPlan = promotedFiles.map(file => {
  const source = fs.readFileSync(path.join(staging, file)), rewriteFixtureImport = file === 'src/world/ocean-material.test.ts';
  const output = rewriteFixtureImport ? Buffer.from(source.toString('utf8').replace('../../baseline/preview21-terrain-material', './test-fixtures/preview21-terrain-material')) : source;
  return { source: file, target: file, sourceSha256: bytesHash(source), outputSha256: bytesHash(output),
    previousSha256: fs.existsSync(path.join(root, file)) ? hash(path.join(root, file)) : null, rewriteFixtureImport };
});
manifest.promotionPlan.push({ source: 'baseline/preview21-terrain-material.ts', target: 'src/world/test-fixtures/preview21-terrain-material.ts',
  sourceSha256: hash(path.join(staging, 'baseline/preview21-terrain-material.ts')), outputSha256: hash(path.join(staging, 'baseline/preview21-terrain-material.ts')), previousSha256: null, rewriteFixtureImport: false });
manifest.historicalOracle.sourceCommit = manifest.baselineCommit;
manifest.cpuChecksRun = true; manifest.status = 'candidate-cpu-passed-awaiting-integration';
manifest.cpuEvidence = { verification: `${round}/verification.json`, verificationSha256: hash(path.join(staging, round, 'verification.json')), candidatePassed: true,
  types: verification.results.find(result => result.name === 'types'), lint: verification.results.find(result => result.name === 'lint'), unit: verification.results.find(result => result.name === 'unit'),
  testsObserved: 140, testsPassed: 140, failuresPreserved: 'checks/first', firstVerificationSha256: hash(path.join(staging, 'checks/first/verification.json')) };
manifest.actualIdentityEvidence = { path: `${round}/identity-after.json`, sha256: hash(path.join(staging, round, 'identity-after.json')),
  generators: identity.candidate.generators, engine: identity.candidate.engine, identitiesUnchanged: identity.identitiesUnchanged };
manifest.promotionScript = { path: 'promote.mjs', sha256: hash(path.join(staging, 'promote.mjs')), executed: false };
manifest.preservedRegressionFiles = manifest.preservedTests.map(file => ({ file, sha256: identity.productionSources.find(source => source.file === file).sha256 }));
fs.writeFileSync(path.join(staging, 'ready-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ readySha256: hash(path.join(staging, 'ready-manifest.json')), status: manifest.status, candidateSources: manifest.runtimeSourceOverlay.filter(source => source.staged),
  tests: verification.testsPassed, promotionTargets: manifest.promotionPlan.map(file => file.target), productionPromoted: false, gpuRun: false }));
