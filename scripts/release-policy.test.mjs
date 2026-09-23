import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { PHASE_IDS, READINESS_CHECKS, originalTaskDigest, validatePlan, evaluateRelease } from './release-policy.mjs';
import { projectRoot, safeProjectFile, verifyGitRoot } from './check-plan.mjs';
import { createSourceFingerprint, unsafeCandidatePath, workingTreeIsClean } from './check-release.mjs';

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

test('path boundary rejects outside, absolute, missing, and credential-capable candidates without reading contents', () => {
 for (const reference of ['../CANON.md', 'C:/secrets.txt', 'https://example.com/proof', 'docs/../CANON.md', 'docs/proof.txt:hidden', 'missing-proof.md']) assert.throws(() => safeProjectFile(projectRoot, reference));
 for (const name of ['.npmrc', '.env', 'nested/.netrc', 'saves/player.json', 'world.history.json', 'references/private/source.png', '.wrangler/state.json']) assert.equal(unsafeCandidatePath(name), true);
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

test('CLI enforces by default, reports without authorizing, rejects bypass flags and wrong working directories', () => {
 const script = path.join(projectRoot, 'scripts/check-release.mjs');
 const run = (args, cwd = projectRoot) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
 const enforce = run([]); assert.equal(enforce.status, 1); assert.equal(JSON.parse(enforce.stdout).ready, false);
 const report = run(['--status']); assert.equal(report.status, 0); assert.equal(JSON.parse(report.stdout).mode, 'report-only'); assert.equal(JSON.parse(report.stdout).ready, false);
 assert.equal(run(['--force']).status, 1);
 assert.equal(run(['--status'], path.join(projectRoot, 'docs')).status, 1);
});
