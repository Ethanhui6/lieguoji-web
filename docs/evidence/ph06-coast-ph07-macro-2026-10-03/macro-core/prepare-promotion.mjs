import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const base = '.autopilot/ph07/macro-flow-staging';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['hydrology-macro-contract.ts', 'hydrology-macro-flow.ts', 'hydrology-reader-owned.ts', 'hydrology-macro-flow.test.ts', 'hydrology-reader-owned.test.ts'];
const changes = [];
for (const name of files) {
  const candidatePath = `${base}/src/world/${name}`, candidate = fs.readFileSync(candidatePath), target = `src/world/${name}`;
  const promoted = candidate.toString().replaceAll('../../../../../src/world/', './');
  const destination = `${base}/promotion/${target}`;
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, promoted, { flag: 'wx' });
  changes.push({ target, candidatePath, candidateSha256: hash(candidate), promotionPath: destination, promotionSha256: hash(Buffer.from(promoted)),
    beforeSha256: fs.existsSync(target) ? hash(fs.readFileSync(target)) : null });
}
const original = fs.readFileSync('src/world/hydrology-reader-owned.ts', 'utf8');
const candidate = fs.readFileSync(`${base}/promotion/src/world/hydrology-reader-owned.ts`, 'utf8');
const oldPage = original.slice(original.indexOf('  const readPage = async '), original.indexOf('  return Object.freeze({ readPage, close:'));
const candidatePage = candidate.slice(candidate.indexOf('  const readPage = async '), candidate.indexOf('  const readMacroGrid = async '));
if (oldPage !== candidatePage) throw Error('Old readPage body changed');
const oldTests = fs.readFileSync('src/world/hydrology-reader-owned.test.ts', 'utf8').replace("toEqual(['close', 'readPage'])", "toEqual(['close', 'readMacroGrid', 'readPage'])");
const candidateTests = fs.readFileSync(`${base}/promotion/src/world/hydrology-reader-owned.test.ts`, 'utf8');
if (!candidateTests.startsWith(oldTests)) throw Error('Old reader assertions changed beyond added public API key');
const sources = [...files.map(name => `src/world/${name}`), 'tsconfig.json', 'vitest.config.ts', 'check.mjs', 'README.md', 'prepare-reader.mjs', 'macro-reader-tests.part', 'prepare-promotion.mjs']
  .map(file => { const bytes = fs.readFileSync(`${base}/${file}`); return { file, sha256: hash(bytes), bytes: bytes.length }; });
const manifest = { preparedAt: new Date().toISOString(), status: 'static-candidate-not-typechecked-or-tested', changes, sources,
  oldReadPageBodyRawSha256: hash(Buffer.from(oldPage)), oldReadPageBodyUnchanged: true, oldReaderFourTestsPreserved: true,
  oldReaderTestOnlyExistingAssertionChange: 'public method key list adds readMacroGrid; all old readPage behavioral assertions retained',
  newTests: { macroKernelAndContract: 6, macroReader: 3, retainedFineReader: 4, total: 13 },
  frozenApi: { readMacroGrid: '(): Promise<HydrologyMacroGrid>', buildMacroFlowPreview: '(grid, request, control?: HydrologyControl, options?: HydrologyOptions): Promise<HydrologyMacroPreview>' },
  checksRun: false, productionModified: false, cloudWrites: false };
fs.writeFileSync(`${base}/static-manifest.json`, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ changes: changes.length, oldReadPageBodyUnchanged: true, retainedOldTests: 4, totalTestsPrepared: 13, checksRun: false }));
