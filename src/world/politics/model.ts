import { validateCountrySource, type CountrySource } from './geography';
export type { CountrySource } from './geography';

export const COUNTRY_DATABASE = 'lieguoji-country-worlds-v1';
/** v1 keeps its original byte cap. v2 uses bounded dictionary chunks; its
 * expanded runtime table is never stored or sent as one JSON document. */
export const COUNTRY_LIMITS = Object.freeze({ nations: 64, cities: 512, territories: 65536, commandCells: 1024, packetBytes: 512 * 1024, documentBytes: 256 * 1024, undoEntries: 20, undoBytes: 8 * 1024 * 1024 });
export interface CountryPoint { xQ: number; yQ: number }
export interface CountryNation { id: string; name: string; color: string; regimeId: string; capitalCityId: string | null; labelAnchorQ: CountryPoint }
export interface CountryRegime { id: string; nationId: string; name: string }
export interface CountryTerritory { cellId: number; legalNationId: string; controllingNationId: string }
export interface CountryCity { id: string; nationId: string; name: string; positionQ: CountryPoint; labelAnchorQ: CountryPoint }
export interface CountryDocument {
  format: 'lieguoji-country-document'; version: 1 | 2; worldId: string; name: string; source: CountrySource; revision: number;
  nations: CountryNation[]; regimes: CountryRegime[]; territories: CountryTerritory[]; cities: CountryCity[];
}
export interface CountryState { document: CountryDocument; rootDigest: string; readOnly: boolean; recovered: boolean; undoCount: number }
export interface CountryPreview { candidateId: string; description: string; document: CountryDocument }
export interface CountryListEntry { worldId: string; name: string; revision: number; readOnly: boolean; recovered: boolean; nationCount: number; cityCount: number }
export type CountryCommand =
  | { type: 'create-nation'; name: string; color: string; cellIds: number[] }
  | { type: 'claim-territory'; nationId: string; cellIds: number[] }
  | { type: 'create-nation-shape'; name: string; color: string; outlineQ: CountryPoint[] }
  | { type: 'claim-territory-shape'; nationId: string; outlineQ: CountryPoint[] }
  | { type: 'create-city'; nationId: string; name: string; positionQ: CountryPoint }
  | { type: 'set-capital'; nationId: string; cityId: string }
  | { type: 'rename-nation'; nationId: string; name: string }
  | { type: 'rename-city'; cityId: string; name: string }
  | { type: 'undo' };
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const countryId = (raw: unknown, kind: 'country' | 'nation' | 'regime' | 'city' | 'command' | 'candidate'): raw is string => typeof raw === 'string' && new RegExp(`^${kind}-${UUID}$`).test(raw);
export const countryHash = (raw: unknown): raw is string => typeof raw === 'string' && /^[a-f0-9]{64}$/.test(raw);
export const countryInteger = (raw: unknown, min: number, max: number): raw is number => Number.isSafeInteger(raw) && (raw as number) >= min && (raw as number) <= max;
export function countryExact(raw: unknown, keys: readonly string[]): raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Object.getPrototypeOf(raw) !== Object.prototype) return false;
  const own = Reflect.ownKeys(raw);
  return own.length === keys.length && own.every(key => typeof key === 'string' && keys.includes(key) && !!Object.getOwnPropertyDescriptor(raw, key)?.enumerable && 'value' in Object.getOwnPropertyDescriptor(raw, key)!);
}
export const countryName = (raw: unknown): raw is string => typeof raw === 'string' && raw.trim() === raw && raw.length > 0 && raw.length <= 80 && ![...raw].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
export function countryArray(raw: unknown, max: number): raw is unknown[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length > max || Reflect.ownKeys(raw).length !== raw.length + 1) return false;
  for (let i = 0; i < raw.length; i++) { const d = Object.getOwnPropertyDescriptor(raw, String(i)); if (!d?.enumerable || !('value' in d)) return false; }
  return true;
}
export const countryPoint = (raw: unknown): raw is CountryPoint => countryExact(raw, ['xQ', 'yQ']) && countryInteger(raw.xQ, 0, 4096 * 256) && countryInteger(raw.yQ, 0, 4096 * 256);
export function validateCountryDocument(raw: unknown): raw is CountryDocument {
  if (!countryExact(raw, ['format', 'version', 'worldId', 'name', 'source', 'revision', 'nations', 'regimes', 'territories', 'cities'])
    || raw.format !== 'lieguoji-country-document' || raw.version !== 1 && raw.version !== 2 || !countryId(raw.worldId, 'country') || !countryName(raw.name)
    || !validateCountrySource(raw.source) || !countryInteger(raw.revision, 0, Number.MAX_SAFE_INTEGER)
    || !countryArray(raw.nations, COUNTRY_LIMITS.nations) || !countryArray(raw.regimes, COUNTRY_LIMITS.nations)
    || !countryArray(raw.cities, COUNTRY_LIMITS.cities) || !countryArray(raw.territories, COUNTRY_LIMITS.territories)) return false;
  const ids = new Set<string>(), nations = new Map<string, CountryNation>(), cities = new Map<string, CountryCity>(), regimes = new Map<string, CountryRegime>();
  for (const n of raw.nations) {
    if (!countryExact(n, ['id', 'name', 'color', 'regimeId', 'capitalCityId', 'labelAnchorQ']) || !countryId(n.id, 'nation') || ids.has(n.id) || !countryName(n.name)
      || typeof n.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(n.color) || !countryId(n.regimeId, 'regime') || n.capitalCityId !== null && !countryId(n.capitalCityId, 'city') || !countryPoint(n.labelAnchorQ)) return false;
    ids.add(n.id); nations.set(n.id, n as unknown as CountryNation);
  }
  for (const r of raw.regimes) {
    if (!countryExact(r, ['id', 'nationId', 'name']) || !countryId(r.id, 'regime') || ids.has(r.id) || !countryId(r.nationId, 'nation') || !countryName(r.name) || nations.get(r.nationId)?.regimeId !== r.id) return false;
    ids.add(r.id); regimes.set(r.id, r as unknown as CountryRegime);
  }
  for (const c of raw.cities) {
    if (!countryExact(c, ['id', 'nationId', 'name', 'positionQ', 'labelAnchorQ']) || !countryId(c.id, 'city') || ids.has(c.id) || !countryId(c.nationId, 'nation')
      || !nations.has(c.nationId) || !countryName(c.name) || !countryPoint(c.positionQ) || !countryPoint(c.labelAnchorQ)) return false;
    ids.add(c.id); cities.set(c.id, c as unknown as CountryCity);
  }
  let previous = -1;
  const owners = new Set<string>();
  for (const t of raw.territories) {
    if (!countryExact(t, ['cellId', 'legalNationId', 'controllingNationId']) || !countryInteger(t.cellId, 0, 512 * 512 - 1) || t.cellId <= previous
      || typeof t.legalNationId !== 'string' || !nations.has(t.legalNationId) || typeof t.controllingNationId !== 'string' || !nations.has(t.controllingNationId)) return false;
    previous = t.cellId; owners.add(t.legalNationId);
  }
  for (const n of nations.values()) if (!regimes.has(n.regimeId) || !owners.has(n.id) || n.capitalCityId !== null && cities.get(n.capitalCityId)?.nationId !== n.id) return false;
  return raw.version === 2 ? countryJsonBytes({ ...raw, territories: [] }).length <= COUNTRY_LIMITS.documentBytes : countryJsonBytes(raw).length <= COUNTRY_LIMITS.documentBytes;
}
export function validateCountryCommand(raw: unknown): raw is CountryCommand {
  if (!raw || typeof raw !== 'object') return false;
  const type = Object.getOwnPropertyDescriptor(raw, 'type')?.value;
  const cells = (value: unknown) => countryArray(value, COUNTRY_LIMITS.commandCells) && value.length > 0 && value.every(v => countryInteger(v, 0, 512 * 512 - 1));
  const outline = (value: unknown) => countryArray(value, 256) && value.length >= 3 && value.every(countryPoint);
  if (type === 'create-nation-shape') return countryExact(raw, ['type', 'name', 'color', 'outlineQ']) && countryName(raw.name) && typeof raw.color === 'string' && /^#[a-fA-F0-9]{6}$/.test(raw.color) && outline(raw.outlineQ);
  if (type === 'claim-territory-shape') return countryExact(raw, ['type', 'nationId', 'outlineQ']) && countryId(raw.nationId, 'nation') && outline(raw.outlineQ);
  if (type === 'create-nation') return countryExact(raw, ['type', 'name', 'color', 'cellIds']) && countryName(raw.name) && typeof raw.color === 'string' && /^#[a-fA-F0-9]{6}$/.test(raw.color) && cells(raw.cellIds);
  if (type === 'claim-territory') return countryExact(raw, ['type', 'nationId', 'cellIds']) && countryId(raw.nationId, 'nation') && cells(raw.cellIds);
  if (type === 'create-city') return countryExact(raw, ['type', 'nationId', 'name', 'positionQ']) && countryId(raw.nationId, 'nation') && countryName(raw.name) && countryPoint(raw.positionQ);
  if (type === 'set-capital') return countryExact(raw, ['type', 'nationId', 'cityId']) && countryId(raw.nationId, 'nation') && countryId(raw.cityId, 'city');
  if (type === 'rename-nation') return countryExact(raw, ['type', 'nationId', 'name']) && countryId(raw.nationId, 'nation') && countryName(raw.name);
  if (type === 'rename-city') return countryExact(raw, ['type', 'cityId', 'name']) && countryId(raw.cityId, 'city') && countryName(raw.name);
  return type === 'undo' && countryExact(raw, ['type']);
}
export const countryJsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
export async function countryDigest(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export function encodeCountryDocument(document: CountryDocument): Uint8Array {
  if (document.version !== 1) throw new Error('v2 国家世界必须通过分块编码保存与传送。');
  const bytes = countryJsonBytes(document);
  if (bytes.length > COUNTRY_LIMITS.documentBytes) throw new Error('本试玩档国家数据已超过 256 KiB 容量；本次不提交，也不会截断已有领土。');
  if (!validateCountryDocument(document)) throw new Error('国家世界格式或实体引用无效。');
  return bytes;
}
export class CountryFutureVersionError extends Error { constructor() { super('这是未来版本的国家世界，当前版本禁止写入或恢复覆盖。'); this.name = 'CountryFutureVersionError'; } }
export function decodeCountryDocument(bytes: Uint8Array): CountryDocument {
  if (!(bytes instanceof Uint8Array) || bytes.length > COUNTRY_LIMITS.documentBytes) throw new Error('国家世界字节容量无效。');
  const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (raw && typeof raw === 'object' && (raw as { version?: unknown }).version !== 1) throw new CountryFutureVersionError();
  if (!validateCountryDocument(raw) || raw.version !== 1) throw new Error('国家世界字段或引用校验失败。');
  return raw;
}
export function validateCountryState(raw: unknown): raw is CountryState {
  return countryExact(raw, ['document', 'rootDigest', 'readOnly', 'recovered', 'undoCount']) && validateCountryDocument(raw.document) && countryHash(raw.rootDigest)
    && typeof raw.readOnly === 'boolean' && typeof raw.recovered === 'boolean' && (!raw.recovered || raw.readOnly) && countryInteger(raw.undoCount, 0, COUNTRY_LIMITS.undoEntries) && (!raw.readOnly || raw.undoCount === 0);
}
