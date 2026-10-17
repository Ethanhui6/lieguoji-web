import { Geometry, GlProgram, Mesh, Shader, Texture } from 'pixi.js';
import { createFmsCoastDistance, type FmsCoastSegment } from '../ocean-coast';
import { deriveFmsCoastCurves, fmsCurveSegments, type FmsCoastCurves } from '../coast-curve';
import { FMS_OCEAN_EDGE_INTENSITY, FMS_OCEAN_SDF_BAND_HALF_WIDTH } from '../ocean-surface';
import { linearToSrgb, srgbToLinear } from '../height-palette';
import { originalCoastEdges, type OriginalGrid } from './original-grid';
import { originalLandLinear, originalSeaSrgb, type OriginalLandMode, type OriginalPreset } from './original-style';

const vertex = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec3 aColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec3 vColor;
void main(){vColor=aColor;vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);gl_Position=vec4(p.xy,0.0,1.0);}`;
const fragment = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 finalColor;
void main(){finalColor=vec4(vColor,1.0);}`;

/** Smoothed coastline from the original grid's land/sea Voronoi edges. */
export function originalCoast(grid: OriginalGrid, heights: ArrayLike<number>): FmsCoastCurves & { segments: FmsCoastSegment[] } {
  const curves = deriveFmsCoastCurves(originalCoastEdges(grid, heights));
  return { ...curves, segments: fmsCurveSegments(curves.lines) };
}

/** Shader191 sea quad: distance from the smoothed coast band, as a texture. */
export function originalSeaTexture(grid: OriginalGrid, segments: readonly FmsCoastSegment[], preset: OriginalPreset, width = 800, height = 450): Texture {
  const cap = Math.max(grid.width, grid.height) * FMS_OCEAN_EDGE_INTENSITY, center = createFmsCoastDistance(segments, cap + FMS_OCEAN_SDF_BAND_HALF_WIDTH);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!, image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const d = Math.max(0, center((x + .5) * grid.width / width, (y + .5) * grid.height / height) - FMS_OCEAN_SDF_BAND_HALF_WIDTH);
    const c = originalSeaSrgb(preset, segments.length ? d / cap : 1), o = (y * width + x) * 4;
    image.data[o] = c[0] * 255; image.data[o + 1] = c[1] * 255; image.data[o + 2] = c[2] * 255; image.data[o + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return Texture.from(canvas);
}

/** GenerateDrawProvinceMesh: every h>=20 cell is one flat-colored polygon. */
export class OriginalCellMesh {
  readonly mesh: Mesh<Geometry, Shader>;
  readonly cells: Int32Array;
  private starts: Int32Array;
  private counts: Int32Array;
  constructor(grid: OriginalGrid, readonly heights: ArrayLike<number>) {
    const cells: number[] = [];
    let vertices = 0, indices = 0;
    for (let cell = 0; cell < grid.polygons.length; cell++) {
      const n = grid.polygons[cell].length / 2;
      if (heights[cell] >= 20 && n >= 3) { cells.push(cell); vertices += n; indices += (n - 2) * 3; }
    }
    this.cells = Int32Array.from(cells); this.starts = new Int32Array(cells.length); this.counts = new Int32Array(cells.length);
    const positions = new Float32Array(vertices * 2), colors = new Float32Array(vertices * 3), index = new Uint32Array(indices);
    let v = 0, k = 0;
    cells.forEach((cell, i) => {
      const ring = grid.polygons[cell], n = ring.length / 2;
      this.starts[i] = v; this.counts[i] = n;
      for (let j = 0; j < n; j++) { positions[(v + j) * 2] = ring[j * 2]; positions[(v + j) * 2 + 1] = ring[j * 2 + 1]; }
      for (let j = 1; j < n - 1; j++) { index[k++] = v; index[k++] = v + j; index[k++] = v + j + 1; }
      v += n;
    });
    const geometry = new Geometry({ attributes: { aPosition: { buffer: positions, format: 'float32x2' }, aColor: { buffer: colors, format: 'float32x3' } }, indexBuffer: index });
    this.mesh = new Mesh({ geometry, shader: new Shader({ glProgram: GlProgram.from({ vertex, fragment, name: 'original-province-cells' }) }) });
  }
  /** Colors are sRGB 0..1 per cell; written to every vertex of the cell. */
  setColors(colorOf: (cell: number) => readonly [number, number, number]): void {
    const buffer = this.mesh.geometry.getBuffer('aColor'), data = buffer.data as Float32Array;
    this.cells.forEach((cell, i) => { const c = colorOf(cell); for (let j = 0; j < this.counts[i]; j++) data.set(c, (this.starts[i] + j) * 3); });
    buffer.update();
  }
  destroy(): void {
    // Mesh.destroy() releases its references; keep them to free GPU data.
    const { geometry, shader } = this.mesh;
    this.mesh.destroy(); geometry.destroy(true); shader?.destroy(true);
  }
}

const channels = (color: number) => [(color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255];
/** Land color with an optional state color laid over at the preset's
 * StateMapTransparency (inferred alpha = _Transparency), mixed in linear space. */
export function originalCellColor(height: number, mode: OriginalLandMode, state: number | null, alpha: number, linearBase?: ArrayLike<number>): [number, number, number] {
  // linearBase: Shader189 mode 0, the per-vertex biome color (already linear).
  const base = linearBase ? [linearBase[0], linearBase[1], linearBase[2]] : originalLandLinear(height, mode);
  if (state === null) return base.map(linearToSrgb) as [number, number, number];
  const s = channels(state).map(srgbToLinear);
  return base.map((v, i) => linearToSrgb(v + (s[i] - v) * alpha)) as [number, number, number];
}
