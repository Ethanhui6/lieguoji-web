import { expect, it } from 'vitest';
import { mountainGradientNoise } from './terrain-massif';

it('has deterministic bounded values with nonconstant seed-specific physical variation', () => {
  let variation = 0, changed = 0;
  for (let y = -2; y <= 3; y += .125) for (let x = -2; x <= 3; x += .125) {
    const value = mountainGradientNoise(9811, 7501, x, y);
    expect(value).toBe(mountainGradientNoise(9811, 7501, x, y)); expect(Math.abs(value)).toBeLessThan(1);
    variation = Math.max(variation, Math.abs(value)); if (value !== mountainGradientNoise(9812, 7501, x, y)) changed++;
  }
  expect(variation).toBeGreaterThan(.1); expect(changed).toBeGreaterThan(1000);
});

it('keeps height and first derivative continuous across triangle-order boundaries and lattice corners', () => {
  const epsilon = 1e-6, unskew = (3 - Math.sqrt(3)) / 6;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (const local of [0, .08, .18, .28]) {
    const x = i - (i + j) * unskew + local, y = j - (i + j) * unskew + local;
    const sample = (shift: number) => mountainGradientNoise(9811, 7501, x + shift, y - shift);
    const center = sample(0), left = sample(-epsilon), right = sample(epsilon);
    expect(Math.abs(right - left)).toBeLessThan(1e-4);
    expect(Math.abs((right - center) / epsilon - (center - left) / epsilon)).toBeLessThan(.01);
  }
});
