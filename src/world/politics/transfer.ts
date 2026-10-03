import { decodeCountryChunks, decodeCountryManifest, encodeCountryChunks, type CountryManifest } from './chunk-codec';
import { countryDigest, countryExact, countryHash, countryInteger, type CountryDocument, type CountryPreview, type CountryState } from './model';

interface TransferStart { format: 'lieguoji-country-transfer'; version: 2; resultType: 'state' | 'preview'; metadata: unknown; manifestText: string; digest: string }
interface TransferPage { index: number; digest: string; text: string }
interface TransferEnd { format: 'lieguoji-country-transfer-end'; version: 2; digest: string; pageCount: number }
export async function streamCountryResult(value: unknown, emit: (kind: 'transfer-start' | 'transfer-page', value: unknown) => void): Promise<unknown> {
  if (!value || typeof value !== 'object' || !('document' in value) || ![2, 3, 4].includes((value.document as CountryDocument)?.version)) return value;
  const result = value as CountryState | CountryPreview, { document, ...metadata } = result, encoded = await encodeCountryChunks(document);
  const start: TransferStart = { format: 'lieguoji-country-transfer', version: 2, resultType: 'rootDigest' in result ? 'state' : 'preview', metadata,
    manifestText: new TextDecoder().decode(encoded.bytes), digest: encoded.digest };
  emit('transfer-start', start);
  for (let index = 0; index < encoded.chunks.length; index++) {
    const chunk = encoded.chunks[index]; emit('transfer-page', { index, digest: chunk.digest, text: new TextDecoder().decode(chunk.bytes) } satisfies TransferPage);
  }
  return { format: 'lieguoji-country-transfer-end', version: 2, digest: encoded.digest, pageCount: encoded.chunks.length } satisfies TransferEnd;
}
/** Staging only: no runtime state is exposed until every ordered, hash-bound
 * page has arrived and the full entity/foreign-key validator accepts it. */
export class CountryTransferReader {
  private readonly start: TransferStart;
  private readonly manifest: CountryManifest;
  private readonly manifestBytes: Uint8Array;
  private readonly chunks = new Map<string, Uint8Array>();
  private next = 0;
  constructor(raw: unknown, resultType: 'state' | 'preview') {
    if (!countryExact(raw, ['format', 'version', 'resultType', 'metadata', 'manifestText', 'digest']) || raw.format !== 'lieguoji-country-transfer' || raw.version !== 2
      || raw.resultType !== resultType || typeof raw.manifestText !== 'string' || !countryHash(raw.digest)) throw new Error('国家分块回执头无效。');
    this.start = structuredClone(raw) as unknown as TransferStart;
    this.manifestBytes = new TextEncoder().encode(raw.manifestText); this.manifest = decodeCountryManifest(this.manifestBytes);
  }
  append(raw: unknown) {
    if (!countryExact(raw, ['index', 'digest', 'text']) || !countryInteger(raw.index, 0, 255) || raw.index !== this.next || typeof raw.text !== 'string' || !countryHash(raw.digest)) throw new Error('国家分块回执顺序或字段无效。');
    const ref = this.manifest.pages[this.next], bytes = new TextEncoder().encode(raw.text);
    if (!ref || raw.digest !== ref.digest || bytes.length !== ref.size || this.chunks.has(raw.digest)) throw new Error('国家分块回执与清单不一致。');
    this.chunks.set(raw.digest, bytes); this.next++;
  }
  async finish(raw: unknown): Promise<unknown> {
    if (!countryExact(raw, ['format', 'version', 'digest', 'pageCount']) || raw.format !== 'lieguoji-country-transfer-end' || raw.version !== 2 || raw.digest !== this.start.digest
      || raw.pageCount !== this.next || this.next !== this.manifest.pages.length || await countryDigest(this.manifestBytes) !== this.start.digest) throw new Error('国家分块回执未完整结束或清单摘要错误。');
    const document = await decodeCountryChunks(this.manifestBytes, async ref => { const value = this.chunks.get(ref.digest); if (!value) throw new Error('国家分块回执缺页。'); return value; });
    if (!this.start.metadata || typeof this.start.metadata !== 'object' || 'document' in this.start.metadata) throw new Error('国家分块结果元数据无效。');
    return { ...this.start.metadata, document };
  }
}
