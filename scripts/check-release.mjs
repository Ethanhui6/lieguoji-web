import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectRoot, verifyGitRoot, safeProjectFile, loadPlan, evidenceReferences, collectEvidencePaths } from './check-plan.mjs';
import { evaluateRelease, evaluatePlaytest, PLAYTEST_BRANCH } from './release-policy.mjs';

export function unsafeCandidatePath(relative) {
 const name = relative.toLowerCase();
 const parts = name.split('/');
 return parts.some(part => ['.git', '.autopilot', '.wrangler', '.ssh', '.aws', 'node_modules', 'dist', 'saves', 'credentials', '.netrc', '.npmrc', '.yarnrc', '.pypirc'].includes(part))
  || /(^|\/)references\/private(\/|$)/.test(name)
  || /(^|\/)(\.env(?:\.|$)|\.dev\.vars(?:\.|$)|id_rsa(?:\.|$)|id_ed25519(?:\.|$)|credentials(?:\.|$))/.test(name)
  || /\.(?:pem|key|p12|pfx|save\.json|world\.json|history\.json|protected\.json|zip|log)$/.test(name);
}

// Root-project settings reviewed for the explicit playtest; this is not a
// credential-file exemption. Any byte change or nested config remains blocked.
export function reviewedProjectConfig(root, relative) {
 if (relative !== '.npmrc') return false;
 try {
  const absolute = safeProjectFile(root, relative, false);
  return createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') === 'cde76ca04e048c3eba070a2c0dfcf5b723cf6014eab177157096b924f24ec4ca';
 } catch { return false; }
}

export function reviewedEvidenceFile(root, relative) {
 const eligible = value => typeof value === 'string' && /^docs\/evidence\/(?:ph04|ph05-verification)\/.+\.log$/.test(value) && !unsafeCandidatePath(value.slice(0, -4) + '.reviewed');
 if (!eligible(relative)) return false;
 try {
  const raw = JSON.parse(fs.readFileSync(safeProjectFile(root, 'plan/reviewed-evidence-files.json', false), 'utf8'));
  if (!raw || Object.keys(raw).sort().join(',') !== 'files,version' || raw.version !== 1 || !Array.isArray(raw.files) || !raw.files.length) return false;
  const paths = new Set(); let expected;
  for (const entry of raw.files) {
   if (!entry || Object.keys(entry).sort().join(',') !== 'path,sha256' || !eligible(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '') || paths.has(entry.path)) return false;
   paths.add(entry.path); if (entry.path === relative) expected = entry.sha256;
  }
  if (!expected) return false;
  return createHash('sha256').update(fs.readFileSync(safeProjectFile(root, relative, false))).digest('hex') === expected;
 } catch { return false; }
}
const reviewedCandidatePath = (root, relative) => reviewedProjectConfig(root, relative) || reviewedEvidenceFile(root, relative);

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
  if (unsafeCandidatePath(relative) && !reviewedCandidatePath(root, relative)) throw new Error(`Candidate path needs PH34 private-content review: ${relative}`);
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

export function inspectRelease(root, { targetRef, now } = {}) {
 verifyGitRoot(root, root);
 const plan = loadPlan(root);
 const readiness = JSON.parse(fs.readFileSync(safeProjectFile(root, 'plan/release-readiness.json'), 'utf8'));
 const playtestReferences = [readiness.playtest?.authorizationEvidence];
 for (const check of Object.values(readiness.playtest?.checks ?? {})) playtestReferences.push(...(Array.isArray(check?.evidence) ? check.evidence : []));
 const evidencePaths = collectEvidencePaths(root, [...evidenceReferences(plan, readiness), ...playtestReferences]);
 const candidates = candidateSourcePaths(root);
 const pathRisks = candidates.filter(relative => unsafeCandidatePath(relative) && !reviewedCandidatePath(root, relative)).map(relative => `Candidate path needs PH34 private-content review: ${relative}`);
 const wantsRelease = plan.releasePolicy?.state === 'ready' && plan.releasePolicy?.cloudWritesAllowed === true && readiness.status === 'ready';
 const wantsPlaytest = targetRef === PLAYTEST_BRANCH && readiness.playtest?.status === 'ready';
 const cleanWorkingTree = wantsRelease || wantsPlaytest ? workingTreeIsClean(root) : null;
 const fingerprint = (wantsRelease || wantsPlaytest) && !pathRisks.length && cleanWorkingTree ? createSourceFingerprint(root) : { sourceFingerprint: null, fileCount: candidates.filter(file => file !== 'plan/release-readiness.json').length };
 const context = { evidencePaths, sourceFingerprint: fingerprint.sourceFingerprint, cleanWorkingTree, targetRef, now };
 const formal = evaluateRelease(plan, readiness, context);
 const usePlaytest = !formal.ready && targetRef === PLAYTEST_BRANCH;
 const result = usePlaytest ? evaluatePlaytest(plan, readiness, context) : formal;
 const blockers = [...result.blockers, ...pathRisks];
 return { ...result, ...fingerprint, cleanWorkingTree, blockers, ready: blockers.length === 0, gate: usePlaytest ? 'authorized-playtest' : 'full-release', targetRef: targetRef ?? null, formalReady: formal.ready };
}

function main() {
 const args = process.argv.slice(2);
 let reportOnly = false, targetRef;
 for (let index = 0; index < args.length; index++) {
  if (args[index] === '--status' && !reportOnly) reportOnly = true;
  else if (args[index] === '--target-ref' && targetRef === undefined && args[index + 1]) {
   targetRef = args[++index];
   if (!targetRef.startsWith('refs/heads/')) throw new Error('Release target must be an explicit branch ref');
   execFileSync('git', ['check-ref-format', targetRef], { stdio: 'ignore' });
  } else throw new Error('Usage: node scripts/check-release.mjs [--status] [--target-ref refs/heads/branch]');
 }
 const root = verifyGitRoot(projectRoot);
 const result = inspectRelease(root, { targetRef });
 console.log(JSON.stringify({ ready: result.ready, formalReady: result.formalReady, gate: result.gate, targetRef: result.targetRef, mode: reportOnly ? 'report-only' : 'enforce', sourceFingerprint: result.sourceFingerprint, cleanWorkingTree: result.cleanWorkingTree, fileCount: result.fileCount, blockers: result.blockers }, null, 2));
 if (!result.ready && !reportOnly) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 try { main(); } catch (error) { console.error(`Release check failed closed: ${error.message}`); process.exitCode = 1; }
}
