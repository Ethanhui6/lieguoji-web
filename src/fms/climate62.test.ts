import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { FmsEditHistory, prepareFmsBrushEdit, prepareFmsLockEdit, type FmsDocument } from './model';
import { FmsMapHistory, validFmsMapClimate } from './map-climate';
import { FMS_DATABASE_NAME, loadFmsDocument, saveFmsDocument } from './persistence';

const doc = (): FmsDocument => ({
  format: 'lieguoji-fms-world', version: 1, worldId: '5be0d480-99cb-4b0b-ad43-ec74d08c7f42', revision: 0, width: 100, height: 100,
  points: [[0, 0], [100, 0], [0, 100]], triangles: new Uint32Array([0, 1, 2]), neighbors: [[1, 2], [0, 2], [0, 1]], elevations: new Int32Array([45, 0, 0]),
});
const raw = () => new Promise<{ current: Record<string, unknown>; backup: unknown }>((resolve, reject) => {
  const q = indexedDB.open(FMS_DATABASE_NAME); q.onerror = () => reject(q.error);
  q.onsuccess = () => { const t = q.result.transaction('saves'), s = t.objectStore('saves'), c = s.get('current'), b = s.get('backup'); t.oncomplete = () => { q.result.close(); resolve({ current: c.result, backup: b.result }); }; };
});
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

describe('map climate beside the frozen terrain document', () => {
  it('validates climate values and records only real changes', () => {
    const h = new FmsMapHistory(new FmsEditHistory(doc()));
    expect(h.climate.precipitation).toBe(80);
    expect(h.setPrecipitation(80)).toBe(false); expect(h.canUndo).toBe(false);
    for (const bad of [0, 201, 20.5, NaN]) expect(() => h.setPrecipitation(bad)).toThrow();
    for (const bad of [null, {}, { precipitation: 20, extra: 1 }, { precipitation: '20' }]) expect(validFmsMapClimate(bad)).toBe(false);
    expect(() => new FmsMapHistory(new FmsEditHistory(doc()), { precipitation: 0 })).toThrow();
  });

  it('opts a v1 map into v2 in the same undo step and interleaves with terrain edits', () => {
    const h = new FmsMapHistory(new FmsEditHistory(doc())), before = h.document;
    expect(h.setPrecipitation(20)).toBe(true);
    expect(h.document).toMatchObject({ version: 2, revision: 1 }); expect(h.document.elevations).toEqual(before.elevations);
    h.commit(prepareFmsBrushEdit(h.document, { tool: 'land', stamps: [{ x: 99, y: 1, radius: 3 }], height: 50 }));
    h.commit(prepareFmsLockEdit(h.document, [{ x: 1, y: 1, radius: 3 }], true));
    h.setPrecipitation(120);
    h.undo(); expect(h.climate.precipitation).toBe(20); expect(h.document.terrainLocks![0]).toBe(1);
    h.undo(); h.undo(); expect(h.document.elevations[1]).toBe(0); expect(h.climate.precipitation).toBe(20);
    h.undo(); expect(h.climate.precipitation).toBe(80); expect(h.document.version).toBe(2); expect(h.canUndo).toBe(false);
    h.redo(); h.redo(); h.redo(); h.redo();
    expect(h.climate.precipitation).toBe(120); expect(h.document.elevations[1]).toBe(50); expect(h.canRedo).toBe(false);
    h.undo(); h.setPrecipitation(40); expect(h.canRedo).toBe(false);
  });

  it('saves v3 envelopes with checksummed climate, reloads them, and keeps v3 afterwards', async () => {
    const h = new FmsMapHistory(new FmsEditHistory(doc()));
    const first = await saveFmsDocument(h.document, null, h.climate);
    expect((await raw()).current.version).toBe(1);
    h.setPrecipitation(20);
    const second = await saveFmsDocument(h.document, first.storedRevision, h.climate);
    expect((await raw()).current).toMatchObject({ version: 3, climate: { precipitation: 20 }, document: { version: 2 } });
    const loaded = (await loadFmsDocument())!;
    expect(loaded.climate).toEqual({ precipitation: 20 }); expect(loaded.document.version).toBe(2);
    h.setPrecipitation(80);
    await saveFmsDocument(h.document, second.storedRevision, h.climate);
    expect((await raw()).current).toMatchObject({ version: 3, climate: { precipitation: 80 } });
    expect((await loadFmsDocument())!.climate).toEqual({ precipitation: 80 });
  });

  it('rejects tampered climate and refuses climate over a v1 document', async () => {
    const h = new FmsMapHistory(new FmsEditHistory(doc())); h.setPrecipitation(20);
    await saveFmsDocument(h.document, null, h.climate);
    const { current } = await raw();
    await new Promise<void>((resolve, reject) => { const q = indexedDB.open(FMS_DATABASE_NAME); q.onsuccess = () => { const t = q.result.transaction('saves', 'readwrite'); t.objectStore('saves').put({ ...current, climate: { precipitation: 40 } }, 'current'); t.oncomplete = () => { q.result.close(); resolve(); }; t.onerror = () => reject(t.error); }; });
    await expect(loadFmsDocument()).rejects.toMatchObject({ code: 'corrupt' });
    globalThis.indexedDB = new IDBFactory();
    await expect(saveFmsDocument(doc(), null, { precipitation: 20 })).rejects.toMatchObject({ code: 'invalid-document' });
    await expect(saveFmsDocument(doc(), null, { precipitation: 999 })).rejects.toMatchObject({ code: 'invalid-document' });
  });
});
