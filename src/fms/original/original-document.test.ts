import { describe, expect, it } from 'vitest';
import { createFmsOriginalDocument, originalGridIdOf, switchBlankGrid } from './original-document';
import { createFmsDocument, FmsEditHistory } from '../model';
import { generateFmsFullMap, prepareFmsFullMapPreview } from '../full-map-terrain';
import { createCivilizationWorld47 } from '../play/civilization47-world';
import { SETTLEMENT47_ALGORITHM } from '../play/settlement47-regions';
import { originalCellProvinces } from './original-politics';

describe('playable documents on the original BasicMap grid', () => {
  it('builds a valid 1600x900 document and recognizes only exact original grids', async () => {
    const doc = await createFmsOriginalDocument('20k');
    expect(doc).toMatchObject({ width: 1600, height: 900 });
    expect(doc.points).toHaveLength(19928);
    expect(await originalGridIdOf(doc)).toBe('20k');
    expect(await originalGridIdOf(await createFmsDocument({ yieldTask: async () => {} }))).toBeNull();
    const moved = structuredClone(doc); moved.points[5][0] += .01;
    expect(await originalGridIdOf(moved)).toBeNull();
  });

  it('switches an empty ocean to the original grid, then generates a full map there', async () => {
    const square = await createFmsDocument({ yieldTask: async () => {} });
    const original = await createFmsOriginalDocument('20k', { worldId: square.worldId, revision: square.revision + 1, version: square.version });
    const history = switchBlankGrid(new FmsEditHistory(square), original);
    expect(history.document.width).toBe(1600);
    expect(history.document.revision).toBe(square.revision + 1);
    expect(history.document.points).toHaveLength(19928);
    const options = { seed: '1337', template: 'continents' as const };
    const result = await generateFmsFullMap(history.document, options);
    expect(result.stats.algorithm).toBe('recovered-height-original-grid-v1');
    expect(result.stats.landCells).toBeGreaterThan(1000);
    const prepared = await prepareFmsFullMapPreview(history.document, { worldId: history.document.worldId, baseRevision: history.document.revision, ...result }, options);
    const land = history.commit(prepared.patch);
    expect(Array.from(land.elevations)).toEqual(Array.from(result.elevations));
    expect(() => switchBlankGrid(history, { ...original, revision: land.revision + 1 })).toThrow('空白海洋');
  });

  it('founds a culture world there and colors every land cell by a province', async () => {
    const doc = await createFmsOriginalDocument('20k');
    doc.elevations = (await generateFmsFullMap(doc, { seed: '1337', template: 'continents' })).elevations;
    const run = createCivilizationWorld47(doc, 6, 60, 'war', { mode: 'culture-generated', enabled: ['chinese', 'japanese', 'english'] } as never, SETTLEMENT47_ALGORITHM);
    expect(run.world.provinces).toHaveLength(60);
    const owners = originalCellProvinces(run.terrain, run.world.provinces, run.scale);
    const landCells = Array.from(doc.elevations.keys()).filter(i => doc.elevations[i] >= 20);
    const assigned = landCells.filter(i => owners[i] >= 0).length;
    expect(assigned / landCells.length).toBeGreaterThan(.995);
    expect(new Set(landCells.map(i => owners[i]).filter(i => i >= 0)).size).toBe(60);
    expect(Array.from(doc.elevations.keys()).filter(i => doc.elevations[i] < 20).every(i => owners[i] === -1)).toBe(true);
  }, 120000);
});
