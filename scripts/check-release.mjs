import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectRoot, verifyGitRoot, safeProjectFile, loadPlan, evidenceReferences, collectEvidencePaths } from './check-plan.mjs';
import { evaluateRelease } from './release-policy.mjs';

export function unsafeCandidatePath(relative) {
 const name = relative.toLowerCase();
 const parts = name.split('/');
 return parts.some(part => ['.git', '.autopilot', '.wrangler', '.ssh', '.aws', 'node_modules', 'dist', 'saves', 'credentials', '.netrc', '.npmrc', '.yarnrc', '.pypirc'].includes(part))
  || /(^|\/)references\/private(\/|$)/.test(name)
  || /(^|\/)(\.env(?:\.|$)|\.dev\.vars(?:\.|$)|id_rsa(?:\.|$)|id_ed25519(?:\.|$)|credentials(?:\.|$))/.test(name)
  || /\.(?:pem|key|p12|pfx|save\.json|world\.json|history\.json|protected\.json|zip|log)$/.test(name);
}

export function candidateSourcePaths(root) {
 verifyGitRoot(root, root);
 const listing = execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
 const paths = [...new Set(listing.split('\0').filter(Boolean))].sort();
 if (!paths.length) throw new Error('No candidate source files found');
 return paths;
}

export function workingTreeIsClean(root) {
 verifyGitRoot(root, root);
 return execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).length === 0;
}

export function createSourceFingerprint(root) {
 verifyGitRoot(root, root);
 const candidates = candidateSourcePaths(root);
 // Validate the full candidate set before reading any contents.
 const files = candidates.filter(relative => relative !== 'plan/release-readiness.json').map(relative => {
  if (unsafeCandidatePath(relative)) throw new Error(`Candidate path needs PH34 private-content review: ${relative}`);
  return { relative, absolute: safeProjectFile(root, relative, false) };
 });
 if (!files.length) throw new Error('No candidate source files found');
 const digest = createHash('sha256');
 digest.update('lieguoji-release-source-v1\0');
 for (const file of files) {
  const contents = fs.readFileSync(file.absolute);
  digest.update(file.relative).update('\0').update(String(contents.length)).update('\0').update(createHash('sha256').update(contents).digest('hex')).update('\0');
 }
 return { sourceFingerprint: digest.digest('hex'), fileCount: files.length };
}

export function inspectRelease(root) {
 verifyGitRoot(root, root);
 const plan = loadPlan(root);
 const readiness = JSON.parse(fs.readFileSync(safeProjectFile(root, 'plan/release-readiness.json'), 'utf8'));
 const evidencePaths = collectEvidencePaths(root, evidenceReferences(plan, readiness));
 const candidates = candidateSourcePaths(root);
 const pathRisks = candidates.filter(unsafeCandidatePath).map(relative => `Candidate path needs PH34 private-content review; contents not read: ${relative}`);
 const wantsRelease = plan.releasePolicy?.state === 'ready' && plan.releasePolicy?.cloudWritesAllowed === true && readiness.status === 'ready';
 const cleanWorkingTree = wantsRelease ? workingTreeIsClean(root) : null;
 const fingerprint = wantsRelease && !pathRisks.length && cleanWorkingTree ? createSourceFingerprint(root) : { sourceFingerprint: null, fileCount: candidates.filter(file => file !== 'plan/release-readiness.json').length };
 const result = evaluateRelease(plan, readiness, { evidencePaths, sourceFingerprint: fingerprint.sourceFingerprint, cleanWorkingTree });
 const blockers = [...result.blockers, ...pathRisks];
 return { ...result, ...fingerprint, cleanWorkingTree, blockers, ready: blockers.length === 0 };
}

function main() {
 const args = process.argv.slice(2);
 if (args.length > 1 || (args.length === 1 && args[0] !== '--status')) throw new Error('Usage: node scripts/check-release.mjs [--status]');
 const root = verifyGitRoot(projectRoot);
 const result = inspectRelease(root);
 console.log(JSON.stringify({ ready: result.ready, mode: args[0] === '--status' ? 'report-only' : 'enforce', sourceFingerprint: result.sourceFingerprint, cleanWorkingTree: result.cleanWorkingTree, fileCount: result.fileCount, blockers: result.blockers }, null, 2));
 if (!result.ready && args[0] !== '--status') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 try { main(); } catch (error) { console.error(`Release check failed closed: ${error.message}`); process.exitCode = 1; }
}
