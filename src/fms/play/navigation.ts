import type { Army, Point, World } from '../../sim/types';
import { cameraScaleBounds, centerCameraAt, worldToScreen, type AtlasCamera, type CameraSize } from '../../world/camera';

export function armyPosition(world: World, army: Army): Point {
  const origin = world.provinces.find(p => p.id === army.provinceId)!.center;
  const target = world.provinces.find(p => p.id === army.route[0])?.center ?? origin;
  return { x: origin.x + (target.x - origin.x) * army.progress, y: origin.y + (target.y - origin.y) * army.progress };
}
/** Shared by draw, focus and hit testing; the badge is 15 CSS pixels below its route. */
export function armyMarkerPoint(world: World, army: Army, scale: number, camera: AtlasCamera): Point {
  const p = armyPosition(world, army), screen = worldToScreen(camera, { x: p.x / scale, y: p.y / scale });
  return { x: screen.x, y: screen.y + 15 };
}
export function armiesAt(world: World, scale: number, camera: AtlasCamera, point: Point): string[] {
  return world.armies.filter(a => a.troops > 0 && a.status !== 'destroyed').map(a => {
    const p = armyMarkerPoint(world, a, scale, camera); return { id: a.id, distance: Math.hypot(p.x - point.x, p.y - point.y) };
  }).filter(a => a.distance <= 22).sort((a,b) => a.distance - b.distance).map(a => a.id);
}
/** Leave the top status, bottom controls and open sheet outside the focal area. */
export function focusAnchor(viewport: CameraSize, panel: boolean): Point {
  const right = viewport.width > 600 && panel ? Math.max(150, viewport.width - 380) : viewport.width - 24;
  const bottom = viewport.height - (viewport.width <= 600 && panel ? Math.min(viewport.height * .43, viewport.height - 300) + 165 : 155);
  return { x: (24 + right) / 2, y: (130 + Math.max(150, bottom)) / 2 };
}
export function focusMapPoint(camera: AtlasCamera, point: Point, world: CameraSize, viewport: CameraSize, panel = true): AtlasCamera {
  const bounds = cameraScaleBounds(world, viewport);
  return centerCameraAt({ ...camera, scale: Math.min(bounds.maxScale, Math.max(camera.scale, bounds.fitScale * 3)) }, point, focusAnchor(viewport, panel));
}
