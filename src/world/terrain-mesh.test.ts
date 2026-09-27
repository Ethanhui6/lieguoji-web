import { describe, expect, it, vi } from 'vitest';
import { Mesh, Texture } from 'pixi.js';
import { AtlasTextureCache } from './atlas-texture-cache';
import { AtlasTerrainMesh, ensureTerrainMaterials, terrainMaterialTable, terrainMaterialUv, TERRAIN_LUT_HEIGHT, TERRAIN_LUT_PIXELS, TERRAIN_LUT_WIDTH } from './terrain-mesh';

describe('continuous terrain material lookup and actual mesh resources', () => {
  it('has independent opaque sea and land tables, including exact flat source anchors', () => {
    const land = terrainMaterialTable('land'), sea = terrainMaterialTable('sea');
    const at = (bytes: Uint8Array, x: number, y = 16) => [...bytes.slice((y * TERRAIN_LUT_WIDTH + x) * 4, (y * TERRAIN_LUT_WIDTH + x) * 4 + 4)];
    expect(at(land, 65)).toEqual([139, 163, 112, 255]); expect(at(sea, 1190)).toEqual([76, 151, 168, 255]);
    expect(at(land, 0)).toEqual([178, 181, 133, 255]); expect(at(sea, 1200)).toEqual([121, 186, 192, 255]);
    expect(land.length + sea.length).toBe(TERRAIN_LUT_PIXELS * 4);
    for (const table of [land, sea]) for (let i = 3; i < table.length; i += 4) expect(table[i]).toBe(255);
  });

  it('maps physical height/light linearly to texel centres without sea/land bleeding', () => {
    expect(terrainMaterialUv(650, 1, 'land')).toEqual([65.5 / 1201, .5]);
    expect(terrainMaterialUv(-100, 1, 'sea')[0]).toBeCloseTo(1190.5 / 1201, 14);
    const a = terrainMaterialUv(300, .9, 'land'), b = terrainMaterialUv(1600, 1.1, 'land'), midpoint = terrainMaterialUv(950, 1, 'land');
    expect(midpoint[0]).toBeCloseTo((a[0] + b[0]) / 2, 14); expect(midpoint[1]).toBeCloseTo((a[1] + b[1]) / 2, 14);
    expect(terrainMaterialUv(-12000, .87, 'sea')).toEqual([.5 / TERRAIN_LUT_WIDTH, .5 / TERRAIN_LUT_HEIGHT]);
    const edge = terrainMaterialUv(12000, 1.13, 'land'); expect(edge[0]).toBe((TERRAIN_LUT_WIDTH - .5) / TERRAIN_LUT_WIDTH); expect(edge[1]).toBeCloseTo((TERRAIN_LUT_HEIGHT - .5) / TERRAIN_LUT_HEIGHT, 14);
  });

  it('allocates each shared material once with linear filtering and charges all source pixels', () => {
    const cache = new AtlasTextureCache(), first = ensureTerrainMaterials(cache), second = ensureTerrainMaterials(cache);
    expect(second.land).toBe(first.land); expect(second.sea).toBe(first.sea); expect(first.sea).not.toBe(first.land);
    expect(cache.stats()).toMatchObject({ pixels: TERRAIN_LUT_PIXELS, sharedPixels: TERRAIN_LUT_PIXELS, sharedEntries: 2, sharedCreated: 2 });
    for (const table of [first.land, first.sea]) {
      expect(table.source.style.scaleMode).toBe('linear'); expect(table.source.autoGenerateMipmaps).toBe(false); expect(table.source.mipLevelCount).toBe(1);
      expect(table.source.pixelWidth * table.source.pixelHeight).toBe(TERRAIN_LUT_WIDTH * TERRAIN_LUT_HEIGHT);
    }
    cache.clear(); expect(first.land.destroyed).toBe(true); expect(first.sea.destroyed).toBe(true);
    expect(cache.stats()).toMatchObject({ pixels: 0, sharedEntries: 0, sharedCreated: 2, sharedDestroyed: 2 });
  });

  it('owns position/UV/index buffers exactly once while leaving a shared palette alive', () => {
    const cache = new AtlasTextureCache(), material = ensureTerrainMaterials(cache), resource = new AtlasTerrainMesh();
    const surface = { positions: new Float32Array([0, 0, 10, 0, 10, 10, 0, 10, 5, 5]), heights: new Float32Array([500, 500, 500, 500, 2000]), lights: new Float32Array([1, 1, 1, 1, 1]), indices: new Uint32Array([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]) };
    resource.addSurface(surface, 'land', material.land);
    const mesh = resource.children[0] as Mesh, geometry = mesh.geometry;
    expect(resource.terrainBuffers).toEqual({ bytes: 128, vertices: 5, triangles: 4, shoreSegments: 0 });
    expect(mesh.batched).toBe(false); expect(geometry.getBuffer('aPosition').data).toBe(surface.positions); expect(geometry.getIndex().data).toBe(surface.indices);
    const uvs = geometry.getBuffer('aUV').data;
    expect(uvs[0]).toBeCloseTo(50.5 / 1201, 7); expect(uvs[8]).toBeCloseTo(200.5 / 1201, 7);
    const released = geometry.buffers.map(buffer => vi.spyOn(buffer, 'destroy')), destroyGeometry = vi.spyOn(geometry, 'destroy');
    resource.destroy(); resource.destroy();
    expect(destroyGeometry).toHaveBeenCalledExactlyOnceWith(true); for (const destroy of released) expect(destroy).toHaveBeenCalledTimes(1);
    expect(mesh.destroyed).toBe(true); expect(material.land.destroyed).toBe(false); cache.clear();
  });

  it('keeps an empty domain free of GPU geometry', () => {
    const resource = new AtlasTerrainMesh(); resource.addSurface({ positions: new Float32Array(), heights: new Float32Array(), lights: new Float32Array(), indices: new Uint32Array() }, 'sea', Texture.EMPTY);
    expect(resource.children).toHaveLength(0); expect(resource.terrainBuffers).toEqual({ bytes: 0, vertices: 0, triangles: 0, shoreSegments: 0 }); resource.destroy();
  });
});
