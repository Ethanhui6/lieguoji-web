/** Integer streams and fixed-point interpolation for macro-landmass@1. */
export const FIELD_Q = 4096;
const UNIT_Q = 65536, WORLD_Q = 4096 * 256;
export const roundRatio = (numerator: number, denominator: number) => Math.floor(numerator / denominator + .5);
export function mix32(value: number): number {
  value = Math.imul(value ^ value >>> 16, 0x7feb352d) >>> 0;
  value = Math.imul(value ^ value >>> 15, 0x846ca68b) >>> 0;
  return (value ^ value >>> 16) >>> 0;
}
export function seedHash(text: string): number {
  const seed = new TextEncoder().encode(text), prefix = new TextEncoder().encode('macro-landmass@1\0');
  let value = 2166136261;
  const add = (byte: number) => { value = Math.imul(value ^ byte, 16777619) >>> 0; };
  for (const byte of prefix) add(byte);
  for (let i = 0; i < 4; i++) add(seed.length >>> (8 * i) & 255);
  for (const byte of seed) add(byte);
  return value;
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
/** Three triangular shears. The underlying continuous maps fix the boundary,
 * with diagonal derivatives >= .76/.76/.88, hence cannot fold. Quantization
 * is explicit; discrete connectivity is checked separately, never inferred. */
export function warpedWorldQ(seed: number, xQ: number, yQ: number): [number, number] {
  let u = roundRatio(xQ * UNIT_Q, WORLD_Q), v = roundRatio(yQ * UNIT_Q, WORLD_Q);
  const direction = hashAt(seed, 1, 0, 0) % 8;
  if (direction >= 4) u = UNIT_Q - u;
  for (let turn = 0; turn < direction % 4; turn++) [u, v] = [UNIT_Q - v, u];
  const shear = (coordinate: number, transverse: number, tag: number, boundQ: number) => {
    const field = noiseQ12(seed, tag, roundRatio(transverse * WORLD_Q, UNIT_Q), 0, 1024 * 256);
    const edge = roundRatio(4 * transverse * (UNIT_Q - transverse), UNIT_Q);
    const coefficient = roundRatio(roundRatio(field * boundQ, FIELD_Q) * edge, UNIT_Q);
    return coordinate + roundRatio(coefficient * coordinate * (UNIT_Q - coordinate), UNIT_Q * UNIT_Q);
  };
  u = shear(u, v, 30, 15728); v = shear(v, u, 31, 15728); u = shear(u, v, 32, 7864);
  return [roundRatio(u * WORLD_Q, UNIT_Q), roundRatio(v * WORLD_Q, UNIT_Q)];
}
