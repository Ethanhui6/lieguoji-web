import { beforeAll, describe, expect, it } from 'vitest';
import { createGenerationDraft, type AtlasDetailCoastDocument } from '../atlas-format';
import { getCellQuad } from '../topology';
import { COUNTRY_POLITICAL_MESH_RULE, createCountryPoliticalMesh, type CountryPoliticalMesh, type CountryPoliticalPoint } from './political-mesh';

const fast = { yieldTask: async () => {} };
const cross = (a: CountryPoliticalPoint, b: CountryPoliticalPoint, c: CountryPoliticalPoint) => (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ);
const area = (points: CountryPoliticalPoint[]) => points.reduce((sum, a, i) => { const b = points[(i + 1) % points.length]; return sum + a.xQ * b.yQ - a.yQ * b.xQ; }, 0) / 2;
let geography: AtlasDetailCoastDocument, mesh: CountryPoliticalMesh;
beforeAll(async () => {
  geography = await createGenerationDraft({ size: 128, name: '共享政治几何测试', seed: 'political-voronoi-v1-unit' }, fast, 4);
  mesh = await createCountryPoliticalMesh(geography, fast);
}, 30000);

describe('fixed political-voronoi-v1 geometry over real Atlas shared quads', () => {
  it('is deterministic, independent of unrelated metadata and keeps every seed inside the original immutable quad', async () => {
    const before = structuredClone(geography), renamed = structuredClone(geography);
    renamed.manifest.name = '名称不影响政治网格'; renamed.manifest.seed = '新标签不能换政治几何';
    const again = await createCountryPoliticalMesh(renamed, fast);
    expect(mesh.rule).toBe(COUNTRY_POLITICAL_MESH_RULE); expect(mesh.cellCount).toBe(128 * 128);
    const invalidSeeds: number[] = [];
    for (let id = 0; id < mesh.cellCount; id++) {
      const seed = mesh.centerQ(id), quad = getCellQuad(geography, id).map(p => ({ xQ: p.x * 256, yQ: p.y * 256 }));
      if (!Number.isInteger(seed.xQ) || !Number.isInteger(seed.yQ) || quad.some((a, i) => cross(a, quad[(i + 1) % 4], seed) <= 0)) invalidSeeds.push(id);
      if (id % 97 === 0) { expect(again.centerQ(id)).toEqual(seed); expect(again.cellPolygonQ(id)).toEqual(mesh.cellPolygonQ(id)); expect(mesh.pick(seed)).toBe(id); }
    }
    expect(invalidSeeds).toEqual([]); expect(geography).toEqual(before);
    const exported = mesh.cellPolygonQ(17); exported[0].xQ = -123;
    const center = mesh.centerQ(17); center.xQ = -456;
    expect(mesh.cellPolygonQ(17)).toEqual(again.cellPolygonQ(17)); expect(mesh.centerQ(17)).toEqual(again.centerQ(17));
  });

  it('covers the complete world without gaps or non-convex cells and produces non-orthogonal shared borders', () => {
    let totalArea = 0, diagonalEdges = 0, checkedEdges = 0, nonQuadCells = 0;
    for (let id = 0; id < mesh.cellCount; id++) {
      const polygon = mesh.cellPolygonQ(id); totalArea += area(polygon); if (polygon.length !== 4) nonQuadCells++;
      for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        if (cross(a, b, polygon[(i + 2) % polygon.length]) < 0) throw new Error(`Non-convex cell ${id}`);
        if (a.xQ < 0 || a.xQ > mesh.widthQ || a.yQ < 0 || a.yQ > mesh.heightQ) throw new Error(`Outside vertex ${id}`);
        checkedEdges++; if (a.xQ !== b.xQ && a.yQ !== b.yQ) diagonalEdges++;
      }
    }
    expect(Math.abs(totalArea / (mesh.widthQ * mesh.heightQ) - 1)).toBeLessThan(1e-12);
    expect(diagonalEdges / checkedEdges).toBeGreaterThan(.95); expect(nonQuadCells).toBeGreaterThan(mesh.cellCount / 2);
    // A geometric partition check, not a current-browser visual or performance acceptance.
    for (let row = 0; row < 80; row++) for (let column = 0; column < 80; column++) {
      const point = { xQ: (column + .37) * mesh.widthQ / 80, yQ: (row + .61) * mesh.heightQ / 80 }, id = mesh.pick(point)!;
      const polygon = mesh.cellPolygonQ(id);
      expect(polygon.every((a, i) => cross(a, polygon[(i + 1) % polygon.length], point) >= -1e-5)).toBe(true);
    }
  });

  it('returns edge-ordered reciprocal neighbours and picks shared edges with the lowest cell ID', () => {
    for (const id of [0, 1, 127, 128, 16383, ...Array.from({ length: 100 }, (_, i) => 130 + i * 149)]) {
      const polygon = mesh.cellPolygonQ(id), neighbors = mesh.sideNeighbors(id);
      expect(neighbors).toHaveLength(polygon.length);
      expect(mesh.neighbors(id)).toEqual([...new Set(neighbors.filter(value => value >= 0))].sort((a, b) => a - b));
      for (let edge = 0; edge < polygon.length; edge++) {
        const a = polygon[edge], b = polygon[(edge + 1) % polygon.length], neighbor = neighbors[edge];
        const midpoint = { xQ: (a.xQ + b.xQ) / 2, yQ: (a.yQ + b.yQ) / 2 };
        if (neighbor === -1) {
          expect(a.xQ === b.xQ && (a.xQ === 0 || a.xQ === mesh.widthQ) || a.yQ === b.yQ && (a.yQ === 0 || a.yQ === mesh.heightQ)).toBe(true);
          expect(mesh.pick(midpoint)).toBe(id); continue;
        }
        const other = mesh.cellPolygonQ(neighbor), reciprocal = mesh.sideNeighbors(neighbor);
        const reverse = other.findIndex((p, j) => p.xQ === b.xQ && p.yQ === b.yQ && other[(j + 1) % other.length].xQ === a.xQ && other[(j + 1) % other.length].yQ === a.yQ);
        expect(reverse).toBeGreaterThanOrEqual(0); expect(reciprocal[reverse]).toBe(id);
        expect(mesh.pick(midpoint)).toBe(Math.min(id, neighbor));
      }
    }
  });

  it('uses stable smallest-ID vertex ties and enforces world/pick bounds', () => {
    const centers = Array.from({ length: mesh.cellCount }, (_, id) => mesh.centerQ(id));
    for (const point of [mesh.cellPolygonQ(8128)[0], mesh.cellPolygonQ(8129)[1], mesh.cellPolygonQ(8256)[2], { xQ: 0, yQ: 0 }, { xQ: mesh.widthQ, yQ: mesh.heightQ }]) {
      const distances = centers.map(center => (center.xQ - point.xQ) ** 2 + (center.yQ - point.yQ) ** 2), minimum = Math.min(...distances);
      const tied = distances.map((distance, id) => ({ distance, id })).filter(row => Math.abs(row.distance - minimum) < 1e-5).map(row => row.id);
      expect(mesh.pick(point)).toBe(Math.min(...tied)); expect(mesh.pick({ ...point })).toBe(Math.min(...tied));
    }
    expect(mesh.pick({ xQ: -1, yQ: 0 })).toBeNull(); expect(mesh.pick({ xQ: mesh.widthQ + 1, yQ: 0 })).toBeNull();
    expect(() => mesh.pick({ xQ: NaN, yQ: 0 })).toThrow('有限'); expect(() => mesh.centerQ(-1)).toThrow('ID');
    expect(() => mesh.cellPolygonQ(mesh.cellCount)).toThrow('ID'); expect(() => mesh.neighbors(.5)).toThrow('ID');
  });

  it('captures geometry before yielding and cancels scans or final validation without publishing a partial mesh', async () => {
    const input = structuredClone(geography); let changed = false;
    const captured = await createCountryPoliticalMesh(input, { yieldTask: async () => {
      if (!changed) { changed = true; input.blocks.clear(); input.manifest.spec.columns = 512; }
    } });
    expect(changed).toBe(true); expect(captured.cellCount).toBe(mesh.cellCount);
    for (const id of [0, 1024, 8128, 16383]) expect(captured.cellPolygonQ(id)).toEqual(mesh.cellPolygonQ(id));
    const preAborted = new AbortController(); preAborted.abort();
    await expect(createCountryPoliticalMesh(geography, { signal: preAborted.signal })).rejects.toThrow();
    for (const stage of ['准备固定政治网格种子', '构建共享政治 Voronoi 网格', '核验共享政治网格身份']) {
      const controller = new AbortController(); let observed = false;
      await expect(createCountryPoliticalMesh(geography, { ...fast, signal: controller.signal, onProgress: progress => {
        if (progress.stage === stage) { observed = true; controller.abort(); }
      } })).rejects.toThrow();
      expect(observed).toBe(true);
    }
  });
});
