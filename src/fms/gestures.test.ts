import { describe, expect, it } from 'vitest';
import { FmsGestures } from './gestures';
import { screenToWorld, type AtlasCamera } from '../world/camera';

function setup() {
  let camera: AtlasCamera = { x: 0, y: 0, scale: 1 };
  const events: string[] = [];
  const input = new FmsGestures({ camera: () => camera, setCamera: value => { camera = value; }, world: () => ({ width: 1000, height: 1000 }), viewport: () => ({ width: 1000, height: 1000 }),
    begin: p => events.push(`begin ${p.x}`), move: p => events.push(`move ${p.x}`), commit: p => events.push(`commit ${p.x}`), cancel: () => events.push('cancel') });
  return { input, events, camera: () => camera };
}
describe('V5 drawing and navigation ownership', () => {
  it('commits the final pointerup position, including a one-point stamp', () => {
    const s = setup(); s.input.down(1, { x: 10, y: 10 }, true); s.input.move(1, { x: 20, y: 10 }); s.input.up(1, { x: 30, y: 10 });
    expect(s.events).toEqual(['begin 10', 'move 20', 'commit 30']);
    s.input.down(2, { x: 40, y: 20 }, true); s.input.up(2, { x: 40, y: 20 });
    expect(s.events.slice(-2)).toEqual(['begin 40', 'commit 40']);
  });
  it('second finger cancels preview; pinch anchor stays fixed and remaining finger cannot draw', () => {
    const s = setup(); s.input.down(1, { x: 100, y: 100 }, true); s.input.down(2, { x: 200, y: 100 }, true);
    s.input.move(2, { x: 300, y: 100 });
    expect(screenToWorld(s.camera(), { x: 200, y: 100 })).toEqual({ x: 150, y: 100 });
    s.input.up(2, { x: 300, y: 100 }); s.input.move(1, { x: 150, y: 100 }); s.input.up(1, { x: 150, y: 100 });
    expect(s.events).toEqual(['begin 100', 'cancel']);
    s.input.down(3, { x: 150, y: 100 }, true); s.input.up(3, { x: 150, y: 100 });
    expect(s.events.at(-1)?.startsWith('commit')).toBe(true);
  });
  it('three-finger transitions and pointer cancellation never submit a half stroke', () => {
    const s = setup(); for (let id = 1; id <= 3; id++) s.input.down(id, { x: id * 100, y: 100 }, true);
    s.input.cancelPointer(2); s.input.up(3, { x: 300, y: 100 }); s.input.move(1, { x: 80, y: 80 }); s.input.up(1, { x: 80, y: 80 });
    expect(s.events).toEqual(['begin 100', 'cancel']);
  });
  it('tool/resize interruptions suppress drawing until lift; blur drops stale pointer IDs', () => {
    const s = setup(); s.input.down(1, { x: 10, y: 10 }, true); s.input.interrupt(); s.input.move(1, { x: 15, y: 15 }); s.input.up(1, { x: 15, y: 15 });
    s.input.down(2, { x: 30, y: 20 }, true); s.input.reset(); s.input.up(2, { x: 40, y: 20 });
    expect(s.events).toEqual(['begin 10', 'cancel', 'begin 30', 'cancel']);
  });
  it('browse and wheel navigate without producing edits, and invalid input is inert', () => {
    const s = setup(); s.input.down(1, { x: 10, y: 10 }, false); s.input.move(1, { x: 30, y: 40 }); s.input.up(1, { x: 30, y: 40 });
    expect(s.camera()).toEqual({ x: 20, y: 30, scale: 1 });
    const anchor = screenToWorld(s.camera(), { x: 150, y: 200 }); s.input.wheel({ x: 150, y: 200 }, -100);
    expect(screenToWorld(s.camera(), { x: 150, y: 200 }).x).toBeCloseTo(anchor.x);
    const before = { ...s.camera() }; s.input.wheel({ x: NaN, y: 0 }, 1); s.input.down(3, { x: Infinity, y: 0 }, true);
    expect(s.camera()).toEqual(before); expect(s.events).toEqual([]);
  });
  it('invalid release cancels a preview and leaves the next stroke usable', () => {
    const s = setup(); s.input.down(1, { x: 10, y: 10 }, true); s.input.up(1, { x: NaN, y: 10 });
    s.input.down(2, { x: 30, y: 30 }, true); s.input.up(2, { x: 30, y: 30 });
    expect(s.events).toEqual(['begin 10', 'cancel', 'begin 30', 'commit 30']);
  });
});
