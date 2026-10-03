import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGenerationDraft, verifyAtlasDocument } from './atlas-format';
import * as Base from './detail-coast-base';
import * as Locks from './generation-locks';
import { hashDetailCoastTile } from './detail-coast-codec';
import { detailCoastKey, detailCoastOwnerLayout } from './detail-coast-types';
import { type AtlasDetailCoastDocument } from './generation-contract';
import { getCellLayerSlot, hashBlock } from './model';
import { OwnedAtlasSession } from './transactions';
import { buildHydrologyKernel, NO_WATER } from './hydrology-kernel';
import { extractOwnedHydrologySnapshot, type HydrologyNodeRectangle } from './hydrology-snapshot';
import { createOwnedHydrologyReader, HYDROLOGY_READER_LIMITS, type HydrologyReaderRequest } from './hydrology-reader-owned';

const fast = { yieldTask: async () => {} }, root = 'a'.repeat(64);
const explicit = { originColumn: 26, originRow: 10, columns: 16, rows: 8 };
const mixed = { originColumn: 62, originRow: 10, columns: 6, rows: 3 };
const implicit = { originColumn: 95, originRow: 10, columns: 6, rows: 3 };
let fixture: AtlasDetailCoastDocument;
beforeAll(async () => {
  fixture = await createGenerationDraft({ size: 128, name: '私有水文读取器真实地理测试', seed: 'hydrology-operation-reader' }, fast, 4);
  for (let id = 0; id < 128 ** 2; id++) { const { block, slot } = getCellLayerSlot(fixture, 'elevation', id); block.values[slot] = 200 + id % 128 * 2 + Math.floor(id / 128); }
  for (const ref of fixture.manifest.blockRefs) ref.hash = await hashBlock(fixture.blocks.get(ref.key)!);
  for (let bx = 0; bx < 2; bx++) {
    const layout = detailCoastOwnerLayout(bx, 0), coverageQ = new Int16Array(layout.count), elevationMeters = new Int16Array(layout.count);
    for (let i = 0; i < layout.count; i++) {
      const x = layout.startX + i % layout.width, y = Math.floor(i / layout.width), sea = x >= 29 && x <= 34;
      coverageQ[i] = sea ? -512 : 512; elevationMeters[i] = sea ? -200 : 600 + (x < 29 ? 29 - x : x - 34) * 10 + y;
    }
    const tile = { format: 'lieguoji-detail-coast-tile', version: 1, bx, by: 0, mode: 'samples', coverageQ, elevationMeters } as const;
    fixture.detailCoast.set(detailCoastKey(bx, 0), tile); fixture.manifest.detailCoast.refs.push({ bx, by: 0, hash: await hashDetailCoastTile(tile) });
  }
  const land = { format: 'lieguoji-detail-coast-tile', version: 1, bx: 2, by: 0, mode: 'land' } as const;
  fixture.detailCoast.set(detailCoastKey(2, 0), land); fixture.manifest.detailCoast.refs.push({ bx: 2, by: 0, hash: await hashDetailCoastTile(land) });
  const lock = { format: 'lieguoji-atlas-cell-locks', version: 1, bx: 0, by: 0, flags: new Uint8Array(1024) } as const;
  lock.flags[1] = 3; lock.flags[34] = 1; fixture.locks.set(Locks.lockKey(0, 0), lock);
  fixture.manifest.constraints.lockRefs = [{ bx: 0, by: 0, hash: await Locks.hashAtlasCellLockBlock(lock) }];
  await verifyAtlasDocument(fixture, fast);
}, 30000);
afterEach(() => vi.restoreAllMocks());
async function setup() {
  const input = structuredClone(fixture), session = await OwnedAtlasSession.open(input, root, fast); let current = true;
  const owner = { session, assertCurrent: () => { if (!current) throw new Error('reader owner lease changed'); } };
  const { draftId, revision, manifestDigest, rootDigest } = session.head;
  const request: HydrologyReaderRequest = { expected: { draftId, revision, manifestDigest, rootDigest }, budget: { maxPages: 8, maxSampledNodes: 2048 } };
  return { input, session, owner, request, detach: () => { current = false; } };
}

describe('one-operation private actual-geography reader', () => {
  it('matches the existing actual extractor across explicit/land/sea owners, snapshots/hashes once and prepares Hbase once', async () => {
    const { session, owner, request } = await setup(), before = session.head;
    const rectangles = [explicit, mixed, implicit, explicit];
    const expected = [];
    for (const rectangle of rectangles) expected.push(await extractOwnedHydrologySnapshot(session, { expected: request.expected, rectangle }, fast));
    const snapshot = vi.spyOn(session, 'snapshotAsync'), lockDigest = vi.spyOn(Locks, 'hashAtlasLockSet'), base = vi.spyOn(Base, 'extractDetailCoastBase');
    const reader = await createOwnedHydrologyReader(owner, request, fast);
    try {
      let total = 0;
      for (let i = 0; i < rectangles.length; i++) {
        const actual = await reader.readPage(rectangles[i]), { operation, ...page } = actual;
        expect(page).toEqual(expected[i]); total += rectangles[i].columns * rectangles[i].rows;
        expect(operation).toEqual({ sequence: i + 1, sampledNodes: total, ...request.budget, baseSamplerPreparations: i ? 1 : 0 });
      }
      expect(snapshot).toHaveBeenCalledTimes(1); expect(lockDigest).toHaveBeenCalledTimes(1); expect(base).toHaveBeenCalledTimes(1);
      const actual = await reader.readPage(explicit), kernel = await buildHydrologyKernel(actual.kernelInput, {}, { yieldControl: async () => {} });
      expect([...kernel.lakeWaterSurfaceMeters].every(value => value === NO_WATER)).toBe(true);
      expect(actual.kernelInput.groundMeters[0]).toBe(640); expect(actual.kernelInput.groundMeters[3]).toBe(-200);
      expect(session.head).toEqual(before);
    } finally { reader.close(); }
  });

  it('captures caller identity/control and gives each page independent arrays, metadata, lock refs and accounting', async () => {
    const { input, session, owner, request } = await setup(), original = structuredClone(request), rectangle = { ...explicit };
    let mutate = false;
    const control = { ...fast, onProgress: () => {
      if (!mutate) return; mutate = false; rectangle.columns = 2; request.expected.revision = 99; request.budget.maxPages = 1;
      input.blocks.clear(); input.detailCoast.clear(); input.locks.clear();
    } };
    const reader = await createOwnedHydrologyReader(owner, request, control);
    try {
      mutate = true;
      const first = await reader.readPage(rectangle); expect(first.kernelInput.columns).toBe(16); expect(first.source.revision).toBe(original.expected.revision);
      first.kernelInput.coverageQ.fill(-512); first.kernelInput.groundMeters.fill(-200); first.source.revision = 99;
      first.locks.refs[0].hash = '0'.repeat(64); first.operation.sequence = 999; first.operation.maxPages = 999; first.stats.sampledNodes = 999;
      first.boundary.east = 'world'; control.onProgress = () => { throw new Error('must not swap the captured callback'); };
      const next = await reader.readPage(explicit);
      expect(next.kernelInput.groundMeters[0]).toBe(640); expect(next.kernelInput.coverageQ[0]).toBe(512);
      expect(next.source).toMatchObject(original.expected); expect(next.locks.refs).toEqual(fixture.manifest.constraints.lockRefs);
      expect(next.stats.sampledNodes).toBe(128); expect(next.operation).toMatchObject({ sequence: 2, sampledNodes: 256, maxPages: 8 });
      expect(next.boundary.east).toBe('crop'); expect(next.kernelInput.groundMeters.buffer).not.toBe(first.kernelInput.groundMeters.buffer);
      expect(session.head.revision).toBe(0); expect(Object.keys(reader).sort()).toEqual(['close', 'readMacroGrid', 'readPage']);
    } finally { reader.close(); }
  });

  it('permanently invalidates accepted work on owner/head/callback/abort/close changes, including suspended awaits', async () => {
    for (const mode of ['owner', 'head', 'callback', 'abort', 'close'] as const) {
      const { session, owner, request, detach } = await setup(), controller = new AbortController(); let armed = false, reached = false;
      const next = structuredClone(fixture); next.manifest.revision++;
      const prepared = mode === 'head' ? await session.prepareReplacement(next, `edit-${crypto.randomUUID()}`, '读取器来源变化', fast) : undefined;
      const reader: Awaited<ReturnType<typeof createOwnedHydrologyReader>> = await createOwnedHydrologyReader(owner, request, { signal: controller.signal,
        onProgress: progress => { if (armed && progress.stage === '水文读取器：采样权威细地形') reached = true; },
        yieldTask: async () => {
          await Promise.resolve();
          if (!armed || !reached) return; armed = false;
          if (mode === 'owner') detach();
          if (mode === 'head' && prepared) session.publishReplacement(prepared.candidateId, { draftId: fixture.manifest.draftId, commandId: prepared.commandId,
            revision: prepared.revision, manifestDigest: prepared.manifestDigest, rootDigest: 'b'.repeat(64) });
          if (mode === 'callback') throw new Error('deliberate suspended failure');
          if (mode === 'abort') controller.abort();
          if (mode === 'close') reader!.close();
        },
      });
      armed = true; await expect(reader.readPage(explicit)).rejects.toThrow(); expect(reached).toBe(true);
      await expect(reader.readPage(explicit)).rejects.toThrow('已关闭或失效'); reader.close();
      expect(session.head.revision).toBe(mode === 'head' ? 1 : 0);
    }
    const detached = await setup(); detached.detach(); const spy = vi.spyOn(detached.session, 'snapshotAsync');
    await expect(createOwnedHydrologyReader(detached.owner, detached.request, fast)).rejects.toThrow('owner lease'); expect(spy).not.toHaveBeenCalled();
    const idle = await setup(), reader = await createOwnedHydrologyReader(idle.owner, idle.request, fast);
    reader.close(); reader.close(); await expect(reader.readPage(explicit)).rejects.toThrow('已关闭或失效');
  });

  it('preflights source and strict page/cumulative budgets, counts repeats, and rejects concurrent reads without consuming a page', async () => {
    const { session, owner, request } = await setup(), snapshot = vi.spyOn(session, 'snapshotAsync');
    for (const budget of [{ maxPages: 0, maxSampledNodes: 4 }, { maxPages: 65, maxSampledNodes: 4 }, { maxPages: 1, maxSampledNodes: 262145 },
      { maxPages: 64, maxSampledNodes: HYDROLOGY_READER_LIMITS.sampledNodes + 1 }, { maxPages: 1, maxSampledNodes: 3 }]) {
      await expect(createOwnedHydrologyReader(owner, { ...request, budget }, fast)).rejects.toThrow('累计工作预算');
    }
    await expect(createOwnedHydrologyReader(owner, { ...request, expected: { ...request.expected, rootDigest: 'b'.repeat(64) } }, fast)).rejects.toThrow('来源会话已变化');
    const getter = vi.fn(() => request.expected), malformed = { ...request };
    Object.defineProperty(malformed, 'expected', { enumerable: true, get: getter });
    await expect(createOwnedHydrologyReader(owner, malformed, fast)).rejects.toThrow('字段无效'); expect(getter).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
    const reader = await createOwnedHydrologyReader(owner, { ...request, budget: { maxPages: 3, maxSampledNodes: 8 } }, fast);
    const small = { originColumn: 26, originRow: 10, columns: 2, rows: 2 };
    try {
      for (const rectangle of [{ ...small, columns: 513 }, { ...small, originColumn: 2048 }, { ...small, rows: 1 }, { ...small, originRow: -1 }]) await expect(reader.readPage(rectangle)).rejects.toThrow('预算');
      const bad: HydrologyNodeRectangle = { ...small }; Object.defineProperty(bad, 'columns', { enumerable: true, get: getter });
      await expect(reader.readPage(bad)).rejects.toThrow('字段无效'); expect(getter).not.toHaveBeenCalled();
      const pending = reader.readPage(small); await expect(reader.readPage(small)).rejects.toThrow('串行');
      expect((await pending).operation.sequence).toBe(1);
      const second = await reader.readPage(small); expect(second.operation).toMatchObject({ sequence: 2, sampledNodes: 8 });
      await expect(reader.readPage(small)).rejects.toThrow('累计页面或采样预算'); expect(snapshot).toHaveBeenCalledTimes(1);
    } finally { reader.close(); }
    const one = await createOwnedHydrologyReader(owner, { ...request, budget: { maxPages: 1, maxSampledNodes: 8 } }, fast);
    try { await one.readPage(small); await expect(one.readPage(small)).rejects.toThrow('累计页面或采样预算'); } finally { one.close(); }
  });
});

describe('fixed full-world macro read alongside unchanged fine pages', () => {
  it('samples actual stride-eight owner nodes, prepares Hbase once, and keeps one snapshot and independent copies', async () => {
    const { owner, session, request } = await setup();
    const snapshot = vi.spyOn(session, 'snapshotAsync'), base = vi.spyOn(Base, 'extractDetailCoastBase');
    const reader = await createOwnedHydrologyReader(owner, { ...request, budget: { maxPages: 3, maxSampledNodes: 132102 } }, fast);
    try {
      const macro = await reader.readMacroGrid();
      expect(macro.grid).toEqual({ columns: 257, rows: 257, stepWorld: 16, worldSize: 4096, coverage: 'complete-fixed-grid', sampleSemantics: 'actual-fine-owner-nodes-at-stride-8' });
      expect(macro.coverageQ).toHaveLength(66049); expect(macro.groundMeters[0]).toBe(890); expect(macro.groundMeters[4]).toBe(-200);
      expect(macro.coverageQ[0]).toBe(512); expect(macro.coverageQ[4]).toBe(-512); expect(macro.coverageQ[8]).toBeGreaterThan(0);
      expect(macro.groundMeters[8]).toBeGreaterThan(0); expect(macro.coverageQ.at(-1)).toBeLessThan(0);
      expect(macro.stats.explicitFineNodes).toBeGreaterThan(0); expect(macro.stats.uniformLandNodes).toBeGreaterThan(0); expect(macro.stats.implicitSeaNodes).toBeGreaterThan(0);
      expect(macro.stats.explicitFineNodes + macro.stats.uniformLandNodes + macro.stats.implicitSeaNodes).toBe(66049);
      expect(macro.stats.outputTypedArrayBytes).toBe(264196); expect(macro.operation).toMatchObject({ sequence: 1, sampledNodes: 66049, baseSamplerPreparations: 1 });
      macro.source.revision = 99; macro.locks.refs[0].hash = '0'.repeat(64); macro.coverageQ.fill(-512); macro.groundMeters.fill(-10);
      const next = await reader.readMacroGrid(); expect(next.source.revision).toBe(0); expect(next.locks.refs).toEqual(fixture.manifest.constraints.lockRefs);
      expect(next.groundMeters[0]).toBe(890); expect(next.groundMeters.buffer).not.toBe(macro.groundMeters.buffer);
      expect(next.operation).toMatchObject({ sequence: 2, sampledNodes: 132098 });
      const page = await reader.readPage({ originColumn: 26, originRow: 10, columns: 2, rows: 2 });
      expect(page.kernelInput.groundMeters[0]).toBe(640); expect(page.operation).toMatchObject({ sequence: 3, sampledNodes: 132102 });
      expect(snapshot).toHaveBeenCalledTimes(1); expect(base).toHaveBeenCalledTimes(1);
    } finally { reader.close(); }
  });

  it('prepays actual macro samples and serializes macro/fine reads without poisoning rejected work', async () => {
    const { owner, request } = await setup(), budget = { maxPages: 3, maxSampledNodes: 66057 };
    const reader = await createOwnedHydrologyReader(owner, { ...request, budget }, fast), small = { originColumn: 26, originRow: 10, columns: 2, rows: 2 };
    try {
      const pending = reader.readMacroGrid();
      await expect(reader.readMacroGrid()).rejects.toThrow('串行'); await expect(reader.readPage(small)).rejects.toThrow('串行');
      expect((await pending).operation.sampledNodes).toBe(66049);
      await expect(reader.readMacroGrid()).rejects.toThrow('累计页面或采样预算');
      expect((await reader.readPage(small)).operation.sequence).toBe(2); expect((await reader.readPage(small)).operation.sampledNodes).toBe(66057);
    } finally { reader.close(); }
    const tooSmall = await createOwnedHydrologyReader(owner, { ...request, budget: { maxPages: 2, maxSampledNodes: 66048 } }, fast);
    try { await expect(tooSmall.readMacroGrid()).rejects.toThrow('累计页面或采样预算'); expect((await tooSmall.readPage(small)).operation.sequence).toBe(1); } finally { tooSmall.close(); }
  });

  it('invalidates accepted macro reads on owner, head, abort, callback and close changes without returning half a grid', async () => {
    for (const mode of ['owner', 'head', 'callback', 'abort', 'close'] as const) {
      const { session, owner, request, detach } = await setup(), controller = new AbortController(); let armed = false, reached = false;
      const changed = structuredClone(fixture); changed.manifest.revision++;
      const prepared = mode === 'head' ? await session.prepareReplacement(changed, `macro-edit-${crypto.randomUUID()}`, '宏观读取来源变化', fast) : undefined;
      const reader: Awaited<ReturnType<typeof createOwnedHydrologyReader>> = await createOwnedHydrologyReader(owner,
        { ...request, budget: { maxPages: 2, maxSampledNodes: 132098 } }, { signal: controller.signal,
          onProgress: progress => { if (armed && progress.stage === '宏观水文读取器：采样权威细地形') reached = true; },
          yieldTask: async () => {
            await Promise.resolve(); if (!armed || !reached) return; armed = false;
            if (mode === 'owner') detach();
            if (mode === 'head' && prepared) session.publishReplacement(prepared.candidateId, { draftId: fixture.manifest.draftId, commandId: prepared.commandId,
              revision: prepared.revision, manifestDigest: prepared.manifestDigest, rootDigest: 'b'.repeat(64) });
            if (mode === 'abort') controller.abort();
            if (mode === 'close') reader.close();
            if (mode === 'callback') throw new Error('macro callback failed');
          },
        });
      armed = true; await expect(reader.readMacroGrid()).rejects.toThrow(); expect(reached).toBe(true);
      await expect(reader.readMacroGrid()).rejects.toThrow('已关闭或失效');
      await expect(reader.readPage(explicit)).rejects.toThrow('已关闭或失效'); reader.close();
    }
  });
});
