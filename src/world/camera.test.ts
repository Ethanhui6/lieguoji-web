import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cameraScaleBounds, cameraWorldBounds, centerCameraAt, fitCamera, panCamera, resizeCamera, screenToWorld, worldToScreen, zoomCameraAt, type AtlasCamera } from './camera';
import { createAtlasDraft, encodeBlock, encodeManifest } from './model';
import { createSpatialIndex } from './spatial-index';
import { cellIdAt, getCellQuad } from './topology';

const world = { width: 4096, height: 4096 }, desktop = { width: 1280, height: 800 };
const closePoint = (actual: { x: number; y: number }, expected: { x: number; y: number }) => { expect(actual.x).toBeCloseTo(expected.x, 9); expect(actual.y).toBeCloseTo(expected.y, 9); };

describe('production camera in CSS pixels', () => {
  it('uses the supplied rectangular world size and centers a fitted world with 10% limiting-axis space', () => {
    const camera = fitCamera({ width: 8000, height: 2000 }, desktop);
    closePoint(camera, { x: 64, y: 256 }); expect(camera.scale).toBeCloseTo(.144, 12);
    closePoint(worldToScreen(camera, { x: 4000, y: 1000 }), { x: 640, y: 400 });
    expect(cameraScaleBounds(world, desktop)).toEqual({ fitScale: .17578125, minScale: .087890625, maxScale: 14.0625 });
  });

  it('applies and inverts a known translated non-unit scale without rounding world coordinates', () => {
    const camera = { x: -90, y: 50, scale: .25 }, worldPoint = { x: 1234.125, y: 2333.75 };
    const screen = worldToScreen(camera, worldPoint);
    expect(screen).toEqual({ x: 218.53125, y: 633.4375 });
    expect(screenToWorld(camera, screen)).toEqual(worldPoint);
    expect(screenToWorld(camera, { x: -100, y: 0 })).toEqual({ x: -40, y: -200 });
  });

  it.each([1e6, 1e-9])('keeps a non-central zoom anchor fixed when factor %s exceeds the scale limits', factor => {
    const camera = fitCamera(world, desktop), anchor = { x: 183.75, y: 610.25 }, before = screenToWorld(camera, anchor);
    const next = zoomCameraAt(camera, factor, anchor, world, desktop), bounds = cameraScaleBounds(world, desktop);
    expect(next.scale).toBe(factor > 1 ? bounds.maxScale : bounds.minScale);
    closePoint(screenToWorld(next, anchor), before);
    closePoint(worldToScreen(next, before), anchor);
  });

  it('at either scale limit, repeated outward zoom preserves the camera instead of drifting the anchor', () => {
    const anchor = { x: 57, y: 703 };
    for (const factor of [1e6, 1e-9]) {
      const limit = zoomCameraAt(fitCamera(world, desktop), factor, anchor, world, desktop);
      const repeated = zoomCameraAt(limit, factor, anchor, world, desktop);
      expect(repeated.scale).toBe(limit.scale); closePoint(repeated, limit);
    }
  });

  it('combines a real two-pointer midpoint translation and scale change without moving the world anchor', () => {
    const camera = panCamera(fitCamera(world, desktop), { x: 27, y: -11 });
    const oldMidpoint = { x: 300, y: 200 }, newMidpoint = { x: 325, y: 185 }, worldAnchor = screenToWorld(camera, oldMidpoint);
    const next = panCamera(zoomCameraAt(camera, 1.75, oldMidpoint, world, desktop), { x: newMidpoint.x - oldMidpoint.x, y: newMidpoint.y - oldMidpoint.y });
    closePoint(worldToScreen(next, worldAnchor), newMidpoint);
    closePoint(screenToWorld(next, newMidpoint), worldAnchor);
  });

  it('preserves the world center and current scale across desktop-to-portrait resize when within the new limits', () => {
    const initial = panCamera(zoomCameraAt(fitCamera(world, desktop), 4, { x: 430, y: 260 }, world, desktop), { x: 180, y: -30 });
    const nextSize = { width: 360, height: 760 }, center = screenToWorld(initial, { x: 640, y: 400 });
    const next = resizeCamera(initial, desktop, nextSize, world);
    expect(next.scale).toBe(initial.scale);
    closePoint(screenToWorld(next, { x: 180, y: 380 }), center);
    const back = resizeCamera(next, nextSize, desktop, world); closePoint(back, initial); expect(back.scale).toBe(initial.scale);
  });

  it('clamps resize scale at both new limits while retaining the old world center', () => {
    const tiny = { width: 120, height: 80 }, wide = { width: 2000, height: 1600 };
    for (const [oldSize, newSize, factor, bound] of [[wide, tiny, 1e6, 'maxScale'], [tiny, wide, 1e-9, 'minScale']] as const) {
      const old = zoomCameraAt(fitCamera(world, oldSize), factor, { x: 50, y: 60 }, world, oldSize);
      const center = screenToWorld(old, { x: oldSize.width / 2, y: oldSize.height / 2 });
      const next = resizeCamera(old, oldSize, newSize, world);
      expect(next.scale).toBe(cameraScaleBounds(world, newSize)[bound]);
      closePoint(screenToWorld(next, { x: newSize.width / 2, y: newSize.height / 2 }), center);
    }
  });

  it('centers an arbitrary world focus and returns unclipped visible bounds for the spatial index', () => {
    const camera = centerCameraAt({ x: 10, y: 20, scale: 2 }, { x: 100, y: 200 }, { x: 128, y: 80 });
    expect(camera).toEqual({ x: -72, y: -320, scale: 2 });
    expect(cameraWorldBounds(camera, { width: 256, height: 160 })).toEqual({ minX: 36, minY: 160, maxX: 164, maxY: 240 });
    expect(cameraWorldBounds({ x: 50, y: 50, scale: 1 }, desktop).minX).toBe(-50);
  });

  it('never changes an input state, point, world or viewport while returning independent values', () => {
    const camera = Object.freeze(fitCamera(world, desktop)), anchor = Object.freeze({ x: 200, y: 400 }), delta = Object.freeze({ x: 40, y: -10 });
    const before = { ...camera };
    for (const result of [panCamera(camera, delta), zoomCameraAt(camera, 2, anchor, Object.freeze(world), Object.freeze(desktop)), resizeCamera(camera, desktop, desktop, world), centerCameraAt(camera, anchor, anchor)]) {
      expect(result).not.toBe(camera); result.x = 999; expect(camera).toEqual(before);
    }
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])('rejects invalid scale, factor and dimensions: %s', invalid => {
    const camera = fitCamera(world, desktop), anchor = { x: 10, y: 20 };
    expect(() => worldToScreen({ ...camera, scale: invalid }, anchor)).toThrow();
    expect(() => screenToWorld({ ...camera, scale: invalid }, anchor)).toThrow();
    expect(() => zoomCameraAt(camera, invalid, anchor, world, desktop)).toThrow();
    expect(() => fitCamera({ ...world, width: invalid }, desktop)).toThrow();
    expect(() => resizeCamera(camera, desktop, { ...desktop, height: invalid }, world)).toThrow();
    expect(() => cameraWorldBounds(camera, { width: invalid, height: 100 })).toThrow();
  });

  it('rejects non-finite coordinates, malformed runtime values and arithmetic outside the finite number range', () => {
    const camera = fitCamera(world, desktop), p = { x: 0, y: 0 };
    expect(() => panCamera(camera, { x: NaN, y: 0 })).toThrow();
    expect(() => centerCameraAt(camera, p, { x: 0, y: Infinity })).toThrow();
    expect(() => screenToWorld(null as unknown as AtlasCamera, p)).toThrow();
    expect(() => worldToScreen({ x: 0, y: 0, scale: 2 }, { x: Number.MAX_VALUE, y: 0 })).toThrow();
    expect(() => screenToWorld({ x: -Number.MAX_VALUE, y: 0, scale: 1 }, { x: Number.MAX_VALUE, y: 0 })).toThrow();
    expect(() => panCamera({ x: Number.MAX_VALUE, y: 0, scale: 1 }, { x: Number.MAX_VALUE, y: 0 })).toThrow();
    expect(() => cameraScaleBounds({ width: Number.MIN_VALUE, height: Number.MIN_VALUE }, desktop)).toThrow();
  });

  it('picks the same authoritative jittered cell through zoom, pan and viewport resize without changing world bytes', async () => {
    const data = await createAtlasDraft({ size: 128, name: '相机真实几何', seed: 'ph05-camera-pick' }, { yieldTask: async () => {} });
    const digest = () => { const h = createHash('sha256').update(encodeManifest(data.manifest)); for (const block of data.blocks.values()) h.update(encodeBlock(block)); return h.digest('hex'); };
    const before = digest(), index = createSpatialIndex(data), target = cellIdAt(data.manifest.spec, 31, 32), quad = getCellQuad(data, target);
    const worldPoint = { x: quad.reduce((sum, p) => sum + p.x, 0) / 4, y: quad.reduce((sum, p) => sum + p.y, 0) / 4 };
    expect(index.pick(worldPoint).cellId).toBe(target);
    let previousSize = desktop, camera = fitCamera(data.manifest.spec, previousSize);
    for (const viewport of [desktop, { width: 1024, height: 768 }, { width: 360, height: 760 }]) {
      camera = resizeCamera(camera, previousSize, viewport, data.manifest.spec); previousSize = viewport;
      const anchor = { x: viewport.width * .42, y: viewport.height * .35 };
      camera = centerCameraAt(zoomCameraAt(camera, 2.3, anchor, data.manifest.spec, viewport), worldPoint, anchor);
      camera = panCamera(camera, { x: 10.25, y: -7.5 });
      const screen = worldToScreen(camera, worldPoint);
      for (const dpr of [1, 2, 3]) {
        // Pointer coordinates arrive in CSS pixels. Only render backing pixels differ with DPR.
        const backing = { x: screen.x * dpr, y: screen.y * dpr };
        const picked = index.pick(screenToWorld(camera, { x: backing.x / dpr, y: backing.y / dpr }));
        expect(picked.cellId).toBe(target);
      }
      expect(index.queryCells(cameraWorldBounds(camera, viewport)).cellIds).toContain(target);
    }
    expect(digest()).toBe(before);
  });
});
