import { checkDetailCoastAbort, detailCoastKey, detailCoastOwnerLayout, yieldDetailCoast, type DetailCoastControl, type DetailCoastKey, type DetailCoastTile, type DetailCoastTiles } from './detail-coast-types';

function exactRecord(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('细海岸记录必须是普通对象。');
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))) throw new Error('细海岸记录含未知或缺失字段。');
  for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(value, key)!; if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error('细海岸记录仅接受可枚举数据字段。'); }
}
function ownedInt16(value: unknown, length: number): asserts value is Int16Array {
  if (!value || Object.getPrototypeOf(value) !== Int16Array.prototype) throw new Error('细海岸样本必须是本地 Int16Array。');
  const array = value as Int16Array;
  if (Object.getPrototypeOf(array.buffer) !== ArrayBuffer.prototype || array.length !== length || array.byteOffset !== 0 || array.byteLength !== length * 2 || array.buffer.byteLength !== array.byteLength || Reflect.ownKeys(array).length !== length) throw new Error('细海岸样本数组必须独占且具有精确长度。');
}
function assertEnvelope(value: unknown): asserts value is DetailCoastTile {
  // Inspect descriptors before reading mode so a malformed envelope cannot run a getter.
  if (!value || typeof value !== 'object') throw new Error('细海岸 tile 无效。');
  const mode = Object.getOwnPropertyDescriptor(value, 'mode');
  if (!mode || !Object.hasOwn(mode, 'value')) throw new Error('细海岸 tile mode 无效。');
  const keys = ['format', 'version', 'bx', 'by', 'mode'];
  if (mode.value === 'samples') keys.push('coverageQ', 'elevationMeters');
  else if (mode.value !== 'land') throw new Error('细海岸 tile mode 不受支持。');
  exactRecord(value, keys);
  if (value.format !== 'lieguoji-detail-coast-tile' || value.version !== 1 || typeof value.bx !== 'number' || typeof value.by !== 'number') throw new Error('细海岸 tile 版本无效。');
  const layout = detailCoastOwnerLayout(value.bx, value.by);
  if (value.mode === 'samples') { ownedInt16(value.coverageQ, layout.count); ownedInt16(value.elevationMeters, layout.count); }
}
function validateValues(tile: DetailCoastTile): void {
  if (tile.mode !== 'samples') return;
  for (let index = 0; index < tile.coverageQ.length; index++) {
    const coverage = tile.coverageQ[index], height = tile.elevationMeters[index];
    if (coverage === -32768 || height < -12000 || height > 12000 || coverage > 0 && height < 0 || coverage < 0 && height > -1 || coverage === 0 && height !== 0) throw new Error('细海岸覆盖值与已存高程不一致。');
  }
}
export function validateDetailCoastTile(value: unknown): asserts value is DetailCoastTile { assertEnvelope(value); validateValues(value); }
function cloneEnvelope(tile: DetailCoastTile): DetailCoastTile {
  const base = { format: 'lieguoji-detail-coast-tile' as const, version: 1 as const, bx: tile.bx, by: tile.by };
  return tile.mode === 'land' ? { ...base, mode: 'land' } : { ...base, mode: 'samples', coverageQ: new Int16Array(tile.coverageQ), elevationMeters: new Int16Array(tile.elevationMeters) };
}
export function cloneDetailCoastTile(tile: DetailCoastTile): DetailCoastTile { validateDetailCoastTile(tile); return cloneEnvelope(tile); }
function takeSnapshot(tiles: DetailCoastTiles, values: boolean): Map<DetailCoastKey, DetailCoastTile> {
  if (Object.getPrototypeOf(tiles) !== Map.prototype || Reflect.ownKeys(tiles).length !== 0 || tiles.size > 4096) throw new Error('细海岸 tile 集合必须是独立的普通 Map。');
  const snapshot = new Map<DetailCoastKey, DetailCoastTile>();
  for (const [key, tile] of tiles) {
    assertEnvelope(tile);
    if (key !== detailCoastKey(tile.bx, tile.by)) throw new Error('细海岸 tile key 与坐标不一致。');
    if (values) validateValues(tile);
    snapshot.set(key, cloneEnvelope(tile));
  }
  return snapshot;
}
/** Takes ownership synchronously: the returned map and all arrays are independent. */
export function cloneDetailCoastTiles(tiles: DetailCoastTiles): Map<DetailCoastKey, DetailCoastTile> { return takeSnapshot(tiles, true); }
/** Copies every envelope/array before the first await. Later caller mutations
 * cannot take over this validation. Value checks then yield every 16 tiles. */
export async function validateDetailCoastTilesAsync(tiles: DetailCoastTiles, control?: DetailCoastControl): Promise<Map<DetailCoastKey, DetailCoastTile>> {
  checkDetailCoastAbort(control);
  const owned = takeSnapshot(tiles, false); let completed = 0;
  for (const tile of owned.values()) {
    validateValues(tile); completed++;
    if (completed % 16 === 0) { control?.onProgress?.(completed, owned.size); await yieldDetailCoast(control); }
  }
  checkDetailCoastAbort(control); control?.onProgress?.(completed, owned.size);
  return owned;
}
/** LGDC, version, mode, owner bx/by, count, six reserved zero bytes;
 * samples are coverage followed by elevation, signed little-endian int16. */
export function encodeDetailCoastTile(tile: DetailCoastTile): Uint8Array {
  validateDetailCoastTile(tile);
  const count = tile.mode === 'samples' ? tile.coverageQ.length : 0;
  const bytes = new Uint8Array(16 + count * 4), view = new DataView(bytes.buffer);
  bytes.set([76, 71, 68, 67, 1, tile.mode === 'land' ? 0 : 1, tile.bx, tile.by]); view.setUint16(8, count, true);
  if (tile.mode === 'samples') for (let index = 0; index < count; index++) { view.setInt16(16 + index * 2, tile.coverageQ[index], true); view.setInt16(16 + count * 2 + index * 2, tile.elevationMeters[index], true); }
  return bytes;
}
export function decodeDetailCoastTile(input: Uint8Array | ArrayBuffer): DetailCoastTile {
  let bytes: Uint8Array;
  if (Object.getPrototypeOf(input) === ArrayBuffer.prototype) bytes = new Uint8Array(input as ArrayBuffer);
  else if (Object.getPrototypeOf(input) === Uint8Array.prototype) {
    bytes = input as Uint8Array;
    if (Object.getPrototypeOf(bytes.buffer) !== ArrayBuffer.prototype || bytes.byteOffset !== 0 || bytes.byteLength !== bytes.buffer.byteLength || Reflect.ownKeys(bytes).length !== bytes.length) throw new Error('细海岸字节必须是独占 Uint8Array。');
  } else throw new Error('细海岸字节类型无效。');
  if (bytes.length < 16 || bytes[0] !== 76 || bytes[1] !== 71 || bytes[2] !== 68 || bytes[3] !== 67 || bytes[4] !== 1 || bytes[5] > 1 || bytes.slice(10, 16).some((value) => value !== 0)) throw new Error('细海岸二进制头无效。');
  const view = new DataView(bytes.buffer), bx = bytes[6], by = bytes[7], count = view.getUint16(8, true), layout = detailCoastOwnerLayout(bx, by);
  if (count !== (bytes[5] === 0 ? 0 : layout.count) || bytes.length !== 16 + count * 4) throw new Error('细海岸二进制长度不一致。');
  const base = { format: 'lieguoji-detail-coast-tile' as const, version: 1 as const, bx, by };
  if (bytes[5] === 0) return { ...base, mode: 'land' };
  const coverageQ = new Int16Array(count), elevationMeters = new Int16Array(count);
  for (let index = 0; index < count; index++) { coverageQ[index] = view.getInt16(16 + index * 2, true); elevationMeters[index] = view.getInt16(16 + count * 2 + index * 2, true); }
  const tile = { ...base, mode: 'samples' as const, coverageQ, elevationMeters }; validateDetailCoastTile(tile); return tile;
}
export async function hashDetailCoastTile(tile: DetailCoastTile): Promise<string> {
  const bytes = encodeDetailCoastTile(tile), digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
