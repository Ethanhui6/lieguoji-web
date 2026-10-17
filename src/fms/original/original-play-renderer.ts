import { Application, Assets, Container, Sprite, Texture } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import parchmentUrl from './assets/parchment.jpg';
import type { AtlasCamera } from '../../world/camera';
import type { FmsDocument } from '../model';
import type { FmsOceanAppearance } from '../renderer';
import type { OriginalGrid } from './original-grid';
import { OriginalCellMesh, originalCellColor, originalCoast, originalSeaTexture } from './original-layers';
import { ORIGINAL_PRESETS, originalParchmentRect, type OriginalPreset } from './original-style';
import { originalRiverGeometry, originalRiverMesh } from './original-rivers';
import type { Geometry, Mesh, Shader } from 'pixi.js';

/** The playable world drawn the original's way, with the same surface the
 * culture world uses from FmsRenderer. Scene order mirrors the original
 * frame: sea quad, province cells (height background + state colors),
 * rivers (z -0.19, under state lines and the coastline),
 * gameplay layers (borders, coast ink, labels, forces), then the
 * ParchmentEffect multiply over all of it. Display only. */
export class OriginalPlayRenderer {
  private app = new Application();
  private scene = new Container();
  private sea = new Sprite();
  private cells?: OriginalCellMesh;
  private overlays = new Container();
  private parchment = new Sprite();
  private initialized = false;
  private destroyed = false;
  private preset: OriginalPreset = ORIGINAL_PRESETS[0];
  private heights?: ArrayLike<number>;
  private document?: FmsDocument;
  private rivers?: { source: FmsDocument; mesh: Mesh<Geometry, Shader> };
  private states: { owner: Int32Array; color: (province: number) => number | null } | null = null;
  readonly coast: ReturnType<typeof originalCoast>;
  constructor(private grid: OriginalGrid, heights: ArrayLike<number>, private onDisplayError: (error: unknown) => void = error => { throw error; }) {
    this.heights = heights; this.coast = originalCoast(grid, heights);
  }
  get canvas(): HTMLCanvasElement { return this.app.canvas; }
  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight), resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, antialias: true, autoStart: false, background: '#6b6150', preference: 'webgl' });
    this.initialized = true;
    if (this.destroyed) { this.app.destroy(true, { children: true }); return; }
    host.appendChild(this.canvas); this.canvas.tabIndex = 0;
    const texture = await Assets.load<Texture>(parchmentUrl);
    if (this.destroyed) return;
    this.parchment.texture = texture; this.parchment.blendMode = 'multiply';
    const rect = originalParchmentRect(this.grid.width, this.grid.height);
    this.parchment.position.set(rect.x, rect.y); this.parchment.width = rect.width; this.parchment.height = rect.height;
    this.scene.addChild(this.sea, this.overlays, this.parchment); this.app.stage.addChild(this.scene);
    this.canvas.dataset.renderer = 'original';
    this.build(); this.draw();
  }
  /** The play terrain is fixed for the open world; elevations select land cells. */
  setDocument(doc: FmsDocument): void { this.heights = doc.elevations; this.document = doc; if (this.initialized && !this.destroyed) { this.build(); this.draw(); } }
  setTerrainDisplay(): void {}
  /** 'paper' (the user's parchment screenshot sea) = preset 8, white sea under
   * parchment; 'source' = preset 1, the level0 blue sea. */
  setOceanAppearance(appearance: FmsOceanAppearance): void {
    this.preset = ORIGINAL_PRESETS[appearance === 'paper' ? 7 : 0];
    if (this.initialized && !this.destroyed) { this.buildSea(); this.parchment.visible = this.preset.parchment; this.draw(); }
  }
  setStates(owner: Int32Array | null, color: (province: number) => number | null): void {
    this.states = owner ? { owner, color } : null; this.recolor(); this.draw();
  }
  attachGameplayLayer(layer: Container): void { this.overlays.addChild(layer); this.draw(); }
  setCamera(camera: AtlasCamera): void { this.scene.position.set(camera.x, camera.y); this.scene.scale.set(camera.scale); this.draw(); }
  refresh(): void { this.draw(); }
  resize(width: number, height: number): void { if (!this.destroyed && this.initialized) { this.app.renderer.resize(width, height); this.draw(); } }
  private buildSea(): void {
    const old = this.sea.texture; this.sea.texture = originalSeaTexture(this.grid, this.coast.segments, this.preset);
    if (old && old !== Texture.EMPTY) old.destroy(true);
    this.sea.width = this.grid.width; this.sea.height = this.grid.height;
  }
  private build(): void {
    try {
      if (!this.heights) return;
      this.buildSea();
      this.cells?.destroy(); this.cells = new OriginalCellMesh(this.grid, this.heights);
      this.scene.addChildAt(this.cells.mesh, this.scene.getChildIndex(this.sea) + 1);
      this.recolor();
      this.canvas.dataset.originalCells = String(this.cells.cells.length);
      this.buildRivers();
    } catch (error) { this.onDisplayError(error); }
  }
  private buildRivers(): void {
    const doc = this.document; if (!doc || !this.cells) return;
    if (this.rivers?.source !== doc) {
      this.destroyRivers();
      const geometry = originalRiverGeometry(this.grid, doc);
      this.rivers = { source: doc, mesh: originalRiverMesh(geometry) };
      this.canvas.dataset.originalRivers = JSON.stringify(geometry.stats);
    }
    this.scene.addChildAt(this.rivers.mesh, this.scene.getChildIndex(this.cells.mesh) + 1);
  }
  private destroyRivers(): void {
    if (!this.rivers) return;
    const { geometry, shader } = this.rivers.mesh;
    this.rivers.mesh.destroy(); geometry.destroy(true); shader?.destroy(true); this.rivers = undefined;
  }
  private recolor(): void {
    const cells = this.cells, heights = this.heights; if (!cells || !heights) return;
    const states = this.states, alpha = this.preset.stateMapTransparency, mode = this.preset.heightBackground ? 'height-background' : 'height-palette';
    cells.setColors(cell => {
      const province = states ? states.owner[cell] : -1, color = province >= 0 ? states!.color(province) : null;
      return originalCellColor(heights[cell], mode, color, alpha);
    });
  }
  private draw(): void { if (this.initialized && !this.destroyed) this.app.render(); }
  destroy(): void { if (this.destroyed) return; this.destroyed = true; this.cells?.destroy(); this.destroyRivers(); if (this.initialized) this.app.destroy(true, { children: true }); }
}
