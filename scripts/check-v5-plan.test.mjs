import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { V5_PHASE_IDS, validateV5Plan, v5EvidenceReferences } from './check-v5-plan.mjs';
import { collectEvidencePaths, evidenceReferences, projectRoot } from './check-plan.mjs';
import { evaluateRelease, validatePlan } from './release-policy.mjs';

const evidence = 'docs/evidence/v5-synthetic.md';
const physicalEvidence = 'docs/evidence/v5-physical-synthetic.md';
const visualEvidence = 'docs/evidence/v5-visual-synthetic.md';
const allEvidence = () => new Set(['CODEX_AUTOPILOT_V5.md', 'docs/FMS_WEB_REBUILD_PLAN.md', evidence, physicalEvidence, visualEvidence]);

function fixture() {
  return {
    releasePolicy: { state: 'locked', cloudWritesAllowed: false },
    webRebuild: {
      version: 'V5', active: true, status: 'in_progress', source: 'CODEX_AUTOPILOT_V5.md', roadmap: 'docs/FMS_WEB_REBUILD_PLAN.md',
      currentPhaseId: 'WEB-PH00', supersedes: { legacyStatusesRetained: true, releasePolicyUnchanged: true },
      release: { mode: 'local_only', cloudWritesAllowed: false, existingGateRetained: true, phaseRenameDoesNotUnlock: true, finalRequirementReconciliationRequired: true },
      evidence: [evidence], nextBatch: ['WEB-00-02', 'WEB-00-03'],
      firstPlayableGate: { phaseId: 'WEB-PH02', status: 'not_run', physicalDevice: 'not_run', mobileEmulation: 'not_run', userVisualAcceptance: 'pending' },
      phases: V5_PHASE_IDS.map((id, index) => ({
        id, status: index ? 'todo' : 'in_progress', dependsOn: index ? [V5_PHASE_IDS[index - 1]] : [], acceptance: 'Synthetic phase requirement', evidence: [],
        workItems: index > 2 ? [] : [1, 2, 3].map(item => ({
          id: `WEB-${String(index).padStart(2, '0')}-${String(item).padStart(2, '0')}`,
          status: index ? 'todo' : item === 1 || item === 3 ? 'done' : 'in_progress',
          dependsOn: index === 0 && item > 1 ? ['WEB-00-01'] : [],
          acceptance: 'Synthetic bounded contract', evidence: index ? [] : [evidence],
        })),
      })),
    },
  };
}
const errors = (plan, refs = allEvidence()) => validateV5Plan(plan, refs).errors;
const matches = (plan, pattern, refs) => assert(errors(plan, refs).some(message => pattern.test(message)), errors(plan, refs).join('\n'));

function acceptGate(plan) {
  Object.assign(plan.webRebuild.firstPlayableGate, {
    status: 'passed', physicalDevice: 'passed', userVisualAcceptance: 'accepted',
    physicalDeviceRecord: { kind: 'physical-device', confirmedBy: 'user', device: 'iPhone 13 Pro Max', osVersion: 'iOS 27 test fixture', browsers: ['Safari', 'Chrome'], evidence: [physicalEvidence] },
    userVisualRecord: { kind: 'user-visual', confirmedBy: 'user', evidence: [visualEvidence] },
  });
}
function completeThrough(plan, last) {
  for (const phase of plan.webRebuild.phases.slice(0, last + 1)) {
    phase.status = 'done'; phase.evidence = [evidence];
    for (const item of phase.workItems) { item.status = 'done'; item.evidence = [evidence]; }
  }
}

function gameplayFixture() {
  const p = fixture(); completeThrough(p, 1); p.webRebuild.phases[2].status = 'in_progress';
  p.webRebuild.phases[3].status = 'in_progress'; p.webRebuild.currentPhaseId = 'WEB-PH03'; p.webRebuild.nextBatch = ['WEB-PH03'];
  p.webRebuild.localDevelopmentException = { kind:'user-authorized-gameplay-first', confirmedBy:'user', date:'2026-10-05', scope:'local-development-only', allowedPhaseIds:['WEB-PH03','WEB-PH04'], deferredPhaseIds:['WEB-PH02'], deferredPhaseDependencies:[{phaseId:'WEB-PH03',dependencyId:'WEB-PH02'}], acceptanceClaimsUnchanged:true, releasePolicyUnchanged:true, evidence:[evidence] };
  return p;
}
test('user local gameplay priority preserves acceptance and cloud locks', () => {
  const p = gameplayFixture(), gate = structuredClone(p.webRebuild.firstPlayableGate);
  assert.deepEqual(errors(p), []); assert.deepEqual(p.webRebuild.firstPlayableGate, gate);
  assert(v5EvidenceReferences(p).includes(evidence));
  p.webRebuild.release.cloudWritesAllowed = true; matches(p, /local-only/);
});
test('invalid or unsupported exception cannot open later phases', () => {
  for (const mutation of [p => { delete p.webRebuild.localDevelopmentException; },p => {p.webRebuild.localDevelopmentException.confirmedBy='assistant';},p => {p.webRebuild.localDevelopmentException.evidence=['../outside.md'];},p => {p.webRebuild.localDevelopmentException.allowedPhaseIds.push('WEB-PH05');}]) {
    const p = gameplayFixture(); mutation(p); matches(p,/First playable gate blocks/);
  }
  for(const i of [5,6,7]) {const p=gameplayFixture();p.webRebuild.phases[i].status='in_progress';matches(p,/First playable gate blocks/);}
});
test('phase deferral never waives explicit task prerequisites or cycles', () => {
  const p = gameplayFixture(), phase = p.webRebuild.phases[3];
  phase.workItems=[{id:'WEB-03-01',status:'in_progress',dependsOn:['WEB-02-01'],acceptance:'real prerequisite',evidence:[]}];
  matches(p,/Unfinished dependency.*WEB-03-01/);
  phase.workItems[0].dependsOn=[]; assert.deepEqual(errors(p),[]);
  p.webRebuild.phases[2].dependsOn.push('WEB-PH03');matches(p,/Dependency cycle/);
});
test('deferral does not grant complete phases or forged phone acceptance', () => {
  const p = gameplayFixture(); p.webRebuild.phases[3].status='done';p.webRebuild.phases[3].evidence=[evidence];matches(p,/First playable gate blocks/);
  const q=gameplayFixture();q.webRebuild.firstPlayableGate.status='passed';matches(q,/requires both/);
  q.webRebuild.phases[4].status='in_progress';matches(q,/single active/);matches(q,/Unfinished dependency/);
});

test('a completed numeric contract does not claim completed references, UI, or the first experience gate', () => {
  const plan = fixture();
  const before = structuredClone(plan);
  assert.deepEqual(errors(plan), []);
  assert.deepEqual(plan, before);
  assert.equal(plan.webRebuild.phases[0].workItems[1].status, 'in_progress');
  assert.equal(plan.webRebuild.firstPlayableGate.status, 'not_run');
});

test('active items must have completed declared and inherited phase dependencies', () => {
  const plan = fixture();
  plan.webRebuild.phases[0].workItems[2].dependsOn = ['WEB-00-02'];
  matches(plan, /Unfinished dependency.*WEB-00-03/);
  const next = fixture();
  next.webRebuild.phases[1].workItems[0].status = 'in_progress';
  matches(next, /Unfinished dependency.*WEB-01-01/);
  matches(next, /inactive parent/);
});

test('missing dependencies, parent mismatches, duplicates, and dependency cycles fail', () => {
  const plan = fixture();
  plan.webRebuild.phases[0].workItems[0].dependsOn = ['WEB-00-03', 'WEB-99-99'];
  matches(plan, /Unknown dependency/);
  matches(plan, /Dependency cycle/);
  const duplicate = fixture();
  duplicate.webRebuild.phases[1].workItems[0].id = 'WEB-00-01';
  matches(duplicate, /Duplicate ID/);
  matches(duplicate, /does not match parent/);
});

test('done items cannot use absent or unsafe evidence', () => {
  const plan = fixture();
  const refs = allEvidence(); refs.delete(evidence);
  matches(plan, /Missing or unsafe evidence.*WEB-00-03/, refs);
  plan.webRebuild.phases[0].workItems[2].evidence = ['../other-project/result.md'];
  refs.add('../other-project/result.md');
  matches(plan, /Missing or unsafe evidence.*WEB-00-03/, refs);
});

test('current phase and next batch cannot silently revert to V4 identifiers', () => {
  const plan = fixture(); plan.webRebuild.currentPhaseId = 'PH06';
  matches(plan, /currentPhaseId/);
  plan.webRebuild.nextBatch = ['PH10'];
  matches(plan, /nextBatch/);
});

test('phase completion cannot conceal unfinished work or pending phone acceptance', () => {
  const plan = fixture(); plan.webRebuild.phases[0].status = 'done';
  matches(plan, /Unfinished child/);
  const gate = fixture(); completeThrough(gate, 2);
  matches(gate, /WEB-PH02 experience acceptance is not complete/);
});

test('later systems remain blocked even if their declared dependency was removed', () => {
  const plan = fixture();
  plan.webRebuild.phases[0].status = 'blocked';
  plan.webRebuild.phases[3].status = 'in_progress';
  plan.webRebuild.phases[3].dependsOn = [];
  plan.webRebuild.currentPhaseId = 'WEB-PH03';
  matches(plan, /First playable gate blocks expansion: WEB-PH03/);
});

test('mobile emulation cannot pass the physical device gate or replace user acceptance', () => {
  const plan = fixture();
  plan.webRebuild.firstPlayableGate.mobileEmulation = 'passed';
  plan.webRebuild.firstPlayableGate.status = 'passed';
  matches(plan, /requires both physical device pass and user visual acceptance/);
  acceptGate(plan);
  plan.webRebuild.firstPlayableGate.physicalDeviceRecord.kind = 'mobile-emulation';
  matches(plan, /emulation cannot substitute/);
  plan.webRebuild.firstPlayableGate.physicalDeviceRecord.kind = 'physical-device';
  plan.webRebuild.firstPlayableGate.userVisualRecord.confirmedBy = 'assistant';
  matches(plan, /explicit user acceptance record/);
});

test('physical and visual acceptance require their own existing evidence and both phone browsers', () => {
  const plan = fixture(); acceptGate(plan);
  const refs = allEvidence(); refs.delete(physicalEvidence);
  matches(plan, /Missing or unsafe evidence for first playable physical device/, refs);
  plan.webRebuild.firstPlayableGate.physicalDeviceRecord.browsers = ['Safari'];
  matches(plan, /physical iPhone record for Safari and Chrome/);
  plan.webRebuild.firstPlayableGate.userVisualRecord.evidence = [];
  matches(plan, /Missing evidence: first playable user visual acceptance/);
});

test('valid documented acceptance permits the next V5 phase but keeps local-only rights', () => {
  const plan = fixture(); completeThrough(plan, 2); acceptGate(plan);
  plan.webRebuild.phases[3].status = 'in_progress'; plan.webRebuild.currentPhaseId = 'WEB-PH03'; plan.webRebuild.nextBatch = ['WEB-PH03'];
  assert.deepEqual(errors(plan), []);
  assert(v5EvidenceReferences(plan).includes(physicalEvidence));
  assert(v5EvidenceReferences(plan).includes(visualEvidence));
  plan.webRebuild.release.cloudWritesAllowed = true;
  matches(plan, /local-only release constraints changed/);
});

test('all V5 stages done do not mutate or unlock the real historical release gate', () => {
  const plan = JSON.parse(fs.readFileSync(new URL('../plan/tasks.json', import.meta.url), 'utf8'));
  const originalTasks = JSON.stringify(plan.tasks);
  const originalRelease = JSON.stringify(plan.releasePolicy);
  completeThrough(plan, 7); acceptGate(plan);
  plan.webRebuild.status = 'done'; plan.webRebuild.currentPhaseId = 'WEB-PH07'; plan.webRebuild.nextBatch = [];
  const refs = new Set([...collectEvidencePaths(projectRoot, [...evidenceReferences(plan), ...v5EvidenceReferences(plan)]), ...allEvidence()]);
  assert.deepEqual(validateV5Plan(plan, refs).errors, []);
  assert.deepEqual(validatePlan(plan, refs).errors, []);
  assert.equal(evaluateRelease(plan, { version: 1, status: 'not_ready' }, { evidencePaths: refs }).ready, false);
  assert.equal(JSON.stringify(plan.tasks), originalTasks);
  assert.equal(JSON.stringify(plan.releasePolicy), originalRelease);
  plan.releasePolicy.state = 'ready'; plan.releasePolicy.cloudWritesAllowed = true;
  matches(plan, /existing release lock must remain locked/, refs);
});
