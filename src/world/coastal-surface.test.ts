import { beforeAll, describe, expect, it } from 'vitest';
import { createAtlasDraft, encodeBlock, getCellLayerSlot, getVertexSlot, type AtlasDraftData, type AtlasGeographyView, type BlockKey } from './model';
import { buildCoastalSurface, COASTAL_COORDINATE_SCALE, getCoastalCellSurface, isCoastalSurface, pickCoastalSurface, type CoastalTriangle } from './coastal-surface';
import { buildTerrainSurface } from './terrain-surface';

let base: AtlasDraftData;
const size = 128, step = 32, idAt = (x: number, y: number) => y * size + x;
beforeAll(async () => {
  base = await createAtlasDraft({ size, name: '权威细海岸', seed: 'coastal-contract' }, { yieldTask: async () => {} });
  for (const block of base.blocks.values()) if (block.layer === 'geometry') for (let slot = 0; slot < block.vertexIds.length; slot++) {
    const id = block.vertexIds[slot]; block.xyQ[slot * 2] = id % (size + 1) * step * 256; block.xyQ[slot * 2 + 1] = Math.floor(id / (size + 1)) * step * 256;
  }
});
function fixture(height: (x: number, y: number) => number = () => -1000): AtlasGeographyView {
  const data = structuredClone(base);
  for (const block of data.blocks.values()) if (block.layer === 'elevation') for (let slot = 0; slot < 1024; slot++) block.values[slot] = height(block.bx * 32 + slot % 32, block.by * 32 + Math.floor(slot / 32));
  return { manifest: { ...data.manifest, version: 3, surface: { kind: 'land-mask-fan-v1', coordinateScale: 256 } }, blocks: data.blocks } as unknown as AtlasGeographyView;
}
function geometry(triangles: CoastalTriangle[]) { return triangles.map(triangle => triangle.map(vertex => [vertex.xQ6, vertex.yQ6])); }
function snapshot(data: AtlasGeographyView) { return { manifest: JSON.stringify(data.manifest), blocks: [...data.blocks].map(([key, block]) => [key, [...encodeBlock(block)]]) }; }

describe('versioned authoritative land-mask fan surface', () => {
  it('does not silently opt old documents into the new land definition', () => {
    expect(isCoastalSurface(base)).toBe(false);
    expect(() => buildCoastalSurface(base, [0])).toThrow('第三版');
    const v2 = { ...base, manifest: { ...base.manifest, version: 2 } } as unknown as AtlasGeographyView;
    expect(isCoastalSurface(v2)).toBe(false);
    expect(() => buildCoastalSurface(v2, [0])).toThrow('第三版');
    const valid = fixture(); expect(isCoastalSurface(valid)).toBe(true);
    expect(() => buildCoastalSurface(valid, [0, 0])).toThrow('不重复');
  });

  it('exactly partitions every source triangle for all 512 neighborhood sign patterns', () => {
    const data = fixture(), target = idAt(32, 32), ids = Array.from({ length: 9 }, (_, i) => idAt(31 + i % 3, 31 + Math.floor(i / 3)));
    for (let mask = 0; mask < 512; mask++) {
      ids.forEach((id, bit) => { const slot = getCellLayerSlot(data, 'elevation', id); slot.block.values[slot.slot] = mask & (1 << bit) ? 650 : -4200; });
      const cell = getCoastalCellSurface(data, target);
      expect(cell.landAreaTwiceQ6 + cell.seaAreaTwiceQ6).toBe(cell.totalAreaTwiceQ6);
      expect(cell.totalAreaTwiceQ6).toBe(2 * (step * COASTAL_COORDINATE_SCALE) ** 2);
      expect(cell.land.length + cell.sea.length).toBeLessThanOrEqual(12); expect(cell.shore.length).toBeLessThanOrEqual(4);
      for (const triangle of [...cell.land, ...cell.sea]) for (const vertex of triangle) expect(Number.isSafeInteger(vertex.xQ6) && Number.isSafeInteger(vertex.yQ6)).toBe(true);
    }
  });

  it('cuts a real sea portion into a land-center cell, and point picking follows those same pieces', () => {
    const data = fixture(), target = idAt(32, 32), slot = getCellLayerSlot(data, 'elevation', target); slot.block.values[slot.slot] = 650;
    const cell = getCoastalCellSurface(data, target), x = 32 * step, y = 32 * step;
    expect(cell.landAreaQ2).toBeGreaterThan(0); expect(cell.landAreaQ2).toBeLessThan(cell.totalAreaQ2);
    expect(cell.sea.length).toBeGreaterThan(0); expect(cell.shore).toHaveLength(4);
    expect(pickCoastalSurface(data, target, { x: x + 16, y: y + 16 })).toEqual({ cellId: target, land: true, height: 650 });
    const sea = pickCoastalSurface(data, target, { x: x + 1, y: y + 1 }); expect(sea?.land).toBe(false); expect(sea!.height).toBeLessThan(0);
    const shore = cell.shore[0];
    expect(pickCoastalSurface(data, target, { x: (shore.a.xQ6 + shore.b.xQ6) / (2 * COASTAL_COORDINATE_SCALE), y: (shore.a.yQ6 + shore.b.yQ6) / (2 * COASTAL_COORDINATE_SCALE) })).toEqual({ cellId: target, land: true, height: 0 });
    expect(pickCoastalSurface(data, target, { x: x - 1, y: y - 1 })).toBeNull();
  });

  it('keeps the coastline byte-exact when only mountains or bathymetry change', () => {
    const data = fixture((x, y) => x < y ? 400 : -3000), ids = [idAt(31, 31), idAt(32, 31), idAt(31, 32), idAt(32, 32)], before = buildCoastalSurface(data, ids);
    for (const block of data.blocks.values()) if (block.layer === 'elevation') for (let i = 0; i < block.values.length; i++) block.values[i] = block.values[i] >= 0 ? 5900 : -11500;
    const after = buildCoastalSurface(data, ids);
    before.cells.forEach((cell, i) => { expect(geometry(after.cells[i].land)).toEqual(geometry(cell.land)); expect(geometry(after.cells[i].sea)).toEqual(geometry(cell.sea)); expect(after.cells[i].landAreaTwiceQ6).toBe(cell.landAreaTwiceQ6); });
    expect(after.cells.flatMap(cell => cell.land).some(triangle => triangle.some(vertex => vertex.heightMeters === 5900))).toBe(true);
  });

  it('shares exact cut endpoints across block boundaries, request order, and independent core builds', () => {
    const data = fixture((x, y) => x + y < 64 ? 850 : -1300), ids = [idAt(31, 31), idAt(32, 31), idAt(31, 32), idAt(32, 32)];
    const together = buildCoastalSurface(data, ids), reversed = buildCoastalSurface(data, [...ids].reverse());
    for (const cell of together.cells) { expect(getCoastalCellSurface(data, cell.cellId)).toEqual(cell); expect(reversed.cells.find(value => value.cellId === cell.cellId)).toEqual(cell); }
    const edgeX = 1024 * COASTAL_COORDINATE_SCALE;
    const endpoints = (id: number) => [...getCoastalCellSurface(data, id).land, ...getCoastalCellSurface(data, id).sea].flatMap(triangle => triangle).filter(p => p.xQ6 === edgeX).map(p => `${p.xQ6}:${p.yQ6}:${p.heightMeters}`);
    const a = new Set(endpoints(ids[0])), b = new Set(endpoints(ids[1])); expect(a).toEqual(b);
  });

  it('does not create world-frame shores or false internal lines in flat zero-elevation land', () => {
    const data = fixture(() => 0), cells = buildCoastalSurface(data, [0, 1, size, size + 1]);
    for (const cell of cells.cells) { expect(cell.sea).toHaveLength(0); expect(cell.shore).toHaveLength(0); expect(cell.land).toHaveLength(4); }
    expect(pickCoastalSurface(data, 0, { x: 0, y: 0 })?.land).toBe(true);
    expect(cells.landAreaQ2).toBe(4 * step ** 2 * 256 ** 2);
  });

  it('owns a zero shared edge once for rendering while either adjacent cell picks its boundary as land', () => {
    const data = fixture(x => x < 32 ? 700 : -2200), left = idAt(31, 31), right = idAt(32, 31), result = buildCoastalSurface(data, [left, right]);
    expect(result.cells[0].shore).toHaveLength(1); expect(result.cells[1].shore).toHaveLength(1);
    expect(result.cells.flatMap(cell => cell.shore.filter(edge => edge.ownerCellId === cell.cellId))).toHaveLength(1);
    for (const id of [left, right]) expect(pickCoastalSurface(data, id, { x: 1024, y: 1005 })).toEqual({ cellId: id, land: true, height: 0 });
  });

  it('uses the land tie rule at exact checkerboard junctions without inventing positive-area connections', () => {
    const data = fixture((x, y) => (x + y) % 2 ? -1000 : 500), target = idAt(31, 32), cell = getCoastalCellSurface(data, target);
    expect(cell.landAreaTwiceQ6).toBe(0); expect(cell.land).toHaveLength(0);
    expect(pickCoastalSurface(data, target, { x: 1024, y: 1024 })).toEqual({ cellId: target, land: true, height: 0 });
    expect(pickCoastalSurface(data, target, { x: 1023.99, y: 1024.01 })?.land).toBe(false);
  });

  it('conserves actual moved quad area and retains true center altitude after Q8 centroid rounding', () => {
    const data = fixture((x, y) => x < y ? 600 : -1500), target = idAt(31, 31), slot = getVertexSlot(data, 32 * (size + 1) + 32);
    slot.block.xyQ[slot.slot * 2] += 7 * 256 + 1; slot.block.xyQ[slot.slot * 2 + 1] -= 3 * 256 + 1;
    const cell = getCoastalCellSurface(data, target);
    expect(cell.landAreaTwiceQ6 + cell.seaAreaTwiceQ6).toBe(cell.totalAreaTwiceQ6);
    expect(cell.totalAreaQ2).not.toBe(step ** 2 * 256 ** 2);
    const center = [...cell.land, ...cell.sea].flatMap(triangle => triangle).find(vertex => vertex.anchor.kind === 'center')!;
    expect(pickCoastalSurface(data, target, { x: center.xQ6 / COASTAL_COORDINATE_SCALE, y: center.yQ6 / COASTAL_COORDINATE_SCALE })?.height).toBe(-1500);
  });

  it('renders the exact clipped vertices and zero-height coast used by area and point picking', () => {
    const data = fixture((x, y) => x < y ? 420 : -3000), ids = [idAt(31, 31), idAt(31, 32)], rendered = buildTerrainSurface(data, ids), authority = buildCoastalSurface(data, ids);
    expect(rendered.coastal).toEqual(authority);
    for (const [domain, mesh] of [['land', rendered.land], ['sea', rendered.sea]] as const) {
      const vertices = authority.cells.flatMap(cell => cell[domain]).flatMap(triangle => triangle);
      expect([...mesh.positions]).toEqual(vertices.flatMap(vertex => [Math.fround(vertex.xQ6 / COASTAL_COORDINATE_SCALE), Math.fround(vertex.yQ6 / COASTAL_COORDINATE_SCALE)]));
      expect([...mesh.heights]).toEqual(vertices.map(vertex => Math.fround(vertex.heightMeters)));
      expect(vertices.filter(vertex => vertex.coverageQ === 0).every(vertex => vertex.heightMeters === 0)).toBe(true);
    }
  });

  it('reads only the requested neighborhood and never modifies source arrays or scans memberships', () => {
    const data = fixture(), before = snapshot(data), touched = new Set<BlockKey>();
    const blocks = new Proxy(data.blocks, { get(target, property) {
      if (property === 'get') return (key: BlockKey) => { touched.add(key); const [layer, bx, by] = key.split(':'); if (!['geometry', 'elevation'].includes(layer) || Number(bx) > 1 || Number(by) > 1) throw new Error(`Unexpected read ${key}`); return target.get(key); };
      throw new Error(`No world scan ${String(property)}`);
    } });
    const result = buildCoastalSurface({ manifest: data.manifest, blocks }, [idAt(31, 31)]);
    result.cells[0].sea[0][0].heightMeters = 999; expect(snapshot(data)).toEqual(before); expect(touched.size).toBeLessThanOrEqual(8);
    expect(buildCoastalSurface({ manifest: data.manifest, blocks }, []).cells).toEqual([]);
  });
});
