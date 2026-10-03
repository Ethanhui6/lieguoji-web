/** Project-authored finite numeric operations. These are not d3-array code. */
export function finiteMean(values: readonly number[]): number {
  if (!values.length) throw new Error('地形平均值需要非空数值。');
  let sum = 0;
  for (const value of values) { if (!Number.isFinite(value)) throw new Error('地形平均值含非有限值。'); sum += value; }
  return sum / values.length;
}
export function firstMinimumIndex(values: readonly number[], compare: (a: number, b: number) => number): number {
  if (!values.length) throw new Error('地形邻接不能为空。');
  let selected = 0;
  for (let index = 1; index < values.length; index++) {
    const difference = compare(values[index], values[selected]);
    if (!Number.isFinite(difference)) throw new Error('地形邻接比较含非有限值。');
    if (difference < 0) selected = index;
  }
  return selected;
}
export function boundedIndices(count: number): number[] {
  if (!Number.isInteger(count) || count < 0 || count > 50000) throw new Error('地形循环长度超过范围。');
  return Array.from({ length: count }, (_, index) => index);
}
