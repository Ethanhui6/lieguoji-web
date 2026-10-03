import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import type { CountryDocument } from '../../src/world/politics/model';

/** Test observation only: no injected game state, worker commands or IDB writes. */
export async function persistedCountry(page: Page, id: string) {
  const raw = await page.evaluate(async id => {
    const databases = await indexedDB.databases();
    for (const name of ['lieguoji-country-worlds-v4', 'lieguoji-country-worlds-v3', 'lieguoji-country-worlds-v2', 'lieguoji-country-worlds-v1']) {
      if (!databases.some(db => db.name === name)) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => r.transaction!.abort(); r.onerror = () => reject(r.error); r.onsuccess = () => resolve(r.result); });
      try {
        const records = await new Promise<{ root: { current: { bytes: Uint8Array; digest: string }; rootDigest: string } | undefined; geo: { sha256: string; encodedBytes: number; manifest: Uint8Array; source: unknown }; chunks: Record<string, number[]> }>((resolve, reject) => {
          const stores = !name.endsWith('v1') ? ['worlds', 'geography', 'chunks'] : ['worlds', 'geography'];
          const tx = db.transaction(stores, 'readonly'), root = tx.objectStore('worlds').get(id), geo = tx.objectStore('geography').get(id), chunks: Record<string, number[]> = {};
          root.onsuccess = () => {
            if (!name.endsWith('v1') && root.result) {
              const manifest = JSON.parse(new TextDecoder().decode(root.result.current.bytes));
              for (const ref of manifest.pages) { const r = tx.objectStore('chunks').get(`${id}:${ref.digest}`); r.onsuccess = () => { if (r.result) chunks[ref.digest] = Array.from(r.result as Uint8Array); }; }
            }
          };
          tx.oncomplete = () => resolve({ root: root.result, geo: geo.result, chunks }); tx.onabort = () => reject(tx.error);
        });
        if (!records.root) continue;
        return { database: name, bytes: Array.from(records.root.current.bytes), digest: records.root.current.digest, rootDigest: records.root.rootDigest, chunks: records.chunks,
          geoSha256: records.geo.sha256, geoBytes: records.geo.encodedBytes, geoManifest: Array.from(records.geo.manifest), geoSource: records.geo.source };
      } finally { db.close(); }
    }
    throw new Error('Saved country not found');
  }, id);
  const bytes = Uint8Array.from(raw.bytes), hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
  if (hash(bytes) !== raw.digest) throw new Error('Saved political bytes do not match checksum');
  const v2 = !raw.database.endsWith('v1'), version = Number(raw.database.slice(-1));
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  // Independent read-only decoding keeps browser test discovery out of Vite's
  // runtime fingerprint graph, and checks persisted values without calling the
  // same production decoder that performed the writes.
  let document: CountryDocument = parsed;
  if (v2) {
    if (parsed.format !== 'lieguoji-country-manifest' || parsed.version !== 2 || parsed.document.version !== version || !Array.isArray(parsed.pages)) throw new Error('Invalid version-bound chunk manifest');
    const territories: CountryDocument['territories'] = []; let previousPage = -1, previousCell = -1;
    for (const ref of parsed.pages) {
      if (ref.pageId <= previousPage || !raw.chunks[ref.digest]) throw new Error('Missing/reordered chunk'); previousPage = ref.pageId;
      const chunk = Uint8Array.from(raw.chunks[ref.digest]);
      if (chunk.length !== ref.size || hash(chunk) !== ref.digest) throw new Error('Saved chunk checksum mismatch');
      const page = JSON.parse(new TextDecoder().decode(chunk));
      if (page.version !== 2 || page.pageId !== ref.pageId || page.rows.length !== ref.count) throw new Error('Chunk identity mismatch');
      for (const [offset, legal, control] of page.rows) {
        const cellId = ref.pageId * 1024 + offset, legalNationId = page.dictionary[legal], controllingNationId = page.dictionary[control];
        if (!Number.isInteger(offset) || offset < 0 || offset >= 1024 || cellId <= previousCell || !parsed.document.nations.some((n: { id: string }) => n.id === legalNationId)
          || !parsed.document.nations.some((n: { id: string }) => n.id === controllingNationId)) throw new Error('Persisted territory reference invalid');
        previousCell = cellId; territories.push({ cellId, legalNationId, controllingNationId });
      }
    }
    if (territories.length !== parsed.territoryCount) throw new Error('Incomplete stored territories');
    document = { ...parsed.document, territories };
  }
  if (version === 4) for (const regime of document.regimes) {
    if (!Object.hasOwn(regime, 'institution')) throw new Error('Missing v4 institution field');
    const value = regime.institution;
    if (value === null) continue;
    if (!value || Object.keys(value).sort().join(',') !== 'localAppointment,localRevenueBps,recruitment,succession,template,version'
      || value.version !== 1 || !['central-office', 'landed-obligation', 'member-autonomy', 'custom'].includes(value.template)
      || !['hereditary', 'election', 'appointment'].includes(value.succession) || !['central', 'local'].includes(value.localAppointment)
      || !['standing', 'levy', 'mixed'].includes(value.recruitment) || !Number.isSafeInteger(value.localRevenueBps)
      || value.localRevenueBps < 0 || value.localRevenueBps > 10000) throw new Error('Invalid persisted institution');
  }
  return { document, rootDigest: raw.rootDigest, documentDigest: raw.digest, geoSha256: raw.geoSha256, geoBytes: raw.geoBytes,
    geoManifestHash: hash(Uint8Array.from(raw.geoManifest)), geoSource: raw.geoSource,
    storage: { version, manifestBytes: bytes.length, pages: v2 ? parsed.pages.length : 0,
      chunkBytes: Object.values(raw.chunks).reduce((sum, part) => sum + part.length, 0) } };
}
