export const V5_PHASE_IDS = Object.freeze(Array.from({ length: 8 }, (_, index) => `WEB-PH${String(index).padStart(2, '0')}`));
const STATUSES = new Set(['todo', 'in_progress', 'blocked', 'done', 'pending_acceptance']);
const STARTED = new Set(['in_progress', 'pending_acceptance', 'done']);
const ACTIVE = new Set(['in_progress', 'pending_acceptance', 'blocked']);
const text = value => typeof value === 'string' && value.trim().length > 0;
const safeReference = value => text(value) && !value.includes('\\') && !value.includes('\0')
  && !value.includes(':') && value.split('#')[0].split('/').every(part => part && part !== '.' && part !== '..');

/** References are resolved by check-plan's existing safeProjectFile boundary. */
export function v5EvidenceReferences(plan) {
  const web = plan?.webRebuild;
  if (!web) return [];
  const refs = [web.source, web.roadmap];
  const add = owner => { if (Array.isArray(owner?.evidence)) refs.push(...owner.evidence); };
  add(web);
  add(web.localDevelopmentException);
  for (const phase of Array.isArray(web.phases) ? web.phases : []) {
    add(phase);
    for (const item of Array.isArray(phase?.workItems) ? phase.workItems : []) add(item);
  }
  add(web.firstPlayableGate?.physicalDeviceRecord);
  add(web.firstPlayableGate?.userVisualRecord);
  return [...new Set(refs.filter(reference => typeof reference === 'string'))];
}

/** Pure structural/evidence-reference validation; never grants release rights. */
export function validateV5Plan(plan, evidencePaths = new Set()) {
  const errors = [];
  const fail = message => errors.push(`V5: ${message}`);
  const web = plan?.webRebuild;
  if (!web || web.version !== 'V5' || web.active !== true) {
    return { errors: ['V5: Missing active webRebuild V5 execution track'], phaseCount: 0, workItemCount: 0 };
  }
  const evidence = (owner, refs, required) => {
    if (!Array.isArray(refs) || (required && refs.length === 0)) {
      fail(`Missing evidence: ${owner}`);
      return;
    }
    for (const reference of refs) {
      if (!safeReference(reference) || !evidencePaths.has(reference)) fail(`Missing or unsafe evidence for ${owner}: ${String(reference)}`);
    }
  };
  if (web.source !== 'CODEX_AUTOPILOT_V5.md' || web.roadmap !== 'docs/FMS_WEB_REBUILD_PLAN.md') fail('Unexpected active instruction or roadmap');
  evidence('execution documents', [web.source, web.roadmap], true);
  evidence('webRebuild', web.evidence, true);
  if (!STATUSES.has(web.status)) fail('Unknown execution status');
  if (web.supersedes?.legacyStatusesRetained !== true || web.supersedes?.releasePolicyUnchanged !== true) fail('Historical statuses and release policy must be retained');
  const release = web.release;
  if (release?.mode !== 'local_only' || release.cloudWritesAllowed !== false
    || release.existingGateRetained !== true || release.phaseRenameDoesNotUnlock !== true
    || release.finalRequirementReconciliationRequired !== true) fail('V5 local-only release constraints changed');
  if (plan.releasePolicy?.state !== 'locked' || plan.releasePolicy?.cloudWritesAllowed !== false) fail('The existing release lock must remain locked independently of V5 progress');

  const phases = Array.isArray(web.phases) ? web.phases : [];
  const byId = new Map();
  const parents = new Map();
  const addNode = node => {
    if (!node || !text(node.id)) { fail('Invalid node ID'); return; }
    if (byId.has(node.id)) fail(`Duplicate ID: ${node.id}`);
    byId.set(node.id, node);
  };
  let workItemCount = 0;
  for (const phase of phases) {
    addNode(phase);
    if (!V5_PHASE_IDS.includes(phase?.id)) fail(`Unknown phase ID: ${String(phase?.id)}`);
    if (!Array.isArray(phase?.workItems)) { fail(`Missing work items: ${String(phase?.id)}`); continue; }
    const number = typeof phase.id === 'string' ? phase.id.slice(-2) : 'invalid';
    for (const item of phase.workItems) {
      workItemCount += 1;
      addNode(item);
      if (!new RegExp(`^WEB-${number}-(0[1-9]|[1-9][0-9])$`).test(item?.id ?? '')) fail(`Work item ID does not match parent: ${String(item?.id)} in ${phase.id}`);
      if (item?.id) parents.set(item.id, phase);
    }
  }
  if (phases.length !== 8 || V5_PHASE_IDS.some(id => !phases.some(phase => phase?.id === id))) fail('Expected every WEB-PH00-WEB-PH07 exactly once');
  if (!Array.isArray(web.nextBatch) || web.nextBatch.length > 3 || new Set(web.nextBatch).size !== web.nextBatch.length
    || web.nextBatch.some(id => !byId.has(id))) fail('nextBatch must contain up to three distinct V5 IDs');

  // A user may change LOCAL development order without accepting visuals or
  // granting cloud writes. Keep the full graph for cycle/reference checks.
  const exception = web.localDevelopmentException, deferred = new Set(), allowed = new Set(), edges = new Set();
  if (exception !== undefined) {
    const before = errors.length;
    if (exception?.kind !== 'user-authorized-gameplay-first' || exception.confirmedBy !== 'user'
      || exception.scope !== 'local-development-only' || !/^\d{4}-\d{2}-\d{2}$/.test(exception.date ?? '')
      || exception.acceptanceClaimsUnchanged !== true || exception.releasePolicyUnchanged !== true) fail('Invalid local development exception authority/scope');
    evidence('local development exception', exception?.evidence, true);
    const phasesAllowed = exception?.allowedPhaseIds, phasesDeferred = exception?.deferredPhaseIds, dependencies = exception?.deferredPhaseDependencies;
    if (!Array.isArray(phasesAllowed) || !phasesAllowed.length || new Set(phasesAllowed).size !== phasesAllowed.length
      || phasesAllowed.some(id => !['WEB-PH03', 'WEB-PH04'].includes(id))) fail('Invalid local development exception phases');
    if (!Array.isArray(phasesDeferred) || !phasesDeferred.length || new Set(phasesDeferred).size !== phasesDeferred.length
      || phasesDeferred.some(id => !['WEB-PH02', 'WEB-PH03'].includes(id)) || phasesDeferred.includes(web.currentPhaseId)) fail('Invalid deferred development phases');
    if (!Array.isArray(dependencies) || !dependencies.length) fail('Missing deferred phase dependencies');
    else for (const edge of dependencies) {
      const key = `${edge?.phaseId}/${edge?.dependencyId}`;
      if (!['WEB-PH03/WEB-PH02', 'WEB-PH04/WEB-PH03'].includes(key) || edges.has(key)
        || !phasesAllowed?.includes(edge.phaseId) || !phasesDeferred?.includes(edge.dependencyId)
        || !byId.get(edge.phaseId)?.dependsOn?.includes(edge.dependencyId)) fail('Invalid deferred phase dependency');
      edges.add(key);
    }
    if (errors.length === before) { phasesAllowed.forEach(id => allowed.add(id)); phasesDeferred.forEach(id => deferred.add(id)); } else edges.clear();
  }

  const graph = new Map();
  for (const node of byId.values()) {
    if (!STATUSES.has(node.status)) fail(`Unknown status: ${node.id}`);
    if (!text(node.acceptance)) fail(`Missing acceptance: ${node.id}`);
    if (!Array.isArray(node.dependsOn)) fail(`Missing dependency list: ${node.id}`);
    const declared = Array.isArray(node.dependsOn) ? node.dependsOn : [];
    if (new Set(declared).size !== declared.length) fail(`Duplicate dependencies: ${node.id}`);
    const parent = parents.get(node.id);
    const effective = [...new Set([...declared, ...(Array.isArray(parent?.dependsOn) ? parent.dependsOn : [])])];
    for (const dependency of effective) if (!byId.has(dependency)) fail(`Unknown dependency: ${node.id} -> ${String(dependency)}`);
    const unfinished = effective.filter(id => byId.get(id)?.status !== 'done' && !(parent
      ? !declared.includes(id) && edges.has(`${parent.id}/${id}`)
      : edges.has(`${node.id}/${id}`)));
    if (STARTED.has(node.status) && unfinished.length) fail(`Unfinished dependency for started item: ${node.id}`);
    if (parent && STARTED.has(node.status) && !STARTED.has(parent.status) && parent.status !== 'blocked') fail(`Started work item has inactive parent: ${node.id}`);
    const children = Array.isArray(node.workItems) ? node.workItems : [];
    graph.set(node.id, [...effective, ...children.map(item => item?.id).filter(Boolean)]);
    if (node.status === 'done' && children.some(item => item?.status !== 'done')) fail(`Unfinished child of done phase: ${node.id}`);
    evidence(node.id, node.evidence, node.status === 'done');
  }
  const visiting = new Set(), visited = new Set();
  const visit = (id, trail) => {
    if (visiting.has(id)) { fail(`Dependency cycle: ${[...trail, id].join(' -> ')}`); return; }
    if (visited.has(id) || !graph.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id)) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id, []);

  const current = phases.find(phase => phase?.id === web.currentPhaseId);
  const activePhases = phases.filter(phase => ACTIVE.has(phase?.status) && !deferred.has(phase.id));
  if (web.status === 'done') {
    if (phases.some(phase => phase?.status !== 'done') || web.currentPhaseId !== 'WEB-PH07') fail('Completed V5 track must retain final phase and all done phases');
  } else if (!current || !ACTIVE.has(current.status) || activePhases.length !== 1 || activePhases[0] !== current) {
    fail('currentPhaseId must identify the single active V5 phase');
  }

  const gate = web.firstPlayableGate;
  if (gate?.phaseId !== 'WEB-PH02') fail('The first playable gate must remain at WEB-PH02');
  if (!['not_run', 'pending', 'in_progress', 'failed', 'passed'].includes(gate?.status)) fail('Unknown first playable gate status');
  if (!['not_run', 'pending', 'in_progress', 'failed', 'passed'].includes(gate?.physicalDevice)) fail('Unknown physical device status');
  if (!['pending', 'not_run', 'rejected', 'accepted'].includes(gate?.userVisualAcceptance)) fail('Unknown user visual acceptance status');
  let physicalValid = false, visualValid = false;
  if (gate?.physicalDevice === 'passed') {
    const record = gate.physicalDeviceRecord;
    physicalValid = record?.kind === 'physical-device' && record.confirmedBy === 'user'
      && record.device === 'iPhone 13 Pro Max' && text(record.osVersion)
      && Array.isArray(record.browsers) && ['Safari', 'Chrome'].every(browser => record.browsers.includes(browser));
    if (!physicalValid) fail('Physical device pass requires a user-confirmed physical iPhone record for Safari and Chrome; emulation cannot substitute');
    evidence('first playable physical device', record?.evidence, true);
    physicalValid &&= Array.isArray(record?.evidence) && record.evidence.length > 0 && record.evidence.every(ref => safeReference(ref) && evidencePaths.has(ref));
  }
  if (gate?.userVisualAcceptance === 'accepted') {
    const record = gate.userVisualRecord;
    visualValid = record?.kind === 'user-visual' && record.confirmedBy === 'user';
    if (!visualValid) fail('Visual acceptance requires an explicit user acceptance record');
    evidence('first playable user visual acceptance', record?.evidence, true);
    visualValid &&= Array.isArray(record?.evidence) && record.evidence.length > 0 && record.evidence.every(ref => safeReference(ref) && evidencePaths.has(ref));
  }
  const gateAccepted = gate?.status === 'passed' && physicalValid && visualValid;
  if (gate?.status === 'passed' && !gateAccepted) fail('First playable pass requires both physical device pass and user visual acceptance');
  if (!gateAccepted && (byId.get('WEB-PH02')?.status === 'done' || byId.get('WEB-02-03')?.status === 'done')) fail('WEB-PH02 experience acceptance is not complete');
  for (const phase of phases) {
    if (V5_PHASE_IDS.indexOf(phase?.id) < 3) continue;
    if (!gateAccepted && (phase.status === 'done' || (!allowed.has(phase.id) && (STARTED.has(phase.status) || phase.workItems?.some(item => STARTED.has(item?.status)))))) fail(`First playable gate blocks expansion: ${phase.id}`);
  }
  return { errors: [...new Set(errors)], phaseCount: phases.length, workItemCount };
}
