import { BufferImageSource } from 'pixi.js';
import type { FmsDocument } from './model';
import { deriveFmsOceanField, type FmsOceanField } from './ocean-coast';
import { deriveFmsSmoothedCoast } from './coast-curve';

// level0 World serialized colors, as bound by SetDeep/ShallowWaterColor.
// The original shader names are reversed: _DeepColor receives shallowColor.
export const FMS_OCEAN_SHALLOW = [.23584888875484467, .6113743782043457, .9999999403953552] as const;
export const FMS_OCEAN_DEEP = [.0784313753247261, .529411792755127, 1] as const;
export const FMS_OCEAN_EDGE_INTENSITY = .02;
// StateLineRenderer#31729 shallowLineThickness 1.2 world units is the SDF
// camera's coast band; half of it, at 0.15 world units per map unit (1600x900).
// Its ±0.1 world-unit side offset depends on an unrecovered direction sign.
export const FMS_OCEAN_SDF_BAND_HALF_WIDTH = Math.fround(1.2) / 2 / (240 / 1600);
// StateLineRenderer draws the SDF camera's coast source from the same
// SmoothBorderLines output as the visible ink, so distance follows the curve.
export const FMS_OCEAN_CONTRACT = 'recovered-shader191-smoothed-coast-band-distance-v3';

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
    const coast = deriveFmsSmoothedCoast(doc);
    const field = { ...deriveFmsOceanField(doc, Math.max(doc.width, doc.height) * FMS_OCEAN_EDGE_INTENSITY, 512, coast.segments, FMS_OCEAN_SDF_BAND_HALF_WIDTH), contourSegments: coast.sourceSegments };
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
