import { beforeAll, describe, expect, it } from 'vitest';
import { cloneAtlasDocument, createGenerationDraft, type AtlasGenerationDocument } from './atlas-format';
import { getCellLayerSlot, getVertexSlot, type AtlasControl } from './model';
import { hashAtlasCellLockBlock, lockKey } from './generation-locks';
import { buildCoastalSurface } from './coastal-surface';
import { assertCoastalCellProtection, inspectCoastalGeneration } from './coastal-generation';

const fast = { yieldTask: async () => {} }, size = 128, center = 64 * size + 64;
let empty: AtlasGenerationDocument<3>;
beforeAll(async () => {
  empty = await createGenerationDraft({ size, seed: 'coastal-generation-analytic-square', name: '裁切海岸保护合成数据' }, fast, 3);
  // A real encoded-grid fixture with exact 32-world-unit squares permits an
  // independent analytic area oracle; production generated geometry is tested
  // separately by the session integration test.
  for (const block of empty.blocks.values()) if (block.layer === 'geometry') for (let slot = 0; slot < block.vertexIds.length; slot++) {
    const id = block.vertexIds[slot]; block.xyQ[slot * 2] = id % (size + 1) * 32 * 256; block.xyQ[slot * 2 + 1] = Math.floor(id / (size + 1)) * 32 * 256;
  }
});
function elevation(data: AtlasGenerationDocument, id: number, value: number) { const cell = getCellLayerSlot(data, 'elevation', id); cell.block.values[cell.slot] = value; }
async function protect(data: AtlasGenerationDocument, id: number, flags: number) {
  const x = id % size, y = Math.floor(id / size), bx = Math.floor(x / 32), by = Math.floor(y / 32), values = new Uint8Array(1024); values[y % 32 * 32 + x % 32] = flags;
  const block = { format: 'lieguoji-atlas-cell-locks' as const, version: 1 as const, bx, by, flags: values };
  data.locks.set(lockKey(bx, by), block); data.manifest.constraints.lockRefs = [{ bx, by, hash: await hashAtlasCellLockBlock(block) }];
}
function landPatch(data: AtlasGenerationDocument) {
  for (let y = 61; y < 68; y++) for (let x = 61; x < 68; x++) elevation(data, y * size + x, 500 + x * 9 + y * 7);
}

describe('v3 authoritative coastal generation summary and dependent protection', () => {
  it('uses clipped physical area, retaining the historic twice-Q8 summary units and exact total world area', async () => {
    const base = cloneAtlasDocument(empty), next = cloneAtlasDocument(base); elevation(next, center, 1200);
    const source = structuredClone(base), candidate = structuredClone(next), progress: number[] = [];
    const measured = await inspectCoastalGeneration(base, next, { kind: 'world' }, { ...fast, onProgress: p => progress.push(p.completed) });
    // One positive center, four -128 corners: each positive fan triangle has
    // side ratio 2/3 and area ratio 4/9. No neighboring center becomes land.
    expect(measured.landAreaQ2).toBe(2 * 32 ** 2 * 256 ** 2 * 4 / 9);
    expect(measured.worldAreaQ2).toBe(2 * 4096 ** 2 * 256 ** 2);
    expect(measured.checkedCells).toBe(size ** 2); expect(measured.comparedProtectedCells).toBe(0);
    expect(progress).toHaveLength(128); expect(progress.at(-1)).toBe(size ** 2);
    expect(base).toEqual(source); expect(next).toEqual(candidate);
  });

  it('rejects a diagonal sign change that moves a coastline-locked cell without changing its own sample or vertices', async () => {
    const base = cloneAtlasDocument(empty); elevation(base, center, 1200); await protect(base, center, 1);
    const next = cloneAtlasDocument(base); elevation(next, center + size + 1, 700);
    const before = structuredClone(base), after = structuredClone(next);
    await expect(inspectCoastalGeneration(base, next, { kind: 'world' }, fast)).rejects.toThrow('海岸锁');
    expect(base).toEqual(before); expect(next).toEqual(after);
  });

  it('allows stable coast geometry but rejects a neighbor amplitude change under an elevation lock', async () => {
    const base = cloneAtlasDocument(empty); landPatch(base); await protect(base, center, 1);
    const next = cloneAtlasDocument(base); elevation(next, center + 1, 5000);
    const coast = await inspectCoastalGeneration(base, next, { kind: 'world' }, fast);
    expect(coast.comparedProtectedCells).toBe(1);
    await protect(base, center, 2); await protect(next, center, 2);
    await expect(inspectCoastalGeneration(base, next, { kind: 'world' }, fast)).rejects.toThrow('高程锁');
  });

  it('rejects a local change that modifies an outside clipped shore even though all outside source values remain exact', async () => {
    const base = cloneAtlasDocument(empty); elevation(base, center, 1200);
    const next = cloneAtlasDocument(base); elevation(next, center + size + 1, 700);
    await expect(inspectCoastalGeneration(base, next, { kind: 'cell-rectangle', column: 65, row: 65, columns: 24, rows: 24, transitionCells: 8 }, fast)).rejects.toThrow(`选区外地块 #${center}`);
    expect(getCellLayerSlot(next, 'elevation', center).block.values[getCellLayerSlot(next, 'elevation', center).slot]).toBe(1200);
  });

  it('includes neighboring centroids when a non-incident vertex changes a locked piece height', async () => {
    const base = cloneAtlasDocument(empty); landPatch(base); await protect(base, center, 2);
    const next = cloneAtlasDocument(base), point = getVertexSlot(next, 64 * (size + 1) + 66);
    point.block.xyQ[point.slot * 2] += 256;
    // x=66 is not any corner of the protected x=64 quad. It changes an
    // incident neighbor's centroid and therefore the shared-corner weights.
    await expect(inspectCoastalGeneration(base, next, { kind: 'world' }, fast)).rejects.toThrow('高程锁');
  });

  it.each(['定位真实裁切海岸的变更依赖', '核验实际裁切海岸面积与保护边界'])('can cancel during %s without mutating either private document', async stage => {
    const base = cloneAtlasDocument(empty); await protect(base, center, 1);
    const next = cloneAtlasDocument(base); elevation(next, center - 1000, 500);
    const before = structuredClone(base), after = structuredClone(next), controller = new AbortController(); let observed = false;
    const control: AtlasControl = { ...fast, signal: controller.signal, onProgress: p => { if (p.stage === stage) { observed = true; controller.abort(); } } };
    await expect(inspectCoastalGeneration(base, next, { kind: 'world' }, control)).rejects.toThrow();
    expect(observed).toBe(true); expect(base).toEqual(before); expect(next).toEqual(after);
  });

  it('protects geometry and heights independently of non-physical anchor identities', () => {
    const base = cloneAtlasDocument(empty); elevation(base, center, 1200);
    const cell = buildCoastalSurface(base, [center]).cells[0], same = structuredClone(cell);
    for (const piece of [...same.land, ...same.sea]) for (const point of piece) point.anchor.id++;
    expect(() => assertCoastalCellProtection(cell, same, 3)).not.toThrow();
    same.land[0][0].heightMeters++;
    expect(() => assertCoastalCellProtection(cell, same, 1)).not.toThrow();
    expect(() => assertCoastalCellProtection(cell, same, 2)).toThrow('高程锁');
  });
});
