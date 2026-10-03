import { panCamera, screenToWorld, zoomCameraAt, type AtlasCamera, type CameraPoint, type CameraSize } from '../world/camera';

export interface FmsGestureCallbacks {
  camera(): AtlasCamera;
  setCamera(camera: AtlasCamera): void;
  world(): CameraSize;
  viewport(): CameraSize;
  begin(point: CameraPoint): void;
  move(point: CameraPoint): void;
  commit(point: CameraPoint): void;
  cancel(): void;
}
const valid = (point: CameraPoint) => Number.isFinite(point.x) && Number.isFinite(point.y);
const midpoint = (a: CameraPoint, b: CameraPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: CameraPoint, b: CameraPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** One gesture owns a frozen drawing intent. After multitouch, no remaining
 * finger starts a new stroke until every pointer has ended. CSS pixel input. */
export class FmsGestures {
  private pointers = new Map<number, CameraPoint>();
  private drawing = false;
  private suppressed = false;
  constructor(private readonly callbacks: FmsGestureCallbacks) {}

  down(id: number, point: CameraPoint, drawing: boolean): void {
    if (!valid(point) || this.pointers.has(id)) return;
    this.pointers.set(id, point);
    if (this.pointers.size > 1) {
      this.cancelStroke(); this.suppressed = true; return;
    }
    if (!this.suppressed) {
      this.drawing = drawing;
      if (drawing) this.callbacks.begin(screenToWorld(this.callbacks.camera(), point));
    }
  }
  move(id: number, point: CameraPoint): void {
    const old = this.pointers.get(id);
    if (!old || !valid(point)) return;
    const before = [...this.pointers.values()];
    this.pointers.set(id, point);
    if (this.pointers.size === 2) {
      const after = [...this.pointers.values()];
      const a = midpoint(before[0], before[1]), b = midpoint(after[0], after[1]);
      const oldDistance = distance(before[0], before[1]), nextDistance = distance(after[0], after[1]);
      if (oldDistance < 1 || nextDistance < 1) return;
      const zoomed = zoomCameraAt(this.callbacks.camera(), nextDistance / oldDistance, a, this.callbacks.world(), this.callbacks.viewport());
      this.callbacks.setCamera(panCamera(zoomed, { x: b.x - a.x, y: b.y - a.y }));
    } else if (this.pointers.size === 1 && !this.suppressed) {
      if (this.drawing) this.callbacks.move(screenToWorld(this.callbacks.camera(), point));
      else this.callbacks.setCamera(panCamera(this.callbacks.camera(), { x: point.x - old.x, y: point.y - old.y }));
    }
  }
  up(id: number, point: CameraPoint): void {
    if (!this.pointers.has(id)) return;
    if (!valid(point)) { this.cancelPointer(id); return; }
    const shouldCommit = this.drawing && !this.suppressed && this.pointers.size === 1 && valid(point);
    this.pointers.delete(id);
    this.drawing = false;
    if (!this.pointers.size) this.suppressed = false;
    if (shouldCommit) this.callbacks.commit(screenToWorld(this.callbacks.camera(), point));
  }
  cancelPointer(id: number): void {
    if (!this.pointers.has(id)) return;
    this.cancelStroke(); this.pointers.delete(id); this.suppressed = this.pointers.size > 0;
  }
  /** Tool/menu/camera changes invalidate an unfinished drawing transaction. */
  interrupt(): void { this.cancelStroke(); this.suppressed = this.pointers.size > 0; }
  /** Blur/hidden/unmount drops stale browser pointer IDs without committing. */
  reset(): void { this.cancelStroke(); this.pointers.clear(); this.suppressed = false; }
  wheel(point: CameraPoint, deltaY: number): void {
    if (!valid(point) || !Number.isFinite(deltaY)) return;
    this.interrupt();
    this.callbacks.setCamera(zoomCameraAt(this.callbacks.camera(), Math.exp(-Math.max(-500, Math.min(500, deltaY)) * .002), point, this.callbacks.world(), this.callbacks.viewport()));
  }
  private cancelStroke(): void {
    if (this.drawing) this.callbacks.cancel();
    this.drawing = false;
  }
}
