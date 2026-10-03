import { describe, expect, it } from 'vitest';
import hillFixtures from '../../docs/evidence/fms-hill-recovery-2026-10-04/hill-static-fixtures.json';
import {
  applyFmsPlaneBrush,
  applyFmsHillBrush,
  FmsNativeBrushError,
  generateFmsHillContributions,
  MAX_FMS_HILL_NEIGHBOR_VISITS,
  MAX_FMS_PLANE_BRUSH_CELLS,
} from './fms-native-brush';
import type { FmsHillBrushInput, FmsNativeBrushErrorCode, FmsPlaneBrushMode } from './fms-native-brush';

function expectBrushError(action: () => unknown, code: FmsNativeBrushErrorCode, index?: number): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(FmsNativeBrushError);
  expect(caught).toMatchObject({ code, index });
}

describe('the recovered FMS Plane arithmetic', () => {
  it.each([
    ['add', [7, 20, 95], 12.75, [19, 32, 107]],
    ['subtract', [7, 20, 95], 12.75, [-5, 8, 83]],
    ['min', [7, 20, 95], 12.75, [7, 12, 12]],
    ['max', [7, 20, 95], 12.75, [12, 20, 95]],
    ['average', [7, 20, 95], 12.75, [9, 16, 53]],
  ] as const)('%s changes real elevations without a universal terrain clamp', (mode, heights, slider, expected) => {
    expect(applyFmsPlaneBrush(heights, slider, mode)).toEqual(expected);
  });

  it('Plane subtraction can go below sea and below zero, unlike the audited Hill branch', () => {
    expect(applyFmsPlaneBrush([20, 0, -3], 60, 'subtract')).toEqual([-40, -60, -63]);
  });

  it.each([
    [0, 20], [50, 60], [100, 100], [150, 140], [-50, -20], [1.9, 21],
  ])('Replace maps slider %s to %s rather than assigning the slider', (slider, expected) => {
    expect(applyFmsPlaneBrush([-100, 0, 99], slider, 'replace')).toEqual([expected, expected, expected]);
  });

  it('normalizes the slider to float32 before integer boundaries and double Replace arithmetic', () => {
    expect(applyFmsPlaneBrush([9], 0.99999999, 'add')).toEqual([10]);
    expect(applyFmsPlaneBrush([9], 0.9999999, 'add')).toEqual([9]);
    expect(applyFmsPlaneBrush([9], -0.99999999, 'add')).toEqual([8]);
    expect(applyFmsPlaneBrush([9], 24.9999999, 'replace')).toEqual([40]);
    expect(applyFmsPlaneBrush([9], 24.999998, 'replace')).toEqual([39]);
  });

  it('truncates negative averages toward zero rather than flooring them', () => {
    expect(applyFmsPlaneBrush([-4, -2, 0], -1.9, 'average')).toEqual([-2, -1, 0]);
    expect(Object.is(applyFmsPlaneBrush([-1], 0, 'average')[0], -0)).toBe(false);
    expect(Object.is(applyFmsPlaneBrush([-0], 0, 'min')[0], -0)).toBe(false);
  });

  it('preserves frozen inputs and returns a new batch even when no heights change', () => {
    const source = Object.freeze([0, 20, 100]);
    const output = applyFmsPlaneBrush(source, 0, 'add');
    expect(output).toEqual(source);
    expect(output).not.toBe(source);
    output[0] = 25;
    expect(source).toEqual([0, 20, 100]);
    const empty = Object.freeze([]);
    expect(applyFmsPlaneBrush(empty, 1, 'add')).toEqual([]);
    expect(applyFmsPlaneBrush(empty, 1, 'add')).not.toBe(empty);
  });

  it.each([NaN, Infinity, -Infinity, Number.MAX_VALUE, -Number.MAX_VALUE])('rejects slider %s that is non-finite in float32', slider => {
    expectBrushError(() => applyFmsPlaneBrush([20], slider, 'add'), 'invalid-slider');
  });

  it.each([NaN, Infinity, -Infinity, 0.5, 2_147_483_648, -2_147_483_649])('rejects invalid old elevation %s before changing the batch', height => {
    const source = Object.freeze([20, height, 30]);
    expectBrushError(() => applyFmsPlaneBrush(source, 10, 'add'), 'invalid-elevation', 1);
    expect(source).toEqual([20, height, 30]);
  });

  it('validates the whole input before computing any possibly overflowing result', () => {
    expectBrushError(() => applyFmsPlaneBrush([2_147_483_647, 0.5], 1, 'add'), 'invalid-elevation', 1);
  });

  it('accepts representable boundaries without wrapping and rejects arithmetic overflow', () => {
    expect(applyFmsPlaneBrush([-2_147_483_648, 2_147_483_647], 0, 'add')).toEqual([-2_147_483_648, 2_147_483_647]);
    expectBrushError(() => applyFmsPlaneBrush([0, 2_147_483_647], 1, 'add'), 'integer-overflow', 1);
    expectBrushError(() => applyFmsPlaneBrush([-2_147_483_648], 1, 'subtract'), 'integer-overflow', 0);
    expectBrushError(() => applyFmsPlaneBrush([2_147_483_647], 1, 'average'), 'integer-overflow', 0);
    // 2^31-1 rounds up to 2^31 as float32, so conversion is outside the recovered domain.
    expectBrushError(() => applyFmsPlaneBrush([0], 2_147_483_647, 'add'), 'integer-overflow');
    expectBrushError(() => applyFmsPlaneBrush([0], 3_000_000_000, 'replace'), 'integer-overflow');
  });

  it.each([0, 100, -50, 3_000_000_000])('Plane Erase sets only the selected elevations to zero regardless of slider %s', slider => {
    const source = Object.freeze([-100, 0, 19, 20, 99, 2_147_483_647]);
    expect(applyFmsPlaneBrush(source, slider, 'erase')).toEqual([0, 0, 0, 0, 0, 0]);
    expect(source).toEqual([-100, 0, 19, 20, 99, 2_147_483_647]);
  });

  it('does not let Erase bypass selected elevation validation', () => {
    expectBrushError(() => applyFmsPlaneBrush([50, NaN], 0, 'erase'), 'invalid-elevation', 1);
  });

  it('refuses unknown Plane modes', () => {
    expectBrushError(() => applyFmsPlaneBrush([50], 0, 'hill' as FmsPlaneBrushMode), 'unsupported-mode');
  });

  it('rejects oversized and sparse batches before allocating a result', () => {
    expectBrushError(() => applyFmsPlaneBrush(new Array(MAX_FMS_PLANE_BRUSH_CELLS + 1), 1, 'add'), 'invalid-batch');
    expectBrushError(() => applyFmsPlaneBrush(new Array(2), 1, 'add'), 'invalid-elevation', 0);
  });
});

describe('the recovered FMS Hill contribution traversal', () => {
  it.each(hillFixtures.cases)('matches independently derived static fixture $id', fixture => {
    const processedCells: number[] = [];
    let randomCalls = 0;
    const graph: Readonly<Record<string, readonly number[] | undefined>> = fixture.input.orderedNeighbors;
    const result = generateFmsHillContributions({
      selectedCells: new Set(fixture.input.selectedCells),
      centerCell: fixture.input.centerCell,
      centerHeight: fixture.input.centerHeight,
      decayFactor: fixture.input.decayFactor,
      orderedNeighbors(cell) {
        processedCells.push(cell);
        return graph[String(cell)] ?? [];
      },
      randomValue: () => fixture.input.randomValues[randomCalls++],
    });
    expect([...result]).toEqual(fixture.expected.heightsInSelectedOrder);
    expect(processedCells).toEqual(fixture.expected.processedCells);
    expect(randomCalls).toBe(fixture.expected.randomCalls);
  });

  function simpleInput(overrides: Partial<FmsHillBrushInput> = {}): FmsHillBrushInput {
    return {
      selectedCells: new Set([0, 1]), centerCell: 0, centerHeight: 80, decayFactor: 1,
      orderedNeighbors: cell => cell === 0 ? [1] : [0], randomValue: () => 0.5,
      ...overrides,
    };
  }

  it('preserves caller selection and frozen adjacency and produces independent contributions', () => {
    const selected = new Set([0, 1, 2]);
    const graph = Object.freeze([Object.freeze([1]), Object.freeze([0, 2]), Object.freeze([1])]);
    const result = generateFmsHillContributions(simpleInput({ selectedCells: selected, orderedNeighbors: cell => graph[cell] }));
    result.set(0, 999);
    expect([...selected]).toEqual([0, 1, 2]);
    expect(graph).toEqual([[1], [0, 2], [1]]);
    expect(result.get(1)).toBe(80);
  });

  it('allows a finite general power adaptation without claiming native pow bit equivalence', () => {
    // sqrt(6400) is 80; the neutral injected multiplier is exactly one here.
    const result = generateFmsHillContributions(simpleInput({ centerHeight: 6400, decayFactor: 0.5 }));
    expect([...result]).toEqual([[0, 6400], [1, 80]]);
  });

  it('rejects invalid selection and center before consuming randomness', () => {
    const randomValue = () => { throw new Error('Must not consume random input'); };
    expectBrushError(() => generateFmsHillContributions(simpleInput({ selectedCells: new Set([0, 0.5]), randomValue })), 'invalid-topology');
    expectBrushError(() => generateFmsHillContributions(simpleInput({ centerCell: -1, randomValue })), 'invalid-topology');
    expectBrushError(() => generateFmsHillContributions(simpleInput({ centerHeight: 0.5, randomValue })), 'invalid-elevation');
    expectBrushError(() => generateFmsHillContributions(simpleInput({ centerHeight: -80, randomValue })), 'invalid-elevation');
  });

  it.each([NaN, Infinity, -Infinity, Number.MAX_VALUE])('rejects nonfinite decay %s in its float32 domain', decayFactor => {
    expectBrushError(() => generateFmsHillContributions(simpleInput({ decayFactor })), 'invalid-decay');
  });

  it.each([NaN, Infinity, -0.001, 1.00000001])('rejects invalid injected random value %s', value => {
    expectBrushError(() => generateFmsHillContributions(simpleInput({ randomValue: () => value })), 'invalid-random');
  });

  it('rejects unsupported nonfinite powers and int32 overflow without wrapping', () => {
    expectBrushError(() => generateFmsHillContributions(simpleInput({ centerHeight: 0, decayFactor: -1 })), 'unsupported-power');
    expectBrushError(() => generateFmsHillContributions(simpleInput({ decayFactor: 100 })), 'unsupported-power');
    expectBrushError(() => generateFmsHillContributions(simpleInput({ centerHeight: 2_147_483_647 })), 'integer-overflow');
  });

  it('bounds topology visits and rejects invalid neighbor IDs', () => {
    expectBrushError(() => generateFmsHillContributions(simpleInput({ orderedNeighbors: () => [NaN] })), 'invalid-topology');
    expectBrushError(() => generateFmsHillContributions(simpleInput({ orderedNeighbors: () => new Array(MAX_FMS_HILL_NEIGHBOR_VISITS + 1) })), 'invalid-topology');
  });
});

describe('the recovered FMS Hill elevation composition', () => {
  it.each([
    ['add', [25, 32, 99]],
    ['subtract', [0, 8, 91]],
    ['min', [-5, 12, 4]],
    ['max', [30, 20, 95]],
    ['average', [12, 16, 49]],
  ] as const)('%s combines the per-cell contributions with old elevations', (mode, expected) => {
    expect(applyFmsHillBrush([-5, 20, 95], [30, 12, 4], mode)).toEqual(expected);
  });

  it('clamps only Hill subtraction to zero while Plane subtraction preserves negative elevations', () => {
    expect(applyFmsHillBrush([5], [10], 'subtract')).toEqual([0]);
    expect(applyFmsPlaneBrush([5], 10, 'subtract')).toEqual([-5]);
    expect(applyFmsHillBrush([-5], [0], 'average')).toEqual([-2]);
  });

  it('forms a local elevation update from recovered generation without modifying source containers', () => {
    const selectedCells = new Set([0, 1, 2]);
    const heights = Object.freeze([10, 20, 30]);
    const contributions = generateFmsHillContributions({
      selectedCells, centerCell: 0, centerHeight: 21, decayFactor: 1,
      orderedNeighbors: cell => cell < 2 ? [cell + 1] : [], randomValue: () => 0,
    });
    const frozenContributions = Object.freeze([...contributions.values()]);
    const result = applyFmsHillBrush(heights, frozenContributions, 'add');
    expect(result).toEqual([31, 40, 30]);
    expect(heights).toEqual([10, 20, 30]);
    expect(frozenContributions).toEqual([21, 20, 0]);
    expect([...selectedCells]).toEqual([0, 1, 2]);
  });

  it('validates the complete batch before arithmetic and rejects mismatches', () => {
    expectBrushError(() => applyFmsHillBrush([1, 2], [1], 'add'), 'invalid-batch');
    expectBrushError(() => applyFmsHillBrush([2_147_483_647, NaN], [1, 0], 'add'), 'invalid-elevation', 1);
    expectBrushError(() => applyFmsHillBrush([2_147_483_647, 0], [1, -1], 'add'), 'invalid-contribution', 1);
    expectBrushError(() => applyFmsHillBrush([0], [Infinity], 'add'), 'invalid-contribution', 0);
    expectBrushError(() => applyFmsHillBrush([0], [0.5], 'add'), 'invalid-contribution', 0);
    expectBrushError(() => applyFmsHillBrush([0], [2_147_483_648], 'add'), 'invalid-contribution', 0);
  });

  it('rejects int32 overflow including subtraction before its zero clamp', () => {
    expectBrushError(() => applyFmsHillBrush([2_147_483_647], [1], 'add'), 'integer-overflow', 0);
    expectBrushError(() => applyFmsHillBrush([2_147_483_647], [1], 'average'), 'integer-overflow', 0);
    expectBrushError(() => applyFmsHillBrush([-2_147_483_648], [1], 'subtract'), 'integer-overflow', 0);
  });

  it.each(['replace', 'erase'] as const)('does not invent a Hill %s implementation', mode => {
    expectBrushError(() => applyFmsHillBrush([50], [20], mode), 'unsupported-mode');
  });
});
