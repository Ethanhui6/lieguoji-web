import { describe, expect, it } from 'vitest';
import { macroBranchPath, macroPosition, pickMacroBranch } from './hydrology-macro-view';
import type { HydrologyMacroPreview } from './hydrology-macro-contract';

const id = (x: number, y: number) => y * 257 + x;
const joined: Pick<HydrologyMacroPreview, 'edges' | 'branches'> = {
  edges: { from: [id(10, 9), id(10, 10), id(10, 11), id(9, 10)], to: [id(10, 10), id(10, 11), id(10, 12), id(10, 10)] },
  branches: [{ sourceNode: id(10, 9), endNode: id(10, 12), stop: 'sampled-sea' }, { sourceNode: id(9, 10), endNode: id(10, 10), stop: 'joins-network' }],
};
describe('macro flow presentation follows real supplied edges', () => {
  it('highlights a tributary into shared downstream without adding a shortcut or changing the packet', () => {
    const before = structuredClone(joined);
    expect(macroBranchPath(joined, 1)).toEqual([id(9, 10), id(10, 10), id(10, 11), id(10, 12)]);
    expect(macroBranchPath(joined, 0)).toEqual([id(10, 9), id(10, 10), id(10, 11), id(10, 12)]);
    expect(joined).toEqual(before); expect(macroBranchPath(joined, 7)).toEqual([]);
  });
  it('selects the actual branch near its edge, stable shared downstream, and rejects empty ocean taps', () => {
    expect(pickMacroBranch(joined, { x: 152, y: 161 }, 3)).toBe(1);
    expect(pickMacroBranch(joined, { x: 161, y: 184 }, 3)).toBe(0);
    expect(pickMacroBranch(joined, { x: 140, y: 180 }, 3)).toBeNull();
    expect(macroPosition(id(256, 256))).toEqual({ x: 4096, y: 4096 });
  });
  it('ends at the last supplied sample when a display budget omitted downstream', () => {
    const limited = { edges: { from: [id(1, 1)], to: [id(2, 1)] }, branches: [{ sourceNode: id(1, 1), endNode: id(2, 1), stop: 'display-limit' as const }] };
    expect(macroBranchPath(limited, 0)).toEqual([id(1, 1), id(2, 1)]);
    expect(pickMacroBranch(limited, { x: 48, y: 16 }, 2)).toBeNull();
  });
});
