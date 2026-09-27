import { describe, expect, it } from 'vitest';
import { defaultDetailCoastControls, makeDetailCoastRecipe, restoreDetailCoastControls } from './detail-coast-controls';
import { validateGenerationRecipe, validateNaturalDetailRecipe, validateAddNaturalDetailRecipe } from '../world/generation-contract';
import { DETAIL_SHAPE_GENERATOR_FINGERPRINT, NATURAL_DETAIL_GENERATOR_FINGERPRINT } from '../world/generation/fingerprint';

const points = [[1000, 1100], [1400, 1100], [1400, 1600], [1000, 1600]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 }));
describe('natural and historical fine-world controls', () => {
  it('defaults a new world to v2 and restores every v2 parameter with independent first/add identities', () => {
    const controls = { ...defaultDetailCoastControls('new'), structure: 88, roughness: 20, shelf: 64, relief: 2800, islands: 2, islandsPerChain: 5 };
    const first = makeDetailCoastRecipe(controls, points, false), added = makeDetailCoastRecipe(controls, points, true);
    expect(validateNaturalDetailRecipe(first)).toBe(true); expect(validateAddNaturalDetailRecipe(added)).toBe(true);
    expect(first.generator.fingerprint).not.toBe(added.generator.fingerprint);
    expect(restoreDetailCoastControls(first, 'fallback')).toEqual(controls); expect(restoreDetailCoastControls(added, 'fallback')).toEqual(controls);
    expect(restoreDetailCoastControls(null, 'fresh').version).toBe(2);
  });

  it('keeps v1 controls and version while a newly requested recipe uses the current v1 implementation identity', () => {
    const old = makeDetailCoastRecipe({ ...defaultDetailCoastControls('old'), version: 1, roughness: 12, islandsPerChain: 6 }, points, false);
    const controls = restoreDetailCoastControls(old, 'unused'), original = structuredClone(old);
    expect(controls.version).toBe(1); expect(controls.roughness).toBe(12); expect(controls.islandsPerChain).toBe(6);
    expect(makeDetailCoastRecipe(controls, points, false).generator).toEqual({ id: 'shape-detail-landmass', version: 1, fingerprint: DETAIL_SHAPE_GENERATOR_FINGERPRINT });
    expect(old).toEqual(original); expect('coastStructureWorld' in old.parameters).toBe(false);
  });

  it('rejects mixed version identities, container relabeling, accessor parameters, new margin and crossed outlines', () => {
    const controls = defaultDetailCoastControls('boundary'), valid = makeDetailCoastRecipe(controls, points, false);
    expect(validateGenerationRecipe({ ...valid, version: 2 })).toBe(false);
    expect(validateGenerationRecipe({ ...valid, generator: { ...valid.generator, fingerprint: DETAIL_SHAPE_GENERATOR_FINGERPRINT } }, undefined, 'storage')).toBe(false);
    expect(validateGenerationRecipe({ ...valid, generator: { ...valid.generator, version: 1, fingerprint: NATURAL_DETAIL_GENERATOR_FINGERPRINT } }, undefined, 'storage')).toBe(false);
    const parameters = { ...valid.parameters }; Object.defineProperty(parameters, 'coastStructureWorld', { enumerable: true, get() { throw new Error('must not run'); } });
    expect(validateGenerationRecipe({ ...valid, parameters })).toBe(false);
    const margin = controls.structure + controls.roughness + 52;
    expect(() => makeDetailCoastRecipe(controls, [{ xQ: (margin - 1) * 256, yQ: 400 * 256 }, ...points.slice(1)], false)).toThrow(`${margin}`);
    expect(() => makeDetailCoastRecipe(controls, [points[0], points[2], points[1], points[3]], false)).toThrow('不交叉');
    const copy = makeDetailCoastRecipe(controls, points, false), originalPoint = copy.parameters.pointsQ[0].xQ;
    const external = points.map(point => ({ ...point })), owned = makeDetailCoastRecipe(controls, external, false); external[0].xQ = 0;
    expect(owned.parameters.pointsQ[0].xQ).toBe(originalPoint);
  });
});
