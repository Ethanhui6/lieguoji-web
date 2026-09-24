import { createHash } from 'node:crypto';

export const PHASE_IDS = Object.freeze(Array.from({ length: 36 }, (_, index) => `PH${String(index).padStart(2, '0')}`));
export const READINESS_CHECKS = Object.freeze([
 'localFullRegression', 'performanceAndLongRun', 'saveAndLegacyCompatibility', 'privateContentAndLicenses',
 'realIphonePwa', 'realAndroidPwa', 'realDesktop', 'realTablet', 'continuousTouchRegression', 'userVisualAcceptance',
]);
export const PLAYTEST_BRANCH = 'refs/heads/codex/ph06-world-generation';
export const PLAYTEST_AUTHORIZATION = 'docs/PLAYTEST_RELEASE_2026-09-24.md';
export const PLAYTEST_CHECKS = Object.freeze(['localBuild', 'coreBrowser', 'sourcePrivacy']);
const STATUSES = new Set(['todo', 'in_progress', 'blocked', 'done', 'pending_acceptance']);
const sameList = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
const text = value => typeof value === 'string' && value.trim().length > 0;
const hash = value => createHash('sha256').update(value).digest('hex');

export function originalTaskDigest(tasks) {
 return hash(JSON.stringify(tasks.filter(task => !PHASE_IDS.includes(task?.id))));
}

function checkEvidence(owner, evidence, required, evidencePaths, errors) {
 if (!Array.isArray(evidence) || (required && !evidence.length)) { errors.push(`Missing evidence: ${owner}`); return; }
 for (const reference of evidence) if (!text(reference) || !evidencePaths.has(reference)) errors.push(`Missing or unsafe evidence for ${owner}: ${String(reference)}`);
}

function checkDag(nodes, errors) {
 const state = new Map();
 const visit = (id, trail) => {
  if (state.get(id) === 2 || !nodes.has(id)) return;
  if (state.get(id) === 1) { errors.push(`Dependency cycle: ${[...trail, id].join(' -> ')}`); return; }
  state.set(id, 1);
  for (const dependency of nodes.get(id)) visit(dependency, [...trail, id]);
  state.set(id, 2);
 };
 for (const id of nodes.keys()) visit(id, []);
}

export function validatePlan(plan, evidencePaths = new Set()) {
 const errors = [];
 if (!plan || !Array.isArray(plan.tasks)) return { errors: ['Missing task array'], phaseCount: 0, workItemCount: 0, originalTaskCount: 0 };
 const tasks = plan.tasks;
 const byId = new Map();
 for (const task of tasks) {
  if (!task || !text(task.id)) { errors.push('Invalid task ID'); continue; }
  if (byId.has(task.id)) errors.push(`Duplicate task ID: ${task.id}`);
  byId.set(task.id, task);
 }
 const phases = tasks.filter(task => PHASE_IDS.includes(task?.id));
 const original = tasks.filter(task => !PHASE_IDS.includes(task?.id));
 const programme = plan.programme ?? {};
 if (plan.originalPlanPresent !== false) errors.push('Original plan provenance changed');
 if (programme.originalTaskCount !== 25 || original.length !== 25) errors.push('Expected the preserved original 25 tasks');
 if (programme.originalTaskDigest !== originalTaskDigest(tasks)) errors.push('Original task digest changed');
 if (!sameList(programme.phaseIds, PHASE_IDS) || phases.length !== 36 || PHASE_IDS.some(id => !byId.has(id))) errors.push('Expected every PH00-PH35 exactly once');
 if (programme.subtaskCount !== 144) errors.push('Expected programme.subtaskCount=144');
 for (const [id, mapped] of Object.entries(programme.legacyMapping ?? {})) {
  if (!original.some(task => task.id === id) || !Array.isArray(mapped) || mapped.some(phase => !PHASE_IDS.includes(phase))) errors.push(`Invalid legacy mapping: ${id}`);
 }
 const allItems = new Map(byId);
 let workItemCount = 0;
 for (const phase of phases) {
  if (phase.phase !== phase.id || !Array.isArray(phase.workItems) || phase.workItems.length !== 4) { errors.push(`Expected four work items and matching phase: ${phase.id}`); continue; }
  for (let index = 0; index < phase.workItems.length; index++) {
   const item = phase.workItems[index];
   workItemCount++;
   if (!item || item.id !== `${phase.id}-T${index + 1}` || allItems.has(item.id)) { errors.push(`Invalid or duplicate work item: ${phase.id}-T${index + 1}`); continue; }
   allItems.set(item.id, item);
  }
 }
 if (workItemCount !== 144) errors.push('Expected exactly 144 PH work items');
 const nodes = new Map();
 for (const task of byId.values()) {
  if (!STATUSES.has(task.status)) errors.push(`Unknown status: ${task.id}`);
  if (!text(task.acceptance) || !Array.isArray(task.dependsOn)) errors.push(`Missing acceptance/dependencies: ${task.id}`);
  const dependencies = Array.isArray(task.dependsOn) ? task.dependsOn : [];
  for (const dependency of dependencies) if (!byId.has(dependency)) errors.push(`Unknown task dependency: ${task.id} -> ${dependency}`);
  if (task.status === 'done' && dependencies.some(id => byId.get(id)?.status !== 'done')) errors.push(`Unfinished dependency for ${task.id}`);
  checkEvidence(task.id, task.evidence, task.status === 'done', evidencePaths, errors);
  const items = PHASE_IDS.includes(task.id) && Array.isArray(task.workItems) ? task.workItems : [];
  nodes.set(task.id, [...dependencies, ...items.map(item => item?.id).filter(Boolean)]);
  for (const item of items) {
   if (!item || !text(item.id)) continue;
   if (!STATUSES.has(item.status)) errors.push(`Unknown status: ${item.id}`);
   if (!text(item.acceptance)) errors.push(`Missing acceptance: ${item.id}`);
   if (item.dependsOn !== undefined && !Array.isArray(item.dependsOn)) errors.push(`Invalid work item dependencies: ${item.id}`);
   const itemDependencies = Array.isArray(item.dependsOn) ? item.dependsOn : [];
   for (const dependency of itemDependencies) if (!allItems.has(dependency)) errors.push(`Unknown work item dependency: ${item.id} -> ${dependency}`);
   const effectiveDependencies = [...dependencies, ...itemDependencies];
   nodes.set(item.id, effectiveDependencies);
   if (item.status === 'done' && effectiveDependencies.some(id => allItems.get(id)?.status !== 'done')) errors.push(`Unfinished dependency for ${item.id}`);
   checkEvidence(item.id, item.evidence, item.status === 'done', evidencePaths, errors);
  }
  if (task.status === 'done' && items.some(item => item?.status !== 'done')) errors.push(`Unfinished work item for ${task.id}`);
 }
 checkDag(nodes, errors);
 const policy = plan.releasePolicy ?? {};
 if (policy.version !== 1 || policy.mode !== 'local_only_until_all_ph_accepted' || !sameList(policy.requiredPhases, PHASE_IDS)) errors.push('Invalid release policy or required PH list');
 if (!['locked', 'ready'].includes(policy.state) || typeof policy.cloudWritesAllowed !== 'boolean' || (policy.state === 'locked' && policy.cloudWritesAllowed)) errors.push('Inconsistent release policy state');
 if (policy.readinessFile !== 'plan/release-readiness.json') errors.push('Unexpected readiness file');
 return { errors: [...new Set(errors)], phaseCount: phases.length, workItemCount, originalTaskCount: original.length };
}

export function evaluateRelease(plan, readiness, context = {}) {
 const validation = validatePlan(plan, context.evidencePaths ?? new Set());
 const blockers = [...validation.errors];
 const incomplete = PHASE_IDS.filter(id => plan?.tasks?.find(task => task.id === id)?.status !== 'done');
 if (incomplete.length) blockers.push(`PH not accepted: ${incomplete.join(', ')}`);
 if (plan?.releasePolicy?.state !== 'ready' || plan?.releasePolicy?.cloudWritesAllowed !== true) blockers.push('Cloud writes and release packaging remain locked');
 if (readiness?.version !== 1 || readiness?.status !== 'ready') blockers.push('Local release readiness is not ready');
 if (!readiness?.checks || !sameList(Object.keys(readiness.checks).sort(), [...READINESS_CHECKS].sort())) blockers.push('Expected all ten required readiness checks');
 for (const id of READINESS_CHECKS) {
  const check = readiness?.checks?.[id];
  if (check?.status !== 'passed') blockers.push(`Readiness check not passed: ${id}`);
  checkEvidence(id, check?.evidence, true, context.evidencePaths ?? new Set(), blockers);
 }
 if (!/^[a-f0-9]{64}$/.test(context.sourceFingerprint ?? '')) blockers.push('Current source fingerprint unavailable');
 if (!/^[a-f0-9]{64}$/.test(readiness?.sourceFingerprint ?? '') || readiness.sourceFingerprint !== context.sourceFingerprint) blockers.push('Source fingerprint missing or changed since local acceptance');
 if (context.cleanWorkingTree !== true) blockers.push('Release requires a verified clean working tree, including untracked files');
 return { ready: blockers.length === 0, blockers: [...new Set(blockers)], ...validation };
}

/** This single authorized preview does not complete any PH or formal device gate. */
export function evaluatePlaytest(plan, readiness, context = {}) {
 const validation = validatePlan(plan, context.evidencePaths ?? new Set());
 const blockers = [...validation.errors], candidate = readiness?.playtest;
 const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && sameList(Object.keys(value).sort(), [...keys].sort());
 if (!exact(candidate, ['version', 'status', 'authorizationEvidence', 'sourceFingerprint', 'branch', 'expiresAt', 'checks']) || candidate?.version !== 1 || candidate?.status !== 'ready') blockers.push('Authorized playtest readiness is not ready or has an unknown format');
 if (candidate?.branch !== PLAYTEST_BRANCH || context.targetRef !== PLAYTEST_BRANCH) blockers.push(`Playtest permits only ${PLAYTEST_BRANCH}`);
 if (candidate?.authorizationEvidence !== PLAYTEST_AUTHORIZATION) blockers.push('Playtest authorization must match the explicit 2026-09-24 request');
 checkEvidence('playtest authorization', [candidate?.authorizationEvidence], true, context.evidencePaths ?? new Set(), blockers);
 const expiry = candidate?.expiresAt, now = context.now ?? Date.now();
 const expires = typeof expiry === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expiry) ? Date.parse(expiry) : NaN;
 const normalized = Number.isFinite(expires) ? new Date(expires).toISOString().replace('.000Z', 'Z') : null;
 if (!Number.isFinite(now) || !Number.isFinite(expires) || typeof expiry !== 'string' || normalized !== expiry.replace('.000Z', 'Z') || expires <= now) blockers.push('Playtest authorization has expired or lacks a valid UTC expiry');
 if (!exact(candidate?.checks, PLAYTEST_CHECKS)) blockers.push('Expected exactly the three playtest readiness checks');
 for (const id of PLAYTEST_CHECKS) {
  const check = candidate?.checks?.[id];
  if (!exact(check, ['status', 'evidence']) || check?.status !== 'passed') blockers.push(`Playtest check not passed: ${id}`);
  checkEvidence(`playtest ${id}`, check?.evidence, true, context.evidencePaths ?? new Set(), blockers);
 }
 if (!/^[a-f0-9]{64}$/.test(context.sourceFingerprint ?? '')) blockers.push('Current source fingerprint unavailable');
 if (!/^[a-f0-9]{64}$/.test(candidate?.sourceFingerprint ?? '') || candidate.sourceFingerprint !== context.sourceFingerprint) blockers.push('Playtest source fingerprint missing or changed since local acceptance');
 if (context.cleanWorkingTree !== true) blockers.push('Playtest requires a verified clean working tree, including untracked files');
 return { ready: blockers.length === 0, blockers: [...new Set(blockers)], ...validation };
}
