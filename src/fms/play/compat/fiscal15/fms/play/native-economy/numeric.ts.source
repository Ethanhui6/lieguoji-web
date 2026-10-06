/** Resolved finite-input contract only. Do not invent values for native traps. */
export const f = Math.fround;
export const iadd = (a: number, b: number) => (a + b) | 0;
export const imul = Math.imul;
export function int32(value: number): number {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) throw Error('Expected signed int32 economic input');
  return value | 0; // Native integer zero has no negative-zero representation.
}
export function finite(value: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(f(value))) throw Error('Expected finite economic input');
  return f(value);
}
export function truncInt(value: number): number { return int32(Math.trunc(finite(value))); }
/** Unity Mathf.RoundToInt 0x37AC80: nearest integer, halfway to even. */
export function roundInt(value: number): number {
  const x = finite(value), low = Math.floor(x), part = x - low;
  return int32(part < .5 ? low : part > .5 ? low + 1 : low % 2 === 0 ? low : low + 1);
}
export function idiv(a: number, b: number): number {
  int32(a); int32(b);
  if (b === 0 || a === -2147483648 && b === -1) throw Error('Native integer division is outside the finite contract');
  return Math.trunc(a / b) | 0;
}
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
