import { beforeAll, describe, expect, it } from 'vitest';
import { buildTerrainSurface, type TerrainSurfaceMesh } from './terrain-surface';
import { createAtlasDraft, encodeBlock, getCellLayerSlot, getVertexSlot, type AtlasDraftData, type AtlasGeographyView, type BlockKey } from './model';
import { getCellQuad } from './topology';

let base: AtlasDraftData;
const size = 128, step = 32, idAt = (x: number, y: number) => y * size + x;
beforeAll(async () => {
  base = await createAtlasDraft({ size, name: '连续表面只读测试', seed: 'surface-actual-quads' }, { yieldTask: async () => {} });
  // Test-only regular physical geometry makes independently known planes and
  // trapezoids possible. Production rendering never rewrites this geometry.
  for (const block of base.blocks.values()) if (block.layer === 'geometry') for (let index = 0; index < block.vertexIds.length; index++) {
    const id = block.vertexIds[index]; block.xyQ[index * 2] = id % (size + 1) * step * 256; block.xyQ[index * 2 + 1] = Math.floor(id / (size + 1)) * step * 256;
  }
});
function fixture(height: (column: number, row: number) => number = () => 700) {
  const data = structuredClone(base);
  for (const block of data.blocks.values()) if (block.layer === 'elevation') for (let slot = 0; slot < 1024; slot++) block.values[slot] = height(block.bx * 32 + slot % 32, block.by * 32 + Math.floor(slot / 32));
  return data;
}
function setHeight(data: AtlasDraftData, id: number, height: number) { const { block, slot } = getCellLayerSlot(data, 'elevation', id); block.values[slot] = height; }
function point(mesh: TerrainSurfaceMesh, x: number, y: number) {
  const indices: number[] = [];
  for (let index = 0; index < mesh.heights.length; index++) if (mesh.positions[index * 2] === x && mesh.positions[index * 2 + 1] === y) indices.push(index);
  expect(indices, `Unique physical sample ${x},${y}`).toHaveLength(1);
  const index = indices[0]; return { index, height: mesh.heights[index], light: mesh.lights[index] };
}
function byteSnapshot(data: AtlasDraftData) { return { manifest: JSON.stringify(data.manifest), blocks: [...data.blocks].map(([key, block]) => [key, [...encodeBlock(block)]]) }; }
function triangleArea(mesh: TerrainSurfaceMesh) {
  let area = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i], b = mesh.indices[i + 1], c = mesh.indices[i + 2];
    const cross = (mesh.positions[b * 2] - mesh.positions[a * 2]) * (mesh.positions[c * 2 + 1] - mesh.positions[a * 2 + 1]) - (mesh.positions[b * 2 + 1] - mesh.positions[a * 2 + 1]) * (mesh.positions[c * 2] - mesh.positions[a * 2]);
    expect(cross).toBeGreaterThan(0); area += cross / 2;
  }
  return area;
}
// An independent two-triangle area calculation, rather than the production
// polygon centroid formula, is used for the non-regular sample oracle.
function measuredCenter(data: AtlasDraftData, cell: number) {
  const p = getCellQuad(data, cell), triangles = [[p[0], p[1], p[2]], [p[0], p[2], p[3]]]; let area = 0, x = 0, y = 0;
  for (const [a, b, c] of triangles) { const weight = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2; area += weight; x += (a.x + b.x + c.x) / 3 * weight; y += (a.y + b.y + c.y) / 3 * weight; }
  return { x: x / area, y: y / area, area };
}

describe('read-only continuous terrain surface', () => {
  it('uses four real triangles per cell and shares same-class edge endpoints', () => {
    const data = fixture(), { land, sea } = buildTerrainSurface(data, [idAt(31, 31), idAt(32, 31)]);
    expect(land.heights.length).toBe(8); expect(land.indices.length).toBe(24); expect(sea.indices.length).toBe(0);
    expect([...land.heights].every(height => height === 700)).toBe(true); expect([...land.lights].every(light => light === 1)).toBe(true);
    const top = point(land, 1024, 992), bottom = point(land, 1024, 1024);
    expect([...land.indices].filter(index => index === top.index).length).toBe(4); expect([...land.indices].filter(index => index === bottom.index).length).toBe(4);
    expect(triangleArea(land)).toBe(2 * step * step);
  });

  it('reconstructs an affine regular-grid gradient while retaining exact authoritative center heights', () => {
    const data = fixture((x, y) => 100 + 10 * x + 20 * y), cells = [idAt(31, 31), idAt(32, 31), idAt(31, 32), idAt(32, 32)];
    const mesh = buildTerrainSurface(data, cells).land;
    expect(point(mesh, 1024, 1024).height).toBe(1045);
    for (const cell of cells) {
      const x = cell % size, y = Math.floor(cell / size);
      expect(point(mesh, (x + .5) * step, (y + .5) * step).height).toBe(100 + 10 * x + 20 * y);
    }
    expect(new Set(mesh.lights).size).toBe(1); expect(mesh.lights[0]).toBeGreaterThan(1); expect(mesh.lights[0]).toBeLessThan(1.13);
    // Both endpoints are identical, so interpolation along the entire common
    // edge is identical, rather than merely looking close at one zoom level.
    const left = buildTerrainSurface(data, [cells[0]]).land, right = buildTerrainSurface(data, [cells[1]]).land;
    const a = point(left, 1024, 992), b = point(left, 1024, 1024), c = point(right, 1024, 992), d = point(right, 1024, 1024);
    for (const t of [0, .125, .5, .875, 1]) { expect(a.height * (1 - t) + b.height * t).toBe(c.height * (1 - t) + d.height * t); expect(a.light * (1 - t) + b.light * t).toBe(c.light * (1 - t) + d.light * t); }
  });

  it('never blends sea height or sea slope into the land side of the same coast', () => {
    const data = fixture((x, y) => x < 32 ? -1000 - y * 50 : 300 + y * 10), cells = [idAt(31, 31), idAt(32, 31)];
    const first = buildTerrainSurface(data, cells), landCoast = point(first.land, 1024, 1024), seaCoast = point(first.sea, 1024, 1024);
    expect(landCoast.height).toBe(615); expect(seaCoast.height).toBe(-2575); expect([...first.land.heights].every(height => height >= 0)).toBe(true); expect([...first.sea.heights].every(height => height < 0)).toBe(true);
    for (let y = 0; y < size; y++) for (let x = 0; x < 32; x++) setHeight(data, idAt(x, y), -12000 + y);
    const changedSea = buildTerrainSurface(data, cells); expect(changedSea.land).toEqual(first.land); expect(changedSea.sea.heights).not.toEqual(first.sea.heights);
    expect(triangleArea(first.land) + triangleArea(first.sea)).toBe(2 * step * step);
  });

  it('uses all same-class incident samples at a diagonal junction without connecting their polygons', () => {
    const data = fixture(() => -1000), a = idAt(31, 31), b = idAt(32, 32); setHeight(data, a, 100); setHeight(data, b, 900);
    const result = buildTerrainSurface(data, [a, idAt(32, 31), idAt(31, 32), b]);
    expect(point(result.land, 1024, 1024).height).toBe(500); expect(point(result.sea, 1024, 1024).height).toBe(-1000);
    expect(result.land.indices.length).toBe(24); expect(result.sea.indices.length).toBe(24); expect(triangleArea(result.land)).toBe(2048); expect(triangleArea(result.sea)).toBe(2048);
  });

  it('places the original sample at the actual trapezoid area centroid, not the four-corner average', () => {
    const data = fixture(), cell = idAt(20, 20), vertex = getVertexSlot(data, 21 * (size + 1) + 21); vertex.block.xyQ[vertex.slot * 2] -= 4 * 256;
    setHeight(data, cell, 1777); const mesh = buildTerrainSurface(data, [cell]).land;
    expect(mesh.positions[0]).toBe(Math.fround(640 + 15.022222222222222)); expect(mesh.positions[1]).toBe(Math.fround(640 + 15.644444444444444)); expect(mesh.heights[0]).toBe(1777);
    expect(mesh.positions[0]).not.toBe(655); expect(mesh.positions[1]).not.toBe(656); expect(triangleArea(mesh)).toBeCloseTo(960, 3);
  });

  it('weights edited Q8 shared corners by distances to actual neighboring area centroids', () => {
    const data = fixture(), incident = [idAt(20, 20), idAt(21, 20), idAt(20, 21), idAt(21, 21)];
    incident.forEach((id, i) => setHeight(data, id, [100, 1000, 2000, 4000][i]));
    const slot = getVertexSlot(data, 21 * (size + 1) + 21); slot.block.xyQ[slot.slot * 2] += 7 * 256 + 1; slot.block.xyQ[slot.slot * 2 + 1] -= 3 * 256 + 1;
    const x = slot.block.xyQ[slot.slot * 2] / 256, y = slot.block.xyQ[slot.slot * 2 + 1] / 256;
    const actual = point(buildTerrainSurface(data, [incident[0]]).land, x, y); let totalWeight = 0, numerator = 0;
    incident.forEach((id, i) => { const center = measuredCenter(data, id), weight = 1 / Math.hypot(center.x - x, center.y - y); totalWeight += weight; numerator += [100, 1000, 2000, 4000][i] * weight; });
    expect(actual.height).toBeCloseTo(numerator / totalWeight, 3); expect(Math.abs(actual.height - 1775)).toBeGreaterThan(10);
    for (const id of incident) expect(point(buildTerrainSurface(data, [id]).land, x, y)).toMatchObject({ height: actual.height, light: actual.light });
  });

  it('is independent of core grouping and request order, and never aliases or changes source blocks', () => {
    const data = fixture((x, y) => 300 + (x * 17 + y * 23) % 1500), before = byteSnapshot(data), ids = new Uint32Array([idAt(31, 31), idAt(32, 31)]), copy = ids.slice();
    const together = buildTerrainSurface(data, ids).land, reversed = buildTerrainSurface(data, [...ids].reverse()).land, alone = buildTerrainSurface(data, [ids[0]]).land;
    for (const y of [992, 1024]) {
      const a = point(together, 1024, y), b = point(reversed, 1024, y), c = point(alone, 1024, y);
      expect([a.height, a.light]).toEqual([b.height, b.light]); expect([a.height, a.light]).toEqual([c.height, c.light]);
    }
    together.positions.fill(0); together.heights.fill(-9999); together.lights.fill(0); together.indices.fill(0);
    expect(ids).toEqual(copy); expect(byteSnapshot(data)).toEqual(before);
  });

  it('reads only needed local geometry/elevation owners and never enumerates the world or memberships', () => {
    const data = fixture(), touched = new Set<BlockKey>();
    const local = new Proxy(data.blocks, { get(target, property) {
      if (property === 'get') return (key: BlockKey) => { touched.add(key); const [layer, bx, by] = key.split(':'); if (!['geometry', 'elevation'].includes(layer) || Number(bx) > 1 || Number(by) > 1) throw new Error(`Unnecessary world read ${key}`); return target.get(key); };
      throw new Error(`World enumeration/access is forbidden: ${String(property)}`);
    } });
    const result = buildTerrainSurface({ manifest: data.manifest, blocks: local } as AtlasGeographyView, [idAt(31, 31)]);
    expect(result.land.positions.length).toBe(10); expect(result.land.indices.length).toBe(12); expect(touched.size).toBeLessThanOrEqual(8);
    expect([...touched].some(key => key === 'geometry:1:1')).toBe(true); expect([...touched].some(key => key === 'elevation:1:1')).toBe(true);
    const empty = buildTerrainSurface({ manifest: data.manifest, blocks: local }, []); expect(empty.land.positions.length + empty.sea.positions.length).toBe(0);
  });

  it('keeps all interpolated samples and lighting bounded at extremes and world edges', () => {
    for (const ocean of [false, true]) {
      const data = fixture((x, y) => ocean ? (x + y) % 2 ? -12000 : -1 : (x + y) % 2 ? 12000 : 0), result = buildTerrainSurface(data, [0, 1, size, size + 1]);
      const mesh = ocean ? result.sea : result.land;
      expect([...mesh.heights].every(value => ocean ? value >= -12000 && value <= -1 : value >= 0 && value <= 12000)).toBe(true);
      expect([...mesh.lights].every(value => value >= .87 && value <= 1.13 && Number.isFinite(value))).toBe(true);
      expect(triangleArea(mesh)).toBe(4096);
    }
    const isolated = fixture(() => -1000); setHeight(isolated, 0, 100); expect([...buildTerrainSurface(isolated, [0]).land.lights].every(light => light === 1)).toBe(true);
  });

  it('rejects invalid requests and malformed local source without fixing it or falling back to fake geometry', () => {
    const data = fixture(); for (const ids of [[0, 0], [-1], [size * size], [1.5]]) expect(() => buildTerrainSurface(data, ids)).toThrow('可见地块');
    data.blocks.delete('geometry:0:0'); const before = byteSnapshot(data); expect(() => buildTerrainSurface(data, [0])).toThrow('权威所有者'); expect(byteSnapshot(data)).toEqual(before);
    const invalid = fixture(), vertex = getVertexSlot(invalid, size + 2); vertex.block.xyQ[vertex.slot * 2] = 0; vertex.block.xyQ[vertex.slot * 2 + 1] = 0;
    expect(() => buildTerrainSurface(invalid, [0])).toThrow('非凸');
  });
});
