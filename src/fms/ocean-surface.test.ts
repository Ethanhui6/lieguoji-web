import { describe, expect, it } from 'vitest';
import { coastFixture } from '../../tests/helpers/fms-coast-metrics';
import { createFmsOceanSource, FmsOceanFields } from './ocean-surface';

describe('derived ocean field ownership and cache', () => {
  it('reuses original/preview fields and lock-only changes, never keys solely by revision', () => {
    const fields = new FmsOceanFields(), doc = coastFixture('island');
    const original = fields.get(doc);
    const candidate = { ...doc, elevations: Int32Array.from(doc.elevations, h => h === 45 ? 22 : h) };
    const preview = fields.get(candidate);
    expect(preview === original).toBe(false); expect(preview.pixels.some((value, id) => value !== original.pixels[id])).toBe(true);
    expect(fields.get({ ...doc, revision: 3, terrainLocks: new Uint8Array(doc.points.length) })).toBe(original);
    expect(fields.get(candidate)).toBe(preview); expect(fields.metrics().builds).toBe(2);
  });
  it('invalidates geometry and dimensions even if the elevation array is shared', () => {
    const fields = new FmsOceanFields(), doc = coastFixture('island'), initial = fields.get(doc);
    expect(fields.get({ ...doc, points: doc.points.map(p => [...p]) }) === initial).toBe(false);
    expect(fields.get({ ...doc, triangles: doc.triangles.slice() }) === initial).toBe(false);
    const wider = fields.get({ ...doc, width: doc.width * 2 });
    expect(wider.width).toBe(512); expect(wider.height).toBe(256);
    expect(wider.distanceCap).toBe(doc.width * 2 * .02);
    expect(fields.get({ ...doc, height: doc.height * 2 }).distanceCap).toBe(doc.height * 2 * .02);
    expect(fields.metrics().builds).toBe(5);
  });
  it('bounds CPU memory to three fields regardless of undo history and clears ownership', () => {
    const fields = new FmsOceanFields(), doc = coastFixture('island');
    const history = Array.from({ length: 7 }, () => ({ ...doc, elevations: doc.elevations.slice() }));
    history.forEach(item => fields.get(item));
    expect(fields.metrics()).toMatchObject({ builds: 7, entries: 3, bytes: 3 * 512 * 512 * 4 });
    fields.get(history[5]); expect(fields.metrics().builds).toBe(7);
    fields.get(history[0]); expect(fields.metrics().builds).toBe(8);
    fields.clear(); expect(fields.metrics()).toMatchObject({ entries: 0, bytes: 0 });
  });
  it('creates a filterable data texture without sRGB, float extensions, premultiplication or mipmaps', () => {
    const fields = new FmsOceanFields(), field = fields.get(coastFixture('island')), source = createFmsOceanSource(field);
    expect(source.resource).toBe(field.pixels);
    expect(source.format).toBe('rgba8unorm'); expect(source.alphaMode).toBe('no-premultiply-alpha');
    expect(source.scaleMode).toBe('linear'); expect(source.addressMode).toBe('clamp-to-edge');
    expect(source.autoGenerateMipmaps).toBe(false); expect(source.mipLevelCount).toBe(1);
    expect(source.autoGarbageCollect).toBe(false);
    source.destroy(); expect(source.destroyed).toBe(true);
  });
});
