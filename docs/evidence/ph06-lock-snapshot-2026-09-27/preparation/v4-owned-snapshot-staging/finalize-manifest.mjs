import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const staging = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(staging, '../../..');
const baselineSha256 = '368f02ea7cfee00ea5285daa27d016dceec9d0db690b60dc86ba251f59121e3d';
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const runtimePath = 'src/world/transactions.ts', testPath = 'src/world/detail-owned-snapshot-copy.test.ts';
const baselineFile = path.join(staging, 'transactions.baseline.ts.txt');
if (hash(baselineFile) !== baselineSha256 || hash(path.join(repo, runtimePath)) !== baselineSha256) throw new Error('Production/baseline drift: do not finalize or overwrite changed source.');
if (existsSync(path.join(repo, testPath))) throw new Error('Target test already exists: coordinate ownership before promotion.');

const boundary = text => {
  const start = text.indexOf('  async snapshotAsync('), end = text.indexOf('  manifest() {', start);
  if (start < 0 || end < start) throw new Error('Snapshot method boundaries missing.');
  return { prefix: text.slice(0, start), suffix: text.slice(end) };
};
const before = boundary(readFileSync(baselineFile, 'utf8'));
const after = boundary(readFileSync(path.join(staging, runtimePath), 'utf8'));
if (before.prefix !== after.prefix || before.suffix !== after.suffix) throw new Error('Candidate changed bytes outside snapshotAsync.');

const manifest = {
  version: 1, createdAt: new Date().toISOString(),
  baselineHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  stagingOnly: true, productionModifiedByThisTask: false, status: 'candidate-awaiting-authorized-checks', freeze: true,
  files: [runtimePath, testPath].map(relative => ({ path: relative, stagedSha256: hash(path.join(staging, relative)),
    baselineSha256: relative === runtimePath ? baselineSha256 : null, productionExists: existsSync(path.join(repo, relative)) })),
  supportingFiles: ['README.md', 'transactions.baseline.ts.txt', 'vitest.config.ts', 'finalize-manifest.mjs'].map(relative => ({ path: relative, sha256: hash(path.join(staging, relative)) })),
  readDependencies: ['src/world/atlas-format.ts', 'src/world/generation-format.ts', 'src/world/generation-locks.ts',
    'src/world/model.ts', 'src/world/detail-coast-codec.ts', 'src/world/detail-coast-types.ts', 'src/world/atlas.worker.ts',
    'src/world/cooperative-ownership.test.ts', 'src/world/detail-owned-replacement-copy.test.ts', 'vite.config.ts']
    .map(relative => ({ path: relative, sha256: hash(path.join(repo, relative)) })),
  scope: { runtimeMethods: ['OwnedAtlasSession.snapshotAsync'], maximumCopiedItemsPerBatch: 16,
    exactBytesOutsideMethodPreserved: true, publicRawIngressUnchanged: true, fullVerificationRetained: true,
    guardedSource: ['private data identity', 'manifest identity', 'format version', 'revision', 'rootDigest', 'manifestDigest', 'AbortSignal'],
    callbackAndSchedulerGuardedBeforeAndAfter: true, storageAndDurableSemanticsUnchanged: true },
  checks: { staticReview: 'manual source/diff review plus byte/hash bookkeeping only', lint: 'not_run', typecheck: 'not_run',
    unit: 'not_run', build: 'not_run', browser: 'not_run', performance: 'not_run', writtenTestCases: 11,
    passedTestCases: null, productionBaselineUnchangedAtFinalization: true },
  limitations: ['No runtime or performance acceptance claimed.',
    'Owned has no close/dispose API; existing Worker.close propagates active AbortSignal. Narrow tests exercise that signal only.',
    '33 sampled tiles cover batching; actual dense Worker measurement remains pending.',
    'Public raw dense ownership and synchronous manifest/per-block clone costs remain unchanged.',
    'Synthetic Owned publication receipts do not prove IndexedDB durability.'],
};
writeFileSync(path.join(staging, 'ready-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify({ status: manifest.status, baselineSha256, files: manifest.files, testsRun: false }, null, 2) + '\n');
