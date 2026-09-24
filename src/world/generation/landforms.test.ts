import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cloneAtlasDocument, createGenerationDraft, type AtlasCellLockBlock, type AtlasGenerationDocument } from '../atlas-format';
import { encodeGenerationManifest } from '../generation-format';
import { encodeBlock, getCellLayerSlot, hashBlock, type BlockKey } from '../model';
import { hashAtlasCellLockBlock, LOCK_COAST, LOCK_ELEVATION, lockKey } from '../generation-locks';
import { cellNeighbors, getCellQuad } from '../topology';
import { quadMeasure, quadQ } from './quality';
import { FIELD_Q, integerSqrt, roundRatio, smoothQ } from './seed';
import type { GenerationScope } from '../generation-contract';
import { generateLandforms, validateLandformParameters, type LandformOutput, type LandformParameters } from './landforms';

let base: AtlasGenerationDocument, manifestBytes: Uint8Array, blockBytes: Map<BlockKey, Uint8Array>;
const parameters: LandformParameters = { seed: 'landforms-two-islands', mountainRanges: 2, basins: 2, reliefMeters: 2400 };
const fast = { yieldTask: async () => undefined };
const height = (data: Pick<AtlasGenerationDocument, 'manifest' | 'blocks'>, id: number) => { const slot = getCellLayerSlot(data, 'elevation', id); return slot.block.values[slot.slot]; };
const view = (result: LandformOutput) => ({ manifest: base.manifest, blocks: result.blocks });
async function withLocks(ids: number[], flags: number) {
  const data = cloneAtlasDocument(base), locks = new Map<string, AtlasCellLockBlock>();
  for (const id of ids) {
    const col = id % 128, row = Math.floor(id / 128), bx = Math.floor(col / 32), by = Math.floor(row / 32), key = lockKey(bx, by);
    let block = locks.get(key); if (!block) { block = { format: 'lieguoji-atlas-cell-locks', version: 1, bx, by, flags: new Uint8Array(1024) }; locks.set(key, block); }
    block.flags[row % 32 * 32 + col % 32] = flags;
  }
  data.locks = locks;
  for (const block of [...locks.values()].sort((a, b) => a.by - b.by || a.bx - b.bx)) data.manifest.constraints.lockRefs.push({ bx: block.bx, by: block.by, hash: await hashAtlasCellLockBlock(block) });
  return data;
}
beforeAll(async () => {
  base = await createGenerationDraft({ size: 128, seed: 'landforms-real-shared-quads', name: '山系盆地测试双岛' });
  for (let row = 16; row < 112; row++) for (let col = 12; col < 116; col++) if (col < 60 || col >= 68) {
    const slot = getCellLayerSlot(base, 'elevation', row * 128 + col); slot.block.values[slot.slot] = 1500;
  }
  for (const ref of base.manifest.blockRefs) ref.hash = await hashBlock(base.blocks.get(ref.key)!);
  manifestBytes = encodeGenerationManifest(base.manifest); blockBytes = new Map([...base.blocks].map(([key, block]) => [key, encodeBlock(block)]));
});
afterEach(() => {
  expect(encodeGenerationManifest(base.manifest)).toEqual(manifestBytes);
  for (const [key, block] of base.blocks) expect(encodeBlock(block)).toEqual(blockBytes.get(key));
});

describe('deterministic actual mountain ranges and land basins', () => {
  it('forms nonlocal connected ridges and actual depressions while independently preserving both islands and all source identities', async () => {
    const result = await generateLandforms({ base, parameters }, fast), actual = view(result);
    let changed = 0, raised = 0, lowered = 0, landAreaQ2 = 0, worldAreaQ2 = 0;
    const seen = new Set<number>(); let components = 0;
    for (let id = 0; id < 128 * 128; id++) {
      const before = height(base, id), after = height(actual, id), area = quadMeasure(quadQ(actual, id)).areaQ2;
      expect(after >= 0).toBe(before >= 0); worldAreaQ2 += area;
      if (before < 0) expect(after).toBe(before); else landAreaQ2 += area;
      if (after !== before) { changed++; if (after > before) raised++; else lowered++; }
      if (after >= 0 && !seen.has(id)) {
        components++; const queue = [id]; seen.add(id);
        for (let index = 0; index < queue.length; index++) for (const next of cellNeighbors(base.manifest.spec, queue[index])) if (height(actual, next) >= 0 && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    expect(result.summary).toMatchObject({ mountainRanges: 2, basins: 2, requestedMountainRanges: 2, requestedBasins: 2,
      changedCellCount: changed, raisedCellCount: raised, loweredCellCount: lowered, landAreaQ2, worldAreaQ2, majorComponentCount: components });
    expect(components).toBe(2); expect(raised).toBeGreaterThan(200); expect(lowered).toBeGreaterThan(100); expect(changed).toBe(raised + lowered);
    for (const range of result.features.ranges) {
      expect(new Set(range.ridgeCellIds).size).toBeGreaterThan(8); expect(height(actual, range.anchorCellId)).toBeGreaterThan(1500);
      for (const [index, id] of range.ridgeCellIds.entries()) { expect(height(base, id)).toBe(1500); if (index) expect(cellNeighbors(base.manifest.spec, range.ridgeCellIds[index - 1])).toContain(id); }
      const points = range.ridgeCellIds.flatMap(id => getCellQuad(base, id));
      expect(Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y))).toBeGreaterThan(300);
    }
    for (const basin of result.features.basins) expect(height(actual, basin.centerCellId)).toBeLessThan(1500);
    for (const [key, block] of base.blocks) {
      const next = result.blocks.get(key)!;
      if (result.changedKeys.includes(key)) { expect(block.layer).toBe('elevation'); expect(next).not.toBe(block); expect(encodeBlock(next)).not.toEqual(encodeBlock(block)); }
      else expect(next).toBe(block);
    }
    expect(result.changedKeys).toEqual([...base.blocks].filter(([key, block]) => !Buffer.from(encodeBlock(result.blocks.get(key)!)).equals(Buffer.from(encodeBlock(block)))).map(([key]) => key));
  });

  it('has continuous multi-cell ridge flanks, a meaningful seed and monotonically stronger relief', async () => {
    const p = { ...parameters, mountainRanges: 1, basins: 0, reliefMeters: 600 }, low = await generateLandforms({ base, parameters: p }, fast);
    const high = await generateLandforms({ base, parameters: { ...p, reliefMeters: 2400 } }, fast);
    const different = await generateLandforms({ base, parameters: { ...p, seed: 'another-landform-shape' } }, fast);
    expect(high.features).toEqual(low.features); expect(different.features).not.toEqual(low.features);
    let slopeCells = 0, changedFlanks = 0, maximumStep = 0;
    const ridge = new Set(high.features.ranges[0].ridgeCellIds);
    for (let id = 0; id < 128 * 128; id++) if (height(base, id) >= 0) {
      expect(height(view(high), id)).toBeGreaterThanOrEqual(height(view(low), id));
      if (!ridge.has(id) && height(view(high), id) > 1500) changedFlanks++;
      for (const next of cellNeighbors(base.manifest.spec, id)) if (height(base, next) >= 0) {
        const difference = Math.abs(height(view(high), id) - height(view(high), next)); maximumStep = Math.max(maximumStep, difference); if (difference > 0 && difference < 400) slopeCells++;
      }
    }
    expect(changedFlanks).toBeGreaterThan(100); expect(slopeCells).toBeGreaterThan(100); expect(maximumStep).toBeLessThan(1200);
    expect(high.summary.maxElevationMeters).toBeGreaterThan(low.summary.maxElevationMeters);
  });

  it('keeps exact height locks, coast constraints and lock buffers while editing nearby available terrain', async () => {
    const ids = Array.from({ length: 128 * 128 }, (_, id) => id).filter(id => height(base, id) >= 0 && id % 3 === 0);
    const data = await withLocks(ids, LOCK_ELEVATION | LOCK_COAST), original = cloneAtlasDocument(data), result = await generateLandforms({ base: data, parameters }, fast);
    expect(result.summary.changedCellCount).toBeGreaterThan(100);
    for (const id of ids) expect(height({ manifest: data.manifest, blocks: result.blocks }, id)).toBe(height(data, id));
    expect(data).toEqual(original); expect(result.summary.majorComponentCount).toBe(2);
    for (const [key, block] of data.blocks) if (block.layer !== 'elevation') expect(result.blocks.get(key)).toBe(block);
  });

  it('permits relief changes under coast-only locks and rejects impossible all-height-locked requests without modifying input', async () => {
    const ids = Array.from({ length: 128 * 128 }, (_, id) => id).filter(id => height(base, id) >= 0), coast = await withLocks(ids, LOCK_COAST);
    const result = await generateLandforms({ base: coast, parameters }, fast); expect(result.summary.changedCellCount).toBeGreaterThan(100);
    for (const id of ids) expect(height({ manifest: coast.manifest, blocks: result.blocks }, id)).toBeGreaterThanOrEqual(0);
    const locked = await withLocks(ids, LOCK_ELEVATION), original = cloneAtlasDocument(locked);
    await expect(generateLandforms({ base: locked, parameters }, fast)).rejects.toThrow('可修改区域'); expect(locked).toEqual(original);
  });

  it('is independent of cooperative batch scheduling and snapshots parameters before its first yield', async () => {
    const raw = { ...parameters }, expected = await generateLandforms({ base, parameters }, { ...fast, batchCells: 4096 }); let changed = false;
    const result = await generateLandforms({ base, parameters: raw }, { ...fast, batchCells: 64, onProgress: () => { if (!changed) { changed = true; raw.seed = 'late mutation'; raw.reliefMeters = 6000; raw.mountainRanges = 8; } } });
    expect(changed).toBe(true); expect(result).toEqual(expected);
  });

  it('confines actual mountain paths and basin anchors to the inner core and preserves every outside value, untouched block and lock', async () => {
    const scope: GenerationScope = { kind: 'cell-rectangle', column: 20, row: 28, columns: 32, rows: 60, transitionCells: 4 };
    const locks = [38 * 128 + 28, 45 * 128 + 39, 60 * 128 + 40], data = await withLocks(locks, LOCK_ELEVATION | LOCK_COAST), saved = cloneAtlasDocument(data);
    const result = await generateLandforms({ base: data, parameters: { ...parameters, seed: 'scoped-ridge-and-basin', mountainRanges: 1, basins: 1 }, scope }, fast);
    const actual = { manifest: data.manifest, blocks: result.blocks };
    const core = (id: number) => id % 128 >= 24 && id % 128 < 48 && Math.floor(id / 128) >= 32 && Math.floor(id / 128) < 84;
    expect(result.summary).toMatchObject({ mountainRanges: 1, basins: 1, majorComponentCount: 2 });
    expect(result.summary.changedCellCount).toBeGreaterThan(20);
    for (const range of result.features.ranges) { expect(core(range.anchorCellId)).toBe(true); for (const id of range.ridgeCellIds) expect(core(id)).toBe(true); }
    for (const basin of result.features.basins) expect(core(basin.centerCellId)).toBe(true);
    for (let id = 0; id < 128 * 128; id++) {
      const col = id % 128, row = Math.floor(id / 128), distance = Math.min(col - 20, 51 - col, row - 28, 87 - row);
      if (distance <= 0 || locks.includes(id)) expect(height(actual, id)).toBe(height(data, id));
      expect(height(actual, id) >= 0).toBe(height(data, id) >= 0);
    }
    for (const [key, block] of data.blocks) {
      const intersects = block.bx * 32 < 52 && (block.bx + 1) * 32 > 20 && block.by * 32 < 88 && (block.by + 1) * 32 > 28;
      if (!intersects || block.layer !== 'elevation') { expect(result.blocks.get(key)).toBe(block); expect(encodeBlock(result.blocks.get(key)!)).toEqual(encodeBlock(block)); }
    }
    expect(data).toEqual(saved);
  });

  it('applies an actual smooth transition to a basin flank and rejects a core too small for a complete mountain range', async () => {
    const scope: GenerationScope = { kind: 'cell-rectangle', column: 31, row: 45, columns: 9, rows: 9, transitionCells: 4 };
    const result = await generateLandforms({ base, parameters: { ...parameters, mountainRanges: 0, basins: 1, reliefMeters: 900 }, scope }, fast);
    const basin = result.features.basins[0], center = 49 * 128 + 35, centerQ = quadMeasure(quadQ(base, center));
    expect(basin.centerCellId).toBe(center); expect(height(view(result), center)).toBe(600);
    let tapered = 0;
    for (const id of cellNeighbors(base.manifest.spec, center)) {
      const point = quadMeasure(quadQ(base, id)), distance = integerSqrt((point.xQ - centerQ.xQ) ** 2 + (point.yQ - centerQ.yQ) ** 2);
      const rawDepression = roundRatio(900 * smoothQ(FIELD_Q - Math.floor(distance * FIELD_Q / (basin.radiusWorld * 256))), FIELD_Q);
      const actualDepression = height(base, id) - height(view(result), id);
      if (rawDepression > 0) { expect(actualDepression).toBeGreaterThan(0); expect(actualDepression).toBeLessThan(rawDepression); tapered++; }
    }
    expect(tapered).toBeGreaterThanOrEqual(2);
    for (let row = 45; row < 54; row++) for (let col = 31; col < 40; col++) if (row === 45 || row === 53 || col === 31 || col === 39) expect(height(view(result), row * 128 + col)).toBe(1500);
    await expect(generateLandforms({ base, parameters: { ...parameters, mountainRanges: 1, basins: 0 }, scope }, fast)).rejects.toThrow('可修改区域');
  });

  it('keeps explicit world behavior unchanged and snapshots local scope independently of batch scheduling', async () => {
    const p = { ...parameters, mountainRanges: 0, basins: 1 }, implicit = await generateLandforms({ base, parameters: p }, fast);
    expect(await generateLandforms({ base, parameters: p, scope: { kind: 'world' } }, fast)).toEqual(implicit);
    const scope = { kind: 'cell-rectangle' as const, column: 24, row: 40, columns: 25, rows: 25, transitionCells: 4 };
    const expected = await generateLandforms({ base, parameters: p, scope }, { ...fast, batchCells: 4096 }); let mutated = false;
    const actual = await generateLandforms({ base, parameters: p, scope }, { ...fast, batchCells: 64, onProgress: () => { if (!mutated) { mutated = true; scope.column = 90; scope.transitionCells = 0; } } });
    expect(mutated).toBe(true); expect(actual).toEqual(expected);
  });

  it('rejects unknown, malformed, excessive-transition and out-of-map scopes before yielding', async () => {
    const rectangle = { kind: 'cell-rectangle', column: 20, row: 20, columns: 32, rows: 32, transitionCells: 4 };
    const invalid = [null, { kind: 'province' }, { kind: 'world', extra: true }, { ...rectangle, column: -1 }, { ...rectangle, row: 2.5 },
      { ...rectangle, columns: 0 }, { ...rectangle, columns: 129 }, { ...rectangle, column: 120 }, { ...rectangle, row: 120 },
      { ...rectangle, transitionCells: -1 }, { ...rectangle, transitionCells: 16 }, { ...rectangle, transitionCells: 17 }, { ...rectangle, extra: 1 }];
    for (const scope of invalid) {
      const progress = vi.fn(); await expect(generateLandforms({ base, parameters, scope: scope as GenerationScope }, { ...fast, onProgress: progress })).rejects.toThrow('范围'); expect(progress).not.toHaveBeenCalled();
    }
  });

  it.each(['沿山脊生成连续高程', '写入实际改变的私有地貌块'])('cancels during %s with no published candidate or baseline mutation', async stage => {
    const controller = new AbortController(), progress = vi.fn(value => { if (value.stage === stage) controller.abort(new DOMException('test cancellation', 'AbortError')); });
    await expect(generateLandforms({ base, parameters }, { ...fast, batchCells: 64, signal: controller.signal, onProgress: progress })).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress.mock.calls.some(([value]) => value.stage === stage)).toBe(true);
  });

  it('rejects malformed or unsupported parameters and pre-cancellation before any work', async () => {
    for (const wrong of [{ ...parameters, mountainRanges: 0, basins: 0 }, { ...parameters, mountainRanges: 9 }, { ...parameters, basins: 8, mountainRanges: 8 },
      { ...parameters, reliefMeters: 199 }, { ...parameters, reliefMeters: 6001 }, { ...parameters, reliefMeters: 500.5 }, { ...parameters, seed: ' ' }, { ...parameters, extra: true }]) {
      expect(validateLandformParameters(wrong)).toBe(false); await expect(generateLandforms({ base, parameters: wrong }, fast)).rejects.toThrow('参数');
    }
    const controller = new AbortController(); controller.abort(new DOMException('before work', 'AbortError')); const progress = vi.fn();
    await expect(generateLandforms({ base, parameters }, { signal: controller.signal, onProgress: progress })).rejects.toMatchObject({ name: 'AbortError' }); expect(progress).not.toHaveBeenCalled();
  });
});
