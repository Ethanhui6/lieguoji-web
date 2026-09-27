/** Test-only preview18 oracle dependencies. Exact selected original declarations; see SOURCE_MANIFEST.json. */
/** Integer streams and fixed-point interpolation for macro-landmass@1. */
export const FIELD_Q = 4096;
export const roundRatio = (numerator: number, denominator: number) => Math.floor(numerator / denominator + .5);
export function mix32(value: number): number {
  value = Math.imul(value ^ value >>> 16, 0x7feb352d) >>> 0;
  value = Math.imul(value ^ value >>> 15, 0x846ca68b) >>> 0;
  return (value ^ value >>> 16) >>> 0;
}
export function hashAt(seed: number, tag: number, x: number, y: number): number {
  return mix32(seed ^ Math.imul(tag, 0x9e3779b9) ^ Math.imul(x, 0x85ebca6b) ^ Math.imul(y, 0xc2b2ae35));
}
export function smoothQ(value: number, q = FIELD_Q): number {
  const t = Math.max(0, Math.min(q, value)); return Math.floor(t * t * (3 * q - 2 * t) / (q * q));
}
/** Signed Q12 continuous lattice field, sampled in absolute Q8 world coordinates. */
export function noiseQ12(seed: number, tag: number, xQ: number, yQ: number, wavelengthQ: number): number {
  const x = Math.floor(xQ / wavelengthQ), y = Math.floor(yQ / wavelengthQ);
  const tx = smoothQ(Math.floor((xQ - x * wavelengthQ) * FIELD_Q / wavelengthQ));
  const ty = smoothQ(Math.floor((yQ - y * wavelengthQ) * FIELD_Q / wavelengthQ));
  const value = (a: number, b: number) => hashAt(seed, tag, a, b) % (2 * FIELD_Q + 1) - FIELD_Q;
  const lerp = (a: number, b: number, t: number) => a + roundRatio((b - a) * t, FIELD_Q);
  return lerp(lerp(value(x, y), value(x + 1, y), tx), lerp(value(x, y + 1), value(x + 1, y + 1), tx), ty);
}
/** Exact integer result; sqrt is only an initial guess, never the rounding rule. */
export function integerSqrt(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('地理距离超出安全整数范围。');
  let root = Math.floor(Math.sqrt(value));
  while ((root + 1) * (root + 1) <= value) root++;
  while (root * root > value) root--;
  return root;
}
