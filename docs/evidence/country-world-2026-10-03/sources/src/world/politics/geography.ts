import { cloneVerifiedAtlasDocument, decodeAtlasManifest, encodeAtlasManifest, isDetailCoastDocument, verifyAtlasDocument, type AtlasDocument } from '../atlas-format';
import { decodeDetailCoastTile, encodeDetailCoastTile } from '../detail-coast-codec';
import { extractDetailCoastBase } from '../detail-coast-base';
import { buildDetailCoastSurface, detailCellsIntersectingQuad, pickDetailCoastSurface } from '../detail-coast-geometry';
import { detailCoastKey, type DetailCoastField, type DetailCoastPointQ } from '../detail-coast-types';
import { generationArray, generationCanonical, generationDigest, generationExact, generationHash, generationInt, type AtlasDetailCoastDocument } from '../generation-contract';
import { decodeAtlasCellLockBlock, encodeAtlasCellLockBlock, lockKey } from '../generation-locks';
import { createDetailShapeBaseSampler } from '../generation/detail-shape-height';
import { blockKey, decodeBlock, encodeBlock, yieldAtlas, type AtlasControl } from '../model';
import { createSpatialIndexAsync, type SpatialIndex } from '../spatial-index';
import { getAtlasStorage, type AtlasReadHandle } from '../storage';
import { getCellQuad } from '../topology';

export interface CountrySource { draftId: string; revision: number; rootDigest: string; manifestDigest: string; atlasFormat: 4 }
export interface CountryEncodedBlock { key: string; sha256: string; bytes: Uint8Array }
/** An independently owned snapshot of the original Atlas identity. sourceRoot
 * contains the original stored root, not a synthetic head for the country DB. */
export interface CountryGeographyRecord {
  format: 'lieguoji-country-geography'; version: 1; source: CountrySource;
  sourceRoot: Uint8Array; manifest: Uint8Array;
  blocks: CountryEncodedBlock[]; locks: CountryEncodedBlock[]; detailCoast: CountryEncodedBlock[];
  /** Original encoded payload bytes; excludes JS/IDB/container overhead. */
  encodedBytes: number; sha256: string;
}
export const COUNTRY_GEOGRAPHY_LIMITS = Object.freeze({ encodedBytes: 128 * 1024 * 1024, manifestBytes: 16 * 1024 * 1024,
  partBytes: 64 * 1024, blocks: 1024, locks: 256, detailCoast: 4096, claimCells: 1024, fineCellsPerCell: 4096 });
const WORLD_Q = 4096 * 256, encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const UUID = /^atlas-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, index) => value === b[index]);
const controlCopy = (control?: AtlasControl): AtlasControl => ({ signal: control?.signal, onProgress: control?.onProgress, yieldTask: control?.yieldTask });
export function validateCountrySource(raw: unknown): raw is CountrySource {
  return generationExact(raw, ['draftId', 'revision', 'rootDigest', 'manifestDigest', 'atlasFormat'])
    && typeof raw.draftId === 'string' && UUID.test(raw.draftId) && generationInt(raw.revision)
    && generationHash(raw.rootDigest) && generationHash(raw.manifestDigest) && raw.atlasFormat === 4;
}
function ownSource(raw: unknown): CountrySource {
  if (!validateCountrySource(raw)) throw new Error('建国地理来源身份无效。');
  return { draftId: raw.draftId, revision: raw.revision, rootDigest: raw.rootDigest, manifestDigest: raw.manifestDigest, atlasFormat: 4 };
}
const verifiedGeographies = new WeakMap<AtlasDocument, { source: CountrySource; data: AtlasDetailCoastDocument }>();
/** Only successful decoding establishes provenance. A copied or manually
 * assembled view does not inherit authority; callers receive an identity copy. */
export function countryGeographySource(data: AtlasDocument): CountrySource {
  const verified = verifiedGeographies.get(data);
  if (!verified) throw new Error('国家地理对象没有已验证的独立来源身份。');
  return { ...verified.source };
}
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer')!.get!;
const typedOffset = Object.getOwnPropertyDescriptor(typedPrototype, 'byteOffset')!.get!;
const typedLength = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength')!.get!;
function ownBytes(raw: unknown, limit: number): Uint8Array {
  if (!raw || Object.getPrototypeOf(raw) !== Uint8Array.prototype) throw new Error('建国地理需要原始 Uint8Array 编码。');
  const buffer: unknown = typedBuffer.call(raw), offset: number = typedOffset.call(raw), length: number = typedLength.call(raw);
  if (!buffer || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype || Reflect.ownKeys(buffer).length
    || !Number.isSafeInteger(length) || length < 1 || length > limit) throw new Error('建国地理编码或字节预算无效。');
  return new Uint8Array(ArrayBuffer.prototype.slice.call(buffer, offset, offset + length) as ArrayBuffer);
}
function ownRecord(raw: unknown): CountryGeographyRecord {
  if (!generationExact(raw, ['format', 'version', 'source', 'sourceRoot', 'manifest', 'blocks', 'locks', 'detailCoast', 'encodedBytes', 'sha256'])
    || raw.format !== 'lieguoji-country-geography' || raw.version !== 1 || !generationHash(raw.sha256)
    || !generationInt(raw.encodedBytes, 1, COUNTRY_GEOGRAPHY_LIMITS.encodedBytes)) throw new Error('建国地理封套、版本或预算无效。');
  const source = ownSource(raw.source), sourceRoot = ownBytes(raw.sourceRoot, 4096), manifest = ownBytes(raw.manifest, COUNTRY_GEOGRAPHY_LIMITS.manifestBytes);
  let bytes = sourceRoot.length + manifest.length;
  const parts = (value: unknown, limit: number): CountryEncodedBlock[] => {
    if (!Array.isArray(value) || value.length > limit || !generationArray(value)) throw new Error('建国地理分块数预算无效。');
    const seen = new Set<string>();
    return value.map(row => {
      if (!generationExact(row, ['key', 'sha256', 'bytes']) || typeof row.key !== 'string' || row.key.length > 80 || !generationHash(row.sha256) || seen.has(row.key)) throw new Error('建国地理分块引用重复或无效。');
      seen.add(row.key); const owned = ownBytes(row.bytes, COUNTRY_GEOGRAPHY_LIMITS.partBytes); bytes += owned.length;
      if (bytes > COUNTRY_GEOGRAPHY_LIMITS.encodedBytes) throw new Error('建国地理总字节预算超限。');
      return { key: row.key, sha256: row.sha256, bytes: owned };
    });
  };
  const blocks = parts(raw.blocks, COUNTRY_GEOGRAPHY_LIMITS.blocks), locks = parts(raw.locks, COUNTRY_GEOGRAPHY_LIMITS.locks), detailCoast = parts(raw.detailCoast, COUNTRY_GEOGRAPHY_LIMITS.detailCoast);
  if (bytes !== raw.encodedBytes) throw new Error('建国地理总字节数不一致。');
  return { format: 'lieguoji-country-geography', version: 1, source, sourceRoot, manifest, blocks, locks, detailCoast, encodedBytes: bytes, sha256: raw.sha256 };
}
async function recordDigest(record: Omit<CountryGeographyRecord, 'sha256'>): Promise<string> {
  const refs = (parts: CountryEncodedBlock[]) => parts.map(part => ({ key: part.key, sha256: part.sha256, bytes: part.bytes.length }));
  return generationDigest(encoder.encode(generationCanonical({ format: record.format, version: record.version, source: record.source,
    sourceRoot: await generationDigest(record.sourceRoot), manifest: await generationDigest(record.manifest),
    blocks: refs(record.blocks), locks: refs(record.locks), detailCoast: refs(record.detailCoast), encodedBytes: record.encodedBytes })));
}
function checkHandle(handle: AtlasReadHandle | null, source: CountrySource): AtlasDetailCoastDocument['manifest'] {
  if (!handle || handle.source !== 'current' || handle.readOnly || handle.manifest.version !== 4
    || handle.draftId !== source.draftId || handle.manifest.draftId !== source.draftId || handle.manifest.revision !== source.revision
    || handle.root.revision !== source.revision || handle.root.rootDigest !== source.rootDigest
    || handle.manifestDigest !== source.manifestDigest || handle.root.currentManifest !== source.manifestDigest) throw new Error('建国地理来源 current 已变化或不是指定版本。');
  return handle.manifest;
}
/** Only reads the explicitly selected current draft. The returned record owns
 * all bytes; no country operation writes or relies on the source Atlas DB. */
export async function prepareCountryGeography(raw: CountrySource, control?: AtlasControl): Promise<CountryGeographyRecord> {
  const source = ownSource(raw), guarded = controlCopy(control); guarded.signal?.throwIfAborted();
  const api = getAtlasStorage(4), session = await api.openAtlasStorageSession(source.draftId, guarded);
  if (!session) throw new Error('建国地理来源草稿不存在。');
  try {
    const handle = session.handle;
    const data: AtlasDetailCoastDocument = { manifest: checkHandle(handle, source), blocks: new Map(), locks: new Map(), detailCoast: new Map() };
    let cursor: number | null = 0;
    do {
      guarded.signal?.throwIfAborted(); const page = await session.readPage(cursor, guarded);
      for (const block of page.blocks) { const key = blockKey(block.layer, block.bx, block.by); if (data.blocks.has(key)) throw new Error('来源地理块重复。'); data.blocks.set(key, block); }
      for (const block of page.locks ?? []) { const key = lockKey(block.bx, block.by); if (data.locks.has(key)) throw new Error('来源地理锁重复。'); data.locks.set(key, block); }
      for (const tile of page.detailCoast ?? []) { const key = detailCoastKey(tile.bx, tile.by); if (data.detailCoast.has(key)) throw new Error('来源细海岸块重复。'); data.detailCoast.set(key, tile); }
      cursor = page.nextCursor;
    } while (cursor !== null);
    await verifyAtlasDocument(data, guarded);
    const sourceRoot = api.encodeAtlasRoot(handle.root), manifest = encodeAtlasManifest(data.manifest);
    const blocks: CountryEncodedBlock[] = [], locks: CountryEncodedBlock[] = [], detailCoast: CountryEncodedBlock[] = [];
    let encodedBytes = sourceRoot.length + manifest.length, count = 0;
    const total = data.blocks.size + data.locks.size + data.detailCoast.size;
    const add = async (list: CountryEncodedBlock[], key: string, bytes: Uint8Array, expected: string) => {
      guarded.signal?.throwIfAborted(); encodedBytes += bytes.length;
      if (encodedBytes > COUNTRY_GEOGRAPHY_LIMITS.encodedBytes || bytes.length > COUNTRY_GEOGRAPHY_LIMITS.partBytes) throw new Error('建国地理总字节预算超限。');
      const sha256 = await generationDigest(bytes); if (sha256 !== expected) throw new Error('来源地理编码摘要不符。');
      list.push({ key, sha256, bytes });
      if (++count % 16 === 0 || count === total) await yieldAtlas(guarded, '准备独立建国地理快照', count, total);
    };
    for (const ref of data.manifest.blockRefs) await add(blocks, ref.key, encodeBlock(data.blocks.get(ref.key)!), ref.hash);
    for (const ref of data.manifest.constraints.lockRefs) { const key = lockKey(ref.bx, ref.by); await add(locks, key, encodeAtlasCellLockBlock(data.locks.get(key)!), ref.hash); }
    for (const ref of data.manifest.detailCoast.refs) { const key = detailCoastKey(ref.bx, ref.by); await add(detailCoast, key, encodeDetailCoastTile(data.detailCoast.get(key)!), ref.hash); }
    const result = { format: 'lieguoji-country-geography' as const, version: 1 as const, source, sourceRoot, manifest, blocks, locks, detailCoast, encodedBytes };
    const sha256 = await recordDigest(result); guarded.signal?.throwIfAborted();
    // Reopen only to check the actual current source has not advanced while
    // preparing. The original fixed snapshot never silently changes versions.
    checkHandle(await api.openAtlasDraft(source.draftId, { ...guarded, source: 'current' }), source);
    guarded.signal?.throwIfAborted(); return { ...result, sha256 };
  } finally { session.close(); }
}
/** Validates an independent record without reading or opening any Atlas DB. */
export async function decodeCountryGeography(raw: unknown, control?: AtlasControl): Promise<AtlasDocument> {
  const record = ownRecord(raw), guarded = controlCopy(control); guarded.signal?.throwIfAborted();
  if (await recordDigest(record) !== record.sha256) throw new Error('建国地理封套摘要损坏。');
  const api = getAtlasStorage(4), root: unknown = JSON.parse(decoder.decode(record.sourceRoot));
  if (!api.validateAtlasRoot(root) || !sameBytes(api.encodeAtlasRoot(root), record.sourceRoot)) throw new Error('建国原来源根编码无效。');
  await api.verifyAtlasRoot(root);
  const manifest = decodeAtlasManifest(record.manifest);
  if (manifest.version !== 4 || root.draftId !== record.source.draftId || root.revision !== record.source.revision
    || root.rootDigest !== record.source.rootDigest || root.currentManifest !== record.source.manifestDigest
    || manifest.draftId !== record.source.draftId || manifest.revision !== record.source.revision
    || await generationDigest(record.manifest) !== record.source.manifestDigest) throw new Error('建国地理原身份或 manifest 引用不符。');
  const data: AtlasDetailCoastDocument = { manifest, blocks: new Map(), locks: new Map(), detailCoast: new Map() };
  const expected = { blocks: manifest.blockRefs.map(ref => ({ key: ref.key, hash: ref.hash })),
    locks: manifest.constraints.lockRefs.map(ref => ({ key: lockKey(ref.bx, ref.by), hash: ref.hash })),
    detailCoast: manifest.detailCoast.refs.map(ref => ({ key: detailCoastKey(ref.bx, ref.by), hash: ref.hash })) };
  let completed = 0; const total = record.blocks.length + record.locks.length + record.detailCoast.length;
  for (const kind of ['blocks', 'locks', 'detailCoast'] as const) {
    if (record[kind].length !== expected[kind].length) throw new Error('建国地理引用集合不完整。');
    for (let index = 0; index < record[kind].length; index++) {
      guarded.signal?.throwIfAborted(); const part = record[kind][index], ref = expected[kind][index];
      if (part.key !== ref.key || part.sha256 !== ref.hash || await generationDigest(part.bytes) !== ref.hash) throw new Error('建国地理分块引用或摘要损坏。');
      if (kind === 'blocks') {
        const block = decodeBlock(part.bytes, manifest.spec);
        if (blockKey(block.layer, block.bx, block.by) !== part.key || !sameBytes(encodeBlock(block), part.bytes)) throw new Error('建国地理块身份或编码无效。');
        data.blocks.set(blockKey(block.layer, block.bx, block.by), block);
      } else if (kind === 'locks') {
        const block = decodeAtlasCellLockBlock(part.bytes, manifest.spec);
        if (lockKey(block.bx, block.by) !== part.key || !sameBytes(encodeAtlasCellLockBlock(block), part.bytes)) throw new Error('建国地理锁身份或编码无效。');
        data.locks.set(lockKey(block.bx, block.by), block);
      } else {
        const tile = decodeDetailCoastTile(part.bytes);
        if (detailCoastKey(tile.bx, tile.by) !== part.key || !sameBytes(encodeDetailCoastTile(tile), part.bytes)) throw new Error('建国细海岸身份或编码无效。');
        data.detailCoast.set(detailCoastKey(tile.bx, tile.by), tile);
      }
      if (++completed % 16 === 0 || completed === total) await yieldAtlas(guarded, '核验独立建国地理快照', completed, total);
    }
  }
  await verifyAtlasDocument(data, guarded); guarded.signal?.throwIfAborted();
  // Capture authority before exposing the mutable document. The public view
  // cannot swap terrain underneath its verified source before the first query.
  verifiedGeographies.set(data, { source: { ...record.source }, data: structuredClone(data) });
  return data;
}

interface CountryQuery { data: AtlasDetailCoastDocument; field: DetailCoastField; spatial: SpatialIndex }
const queries = new WeakMap<AtlasDocument, Promise<CountryQuery>>();
/** Decoded records retain their verified private snapshot; legacy direct query
 * inputs are captured and verified before yielding. Reusing the same document
 * reuses Hbase/index. Caller mutation never changes an established authority. */
async function query(data: AtlasDocument, control: AtlasControl): Promise<CountryQuery> {
  control.signal?.throwIfAborted(); let pending = queries.get(data);
  if (!pending) {
    pending = (async () => {
      const owned = verifiedGeographies.get(data)?.data ?? await cloneVerifiedAtlasDocument(data, control);
      if (!isDetailCoastDocument(owned)) throw new Error('建国查询只支持真实第四版细地理。');
      const base = await extractDetailCoastBase(owned, control);
      const field = { tiles: owned.detailCoast, sampleBaseElevation: createDetailShapeBaseSampler(base.size, base.centersQ, base.elevationsMeters) };
      return { data: owned, field, spatial: await createSpatialIndexAsync(owned, control) };
    })();
    queries.set(data, pending);
  }
  try { const result = await pending; control.signal?.throwIfAborted(); return result; }
  catch (error) { if (queries.get(data) === pending) queries.delete(data); throw error; }
}
export async function countryLandAt(data: AtlasDocument, xQ: number, yQ: number, control?: AtlasControl): Promise<{ cellId: number; height: number; land: boolean }> {
  if (!generationInt(xQ, 0, WORLD_Q) || !generationInt(yQ, 0, WORLD_Q)) throw new Error('建国地点需要世界范围内的整数 Q8 坐标。');
  const guarded = controlCopy(control), current = await query(data, guarded), point = { x: xQ / 256, y: yQ / 256 };
  const coarse = current.spatial.pick(point), fine = pickDetailCoastSurface(current.field, point);
  if (coarse.cellId === null || !fine) throw new Error('建国地点没有真实地理归属。');
  guarded.signal?.throwIfAborted(); return { cellId: coarse.cellId, height: fine.height, land: fine.land };
}
function positiveOverlap(a: readonly DetailCoastPointQ[], b: readonly DetailCoastPointQ[]): boolean {
  // Integer SAT projections distinguish positive area from touching exactly.
  for (const polygon of [a, b]) for (let index = 0; index < polygon.length; index++) {
    const p = polygon[index], q = polygon[(index + 1) % polygon.length], nx = p.yQ - q.yQ, ny = q.xQ - p.xQ;
    const aa = a.map(point => point.xQ * nx + point.yQ * ny), bb = b.map(point => point.xQ * nx + point.yQ * ny);
    if (Math.min(Math.max(...aa), Math.max(...bb)) <= Math.max(Math.min(...aa), Math.min(...bb))) return false;
  }
  return true;
}
function clipToQuad(triangle: readonly DetailCoastPointQ[], quad: readonly DetailCoastPointQ[]): DetailCoastPointQ[] {
  let polygon = triangle.map(point => ({ xQ: point.xQ, yQ: point.yQ }));
  for (let edge = 0; edge < 4; edge++) {
    const a = quad[edge], b = quad[(edge + 1) % 4], next: DetailCoastPointQ[] = [];
    const distance = (point: DetailCoastPointQ) => (b.xQ - a.xQ) * (point.yQ - a.yQ) - (b.yQ - a.yQ) * (point.xQ - a.xQ);
    for (let index = 0; index < polygon.length; index++) {
      const p = polygon[index], q = polygon[(index + 1) % polygon.length], dp = distance(p), dq = distance(q);
      if (dp >= 0) next.push(p);
      if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); next.push({ xQ: p.xQ + (q.xQ - p.xQ) * t, yQ: p.yQ + (q.yQ - p.yQ) * t }); }
    }
    polygon = next;
  }
  return polygon;
}
async function landPieces(current: CountryQuery, cellId: number, collect: boolean, control: AtlasControl): Promise<DetailCoastPointQ[][]> {
  if (!generationInt(cellId, 0, current.data.manifest.spec.columns * current.data.manifest.spec.rows - 1)) throw new Error('建国领土地块 ID 无效。');
  const quad = getCellQuad(current.data, cellId).map(point => ({ xQ: point.x * 256, yQ: point.y * 256 })), candidates = detailCellsIntersectingQuad(quad);
  if (candidates.length > COUNTRY_GEOGRAPHY_LIMITS.fineCellsPerCell) throw new Error('建国领土细格扫描预算超限。');
  const result: DetailCoastPointQ[][] = []; let hasSea = false;
  for (let index = 0; index < candidates.length; index++) {
    control.signal?.throwIfAborted(); const id = candidates[index];
    const cell = buildDetailCoastSurface(current.field, { column: id % 2048, row: Math.floor(id / 2048), columns: 1, rows: 1 }).cells[0];
    for (const triangle of cell.land) if (positiveOverlap(triangle, quad)) {
      if (!collect) return [quad];
      result.push(clipToQuad(triangle, quad));
    }
    if (collect && !hasSea) hasSea = cell.sea.some(triangle => positiveOverlap(triangle, quad));
    if ((index + 1) % 64 === 0) await yieldAtlas(control, '按真实细海岸裁剪建国领土', index + 1, candidates.length);
  }
  control.signal?.throwIfAborted();
  // Exact compression: only after scanning every intersecting fine cell and
  // proving no positive-area sea fragment intersects the original coarse quad.
  return collect && result.length && !hasSea ? [quad] : result;
}
export async function countryClaimCells(data: AtlasDocument, rawIds: readonly number[], control?: AtlasControl): Promise<number[]> {
  if (!Array.isArray(rawIds) || rawIds.length > COUNTRY_GEOGRAPHY_LIMITS.claimCells || !generationArray(rawIds)
    || !rawIds.every((id): id is number => generationInt(id, 0, 512 * 512 - 1))) throw new Error('建国领土单次最多 1024 个有效地块。');
  const ids = [...new Set(rawIds)].sort((a, b) => a - b), guarded = controlCopy(control); guarded.signal?.throwIfAborted();
  if (!ids.length) return [];
  const current = await query(data, guarded), result: number[] = [];
  for (let index = 0; index < ids.length; index++) {
    if ((await landPieces(current, ids[index], false, guarded)).length) result.push(ids[index]);
    if ((index + 1) % 16 === 0 || index + 1 === ids.length) await yieldAtlas(guarded, '核验建国领土实际陆地', index + 1, ids.length);
  }
  guarded.signal?.throwIfAborted(); return result;
}
export async function countryCellLandPolygons(data: AtlasDocument, cellId: number, control?: AtlasControl): Promise<readonly { xQ: number; yQ: number }[][]> {
  if (!generationInt(cellId, 0, 512 * 512 - 1)) throw new Error('建国领土地块 ID 无效。');
  const guarded = controlCopy(control), current = await query(data, guarded);
  return landPieces(current, cellId, true, guarded);
}
