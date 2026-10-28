import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Geometry, Mesh, Shader } from 'pixi.js';
import { loadLocalTexture } from '../local-texture';
import parchmentUrl from './assets/parchment.jpg';
import { FMS_COAST_LINE_WIDTH } from '../coast-curve';
import type { FmsDocument } from '../model';
import type { OriginalGrid } from './original-grid';
import { OriginalCellMesh, originalCellColor, originalCoast, originalSeaTexture } from './original-layers';
import { originalRiverGeometry, originalRiverMesh } from './original-rivers';
import { originalBiomeIds, originalBiomeLinear, originalClimate } from './original-biomes';
import { originalParchmentRect, type OriginalLandMode, type OriginalPreset } from './original-style';

export type OriginalEditorMode = OriginalLandMode | 'biome';
export interface OriginalEditorStats { landCells: number; coastChains: number; rivers: number; buildMs: number; mode: OriginalEditorMode; rainfall: number; climateBuilds: number }

/** The editor's map on an original grid, drawn as the original's editor:
 * ocean quad (Shader191 SDF), flat province cells (Shader189; mode 2 in the
 * height edit panel, mode 1 height background otherwise), rivers, smoothed
 * coastline, then the ParchmentEffect multiply. Display only: the editor's
 * strokes, protection and the document it edits are untouched. */
export class OriginalEditorLayer {
  readonly container = new Container();
  private sea = new Sprite();
  private cells?: OriginalCellMesh;
  private rivers?: Mesh<Geometry, Shader>;
  private coast = new Graphics();
  private parchment = new Sprite();
  private built?: { grid: OriginalGrid; elevations: FmsDocument['elevations']; preset: OriginalPreset };
  private mode: OriginalEditorMode = 'height-palette';
  private biome?: Float32Array;
  private destroyed = false;
  private rainfall = 80;
  private climateBuilds = 0;
  constructor(private onReady: () => void = () => {}, private onError: (error: unknown) => void = () => {}) {
    this.parchment.blendMode = 'multiply';
    this.container.addChild(this.sea, this.coast, this.parchment);
    void loadLocalTexture(parchmentUrl).then(texture => { if (this.destroyed) return; this.parchment.texture = texture; this.onReady(); }).catch(error => { if (!this.destroyed) this.onError(error); });
  }
  /** Rebuild only when the grid, heights or preset changed. */
  update(grid: OriginalGrid, doc: FmsDocument, preset: OriginalPreset, mode: OriginalEditorMode, rainfall = 80): OriginalEditorStats | null {
    if (this.destroyed) return null;
    const started = performance.now();
    const terrainChanged = this.built?.grid !== grid || this.built.elevations !== doc.elevations;
    if (terrainChanged || this.rainfall !== rainfall) {
      this.destroyRivers();
      const climate = originalClimate(grid, doc, rainfall), rivers = originalRiverGeometry(grid, doc, climate);
      this.riverCount = rivers.stats.rivers;
      this.biome = originalBiomeLinear(grid, originalBiomeIds(grid, doc, climate));
      this.rivers = originalRiverMesh(rivers);
      this.rainfall = rainfall;
      this.climateBuilds++;
      this.mode = mode === 'height-palette' ? 'biome' : 'height-palette';
    }
    if (terrainChanged || this.built?.preset !== preset) {
      const coast = originalCoast(grid, doc.elevations);
      const old = this.sea.texture; this.sea.texture = originalSeaTexture(grid, coast.segments, preset); if (old && old !== Texture.EMPTY) old.destroy(true);
      this.sea.width = grid.width; this.sea.height = grid.height;
      this.cells?.destroy(); this.cells = new OriginalCellMesh(grid, doc.elevations);
      this.container.addChildAt(this.cells.mesh, this.container.getChildIndex(this.sea) + 1);
      this.coast.clear();
      for (const line of coast.lines) { if (line.length < 2) continue; this.coast.moveTo(line[0][0], line[0][1]); for (let i = 1; i < line.length; i++) this.coast.lineTo(line[i][0], line[i][1]); }
      if (coast.points) this.coast.stroke({ width: FMS_COAST_LINE_WIDTH, color: preset.coastLine, join: 'round', cap: 'round' });
      const rect = originalParchmentRect(grid.width, grid.height);
      this.parchment.visible = preset.parchment; this.parchment.position.set(rect.x, rect.y); this.parchment.width = rect.width; this.parchment.height = rect.height;
      this.built = { grid, elevations: doc.elevations, preset };
      this.mode = mode === 'height-palette' ? 'biome' : 'height-palette';
      this.coastChains = coast.chains;
    }
    if (this.rivers) this.container.addChildAt(this.rivers, this.container.getChildIndex(this.cells!.mesh) + 1);
    if (this.mode !== mode) {
      const heights = doc.elevations, biome = mode === 'biome' ? this.biome : undefined, land = mode === 'biome' ? 'height-background' : mode;
      this.cells!.setColors(cell => originalCellColor(heights[cell], land, null, 0, biome?.subarray(cell * 3, cell * 3 + 3)));
      this.mode = mode;
    }
    return { landCells: this.cells!.cells.length, coastChains: this.coastChains, rivers: this.riverCount, buildMs: performance.now() - started, mode, rainfall: this.rainfall, climateBuilds: this.climateBuilds };
  }
  private coastChains = 0;
  private riverCount = 0;
  private destroyRivers(): void {
    if (!this.rivers) return;
    const { geometry, shader } = this.rivers; this.rivers.destroy(); geometry.destroy(true); shader?.destroy(true); this.rivers = undefined;
  }
  destroy(): void {
    if (this.destroyed) return; this.destroyed = true;
    this.cells?.destroy(); this.destroyRivers();
    const texture = this.sea.texture; this.container.destroy({ children: true }); if (texture && texture !== Texture.EMPTY) texture.destroy(true);
  }
}
