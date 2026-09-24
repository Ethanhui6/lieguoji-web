import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cloneAtlasDocument, createGenerationDraft, type AtlasCellLockBlock, type AtlasGenerationDocument } from '../atlas-format';
import { encodeGenerationManifest } from '../generation-format';
import { encodeBlock, getCellLayerSlot, getVertexSlot, hashBlock, type BlockKey } from '../model';
import { hashAtlasCellLockBlock, LOCK_COAST, LOCK_ELEVATION, lockKey } from '../generation-locks';
import { cellNeighbors, cellVertexIds, edgeIdAt, edgeVertexIds, getVertexPositionQ, incidentCellIds, validateVertexPositionQ, vertexIdAt, vertexOwnerBlock } from '../topology';
import { generateCoast, validateCoastParameters, type CoastOutput, type CoastParameters } from './coast';
import { measureGeography, quadMeasure, quadQ } from './quality';
import type { GenerationScope } from '../generation-contract';

const parameters: CoastParameters = { strengthPermille: 1000, iterations: 4 };
const fast = { yieldTask: async () => undefined };
let base: AtlasGenerationDocument, manifestBytes: Uint8Array, blockBytes: Map<BlockKey, Uint8Array>;
const height = (data: Pick<AtlasGenerationDocument, 'manifest' | 'blocks'>, id: number) => { const slot = getCellLayerSlot(data, 'elevation', id); return slot.block.values[slot.slot]; };
const view = (data: AtlasGenerationDocument, result: CoastOutput) => ({ manifest: data.manifest, blocks: result.blocks });
async function rehash(data: AtlasGenerationDocument) { for (const ref of data.manifest.blockRefs) ref.hash = await hashBlock(data.blocks.get(ref.key)!); return data; }
async function withLand(isLand: (col: number, row: number) => boolean) {
  const data = cloneAtlasDocument(base);
  for (let id = 0; id < 128 * 128; id++) { const slot = getCellLayerSlot(data, 'elevation', id); slot.block.values[slot.slot] = isLand(id % 128, Math.floor(id / 128)) ? 350 : -100; }
  return rehash(data);
}
async function withLocks(data: AtlasGenerationDocument, ids: number[], flags: number) {
  const locks = new Map<string, AtlasCellLockBlock>();
  for (const id of ids) {
    const col = id % 128, row = Math.floor(id / 128), bx = Math.floor(col / 32), by = Math.floor(row / 32), key = lockKey(bx, by);
    let block = locks.get(key); if (!block) { block = { format: 'lieguoji-atlas-cell-locks', version: 1, bx, by, flags: new Uint8Array(1024) }; locks.set(key, block); }
    block.flags[row % 32 * 32 + col % 32] = flags;
  }
  data.locks = locks;
  for (const block of [...locks.values()].sort((a, b) => a.by - b.by || a.bx - b.bx)) data.manifest.constraints.lockRefs.push({ bx: block.bx, by: block.by, hash: await hashAtlasCellLockBlock(block) });
  return data;
}
function coastGraph(data: Pick<AtlasGenerationDocument, 'manifest' | 'blocks'>) {
  const spec = data.manifest.spec, edges: [number, number][] = [], adjacent = new Map<number, number[]>();
  function add(edge: number) {
    const [a, b] = edgeVertexIds(spec, edge); edges.push([a, b]);
    adjacent.set(a, [...adjacent.get(a) ?? [], b]); adjacent.set(b, [...adjacent.get(b) ?? [], a]);
  }
  for (let row = 0; row <= spec.rows; row++) for (let col = 0; col < spec.columns; col++) if (row > 0 && row < spec.rows && (height(data, (row - 1) * spec.columns + col) >= 0) !== (height(data, row * spec.columns + col) >= 0)) add(edgeIdAt(spec, 'horizontal', col, row));
  for (let row = 0; row < spec.rows; row++) for (let col = 0; col <= spec.columns; col++) if (col > 0 && col < spec.columns && (height(data, row * spec.columns + col - 1) >= 0) !== (height(data, row * spec.columns + col) >= 0)) add(edgeIdAt(spec, 'vertical', col, row));
  return { edges, adjacent };
}
function actualMetrics(data: Pick<AtlasGenerationDocument, 'manifest' | 'blocks'>) {
  const { edges, adjacent } = coastGraph(data); let length = 0, energy = 0;
  for (const [a, b] of edges) { const p = getVertexPositionQ(data, a), q = getVertexPositionQ(data, b); length += Math.hypot(p.xQ - q.xQ, p.yQ - q.yQ) / 256; }
  for (const [id, neighbors] of adjacent) if (neighbors.length === 2) {
    const p = getVertexPositionQ(data, id), a = getVertexPositionQ(data, neighbors[0]), b = getVertexPositionQ(data, neighbors[1]);
    energy += (a.xQ + b.xQ - 2 * p.xQ) ** 2 + (a.yQ + b.yQ - 2 * p.yQ) ** 2;
  }
  return { length, energy };
}
beforeAll(async () => {
  base = await createGenerationDraft({ size: 128, seed: 'coast-topology', name: '真实阶梯海岸' });
  for (const block of base.blocks.values()) if (block.layer === 'geometry') for (let slot = 0; slot < block.vertexIds.length; slot++) {
    const id = block.vertexIds[slot]; block.xyQ[slot * 2] = id % 129 * 8192; block.xyQ[slot * 2 + 1] = Math.floor(id / 129) * 8192;
  }
  for (let row = 24; row < 104; row++) for (let col = 20; col < Math.min(104, row + 12); col++) {
    const slot = getCellLayerSlot(base, 'elevation', row * 128 + col); slot.block.values[slot.slot] = 350;
  }
  await rehash(base); manifestBytes = encodeGenerationManifest(base.manifest); blockBytes = new Map([...base.blocks].map(([key, block]) => [key, encodeBlock(block)]));
});
afterEach(() => {
  expect(encodeGenerationManifest(base.manifest)).toEqual(manifestBytes);
  for (const [key, block] of base.blocks) expect(encodeBlock(block)).toEqual(blockBytes.get(key));
});

describe('bounded real shared-vertex coast smoothing', () => {
  it('reduces the actual staircase length and turning energy without changing density, heights, memberships or noncoastal vertices', async () => {
    const result = await generateCoast({ base, parameters }, fast), actual = view(base, result), spec = base.manifest.spec, graph = coastGraph(base);
    const before = actualMetrics(base), after = actualMetrics(actual), changedVertices: number[] = [], changedCells = new Set<number>();
    let landAreaQ2 = 0, worldAreaQ2 = 0, components = 0; const seen = new Set<number>();
    for (let id = 0; id < 129 * 129; id++) {
      const a = getVertexPositionQ(base, id), b = getVertexPositionQ(actual, id);
      validateVertexPositionQ(spec, id, b.xQ, b.yQ);
      if (a.xQ !== b.xQ || a.yQ !== b.yQ) {
        expect(graph.adjacent.get(id)).toHaveLength(2); changedVertices.push(id);
        for (const cell of incidentCellIds(spec, id)) changedCells.add(cell);
      } else if (!graph.adjacent.has(id)) expect(b).toEqual(a);
    }
    for (let id = 0; id < 128 * 128; id++) {
      expect(height(actual, id)).toBe(height(base, id));
      const area = quadMeasure(quadQ(actual, id)).areaQ2; worldAreaQ2 += area; if (height(actual, id) >= 0) landAreaQ2 += area;
      if (height(actual, id) >= 0 && !seen.has(id)) {
        components++; const queue = [id]; seen.add(id);
        for (let index = 0; index < queue.length; index++) for (const next of cellNeighbors(spec, queue[index])) if (height(actual, next) >= 0 && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    expect(changedVertices.length).toBeGreaterThan(130);
    expect(after.length).toBeLessThan(before.length * .99); expect(after.energy).toBeLessThan(before.energy * .3);
    expect(result.diagnostics.coastlineLengthBeforeWorld).toBeCloseTo(before.length, 8); expect(result.diagnostics.coastlineLengthAfterWorld).toBeCloseTo(after.length, 8);
    expect(result.diagnostics.turnEnergyBeforeQ2).toBe(before.energy); expect(result.diagnostics.turnEnergyAfterQ2).toBe(after.energy);
    expect(result.summary).toMatchObject({ changedVertexCount: changedVertices.length, changedCellCount: changedCells.size, coastlineEdges: graph.edges.length,
      landAreaQ2, worldAreaQ2, majorComponentCount: components, minElevationMeters: -100, maxElevationMeters: 350, iterationsApplied: 4 });
    expect(components).toBe(1);
    for (const [key, block] of base.blocks) {
      const next = result.blocks.get(key)!;
      if (result.changedKeys.includes(key)) { expect(block.layer).toBe('geometry'); expect(next).not.toBe(block); expect(encodeBlock(next)).not.toEqual(encodeBlock(block)); }
      else expect(next).toBe(block);
    }
    const seam = changedVertices.find(id => id % 129 % 32 === 0 && Math.floor(id / 129) % 32 !== 0)!;
    expect(seam).toBeDefined(); const owner = vertexOwnerBlock(spec, seam);
    expect(result.changedKeys).toContain(`geometry:${owner.bx}:${owner.by}`);
    // Cells on both sides of a block seam resolve the same actual owner slot.
    for (const cell of incidentCellIds(spec, seam)) {
      const ids = cellVertexIds(spec, cell), index = [ids[0], ids[1], ids[3], ids[2]].indexOf(seam), p = getVertexPositionQ(actual, seam);
      expect(quadQ(actual, cell)[index]).toEqual([p.xQ, p.yQ]);
    }
  });

  it('uses both strength and full previous-round iteration state to produce meaningful, bounded geometric changes', async () => {
    const low = await generateCoast({ base, parameters: { strengthPermille: 100, iterations: 1 } }, fast);
    const strong = await generateCoast({ base, parameters: { strengthPermille: 1000, iterations: 1 } }, fast);
    const repeated = await generateCoast({ base, parameters: { strengthPermille: 100, iterations: 4 } }, fast);
    expect(strong.diagnostics.turnEnergyAfterQ2).toBeLessThan(low.diagnostics.turnEnergyAfterQ2);
    expect(repeated.diagnostics.turnEnergyAfterQ2).toBeLessThan(low.diagnostics.turnEnergyAfterQ2);
    const id = vertexIdAt(base.manifest.spec, 64, 52), before = getVertexPositionQ(base, id), weak = getVertexPositionQ(view(base, low), id), full = getVertexPositionQ(view(base, strong), id);
    expect(Math.hypot(full.xQ - before.xQ, full.yQ - before.yQ)).toBeGreaterThan(Math.hypot(weak.xQ - before.xQ, weak.yQ - before.yQ));
    expect(Math.abs(full.xQ - before.xQ)).toBe(1024); expect(Math.abs(full.yQ - before.yQ)).toBe(1024);
    expect(strong.summary.rejectedCandidates).toBe(1); expect(strong.diagnostics.stepDivisors).toEqual([2]);
    expect(repeated.summary.iterationsApplied).toBe(4);
  });

  it('freezes a vertex if any incident sea cell has a coast lock, but exact height-only locks do not block safe geometry', async () => {
    const sea = 52 * 128 + 64, locked = await withLocks(cloneAtlasDocument(base), [sea], LOCK_COAST), original = cloneAtlasDocument(locked);
    expect(height(locked, sea)).toBeLessThan(0);
    const result = await generateCoast({ base: locked, parameters }, fast), vertices = cellVertexIds(base.manifest.spec, sea), graph = coastGraph(base);
    for (const id of vertices) expect(getVertexPositionQ(view(locked, result), id)).toEqual(getVertexPositionQ(locked, id));
    expect(result.summary.lockedVertices).toBe(vertices.filter(id => graph.adjacent.has(id)).length);
    expect(result.summary.changedVertexCount).toBeGreaterThan(100); expect(locked).toEqual(original);
    const heightLocked = await withLocks(cloneAtlasDocument(base), [sea], LOCK_ELEVATION), allowed = await generateCoast({ base: heightLocked, parameters }, fast);
    const id = vertexIdAt(base.manifest.spec, 64, 52);
    expect(getVertexPositionQ(view(heightLocked, allowed), id)).not.toEqual(getVertexPositionQ(heightLocked, id));
    for (const [key, block] of heightLocked.blocks) if (block.layer !== 'geometry') expect(allowed.blocks.get(key)).toBe(block);
  });

  it('keeps four-way coast ambiguities fixed and independently retains both diagonally touching land components', async () => {
    const data = await withLand((col, row) => col === 63 && row === 63 || col === 64 && row === 64), result = await generateCoast({ base: data, parameters }, fast);
    const shared = vertexIdAt(data.manifest.spec, 64, 64);
    expect(coastGraph(data).adjacent.get(shared)).toHaveLength(4);
    expect(getVertexPositionQ(view(data, result), shared)).toEqual(getVertexPositionQ(data, shared));
    expect(result.summary).toMatchObject({ ambiguousVertices: 1, majorComponentCount: 2, coastlineEdges: 8 });
    expect(result.summary.changedVertexCount).toBeGreaterThan(0);
  });

  it('keeps world-border endpoints fixed and honestly returns no change for straight coasts or maps without a coast', async () => {
    const straight = await withLand(col => col < 64), result = await generateCoast({ base: straight, parameters }, fast);
    expect(result.summary).toMatchObject({ changedVertexCount: 0, changedCellCount: 0, coastlineEdges: 128, endpointVertices: 2, boundaryVertices: 2, iterationsApplied: 0 });
    expect(result.changedKeys).toEqual([]);
    for (const [key, block] of straight.blocks) expect(result.blocks.get(key)).toBe(block);
    for (const row of [0, 128]) { const id = vertexIdAt(straight.manifest.spec, 64, row); expect(getVertexPositionQ(view(straight, result), id)).toEqual(getVertexPositionQ(straight, id)); }
    const sea = await withLand(() => false), empty = await generateCoast({ base: sea, parameters }, fast);
    expect(empty.summary).toMatchObject({ changedVertexCount: 0, coastlineEdges: 0, eligibleVertices: 0, iterationsApplied: 0, majorComponentCount: 0, landAreaQ2: 0 });
    expect(empty.diagnostics).toEqual({ coastlineLengthBeforeWorld: 0, coastlineLengthAfterWorld: 0, turnEnergyBeforeQ2: 0, turnEnergyAfterQ2: 0, stepDivisors: [] });
  });

  it('is independent of block insertion order, cooperative batch size and late caller parameter mutation', async () => {
    const expected = await generateCoast({ base, parameters }, { ...fast, batchCells: 8192 });
    const reordered = { ...base, blocks: new Map([...base.blocks].reverse()) }, raw = { ...parameters }; let mutated = false;
    const result = await generateCoast({ base: reordered, parameters: raw }, { ...fast, batchCells: 64, onProgress: () => { if (!mutated) { mutated = true; raw.strengthPermille = 100; raw.iterations = 1; } } });
    expect(mutated).toBe(true); expect(result.summary).toEqual(expected.summary); expect(result.diagnostics).toEqual(expected.diagnostics);
    expect(result.changedKeys).toEqual(expected.changedKeys);
    for (const [key, block] of expected.blocks) expect(encodeBlock(result.blocks.get(key)!)).toEqual(encodeBlock(block));
  });

  it('keeps every outside incident quad fixed and applies a real smooth weight to the coastal transition band', async () => {
    const scope: GenerationScope = { kind: 'cell-rectangle', column: 44, row: 32, columns: 48, rows: 48, transitionCells: 4 };
    const p = { strengthPermille: 500, iterations: 1 }, result = await generateCoast({ base, parameters: p, scope }, fast);
    const abrupt = await generateCoast({ base, parameters: p, scope: { ...scope, transitionCells: 0 } }, fast), actual = view(base, result);
    expect(result.summary.changedVertexCount).toBeGreaterThan(0); expect(result.summary.rejectedCandidates).toBe(0);
    const inside = (cell: number) => cell % 128 >= 44 && cell % 128 < 92 && Math.floor(cell / 128) >= 32 && Math.floor(cell / 128) < 80;
    for (let id = 0; id < 129 * 129; id++) if (incidentCellIds(base.manifest.spec, id).some(cell => !inside(cell))) expect(getVertexPositionQ(actual, id)).toEqual(getVertexPositionQ(base, id));
    for (let cell = 0; cell < 128 * 128; cell++) {
      if (!inside(cell)) expect(quadQ(actual, cell)).toEqual(quadQ(base, cell));
      expect(height(actual, cell)).toBe(height(base, cell));
    }
    const band = vertexIdAt(base.manifest.spec, 46, 34), core = vertexIdAt(base.manifest.spec, 64, 52);
    const distance = (data: ReturnType<typeof view>, id: number) => { const old = getVertexPositionQ(base, id), next = getVertexPositionQ(data, id); return Math.hypot(old.xQ - next.xQ, old.yQ - next.yQ); };
    expect(distance(actual, band)).toBeGreaterThan(0); expect(distance(actual, band)).toBeLessThan(distance(view(base, abrupt), band));
    expect(getVertexPositionQ(actual, core)).toEqual(getVertexPositionQ(view(base, abrupt), core));
    for (const [key, block] of base.blocks) {
      if (block.layer !== 'geometry' || block.bx === 3 || block.by === 3 || block.by === 0) { expect(result.blocks.get(key)).toBe(block); expect(encodeBlock(result.blocks.get(key)!)).toEqual(encodeBlock(block)); }
    }
    expect(result.diagnostics.turnEnergyAfterQ2).toBeLessThan(result.diagnostics.turnEnergyBeforeQ2);
  });

  it('combines local shared-vertex exclusion with sea-side locks, parameter snapshots and batch independence', async () => {
    const scope = { kind: 'cell-rectangle' as const, column: 44, row: 32, columns: 48, rows: 48, transitionCells: 4 }, lockedCell = 52 * 128 + 64;
    const data = await withLocks(cloneAtlasDocument(base), [lockedCell], LOCK_COAST), original = cloneAtlasDocument(data);
    const expected = await generateCoast({ base: data, parameters, scope }, { ...fast, batchCells: 4096 }); let mutated = false;
    const result = await generateCoast({ base: data, parameters, scope }, { ...fast, batchCells: 64, onProgress: () => { if (!mutated) { mutated = true; scope.column = 1; scope.transitionCells = 0; } } });
    expect(mutated).toBe(true); expect(result).toEqual(expected); expect(data).toEqual(original);
    for (const id of cellVertexIds(base.manifest.spec, lockedCell)) expect(getVertexPositionQ(view(data, result), id)).toEqual(getVertexPositionQ(data, id));
    expect(result.summary.changedVertexCount).toBeGreaterThan(0);
    const p = { strengthPermille: 500, iterations: 1 };
    expect(await generateCoast({ base, parameters: p, scope: { kind: 'world' } }, fast)).toEqual(await generateCoast({ base, parameters: p }, fast));
  });

  it('rejects malformed or out-of-map scopes rather than silently widening to the whole map', async () => {
    const rectangle = { kind: 'cell-rectangle', column: 44, row: 32, columns: 48, rows: 48, transitionCells: 4 };
    for (const scope of [null, { kind: 'world', extra: 1 }, { kind: 'province' }, { ...rectangle, column: -1 }, { ...rectangle, row: 100 },
      { ...rectangle, rows: 0 }, { ...rectangle, columns: 1, transitionCells: 1 }, { ...rectangle, transitionCells: 17 }, { ...rectangle, transitionCells: .5 }, { ...rectangle, extra: 1 }]) {
      const progress = vi.fn(); await expect(generateCoast({ base, parameters, scope: scope as GenerationScope }, { ...fast, onProgress: progress })).rejects.toThrow('范围'); expect(progress).not.toHaveBeenCalled();
    }
  });

  it('backtracks an actually degenerate proposal inside the quarter-cell bounds and keeps an extremely narrow valid source intact', async () => {
    const data = await withLand((col, row) => col === 50 && row === 50), spec = data.manifest.spec;
    for (const [col, row, dx, dy] of [[50, 50, 2048, -2048], [51, 50, -2048, 2047], [51, 51, 2048, -2048]]) {
      const slot = getVertexSlot(data, vertexIdAt(spec, col, row)); slot.block.xyQ[slot.slot * 2] += dx; slot.block.xyQ[slot.slot * 2 + 1] += dy;
    }
    await rehash(data); await withLocks(data, [49 * 128 + 49, 51 * 128 + 51], LOCK_COAST);
    const original = cloneAtlasDocument(data); await measureGeography(data, fast);
    const result = await generateCoast({ base: data, parameters: { strengthPermille: 1000, iterations: 1 } }, fast);
    expect(result.summary.rejectedCandidates).toBeGreaterThan(0); expect(result.diagnostics.stepDivisors[0]).toBeGreaterThan(1);
    const final = view(data, result); await measureGeography(final, fast);
    for (let id = 0; id < 129 * 129; id++) { const p = getVertexPositionQ(final, id); validateVertexPositionQ(spec, id, p.xQ, p.yQ); }
    expect(data).toEqual(original);
  });

  it.each(['海岸第1轮同步平滑', '核验海岸第1轮共享拓扑', '独立核验平滑后的真实几何与面积'])('cancels during %s without publishing private partial geometry', async stage => {
    const controller = new AbortController(), progress = vi.fn(value => { if (value.stage === stage) controller.abort(new DOMException('test cancellation', 'AbortError')); });
    await expect(generateCoast({ base, parameters }, { ...fast, batchCells: 64, signal: controller.signal, onProgress: progress })).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress.mock.calls.some(([value]) => value.stage === stage)).toBe(true);
  });

  it('rejects invalid parameters, unknown envelopes and pre-cancellation before doing work', async () => {
    for (const wrong of [{ strengthPermille: 99, iterations: 1 }, { strengthPermille: 1001, iterations: 1 }, { strengthPermille: 500.5, iterations: 1 },
      { strengthPermille: 500, iterations: 0 }, { strengthPermille: 500, iterations: 5 }, { ...parameters, seed: 'ineffective parameter' }]) {
      expect(validateCoastParameters(wrong)).toBe(false); await expect(generateCoast({ base, parameters: wrong }, fast)).rejects.toThrow('参数');
    }
    await expect(generateCoast({ base: { ...base, locks: new Map([['unknown', {} as AtlasCellLockBlock]]) }, parameters }, fast)).rejects.toThrow('草稿');
    const controller = new AbortController(); controller.abort(new DOMException('pre-cancel', 'AbortError')); const progress = vi.fn();
    await expect(generateCoast({ base, parameters }, { signal: controller.signal, onProgress: progress })).rejects.toMatchObject({ name: 'AbortError' }); expect(progress).not.toHaveBeenCalled();
  });
});
