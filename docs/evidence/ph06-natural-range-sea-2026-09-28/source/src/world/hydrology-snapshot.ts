import { hashAtlasManifest, isDetailCoastDocument } from './atlas-format';
import { generationExact } from './generation-contract';
import { hashAtlasLockSet } from './generation-locks';
import { OwnedAtlasSession } from './transactions';
import { yieldAtlas, type AtlasControl } from './model';
import { extractDetailCoastBase } from './detail-coast-base';
import { sampleDetailCoastNode } from './detail-coast-field';
import { detailCoastNodeOwner, type DetailCoastField } from './detail-coast-types';
import { createDetailShapeBaseSampler } from './generation/detail-shape-height';
import { HYDROLOGY_LIMITS, type HydrologyInput } from './hydrology-kernel';

export interface HydrologySnapshotHead { draftId: string; revision: number; manifestDigest: string; rootDigest: string }
export interface HydrologyNodeRectangle { originColumn: number; originRow: number; columns: number; rows: number }
export interface HydrologySnapshotRequest { expected: HydrologySnapshotHead; rectangle: HydrologyNodeRectangle }
export interface HydrologySnapshot {
  source: HydrologySnapshotHead & { version: 4; atlasId: string; lockSetDigest: string; rootBinding: 'current-owned-session-head' };
  kernelInput: HydrologyInput;
  boundary: { west: 'crop' | 'world'; north: 'crop' | 'world'; east: 'crop' | 'world'; south: 'crop' | 'world'; hydrologyBoundaryPolicy: 'unresolved-land-edge' };
  /** Existing geography locks are read and identity-bound, never a flow mask. */
  locks: { semantics: 'read-preserve-geography-not-flow-barriers'; lockedCoarseCells: number; refs: { bx: number; by: number; hash: string }[] };
  stats: { sampledNodes: number; explicitFineNodes: number; uniformLandNodes: number; implicitSeaNodes: number; baseSamplerPrepared: boolean; outputTypedArrayBytes: number; sourceCoarseCells: number };
}
const HEX = /^[a-f0-9]{64}$/, BATCH = 512;

/** Read one bounded patch from the real private session. No public raw-data
 * shortcut, second whole-document ingress copy or changes to geography.
 * Durable-root authentication remains the storage/bridge's responsibility. */
export async function extractOwnedHydrologySnapshot(session: OwnedAtlasSession, request: HydrologySnapshotRequest, control?: AtlasControl): Promise<HydrologySnapshot> {
  if (!(session instanceof OwnedAtlasSession) || session.format !== 4) throw new Error('水文抽取仅接受第四版私有地图会话。');
  if (!generationExact(request, ['expected', 'rectangle']) || !generationExact(request.expected, ['draftId', 'revision', 'manifestDigest', 'rootDigest'])
    || !generationExact(request.rectangle, ['originColumn', 'originRow', 'columns', 'rows'])) throw new Error('水文抽取请求身份或细节点范围无效。');
  const expected = { ...request.expected }, rectangle = { ...request.rectangle };
  const { originColumn, originRow, columns, rows } = rectangle, count = columns * rows;
  if (typeof expected.draftId !== 'string' || !Number.isSafeInteger(expected.revision) || expected.revision < 0 || typeof expected.manifestDigest !== 'string' || typeof expected.rootDigest !== 'string' || !HEX.test(expected.manifestDigest) || !HEX.test(expected.rootDigest)
    || ![originColumn, originRow, columns, rows].every(Number.isInteger) || originColumn < 0 || originRow < 0 || columns < 2 || rows < 2
    || columns > HYDROLOGY_LIMITS.side || rows > HYDROLOGY_LIMITS.side || count > HYDROLOGY_LIMITS.nodes || originColumn + columns > 2049 || originRow + rows > 2049) throw new Error('水文抽取身份或范围超过当前预算。');
  const check = () => {
    control?.signal?.throwIfAborted(); const head = session.head;
    if (session.format !== 4 || head.draftId !== expected.draftId || head.revision !== expected.revision
      || head.manifestDigest !== expected.manifestDigest || head.rootDigest !== expected.rootDigest) throw new Error('水文来源会话已变化，需重新读取当前快照。');
  };
  check();
  const guarded: AtlasControl = { signal: control?.signal,
    onProgress: progress => { check(); control?.onProgress?.(progress); check(); },
    yieldTask: async () => { check(); if (control?.yieldTask) await control.yieldTask(); else await new Promise<void>(resolve => setTimeout(resolve, 0)); check(); },
  };
  // This API alone owns the source across awaits and verifies every coarse,
  // lock and fine content hash. Its copied arrays never alias caller data.
  const base = await session.snapshotAsync(guarded); check();
  if (!isDetailCoastDocument(base) || base.manifest.draftId !== expected.draftId || base.manifest.revision !== expected.revision
    || await hashAtlasManifest(base.manifest) !== expected.manifestDigest) throw new Error('水文私有快照与请求清单摘要不一致。');
  check(); const lockSetDigest = await hashAtlasLockSet(base.manifest.constraints, base.manifest.spec); check();
  let lockedCoarseCells = 0, lockWork = 0;
  for (const block of base.locks.values()) for (const flags of block.flags) {
    if (flags) lockedCoarseCells++;
    if (++lockWork % BATCH === 0) await yieldAtlas(guarded, '水文抽取：保留来源锁', lockWork, base.locks.size * 1024);
  }
  let explicitFineNodes = 0, uniformLandNodes = 0, implicitSeaNodes = 0;
  for (let index = 0; index < count; index++) {
    const owner = detailCoastNodeOwner(originColumn + index % columns, originRow + Math.floor(index / columns)), tile = base.detailCoast.get(owner.key);
    if (tile?.mode === 'samples') explicitFineNodes++; else if (tile) uniformLandNodes++; else implicitSeaNodes++;
    if ((index + 1) % BATCH === 0 || index + 1 === count) await yieldAtlas(guarded, '水文抽取：读取实际节点所有者', index + 1, count);
  }
  const baseSamplerPrepared = uniformLandNodes + implicitSeaNodes > 0;
  let sampleBaseElevation: DetailCoastField['sampleBaseElevation'] = () => { throw new Error('已核验的显式细节点不应回退基础高程。'); };
  if (baseSamplerPrepared) {
    // Reconstruct exactly the accepted v4 persisted Hbase for implicit nodes.
    // This does not replace explicit fine elevations with a coarse grid.
    const coarse = await extractDetailCoastBase(base, guarded); check();
    sampleBaseElevation = createDetailShapeBaseSampler(coarse.size, coarse.centersQ, coarse.elevationsMeters); check();
    await yieldAtlas(guarded, '水文抽取：准备既有基础高程', coarse.size ** 2, coarse.size ** 2);
  }
  const coverageQ = new Int16Array(count), groundMeters = new Int16Array(count), field: DetailCoastField = { tiles: base.detailCoast, sampleBaseElevation };
  for (let index = 0; index < count; index++) {
    const node = sampleDetailCoastNode(field, originColumn + index % columns, originRow + Math.floor(index / columns));
    coverageQ[index] = node.coverageQ; groundMeters[index] = node.heightMeters;
    if ((index + 1) % BATCH === 0 || index + 1 === count) await yieldAtlas(guarded, '水文抽取：采样权威细地形', index + 1, count);
  }
  check();
  return {
    source: { ...expected, version: 4, atlasId: base.manifest.atlasId, lockSetDigest, rootBinding: 'current-owned-session-head' },
    kernelInput: { ...rectangle, coverageQ, groundMeters },
    boundary: { west: originColumn === 0 ? 'world' : 'crop', north: originRow === 0 ? 'world' : 'crop', east: originColumn + columns === 2049 ? 'world' : 'crop',
      south: originRow + rows === 2049 ? 'world' : 'crop', hydrologyBoundaryPolicy: 'unresolved-land-edge' },
    locks: { semantics: 'read-preserve-geography-not-flow-barriers', lockedCoarseCells, refs: base.manifest.constraints.lockRefs.map(ref => ({ ...ref })) },
    stats: { sampledNodes: count, explicitFineNodes, uniformLandNodes, implicitSeaNodes, baseSamplerPrepared, outputTypedArrayBytes: coverageQ.byteLength + groundMeters.byteLength,
      sourceCoarseCells: base.manifest.spec.columns * base.manifest.spec.rows },
  };
}
