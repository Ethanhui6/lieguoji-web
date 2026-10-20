import { expect, it } from 'vitest';
import { originalBiomeIds, originalClimate } from './original-biomes';
import { createFmsOriginalDocument, originalGridFor } from './original-document';

it('rainfall trials recompute actual rivers and biomes without mutating terrain; default restores exactly', async () => {
  const doc = await createFmsOriginalDocument('20k'), grid = (await originalGridFor(doc))!;
  doc.elevations = Int32Array.from(doc.points, ([x,y]) => Math.max(0, Math.round(90 - Math.hypot((x-800)/3.2,(y-450)/2.2)*.9+(x-800)/40)));
  const heights = doc.elevations.slice(), revision = doc.revision;
  const normal = originalClimate(grid,doc), dry = originalClimate(grid,doc,20), restored = originalClimate(grid,doc,80);
  expect(dry.precipitation).not.toEqual(normal.precipitation);
  expect(dry.rivers.riverIds).not.toEqual(normal.rivers.riverIds);
  expect(dry.rivers.paths.length).toBeLessThan(normal.rivers.paths.length);
  expect(originalBiomeIds(grid,doc,dry)).not.toEqual(originalBiomeIds(grid,doc,normal));
  expect(restored).toEqual(normal);
  expect(doc.elevations).toEqual(heights); expect(doc.revision).toBe(revision);
  expect(() => originalClimate(grid,doc,NaN)).toThrow();
});
