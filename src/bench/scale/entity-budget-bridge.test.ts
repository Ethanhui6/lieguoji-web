import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBudgetBridge, runEntityBudgetMeasurement } from './entity-budget-bridge';
import type { EntityBudgetReply, EntityBudgetRequest } from './entity-budget-bridge';
import { ENTITY_BUDGET_CASES, ENTITY_BUDGET_OPTIONS } from './entity-budget';
import type { EntityBudgetCaseId, EntityBudgetComponent, EntityBudgetReport } from './entity-budget';

// Synthetic protocol fixtures isolate orchestration. Core component validation,
// generation and determinism have separate entity-budget tests.
const core = vi.hoisted(() => ({ validate: vi.fn(), digest: vi.fn() }));
vi.mock('./entity-budget', () => ({
  ENTITY_BUDGET_CASES: ['baseline', 'admin-leaves', 'admin-depth', 'cities', 'groups', 'people', 'families', 'organizations', 'armies'],
  ENTITY_BUDGET_OPTIONS: { seed: 'ph03-entity-budget-v1', scenario: 'continent', geoProfile: 'standard', entityProfile: 'standard' },
  validateEntityBudgetComponent: core.validate, digestEntityBudgetComponent: core.digest,
}));
const sourceHash = 'a'.repeat(64);
const componentHash = (id: EntityBudgetCaseId) => (ENTITY_BUDGET_CASES.indexOf(id) + 1).toString(16).repeat(64);
type Request = Exclude<EntityBudgetRequest, { operation: 'cancel' }>;
class WorkerDouble {
  static instances: WorkerDouble[] = [];
  onmessage: ((event: MessageEvent<EntityBudgetReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(message: EntityBudgetRequest) => void>();
  terminate = vi.fn();
  constructor() { WorkerDouble.instances.push(this); }
  reply(data: EntityBudgetReply) { this.onmessage?.({ data } as MessageEvent<EntityBudgetReply>); }
}
function syntheticReply(request: Request): EntityBudgetReply {
  if (request.operation === 'initialize') return {
    id: request.id, kind: 'ready', cases: [...ENTITY_BUDGET_CASES], sourceHash, sourceOptions: { ...ENTITY_BUDGET_OPTIONS }, sourceCreateMs: 3, sourceDigestMs: 2, measureMs: 10,
    report: { format: 'lieguoji-entity-budget-measurement', version: 1, sourceHashBefore: sourceHash, sourceHashAfter: sourceHash, cases: ENTITY_BUDGET_CASES.map(caseId => ({ caseId, completeHash: componentHash(caseId) })) } as EntityBudgetReport,
  };
  if (request.operation === 'finish') return { id: request.id, kind: 'finished', sourceHash, sourceHashAfter: sourceHash, sourceVerificationMs: 2 };
  return {
    id: request.id, kind: 'sample', caseId: request.caseId, sample: request.sample, transport: request.transport, sourceHash, workerHash: componentHash(request.caseId),
    payload: { caseId: request.caseId, source: { ...ENTITY_BUDGET_OPTIONS }, opaquePayloadSentinel: new Uint8Array([7, 8, 9]) } as unknown as EntityBudgetComponent,
    metrics: { workerMs: 4, createMs: 1, digestMs: 3, prepareMs: 2, payloadBytes: 123, transferredBuffers: request.transport === 'transfer' ? 1 : 0 },
  };
}
function respond(worker: WorkerDouble, transform: (reply: EntityBudgetReply) => EntityBudgetReply = value => value) {
  worker.postMessage.mockImplementation(message => {
    if (message.operation !== 'cancel') void Promise.resolve().then(() => worker.reply(transform(syntheticReply(message))));
  });
}
beforeEach(() => {
  WorkerDouble.instances = []; core.validate.mockReset().mockReturnValue(true);
  core.digest.mockReset().mockImplementation(async (component: EntityBudgetComponent) => componentHash(component.caseId));
  vi.stubGlobal('Worker', WorkerDouble);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('independent entity budget bridge', () => {
  it('retains all 9 × 3 × 2 samples, checks complete hashes and releases payloads and Worker', async () => {
    const bridge = new EntityBudgetBridge(), worker = WorkerDouble.instances[0]; respond(worker);
    const report = await bridge.measure();
    expect(report.transportSamples).toHaveLength(54);
    for (const caseId of ENTITY_BUDGET_CASES) for (const transport of ['clone', 'transfer']) {
      expect(report.transportSamples.filter(item => item.caseId === caseId && item.transport === transport).map(item => item.sample)).toEqual([1, 2, 3]);
    }
    expect(report.transportSamples.every(item => item.mainHash === item.workerHash)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('opaquePayloadSentinel');
    expect(worker.postMessage.mock.calls.filter(([request]) => request.operation === 'initialize')).toHaveLength(1);
    expect(worker.postMessage.mock.calls.filter(([request]) => request.operation === 'finish')).toHaveLength(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(bridge.measure()).rejects.toThrow('已关闭');
  });
  it('records transport arrival before receiver validation and digest', async () => {
    let now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now);
    core.validate.mockImplementation(() => { now += 11; return true; });
    core.digest.mockImplementation(async (component: EntityBudgetComponent) => { now += 19; return componentHash(component.caseId); });
    const bridge = new EntityBudgetBridge(), worker = WorkerDouble.instances[0];
    respond(worker, reply => { now += 2; return reply; });
    const report = await bridge.measure();
    expect(report.transportSamples.every(item => item.roundTripMs === 2 && item.validationMs === 11 && item.receiverDigestMs === 19)).toBe(true);
  });
  it.each(['invalid-payload', 'wrong-hash', 'wrong-case', 'wrong-source', 'wrong-baseline-hash'] as const)('fails closed on %s and cannot reuse the failed Worker', async fault => {
    const bridge = new EntityBudgetBridge(), worker = WorkerDouble.instances[0];
    respond(worker, reply => {
      if (reply.kind !== 'sample') return reply;
      if (fault === 'invalid-payload') core.validate.mockReturnValue(false);
      if (fault === 'wrong-hash') return { ...reply, workerHash: 'b'.repeat(64) };
      if (fault === 'wrong-case') return { ...reply, payload: { ...reply.payload, caseId: 'armies' } };
      if (fault === 'wrong-source') return { ...reply, sourceHash: 'b'.repeat(64) };
      if (fault === 'wrong-baseline-hash') { core.digest.mockResolvedValue('b'.repeat(64)); return { ...reply, workerHash: 'b'.repeat(64) }; }
      return reply;
    });
    await expect(bridge.measure()).rejects.toThrow();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    const count = worker.postMessage.mock.calls.length;
    await expect(bridge.measure()).rejects.toThrow();
    expect(worker.postMessage).toHaveBeenCalledTimes(count);
  });
  it('rejects an incomplete nine-case initialization', async () => {
    const bridge = new EntityBudgetBridge(), worker = WorkerDouble.instances[0];
    respond(worker, reply => reply.kind === 'ready' ? { ...reply, cases: reply.cases.slice(1) } : reply);
    await expect(bridge.measure()).rejects.toThrow('九组对照');
    expect(core.digest).not.toHaveBeenCalled(); expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it.each(['error', 'decode'] as const)('terminates and settles initialization on a %s failure', async kind => {
    const bridge = new EntityBudgetBridge(), worker = WorkerDouble.instances[0], result = bridge.measure();
    const expectation = expect(result).rejects.toThrow();
    if (kind === 'error') worker.onerror?.({ message: 'synthetic fatal' } as ErrorEvent); else worker.onmessageerror?.();
    await expectation; expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(bridge.measure()).rejects.toThrow();
  });
  it('aborts initialization immediately and does not create a Worker for a pre-aborted top-level run', async () => {
    const signal = new AbortController(), bridge = new EntityBudgetBridge(), worker = WorkerDouble.instances[0];
    const result = bridge.measure({ signal: signal.signal }), rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    signal.abort(); await rejection;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(runEntityBudgetMeasurement({ signal: signal.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(WorkerDouble.instances).toHaveLength(1);
  });
  it('request timeouts settle and release the Worker', async () => {
    vi.useFakeTimers();
    const bridge = new EntityBudgetBridge({ requestTimeoutMs: 25, totalTimeoutMs: 100 }), worker = WorkerDouble.instances[0];
    const result = bridge.measure(), rejection = expect(result).rejects.toThrow('请求超时');
    await vi.advanceTimersByTimeAsync(25); await rejection;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it('the overall deadline interrupts a caller yield without retaining a live Worker', async () => {
    vi.useFakeTimers();
    const bridge = new EntityBudgetBridge({ requestTimeoutMs: 100, totalTimeoutMs: 25 }), worker = WorkerDouble.instances[0]; respond(worker);
    const result = bridge.measure({ yieldTask: () => new Promise(() => {}) }), rejection = expect(result).rejects.toThrow('总时限');
    await vi.advanceTimersByTimeAsync(25); await rejection;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
