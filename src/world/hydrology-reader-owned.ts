import { MACRO_FLOW, MACRO_GRID, type HydrologyMacroGrid } from './hydrology-macro-contract';
import { hashAtlasManifest, isDetailCoastDocument } from './atlas-format';
import { generationExact, type AtlasDetailCoastDocument } from './generation-contract';
import { hashAtlasLockSet } from './generation-locks';
import { OwnedAtlasSession } from './transactions';
import { yieldAtlas, type AtlasControl } from './model';
import { extractDetailCoastBase } from './detail-coast-base';
import { sampleDetailCoastNode } from './detail-coast-field';
import { detailCoastNodeOwner, type DetailCoastField } from './detail-coast-types';
import { createDetailShapeBaseSampler } from './generation/detail-shape-height';
import { HYDROLOGY_LIMITS } from './hydrology-kernel';
import type { HydrologyNodeRectangle, HydrologySnapshot, HydrologySnapshotHead } from './hydrology-snapshot';

/** Work limits for one private operation, not a whole-world coverage promise.
 * Repeated/overlapping pages consume samples again. No output-page cache. */
export const HYDROLOGY_READER_LIMITS = Object.freeze({ pages: 64, sampledNodes: HYDROLOGY_LIMITS.nodes * 16 });
export interface HydrologyReaderOwner { session: OwnedAtlasSession; assertCurrent: () => void }
export interface HydrologyReaderRequest {
  expected: HydrologySnapshotHead;
  budget: { maxPages: number; maxSampledNodes: number };
}
export interface HydrologyReaderPage extends HydrologySnapshot {
  operation: { sequence: number; sampledNodes: number; maxPages: number; maxSampledNodes: number; baseSamplerPreparations: 0 | 1 };
}
export interface OwnedHydrologyReader {
  readPage: (rectangle: HydrologyNodeRectangle) => Promise<HydrologyReaderPage>;
  readMacroGrid: () => Promise<HydrologyMacroGrid>;
  close: () => void;
}
const HEX = /^[a-f0-9]{64}$/, BATCH = 512;
const sameHead = (a: HydrologySnapshotHead, b: HydrologySnapshotHead) => a.draftId === b.draftId && a.revision === b.revision
  && a.manifestDigest === b.manifestDigest && a.rootDigest === b.rootDigest;

/** Internal capability. assertCurrent is supplied by a trusted session owner;
 * caller metadata and previously returned pages cannot authorize another read.
 * Every accepted read is serial and prepaid. Once work starts, any failure
 * invalidates the reader; no incomplete page is published or resumed. */
export async function createOwnedHydrologyReader(owner: HydrologyReaderOwner, request: HydrologyReaderRequest, control?: AtlasControl): Promise<OwnedHydrologyReader> {
  if (!generationExact(owner, ['session', 'assertCurrent']) || !(owner.session instanceof OwnedAtlasSession) || typeof owner.assertCurrent !== 'function'
    || !generationExact(request, ['expected', 'budget']) || !generationExact(request.expected, ['draftId', 'revision', 'manifestDigest', 'rootDigest'])
    || !generationExact(request.budget, ['maxPages', 'maxSampledNodes'])) throw new Error('水文读取器私有来源或预算字段无效。');
  const expected = { ...request.expected }, budget = { ...request.budget };
  let lease: { session: OwnedAtlasSession; assertCurrent: () => void; signal?: AbortSignal; onProgress?: AtlasControl['onProgress']; yieldTask?: AtlasControl['yieldTask'] }
    | undefined = { session: owner.session, assertCurrent: owner.assertCurrent, signal: control?.signal, onProgress: control?.onProgress, yieldTask: control?.yieldTask };
  if (typeof expected.draftId !== 'string' || expected.draftId.length < 1 || expected.draftId.length > 200
    || !Number.isSafeInteger(expected.revision) || expected.revision < 0 || typeof expected.manifestDigest !== 'string' || !HEX.test(expected.manifestDigest)
    || typeof expected.rootDigest !== 'string' || !HEX.test(expected.rootDigest)
    || !Number.isSafeInteger(budget.maxPages) || budget.maxPages < 1 || budget.maxPages > HYDROLOGY_READER_LIMITS.pages
    || !Number.isSafeInteger(budget.maxSampledNodes) || budget.maxSampledNodes < 4 || budget.maxSampledNodes > HYDROLOGY_READER_LIMITS.sampledNodes
    || budget.maxSampledNodes > budget.maxPages * HYDROLOGY_LIMITS.nodes) throw new Error('水文读取器身份或累计工作预算无效。');
  let state: 'active' | 'closed' | 'invalid' = 'active', busy = false, pages = 0, sampledNodes = 0;
  let snapshot: AtlasDetailCoastDocument | undefined, source: HydrologySnapshot['source'] | undefined, locks: HydrologySnapshot['locks'] | undefined;
  let sampleBaseElevation: DetailCoastField['sampleBaseElevation'] | undefined;
  const release = (next: 'closed' | 'invalid') => { state = next; snapshot = undefined; source = undefined; locks = undefined; sampleBaseElevation = undefined; lease = undefined; };
  const check = () => {
    const active = lease;
    if (state !== 'active' || !active) throw new Error('水文读取器已关闭或失效。');
    try {
      active.signal?.throwIfAborted(); active.assertCurrent(); active.signal?.throwIfAborted();
      if (state !== 'active') throw new Error('水文读取器已关闭或失效。');
      if (active.session.format !== 4 || !sameHead(active.session.head, expected)) throw new Error('水文读取器来源会话已变化。');
    } catch (error) { release('invalid'); throw error; }
  };
  const guarded: AtlasControl = { get signal() { return lease?.signal; },
    onProgress: progress => { check(); lease?.onProgress?.(progress); check(); },
    yieldTask: async () => { check(); const yieldTask = lease?.yieldTask; if (yieldTask) await yieldTask(); else await new Promise<void>(resolve => setTimeout(resolve, 0)); check(); },
  };
  try {
    check(); const copied = await lease!.session.snapshotAsync(guarded); check();
    if (!isDetailCoastDocument(copied) || copied.manifest.draftId !== expected.draftId || copied.manifest.revision !== expected.revision) throw new Error('水文读取器快照身份不一致。');
    snapshot = copied;
    check(); const manifestDigest = await hashAtlasManifest(copied.manifest); check();
    if (manifestDigest !== expected.manifestDigest) throw new Error('水文读取器清单摘要不一致。');
    check(); const lockSetDigest = await hashAtlasLockSet(copied.manifest.constraints, copied.manifest.spec); check();
    let lockedCoarseCells = 0, work = 0;
    for (const block of copied.locks.values()) for (const flags of block.flags) {
      if (flags) lockedCoarseCells++;
      if (++work % BATCH === 0) { check(); await yieldAtlas(guarded, '水文读取器：绑定来源锁', work, copied.locks.size * 1024); check(); }
    }
    source = { ...expected, version: 4, atlasId: copied.manifest.atlasId, lockSetDigest, rootBinding: 'current-owned-session-head' };
    locks = { semantics: 'read-preserve-geography-not-flow-barriers', lockedCoarseCells, refs: copied.manifest.constraints.lockRefs.map(ref => ({ ...ref })) };
    check();
  } catch (error) { release('invalid'); throw error; }

  const readPage = async (raw: HydrologyNodeRectangle): Promise<HydrologyReaderPage> => {
    check();
    // Rejected requests do no work and leave an otherwise valid reader usable.
    // A concurrent request never poisons the already accepted in-flight page.
    if (busy) throw new Error('水文读取器仅允许串行读取页面。');
    if (!generationExact(raw, ['originColumn', 'originRow', 'columns', 'rows'])) throw new Error('水文页面范围字段无效。');
    const rectangle = { ...raw }, { originColumn, originRow, columns, rows } = rectangle, count = columns * rows;
    if (![originColumn, originRow, columns, rows].every(Number.isSafeInteger) || originColumn < 0 || originRow < 0 || columns < 2 || rows < 2
      || columns > HYDROLOGY_LIMITS.side || rows > HYDROLOGY_LIMITS.side || count > HYDROLOGY_LIMITS.nodes
      || originColumn + columns > 2049 || originRow + rows > 2049) throw new Error('水文页面超过现有细节点预算。');
    if (pages + 1 > budget.maxPages || sampledNodes + count > budget.maxSampledNodes) throw new Error('水文读取器累计页面或采样预算耗尽。');
    busy = true; pages++; sampledNodes += count;
    try {
      check();
      const base = snapshot;
      if (!base || !source || !locks) throw new Error('水文读取器私有来源已释放。');
      let explicitFineNodes = 0, uniformLandNodes = 0, implicitSeaNodes = 0;
      for (let index = 0; index < count; index++) {
        const nodeOwner = detailCoastNodeOwner(originColumn + index % columns, originRow + Math.floor(index / columns)), tile = base.detailCoast.get(nodeOwner.key);
        if (tile?.mode === 'samples') explicitFineNodes++; else if (tile) uniformLandNodes++; else implicitSeaNodes++;
        if ((index + 1) % BATCH === 0 || index + 1 === count) { check(); await yieldAtlas(guarded, '水文读取器：读取实际节点所有者', index + 1, count); check(); }
      }
      const baseSamplerPrepared = uniformLandNodes + implicitSeaNodes > 0;
      if (baseSamplerPrepared && !sampleBaseElevation) {
        check(); const coarse = await extractDetailCoastBase(base, guarded); check();
        sampleBaseElevation = createDetailShapeBaseSampler(coarse.size, coarse.centersQ, coarse.elevationsMeters); check();
        check(); await yieldAtlas(guarded, '水文读取器：准备既有基础高程', coarse.size ** 2, coarse.size ** 2); check();
      }
      const field: DetailCoastField = { tiles: base.detailCoast, sampleBaseElevation: sampleBaseElevation ?? (() => { throw new Error('显式细节点不得回退基础高程。'); }) };
      const coverageQ = new Int16Array(count), groundMeters = new Int16Array(count);
      for (let index = 0; index < count; index++) {
        const node = sampleDetailCoastNode(field, originColumn + index % columns, originRow + Math.floor(index / columns));
        coverageQ[index] = node.coverageQ; groundMeters[index] = node.heightMeters;
        if ((index + 1) % BATCH === 0 || index + 1 === count) { check(); await yieldAtlas(guarded, '水文读取器：采样权威细地形', index + 1, count); check(); }
      }
      check();
      return {
        source: { ...source }, kernelInput: { ...rectangle, coverageQ, groundMeters },
        boundary: { west: originColumn === 0 ? 'world' : 'crop', north: originRow === 0 ? 'world' : 'crop', east: originColumn + columns === 2049 ? 'world' : 'crop',
          south: originRow + rows === 2049 ? 'world' : 'crop', hydrologyBoundaryPolicy: 'unresolved-land-edge' },
        locks: { ...locks, refs: locks.refs.map(ref => ({ ...ref })) },
        stats: { sampledNodes: count, explicitFineNodes, uniformLandNodes, implicitSeaNodes, baseSamplerPrepared,
          outputTypedArrayBytes: coverageQ.byteLength + groundMeters.byteLength, sourceCoarseCells: base.manifest.spec.columns * base.manifest.spec.rows },
        operation: { sequence: pages, sampledNodes, ...budget, baseSamplerPreparations: sampleBaseElevation ? 1 : 0 },
      };
    } catch (error) { release('invalid'); throw error; } finally { busy = false; }
  };
  const readMacroGrid = async (): Promise<HydrologyMacroGrid> => {
    check();
    // Rejected requests do no work and leave an otherwise valid reader usable.
    // A concurrent request never poisons the already accepted in-flight page.
    if (busy) throw new Error('水文读取器仅允许串行读取页面。');
    const count = MACRO_FLOW.nodes;
    if (pages + 1 > budget.maxPages || sampledNodes + count > budget.maxSampledNodes) throw new Error('水文读取器累计页面或采样预算耗尽。');
    busy = true; pages++; sampledNodes += count;
    try {
      check();
      const base = snapshot;
      if (!base || !source || !locks) throw new Error('水文读取器私有来源已释放。');
      let explicitFineNodes = 0, uniformLandNodes = 0, implicitSeaNodes = 0;
      for (let index = 0; index < count; index++) {
        const nodeOwner = detailCoastNodeOwner((index % MACRO_FLOW.side) * MACRO_FLOW.fineNodeStride, Math.floor(index / MACRO_FLOW.side) * MACRO_FLOW.fineNodeStride), tile = base.detailCoast.get(nodeOwner.key);
        if (tile?.mode === 'samples') explicitFineNodes++; else if (tile) uniformLandNodes++; else implicitSeaNodes++;
        if ((index + 1) % BATCH === 0 || index + 1 === count) { check(); await yieldAtlas(guarded, '宏观水文读取器：读取实际节点所有者', index + 1, count); check(); }
      }
      const baseSamplerPrepared = uniformLandNodes + implicitSeaNodes > 0;
      if (baseSamplerPrepared && !sampleBaseElevation) {
        check(); const coarse = await extractDetailCoastBase(base, guarded); check();
        sampleBaseElevation = createDetailShapeBaseSampler(coarse.size, coarse.centersQ, coarse.elevationsMeters); check();
        check(); await yieldAtlas(guarded, '宏观水文读取器：准备既有基础高程', coarse.size ** 2, coarse.size ** 2); check();
      }
      const field: DetailCoastField = { tiles: base.detailCoast, sampleBaseElevation: sampleBaseElevation ?? (() => { throw new Error('显式细节点不得回退基础高程。'); }) };
      const coverageQ = new Int16Array(count), groundMeters = new Int16Array(count);
      for (let index = 0; index < count; index++) {
        const node = sampleDetailCoastNode(field, (index % MACRO_FLOW.side) * MACRO_FLOW.fineNodeStride, Math.floor(index / MACRO_FLOW.side) * MACRO_FLOW.fineNodeStride);
        coverageQ[index] = node.coverageQ; groundMeters[index] = node.heightMeters;
        if ((index + 1) % BATCH === 0 || index + 1 === count) { check(); await yieldAtlas(guarded, '宏观水文读取器：采样权威细地形', index + 1, count); check(); }
      }
      check();
      return {
        format: 'lieguoji-hydrology-macro-grid', version: 1, grid: { ...MACRO_GRID },
        source: { ...source }, coverageQ, groundMeters,
        locks: { ...locks, refs: locks.refs.map(ref => ({ ...ref })) },
        stats: { sampledNodes: count, explicitFineNodes, uniformLandNodes, implicitSeaNodes, baseSamplerPrepared,
          outputTypedArrayBytes: coverageQ.byteLength + groundMeters.byteLength, sourceCoarseCells: base.manifest.spec.columns * base.manifest.spec.rows },
        operation: { sequence: pages, sampledNodes, ...budget, baseSamplerPreparations: sampleBaseElevation ? 1 : 0 },
      };
    } catch (error) { release('invalid'); throw error; } finally { busy = false; }
  };
  return Object.freeze({ readPage, readMacroGrid, close: () => { if (state === 'active') release('closed'); } });
}
