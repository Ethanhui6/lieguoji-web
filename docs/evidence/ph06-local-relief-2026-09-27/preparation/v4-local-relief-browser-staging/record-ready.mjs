import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const stage = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(stage, '../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const target = 'tests/atlas-local-relief.spec.ts';
if (fs.existsSync(path.join(root, target))) throw new Error('New production test path already exists');
const info = file => { const bytes = fs.readFileSync(path.join(root, file)); return { path: file, bytes: bytes.length, sha256: sha(bytes) }; };
const testBytes = fs.readFileSync(path.join(stage, target));
const ready = {
  preparedAt: new Date().toISOString(), stagingOnly: true, productionModified: false,
  files: [{ path: target, stagedPath: `.autopilot/ph06/v4-local-relief-browser-staging/${target}`, baselineSha256: null, targetAbsent: true, sha256: sha(testBytes), bytes: testBytes.length }],
  dependencies: [
    'tests/helpers/atlas-shape-readonly.ts',
    '.autopilot/ph06/v4-local-relief-ui-staging/src/editor/AtlasStudio.tsx',
    '.autopilot/ph06/v4-local-relief-ui-staging/src/editor/LocalReliefPanel.tsx',
  ].map(info),
  checks: { run: [], browserCasesWritten: 1, perProjectTimeoutMs: 450000 },
  scope: 'Native continent and land selection; private preview cancel; local fine-height confirmation; exact current coarse/coverage/lock identity; undo, repeat and reload. No device, visual, performance or populated-lock-conflict acceptance.',
  requiredBuildIdentity: 'localDetailReliefGenerator.sha256',
  README: { path: '.autopilot/ph06/v4-local-relief-browser-staging/README.md', sha256: sha(fs.readFileSync(path.join(stage, 'README.md'))) },
};
fs.writeFileSync(path.join(stage, 'ready-manifest.json'), `${JSON.stringify(ready, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(ready, null, 2));
