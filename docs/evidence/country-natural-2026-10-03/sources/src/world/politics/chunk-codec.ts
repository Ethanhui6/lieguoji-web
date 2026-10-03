import { COUNTRY_LIMITS, CountryFutureVersionError, countryArray, countryDigest, countryExact, countryHash, countryId, countryInteger, countryJsonBytes, encodeCountryDocument, validateCountryDocument, type CountryDocument, type CountryTerritory } from './model';

export const COUNTRY_V2_DATABASE = 'lieguoji-country-worlds-v2';
export const COUNTRY_V3_DATABASE = 'lieguoji-country-worlds-v3';
export const COUNTRY_CHUNK_LIMITS = Object.freeze({ cells: 1024, pages: 256, pageBytes: 32 * 1024, manifestBytes: 256 * 1024, worldStoredBytes: 64 * 1024 * 1024 });
export interface CountryChunkRef { pageId: number; digest: string; size: number; count: number }
export interface CountryChunk { pageId: number; digest: string; bytes: Uint8Array }
export interface CountryManifest {
  format: 'lieguoji-country-manifest'; version: 2;
  document: Omit<CountryDocument, 'territories'>; territoryCount: number; pages: CountryChunkRef[];
}
interface TerritoryPage { format: 'lieguoji-country-territory-page'; version: 2; pageId: number; dictionary: string[]; rows: number[][] }
export interface EncodedCountry { bytes: Uint8Array; digest: string; chunks: CountryChunk[] }
const metadataKeys = ['format', 'version', 'worldId', 'name', 'source', 'revision', 'nations', 'regimes', 'cities'];
export function decodeCountryManifest(bytes: Uint8Array): CountryManifest {
  if (!(bytes instanceof Uint8Array) || bytes.length > COUNTRY_CHUNK_LIMITS.manifestBytes) throw new Error('国家分块清单容量无效。');
  const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (raw && typeof raw === 'object' && (raw as { version?: unknown }).version !== 2) throw new CountryFutureVersionError();
  if (!countryExact(raw, ['format', 'version', 'document', 'territoryCount', 'pages']) || raw.format !== 'lieguoji-country-manifest'
    || !countryExact(raw.document, metadataKeys) || !countryInteger(raw.territoryCount, 0, COUNTRY_LIMITS.territories) || !countryArray(raw.pages, COUNTRY_CHUNK_LIMITS.pages)) throw new Error('国家分块清单字段无效。');
  if (raw.document.version !== 2 && raw.document.version !== 3) throw new CountryFutureVersionError();
  let previous = -1, count = 0;
  for (const page of raw.pages) {
    if (!countryExact(page, ['pageId', 'digest', 'size', 'count']) || !countryInteger(page.pageId, 0, 255) || page.pageId <= previous || !countryHash(page.digest)
      || !countryInteger(page.size, 1, COUNTRY_CHUNK_LIMITS.pageBytes) || !countryInteger(page.count, 1, COUNTRY_CHUNK_LIMITS.cells)) throw new Error('国家分块引用顺序、身份或容量无效。');
    previous = page.pageId; count += page.count;
  }
  if (count !== raw.territoryCount) throw new Error('国家分块清单数量不一致。');
  return raw as unknown as CountryManifest;
}
export async function encodeCountryChunks(input: CountryDocument): Promise<EncodedCountry> {
  if (input.version !== 2 && input.version !== 3 || !validateCountryDocument(input)) throw new Error('分块国家实体或容量无效。');
  const document = structuredClone(input);
  const grouped = new Map<number, CountryTerritory[]>();
  for (const row of document.territories) { const id = Math.floor(row.cellId / COUNTRY_CHUNK_LIMITS.cells), rows = grouped.get(id) ?? []; rows.push(row); grouped.set(id, rows); }
  const chunks: CountryChunk[] = [], pages: CountryChunkRef[] = [];
  for (const [pageId, entries] of grouped) {
    const dictionary = [...new Set(entries.flatMap(t => [t.legalNationId, t.controllingNationId]))].sort(), slots = new Map(dictionary.map((id, index) => [id, index]));
    const page: TerritoryPage = { format: 'lieguoji-country-territory-page', version: 2, pageId, dictionary,
      rows: entries.map(t => [t.cellId % COUNTRY_CHUNK_LIMITS.cells, slots.get(t.legalNationId)!, slots.get(t.controllingNationId)!]) };
    const bytes = countryJsonBytes(page);
    if (bytes.length > COUNTRY_CHUNK_LIMITS.pageBytes) throw new Error('国家单个领土分块超过容量。');
    const digest = await countryDigest(bytes); chunks.push({ pageId, digest, bytes }); pages.push({ pageId, digest, size: bytes.length, count: entries.length });
  }
  const { territories, ...metadata } = document;
  const manifest: CountryManifest = { format: 'lieguoji-country-manifest', version: 2, document: metadata, territoryCount: territories.length, pages };
  const bytes = countryJsonBytes(manifest);
  if (bytes.length > COUNTRY_CHUNK_LIMITS.manifestBytes) throw new Error('国家实体清单超过容量。');
  // The manifest is transported as text, not JSON-expanded Uint8Array indices.
  // Reserve more envelope space than either state or preview can use, before
  // any durable write; confirmation cannot discover an oversized result late.
  if (countryJsonBytes({ manifestText: new TextDecoder().decode(bytes) }).length + 8192 > COUNTRY_LIMITS.packetBytes) throw new Error('国家清单无法装入有界回执，未保存。');
  return { bytes, digest: await countryDigest(bytes), chunks };
}
export async function decodeCountryChunks(bytes: Uint8Array, read: (reference: CountryChunkRef) => Promise<Uint8Array>): Promise<CountryDocument> {
  const manifest = decodeCountryManifest(bytes), territories: CountryTerritory[] = [];
  for (const ref of manifest.pages) {
    const owned = new Uint8Array(await read({ ...ref }));
    if (owned.length !== ref.size || owned.length > COUNTRY_CHUNK_LIMITS.pageBytes) throw new Error('国家领土分块缺失或容量不一致。');
    const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(owned));
    if (raw && typeof raw === 'object' && (raw as { version?: unknown }).version !== 2) throw new CountryFutureVersionError();
    if (await countryDigest(owned) !== ref.digest || !countryExact(raw, ['format', 'version', 'pageId', 'dictionary', 'rows']) || raw.format !== 'lieguoji-country-territory-page' || raw.pageId !== ref.pageId
      || !countryArray(raw.dictionary, COUNTRY_LIMITS.nations) || !raw.dictionary.length || !countryArray(raw.rows, COUNTRY_CHUNK_LIMITS.cells) || raw.rows.length !== ref.count) throw new Error('国家分块摘要或字段无效。');
    let priorId = '', previous = -1;
    const used = new Set<number>();
    for (const id of raw.dictionary) { if (!countryId(id, 'nation') || id <= priorId) throw new Error('国家分块字典无效。'); priorId = id; }
    for (const row of raw.rows) {
      if (!countryArray(row, 3) || row.length !== 3 || !countryInteger(row[0], 0, 1023) || row[0] <= previous || !countryInteger(row[1], 0, raw.dictionary.length - 1) || !countryInteger(row[2], 0, raw.dictionary.length - 1)) throw new Error('国家分块领土顺序或字典引用无效。');
      used.add(row[1]); used.add(row[2]); previous = row[0]; territories.push({ cellId: ref.pageId * 1024 + row[0], legalNationId: raw.dictionary[row[1]] as string, controllingNationId: raw.dictionary[row[2]] as string });
    }
    if (used.size !== raw.dictionary.length) throw new Error('国家分块字典包含未使用的身份。');
  }
  const document = { ...manifest.document, territories };
  if (territories.length !== manifest.territoryCount || !validateCountryDocument(document)) throw new Error('国家分块组装后的实体引用无效。');
  return document;
}
export async function countryDocumentDigest(document: CountryDocument): Promise<string> {
  return document.version === 1 ? countryDigest(encodeCountryDocument(document)) : (await encodeCountryChunks(document)).digest;
}
