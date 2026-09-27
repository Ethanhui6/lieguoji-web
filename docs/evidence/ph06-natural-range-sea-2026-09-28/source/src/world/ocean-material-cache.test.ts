import { describe, expect, it, vi } from 'vitest';
import { AtlasRenderer } from './renderer';
import { AtlasTextureCache, type AtlasTextureSpec, type AtlasCacheLayer } from './atlas-texture-cache';
import { createAtlasDraft, cloneAtlasDraft, type BlockKey, type AtlasGeographyView } from './model';
import { createGenerationDraft, cloneGenerationDocument } from './generation-format';
import { ensureTerrainMaterials, TERRAIN_LUT_PIXELS } from './terrain-mesh';
import { TERRAIN_MATERIAL_VERSION } from './terrain-material';

interface CacheKeyProbe {
  data: AtlasGeographyView; refs: Map<BlockKey, string>;
  specFor(key: BlockKey, layer: AtlasCacheLayer, density: number, tile?: { x: number; y: number; subdivisions: number }): AtlasTextureSpec;
}

describe('material identity at real shared LUT and renderer cache boundaries (no GPU)', () => {
  it('uses the new version for both shared LUTs, with the same two sources and pixel ledger', () => {
    const cache = new AtlasTextureCache(), ensure = vi.spyOn(cache, 'ensureShared');
    const first = ensureTerrainMaterials(cache), second = ensureTerrainMaterials(cache);
    expect(ensure.mock.calls.map(call => call[0])).toEqual([
      `terrain-surface-lut/${TERRAIN_MATERIAL_VERSION}/land`, `terrain-surface-lut/${TERRAIN_MATERIAL_VERSION}/sea`,
      `terrain-surface-lut/${TERRAIN_MATERIAL_VERSION}/land`, `terrain-surface-lut/${TERRAIN_MATERIAL_VERSION}/sea`,
    ]);
    expect(first.land).toBe(second.land); expect(first.sea).toBe(second.sea);
    expect(cache.stats()).toMatchObject({ pixels: TERRAIN_LUT_PIXELS, sharedCreated: 2, sharedEntries: 2, sharedBindings: 2 });
    cache.clear(); expect(cache.stats()).toMatchObject({ pixels: 0, sharedDestroyed: 2 });
  });

  it('versions terrain cores and subcores of old and v4 drafts without changing grid keys, bounds or source data', async () => {
    const control = { yieldTask: async () => {} };
    const legacy = await createAtlasDraft({ size: 128, seed: 'ocean-material-cache', name: '旧地表' }, control);
    const fine = await createGenerationDraft({ size: 128, seed: 'ocean-material-cache', name: '细地表' }, control, 4);
    const originals = [cloneAtlasDraft(legacy), cloneGenerationDocument(fine)];
    for (const data of [legacy, fine]) {
      // Exercise the real cache spec method without constructing an app or
      // pretending this CPU identity test executes a GPU renderer.
      const probe = Object.create(AtlasRenderer.prototype) as CacheKeyProbe;
      probe.data = data; probe.refs = new Map(data.manifest.blockRefs.map(ref => [ref.key, ref.hash]));
      for (const density of [.25, 1, 32]) for (const tile of [undefined, { x: 1, y: 2, subdivisions: 4 }]) {
        const terrain = probe.specFor('geometry:1:1', 'terrain', density, tile);
        const grid = probe.specFor('geometry:1:1', 'grid', density, tile);
        expect(terrain.key.split('/').filter(part => part === TERRAIN_MATERIAL_VERSION)).toHaveLength(1);
        expect(grid.key).not.toContain(TERRAIN_MATERIAL_VERSION);
        const surface = data.manifest.version === 4 ? 'detail-final-q8-v1/0' : 'terrain-surface-v1';
        const expectedStart = `${data.manifest.atlasId}/${surface}/${TERRAIN_MATERIAL_VERSION}/geometry:1:1/terrain/${Math.log2(density)}/`;
        expect(terrain.key.startsWith(expectedStart)).toBe(true);
        expect(terrain.dependencies.every(key => probe.refs.has(key))).toBe(true);
        for (const field of ['pixelWidth', 'pixelHeight', 'worldX', 'worldY', 'density', 'sampleX', 'sampleY', 'core'] as const) expect(terrain[field]).toEqual(grid[field]);
      }
    }
    expect(legacy).toEqual(originals[0]); expect(fine).toEqual(originals[1]);
  });
});
