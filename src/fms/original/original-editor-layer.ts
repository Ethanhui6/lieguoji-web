import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Geometry, Mesh, Shader } from 'pixi.js';
import parchmentUrl from './assets/parchment.jpg';
import { FMS_COAST_LINE_WIDTH } from '../coast-curve';
import type { FmsDocument } from '../model';
import type { OriginalGrid } from './original-grid';
import { OriginalCellMesh, originalCellColor, originalCoast, originalSeaTexture } from './original-layers';
import { originalRiverGeometry, originalRiverMesh } from './original-rivers';
import { originalParchmentRect, type OriginalLandMode, type OriginalPreset } from './original-style';

export interface OriginalEditorStats { landCells: number; coastChains: number; rivers: number; buildMs: number; mode: OriginalLandMode }

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
  private mode: OriginalLandMode = 'height-palette';
  private destroyed = false;
  constructor(private onReady: () => void = () => {}) {
    this.parchment.blendMode = 'multiply';
    this.container.addChild(this.sea, this.coast, this.parchment);
    void Assets.load<Texture>(parchmentUrl).then(texture => { if (this.destroyed) return; this.parchment.texture = texture; this.onReady(); });
  }
  /** Rebuild only when the grid, heights or preset changed. */
  update(grid: OriginalGrid, doc: FmsDocument, preset: OriginalPreset, mode: OriginalLandMode): OriginalEditorStats | null {
    if (this.destroyed) return null;
    const started = performance.now();
    if (this.built?.grid !== grid || this.built.elevations !== doc.elevations || this.built.preset !== preset) {
      const coast = originalCoast(grid, doc.elevations);
      const old = this.sea.texture; this.sea.texture = originalSeaTexture(grid, coast.segments, preset); if (old && old !== Texture.EMPTY) old.destroy(true);
      this.sea.width = grid.width; this.sea.height = grid.height;
      this.cells?.destroy(); this.cells = new OriginalCellMesh(grid, doc.elevations);
      this.container.addChildAt(this.cells.mesh, this.container.getChildIndex(this.sea) + 1);
      this.destroyRivers();
      const rivers = originalRiverGeometry(grid, doc); this.riverCount = rivers.stats.rivers;
      this.rivers = originalRiverMesh(rivers);
      this.container.addChildAt(this.rivers, this.container.getChildIndex(this.cells.mesh) + 1);
      this.coast.clear();
      for (const line of coast.lines) { if (line.length < 2) continue; this.coast.moveTo(line[0][0], line[0][1]); for (let i = 1; i < line.length; i++) this.coast.lineTo(line[i][0], line[i][1]); }
      if (coast.points) this.coast.stroke({ width: FMS_COAST_LINE_WIDTH, color: preset.coastLine, join: 'round', cap: 'round' });
      const rect = originalParchmentRect(grid.width, grid.height);
      this.parchment.visible = preset.parchment; this.parchment.position.set(rect.x, rect.y); this.parchment.width = rect.width; this.parchment.height = rect.height;
      this.built = { grid, elevations: doc.elevations, preset };
      this.mode = mode === 'height-palette' ? 'height-background' : 'height-palette';
      this.coastChains = coast.chains;
    }
    if (this.mode !== mode) { const heights = doc.elevations; this.cells!.setColors(cell => originalCellColor(heights[cell], mode, null, 0)); this.mode = mode; }
    return { landCells: this.cells!.cells.length, coastChains: this.coastChains, rivers: this.riverCount, buildMs: performance.now() - started, mode };
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
