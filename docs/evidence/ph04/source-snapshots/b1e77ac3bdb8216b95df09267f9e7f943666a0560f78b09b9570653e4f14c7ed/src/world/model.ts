import { cellBlock, ownedVertexIds, validateLocalGeometry, validateVertexPositionQ, vertexSlotLocation } from './topology';

/** Production atlas draft format. Independent from experiment and legacy saves. */
export const UNASSIGNED = 0xffffffff;
export const ATLAS_COORDINATE_SCALE = 256;
export const ATLAS_WORLD_UNITS = 4096;
export const ATLAS_BLOCK_CELLS = 32;
export type AtlasSize = 128 | 256 | 512;
export type AtlasLayer = 'geometry' | 'elevation' | 'sim-membership' | 'admin-membership';
export type CellLayer = Exclude<AtlasLayer, 'geometry'>;
export type BlockKey = `${AtlasLayer}:${number}:${number}`;
export interface AtlasGridSpec {
  kind: 'shared-quad-grid-v1'; columns: AtlasSize; rows: AtlasSize;
  width: 4096; height: 4096; coordinateScale: 256; blockCells: 32;
}
export interface BlockCoordinate { bx: number; by: number }
interface AtlasBlockBase extends BlockCoordinate { format: 'lieguoji-atlas-block'; version: 1; layer: AtlasLayer }
export interface GeometryBlock extends AtlasBlockBase { layer: 'geometry'; vertexIds: Uint32Array; xyQ: Int32Array }
export interface ElevationBlock extends AtlasBlockBase { layer: 'elevation'; values: Int32Array }
export interface MembershipBlock extends AtlasBlockBase { layer: 'sim-membership' | 'admin-membership'; values: Uint32Array }
export type CellBlock = ElevationBlock | MembershipBlock;
export type AtlasBlock = GeometryBlock | CellBlock;
export interface AtlasBlockRef { key: BlockKey; hash: string }
export interface AtlasRegion { id: number; name: string }
export interface AtlasAdminNode { id: number; name: string; parentId: number | null; kind: 'branch' | 'leaf' }
export interface AtlasCatalogs { simRegions: AtlasRegion[]; administration: AtlasAdminNode[] }
export interface AtlasDraftManifest {
  format: 'lieguoji-atlas-draft'; version: 1; kind: 'draft';
  draftId: string; atlasId: string; name: string; seed: string; revision: number;
  spec: AtlasGridSpec; catalogs: AtlasCatalogs; blockRefs: AtlasBlockRef[];
}
/** Internal owned state. Clone before export; readonly types cannot freeze buffers. */
export interface AtlasDraftData { manifest: AtlasDraftManifest; blocks: Map<BlockKey, AtlasBlock> }
export interface AtlasCreateOptions { size: AtlasSize; seed: string; name: string; draftId?: string; atlasId?: string }
export interface AtlasControl {
  signal?: AbortSignal;
  onProgress?: (progress: { stage: string; completed: number; total: number }) => void;
  yieldTask?: () => Promise<void>;
}

export const ATLAS_LAYERS: readonly AtlasLayer[] = ['geometry', 'elevation', 'sim-membership', 'admin-membership'];
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const HASH = /^[0-9a-f]{64}$/;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const int = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!object(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === expected.length && actual.every(key => typeof key === 'string' && expected.includes(key) && !!Object.getOwnPropertyDescriptor(value, key)?.enumerable && 'value' in Object.getOwnPropertyDescriptor(value, key)!);
}
function array(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let i = 0; i < value.length; i++) { const descriptor = Object.getOwnPropertyDescriptor(value, String(i)); if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return false; }
  return true;
}
function typed(value: unknown, kind: 'uint' | 'int', length: number): value is Uint32Array | Int32Array {
  const constructor = kind === 'uint' ? Uint32Array : Int32Array;
  return value instanceof constructor && Object.getPrototypeOf(value) === constructor.prototype && value.buffer instanceof ArrayBuffer && value.length === length && Reflect.ownKeys(value).length === length;
}
const label = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;

export function blockKey(layer: AtlasLayer, bx: number, by: number): BlockKey {
  if (!ATLAS_LAYERS.includes(layer) || !int(bx, 0, 15) || !int(by, 0, 15)) throw new Error('地理块身份无效。');
  return `${layer}:${bx}:${by}`;
}
export function validateSpec(raw: unknown): raw is AtlasGridSpec {
  return keys(raw, ['kind', 'columns', 'rows', 'width', 'height', 'coordinateScale', 'blockCells']) && raw.kind === 'shared-quad-grid-v1' && [128, 256, 512].includes(raw.columns as number) && raw.rows === raw.columns && raw.width === 4096 && raw.height === 4096 && raw.coordinateScale === 256 && raw.blockCells === 32;
}
export function validateCatalogs(raw: unknown): raw is AtlasCatalogs {
  if (!keys(raw, ['simRegions', 'administration']) || !array(raw.simRegions) || !array(raw.administration) || raw.simRegions.length > 65536 || raw.administration.length > 65536) return false;
  const nodes = new Map<number, AtlasAdminNode>();
  let previous = -1;
  for (const value of raw.simRegions) {
    if (!keys(value, ['id', 'name']) || !int(value.id, 0, UNASSIGNED - 1) || value.id <= previous || !label(value.name)) return false;
    previous = value.id;
  }
  previous = -1;
  for (const value of raw.administration) {
    if (!keys(value, ['id', 'name', 'parentId', 'kind']) || !int(value.id, 0, UNASSIGNED - 1) || value.id <= previous || !label(value.name) || value.parentId !== null && !int(value.parentId, 0, UNASSIGNED - 1) || value.kind !== 'branch' && value.kind !== 'leaf') return false;
    previous = value.id; nodes.set(value.id, value as unknown as AtlasAdminNode);
  }
  // Iterative path colouring avoids recursion and quadratic validation on deep raw trees.
  const complete = new Set<number>();
  for (const node of nodes.values()) {
    const path = new Set<number>(); let current: AtlasAdminNode | undefined = node;
    while (current && !complete.has(current.id)) {
      if (path.has(current.id)) return false; path.add(current.id);
      if (current.parentId === null) break;
      const parent = nodes.get(current.parentId); if (!parent || parent.kind !== 'branch') return false;
      current = parent;
    }
    for (const id of path) complete.add(id);
  }
  return true;
}
export function validateManifest(raw: unknown): raw is AtlasDraftManifest {
  try {
    if (!keys(raw, ['format', 'version', 'kind', 'draftId', 'atlasId', 'name', 'seed', 'revision', 'spec', 'catalogs', 'blockRefs']) || raw.format !== 'lieguoji-atlas-draft' || raw.version !== 1 || raw.kind !== 'draft' || typeof raw.draftId !== 'string' || !new RegExp(`^atlas-${UUID}$`).test(raw.draftId) || typeof raw.atlasId !== 'string' || !new RegExp(`^geo-${UUID}$`).test(raw.atlasId) || !label(raw.name) || !label(raw.seed) || !int(raw.revision, 0, Number.MAX_SAFE_INTEGER) || !validateSpec(raw.spec) || !validateCatalogs(raw.catalogs) || !array(raw.blockRefs)) return false;
    const across = raw.spec.columns / 32, total = across * across * ATLAS_LAYERS.length;
    if (raw.blockRefs.length !== total) return false;
    let cursor = 0;
    for (const layer of ATLAS_LAYERS) for (let by = 0; by < across; by++) for (let bx = 0; bx < across; bx++) {
      const ref = raw.blockRefs[cursor++];
      if (!keys(ref, ['key', 'hash']) || ref.key !== blockKey(layer, bx, by) || typeof ref.hash !== 'string' || !HASH.test(ref.hash)) return false;
    }
    return true;
  } catch { return false; }
}

/** Per-block validation, without global rehashing; spec binds IDs to their owner. */
export function validateBlock(raw: unknown, spec?: AtlasGridSpec): raw is AtlasBlock {
  try {
    if (!object(raw)) return false;
    const layerDescriptor = Object.getOwnPropertyDescriptor(raw, 'layer');
    if (!layerDescriptor || !('value' in layerDescriptor) || !keys(raw, layerDescriptor.value === 'geometry' ? ['format', 'version', 'layer', 'bx', 'by', 'vertexIds', 'xyQ'] : ['format', 'version', 'layer', 'bx', 'by', 'values']) || raw.format !== 'lieguoji-atlas-block' || raw.version !== 1 || !ATLAS_LAYERS.includes(raw.layer as AtlasLayer) || !int(raw.bx, 0, 15) || !int(raw.by, 0, 15)) return false;
    if (spec && (!validateSpec(spec) || raw.bx >= spec.columns / 32 || raw.by >= spec.rows / 32)) return false;
    if (raw.layer === 'geometry') {
      const length = (raw.bx === 0 ? 33 : 32) * (raw.by === 0 ? 33 : 32);
      if (!typed(raw.vertexIds, 'uint', length) || !typed(raw.xyQ, 'int', length * 2)) return false;
      const expected = spec ? ownedVertexIds(spec, raw.bx, raw.by) : null;
      for (let i = 0; i < length; i++) {
        const id = raw.vertexIds[i], xQ = raw.xyQ[i * 2], yQ = raw.xyQ[i * 2 + 1];
        if (id > 513 * 513 - 1 || i > 0 && id <= raw.vertexIds[i - 1] || xQ < 0 || yQ < 0 || xQ > 4096 * 256 || yQ > 4096 * 256) return false;
        if (expected) { if (id !== expected[i]) return false; validateVertexPositionQ(spec!, id, xQ, yQ); }
      }
      return true;
    }
    if (!typed(raw.values, raw.layer === 'elevation' ? 'int' : 'uint', 1024)) return false;
    return raw.layer !== 'elevation' || raw.values.every(value => value >= -12000 && value <= 12000);
  } catch { return false; }
}

export function getBlock(data: AtlasDraftData, key: BlockKey): AtlasBlock {
  const block = data.blocks.get(key); if (!block || blockKey(block.layer, block.bx, block.by) !== key) throw new Error(`权威地理块 ${key} 缺失或身份不符。`); return block;
}
export function getCellLayerSlot(data: AtlasDraftData, layer: CellLayer, cellId: number): { key: BlockKey; block: CellBlock; slot: number } {
  if (layer === ('geometry' as AtlasLayer) || !ATLAS_LAYERS.includes(layer)) throw new Error('该查询需要逐地块数据层。');
  const spec = data.manifest.spec, { bx, by } = cellBlock(spec, cellId), key = blockKey(layer, bx, by), block = getBlock(data, key);
  if (block.layer === 'geometry') throw new Error('地块数据层类型不符。');
  return { key, block, slot: Math.floor(cellId / spec.columns) % 32 * 32 + cellId % spec.columns % 32 };
}
export function getVertexSlot(data: AtlasDraftData, vertexId: number): { key: BlockKey; block: GeometryBlock; slot: number } {
  const { key, slot } = vertexSlotLocation(data.manifest.spec, vertexId), block = getBlock(data, key);
  if (block.layer !== 'geometry' || block.vertexIds[slot] !== vertexId) throw new Error('共享顶点所有者引用不符。');
  return { key, block, slot };
}
export function getSimRegion(data: AtlasDraftData, cellId: number): number | null {
  const { block, slot } = getCellLayerSlot(data, 'sim-membership', cellId), id = block.values[slot]; return id === UNASSIGNED ? null : id;
}
export function getAdminLeaf(data: AtlasDraftData, cellId: number): number | null {
  const { block, slot } = getCellLayerSlot(data, 'admin-membership', cellId), id = block.values[slot]; return id === UNASSIGNED ? null : id;
}
export function cloneBlock<T extends AtlasBlock>(block: T): T {
  if (!validateBlock(block)) throw new Error('不能克隆未经结构核验的地理块。');
  return (block.layer === 'geometry' ? { ...block, vertexIds: block.vertexIds.slice(), xyQ: block.xyQ.slice() } : { ...block, values: block.values.slice() }) as T;
}
export function cloneAtlasDraft(data: AtlasDraftData): AtlasDraftData {
  if (!validateAtlasDraft(data)) throw new Error('不能克隆结构或引用无效的草稿。');
  return { manifest: structuredClone(data.manifest), blocks: new Map([...data.blocks].map(([key, block]) => [key, cloneBlock(block)])) };
}

/** Structural/reference/geometry predicate. Use verifyAtlasDraft for content hashes. */
export function validateAtlasDraft(raw: unknown): raw is AtlasDraftData {
  try {
    if (!keys(raw, ['manifest', 'blocks']) || !validateManifest(raw.manifest) || !(raw.blocks instanceof Map) || Object.getPrototypeOf(raw.blocks) !== Map.prototype || Reflect.ownKeys(raw.blocks).length || raw.blocks.size !== raw.manifest.blockRefs.length) return false;
    const data = raw as unknown as AtlasDraftData, regions = new Set(data.manifest.catalogs.simRegions.map(region => region.id)), leaves = new Set(data.manifest.catalogs.administration.filter(node => node.kind === 'leaf').map(node => node.id));
    for (const ref of data.manifest.blockRefs) {
      const block = data.blocks.get(ref.key);
      if (!validateBlock(block, data.manifest.spec) || blockKey(block.layer, block.bx, block.by) !== ref.key) return false;
      if (block.layer === 'sim-membership' || block.layer === 'admin-membership') {
        const allowed = block.layer === 'sim-membership' ? regions : leaves;
        for (const value of block.values) if (value !== UNASSIGNED && !allowed.has(value)) return false;
      }
    }
    // A registry may describe unfinished draft entities; only populated mappings
    // are authoritative membership. Starting a simulation needs later validation.
    const vertices = Array.from({ length: (data.manifest.spec.columns + 1) * (data.manifest.spec.rows + 1) }, (_, id) => id);
    validateLocalGeometry(data, vertices);
    return true;
  } catch { return false; }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function equalBytes(a: Uint8Array, b: Uint8Array) { return a.length === b.length && a.every((value, i) => value === b[i]); }
export function encodeManifest(manifest: AtlasDraftManifest): Uint8Array {
  if (!validateManifest(manifest)) throw new Error('草稿 manifest 格式、目录或引用版本无效。'); return encoder.encode(canonical(manifest));
}
export function decodeManifest(bytes: Uint8Array): AtlasDraftManifest {
  if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer) || bytes.byteLength > 16 * 1024 * 1024) throw new Error('草稿 manifest 编码超限或类型无效。');
  let value: unknown;
  try { value = JSON.parse(decoder.decode(bytes)); } catch { throw new Error('草稿 manifest 编码不是有效 UTF-8／JSON。'); }
  if (!validateManifest(value) || !equalBytes(encodeManifest(value), bytes)) throw new Error('草稿 manifest 非规范编码、结构或版本不兼容。');
  return value;
}

/** LGAB v1, LE fixed header and typed columns; no atlas identity or mutable cache. */
export function encodeBlock(block: AtlasBlock): Uint8Array {
  if (!validateBlock(block)) throw new Error('地理块内容或 codec 版本无效。');
  const arrays = block.layer === 'geometry' ? [block.vertexIds, block.xyQ] : [block.values];
  const bytes = new Uint8Array(16 + arrays.reduce((sum, values) => sum + 12 + values.byteLength, 0)), view = new DataView(bytes.buffer);
  bytes.set([76, 71, 65, 66]); view.setUint16(4, 1, true); view.setUint8(6, ATLAS_LAYERS.indexOf(block.layer)); view.setUint8(7, arrays.length);
  view.setUint16(8, block.bx, true); view.setUint16(10, block.by, true); view.setUint32(12, 0, true);
  let offset = 16;
  for (const values of arrays) {
    const signed = values instanceof Int32Array;
    view.setUint8(offset, signed ? 2 : 1); view.setUint32(offset + 4, values.length, true); view.setUint32(offset + 8, values.byteLength, true); offset += 12;
    for (const value of values) { if (signed) view.setInt32(offset, value, true); else view.setUint32(offset, value, true); offset += 4; }
  }
  return bytes;
}
export function decodeBlock(bytes: Uint8Array, spec?: AtlasGridSpec): AtlasBlock {
  if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer) || bytes.byteLength < 16 || bytes.byteLength > 32768) throw new Error('地理块编码长度或类型无效。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (![76, 71, 65, 66].every((value, i) => bytes[i] === value) || view.getUint16(4, true) !== 1 || view.getUint32(12, true) !== 0) throw new Error('地理块格式或 codec 版本不兼容。');
  const layer = ATLAS_LAYERS[view.getUint8(6)], count = view.getUint8(7), arrays: (Uint32Array | Int32Array)[] = [];
  if (!layer || count !== (layer === 'geometry' ? 2 : 1)) throw new Error('地理块领域或列数不兼容。');
  let offset = 16;
  for (let index = 0; index < count; index++) {
    if (offset + 12 > bytes.length) throw new Error('地理块列头被截断。');
    const kind = view.getUint8(offset), length = view.getUint32(offset + 4, true), byteLength = view.getUint32(offset + 8, true);
    const expectedKind = layer === 'geometry' ? (index === 0 ? 1 : 2) : layer === 'elevation' ? 2 : 1;
    if (kind !== expectedKind || bytes[offset + 1] || bytes[offset + 2] || bytes[offset + 3] || length > 2178 || byteLength !== length * 4 || offset + 12 + byteLength > bytes.length) throw new Error('地理块类型列、长度或保留字段无效。');
    offset += 12; const values = kind === 1 ? new Uint32Array(length) : new Int32Array(length);
    for (let i = 0; i < length; i++, offset += 4) values[i] = kind === 1 ? view.getUint32(offset, true) : view.getInt32(offset, true);
    arrays.push(values);
  }
  if (offset !== bytes.length) throw new Error('地理块含尾随数据。');
  const base = { format: 'lieguoji-atlas-block' as const, version: 1 as const, bx: view.getUint16(8, true), by: view.getUint16(10, true) };
  const block = layer === 'geometry' ? { ...base, layer, vertexIds: arrays[0] as Uint32Array, xyQ: arrays[1] as Int32Array } : { ...base, layer, values: arrays[0] };
  if (!validateBlock(block, spec)) throw new Error('地理块解码后未通过字段或所有者核验。');
  return block;
}
async function digest(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes); const hash = await crypto.subtle.digest('SHA-256', owned.buffer);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export function hashBlock(block: AtlasBlock): Promise<string> { return digest(encodeBlock(block)); }
export function hashManifest(manifest: AtlasDraftManifest): Promise<string> { return digest(encodeManifest(manifest)); }
export async function verifyAtlasDraft(raw: unknown, control?: AtlasControl): Promise<void> {
  if (!validateAtlasDraft(raw)) throw new Error('草稿结构、几何、目录或成员引用无效。');
  for (let i = 0; i < raw.manifest.blockRefs.length; i++) {
    const ref = raw.manifest.blockRefs[i];
    if (await hashBlock(getBlock(raw, ref.key)) !== ref.hash) throw new Error(`地理块 ${ref.key} 完整摘要不符。`);
    if (i % 16 === 15) await yieldAtlas(control, '核验不可变地理块', i + 1, raw.manifest.blockRefs.length);
  }
  control?.signal?.throwIfAborted();
}
export async function yieldAtlas(control: AtlasControl | undefined, stage: string, completed: number, total: number): Promise<void> {
  control?.signal?.throwIfAborted(); control?.onProgress?.({ stage, completed, total });
  await (control?.yieldTask ? control.yieldTask() : new Promise<void>(resolve => setTimeout(resolve, 0)));
  control?.signal?.throwIfAborted();
}
function seedWord(seed: string) { let value = 2166136261; for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619); return value >>> 0; }
function jitter(seed: number, id: number, axis: number, limit: number) {
  let value = (seed ^ Math.imul(id + 1, 0x9e3779b1) ^ axis) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x85ebca6b); value = Math.imul(value ^ value >>> 13, 0xc2b2ae35); value = (value ^ value >>> 16) >>> 0;
  return value % (limit * 2 + 1) - limit;
}
/** Empty ocean only: deterministic editable geography, no invented PH06 hydrology. */
export async function createAtlasDraft(options: AtlasCreateOptions, control?: AtlasControl): Promise<AtlasDraftData> {
  control?.signal?.throwIfAborted();
  if (!object(options) || Reflect.ownKeys(options).some(key => typeof key !== 'string' || !['size', 'seed', 'name', 'draftId', 'atlasId'].includes(key) || !Object.getOwnPropertyDescriptor(options, key)?.enumerable || !('value' in Object.getOwnPropertyDescriptor(options, key)!)) || ![128, 256, 512].includes(options.size) || !label(options.seed) || !label(options.name) || options.draftId !== undefined && typeof options.draftId !== 'string' || options.atlasId !== undefined && typeof options.atlasId !== 'string') throw new Error('草稿创建参数无效；规模只允许128／256／512格。');
  const spec: AtlasGridSpec = { kind: 'shared-quad-grid-v1', columns: options.size, rows: options.size, width: 4096, height: 4096, coordinateScale: 256, blockCells: 32 };
  const manifest: AtlasDraftManifest = { format: 'lieguoji-atlas-draft', version: 1, kind: 'draft', draftId: options.draftId ?? `atlas-${crypto.randomUUID()}`, atlasId: options.atlasId ?? `geo-${crypto.randomUUID()}`, name: options.name, seed: options.seed, revision: 0, spec, catalogs: { simRegions: [], administration: [] }, blockRefs: [] };
  if (!new RegExp(`^atlas-${UUID}$`).test(manifest.draftId) || !new RegExp(`^geo-${UUID}$`).test(manifest.atlasId)) throw new Error('草稿与地理身份必须是独立命名空间的UUID。');
  const data: AtlasDraftData = { manifest, blocks: new Map() }, across = options.size / 32, total = across * across * 4, seed = seedWord(options.seed), step = 4096 * 256 / options.size, limit = Math.floor(step / 12);
  for (const layer of ATLAS_LAYERS) for (let by = 0; by < across; by++) for (let bx = 0; bx < across; bx++) {
    const base = { format: 'lieguoji-atlas-block' as const, version: 1 as const, layer, bx, by }; let block: AtlasBlock;
    if (layer === 'geometry') {
      const vertexIds = ownedVertexIds(spec, bx, by), xyQ = new Int32Array(vertexIds.length * 2);
      for (let i = 0; i < vertexIds.length; i++) {
        const id = vertexIds[i], x = id % (options.size + 1), y = Math.floor(id / (options.size + 1));
        xyQ[i * 2] = x * step + (x === 0 || x === options.size ? 0 : jitter(seed, id, 31, limit));
        xyQ[i * 2 + 1] = y * step + (y === 0 || y === options.size ? 0 : jitter(seed, id, 47, limit));
      }
      block = { ...base, layer, vertexIds, xyQ };
    } else if (layer === 'elevation') block = { ...base, layer, values: new Int32Array(1024).fill(-100) };
    else block = { ...base, layer, values: new Uint32Array(1024).fill(UNASSIGNED) };
    const key = blockKey(layer, bx, by); data.blocks.set(key, block); manifest.blockRefs.push({ key, hash: await hashBlock(block) });
    if (manifest.blockRefs.length % 8 === 0) await yieldAtlas(control, '创建空白海洋共享地理', manifest.blockRefs.length, total);
  }
  if (!validateAtlasDraft(data)) throw new Error('新建草稿未通过完整结构与共享几何校验。');
  control?.signal?.throwIfAborted(); return data;
}
