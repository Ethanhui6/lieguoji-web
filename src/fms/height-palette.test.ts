import { describe, expect, it } from 'vitest';
import { linearToSrgb, recoveredHeightLinear, srgbToLinear } from './height-palette';
import { FMS_OCEAN_DEEP, FMS_OCEAN_SHALLOW } from './ocean-surface';

// Independent static DXBC reconstruction: every operation rounded to binary32,
// including height/100 and alpha->height. Not an original GPU capture. The web
// reads interpolated height directly and GPU mad fusion can differ slightly.
const fixtures = [
  [20, [.9282573461532593, 1, .8124226927757263]],
  [40, [.9637232422828674, .6782429218292236, .4642135202884674]],
  [59.99, [.999981701374054, .42828747630119324, .22441387176513672]],
  [60, [1, .42817914485931396, .2243184596300125]],
  [60.01, [.9998894333839417, .42801445722579956, .22419783473014832]],
  [80, [.793353796005249, .16916994750499725, .05261390283703804]],
  [100, [.6148251295089722, .03486563265323639, 0]],
] as const;

describe('original height editing color contract', () => {
  it.each(fixtures)('matches the independent Shader189 calculation at height %s', (height, expected) => {
    recoveredHeightLinear(height).forEach((value, channel) => expect(Math.abs(value - expected[channel])).toBeLessThan(8e-7));
  });
  it('clamps display height at the original 20/100 endpoints', () => {
    expect(recoveredHeightLinear(-100)).toEqual(recoveredHeightLinear(20));
    expect(recoveredHeightLinear(200)).toEqual(recoveredHeightLinear(100));
    // No jump to a different palette at the actual h60 branch boundary.
    recoveredHeightLinear(60 - 1e-5).forEach((c, i) => expect(Math.abs(c - recoveredHeightLinear(60 + 1e-5)[i])).toBeLessThan(1e-6));
  });
  it('preserves sRGB endpoints and performs sea interpolation in linear space', () => {
    for (const c of [0, .003, .04045, ...FMS_OCEAN_SHALLOW, ...FMS_OCEAN_DEEP, 1]) {
      expect(Math.abs(linearToSrgb(srgbToLinear(c)) - c)).toBeLessThan(3e-8);
    }
    const midpoint = FMS_OCEAN_SHALLOW.map((c, i) => linearToSrgb((srgbToLinear(c) + srgbToLinear(FMS_OCEAN_DEEP[i])) / 2));
    const expected = [.176299039, .572268804, .999999970];
    midpoint.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThan(1e-8));
    expect(midpoint[0]).toBeGreaterThan((FMS_OCEAN_SHALLOW[0] + FMS_OCEAN_DEEP[0]) / 2 + .019);
  });
});
