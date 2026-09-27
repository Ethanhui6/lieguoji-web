import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Metadata/hash generation only; this script does not load application code or run checks.
const repo = process.cwd();
const directory = '.autopilot/ph06/v4-owned-replacement-copy-staging';
const root = path.resolve(repo, directory);
const hash = file => createHash('sha256').update(readFileSync(path.resolve(repo, file))).digest('hex');
const expected = 'f8df63985e443d77b87c43a0eff9ef90034b258a118f3f6fdcccf5acb4114789';
const baseline = hash('src/world/transactions.ts');
if (baseline !== expected || hash(`${directory}/transactions.baseline.ts.txt`) !== expected) throw new Error('Production or captured baseline changed; do not overwrite or claim ready.');
const targetTest = 'src/world/detail-owned-replacement-copy.test.ts';
if (existsSync(path.resolve(repo, targetTest))) throw new Error('New test path already exists in production; inspect before promotion.');
const files = ['src/world/transactions.ts', targetTest].map(file => ({
  path: file,
  stagedSha256: hash(`${directory}/${file}`),
  baselineSha256: file === targetTest ? null : baseline,
  productionExists: file !== targetTest,
}));
const supportingFiles = ['README.md', 'transactions.baseline.ts.txt', 'vitest.config.ts', 'finalize-manifest.mjs'].map(file => ({ path: file, sha256: hash(`${directory}/${file}`) }));
const dependencyPaths = ['src/world/atlas-format.ts', 'src/world/generation-format.ts', 'src/world/generation-contract.ts', 'src/world/generation-locks.ts', 'src/world/model.ts', 'src/world/detail-coast-codec.ts', 'src/world/detail-coast-types.ts', 'src/world/cooperative-ownership.test.ts', 'src/world/detail-private-ingress.test.ts', 'vite.config.ts'];
const report = {
  version: 1, createdAt: new Date().toISOString(), baselineHead: 'd17fc9bb3411226836343821e42792568b7a22c1',
  stagingOnly: true, productionModifiedByThisTask: false, status: 'candidate-awaiting-authorized-checks', freeze: true,
  files, supportingFiles, readDependencies: dependencyPaths.map(file => ({ path: file, sha256: hash(file) })),
  scope: { runtimeMethods: ['OwnedAtlasSession.replacementDocumentAsync'], maximumCopiedItemsPerBatch: 16, publicRawIngressUnchanged: true, fullVerificationRetained: true, candidateAndSourceGuardsRetained: true, storageAndDurableSemanticsUnchanged: true },
  checks: { staticReview: 'manual source/diff review only', lint: 'not_run', typecheck: 'not_run', unit: 'not_run', browser: 'not_run', performance: 'not_run', writtenTestCases: 8, passedTestCases: null, productionBaselineUnchangedAtFinalization: true },
  limitations: ['No runtime or performance acceptance claimed.', 'No Owned dispose API exists; candidate invalidation tests use discard/publish/replacement.', '33 sampled tiles cover batching only; 4096-tile actual Worker measurement remains pending.', 'Public raw dense synchronous ownership is unchanged.', 'Synthetic Owned publication receipt is not an IDB commit test.'],
};
writeFileSync(path.join(root, 'ready-manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ stagingOnly: report.stagingOnly, status: report.status, files: report.files, checks: report.checks }, null, 2));
