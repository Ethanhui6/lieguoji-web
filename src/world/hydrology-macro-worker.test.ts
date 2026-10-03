import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { MessageChannel } from 'node:worker_threads';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasClient } from './bridge';
import { AtlasWorkerRuntime } from './atlas.worker';
import { OwnedAtlasSession } from './transactions';
import { createGenerationDraft, isDetailCoastDocument, type AtlasDetailCoastDocument } from './atlas-format';
import { hashDetailCoastTile } from './detail-coast-codec';
import { detailCoastOwnerLayout, type DetailCoastSampleTile } from './detail-coast-types';
import { hashAtlasCellLockBlock } from './generation-locks';
import type { AtlasCellLockBlock } from './generation-contract';
import { getAtlasStorage } from './storage';
import type { AtlasStoredRoot } from './storage-types';
import { ATLAS_PACKET_LIMIT, decodeAtlasPacket, encodeAtlasPacket, type AtlasOperation } from './protocol';
import type { HydrologyMacroPreview } from './hydrology-macro-contract';

/** Real runtime and kernel; only packet transport and fault injection replace
 * the browser Worker boundary. No generated flow result is mocked. */
class MacroWorker {
  static instances: MacroWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  closed = false;
  started = performance.now();
  packets: { direction: string; type: string; bytes: number; body: unknown; at: number }[] = [];
  requestFault?: (operation: AtlasOperation) => AtlasOperation;
  requestPayload = false;
  responseFault?: (preview: HydrologyMacroPreview) => HydrologyMacroPreview;
  responsePayload = false;
  responseExtraField = false;
  lateResponse = false;
  dropMacro = false;
  runtime = new AtlasWorkerRuntime((bytes, transfer) => {
    const { header } = decodeAtlasPacket(bytes); this.packets.push({ direction: 'out', type: header.type, bytes: bytes.length, body: header.body, at: performance.now() - this.started });
    let copy = structuredClone(bytes, { transfer });
    const body = header.body as { operation?: string; preview?: HydrologyMacroPreview };
    if (header.type === 'complete' && body.operation === 'hydrology-macro-analyze') {
      if (this.lateResponse) queueMicrotask(() => this.onmessage?.({ data: encodeAtlasPacket({ ...header, id: header.id - 1, body: { ...body, preview: { ...body.preview, version: 999 } } }) } as MessageEvent));
      if (this.responseFault || this.responsePayload || this.responseExtraField) copy = encodeAtlasPacket({ ...header,
        body: { ...body, ...(this.responseExtraField ? { saved: true } : {}), preview: this.responseFault ? this.responseFault(structuredClone(body.preview!)) : body.preview },
      }, this.responsePayload ? Uint8Array.of(1) : undefined);
    }
    queueMicrotask(() => { if (!this.closed) this.onmessage?.({ data: copy } as MessageEvent); });
  });
  constructor() { MacroWorker.instances.push(this); }
  postMessage(bytes: Uint8Array, transfer: Transferable[]) {
    const { header, payload } = decodeAtlasPacket(bytes); this.packets.push({ direction: 'in', type: header.type, bytes: bytes.length, body: header.body, at: performance.now() - this.started });
    let copy = structuredClone(bytes, { transfer });
    const operation = header.body as AtlasOperation;
    if (header.type === 'request' && operation.type === 'hydrology-macro-analyze') {
      if (this.dropMacro) return;
      if (this.requestFault || this.requestPayload) copy = encodeAtlasPacket({ ...header, body: this.requestFault ? this.requestFault(operation) : operation }, this.requestPayload ? Uint8Array.of(1) : payload);
    }
    queueMicrotask(() => { if (!this.closed) this.runtime.receive(copy); });
  }
  terminate() { if (!this.closed) { this.closed = true; this.runtime.close(); } }
}

const fast = { yieldTask: async () => {} }, clients: AtlasClient[] = [];
const display = { maxBranches: 16, maxEdges: 128, minimumContributingSamples: 1 };
let fixture: AtlasDetailCoastDocument;
/** Browsers provide scheduler.postTask. In Node on Windows the production
 * setTimeout(0) fallback costs about 14–15 ms per checkpoint (see the retained
 * first diagnostic), so hundreds of cooperative yields exceed 5 s before the
 * kernel starts. Exercise the supported scheduler branch with genuine posted
 * tasks, never resolved-Promise yields, fake time, or a substituted algorithm. */
function createTaskQueue() {
  const channel = new MessageChannel(), pending = new Map<number, { run: () => void; reject: (error: Error) => void }>();
  let next = 0, completed = 0, closed = false;
  channel.port1.on('message', (id: number) => {
    const task = pending.get(id); if (!task) return;
    pending.delete(id); completed++; task.run();
  });
  return {
    get completed() { return completed; },
    scheduler: {
      postTask(callback: () => void, options: { priority: 'background' }) {
        if (closed || options.priority !== 'background') return Promise.reject(new Error('Invalid test task queue use'));
        return new Promise<void>((resolve, reject) => {
          const id = ++next;
          pending.set(id, { reject, run: () => { try { callback(); resolve(); } catch (error) { reject(error); } } });
          channel.port2.postMessage(id);
        });
      },
    },
    close() {
      closed = true;
      for (const task of pending.values()) task.reject(new DOMException('Test task queue disposed', 'AbortError'));
      pending.clear(); channel.port1.close(); channel.port2.close();
    },
  };
}
let taskQueue: ReturnType<typeof createTaskQueue>;
function client(options: ConstructorParameters<typeof AtlasClient>[0] = {}) { const c = new AtlasClient({ format: 4, ...options }); clients.push(c); return c; }
async function storeFixture(expectedRoot: AtlasStoredRoot | null = null) {
  const manifest = structuredClone(fixture.manifest); if (expectedRoot) manifest.revision = expectedRoot.revision + 1;
  const db = getAtlasStorage(4), prepared = await db.prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest, expectedRoot }, fast);
  const blocks = [...fixture.blocks.values(), ...fixture.locks.values(), ...fixture.detailCoast.values()];
  for (let i = 0; i < blocks.length; i += 8) await db.stageAtlasBlocks(prepared.preparationId, blocks.slice(i, i + 8), fast);
  return db.commitAtlasPreparation(prepared.preparationId, fast);
}
const macroCompletions = (worker: MacroWorker) => worker.packets.filter(packet => packet.direction === 'out' && packet.type === 'complete'
  && (packet.body as { operation?: string }).operation === 'hydrology-macro-analyze');
beforeAll(async () => {
  fixture = await createGenerationDraft({ size: 128, name: '宏观汇流通信合成地形', seed: 'ph07-macro-transport' }, fast, 4);
  const layout = detailCoastOwnerLayout(0, 0), tile: DetailCoastSampleTile = { format: 'lieguoji-detail-coast-tile', version: 1, bx: 0, by: 0, mode: 'samples',
    coverageQ: new Int16Array(layout.count), elevationMeters: new Int16Array(layout.count) };
  for (let i = 0; i < layout.count; i++) { const x = i % layout.width; tile.coverageQ[i] = x < 24 ? 100 : -100; tile.elevationMeters[i] = x < 24 ? 1000 - x * 20 : -100; }
  fixture.detailCoast.set('coast:0:0', tile); fixture.manifest.detailCoast.refs = [{ bx: 0, by: 0, hash: await hashDetailCoastTile(tile) }];
  const lock: AtlasCellLockBlock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 0, by: 0, flags: new Uint8Array(1024) }; lock.flags[0] = 3;
  fixture.locks.set('lock:0:0', lock); fixture.manifest.constraints.lockRefs = [{ bx: 0, by: 0, hash: await hashAtlasCellLockBlock(lock) }];
});
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory(); MacroWorker.instances = []; vi.stubGlobal('Worker', MacroWorker);
  taskQueue = createTaskQueue(); vi.stubGlobal('scheduler', taskQueue.scheduler);
});
afterEach(async context => {
  if (process.env.MACRO_WORKER_DIAGNOSTIC) {
    const workers = MacroWorker.instances.map(worker => {
      const stages: { stage: string; firstMs: number; lastMs: number; count: number; completed: number; total: number }[] = [];
      for (const packet of worker.packets) if (packet.direction === 'out' && packet.type === 'progress') {
        const progress = packet.body as { stage: string; completed: number; total: number }, prior = stages.at(-1);
        if (prior?.stage === progress.stage) { prior.lastMs = packet.at; prior.count++; prior.completed = progress.completed; prior.total = progress.total; }
        else stages.push({ stage: progress.stage, firstMs: packet.at, lastMs: packet.at, count: 1, completed: progress.completed, total: progress.total });
      }
      return { elapsedMs: performance.now() - worker.started, closed: worker.closed, stages,
        controls: worker.packets.filter(packet => packet.type !== 'progress' && packet.type !== 'fragment' && packet.type !== 'ack').map(packet => ({ direction: packet.direction, type: packet.type, at: packet.at, operation: (packet.body as { type?: string; operation?: string }).type ?? (packet.body as { operation?: string }).operation })) };
    });
    console.log('MACRO_WORKER_DIAGNOSTIC ' + JSON.stringify({ name: context.task.name, schedulerPresent: typeof Reflect.get(globalThis, 'scheduler')?.postTask === 'function', workers }));
  }
  vi.useRealTimers(); clients.splice(0).forEach(c => c.close()); taskQueue.close();
  await new Promise(resolve => setTimeout(resolve, 0)); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('independent macro drainage through real saved terrain and Worker packets', () => {
  it('reads actual fine owners, rejects mutable UI aliases, ignores late packets and leaves storage unchanged', async () => {
    const receipt = await storeFixture(), api = getAtlasStorage(4), before = await api.exportAtlasRawBackup(fixture.manifest.draftId);
    const c = client(), view = await c.restore(fixture.manifest.draftId), worker = MacroWorker.instances.at(-1)!; worker.lateResponse = true;
    if (!isDetailCoastDocument(view.data)) throw new Error('Expected v4');
    const tile = view.data.detailCoast.get('coast:0:0')!; if (tile.mode === 'samples') { tile.coverageQ.fill(-100); tile.elevationMeters.fill(-100); }
    view.head.revision = 777; view.data.manifest.revision = 777;
    const preview = await c.analyzeMacroHydrology(display);
    expect(preview.source).toMatchObject({ revision: 0, rootDigest: receipt.rootDigest, manifestDigest: receipt.manifestDigest, atlasId: fixture.manifest.atlasId });
    expect(preview.stats.sampledNodes).toBe(66049); expect(preview.edges.from.length).toBeGreaterThan(0); expect(preview.branches.some(branch => branch.stop === 'sampled-sea')).toBe(true);
    expect(preview.grid).toMatchObject({ columns: 257, rows: 257, stepWorld: 16, sampleSemantics: 'actual-fine-owner-nodes-at-stride-8' });
    for (let i = 0; i < preview.nodes.ids.length; i++) {
      const id = preview.nodes.ids[i], x = id % 257 * 8, y = Math.floor(id / 257) * 8;
      if (x <= 32 && y <= 32) expect(preview.nodes.groundMeters[i]).toBe(x < 24 ? 1000 - x * 20 : -100);
    }
    expect(c.current).toBe(view); expect(c.lastCommand).toBeNull();
    expect(worker.packets.every(packet => packet.bytes <= ATLAS_PACKET_LIMIT)).toBe(true);
    expect(worker.packets.some(packet => packet.type === 'progress' && (packet.body as { stage: string }).stage.startsWith('宏观汇流：'))).toBe(true);
    expect(taskQueue.completed, 'Full reads and routing cross real task boundaries').toBeGreaterThan(260);
    expect(await api.exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
  });
  it('cancels real macro computation and can run again without creating a receipt', async () => {
    await storeFixture(); let cancelled = false;
    const c = client({ onProgress: progress => { if (!cancelled && progress.stage.startsWith('宏观汇流：')) { cancelled = true; c.cancel(); } } });
    await c.restore(fixture.manifest.draftId); const before = await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId);
    await expect(c.analyzeMacroHydrology(display)).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(true); expect(macroCompletions(MacroWorker.instances.at(-1)!)).toHaveLength(0);
    expect((await c.analyzeMacroHydrology(display)).stats.sampledNodes).toBe(66049);
    expect(await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before); expect(c.lastCommand).toBeNull();
  });
  it('Worker independently rejects changed heads, unknown fields, wrong format, excess budgets and payload bytes', async () => {
    await storeFixture(); const c = client(); await c.restore(fixture.manifest.draftId); const worker = MacroWorker.instances.at(-1)!;
    const before = await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId);
    for (const fault of ['head', 'unknown', 'format', 'budget', 'payload']) {
      worker.requestPayload = fault === 'payload';
      worker.requestFault = operation => {
        if (operation.type !== 'hydrology-macro-analyze') return operation;
        if (fault === 'head') return { ...operation, expected: { ...operation.expected, revision: operation.expected.revision + 1 } };
        if (fault === 'format') return { ...operation, atlasFormat: 3 };
        if (fault === 'budget') return { ...operation, maxEdges: 8193 };
        return fault === 'unknown' ? { ...operation, save: true } as AtlasOperation : operation;
      };
      await expect(c.analyzeMacroHydrology(display)).rejects.toThrow(); expect(worker.closed).toBe(false);
    }
    expect(macroCompletions(worker)).toHaveLength(0); worker.requestFault = undefined; worker.requestPayload = false;
    expect((await c.analyzeMacroHydrology(display)).stats.sampledNodes).toBe(66049);
    expect(await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
  });
  it('bridge rejects source, lock, atlas, version, edge, payload and extra-field response corruption', async () => {
    await storeFixture(); const before = await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId);
    for (const fault of ['head', 'locks', 'atlas', 'future', 'jump', 'payload', 'extra']) {
      const c = client(), view = await c.restore(fixture.manifest.draftId), worker = MacroWorker.instances.at(-1)!;
      worker.responsePayload = fault === 'payload'; worker.responseExtraField = fault === 'extra';
      worker.responseFault = preview => {
        if (fault === 'head') preview.source.rootDigest = 'f'.repeat(64);
        if (fault === 'locks') preview.source.lockSetDigest = 'f'.repeat(64);
        if (fault === 'atlas') preview.source.atlasId = 'wrong-atlas';
        if (fault === 'future') Object.assign(preview, { version: 2 });
        if (fault === 'jump') preview.edges.to[0] = preview.edges.from[0];
        return preview;
      };
      await expect(c.analyzeMacroHydrology(display)).rejects.toThrow('未提交地图修改'); expect(c.current).toBe(view); expect(worker.closed).toBe(true);
    }
    expect(await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
  }, 30000);
  it('rejects an actual owned-session replacement during a computation yield without publishing a result', async () => {
    const receipt = await storeFixture(), replacement = await OwnedAtlasSession.open(fixture, receipt.rootDigest, fast);
    let swapped = false;
    const c = client({ onProgress: progress => {
      if (!swapped && progress.stage.startsWith('宏观汇流：')) {
        swapped = true;
        // Fault-inject lifecycle replacement with a real independently owned
        // session at the same head. This must fail object ownership, not hashes.
        Reflect.set(MacroWorker.instances.at(-1)!.runtime, 'session', replacement);
      }
    } });
    const view = await c.restore(fixture.manifest.draftId), before = await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId);
    await expect(c.analyzeMacroHydrology(display)).rejects.toThrow('来源已变化'); expect(swapped).toBe(true);
    expect(macroCompletions(MacroWorker.instances.at(-1)!)).toHaveLength(0); expect(c.current).toBe(view);
    expect(await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
  });
  it('guards pending previews, backups, old formats and overlap while retaining the legacy fine trace', async () => {
    const first = await storeFixture(); await storeFixture(first.root);
    const c = client(); await c.restore(fixture.manifest.draftId);
    await c.previewConstraints({ column: 0, row: 0, columns: 1, rows: 1 }, 1, 'clear');
    await expect(c.analyzeMacroHydrology(display)).rejects.toThrow('预览');
    const worker = MacroWorker.instances.at(-1)!, head = c.head!;
    const operation: AtlasOperation = { type: 'hydrology-macro-analyze', atlasFormat: 4,
      expected: { draftId: head.draftId, revision: head.revision, manifestDigest: head.manifestDigest, rootDigest: head.rootDigest }, ...display };
    worker.runtime.receive(encodeAtlasPacket({ version: 1, id: 9999, type: 'request', body: operation }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(worker.packets.some(packet => packet.type === 'error' && (packet.body as { message: string }).message.includes('区域锁预览'))).toBe(true);
    await c.discardConstraints();
    const pending = c.analyzeMacroHydrology(display); await expect(c.analyzeMacroHydrology(display)).rejects.toThrow('尚未完成'); await pending;
    expect((await c.analyzeHydrology({ originColumn: 4, originRow: 4, columns: 24, rows: 10 }, { column: 6, row: 8 })).terminal).toBe('ocean');
    const backup = client(); await backup.restore(fixture.manifest.draftId, 'backup'); await expect(backup.analyzeMacroHydrology(display)).rejects.toThrow('可编辑');
    const backupWorker = MacroWorker.instances.at(-1)!;
    backupWorker.runtime.receive(encodeAtlasPacket({ version: 1, id: 9998, type: 'request', body: operation }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(backupWorker.packets.some(packet => packet.type === 'error' && (packet.body as { message: string }).message.includes('只读'))).toBe(true);
    const old = client({ format: 1 }); await old.create({ size: 128, name: '旧格式宏观分析拒绝', seed: 'old-macro' });
    await expect(old.analyzeMacroHydrology(display)).rejects.toThrow('第四版');
  }, 30000);
  it('reports a read-only timeout without suggesting an unknown map commit', async () => {
    await storeFixture(); const c = client({ timeoutMs: 5000 }); const view = await c.restore(fixture.manifest.draftId), worker = MacroWorker.instances.at(-1)!;
    const before = await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId);
    worker.dropMacro = true; vi.useFakeTimers();
    const pending = c.analyzeMacroHydrology(display), rejected = expect(pending).rejects.toThrow('只读宏观汇流预览长时间无响应；未提交地图修改');
    await vi.advanceTimersByTimeAsync(5001); await rejected; vi.useRealTimers();
    expect(worker.closed).toBe(true); expect(c.current).toBe(view); expect(c.lastCommand).toBeNull();
    expect(await getAtlasStorage(4).exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
  });
});
