import { describe, expect, it } from 'vitest';
import { createFmsDocument } from '../model';
import { generateFmsFullMap, type FmsFullMapOptions } from '../full-map-terrain';
import { grid } from './fixture.test-support';
import { edgeKey, landFaces, polygonArea, type Vertex } from './settlement25-mesh';
import { SETTLEMENT25_ALGORITHM } from './settlement25-regions';
import { SETTLEMENT47_ALGORITHM, settlementRegions47 } from './settlement47-regions';

const boundary = (rings: { ring: Vertex[] }[]): string[] => {
  const edges = new Set<string>();
  for (const { ring } of rings) for (let i = 0; i < ring.length; i++) {
    const key = edgeKey(ring[i], ring[(i + 1) % ring.length]);
    if (edges.has(key)) edges.delete(key); else edges.add(key);
  }
  return [...edges].sort();
};
const contains = (ring: Vertex[], point: { x: number; y: number }): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};
const full = async (options: FmsFullMapOptions) => {
  const doc = await createFmsDocument();
  doc.elevations = (await generateFmsFullMap(doc, options)).elevations;
  return doc;
};

describe('civilization47 bounded terrain partition fallback', () => {
  it('keeps the original result and algorithm on maps it already partitions', () => {
    const document = grid((x, y) => x > 20 && x < 230 && y > 20 && y < 230 ? 45 : 0);
    const result = settlementRegions47(document, 60);
    expect(result.algorithm).toBe(SETTLEMENT25_ALGORITHM);
    expect(result.regions).toHaveLength(60);
  });

  it('founding on the default 1337 multi-continent full map preserves every real face and yields exactly 60 cities', async () => {
    const document = await full({ seed: '1337', template: 'continents' });
    const elevations = Int32Array.from(document.elevations), revision = document.revision;
    const faces = landFaces(document), { regions, algorithm } = settlementRegions47(document, 60);
    expect(algorithm).toBe(SETTLEMENT47_ALGORITHM);
    expect(regions).toHaveLength(60);
    expect(document.elevations).toEqual(elevations);
    expect(document.revision).toBe(revision);
    const members = regions.flatMap(region => region.members);
    expect(members).toHaveLength(faces.length);
    expect(new Set(members).size).toBe(faces.length);
    expect(boundary(regions)).toEqual(boundary(faces));
    expect(regions.reduce((sum, region) => sum + polygonArea(region.ring), 0))
      .toBeCloseTo(faces.reduce((sum, face) => sum + polygonArea(face.ring), 0), 4);
    const polygonEdges = regions.map(region => new Set(region.ring.map((vertex, index) =>
      edgeKey(vertex, region.ring[(index + 1) % region.ring.length]))));
    for (const [index, region] of regions.entries()) {
      expect(region.ring.length).toBeLessThanOrEqual(200);
      expect(new Set(region.ring.map(vertex => vertex.key)).size).toBe(region.ring.length);
      expect(contains(region.ring, region.center)).toBe(true);
      const allowed = new Set(region.members), reached = new Set([region.members[0]]), queue = [region.members[0]];
      for (let head = 0; head < queue.length; head++) for (const next of faces[queue[head]].neighbors)
        if (allowed.has(next) && !reached.has(next)) { reached.add(next); queue.push(next); }
      expect(reached.size).toBe(region.members.length);
      for (const neighbor of region.neighbors) {
        expect(regions[neighbor].neighbors.has(index)).toBe(true);
        expect([...polygonEdges[index]].some(edge => polygonEdges[neighbor].has(edge))).toBe(true);
      }
    }
  }, 30000);

  it('keeps an independent full-map seed playable at the requested 60 cities', async () => {
    const document = await full({ seed: '421730', template: 'pangea' });
    const faces = landFaces(document), { regions } = settlementRegions47(document, 60);
    expect(regions).toHaveLength(60);
    expect(new Set(regions.flatMap(region => region.members)).size).toBe(faces.length);
    expect(regions.reduce((sum, region) => sum + polygonArea(region.ring), 0))
      .toBeCloseTo(faces.reduce((sum, face) => sum + polygonArea(face.ring), 0), 4);
  }, 30000);

  it('does not hide impossible counts or join isolated land across sea', () => {
    const islands = grid((x, y) => x % 40 === 0 && y % 40 === 0 ? 45 : 0);
    const before = structuredClone(islands);
    expect(() => settlementRegions47(islands, 24)).toThrow(/不相连/);
    expect(islands).toEqual(before);
    expect(() => settlementRegions47(grid(() => 0), 60)).toThrow(/无法放置/);
  });
});
