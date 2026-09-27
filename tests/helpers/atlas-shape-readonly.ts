import type { Page } from '@playwright/test';

// Read-only IDB/hash/LGAB/renderer diagnostics, adapted from the established
// coast and island acceptance. No application module or generator is imported.
export interface SavedManifest {
  version: number; revision: number; atlasId: string;
  spec: { columns: number; rows: number; width: number; height: number; coordinateScale: number; blockCells: number };
  blockRefs: { key: string; hash: string }[];
  constraints: { format: string; version: number; lockCodec: string; lockRefs: { bx: number; by: number; hash: string }[] };
  generation: { lastApplied: { recipe: { generator: { id: string; version: number; fingerprint: string }; seed?: string; parameters: Record<string, number | { xQ: number; yQ: number }[]> }; appliedRevision: number } | null };
}
export interface SavedSnapshot {
  rootBytes: number[]; manifestBytes: number[];
  root: { revision: number; domain: string; rootDigest: string; currentManifest: string; backupManifest: string | null };
  manifest: SavedManifest;
}
export interface Geography { heights: number[]; xyQ: number[]; verifiedBlocks: number }
export interface Audit {
  ok: boolean; manifestDigest: string; draftId: string; revision: number; verifiedBlocks: number;
  display: { source: string; manifestDigest: string; revision: number; version: number; verifiedBlocks: number };
}
export interface Metrics {
  camera: { x: number; y: number; scale: number }; viewport: { width: number; height: number; resolution: number };
  lod: string; cellPixels: number; gridVisible: boolean; completedFrameSequence: number; displaySource: string;
  acceptedRevision: number; committedRevision: number; displayRevision: number;
}
export async function saved(page: Page, draftId: string): Promise<SavedSnapshot> {
  return page.evaluate(id => new Promise<SavedSnapshot>((resolve, reject) => {
    const request = indexedDB.open('lieguoji-atlas-drafts-v2', 1);
    request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['roots', 'manifests'], 'readonly'); let result: SavedSnapshot;
      const root = tx.objectStore('roots').get(id);
      root.onsuccess = () => {
        if (!(root.result instanceof Uint8Array)) { tx.abort(); return; }
        const value = JSON.parse(new TextDecoder().decode(root.result)) as SavedSnapshot['root'];
        const read = tx.objectStore('manifests').get(value.currentManifest);
        read.onsuccess = () => {
          if (!(read.result?.bytes instanceof Uint8Array)) { tx.abort(); return; }
          result = { root: value, rootBytes: [...root.result], manifestBytes: [...read.result.bytes], manifest: JSON.parse(new TextDecoder().decode(read.result.bytes)) };
        };
      };
      tx.oncomplete = () => { db.close(); resolve(result); }; tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing saved draft')); };
    };
  }), draftId);
}
export async function databaseDigest(page: Page) {
  return page.evaluate(async () => {
    const rows = await new Promise<{ store: string; keys?: IDBValidKey[]; values?: unknown[] }[]>((resolve, reject) => {
      const request = indexedDB.open('lieguoji-atlas-drafts-v2', 1);
      request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, names = [...db.objectStoreNames].sort(), tx = db.transaction(names, 'readonly'), values = names.map(store => ({ store })) as { store: string; keys?: IDBValidKey[]; values?: unknown[] }[];
        for (const row of values) {
          const store = tx.objectStore(row.store), keys = store.getAllKeys(), records = store.getAll();
          keys.onsuccess = () => { row.keys = keys.result; }; records.onsuccess = () => { row.values = records.result; };
        }
        tx.oncomplete = () => { db.close(); resolve(values); }; tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
    const bytes = new TextEncoder().encode(JSON.stringify(rows, (_key, value) => value instanceof Uint8Array ? [...value] : value));
    return { bytes: bytes.length, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('') };
  });
}
export async function geography(page: Page, manifest: SavedManifest): Promise<Geography> {
  return page.evaluate(async ({ spec, refs }) => {
    const records = await new Promise<{ key: string; hash: string; bytes: Uint8Array }[]>((resolve, reject) => {
      const request = indexedDB.open('lieguoji-atlas-drafts-v2', 1);
      request.onupgradeneeded = () => request.transaction!.abort(); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('blocks', 'readonly'), records: { key: string; hash: string; bytes: Uint8Array }[] = [];
        for (const ref of refs) {
          const read = tx.objectStore('blocks').get(ref.hash);
          read.onsuccess = () => { if (!(read.result?.bytes instanceof Uint8Array)) tx.abort(); else records.push({ ...ref, bytes: read.result.bytes }); };
        }
        tx.oncomplete = () => { db.close(); resolve(records); }; tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Missing geographic block')); };
      };
    });
    const layers = ['geometry', 'elevation', 'sim-membership', 'admin-membership'];
    const seenKeys = new Set<string>(), vertexSeen = new Uint8Array((spec.columns + 1) * (spec.rows + 1)), cellSeen = new Uint8Array(spec.columns * spec.rows);
    const heights = new Int32Array(cellSeen.length), xyQ = new Int32Array(vertexSeen.length * 2), step = spec.width * spec.coordinateScale / spec.columns;
    for (const { key, hash, bytes } of records) {
      const actualHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (hash !== actualHash) throw new Error('Persisted full-block hash mismatch');
      const [layer, rawX, rawY] = key.split(':'), bx = Number(rawX), by = Number(rawY), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (seenKeys.has(key) || bytes.length < 28 || [76, 71, 65, 66].some((value, index) => bytes[index] !== value)
        || view.getUint16(4, true) !== 1 || layers[bytes[6]] !== layer || bytes[7] !== (layer === 'geometry' ? 2 : 1)
        || view.getUint16(8, true) !== bx || view.getUint16(10, true) !== by || view.getUint32(12, true) !== 0) throw new Error('Invalid LGAB identity/header');
      seenKeys.add(key); let offset = 16; const columns: number[][] = [];
      for (let column = 0; column < bytes[7]; column++) {
        const signed = layer === 'elevation' || layer === 'geometry' && column === 1, length = view.getUint32(offset + 4, true), byteLength = view.getUint32(offset + 8, true);
        if (bytes[offset] !== (signed ? 2 : 1) || bytes[offset + 1] || bytes[offset + 2] || bytes[offset + 3] || length > 2178 || byteLength !== length * 4 || offset + 12 + byteLength > bytes.length) throw new Error('Invalid LGAB column');
        offset += 12; const values: number[] = [];
        for (let slot = 0; slot < length; slot++, offset += 4) values.push(signed ? view.getInt32(offset, true) : view.getUint32(offset, true));
        columns.push(values);
      }
      if (offset !== bytes.length) throw new Error('Unexpected LGAB trailing bytes');
      if (layer === 'geometry') {
        const startX = bx * 32 + Number(bx !== 0), startY = by * 32 + Number(by !== 0), endX = (bx + 1) * 32, endY = (by + 1) * 32;
        if (columns[0].length !== (endX - startX + 1) * (endY - startY + 1) || columns[1].length !== columns[0].length * 2) throw new Error('Wrong owned-vertex coverage');
        let slot = 0;
        for (let row = startY; row <= endY; row++) for (let col = startX; col <= endX; col++, slot++) {
          const id = row * (spec.columns + 1) + col, x = columns[1][slot * 2], y = columns[1][slot * 2 + 1];
          if (columns[0][slot] !== id || vertexSeen[id] || Math.abs(x - col * step) > step / 4 || Math.abs(y - row * step) > step / 4
            || (col === 0 || col === spec.columns) && x !== col * step || (row === 0 || row === spec.rows) && y !== row * step) throw new Error('Changed identity, duplicate owner or invalid vertex bound');
          vertexSeen[id] = 1; xyQ[id * 2] = x; xyQ[id * 2 + 1] = y;
        }
      } else {
        if (columns[0].length !== 1024) throw new Error('Incomplete cell layer');
        if (layer === 'elevation') for (let slot = 0; slot < 1024; slot++) {
          const id = (by * 32 + Math.floor(slot / 32)) * spec.columns + bx * 32 + slot % 32, value = columns[0][slot];
          if (cellSeen[id] || value < -12000 || value > 12000) throw new Error('Invalid real elevation coverage');
          cellSeen[id] = 1; heights[id] = value;
        }
      }
    }
    for (const layer of layers) for (let by = 0; by < spec.rows / 32; by++) for (let bx = 0; bx < spec.columns / 32; bx++) if (!seenKeys.has(`${layer}:${bx}:${by}`)) throw new Error('Incomplete full geography');
    if (vertexSeen.some(value => value !== 1) || cellSeen.some(value => value !== 1) || records.length !== 4 * (spec.columns / 32) * (spec.rows / 32)) throw new Error('Missing real cells/vertices');
    return { heights: [...heights], xyQ: [...xyQ], verifiedBlocks: records.length };
  }, { spec: manifest.spec, refs: manifest.blockRefs });
}

export async function audit(page: Page): Promise<Audit> {
  return page.getByTestId('atlas-canvas').evaluate(element => new Promise<Audit>((resolve, reject) => {
    const requestId = crypto.randomUUID(), timer = setTimeout(() => { element.removeEventListener('atlas-audit-response', listener); reject(new Error('Missing read-only audit')); }, 30000);
    const listener = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail.requestId !== requestId) return;
      clearTimeout(timer); element.removeEventListener('atlas-audit-response', listener); if (!detail.ok) reject(new Error(detail.error)); else resolve(detail); };
    element.addEventListener('atlas-audit-response', listener); element.dispatchEvent(new CustomEvent('atlas-audit-request', { detail: { requestId } }));
  }));
}
export async function metrics(page: Page): Promise<Metrics> {
  return page.getByTestId('atlas-canvas').evaluate(element => new Promise<Metrics>((resolve, reject) => {
    const requestId = crypto.randomUUID(), timer = setTimeout(() => { element.removeEventListener('atlas-metrics-response', listener); reject(new Error('Missing read-only metrics')); }, 10000);
    const listener = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail.requestId !== requestId) return;
      clearTimeout(timer); element.removeEventListener('atlas-metrics-response', listener); resolve(detail.metrics); };
    element.addEventListener('atlas-metrics-response', listener); element.dispatchEvent(new CustomEvent('atlas-metrics-request', { detail: { requestId } }));
  }));
}
