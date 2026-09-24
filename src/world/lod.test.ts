import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { fitCamera, panCamera, worldToScreen } from './camera';
import { atlasLodPolicy, collectAtlasLabelCandidates, layoutAtlasLabels, resolveAtlasLod, type AtlasLabelCandidate, type AtlasLabelRect, type AtlasLod } from './lod';
import { cloneAtlasDraft, createAtlasDraft, encodeBlock, encodeManifest, hashBlock, verifyAtlasDraft, type AtlasDraftData } from './model';
import { createSpatialIndex, type SpatialIndex } from './spatial-index';
import { getCellQuad } from './topology';

const viewport = { width: 1280, height: 800 }, noWait = { yieldTask: async () => {} };
let ocean: AtlasDraftData, land: AtlasDraftData, index: SpatialIndex;
function digest(data: AtlasDraftData) {
  const h = createHash('sha256').update(encodeManifest(data.manifest));
  for (const [key, block] of data.blocks) h.update(key).update(encodeBlock(block));
  return h.digest('hex');
}
beforeAll(async () => {
  ocean = await createAtlasDraft({ size: 128, seed: 'ph05-real-lod-cells', name: '地理标签核验' }, noWait);
  land = cloneAtlasDraft(ocean);
  for (const [key, block] of land.blocks) if (block.layer === 'elevation') {
    block.values.fill(350); if (block.bx === 0 && block.by === 0) block.values[0] = 0;
    land.manifest.blockRefs.find(ref => ref.key === key)!.hash = await hashBlock(block);
  }
  await verifyAtlasDraft(land, noWait); index = createSpatialIndex(land);
});

describe('production semantic detail policy', () => {
  it.each([[0, 'far'], [5.99, 'far'], [6, 'medium'], [23.99, 'medium'], [24, 'near'], [200, 'near']] as const)('initial %s CSS pixels selects %s', (pixels, expected) => {
    expect(resolveAtlasLod(pixels)).toBe(expected);
  });
  it('uses hysteresis in both directions and skips an intermediate tier for a large zoom', () => {
    expect(resolveAtlasLod(6.8, 'far')).toBe('far'); expect(resolveAtlasLod(7, 'far')).toBe('medium');
    expect(resolveAtlasLod(5, 'medium')).toBe('medium'); expect(resolveAtlasLod(4.99, 'medium')).toBe('far');
    expect(resolveAtlasLod(25.99, 'medium')).toBe('medium'); expect(resolveAtlasLod(26, 'medium')).toBe('near');
    expect(resolveAtlasLod(22, 'near')).toBe('near'); expect(resolveAtlasLod(21.99, 'near')).toBe('medium');
    expect(resolveAtlasLod(30, 'far')).toBe('near'); expect(resolveAtlasLod(4, 'near')).toBe('far');
  });
  it.each([['far', 1, 1], ['medium', 4, 8], ['near', 12, 32]] as const)('%s has narrow/wide limits that include selection', (lod, narrow, wide) => {
    expect(atlasLodPolicy(lod, 599)).toEqual({ gridVisible: lod === 'near', maxLabels: narrow });
    expect(atlasLodPolicy(lod, 600)).toEqual({ gridVisible: lod === 'near', maxLabels: wide });
  });
  it('rejects invalid display inputs rather than inventing a tier or label budget', () => {
    for (const invalid of [-1, NaN, Infinity]) expect(() => resolveAtlasLod(invalid)).toThrow();
    expect(() => resolveAtlasLod(8, 'future' as AtlasLod)).toThrow();
    expect(() => atlasLodPolicy('near', 0)).toThrow(); expect(() => atlasLodPolicy('future' as AtlasLod, 360)).toThrow();
  });
});

describe('bounded labels sourced from real production geometry', () => {
  it('keeps selected ID zero and zero-metre land, and only selected ocean gets a depth label', () => {
    const camera = fitCamera(land.manifest.spec, viewport);
    const zero = collectAtlasLabelCandidates({ data: land, camera, viewport, lod: 'far', selectedCellId: 0 });
    expect(zero).toMatchObject({ latticeStride: null, examinedCells: 1 });
    expect(zero.candidates).toHaveLength(1);
    expect(zero.candidates[0]).toMatchObject({ cellId: 0, elevationMeters: 0, selected: true, text: '地块 #0 · 高程 0 米' });
    const sea = collectAtlasLabelCandidates({ data: ocean, camera, viewport, lod: 'near', selectedCellId: 0 });
    expect(sea.candidates).toHaveLength(1);
    expect(sea.candidates[0]).toMatchObject({ cellId: 0, elevationMeters: -100, selected: true, text: '地块 #0 · 水深 100 米' });
  });
  it('counts rejected sea samples within the 256-cell work limit without scanning the ocean to fill labels', () => {
    const camera = fitCamera(ocean.manifest.spec, viewport);
    const result = collectAtlasLabelCandidates({ data: ocean, camera, viewport, lod: 'near', selectedCellId: null, spacingCss: 1 });
    expect(result.candidates).toEqual([]); expect(result.examinedCells).toBeGreaterThan(0); expect(result.examinedCells).toBeLessThanOrEqual(256);
    expect(result.examinedCells).toBeLessThan(ocean.manifest.spec.columns ** 2);
  });
  it('reserves one inspected cell for selection and never emits its ID twice', () => {
    const result = collectAtlasLabelCandidates({ data: land, camera: fitCamera(land.manifest.spec, viewport), viewport, lod: 'near', selectedCellId: 8256, spacingCss: 1 });
    expect(result.examinedCells).toBeLessThanOrEqual(256); expect(result.candidates.length).toBeLessThanOrEqual(256);
    expect(result.candidates.filter(candidate => candidate.cellId === 8256)).toHaveLength(1);
    expect(new Set(result.candidates.map(candidate => candidate.cellId)).size).toBe(result.candidates.length);
  });
  it('uses the actual area centroid, picks the same stable ID, and preserves the complete source bytes', () => {
    const before = digest(land), camera = fitCamera(land.manifest.spec, viewport);
    const result = collectAtlasLabelCandidates({ data: land, camera, viewport, lod: 'near', selectedCellId: 4127 });
    for (const candidate of result.candidates) {
      const quad = getCellQuad(land, candidate.cellId);
      // Independent polygon shoelace oracle, rather than nominal grid centres or mean vertices.
      let twiceArea = 0, x = 0, y = 0;
      for (let i = 0; i < quad.length; i++) {
        const a = quad[i], b = quad[(i + 1) % quad.length], cross = a.x * b.y - b.x * a.y;
        twiceArea += cross; x += (a.x + b.x) * cross; y += (a.y + b.y) * cross;
      }
      expect(candidate.world.x).toBeCloseTo(x / (3 * twiceArea), 8);
      expect(candidate.world.y).toBeCloseTo(y / (3 * twiceArea), 8);
      expect(index.pick(candidate.world).cellId).toBe(candidate.cellId);
      expect(candidate.screen).toEqual(worldToScreen(camera, candidate.world));
    }
    result.candidates[0].world.x = -999; result.candidates[0].elevationMeters = 999;
    expect(digest(land)).toBe(before);
  });
  it('anchors the lattice to the world through small pans and reduces sampling for larger reading spacing', () => {
    const camera = fitCamera(land.manifest.spec, viewport), common = { data: land, camera, viewport, lod: 'near' as const, selectedCellId: null };
    const a = collectAtlasLabelCandidates(common), b = collectAtlasLabelCandidates({ ...common, camera: panCamera(camera, { x: 1, y: 2 }) });
    expect(a.latticeStride).toBe(b.latticeStride); expect(a.candidates.map(c => c.cellId)).toEqual(b.candidates.map(c => c.cellId));
    for (let i = 0; i < a.candidates.length; i++) {
      expect(b.candidates[i].world).toEqual(a.candidates[i].world);
      expect(b.candidates[i].screen.x).toBeCloseTo(a.candidates[i].screen.x + 1, 10);
    }
    const large = collectAtlasLabelCandidates({ ...common, spacingCss: 224 });
    expect(large.latticeStride!).toBeGreaterThan(a.latticeStride!); expect(large.examinedCells).toBeLessThan(a.examinedCells);
    expect(collectAtlasLabelCandidates(common)).toEqual(a);
  });
  it('uses stable IDs only in near ordinary labels and never samples ordinary far labels', () => {
    const common = { data: land, camera: fitCamera(land.manifest.spec, viewport), viewport, selectedCellId: null };
    const medium = collectAtlasLabelCandidates({ ...common, lod: 'medium' }), near = collectAtlasLabelCandidates({ ...common, lod: 'near' });
    expect(medium.candidates.length).toBeGreaterThan(0); expect(near.candidates.length).toBeGreaterThan(0);
    expect(medium.candidates.every(c => c.text === `${c.elevationMeters} 米`)).toBe(true);
    expect(near.candidates.every(c => c.text === `#${c.cellId} · ${c.elevationMeters} 米`)).toBe(true);
    expect(collectAtlasLabelCandidates({ ...common, lod: 'far' })).toEqual({ candidates: [], latticeStride: null, examinedCells: 0 });
  });
  it('hides an offscreen selection without edge pinning, then restores its real anchor when it returns', () => {
    const camera = fitCamera(land.manifest.spec, viewport), common = { data: land, camera, viewport, lod: 'far' as const, selectedCellId: 0 };
    const original = collectAtlasLabelCandidates(common);
    expect(collectAtlasLabelCandidates({ ...common, camera: panCamera(camera, { x: -10000, y: 0 }) })).toMatchObject({ candidates: [], examinedCells: 1 });
    expect(collectAtlasLabelCandidates(common)).toEqual(original);
  });
  it('rejects malformed scope, dimensions, spacing and selected identities', () => {
    const base = { data: land, camera: fitCamera(land.manifest.spec, viewport), viewport, lod: 'near' as const, selectedCellId: null };
    for (const selectedCellId of [-1, .5, land.manifest.spec.columns ** 2, NaN]) expect(() => collectAtlasLabelCandidates({ ...base, selectedCellId })).toThrow();
    for (const spacingCss of [0, -1, Infinity]) expect(() => collectAtlasLabelCandidates({ ...base, spacingCss })).toThrow();
    expect(() => collectAtlasLabelCandidates({ ...base, viewport: { width: 0, height: 800 } })).toThrow();
  });
});

const label = (cellId: number, x: number, y: number, selected = false): AtlasLabelCandidate => ({ cellId, elevationMeters: 100, selected, world: { x: cellId, y: 0 }, screen: { x, y }, text: selected ? `地块 #${cellId} · 高程 100 米` : `#${cellId} · 100 米` });
function measurements(candidates: readonly AtlasLabelCandidate[], width = 80, height = 20) { return new Map(candidates.map(candidate => [candidate.cellId, { width, height }])); }
const overlap = (a: AtlasLabelRect, b: AtlasLabelRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe('pure placement from actual measured text boxes', () => {
  it('prioritizes selected ID zero and has deterministic ties independent of candidate order', () => {
    const candidates = [label(8, 650, 400), label(0, 10, 300, true), label(5, 630, 400)], measuredSizes = measurements(candidates, 70);
    const options = { candidates, measuredSizes, viewport, occlusionRects: [], maxLabels: 1 };
    const result = layoutAtlasLabels(options);
    expect(result.map(c => c.cellId)).toEqual([0]); expect(result[0].box.x).toBe(18);
    expect(layoutAtlasLabels({ ...options, candidates: [...candidates].reverse() })).toEqual(result);
  });
  it('uses larger measured boxes for collision and never overlaps another label', () => {
    const candidates = [label(1, 200, 100), label(2, 270, 100), label(3, 200, 150), label(4, 270, 150)];
    const base = { candidates, viewport: { width: 480, height: 240 }, occlusionRects: [], maxLabels: 32 };
    const small = layoutAtlasLabels({ ...base, measuredSizes: measurements(candidates, 60, 18) });
    const large = layoutAtlasLabels({ ...base, measuredSizes: measurements(candidates, 260, 70) });
    expect(small).toHaveLength(4); expect(large.length).toBeGreaterThan(0); expect(large.length).toBeLessThan(small.length);
    for (let i = 0; i < large.length; i++) for (let j = i + 1; j < large.length; j++) expect(overlap(large[i].box, large[j].box)).toBe(false);
  });
  it('hides covered anchors, places around nearby blockers and restores labels when the overlay closes', () => {
    const candidates = [label(0, 200, 100, true)], measuredSizes = measurements(candidates);
    const base = { candidates, measuredSizes, viewport, maxLabels: 1 };
    const visible = layoutAtlasLabels({ ...base, occlusionRects: [] });
    expect(layoutAtlasLabels({ ...base, occlusionRects: [{ x: 150, y: 50, width: 100, height: 100 }] })).toEqual([]);
    const alternate = layoutAtlasLabels({ ...base, occlusionRects: [{ x: 150, y: 60, width: 100, height: 30 }] });
    expect(alternate).toHaveLength(1); expect(alternate[0].box.y).toBe(108);
    expect(layoutAtlasLabels({ ...base, occlusionRects: [] })).toEqual(visible);
  });
  it('does not pin an offscreen or unplaceable label into an unrelated position', () => {
    const candidates = [label(0, -1, 50, true), label(1, 2, 2), label(2, 640, 400)];
    const measuredSizes = measurements(candidates); measuredSizes.set(2, { width: 1400, height: 20 });
    expect(layoutAtlasLabels({ candidates, measuredSizes, viewport, occlusionRects: [], maxLabels: 32 })).toEqual([]);
  });
  it('obeys the requested cap and viewport padding without mutating candidates or sharing output point objects', () => {
    const candidates = Array.from({ length: 40 }, (_, id) => label(id, 90 + id % 8 * 145, 80 + Math.floor(id / 8) * 135));
    const before = structuredClone(candidates), measuredSizes = measurements(candidates, 70);
    const options = { candidates: Object.freeze(candidates), measuredSizes, viewport, occlusionRects: [], maxLabels: 12 };
    const result = layoutAtlasLabels(options); expect(result).toHaveLength(12);
    for (const placed of result) {
      expect(placed.box.x).toBeGreaterThanOrEqual(8); expect(placed.box.y).toBeGreaterThanOrEqual(8);
      expect(placed.box.x + placed.box.width).toBeLessThanOrEqual(viewport.width - 8); expect(placed.box.y + placed.box.height).toBeLessThanOrEqual(viewport.height - 8);
    }
    result[0].world.x = -999; result[0].screen.x = -999; result[0].box.width = 999;
    expect(candidates).toEqual(before); expect(layoutAtlasLabels({ ...options, maxLabels: 0 })).toEqual([]);
  });
  it('rejects missing or invalid measurements, duplicate IDs, multiple selections and unbounded plans', () => {
    const candidates = [label(0, 100, 100, true)], measuredSizes = measurements(candidates), base = { candidates, measuredSizes, viewport, occlusionRects: [], maxLabels: 1 };
    expect(() => layoutAtlasLabels({ ...base, measuredSizes: new Map() })).toThrow(/真实文字尺寸/);
    expect(() => layoutAtlasLabels({ ...base, measuredSizes: new Map([[0, { width: NaN, height: 20 }]]) })).toThrow();
    expect(() => layoutAtlasLabels({ ...base, candidates: [...candidates, candidates[0]] })).toThrow();
    expect(() => layoutAtlasLabels({ ...base, candidates: [candidates[0], label(1, 200, 100, true)], measuredSizes: new Map([...measuredSizes, [1, { width: 80, height: 20 }]]) })).toThrow();
    expect(() => layoutAtlasLabels({ ...base, candidates: Array.from({ length: 257 }, (_, id) => label(id, 100, 100)) })).toThrow();
    expect(() => layoutAtlasLabels({ ...base, maxLabels: 33 })).toThrow();
    expect(() => layoutAtlasLabels({ ...base, occlusionRects: [{ x: 0, y: 0, width: -10, height: 20 }] })).toThrow();
    expect(() => layoutAtlasLabels({ ...base, gapCss: Infinity })).toThrow();
    expect(() => layoutAtlasLabels({ ...base, candidates: [{ ...candidates[0], selected: false, elevationMeters: -100 }] })).toThrow();
  });
});
