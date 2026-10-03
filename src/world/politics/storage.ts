import type { AtlasDocument } from '../atlas-format';
import type { AtlasControl } from '../model';
import { validateCountryWorldGeography } from './core';
import { countryClaimCells, decodeCountryGeography, type CountryGeographyRecord } from './geography';
import { COUNTRY_LIMITS, countryId, countryName, type CountryDocument, type CountryListEntry, type CountryState } from './model';
import * as legacy from './storage-v1';
import * as chunks from './storage-v2';
import * as natural from './storage-v3';
import * as institutions from './storage-v4';
export type { CountryBlob } from './storage-v1';

const stores = [
  { ...legacy, version: 1, hasCountryWorld: legacy.hasCountryWorldV1, readCountryGeographyRecord: legacy.readCountryGeographyRecordV1 },
  { ...chunks, version: 2, hasCountryWorld: chunks.hasCountryWorldV2, readCountryGeographyRecord: chunks.readCountryGeographyRecordV2 },
  { ...natural, version: 3, hasCountryWorld: natural.hasCountryWorldV3, readCountryGeographyRecord: natural.readCountryGeographyRecordV3 },
  { ...institutions, version: 4, hasCountryWorld: institutions.hasCountryWorldV4, readCountryGeographyRecord: institutions.readCountryGeographyRecordV4 },
];
async function storeFor(worldId: string) {
  if (!countryId(worldId, 'country')) throw new Error('国家世界 ID 无效。');
  // Database/version errors are never interpreted as absent worlds.
  const matches = [];
  for (const store of stores) if (await store.hasCountryWorld(worldId)) matches.push(store);
  if (matches.length > 1) throw new Error('不同版本的世界 ID 冲突，禁止自动选择或覆盖。');
  if (!matches.length) throw new Error('未找到这个国家世界。');
  return matches[0];
}
export async function openCountryWorld(worldId: string): Promise<CountryState> { return (await storeFor(worldId)).openCountryWorld(worldId); }
export async function listCountryWorlds(): Promise<CountryListEntry[]> {
  const entries: CountryListEntry[] = [], ids = new Set<string>();
  for (const store of stores) for (const row of await store.listCountryWorlds()) { if (ids.has(row.worldId)) throw new Error('不同版本的世界 ID 冲突。'); ids.add(row.worldId); entries.push(row); }
  return entries.sort((a, b) => a.name.localeCompare(b.name) || a.worldId.localeCompare(b.worldId));
}
export async function readCountryGeography(worldId: string): Promise<AtlasDocument> { return (await storeFor(worldId)).readCountryGeography(worldId); }
export function createCountryWorld(record: CountryGeographyRecord, name: string, signal?: AbortSignal): Promise<CountryState> { return institutions.createCountryWorld(record, name, signal); }
export async function copyCountryWorldToV2(worldId: string, name: string, signal?: AbortSignal): Promise<CountryState> {
  const store = await storeFor(worldId);
  if (store.version !== 1) throw new Error('只有 v1 旧档需要建立独立 v2 副本。');
  const original = await legacy.openCountryWorld(worldId);
  if (original.readOnly) throw new Error('恢复备份保持只读，不能以损坏主档建立可写副本。');
  const record = await legacy.readCountryGeographyRecordV1(worldId), geography = await decodeCountryGeography(record, { signal });
  await validateCountryWorldGeography(original.document, geography, { signal });
  const current = await legacy.openCountryWorld(worldId);
  if (current.rootDigest !== original.rootDigest || current.readOnly) throw new Error('原档已发生变化，请重新选择复制。');
  signal?.throwIfAborted();
  return chunks.createCountryWorld(record, name, signal, original.document);
}
/** Explicit geometry conversion owns an existing independent geography copy.
 * Every reference is checked before the destination DB writes its first root. */
export async function copyCountryWorldToV3(worldId: string, name: string, control?: AtlasControl): Promise<CountryState> {
  if (!countryName(name)) throw new Error('自然国界副本名称无效。');
  const store = await storeFor(worldId);
  if (store.version !== 1 && store.version !== 2) throw new Error('只有 v1/v2 旧世界可建立 v3 自然国界副本；不能降级新版世界。');
  const original = await store.openCountryWorld(worldId);
  if (original.readOnly) throw new Error('恢复备份保持只读，不能以损坏主档建立可写副本。');
  const record = await store.readCountryGeographyRecord(worldId), geography = await decodeCountryGeography(record, control);
  await validateCountryWorldGeography(original.document, geography, control);
  const document = structuredClone(original.document); document.version = 3;
  const retained = new Set<number>();
  for (let offset = 0; offset < document.territories.length; offset += COUNTRY_LIMITS.commandCells) {
    const ids = document.territories.slice(offset, offset + COUNTRY_LIMITS.commandCells).map(row => row.cellId);
    for (const cellId of await countryClaimCells(geography, ids, control, 'political-voronoi-v1')) retained.add(cellId);
    control?.signal?.throwIfAborted();
    control?.onProgress?.({ stage: '核对自然国界副本的真实陆地与原城市', completed: Math.min(offset + COUNTRY_LIMITS.commandCells, document.territories.length), total: document.territories.length });
  }
  document.territories = document.territories.filter(row => retained.has(row.cellId));
  const owners = new Set(document.territories.map(row => row.legalNationId));
  if (document.nations.some(nation => !owners.has(nation.id))) throw new Error('自然国界转换会使已有国家失去全部真实陆地，已拒绝复制，原档保持不变。');
  // Cities are never moved or reassigned to make a conversion pass.
  await validateCountryWorldGeography(document, geography, control);
  const current = await store.openCountryWorld(worldId);
  if (current.rootDigest !== original.rootDigest || current.readOnly) throw new Error('原档已发生变化，请重新选择复制。');
  control?.signal?.throwIfAborted();
  return natural.createCountryWorld(record, name, control?.signal, document);
}
/** Institutions do not reinterpret cells. This is an explicit v3-to-v4
 * independent copy, preserving every entity and geography byte. */
export async function copyCountryWorldToV4(worldId: string, name: string, control?: AtlasControl): Promise<CountryState> {
  if (!countryName(name)) throw new Error('制度副本名称无效。');
  const store = await storeFor(worldId);
  if (store.version !== 3) throw new Error('制度副本只接受 v3 自然国界世界；v1/v2 请先明确建立自然国界副本，v4 无需再次升级。');
  const original = await store.openCountryWorld(worldId);
  if (original.readOnly) throw new Error('恢复备份保持只读，不能以损坏主档建立可写制度副本。');
  const record = await store.readCountryGeographyRecord(worldId), geography = await decodeCountryGeography(record, control);
  await validateCountryWorldGeography(original.document, geography, control);
  const current = await store.openCountryWorld(worldId);
  if (current.rootDigest !== original.rootDigest || current.readOnly) throw new Error('原档已发生变化，请重新选择复制。');
  control?.signal?.throwIfAborted();
  return institutions.createCountryWorld(record, name, control?.signal, original.document);
}
export async function countryUndoDocument(state: CountryState): Promise<CountryDocument> { return (await storeFor(state.document.worldId)).countryUndoDocument(state); }
export async function commitCountryWorld(expected: CountryState, next: CountryDocument, commandId: string, requestDigest: string, undo = false, signal?: AbortSignal): Promise<CountryState> {
  expected = structuredClone(expected); next = structuredClone(next);
  if (next.version !== expected.document.version) throw new Error('禁止通过普通保存隐式改变国家世界版本。');
  return (await storeFor(expected.document.worldId)).commitCountryWorld(expected, next, commandId, requestDigest, undo, signal);
}
