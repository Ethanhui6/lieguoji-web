import { BufferImageSource } from 'pixi.js';
import type { FmsDocument } from './model';
import { deriveFmsOceanField, type FmsOceanField } from './ocean-coast';

// level0 World serialized colors, as bound by SetDeep/ShallowWaterColor.
// The original shader names are reversed: _DeepColor receives shallowColor.
export const FMS_OCEAN_SHALLOW = [.23584888875484467, .6113743782043457, .9999999403953552] as const;
export const FMS_OCEAN_DEEP = [.0784313753247261, .529411792755127, 1] as const;
export const FMS_OCEAN_EDGE_INTENSITY = .02;
export const FMS_OCEAN_CONTRACT = 'recovered-shader191-web-contour-distance-v1';

interface Entry {
  points: FmsDocument['points']; triangles: FmsDocument['triangles']; elevations: FmsDocument['elevations'];
  width: number; height: number; field: FmsOceanField;
}

/** CPU display cache only. Bounded even while undo retains many height arrays.
 * The owner renderer keeps ONE uploaded texture and destroys it after shader. */
export class FmsOceanFields {
  private entries: Entry[] = [];
  private builds = 0;
  private elapsed = 0;
  get(doc: FmsDocument): FmsOceanField {
    const index = this.entries.findIndex(entry => entry.points === doc.points && entry.triangles === doc.triangles
      && entry.elevations === doc.elevations && entry.width === doc.width && entry.height === doc.height);
    if (index >= 0) { const [entry] = this.entries.splice(index, 1); this.entries.unshift(entry); return entry.field; }
    const started = performance.now();
    // Unity Dist divides by output height; UpdateQuadUV maps both axes by
    // max(mapWidth,mapHeight) onto its square RT. Preserve that world-space
    // scale with our aspect-preserving texture. resolutionScale=1 is a web
    // default; camera zoom never changes the world-space band width.
    const field = deriveFmsOceanField(doc, Math.max(doc.width, doc.height) * FMS_OCEAN_EDGE_INTENSITY);
    this.elapsed = performance.now() - started; this.builds++;
    this.entries.unshift({ points: doc.points, triangles: doc.triangles, elevations: doc.elevations, width: doc.width, height: doc.height, field });
    if (this.entries.length > 3) this.entries.pop();
    return field;
  }
  metrics() { return { builds: this.builds, lastBuildMs: this.elapsed, entries: this.entries.length, bytes: this.entries.reduce((sum, entry) => sum + entry.field.pixels.byteLength, 0) }; }
  clear() { this.entries = []; }
}

export function createFmsOceanSource(field: FmsOceanField): BufferImageSource {
  return new BufferImageSource({ resource: field.pixels, width: field.width, height: field.height, format: 'rgba8unorm',
    alphaMode: 'no-premultiply-alpha', scaleMode: 'linear', addressMode: 'clamp-to-edge',
    autoGenerateMipmaps: false, mipLevelCount: 1, autoGarbageCollect: false, resolution: 1 });
}
