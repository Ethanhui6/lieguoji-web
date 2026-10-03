import type { AtlasDocument } from '../atlas-format';
import { validateCountryWorldGeography } from './core';
import { decodeCountryGeography, type CountryGeographyRecord } from './geography';
import { countryId, type CountryDocument, type CountryListEntry, type CountryState } from './model';
import * as legacy from './storage-v1';
import * as chunks from './storage-v2';
export type { CountryBlob } from './storage-v1';

async function storeFor(worldId: string) {
  if (!countryId(worldId, 'country')) throw new Error('国家世界 ID 无效。');
  // Version/errors are propagated, never interpreted as an absent legacy DB.
  const inV1 = await legacy.hasCountryWorldV1(worldId), inV2 = await chunks.hasCountryWorldV2(worldId);
  if (inV1 && inV2) throw new Error('两个版本的世界 ID 冲突，禁止自动选择或覆盖。');
  if (!inV1 && !inV2) throw new Error('未找到这个国家世界。');
  return inV1 ? legacy : chunks;
}
export async function openCountryWorld(worldId: string): Promise<CountryState> { return (await storeFor(worldId)).openCountryWorld(worldId); }
export async function listCountryWorlds(): Promise<CountryListEntry[]> {
  const old = await legacy.listCountryWorlds(), modern = await chunks.listCountryWorlds();
  if (old.some(a => modern.some(b => a.worldId === b.worldId))) throw new Error('两个版本的世界 ID 冲突。');
  return [...old, ...modern].sort((a, b) => a.name.localeCompare(b.name) || a.worldId.localeCompare(b.worldId));
}
export async function readCountryGeography(worldId: string): Promise<AtlasDocument> { return (await storeFor(worldId)).readCountryGeography(worldId); }
export function createCountryWorld(record: CountryGeographyRecord, name: string, signal?: AbortSignal): Promise<CountryState> { return chunks.createCountryWorld(record, name, signal); }
export async function copyCountryWorldToV2(worldId: string, name: string, signal?: AbortSignal): Promise<CountryState> {
  const store = await storeFor(worldId);
  if (store !== legacy) throw new Error('只有 v1 旧档需要建立独立 v2 副本。');
  const original = await legacy.openCountryWorld(worldId);
  if (original.readOnly) throw new Error('恢复备份保持只读，不能以损坏主档建立可写副本。');
  const record = await legacy.readCountryGeographyRecordV1(worldId), geography = await decodeCountryGeography(record, { signal });
  await validateCountryWorldGeography(original.document, geography, { signal });
  const current = await legacy.openCountryWorld(worldId);
  if (current.rootDigest !== original.rootDigest || current.readOnly) throw new Error('原档已发生变化，请重新选择复制。');
  signal?.throwIfAborted();
  return chunks.createCountryWorld(record, name, signal, original.document);
}
export async function countryUndoDocument(state: CountryState): Promise<CountryDocument> { return (await storeFor(state.document.worldId)).countryUndoDocument(state); }
export async function commitCountryWorld(expected: CountryState, next: CountryDocument, commandId: string, requestDigest: string, undo = false, signal?: AbortSignal): Promise<CountryState> {
  expected = structuredClone(expected); next = structuredClone(next);
  if (next.version !== expected.document.version) throw new Error('禁止通过普通保存隐式改变国家世界版本。');
  return (await storeFor(expected.document.worldId)).commitCountryWorld(expected, next, commandId, requestDigest, undo, signal);
}
