import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import parchmentUrl from './assets/parchment.jpg';
import { FMS_COAST_LINE_WIDTH } from '../coast-curve';
import type { OriginalGrid } from './original-grid';
import { OriginalCellMesh, originalCellColor, originalCoast, originalSeaTexture } from './original-layers';
import { originalParchmentRect, type OriginalLandMode, type OriginalPreset } from './original-style';

export interface OriginalMapState { grid: OriginalGrid; heights: ArrayLike<number>; preset: OriginalPreset; landMode: OriginalLandMode }
export interface OriginalMapStats { landCells: number; coastEdges: number; coastChains: number; coastPoints: number; buildMs: number }

/** Comparison view of the original map frame: ocean quad (Shader191 SDF),
 * flat province cells, smoothed coastline, ParchmentEffect multiply. */
export class OriginalMapRenderer {
  readonly app = new Application();
  readonly world = new Container();
  private sea = new Sprite();
  private cells?: OriginalCellMesh;
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
    this.parchment.texture = texture; this.parchment.blendMode = 'multiply';
    this.world.addChild(this.sea, this.coast, this.parchment);
    this.app.stage.addChild(this.world);
    this.ready = true;
  }
  resize(width: number, height: number) { if (this.ready) this.app.renderer.resize(width, height); }
  setCamera(x: number, y: number, scale: number) { this.world.position.set(x, y); this.world.scale.set(scale); }
  render(state: OriginalMapState): OriginalMapStats {
    const started = performance.now(), { grid, heights, preset, landMode } = state, coast = originalCoast(grid, heights);
    const old = this.sea.texture; this.sea.texture = originalSeaTexture(grid, coast.segments, preset); if (old && old !== Texture.EMPTY) old.destroy(true);
    this.sea.width = grid.width; this.sea.height = grid.height;
    this.cells?.destroy(); this.cells = new OriginalCellMesh(grid, heights);
    this.cells.setColors(cell => originalCellColor(heights[cell], landMode, null, 0));
    this.world.addChildAt(this.cells.mesh, this.world.getChildIndex(this.sea) + 1);
    this.coast.clear();
    for (const line of coast.lines) { if (line.length < 2) continue; this.coast.moveTo(line[0][0], line[0][1]); for (let i = 1; i < line.length; i++) this.coast.lineTo(line[i][0], line[i][1]); }
    if (coast.points) this.coast.stroke({ width: FMS_COAST_LINE_WIDTH, color: preset.coastLine, join: 'round', cap: 'round' });
    const rect = originalParchmentRect(grid.width, grid.height);
    this.parchment.visible = preset.parchment; this.parchment.position.set(rect.x, rect.y); this.parchment.width = rect.width; this.parchment.height = rect.height;
    const stats = { landCells: this.cells.cells.length, coastEdges: coast.sourceSegments, coastChains: coast.chains, coastPoints: coast.points, buildMs: performance.now() - started };
    this.app.canvas.dataset.stats = JSON.stringify(stats);
    return stats;
  }
  destroy() { if (this.destroyed) return; this.destroyed = true; if (this.ready) this.app.destroy(true, { children: true }); }
}
