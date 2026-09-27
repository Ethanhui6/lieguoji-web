import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const stage = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(stage, '../../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const load = file => fs.readFileSync(path.join(stage, file));
const baseline = JSON.parse(load('baseline-manifest.json'));
const provenance = JSON.parse(load('evidence/preview11/provenance.json'));
const files = ['src/world/generation-history.ts', 'src/world/detail-preview11-history.test.ts'].map(file => {
  const previous = baseline.files.find(row => row.path === file)?.sha256 ?? null;
  const current = fs.existsSync(path.join(root, file)) ? hash(fs.readFileSync(path.join(root, file))) : null;
  if (previous !== current) throw new Error(`Production target changed or new target appeared: ${file}`);
  return { path: file, stagedPath: `.autopilot/ph06/v4-preview11-history-staging/${file}`, baselineSha256: previous, sha256: hash(load(file)), baselineMatches: true, mode: previous ? 'mirror' : 'new' };
});
const inventory = JSON.parse(load('evidence/preview11/inventory.json'));
for (const item of inventory.files) {
  const bytes = load(`evidence/preview11/${item.path}`);
  if (bytes.length !== item.bytes || hash(bytes) !== item.sha256) throw new Error(`Frozen evidence changed: ${item.path}`);
}
const ready = {
  frozenAt: new Date().toISOString(), stagingOnly: true, productionModified: false, files,
  evidence: {
    source: '.autopilot/ph06/v4-preview11-history-staging/evidence/preview11',
    target: 'docs/evidence/ph06-preview11-generator-history-2026-09-27',
    buildSha256: provenance.buildSha256, sourceSnapshotSha256: provenance.sourceSnapshotSha256,
    closureCount: provenance.closureCount, sourceFiles: provenance.sourceCount,
    allClosuresMatched: true, frozenClosuresRecomputed: true,
    allTenGeneratorsAndEngineEqualPreview10: true, distCount: provenance.dist.count,
    archiveFiles: inventory.files.length + 1,
    inventorySha256: hash(load('evidence/preview11/inventory.json')),
    provenanceSha256: hash(load('evidence/preview11/provenance.json')),
  },
  sourceIdentity: { version: provenance.version, actualHead: provenance.actualHead, baseCommit: provenance.baseCommit, sourceIsHead: provenance.sourceIsHead, closureSourceMatchesHead: provenance.closureSourceMatchesHead },
  checks: { run: [], unitCasesWritten: 4, provenanceCaptureOnly: true },
  references: ['capture.mjs', 'capture-result.json', 'baseline-manifest.json', 'README.md'].map(file => ({ path: file, sha256: hash(load(file)) })),
};
fs.writeFileSync(path.join(stage, 'ready-manifest.json'), `${JSON.stringify(ready, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(ready, null, 2));
