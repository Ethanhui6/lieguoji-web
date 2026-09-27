/** Camera positions, anchors and viewport dimensions are CSS pixels, never device pixels. */
export interface AtlasCamera { x: number; y: number; scale: number }
export interface CameraPoint { x: number; y: number }
export interface CameraSize { width: number; height: number }
export interface CameraWorldBounds { minX: number; minY: number; maxX: number; maxY: number }

function point(value: CameraPoint): void {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new RangeError('相机坐标必须是有限数。');
}
function size(value: CameraSize): void {
  if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width <= 0 || value.height <= 0) throw new RangeError('相机世界和视口尺寸必须是有限正数。');
}
function validCamera(value: AtlasCamera): void {
  point(value);
  if (!Number.isFinite(value.scale) || value.scale <= 0) throw new RangeError('相机比例必须是有限正数。');
}
function checkedCamera(value: AtlasCamera): AtlasCamera { validCamera(value); return value; }
function checkedPoint(value: CameraPoint): CameraPoint { point(value); return value; }

/** The original fit and zoom range; render resolution/DPR does not enter this calculation. */
export function cameraScaleBounds(world: CameraSize, viewport: CameraSize): { fitScale: number; minScale: number; maxScale: number } {
  size(world); size(viewport);
  const fitScale = Math.min(viewport.width / world.width, viewport.height / world.height) * .9;
  const minScale = fitScale * .5, maxScale = fitScale * 80;
  if (![fitScale, minScale, maxScale].every(value => Number.isFinite(value) && value > 0)) throw new RangeError('相机尺寸超出可表示的缩放范围。');
  return { fitScale, minScale, maxScale };
}

export function fitCamera(world: CameraSize, viewport: CameraSize): AtlasCamera {
  const { fitScale } = cameraScaleBounds(world, viewport);
  return checkedCamera({ x: (viewport.width - world.width * fitScale) / 2, y: (viewport.height - world.height * fitScale) / 2, scale: fitScale });
}

export function worldToScreen(camera: AtlasCamera, worldPoint: CameraPoint): CameraPoint {
  validCamera(camera); point(worldPoint);
  return checkedPoint({ x: worldPoint.x * camera.scale + camera.x, y: worldPoint.y * camera.scale + camera.y });
}

export function screenToWorld(camera: AtlasCamera, screenPoint: CameraPoint): CameraPoint {
  validCamera(camera); point(screenPoint);
  return checkedPoint({ x: (screenPoint.x - camera.x) / camera.scale, y: (screenPoint.y - camera.y) / camera.scale });
}

export function panCamera(camera: AtlasCamera, delta: CameraPoint): AtlasCamera {
  validCamera(camera); point(delta);
  return checkedCamera({ x: camera.x + delta.x, y: camera.y + delta.y, scale: camera.scale });
}

/** Positions a world point at a CSS-pixel anchor without modifying either input. */
export function centerCameraAt(camera: AtlasCamera, worldPoint: CameraPoint, screenAnchor: CameraPoint): AtlasCamera {
  validCamera(camera); point(worldPoint); point(screenAnchor);
  return checkedCamera({ x: screenAnchor.x - worldPoint.x * camera.scale, y: screenAnchor.y - worldPoint.y * camera.scale, scale: camera.scale });
}

export function zoomCameraAt(camera: AtlasCamera, factor: number, screenAnchor: CameraPoint, world: CameraSize, viewport: CameraSize): AtlasCamera {
  validCamera(camera); point(screenAnchor);
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError('相机缩放倍数必须是有限正数。');
  const { minScale, maxScale } = cameraScaleBounds(world, viewport);
  // Clamp the requested scale first. Reposition with the resulting scale, not the requested factor.
  const scale = Math.max(minScale, Math.min(maxScale, camera.scale * factor));
  return centerCameraAt({ ...camera, scale }, screenToWorld(camera, screenAnchor), screenAnchor);
}

/** Resize keeps the old world center even when the new viewport changes the permitted scale range. */
export function resizeCamera(camera: AtlasCamera, previousViewport: CameraSize, nextViewport: CameraSize, world: CameraSize): AtlasCamera {
  validCamera(camera); size(previousViewport);
  const center = screenToWorld(camera, { x: previousViewport.width / 2, y: previousViewport.height / 2 });
  const { minScale, maxScale } = cameraScaleBounds(world, nextViewport);
  return centerCameraAt({ ...camera, scale: Math.max(minScale, Math.min(maxScale, camera.scale)) }, center, { x: nextViewport.width / 2, y: nextViewport.height / 2 });
}

/** Unclipped visible world bounds, suitable for the authoritative spatial index. */
export function cameraWorldBounds(camera: AtlasCamera, viewport: CameraSize): CameraWorldBounds {
  size(viewport);
  const first = screenToWorld(camera, { x: 0, y: 0 }), last = screenToWorld(camera, { x: viewport.width, y: viewport.height });
  return { minX: first.x, minY: first.y, maxX: last.x, maxY: last.y };
}
