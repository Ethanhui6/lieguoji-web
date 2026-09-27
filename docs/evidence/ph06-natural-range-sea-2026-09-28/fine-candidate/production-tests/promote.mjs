import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Parent-owned opt-in promotion. Default is read-only; never runs checks,
// builds, Git, cloud commands, or changes any runtime/fixture/other test.
const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, '../../../..');
const mode = process.argv[2] ?? '--plan';
if (!['--plan', '--apply'].includes(mode) || process.argv.length > 3) throw new Error('Use --plan or --apply.');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fileSha = file => fs.existsSync(file) ? sha(fs.readFileSync(file)) : null;
const manifestBytes = fs.readFileSync(path.join(dir, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
const allowed = new Set(['src/world/generation/detail-natural-ranges.test.ts', 'src/world/generation/detail-natural-ranges-writer.test.ts',
  'src/world/generation/detail-fine-world-relief.test.ts']);
if (manifest.files.length !== allowed.size || new Set(manifest.files.map(f => f.target)).size !== allowed.size
  || manifest.files.some(file => !allowed.has(file.target))) throw new Error('Unexpected promotion target list.');
const guards = [];
for (const [file, expected] of Object.entries(manifest.runtimePrerequisites)) {
  guards.push({ file, role: 'required-frozen-runtime', expected, actual: fileSha(path.join(root, file)) });
}
for (const protectedFile of manifest.protectedFiles) {
  guards.push({ file: protectedFile.file, role: 'protected-unchanged-test-or-oracle', expected: protectedFile.sha256, actual: fileSha(path.join(root, protectedFile.file)) });
}
const targets = manifest.files.map(file => {
  const prepared = fileSha(path.join(dir, 'files', file.target));
  if (prepared !== file.preparedSha256) throw new Error(`Prepared source changed: ${file.target}`);
  const actual = fileSha(path.join(root, file.target));
  return { ...file, actual, alreadyApplied: actual === file.preparedSha256,
    safeToWrite: actual === file.baseSha256 || actual === file.preparedSha256 };
});
const mismatches = guards.filter(g => g.actual !== g.expected);
const safe = mismatches.length === 0 && targets.every(t => t.safeToWrite);
if (mode === '--plan') {
  console.log(JSON.stringify({ mode: 'read-only', safeToApply: safe, targets, mismatches, testsRun: false }, null, 2));
} else {
  if (!safe) throw new Error(`Source guards changed; review instead of overwriting: ${JSON.stringify({ mismatches, unsafeTargets: targets.filter(t => !t.safeToWrite) })}`);
  const changes = targets.filter(t => !t.alreadyApplied);
  if (!changes.length) console.log(JSON.stringify({ status: 'already-applied', testsRun: false }));
  else {
    const timestamp = new Date().toISOString().replaceAll(':', '-'), auditDir = path.join(dir, 'promotion-results', timestamp);
    fs.mkdirSync(auditDir, { recursive: true });
    // Back up every replaceable original before the first production write.
    for (const file of changes) if (file.actual !== null) {
      const backup = path.join(auditDir, 'before', file.target);
      fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.copyFileSync(path.join(root, file.target), backup);
    }
    for (const file of changes) {
      // A final per-file optimistic guard also protects against concurrent edits.
      if (fileSha(path.join(root, file.target)) !== file.actual) throw new Error(`Concurrent source change: ${file.target}`);
      fs.copyFileSync(path.join(dir, 'files', file.target), path.join(root, file.target));
    }
    const result = { status: 'promoted-awaiting-production-checks', at: new Date().toISOString(), manifestSha256: sha(manifestBytes),
      written: changes.map(file => ({ file: file.target, sha256: fileSha(path.join(root, file.target)) })), guards, testsRun: false, runtimeWritten: false };
    fs.writeFileSync(path.join(auditDir, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ status: result.status, written: result.written, testsRun: false }));
  }
}
