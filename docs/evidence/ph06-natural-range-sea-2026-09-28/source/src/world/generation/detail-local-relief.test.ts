import { beforeAll, describe, expect, it } from 'vitest';
import { generateLocalDetailRelief, type DetailLocalReliefBase, type DetailLocalReliefInput, type DetailLocalReliefOutput } from './detail-local-relief';
import { createDetailShapeBaseSampler } from './detail-shape-height';
import { sampleDetailCoastNode } from '../detail-coast-field';
import { buildDetailCoastSurface, detailCellsIntersectingQuad, pickDetailCoastSurface, summarizeDetailCoast } from '../detail-coast-geometry';
import { detailCoastCellGeometrySignature, detailCoastCellHeightSignature } from '../detail-coast-locks';
import { detailCoastOwnerLayout, type DetailCoastKey, type DetailCoastTile, type DetailCoastField } from '../detail-coast-types';
import { encodeDetailCoastTile, decodeDetailCoastTile } from '../detail-coast-codec';
import { quadMeasure } from './quality';

const noWait = async () => {};
function fixture(size: 128 | 256 | 512 = 128): DetailLocalReliefInput {
  const step = 4096 / size, centers = new Int32Array(size * size * 2), heights = new Int32Array(size * size), quads = new Int32Array(size * size * 8);
  // Shared skew on the selection's west edge, plus a skew lock corner. Every
  // neighbour uses the same vertex; centers are actual polygon centroids.
  const vertex = (x: number, y: number) => ({ xQ: Math.round((x * step + (size === 128 && x === 32 && y === 37 ? 10 : size === 128 && x === 37 && y === 37 ? 6 : 0)) * 256), yQ: Math.round((y * step + (size === 128 && x === 37 && y === 37 ? -4 : 0)) * 256) });
  for (let id = 0; id < size * size; id++) {
    const x = id % size, y = Math.floor(id / size), points = [vertex(x, y), vertex(x + 1, y), vertex(x + 1, y + 1), vertex(x, y + 1)];
    const measure = quadMeasure(points.map(p => [p.xQ, p.yQ]));
    centers[id * 2] = measure.xQ; centers[id * 2 + 1] = measure.yQ;
    quads.set(points.flatMap(p => [p.xQ, p.yQ]), id * 8); heights[id] = 240 + x % 5 * 14 + y % 3 * 9;
  }
  const tiles = new Map<DetailCoastKey, DetailCoastTile>();
  for (let by = 14; by <= 24; by++) for (let bx = 14; bx <= 24; bx++) tiles.set(`coast:${bx}:${by}`, { format: 'lieguoji-detail-coast-tile', version: 1, bx, by, mode: 'land' });
  const sampler = createDetailShapeBaseSampler(size, centers.buffer, heights.buffer), layout = detailCoastOwnerLayout(16, 16);
  const coverageQ = new Int16Array(layout.count).fill(32767), elevationMeters = new Int16Array(layout.count);
  for (let slot = 0; slot < layout.count; slot++) {
    const x = layout.startX + slot % layout.width, y = layout.startY + Math.floor(slot / layout.width);
    elevationMeters[slot] = Math.round(sampler(x * 512, y * 512));
    if (x >= 519 && x <= 521 && y >= 519 && y <= 521) { coverageQ[slot] = -256; elevationMeters[slot] = -24; }
    else if (x === 518 && y === 520) { coverageQ[slot] = 0; elevationMeters[slot] = 0; }
    else if (x === 537 && y === 537) elevationMeters[slot] = 9000;
  }
  tiles.set('coast:16:16', { format: 'lieguoji-detail-coast-tile', version: 1, bx: 16, by: 16, mode: 'samples', coverageQ, elevationMeters });
  const base: DetailLocalReliefBase = { format: 'lieguoji-detail-local-relief-base', version: 1, size, centersQ: centers.buffer, elevationsMeters: heights.buffer,
    quadsQ: quads.buffer, detailCoast: tiles, locks: { cellIds: new Uint32Array(size === 128 ? [36 * size + 37, 37 * size + 37, 37 * size + 38] : []).buffer, flags: new Uint8Array(size === 128 ? [2, 3, 1] : []).buffer } };
  return { base, seed: 'local-ridge-real-fixture', reliefMeters: 2400, scope: { kind: 'cell-rectangle', column: size / 4, row: size / 4, columns: size / 128 * 10, rows: size / 128 * 10, transitionCells: size / 128 } };
}
const fieldBefore = (base: DetailLocalReliefBase): DetailCoastField => ({ tiles: base.detailCoast, sampleBaseElevation: createDetailShapeBaseSampler(base.size, base.centersQ, base.elevationsMeters) });
const fieldAfter = (input: DetailLocalReliefInput, output: DetailLocalReliefOutput): DetailCoastField => ({ ...fieldBefore(input.base), tiles: output.detailCoast });
const tileBytes = (tiles: ReadonlyMap<DetailCoastKey, DetailCoastTile>) => [...tiles].map(([key, tile]) => [key, [...encodeDetailCoastTile(tile)]]);
function quadPoints(input: DetailLocalReliefInput, id: number) { const values = new Int32Array(input.base.quadsQ); return [0, 2, 4, 6].map(offset => ({ xQ: values[id * 8 + offset], yQ: values[id * 8 + offset + 1] })); }
let source: DetailLocalReliefInput, result: DetailLocalReliefOutput, originalBytes: ReturnType<typeof tileBytes>;
beforeAll(async () => { source = fixture(); originalBytes = tileBytes(source.base.detailCoast); result = await generateLocalDetailRelief(source, { yieldControl: noWait, batchWork: 1024 }); }, 60000);

describe('v4 local fine relief with fixed coarse support and exact old coverage', () => {
  it('produces real persisted mountains and reports actual unique-node differences', () => {
    const before = fieldBefore(source.base), after = fieldAfter(source, result);
    let changed = 0, raised = 0, lowered = 0, minimum = 12000, maximum = -12000;
    for (const key of result.changedOwnerKeys) {
      const tile = result.detailCoast.get(key)!, layout = detailCoastOwnerLayout(tile.bx, tile.by);
      for (let slot = 0; slot < layout.count; slot++) {
        const x = layout.startX + slot % layout.width, y = layout.startY + Math.floor(slot / layout.width), a = sampleDetailCoastNode(before, x, y), b = sampleDetailCoastNode(after, x, y);
        expect(b.coverageQ).toBe(a.coverageQ);
        if (a.heightMeters !== b.heightMeters) { changed++; if (b.heightMeters > a.heightMeters) raised++; else lowered++; minimum = Math.min(minimum, b.heightMeters); maximum = Math.max(maximum, b.heightMeters); }
        if (a.coverageQ <= 0) expect(b.heightMeters).toBe(a.heightMeters);
      }
    }
    expect(changed).toBeGreaterThan(100); expect(raised).toBeGreaterThan(0); expect(lowered).toBeGreaterThan(0);
    // An old isolated true fine-node summit must be replaceable, not retained
    // through max(old,new) or included as the whole selection's lowland base.
    expect(sampleDetailCoastNode(before, 537, 537).heightMeters).toBe(9000);
    expect(sampleDetailCoastNode(after, 537, 537).heightMeters).toBeLessThan(5000);
    expect(result.summary).toMatchObject({ changedFineNodeCount: changed, raisedFineNodeCount: raised, loweredFineNodeCount: lowered, changedFineTileCount: result.changedOwnerKeys.length,
      changedCoarseSamples: 0, changedMinimumElevationMeters: minimum, changedMaximumElevationMeters: maximum, coverageSemantics: 'exact-existing-node-coverage' });
    expect(result.summary.generated.ridgeSegments).toBeGreaterThan(0);
    expect(result.summary.generated.ridgeGroups).toBeGreaterThan(0);
    expect(result.summary.auditedFineCells).toBe(result.affectedDisplayTiles.length * 1024);
  });

  it('owns complete input and materializes uniform land without changing noneditable slots', () => {
    expect(tileBytes(source.base.detailCoast)).toEqual(originalBytes);
    const original = fixture();
    for (const name of ['centersQ', 'elevationsMeters', 'quadsQ'] as const) expect(source.base[name]).toEqual(original.base[name]);
    expect(source.base.locks).toEqual(original.base.locks); expect(result.summary.materializedOwnerTiles).toBeGreaterThan(0);
    for (const [key, tile] of source.base.detailCoast) {
      const next = result.detailCoast.get(key)!; expect(next).not.toBe(tile);
      if (!result.changedOwnerKeys.includes(key)) expect(encodeDetailCoastTile(next)).toEqual(encodeDetailCoastTile(tile));
    }
    const before = fieldBefore(source.base), after = fieldAfter(source, result);
    // Same owning tile as interior changes, but these nodes are on/outside the
    // selected edge; materialization must copy old Hbase instead of flattening.
    for (const [x, y] of [[512, 540], [513, 540], [514, 540], [670, 660], [520, 520], [518, 520], [449, 600], [780, 780]]) expect(sampleDetailCoastNode(after, x, y)).toEqual(sampleDetailCoastNode(before, x, y));
  });

  it('preserves real skew-quad boundaries, not merely nominal rectangle or centers', () => {
    const before = fieldBefore(source.base), after = fieldAfter(source, result), id = 36 * 128 + 31;
    const covered = detailCellsIntersectingQuad(quadPoints(source, id));
    // An unselected left neighbour protrudes into the nominal selected x band.
    expect(quadPoints(source, id).some(p => p.xQ > 1024 * 256)).toBe(true);
    for (const cellId of covered) {
      const rect = { column: cellId % 2048, row: Math.floor(cellId / 2048), columns: 1, rows: 1 };
      expect(buildDetailCoastSurface(after, rect)).toEqual(buildDetailCoastSurface(before, rect));
    }
    expect(sampleDetailCoastNode(after, 515, 592)).toEqual(sampleDetailCoastNode(before, 515, 592));
  });

  it('honours the true incident fine cells of bits 2/3 and allows inland height under bit 1', () => {
    const before = fieldBefore(source.base), after = fieldAfter(source, result), ids = new Uint32Array(source.base.locks.cellIds), flags = new Uint8Array(source.base.locks.flags);
    let coastOnlyHeightChanges = 0;
    for (let i = 0; i < ids.length; i++) for (const cellId of detailCellsIntersectingQuad(quadPoints(source, ids[i]))) {
      const rect = { column: cellId % 2048, row: Math.floor(cellId / 2048), columns: 1, rows: 1 }, a = buildDetailCoastSurface(before, rect).cells[0], b = buildDetailCoastSurface(after, rect).cells[0];
      expect(detailCoastCellGeometrySignature(b)).toBe(detailCoastCellGeometrySignature(a));
      if (flags[i] & 2) expect(detailCoastCellHeightSignature(b)).toBe(detailCoastCellHeightSignature(a));
      else if (detailCoastCellHeightSignature(b) !== detailCoastCellHeightSignature(a)) coastOnlyHeightChanges++;
    }
    expect(coastOnlyHeightChanges).toBeGreaterThan(0);
  });

  it('keeps exact world area and actual sea pieces, including zero-tie shoreline', async () => {
    const measured = await summarizeDetailCoast(result.detailCoast, { yieldControl: noWait });
    expect(result.summary).toMatchObject({ landAreaTwiceQ2: measured.landAreaTwiceQ2, seaAreaTwiceQ2: measured.seaAreaTwiceQ2, totalAreaTwiceQ2: measured.totalAreaTwiceQ2 });
    const before = fieldBefore(source.base), after = fieldAfter(source, result), rect = { column: 514, row: 514, columns: 12, rows: 12 };
    const a = buildDetailCoastSurface(before, rect), b = buildDetailCoastSurface(after, rect);
    expect(a.cells.some(c => c.sea.length && c.land.length)).toBe(true);
    for (let i = 0; i < a.cells.length; i++) { expect(b.cells[i].sea).toEqual(a.cells[i].sea); expect(detailCoastCellGeometrySignature(b.cells[i])).toBe(detailCoastCellGeometrySignature(a.cells[i])); }
    expect(pickDetailCoastSurface(after, { x: 1036, y: 1040 })).toMatchObject({ land: true, height: 0 });
  }, 30000);

  it('survives actual fine codec restore with unchanged coarse/Hbase support', () => {
    const restored = new Map<DetailCoastKey, DetailCoastTile>([...result.detailCoast].map(([key, tile]) => [key, decodeDetailCoastTile(encodeDetailCoastTile(tile))]));
    const actual = fieldAfter(source, result), recovered = { ...fieldBefore(source.base), tiles: restored };
    for (const point of [{ x: 1201.25, y: 1260.75 }, { x: 1062.125, y: 1288.5 }, { x: 1036, y: 1040 }, { x: 1040, y: 1040 }, { x: 850, y: 1180 }]) expect(pickDetailCoastSurface(recovered, point)).toEqual(pickDetailCoastSurface(actual, point));
  });

  it('has deterministic output across batches and rejects post-takeover caller authority', async () => {
    const input = fixture(); let mutated = false;
    const repeat = await generateLocalDetailRelief(input, { yieldControl: noWait, batchWork: 64, onProgress: phase => {
      if (!mutated && phase === 'takeover-local-relief') {
        mutated = true; new Int32Array(input.base.centersQ).fill(0); new Int32Array(input.base.elevationsMeters).fill(12000); new Int32Array(input.base.quadsQ).fill(0);
        new Uint8Array(input.base.locks.flags).fill(0); (input.base.detailCoast as Map<DetailCoastKey, DetailCoastTile>).clear(); input.scope.column = 0; input.seed = 'changed';
      }
    } });
    expect(mutated).toBe(true); expect(tileBytes(repeat.detailCoast)).toEqual(tileBytes(result.detailCoast)); expect(repeat.summary).toEqual(result.summary);
  }, 60000);

  it('cancels actual partial mask/write/audit work without mutating the source', async () => {
    for (const stop of ['validate-local-quads', 'read-local-old-land-background', 'reduce-local-old-land-background', 'write-local-fine-height', 'audit-local-real-pieces']) {
      const input = fixture(), saved = tileBytes(input.base.detailCoast), coarse = input.base.elevationsMeters.slice(0), controller = new AbortController(); let reached = false;
      await expect(generateLocalDetailRelief(input, { yieldControl: noWait, batchWork: 128, signal: controller.signal, onProgress: phase => { if (phase === stop) { reached = true; controller.abort(); } } })).rejects.toMatchObject({ name: 'AbortError' });
      expect(reached).toBe(true); expect(tileBytes(input.base.detailCoast)).toEqual(saved); expect(input.base.elevationsMeters).toEqual(coarse);
    }
  }, 60000);

  it('rejects sea-only, too-small and fully elevation-locked selections with no pretend success', async () => {
    const sea = fixture(); sea.scope.column = 80; sea.scope.row = 80;
    await expect(generateLocalDetailRelief(sea, { yieldControl: noWait })).rejects.toThrow(/内陆|山脉|选区/);
    const small = fixture(); small.scope.columns = 3; small.scope.rows = 3;
    await expect(generateLocalDetailRelief(small, { yieldControl: noWait })).rejects.toThrow(/内陆|山脉|选区/);
    const locked = fixture(), ids: number[] = [];
    for (let row = 32; row < 42; row++) for (let col = 32; col < 42; col++) ids.push(row * 128 + col);
    locked.base.locks = { cellIds: new Uint32Array(ids).buffer, flags: new Uint8Array(ids.length).fill(2).buffer };
    await expect(generateLocalDetailRelief(locked, { yieldControl: noWait })).rejects.toThrow(/未锁定/);
  }, 60000);

  it('rejects zero transition, unknown inputs, accessors, malformed shared quads and unknown locks', async () => {
    const transition = fixture(); transition.scope.transitionCells = 0;
    await expect(generateLocalDetailRelief(transition)).rejects.toThrow(/过渡/);
    const unknown = { ...fixture(), ignored: true };
    await expect(generateLocalDetailRelief(unknown)).rejects.toThrow(/字段/);
    const getter = fixture(); let accessed = false;
    Object.defineProperty(getter, 'seed', { get() { accessed = true; return 'must-not-read'; }, enumerable: true });
    await expect(generateLocalDetailRelief(getter)).rejects.toThrow(/访问器/); expect(accessed).toBe(false);
    const locks = fixture(); new Uint8Array(locks.base.locks.flags)[0] = 4;
    await expect(generateLocalDetailRelief(locks)).rejects.toThrow(/锁/);
    const quads = fixture(); new Int32Array(quads.base.quadsQ)[8] += 1;
    await expect(generateLocalDetailRelief(quads, { yieldControl: noWait })).rejects.toThrow(/quad|共享/);
  }, 30000);
});
