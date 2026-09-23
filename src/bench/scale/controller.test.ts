import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCALE_OPTIONS, ScaleBenchController, type BenchView } from './controller';
import type { ScaleResult, ScaleSnapshot } from './protocol';
import type { ScalePick } from './renderer';
import type { ScaleReadResult, ScaleSaveOptions, ScaleSaveResult } from './storage';
import type { ScaleFixture, ScaleOptions, ScaleTransaction } from './types';

const doubles = vi.hoisted(() => ({
  bridge: {
    generate: vi.fn<(options: ScaleOptions) => Promise<ScaleResult>>(),
    edit: vi.fn<(input: ScaleTransaction) => Promise<ScaleResult>>(),
    undo: vi.fn<() => Promise<ScaleResult>>(), seek: vi.fn<(sequence: number) => Promise<ScaleResult>>(),
    live: vi.fn<() => Promise<ScaleResult>>(), branch: vi.fn<(sequence: number) => Promise<ScaleResult>>(),
    snapshot: vi.fn<(includeHistory?: boolean) => Promise<ScaleResult>>(),
    load: vi.fn<(snapshot: ScaleSnapshot, hash?: string) => Promise<ScaleResult>>(),
    cancel: vi.fn<() => void>(), close: vi.fn<() => void>(),
  },
  renderer: {
    init: vi.fn<() => Promise<void>>(), setPickHandler: vi.fn<(handler: (pick: ScalePick | null) => void) => void>(),
    setFixture: vi.fn<(fixture: ScaleFixture, hint?: unknown) => void>(),
    select: vi.fn<(cellId: number | null) => void>(), pick: vi.fn<(x: number, y: number) => ScalePick | null>(),
    worldToScreen: vi.fn<(x: number, y: number) => { x: number; y: number }>(),
    metrics: vi.fn<() => { mockRenderer: true }>(), cancelCameraPath: vi.fn<() => void>(), destroy: vi.fn<() => void>(),
  },
  read: vi.fn<(runId: string, options?: { source?: 'current' | 'backup' }) => Promise<ScaleReadResult<ScaleSnapshot>>>(),
  save: vi.fn<(runId: string, payload: ScaleSnapshot, options: ScaleSaveOptions) => Promise<ScaleSaveResult>>(),
  digest: vi.fn<(fixture: ScaleFixture) => Promise<string>>(),
  polygon: vi.fn<(fixture: ScaleFixture, cellId: number) => { x: number; y: number }[]>(),
  elevation: vi.fn<(fixture: ScaleFixture, cellId: number) => number>(),
}));

vi.mock('./bridge', () => ({ ScaleBridge: class { constructor() { return doubles.bridge; } } }));
vi.mock('./renderer', () => ({ ScaleRenderer: class { constructor() { return doubles.renderer; } } }));
vi.mock('./storage', () => ({ SCALE_BENCH_DB: 'lieguoji-scale-bench-v1', readScaleSnapshot: doubles.read, saveScaleSnapshot: doubles.save }));
vi.mock('./fixture', () => ({ cellPolygon: doubles.polygon, elevationAt: doubles.elevation, digestFixture: doubles.digest }));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Small controller-only doubles: no generator, geometry, engine, hash or IDB
// correctness is inferred from these tests. Those modules have separate tests.
function result(runId: string, hashCharacter = 'a', sequence = 0): ScaleResult {
  const fixture: ScaleFixture = {
    format: 'lieguoji-scale-fixture', version: 1, generatorVersion: 'ph03-structure-v1', options: { ...DEFAULT_SCALE_OPTIONS },
    atlas: { columns: 2, rows: 1, width: 2, height: 1, vertexX: new Float32Array([0, 1, 2, 0, 1, 2]), vertexY: new Float32Array([0, 0, 0, 1, 1, 1]), land: new Uint8Array([1, 1]), elevation: new Float32Array([.2, .3]), moisture: new Float32Array([.5, .5]), regionByCell: new Uint32Array([0, 0]) },
    entities: {
      nations: [{ id: 0, name: '测试国', color: 0x336699, depth: 1 }],
      administration: [{ id: 0, nationId: 0, parentId: null, level: 1, leaf: true, name: '测试叶' }],
      regions: [{ id: 0, anchorCell: 0, initialAdminId: 0 }], cities: [], groups: [], people: [], families: [], organizations: [], armies: [],
    },
    state: { revision: sequence, batch: 0, elevationOverrides: [], regionAdmin: new Uint32Array([0]), population: new Float64Array(), grain: new Float64Array(), armyCell: new Uint32Array() },
    counts: { samples: 2, land: 2, regions: 1, nations: 1, adminParents: 0, adminTotal: 1, cities: 0, groups: 0, people: 0, families: 0, organizations: 0, armies: 0 },
    limitations: ['Controller-only synthetic double, not a scale fixture acceptance sample.'],
  };
  const hash = hashCharacter.repeat(64);
  return {
    fixture, runId, hash, sequence, historyLength: sequence, readOnly: false, summary: `accepted ${runId}`,
    metrics: { workerMs: 1, prepareMs: 1, roundTripMs: 2, payloadBytes: 100, transport: 'clone' },
    snapshot: { format: 'lieguoji-scale-experiment', version: 1, history: { format: 'lieguoji-scale-history', version: 1, runId, parent: null, initial: fixture, initialHash: hash, checkpointEvery: 32, entries: [], checkpoints: [] } },
  };
}

function stored(value: ScaleResult, source: 'current' | 'backup' = 'current'): ScaleReadResult<ScaleSnapshot> {
  return { payload: value.snapshot!, payloadHash: value.hash, revision: 7, source, recoveredFromBackup: source === 'backup', payloadBytes: 100, pairPayloadBytes: 200 };
}

let controller: ScaleBenchController;
let publish: ReturnType<typeof vi.fn<(patch: Partial<BenchView>) => void>>;
let view: Partial<BenchView>;
let replaceState: ReturnType<typeof vi.fn>;
let original: ScaleResult;
const edit: ScaleTransaction = { type: 'elevation', cellIds: [0], delta: .1 };

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal('__BENCH_BUILD__', { format: 'controller-test', version: 1, commit: 'test', sourceFingerprint: '1'.repeat(64), localOnly: true, engineFingerprint: '2'.repeat(64) });
  replaceState = vi.fn();
  vi.stubGlobal('window', { location: { href: 'http://localhost:4175/?bench=scale' }, history: { replaceState } });
  doubles.renderer.init.mockResolvedValue(); doubles.renderer.metrics.mockReturnValue({ mockRenderer: true });
  doubles.renderer.worldToScreen.mockImplementation((x, y) => ({ x, y }));
  doubles.renderer.pick.mockReturnValue({ cellId: 0, stableId: 'cell-0', regionId: 0, nationId: 0, cityIds: [], world: { x: .5, y: .5 } });
  doubles.polygon.mockReturnValue([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  doubles.elevation.mockReturnValue(.2);
  original = result('scale-original');
  doubles.bridge.generate.mockResolvedValue(original); doubles.bridge.snapshot.mockResolvedValue(original);
  doubles.save.mockResolvedValue({ revision: 1, payloadBytes: 100, pairPayloadBytes: 100 });
  view = {}; publish = vi.fn(patch => { view = { ...view, ...patch }; });
  controller = new ScaleBenchController({} as HTMLElement, publish);
  await controller.init(); await controller.generate();
});
afterEach(() => { controller.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('scale controller cancellation and commit boundaries', () => {
  it('cancels a delayed read before bridge.load, preserving the current accepted world', async () => {
    const gate = deferred<ScaleReadResult<ScaleSnapshot>>(), next = result('scale-restored', 'b'), before = structuredClone(controller.inspect());
    doubles.read.mockReturnValueOnce(gate.promise);
    const pending = controller.restore(next.runId), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(doubles.read).toHaveBeenCalledWith(next.runId, { source: 'current' });
    controller.cancel(); gate.resolve(stored(next)); await rejected;
    expect(doubles.bridge.load).not.toHaveBeenCalled(); expect(doubles.save).not.toHaveBeenCalled();
    expect(doubles.renderer.setFixture).toHaveBeenCalledTimes(1);
    expect(controller.inspect()).toEqual(before); expect(view.busy).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('cancels a delayed snapshot before any save begins, preserving the accepted world', async () => {
    const gate = deferred<ScaleResult>(), before = structuredClone(controller.inspect());
    doubles.bridge.snapshot.mockReturnValueOnce(gate.promise);
    const pending = controller.save(), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(doubles.bridge.snapshot).toHaveBeenCalledWith(true);
    controller.cancel(); gate.resolve(original); await rejected;
    expect(doubles.save).not.toHaveBeenCalled(); expect(replaceState).not.toHaveBeenCalled();
    expect(controller.inspect()).toEqual(before); expect(view.busy).toBe(false);
  });

  it('reports an already committed save truthfully when cancellation arrives before its response', async () => {
    const committed = deferred<void>(), response = deferred<ScaleSaveResult>();
    let persistedRun: string | null = null;
    doubles.save.mockImplementationOnce(async (runId, _payload, options) => {
      expect(options.signal?.aborted).toBe(false);
      persistedRun = runId; committed.resolve();
      return response.promise;
    });
    const pending = controller.save(); await committed.promise;
    controller.cancel(); response.resolve({ revision: 4, payloadBytes: 100, pairPayloadBytes: 200 });
    await expect(pending).resolves.toMatchObject({ runId: original.runId, revision: 4, hash: original.hash });
    expect(persistedRun).toBe(original.runId); expect(doubles.save).toHaveBeenCalledTimes(1);
    expect(doubles.save.mock.calls[0][2].signal?.aborted).toBe(true);
    expect(view.status).toContain('已经启动并成功提交'); expect(view.status).toContain('未回滚');
    expect(controller.inspect().storage).toMatchObject({ operation: 'save', runId: original.runId, revision: 4 });
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect((replaceState.mock.calls[0][2] as URL).searchParams.get('run')).toBe(original.runId);
    doubles.save.mockResolvedValueOnce({ revision: 5, payloadBytes: 100, pairPayloadBytes: 200 });
    await controller.save();
    expect(doubles.save.mock.calls[1][2].expectedRevision).toBe(4);
  });
});

describe('scale controller render acceptance and restore isolation', () => {
  it.each(['select', 'pick'] as const)('locks later mutations when %s fails after setFixture succeeds', async failure => {
    if (failure === 'pick') controller.pickCell(0);
    const next = result(original.runId, 'b', 1);
    doubles.bridge.edit.mockResolvedValueOnce(next);
    doubles.renderer[failure].mockImplementationOnce(() => { throw new Error(`synthetic ${failure} restore fault`); });
    await expect(controller.edit(edit)).rejects.toThrow(`synthetic ${failure} restore fault`);
    expect(doubles.renderer.setFixture).toHaveBeenLastCalledWith(next.fixture, { cellIds: [0] });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ ready: false, error: expect.stringContaining('线程已完成操作，但渲染失败') }));
    expect(view.ready).toBe(false); expect(controller.inspect().ready).toBe(false); expect(view.busy).toBe(false);
    await expect(controller.edit(edit)).rejects.toThrow('渲染失败');
    await expect(controller.save()).rejects.toThrow('渲染失败');
    expect(doubles.bridge.edit).toHaveBeenCalledTimes(1);
    expect(doubles.bridge.snapshot).not.toHaveBeenCalled(); expect(doubles.save).not.toHaveBeenCalled();
  });

  it('restores current through worker verification, then uses the stored revision for its next CAS save', async () => {
    const next = result('scale-restored', 'b', 3), saved = stored(next), untouched = structuredClone(saved);
    doubles.read.mockResolvedValueOnce(saved); doubles.bridge.load.mockResolvedValueOnce(next);
    await expect(controller.restore(next.runId)).resolves.toMatchObject({ runId: next.runId, hash: next.hash, storageLocked: false });
    expect(doubles.bridge.load).toHaveBeenCalledWith(saved.payload, saved.payloadHash);
    expect(doubles.save).not.toHaveBeenCalled(); expect(saved).toEqual(untouched);
    doubles.bridge.snapshot.mockResolvedValueOnce(next);
    doubles.save.mockResolvedValueOnce({ revision: 8, payloadBytes: 100, pairPayloadBytes: 200 });
    await controller.save();
    expect(doubles.save).toHaveBeenCalledWith(next.runId, next.snapshot, expect.objectContaining({ expectedRevision: 7, payloadHash: next.hash, signal: expect.any(AbortSignal) }));
  });

  it('protects an explicitly restored backup until an independent branch saves under its new run identity', async () => {
    const backup = result('scale-backup-source', 'b', 2), saved = stored(backup, 'backup'), untouched = structuredClone(saved);
    doubles.read.mockResolvedValueOnce(saved); doubles.bridge.load.mockResolvedValueOnce(backup);
    await controller.restore(backup.runId, 'backup');
    expect(doubles.read).toHaveBeenCalledWith(backup.runId, { source: 'backup' });
    expect(controller.inspect().storageLocked).toBe(true);
    await expect(controller.save()).rejects.toThrow('备份恢复');
    expect(doubles.bridge.snapshot).not.toHaveBeenCalled(); expect(doubles.save).not.toHaveBeenCalled();
    const branch = result('scale-independent-branch', 'c');
    doubles.bridge.branch.mockResolvedValueOnce(branch);
    await controller.branch(backup.sequence);
    expect(doubles.bridge.branch).toHaveBeenCalledWith(backup.sequence);
    expect(controller.inspect()).toMatchObject({ runId: branch.runId, storageLocked: false });
    doubles.bridge.snapshot.mockResolvedValueOnce(branch); await controller.save();
    expect(doubles.save).toHaveBeenCalledTimes(1);
    expect(doubles.save).toHaveBeenCalledWith(branch.runId, branch.snapshot, expect.objectContaining({ expectedRevision: 0, payloadHash: branch.hash }));
    expect(saved).toEqual(untouched);
  });
});
