import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PHASE_IDS, READINESS_CHECKS, PLAYTEST_BRANCH, PLAYTEST_AUTHORIZATION, PLAYTEST_CHECKS, originalTaskDigest, validatePlan, evaluateRelease, evaluatePlaytest } from './release-policy.mjs';
import { projectRoot, safeProjectFile, verifyGitRoot } from './check-plan.mjs';
import { createSourceFingerprint, inspectRelease, reviewedProjectConfig, reviewedEvidenceFile, unsafeCandidatePath, workingTreeIsClean } from './check-release.mjs';

const evidence = 'docs/evidence/synthetic-acceptance.md';
const fingerprint = 'a'.repeat(64);
function fixture() {
 const original = Array.from({ length: 25 }, (_, index) => ({ id: `LEGACY-${index}`, status: index === 0 ? 'blocked' : 'done', dependsOn: [], acceptance: 'Preserved historical requirement', evidence: index === 0 ? [] : [evidence] }));
 const phases = PHASE_IDS.map((id, index) => ({ id, phase: id, status: 'done', dependsOn: index ? [PHASE_IDS[index - 1]] : [], acceptance: 'Completed functional phase', evidence: [evidence], workItems: Array.from({ length: 4 }, (_, item) => ({ id: `${id}-T${item + 1}`, status: 'done', acceptance: 'Verified work item', evidence: [evidence] })) }));
 const plan = {
  originalPlanPresent: false, tasks: [...original, ...phases],
  programme: { originalTaskCount: 25, originalTaskDigest: originalTaskDigest(original), phaseIds: [...PHASE_IDS], subtaskCount: 144, legacyMapping: {} },
  releasePolicy: { version: 1, mode: 'local_only_until_all_ph_accepted', state: 'ready', cloudWritesAllowed: true, requiredPhases: [...PHASE_IDS], readinessFile: 'plan/release-readiness.json' },
 };
 const readiness = { version: 1, status: 'ready', sourceFingerprint: fingerprint, checks: Object.fromEntries(READINESS_CHECKS.map(id => [id, { status: 'passed', evidence: [evidence] }])) };
 return { plan, readiness, context: { evidencePaths: new Set([evidence]), sourceFingerprint: fingerprint, cleanWorkingTree: true } };
}
const phase = (plan, id) => plan.tasks.find(item => item.id === id);
const evaluate = value => evaluateRelease(value.plan, value.readiness, value.context);
function playtestFixture() {
 const value = fixture();
 for (const task of value.plan.tasks.filter(task => task.phase)) {
  task.status = 'todo'; task.evidence = [];
  for (const item of task.workItems) { item.status = 'todo'; item.evidence = []; }
 }
 value.plan.releasePolicy.state = 'locked'; value.plan.releasePolicy.cloudWritesAllowed = false;
 value.readiness.status = 'not_ready'; value.readiness.sourceFingerprint = null;
 for (const check of Object.values(value.readiness.checks)) { check.status = 'pending'; check.evidence = []; }
 value.readiness.playtest = { version: 1, status: 'ready', authorizationEvidence: PLAYTEST_AUTHORIZATION, sourceFingerprint: fingerprint, branch: PLAYTEST_BRANCH, expiresAt: '2026-09-25T00:00:00Z', checks: Object.fromEntries(PLAYTEST_CHECKS.map(id => [id, { status: 'passed', evidence: [`docs/evidence/playtest-${id}.md`] }])) };
 value.context.evidencePaths.add(PLAYTEST_AUTHORIZATION);
 for (const check of Object.values(value.readiness.playtest.checks)) value.context.evidencePaths.add(check.evidence[0]);
 value.context.targetRef = PLAYTEST_BRANCH; value.context.now = Date.parse('2026-09-24T00:00:00Z');
 return value;
}
const evaluatePreview = value => evaluatePlaytest(value.plan, value.readiness, value.context);
function withGitFixture(callback) {
 const parent = path.join(projectRoot, '.autopilot'); fs.mkdirSync(parent, { recursive: true });
 const root = fs.mkdtempSync(path.join(parent, 'release-policy-test-'));
 try {
  execFileSync('git', ['init', '--quiet'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, stdio: 'ignore' });
  return callback(root);
 } finally {
  const target = fs.realpathSync(root);
  assert(target.startsWith(`${fs.realpathSync(parent)}${path.sep}release-policy-test-`));
  fs.rmSync(target, { recursive: true, force: false });
 }
}
function writeFixture(root, value) {
 for (const reference of value.context.evidencePaths) {
  const file = path.join(root, reference); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'Synthetic test evidence only.');
 }
 fs.mkdirSync(path.join(root, 'plan'), { recursive: true });
 fs.writeFileSync(path.join(root, 'plan/tasks.json'), JSON.stringify(value.plan));
 fs.writeFileSync(path.join(root, 'plan/release-readiness.json'), JSON.stringify(value.readiness));
 fs.mkdirSync(path.join(root, 'scripts'));
 for (const file of ['check-plan.mjs', 'check-release.mjs', 'release-policy.mjs']) fs.copyFileSync(path.join(projectRoot, 'scripts', file), path.join(root, 'scripts', file));
 fs.writeFileSync(path.join(root, 'app.ts'), 'export const example = 1;');
}
function commitFixture(root) {
 execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
 execFileSync('git', ['-c', 'user.name=Release Policy Test', '-c', 'user.email=release-policy-test@example.invalid', 'commit', '--quiet', '-m', 'Synthetic release fixture'], { cwd: root, stdio: 'ignore' });
}

test('a locked, unfinished programme remains a valid local plan but cannot release', () => {
 const value = fixture();
 for (const item of value.plan.tasks.filter(item => item.phase)) {
  item.status = 'todo'; item.evidence = [];
  for (const work of item.workItems) { work.status = 'todo'; work.evidence = []; }
 }
 value.plan.releasePolicy.state = 'locked'; value.plan.releasePolicy.cloudWritesAllowed = false;
 assert.deepEqual(validatePlan(value.plan, value.context.evidencePaths).errors, []);
 assert.equal(evaluate(value).ready, false);
});

test('every PH, subtask, readiness check and matching source permits a synthetic candidate; old blocked formal material stays independent', () => {
 const result = evaluate(fixture());
 assert.equal(result.ready, true);
 assert.deepEqual(result.blockers, []);
});

test('a done phase cannot conceal an unfinished or unproven work item', () => {
 const value = fixture();
 phase(value.plan, 'PH35').workItems[0].status = 'pending_acceptance';
 phase(value.plan, 'PH35').workItems[1].evidence = [];
 const result = evaluate(value);
 assert.equal(result.ready, false);
 assert(result.blockers.some(item => item.includes('Unfinished work item for PH35')));
 assert(result.blockers.some(item => item.includes('Missing evidence: PH35-T2')));
});

test('missing phases, duplicate work IDs and unknown statuses cannot shrink the acceptance scope', () => {
 const value = fixture();
 value.plan.tasks = value.plan.tasks.filter(item => item.id !== 'PH34');
 phase(value.plan, 'PH35').workItems[1].id = 'PH35-T1';
 phase(value.plan, 'PH35').workItems[2].status = 'waived';
 const errors = validatePlan(value.plan, value.context.evidencePaths).errors;
 assert(errors.some(item => item.includes('PH00-PH35')));
 assert(errors.some(item => item.includes('duplicate work item')));
 assert(errors.some(item => item.includes('Unknown status')));
});

test('original task status or evidence changes fail the preserved digest', () => {
 const value = fixture();
 value.plan.tasks[0].status = 'done'; value.plan.tasks[0].evidence = [evidence];
 assert(evaluate(value).blockers.includes('Original task digest changed'));
});

test('phase and subtask dependency cycles are rejected even when all involved statuses say done', () => {
 for (const mutation of [
  plan => phase(plan, 'PH00').dependsOn.push('PH35'),
  plan => { const items = phase(plan, 'PH00').workItems; items[0].dependsOn = [items[1].id]; items[1].dependsOn = [items[0].id]; },
 ]) {
  const value = fixture(); mutation(value.plan);
  assert(evaluate(value).blockers.some(item => item.startsWith('Dependency cycle:')));
 }
});

test('unknown and unfinished dependencies cannot be approved by child evidence alone', () => {
 const value = fixture();
 phase(value.plan, 'PH35').dependsOn.push('MISSING');
 phase(value.plan, 'PH35').workItems[0].dependsOn = ['LEGACY-0'];
 const errors = evaluate(value).blockers;
 assert(errors.some(item => item.includes('Unknown task dependency')));
 assert(errors.some(item => item.includes('Unfinished dependency for PH35-T1')));
});

test('an evidence filename is not sufficient unless the filesystem boundary has verified it', () => {
 const value = fixture(); value.context.evidencePaths.clear();
 assert.equal(evaluate(value).ready, false);
 assert(evaluate(value).blockers.some(item => item.includes('Missing or unsafe evidence')));
});

test('real device and visual approvals cannot be omitted, pending, or replaced with empty evidence', () => {
 for (const id of ['realIphonePwa', 'realAndroidPwa', 'realTablet', 'userVisualAcceptance']) {
  const value = fixture(); value.readiness.checks[id].status = 'pending'; value.readiness.checks[id].evidence = [];
  assert.equal(evaluate(value).ready, false);
 }
 const value = fixture(); delete value.readiness.checks.realDesktop;
 assert(evaluate(value).blockers.includes('Expected all ten required readiness checks'));
});

test('readiness cannot unlock modified source or replace required phases with an empty list', () => {
 const value = fixture(); value.context.sourceFingerprint = 'b'.repeat(64);
 value.plan.releasePolicy.requiredPhases = [];
 assert(evaluate(value).blockers.includes('Source fingerprint missing or changed since local acceptance'));
 assert(evaluate(value).blockers.includes('Invalid release policy or required PH list'));
});

test('matching source evidence cannot authorize an uncommitted or unverified working tree', () => {
 for (const clean of [false, undefined]) {
  const value = fixture(); value.context.cleanWorkingTree = clean;
  const result = evaluate(value);
  assert.equal(result.ready, false);
  assert(result.blockers.includes('Release requires a verified clean working tree, including untracked files'));
 }
});

test('the authorized playtest permits only its verified branch without completing any PH or formal gate', () => {
 const value = playtestFixture(), before = structuredClone(value.plan);
 assert.equal(evaluatePreview(value).ready, true);
 assert.equal(evaluate(value).ready, false);
 assert.deepEqual(value.plan, before);
 assert.equal(value.readiness.checks.realIphonePwa.status, 'pending');
 assert.equal(value.readiness.checks.userVisualAcceptance.status, 'pending');
 for (const targetRef of [undefined, 'refs/heads/main', 'refs/tags/v0.6.0', 'refs/heads/codex/other', 'codex/ph06-world-generation']) {
  value.context.targetRef = targetRef; assert.equal(evaluatePreview(value).ready, false);
 }
});

test('playtest rejects absent, pending, unknown and altered authorization or schema', () => {
 for (const mutate of [
  value => { delete value.readiness.playtest; },
  value => { value.readiness.playtest.status = 'pending'; },
  value => { value.readiness.playtest.version = 2; },
  value => { value.readiness.playtest.force = true; },
  value => { value.readiness.playtest.authorizationEvidence = evidence; },
  value => { value.readiness.playtest.branch = 'refs/heads/main'; },
  value => { value.context.evidencePaths.delete(PLAYTEST_AUTHORIZATION); },
 ]) { const value = playtestFixture(); mutate(value); assert.equal(evaluatePreview(value).ready, false); }
});

test('playtest requires actual evidence for all three exact checks, a clean source and every valid plan invariant', () => {
 for (const id of PLAYTEST_CHECKS) {
  for (const mutate of [
   value => { delete value.readiness.playtest.checks[id]; },
   value => { value.readiness.playtest.checks[id].status = 'pending'; },
   value => { value.readiness.playtest.checks[id].evidence = []; },
   value => { value.context.evidencePaths.delete(value.readiness.playtest.checks[id].evidence[0]); },
  ]) { const value = playtestFixture(); mutate(value); assert.equal(evaluatePreview(value).ready, false); }
 }
 for (const mutate of [
  value => { value.readiness.playtest.checks.extra = { status: 'passed', evidence: [evidence] }; },
  value => { value.context.sourceFingerprint = 'b'.repeat(64); },
  value => { value.context.sourceFingerprint = null; },
  value => { value.context.cleanWorkingTree = false; },
  value => { value.context.cleanWorkingTree = undefined; },
  value => { phase(value.plan, 'PH35').status = 'done'; },
  value => { value.plan.tasks[0].status = 'done'; },
  value => { value.plan.releasePolicy.requiredPhases = []; },
 ]) { const value = playtestFixture(); mutate(value); assert.equal(evaluatePreview(value).ready, false); }
});

test('playtest expires at its exact UTC deadline and rejects invalid or normalized dates', () => {
 for (const expiry of [null, 123, {}, '', 'tomorrow', '2026-09-24T00:00:00Z', '2026-09-23T23:59:59Z', '2026-09-25', '2026-09-25T08:00:00+08:00', '2027-02-30T00:00:00Z', '2026-09-25T00:00:00.0000Z']) {
  const value = playtestFixture(); value.readiness.playtest.expiresAt = expiry; assert.equal(evaluatePreview(value).ready, false);
 }
 const value = playtestFixture(); value.context.now = Date.parse(value.readiness.playtest.expiresAt) - 1;
 assert.equal(evaluatePreview(value).ready, true); value.context.now++; assert.equal(evaluatePreview(value).ready, false);
 value.context.now = NaN; assert.equal(evaluatePreview(value).ready, false);
});

test('path boundary rejects outside, absolute, missing, and credential-capable candidates without reading contents', () => {
 for (const reference of ['../CANON.md', 'C:/secrets.txt', 'https://example.com/proof', 'docs/../CANON.md', 'docs/proof.txt:hidden', 'missing-proof.md']) assert.throws(() => safeProjectFile(projectRoot, reference));
 for (const name of ['.npmrc', '.env', 'nested/.netrc', 'saves/player.json', 'world.history.json', 'world.protected.json', 'references/private/source.png', '.wrangler/state.json']) assert.equal(unsafeCandidatePath(name), true);
 assert.equal(unsafeCandidatePath('src/sim/core.ts'), false);
 assert.equal(unsafeCandidatePath('tests/fixtures/legacy-custom-0.1.json'), false);
});

test('fingerprint covers changed, added and removed source, excludes only readiness, and refuses missing tracked files', () => {
 const parent = path.join(projectRoot, '.autopilot');
 fs.mkdirSync(parent, { recursive: true });
 const root = fs.mkdtempSync(path.join(parent, 'release-policy-test-'));
 try {
  execFileSync('git', ['init', '--quiet'], { cwd: root, stdio: 'ignore' });
  assert.equal(workingTreeIsClean(root), true);
  fs.mkdirSync(path.join(root, 'plan')); fs.writeFileSync(path.join(root, 'app.ts'), 'export const value = 1;');
  fs.writeFileSync(path.join(root, 'plan/release-readiness.json'), '{}');
  assert.equal(workingTreeIsClean(root), false);
  const first = createSourceFingerprint(root).sourceFingerprint;
  fs.writeFileSync(path.join(root, 'plan/release-readiness.json'), '{"status":"ready"}');
  assert.equal(createSourceFingerprint(root).sourceFingerprint, first);
  fs.writeFileSync(path.join(root, 'app.ts'), 'export const value = 2;');
  const changed = createSourceFingerprint(root).sourceFingerprint;
  assert.notEqual(changed, first);
  fs.writeFileSync(path.join(root, 'extra.ts'), 'new file');
  assert.notEqual(createSourceFingerprint(root).sourceFingerprint, changed);
  fs.writeFileSync(path.join(root, 'app.ts#variant'), 'different file with hash in name');
  const withHashName = createSourceFingerprint(root).sourceFingerprint;
  fs.writeFileSync(path.join(root, 'app.ts#variant'), 'edited distinct file');
  assert.notEqual(createSourceFingerprint(root).sourceFingerprint, withHashName);
  fs.mkdirSync(path.join(root, 'proofs')); fs.writeFileSync(path.join(root, 'proofs/result.txt'), 'synthetic result');
  fs.symlinkSync(path.join(root, 'proofs'), path.join(root, 'linked-proofs'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => safeProjectFile(root, 'linked-proofs/result.txt'), /Symbolic links/);
  fs.unlinkSync(path.join(root, 'linked-proofs'));
  execFileSync('git', ['add', 'app.ts', 'extra.ts'], { cwd: root, stdio: 'ignore' });
  fs.unlinkSync(path.join(root, 'extra.ts'));
  assert.throws(() => createSourceFingerprint(root), /ENOENT/);
  assert.throws(() => verifyGitRoot(root, projectRoot), /Git root/);
 } finally {
  const target = fs.realpathSync(root);
  assert(target.startsWith(`${fs.realpathSync(parent)}${path.sep}release-policy-test-`));
  fs.rmSync(target, { recursive: true, force: false });
 }
});

test('CLI enforces defaults and actual target refs using an independent locked fixture', () => withGitFixture(root => {
 const value = playtestFixture(); value.readiness.playtest.expiresAt = new Date(Date.now() + 60_000).toISOString();
 writeFixture(root, value); value.readiness.playtest.sourceFingerprint = createSourceFingerprint(root).sourceFingerprint;
 fs.writeFileSync(path.join(root, 'plan/release-readiness.json'), JSON.stringify(value.readiness)); commitFixture(root);
 const script = path.join(root, 'scripts/check-release.mjs');
 const run = (args, cwd = root) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
 const enforce = run([]); assert.equal(enforce.status, 1, enforce.stderr); assert.equal(JSON.parse(enforce.stdout).ready, false);
 const report = run(['--status']); assert.equal(report.status, 0, report.stderr); assert.equal(JSON.parse(report.stdout).mode, 'report-only'); assert.equal(JSON.parse(report.stdout).ready, false);
 const allowed = run(['--target-ref', PLAYTEST_BRANCH]); assert.equal(allowed.status, 0, allowed.stderr + allowed.stdout); assert.equal(JSON.parse(allowed.stdout).gate, 'authorized-playtest'); assert.equal(JSON.parse(allowed.stdout).formalReady, false);
 for (const args of [['--force'], ['--target-ref'], ['--target-ref', 'refs/heads/main'], ['--target-ref', 'refs/heads/other'], ['--target-ref', 'refs/tags/v0.6.0'], ['--target-ref', PLAYTEST_BRANCH, '--target-ref', PLAYTEST_BRANCH], ['--status', '--status']]) assert.equal(run(args).status, 1);
 assert.equal(run(['--status'], path.join(root, 'docs')).status, 1);
 fs.writeFileSync(path.join(root, 'app.ts'), 'export const example = 2;');
 assert.equal(run(['--target-ref', PLAYTEST_BRANCH]).status, 1);
 commitFixture(root); assert.equal(run(['--target-ref', PLAYTEST_BRANCH]).status, 1);
}));

test('only reviewed root npm settings bytes are permitted, remain fingerprinted, and nested or altered configs fail closed', () => withGitFixture(root => {
 fs.writeFileSync(path.join(root, 'app.ts'), 'source');
 const baseline = createSourceFingerprint(root).sourceFingerprint;
 fs.writeFileSync(path.join(root, '.npmrc'), 'save-exact=true\nengine-strict=true\n');
 assert.equal(unsafeCandidatePath('.npmrc'), true); assert.equal(reviewedProjectConfig(root, '.npmrc'), true);
 assert.notEqual(createSourceFingerprint(root).sourceFingerprint, baseline);
 fs.mkdirSync(path.join(root, 'nested')); fs.writeFileSync(path.join(root, 'nested/.npmrc'), 'save-exact=true\nengine-strict=true\n');
 assert.equal(reviewedProjectConfig(root, 'nested/.npmrc'), false); assert.throws(() => createSourceFingerprint(root), /private-content review/);
 fs.unlinkSync(path.join(root, 'nested/.npmrc'));
 fs.writeFileSync(path.join(root, '.npmrc'), 'save-exact=false\nengine-strict=true\n');
 assert.equal(reviewedProjectConfig(root, '.npmrc'), false); assert.throws(() => createSourceFingerprint(root), /private-content review/);
}));

test('archived log review permits only listed bytes in the two reviewed directories and fingerprints its registry', () => withGitFixture(root => {
 const reference = 'docs/evidence/ph04/synthetic/result.log', contents = 'Synthetic checked test result.\n';
 fs.mkdirSync(path.dirname(path.join(root, reference)), { recursive: true }); fs.writeFileSync(path.join(root, reference), contents);
 fs.mkdirSync(path.join(root, 'plan')); const registry = path.join(root, 'plan/reviewed-evidence-files.json');
 const digest = createHash('sha256').update(contents).digest('hex');
 const write = files => fs.writeFileSync(registry, JSON.stringify({ version: 1, files }));
 assert.equal(reviewedEvidenceFile(root, reference), false); assert.throws(() => createSourceFingerprint(root), /private-content review/);
 write([{ path: reference, sha256: digest }]);
 assert.equal(unsafeCandidatePath(reference), true); assert.equal(reviewedEvidenceFile(root, reference), true);
 const fingerprint = createSourceFingerprint(root).sourceFingerprint;
 fs.appendFileSync(registry, '\n'); assert.notEqual(createSourceFingerprint(root).sourceFingerprint, fingerprint);
 fs.appendFileSync(path.join(root, reference), 'later modification');
 assert.equal(reviewedEvidenceFile(root, reference), false); assert.throws(() => createSourceFingerprint(root), /private-content review/);
 fs.writeFileSync(path.join(root, reference), contents);
 const unlisted = 'docs/evidence/ph04/synthetic/new.log'; fs.writeFileSync(path.join(root, unlisted), contents);
 assert.equal(reviewedEvidenceFile(root, unlisted), false); assert.throws(() => createSourceFingerprint(root), /private-content review/);
 fs.unlinkSync(path.join(root, unlisted));
 const outside = 'docs/unreviewed.log'; fs.writeFileSync(path.join(root, outside), contents); write([{ path: outside, sha256: digest }, { path: reference, sha256: digest }]);
 assert.equal(reviewedEvidenceFile(root, outside), false); assert.equal(reviewedEvidenceFile(root, reference), false); assert.throws(() => createSourceFingerprint(root), /private-content review/);
 fs.unlinkSync(path.join(root, outside));
 write([{ path: reference, sha256: digest }, { path: reference, sha256: digest }]); assert.equal(reviewedEvidenceFile(root, reference), false);
 write([{ path: reference, sha256: digest }]);
 fs.symlinkSync(path.dirname(path.join(root, reference)), path.join(root, 'docs/evidence/ph04/linked'), process.platform === 'win32' ? 'junction' : 'dir');
 const linked = 'docs/evidence/ph04/linked/result.log'; write([{ path: linked, sha256: digest }]); assert.equal(reviewedEvidenceFile(root, linked), false);
 fs.unlinkSync(path.join(root, 'docs/evidence/ph04/linked'));
}));

test('filesystem evidence deletion cannot satisfy the preview gate even with a clean matching fingerprint', () => withGitFixture(root => {
 const value = playtestFixture(); writeFixture(root, value);
 fs.unlinkSync(path.join(root, 'docs/evidence/playtest-coreBrowser.md'));
 value.readiness.playtest.sourceFingerprint = createSourceFingerprint(root).sourceFingerprint;
 fs.writeFileSync(path.join(root, 'plan/release-readiness.json'), JSON.stringify(value.readiness)); commitFixture(root);
 const result = inspectRelease(root, { targetRef: PLAYTEST_BRANCH, now: value.context.now });
 assert.equal(result.ready, false); assert(result.blockers.some(message => message.includes('Missing or unsafe evidence for playtest coreBrowser')));
}));

test('pre-push binds exactly accepted HEAD to the actual authorized remote ref and original repository', () => withGitFixture(root => {
 const value = playtestFixture(); value.readiness.playtest.expiresAt = new Date(Date.now() + 60_000).toISOString(); writeFixture(root, value);
 fs.mkdirSync(path.join(root, '.githooks')); const hook = path.join(root, '.githooks/pre-push'); fs.copyFileSync(path.join(projectRoot, '.githooks/pre-push'), hook);
 value.readiness.playtest.sourceFingerprint = createSourceFingerprint(root).sourceFingerprint;
 fs.writeFileSync(path.join(root, 'plan/release-readiness.json'), JSON.stringify(value.readiness)); commitFixture(root);
 const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), zero = '0'.repeat(40);
 const gitExec = execFileSync('git', ['--exec-path'], { cwd: root, encoding: 'utf8' }).trim();
 const shell = process.platform === 'win32' ? path.resolve(gitExec, '../../..', 'bin/sh.exe') : '/bin/sh';
 const push = (lines, remote = 'https://github.com/Ethanhui6/lieguoji-web.git') => spawnSync(shell, [hook, 'origin', remote], { cwd: root, input: lines, encoding: 'utf8' });
 const line = `refs/heads/local ${head} ${PLAYTEST_BRANCH} ${zero}\n`;
 const accepted = push(line); assert.equal(accepted.status, 0, accepted.error?.message ?? accepted.stderr + accepted.stdout);
 for (const input of ['', line + line, `refs/heads/local ${zero} ${PLAYTEST_BRANCH} ${head}\n`, `refs/heads/local ${head} refs/heads/main ${zero}\n`, `refs/heads/local ${head} refs/tags/v0.6.0 ${zero}\n`]) assert.equal(push(input).status, 1);
 assert.equal(push(line, 'https://github.com/someone/other.git').status, 1);
 assert.equal(push(line, root).status, 1);
}));
