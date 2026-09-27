import { BufferImageSource, Container, Mesh, MeshGeometry, Texture } from 'pixi.js';
import type { AtlasTextureCache } from './atlas-texture-cache';
import type { AtlasTerrainBufferMetrics } from './atlas-terrain-geometry-cache';
import { atlasElevationColor } from './terrain-material';
import type { TerrainSurfaceMesh } from './terrain-surface';

/** Ten-metre samples retain the physical palette's interior anchor heights.
 * Half-texel coordinates prevent filtering beyond either sea/land table. */
export const TERRAIN_LUT_WIDTH = 1201;
export const TERRAIN_LUT_HEIGHT = 33;
export const TERRAIN_LUT_PIXELS = 2 * TERRAIN_LUT_WIDTH * TERRAIN_LUT_HEIGHT;
const minimumLight = .87, lightSpan = .26;
export type TerrainDomain = 'land' | 'sea';

export function terrainMaterialUv(height: number, light: number, domain: TerrainDomain): [number, number] {
  const normalizedHeight = Math.max(0, Math.min(1, (height + (domain === 'sea' ? 12000 : 0)) / 12000));
  const normalizedLight = Math.max(0, Math.min(1, (light - minimumLight) / lightSpan));
  return [(.5 + normalizedHeight * (TERRAIN_LUT_WIDTH - 1)) / TERRAIN_LUT_WIDTH,
    (.5 + normalizedLight * (TERRAIN_LUT_HEIGHT - 1)) / TERRAIN_LUT_HEIGHT];
}

export function terrainMaterialTable(domain: TerrainDomain): Uint8Array {
  const bytes = new Uint8Array(TERRAIN_LUT_WIDTH * TERRAIN_LUT_HEIGHT * 4);
  for (let x = 0; x < TERRAIN_LUT_WIDTH; x++) {
    const height = x / (TERRAIN_LUT_WIDTH - 1) * 12000 - (domain === 'sea' ? 12000 : 0);
    // The last sea texel remains sea even though its lookup coordinate is 0.
    const color = atlasElevationColor(domain === 'sea' ? Math.min(-Number.EPSILON, height) : height);
    for (let y = 0; y < TERRAIN_LUT_HEIGHT; y++) {
      const light = minimumLight + y / (TERRAIN_LUT_HEIGHT - 1) * lightSpan, offset = (y * TERRAIN_LUT_WIDTH + x) * 4;
      for (let channel = 0; channel < 3; channel++) bytes[offset + channel] = Math.max(0, Math.min(255, Math.round(((color >> (16 - channel * 8)) & 255) * light)));
      bytes[offset + 3] = 255;
    }
  }
  return bytes;
}

export function ensureTerrainMaterials(cache: AtlasTextureCache): Record<TerrainDomain, Texture> {
  const table = (domain: TerrainDomain) => cache.ensureShared(`terrain-surface-lut-v1/${domain}`, TERRAIN_LUT_WIDTH, TERRAIN_LUT_HEIGHT,
    () => new Texture({ source: new BufferImageSource({ resource: terrainMaterialTable(domain), width: TERRAIN_LUT_WIDTH, height: TERRAIN_LUT_HEIGHT,
      format: 'rgba8unorm', alphaMode: 'no-premultiply-alpha', scaleMode: 'linear', addressMode: 'clamp-to-edge',
      autoGenerateMipmaps: false, mipLevelCount: 1, autoGarbageCollect: false, resolution: 1 }) }));
  return { land: table('land'), sea: table('sea') };
}

/** Owns only mesh views and their three buffers. Shared palette sources belong
 * to AtlasTextureCache and must outlive all retained terrain meshes. */
export class AtlasTerrainMesh extends Container {
  readonly terrainBuffers: AtlasTerrainBufferMetrics = { bytes: 0, vertices: 0, triangles: 0, shoreSegments: 0 };
  private readonly geometries: MeshGeometry[] = [];
  constructor() { super(); }
  addSurface(surface: TerrainSurfaceMesh, domain: TerrainDomain, texture: Texture): void {
    if (!surface.indices.length) return;
    const uvs = new Float32Array(surface.positions.length);
    for (let i = 0; i < surface.heights.length; i++) {
      const [u, v] = terrainMaterialUv(surface.heights[i], surface.lights[i], domain); uvs[i * 2] = u; uvs[i * 2 + 1] = v;
    }
    const geometry = new MeshGeometry({ positions: surface.positions, uvs, indices: surface.indices, shrinkBuffersToFit: true });
    this.geometries.push(geometry);
    geometry.autoGarbageCollect = false;
    for (const buffer of geometry.buffers) buffer.autoGarbageCollect = false;
    // Built-in non-batched mesh rendering owns no hidden batch copy of these
    // buffers, and supports Pixi's WebGL and WebGPU texture paths.
    geometry.batchMode = 'no-batch';
    const mesh = new Mesh({ geometry, texture }); this.addChild(mesh);
    this.terrainBuffers.bytes += surface.positions.byteLength + uvs.byteLength + surface.indices.byteLength;
    this.terrainBuffers.vertices += surface.positions.length / 2; this.terrainBuffers.triangles += surface.indices.length / 3;
  }
  override destroy(): void {
    if (this.destroyed) return;
    let failure: unknown;
    for (const child of [...this.children]) {
      try { if (!child.destroyed) child.destroy({ children: true, texture: false, textureSource: false }); }
      catch (error) { failure ??= error; }
    }
    for (let i = this.geometries.length - 1; i >= 0; i--) {
      try { this.geometries[i].destroy(true); this.geometries.splice(i, 1); }
      catch (error) { failure ??= error; }
    }
    if (failure) throw failure;
    super.destroy();
  }
}
