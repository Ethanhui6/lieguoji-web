import { describe, expect, it } from 'vitest';
import { canStartLocalRelief, localReliefRectangleFromCells, nearbyLocalReliefRectangle, localReliefScope, localReliefSelectionStep, makeLocalReliefRecipe, restoreLocalReliefControls, LOCAL_RELIEF_DEFAULT_TRANSITION } from './local-relief-controls';
import { validateGenerationOperation, validateLocalDetailReliefRecipe } from '../world/generation-contract';
import { LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT } from '../world/generation/fingerprint';
import type { AtlasGridSpec } from '../world/model';

const spec: AtlasGridSpec = { kind: 'shared-quad-grid-v1', columns: 256, rows: 256, width: 4096, height: 4096, coordinateScale: 256, blockCells: 32 };
describe('local mountain UI controls without storage writes', () => {
  it('requires the current actual land pick, not a stale pick or coarse cell selection', () => {
    expect(canStartLocalRelief(17, { cellId: 17, land: true })).toBe(true);
    expect(canStartLocalRelief(17, { cellId: 17, land: false })).toBe(false);
    expect(canStartLocalRelief(17, { cellId: 18, land: true })).toBe(false);
    expect(canStartLocalRelief(17, null)).toBe(false); expect(canStartLocalRelief(null, { cellId: 17, land: true })).toBe(false);
  });

  it('takes a real land first corner and lets the second corner include sea in the selection', () => {
    const first = 40 * 256 + 40, second = 50 * 256 + 20;
    expect(localReliefSelectionStep(null, first, { cellId: first, land: false }, spec).kind).toBe('rejected');
    expect(localReliefSelectionStep(null, first, { cellId: first - 1, land: true }, spec).kind).toBe('rejected');
    expect(localReliefSelectionStep(null, first, { cellId: first, land: true }, spec)).toEqual({ kind: 'anchor', anchor: first });
    expect(localReliefSelectionStep(first, second, { cellId: second, land: false }, spec)).toEqual({ kind: 'complete', rectangle: { column: 20, row: 40, columns: 21, rows: 11 } });
  });

  it('keeps reversed corners and world-edge nearby selections in their actual finite world', () => {
    expect(localReliefRectangleFromCells(0, 65535, spec)).toEqual({ column: 0, row: 0, columns: 256, rows: 256 });
    expect(localReliefRectangleFromCells(65535, 0, spec)).toEqual(localReliefRectangleFromCells(0, 65535, spec));
    expect(nearbyLocalReliefRectangle(0, spec)).toEqual({ column: 0, row: 0, columns: 16, rows: 16 });
    expect(nearbyLocalReliefRectangle(65535, spec)).toEqual({ column: 240, row: 240, columns: 16, rows: 16 });
    expect(() => localReliefRectangleFromCells(0, 65536, spec)).toThrow('不属于');
    expect(() => nearbyLocalReliefRectangle(-1, spec)).toThrow('不属于');
  });

  it('rejects invalid or empty-transition scopes instead of silently requesting the whole world', () => {
    const rectangle = nearbyLocalReliefRectangle(32896, spec);
    expect(localReliefScope(rectangle, LOCAL_RELIEF_DEFAULT_TRANSITION, spec)).toEqual({ kind: 'cell-rectangle', ...rectangle, transitionCells: 2 });
    for (const transition of [0, -1, .5, 8, 17, NaN]) expect(localReliefScope(rectangle, transition, spec)).toBeNull();
    expect(localReliefScope({ ...rectangle, column: 250 }, 2, spec)).toBeNull();
    expect(localReliefScope({ ...rectangle, columns: 4 }, 2, spec)).toBeNull();
  });

  it('builds only the new local recipe with actual identity and rejects invalid controls', () => {
    const recipe = makeLocalReliefRecipe('已有大陆-山地', 2400);
    expect(validateLocalDetailReliefRecipe(recipe)).toBe(true);
    expect(recipe).toEqual({ format: 'lieguoji-atlas-recipe', version: 1, generator: { id: 'local-detail-relief', version: 1, fingerprint: LOCAL_DETAIL_RELIEF_GENERATOR_FINGERPRINT }, seed: '已有大陆-山地', parameters: { reliefMeters: 2400 } });
    expect(validateGenerationOperation(recipe, { kind: 'world' }, spec)).toBe(false);
    for (const relief of [199, 6001, 2400.5, NaN]) expect(() => makeLocalReliefRecipe('valid', relief)).toThrow('起伏');
    expect(() => makeLocalReliefRecipe(' ', 2400)).toThrow('种子');
  });

  it('restores the persisted local operation and scope without aliasing or accepting malformed draw provenance', () => {
    const recipe = makeLocalReliefRecipe('恢复的山地', 2800), scope = localReliefScope({ column: 30, row: 40, columns: 20, rows: 24 }, 3, spec)!;
    const before = structuredClone({ recipe, scope }), restored = restoreLocalReliefControls(recipe, scope, spec)!;
    expect(restored).toEqual({ seed: '恢复的山地', reliefMeters: 2800, rectangle: { column: 30, row: 40, columns: 20, rows: 24 }, transitionCells: 3 });
    restored.rectangle.column = 100; expect({ recipe, scope }).toEqual(before);
    expect(restoreLocalReliefControls(recipe, { kind: 'world' }, spec)).toBeNull();
    expect(restoreLocalReliefControls(recipe, { ...scope, transitionCells: 0 }, spec)).toBeNull();
    expect(restoreLocalReliefControls({ ...recipe, generator: { ...recipe.generator, id: 'shape-detail-landmass' } }, scope, spec)).toBeNull();
    expect(restoreLocalReliefControls({ ...recipe, parameters: { ...recipe.parameters, pointsQ: [] } }, scope, spec)).toBeNull();
  });
});
