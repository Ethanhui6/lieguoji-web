import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityBudgetReply, EntityBudgetRequest } from './entity-budget-bridge';
import type { EntityBudgetCaseId, EntityBudgetComponent, EntityBudgetReport } from './entity-budget';
import type { ScaleFixture, ScaleOptions } from './types';

// Protocol doubles use tiny shared buffers. They verify ownership/cancellation,
// not actual geographical or entity capacity, which is covered by core tests.
const core = vi.hoisted(() => ({ create: vi.fn(), digest: vi.fn(), bytes: vi.fn(), component: vi.fn(), componentHash: vi.fn(), measure: vi.fn() }));
const cases = ['baseline', 'admin-leaves', 'admin-depth', 'cities', 'groups', 'people', 'families', 'organizations', 'armies'] as const;
const options: ScaleOptions = { seed: 'ph03-entity-budget-v1', scenario: 'continent', geoProfile: 'standard', entityProfile: 'standard' };
vi.mock('./fixture', () => ({ createFixture: core.create, digestFixture: core.digest, byteSize: core.bytes }));
vi.mock('./entity-budget', () => ({
  ENTITY_BUDGET_CASES: ['baseline', 'admin-leaves', 'admin-depth', 'cities', 'groups', 'people', 'families', 'organizations', 'armies'],
  ENTITY_BUDGET_OPTIONS: { seed: 'ph03-entity-budget-v1', scenario: 'continent', geoProfile: 'standard', entityProfile: 'standard' },
  createEntityBudgetComponent: core.component, digestEntityBudgetComponent: core.componentHash, measureEntityBudgetsForSource: core.measure,
}));
const hashSource = (source: ScaleFixture) => createHash('sha256').update(JSON.stringify([...source.atlas.land])).digest('hex');
const hashComponent = (component: EntityBudgetComponent) => createHash('sha256').update(component.caseId).update(JSON.stringify([...component.geography.land])).digest('hex');
function component(source: ScaleFixture, caseId: EntityBudgetCaseId): EntityBudgetComponent {
  return { caseId, source: { ...options }, geography: source.atlas, cellAdmin: new Uint32Array(source.atlas.land.buffer) } as unknown as EntityBudgetComponent;
}
type Request = Exclude<EntityBudgetRequest, { operation: 'cancel' }>;
let source: ScaleFixture, replies: EntityBudgetReply[], serial: number;
let receiver: { onmessage: ((event: MessageEvent<EntityBudgetRequest>) => void) | null; postMessage: ReturnType<typeof vi.fn> };
function post(operation: Omit<Extract<Request, { operation: 'initialize' }>, 'id'> | Omit<Extract<Request, { operation: 'sample' }>, 'id'> | Omit<Extract<Request, { operation: 'finish' }>, 'id'>) {
  const request = { ...operation, id: ++serial } as Request;
  receiver.onmessage!({ data: request } as MessageEvent<EntityBudgetRequest>); return request.id;
}
async function response(id: number) {
  await vi.waitFor(() => expect(replies.some(reply => reply.id === id && reply.kind !== 'progress')).toBe(true));
  return replies.find(reply => reply.id === id && reply.kind !== 'progress')!;
}
async function initialize() { const reply = await response(post({ operation: 'initialize' })); expect(reply.kind).toBe('ready'); }
beforeEach(async () => {
  vi.resetModules(); for (const mock of Object.values(core)) mock.mockReset();
  replies = []; serial = 0;
  source = { options: { ...options }, atlas: { land: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) } } as unknown as ScaleFixture;
  receiver = { onmessage: null, postMessage: vi.fn((reply: EntityBudgetReply, transfer: { transfer: Transferable[] }) => { replies.push(structuredClone(reply, transfer)); }) };
  vi.stubGlobal('self', receiver);
  core.create.mockResolvedValue(source); core.digest.mockImplementation(async (value: ScaleFixture) => hashSource(value)); core.bytes.mockReturnValue(321);
  core.component.mockImplementation(component); core.componentHash.mockImplementation(async (value: EntityBudgetComponent) => hashComponent(value));
  core.measure.mockImplementation(async (value: ScaleFixture) => ({
    format: 'lieguoji-entity-budget-measurement', version: 1, sourceHashBefore: hashSource(value), sourceHashAfter: hashSource(value),
    cases: cases.map(caseId => ({ caseId, completeHash: hashComponent(component(value, caseId)) })),
  }) as EntityBudgetReport);
  await import('./entity-budget.worker');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('entity budget dedicated Worker', () => {
  it('creates and measures one actual source and rejects repeated initialization', async () => {
    await initialize();
    expect(core.create).toHaveBeenCalledTimes(1); expect(core.measure).toHaveBeenCalledTimes(1);
    expect(core.measure.mock.calls[0][0]).toBe(source);
    expect(await response(post({ operation: 'initialize' }))).toMatchObject({ kind: 'error' });
    expect(core.create).toHaveBeenCalledTimes(1); expect(core.measure).toHaveBeenCalledTimes(1);
  });
  it.each(['clone', 'transfer'] as const)('%s creates fresh real payloads without detaching source and deduplicates shared buffers', async transport => {
    await initialize(); const originalHash = hashSource(source);
    for (let sample = 1; sample <= 3; sample++) {
      const reply = await response(post({ operation: 'sample', caseId: 'baseline', sample, transport }));
      expect(reply.kind).toBe('sample');
      if (reply.kind !== 'sample') throw new Error('Expected a sample.');
      expect(reply.payload.geography.land.byteLength).toBe(8);
      expect(reply.payload.geography.land.buffer).toBe(reply.payload.cellAdmin.buffer);
      expect(reply.workerHash).toBe(hashComponent(reply.payload));
      expect(reply.metrics.transferredBuffers).toBe(transport === 'transfer' ? 1 : 0);
      reply.payload.geography.land[0] = 99;
      expect(source.atlas.land[0]).toBe(1); expect(source.atlas.land.byteLength).toBe(8);
    }
    expect(core.component).toHaveBeenCalledTimes(3);
    const final = await response(post({ operation: 'finish' }));
    expect(final).toMatchObject({ kind: 'finished', sourceHash: originalHash, sourceHashAfter: originalHash });
    for (const [reply, transfer] of receiver.postMessage.mock.calls) if (reply.kind === 'sample') expect(new Set(transfer.transfer).size).toBe(transfer.transfer.length);
  });
  it('rejects a component that differs from the measured complete hash', async () => {
    await initialize(); core.componentHash.mockResolvedValueOnce('b'.repeat(64));
    expect(await response(post({ operation: 'sample', caseId: 'people', sample: 1, transport: 'transfer' }))).toMatchObject({ kind: 'error', message: expect.stringContaining('初次完整摘要') });
    expect(source.atlas.land.byteLength).toBe(8);
  });
  it('cancellation during a digest prevents payload delivery and keeps source intact', async () => {
    await initialize(); let complete!: (value: string) => void;
    core.componentHash.mockImplementationOnce(() => new Promise<string>(resolve => { complete = resolve; }));
    const id = post({ operation: 'sample', caseId: 'groups', sample: 1, transport: 'transfer' });
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
    receiver.onmessage!({ data: { operation: 'cancel' } } as MessageEvent<EntityBudgetRequest>);
    complete(hashComponent(component(source, 'groups')));
    expect(await response(id)).toMatchObject({ kind: 'error', cancelled: true });
    expect(replies.some(reply => reply.id === id && reply.kind === 'sample')).toBe(false);
    expect(source.atlas.land.byteLength).toBe(8);
  });
  it('does not declare completion when its source was mutated', async () => {
    await initialize(); source.atlas.land[0] = 9;
    expect(await response(post({ operation: 'finish' }))).toMatchObject({ kind: 'error', message: expect.stringContaining('改变了标准源') });
  });
  it('failed payload posting reports an error without transferring source buffers', async () => {
    await initialize();
    receiver.postMessage.mockImplementationOnce(() => { throw new DOMException('synthetic broken transfer', 'DataCloneError'); });
    expect(await response(post({ operation: 'sample', caseId: 'cities', sample: 1, transport: 'transfer' }))).toMatchObject({ kind: 'error', message: 'synthetic broken transfer' });
    expect(source.atlas.land.byteLength).toBe(8);
  });
});
