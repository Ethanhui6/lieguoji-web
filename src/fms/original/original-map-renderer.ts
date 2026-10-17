import { Application, Assets, Container, Geometry, GlProgram, Graphics, Mesh, Shader, Sprite, Texture } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import parchmentUrl from './assets/parchment.jpg';
import { createFmsCoastDistance } from '../ocean-coast';
import { deriveFmsCoastCurves, fmsCurveSegments, FMS_COAST_LINE_WIDTH } from '../coast-curve';
import { FMS_OCEAN_EDGE_INTENSITY, FMS_OCEAN_SDF_BAND_HALF_WIDTH } from '../ocean-surface';
import { originalCoastEdges, type OriginalGrid } from './original-grid';
import { originalLandLinear, originalParchmentRect, originalSeaSrgb, toSrgb, type OriginalLandMode, type OriginalPreset } from './original-style';

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

export interface OriginalMapState { grid: OriginalGrid; heights: ArrayLike<number>; preset: OriginalPreset; landMode: OriginalLandMode }
export interface OriginalMapStats { landCells: number; coastEdges: number; coastChains: number; coastPoints: number; buildMs: number }

/** Web reconstruction of the original map frame: ocean quad (Shader191 SDF),
 * province meshes of h>=20 Voronoi cells with one color per cell
 * (GenerateDrawProvinceMesh), smoothed coastline polylines, then the
 * ParchmentEffect multiply over the whole frame. */
export class OriginalMapRenderer {
  readonly app = new Application();
  readonly world = new Container();
  private sea = new Sprite();
  private land?: Mesh<Geometry, Shader>;
  private coast = new Graphics();
  private parchment = new Sprite();
  private ready = false;
  private destroyed = false;
  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight), resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, antialias: true, background: '#6b6150', preference: 'webgl' });
    if (this.destroyed) { this.app.destroy(true, { children: true }); return; }
    host.appendChild(this.app.canvas);
    this.app.canvas.dataset.testid = 'original-map';
    const texture = await Assets.load<Texture>(parchmentUrl);
    if (this.destroyed) return;
    this.parchment.texture = texture;
    this.parchment.blendMode = 'multiply';
    this.world.addChild(this.sea, this.coast, this.parchment);
    this.app.stage.addChild(this.world);
    this.ready = true;
  }
  resize(width: number, height: number) { if (this.ready) this.app.renderer.resize(width, height); }
  setCamera(x: number, y: number, scale: number) { this.world.position.set(x, y); this.world.scale.set(scale); }
  render(state: OriginalMapState): OriginalMapStats {
    const started = performance.now(), { grid, heights, preset, landMode } = state;
    // Sea: distance from the smoothed coast band, EdgeIntensity = 0.02 * max side.
    const coast = deriveFmsCoastCurves(originalCoastEdges(grid, heights)), segments = fmsCurveSegments(coast.lines);
    const cap = Math.max(grid.width, grid.height) * FMS_OCEAN_EDGE_INTENSITY, center = createFmsCoastDistance(segments, cap + FMS_OCEAN_SDF_BAND_HALF_WIDTH);
    const tw = 800, th = 450, canvas = document.createElement('canvas'); canvas.width = tw; canvas.height = th;
    const context = canvas.getContext('2d')!, image = context.createImageData(tw, th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const d = Math.max(0, center((x + .5) * grid.width / tw, (y + .5) * grid.height / th) - FMS_OCEAN_SDF_BAND_HALF_WIDTH);
      const c = originalSeaSrgb(preset, segments.length ? d / cap : 1), o = (y * tw + x) * 4;
      image.data[o] = c[0] * 255; image.data[o + 1] = c[1] * 255; image.data[o + 2] = c[2] * 255; image.data[o + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    this.sea.texture?.destroy(true); this.sea.texture = Texture.from(canvas); this.sea.width = grid.width; this.sea.height = grid.height;
    // Land: one flat color per h>=20 cell, triangulated as fans.
    let vertices = 0, indices = 0, landCells = 0;
    for (let cell = 0; cell < grid.polygons.length; cell++) if (heights[cell] >= 20) { const n = grid.polygons[cell].length / 2; if (n >= 3) { vertices += n; indices += (n - 2) * 3; landCells++; } }
    const positions = new Float32Array(vertices * 2), colors = new Float32Array(vertices * 3), index = new Uint32Array(indices);
    let v = 0, k = 0;
    for (let cell = 0; cell < grid.polygons.length; cell++) {
      if (heights[cell] < 20) continue;
      const ring = grid.polygons[cell], n = ring.length / 2; if (n < 3) continue;
      const color = toSrgb(originalLandLinear(heights[cell], landMode));
      for (let i = 0; i < n; i++) { positions[(v + i) * 2] = ring[i * 2]; positions[(v + i) * 2 + 1] = ring[i * 2 + 1]; colors.set(color, (v + i) * 3); }
      for (let i = 1; i < n - 1; i++) { index[k++] = v; index[k++] = v + i; index[k++] = v + i + 1; }
      v += n;
    }
    if (this.land) { this.land.destroy(); this.land.geometry.destroy(true); this.land.shader?.destroy(true); }
    const geometry = new Geometry({ attributes: { aPosition: { buffer: positions, format: 'float32x2' }, aColor: { buffer: colors, format: 'float32x3' } }, indexBuffer: index });
    const shader = new Shader({ glProgram: GlProgram.from({ vertex, fragment, name: 'original-province-cells' }) });
    this.land = new Mesh({ geometry, shader });
    this.world.addChildAt(this.land, this.world.getChildIndex(this.sea) + 1);
    // Coastline: StateLineRenderer opaque polyline, coastLineThickness in world units.
    this.coast.clear();
    for (const line of coast.lines) { if (line.length < 2) continue; this.coast.moveTo(line[0][0], line[0][1]); for (let i = 1; i < line.length; i++) this.coast.lineTo(line[i][0], line[i][1]); }
    if (coast.points) this.coast.stroke({ width: FMS_COAST_LINE_WIDTH, color: preset.coastLine, join: 'round', cap: 'round' });
    const rect = originalParchmentRect(grid.width, grid.height);
    this.parchment.visible = preset.parchment;
    this.parchment.position.set(rect.x, rect.y); this.parchment.width = rect.width; this.parchment.height = rect.height;
    const stats = { landCells, coastEdges: coast.sourceSegments, coastChains: coast.chains, coastPoints: coast.points, buildMs: performance.now() - started };
    this.app.canvas.dataset.stats = JSON.stringify(stats);
    return stats;
  }
  destroy() {
    if (this.destroyed) return; this.destroyed = true;
    if (this.ready) this.app.destroy(true, { children: true });
  }
}
