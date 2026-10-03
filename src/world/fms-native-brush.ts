/**
 * The audited arithmetic in the Plane branch of PlayerController.DrawMapHeight.
 * Source: docs/evidence/fms-web-replan-2026-10-04/BRUSH_STATIC_AUDIT.md.
 *
 * This is a bounded numeric adapter, not the original selection, redraw, biome,
 * province or army lifecycle. Overflow is outside the recovered contract and is
 * rejected. No universal elevation clamp has been inferred. Plane Erase ports
 * only the audited SetCellAsSea elevation write, not its entity side effects.
 */
export type FmsPlaneBrushMode = 'add' | 'subtract' | 'min' | 'max' | 'average' | 'replace' | 'erase';

export type FmsNativeBrushErrorCode =
  | 'invalid-batch'
  | 'invalid-elevation'
  | 'invalid-contribution'
  | 'invalid-slider'
  | 'invalid-topology'
  | 'invalid-decay'
  | 'invalid-random'
  | 'unsupported-power'
  | 'unsupported-mode'
  | 'integer-overflow';

export class FmsNativeBrushError extends Error {
  constructor(
    public readonly code: FmsNativeBrushErrorCode,
    message: string,
    public readonly index?: number,
  ) {
    super(message);
    this.name = 'FmsNativeBrushError';
  }
}

// A web adapter allocation limit, not a recovered limit of the original game.
export const MAX_FMS_PLANE_BRUSH_CELLS = 1_000_000;

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

function isInt32(value: number): boolean {
  return Number.isInteger(value) && value >= INT32_MIN && value <= INT32_MAX;
}

function checkedInt32(value: number, index?: number): number {
  if (!isInt32(value)) {
    throw new FmsNativeBrushError('integer-overflow', 'The result is outside the audited signed 32-bit arithmetic domain.', index);
  }
  // Native integer zero has no negative-zero representation.
  return value === 0 ? 0 : value;
}

/**
 * Applies one Plane setting to an explicit list of already selected elevations.
 * Returns an independent array. Every input is checked before any result is
 * calculated, and no partially calculated batch is returned after an error.
 *
 * sliderValue is rounded to Unity's float32 input before truncation or the
 * Replace conversion. Values outside 0..100 are permitted when arithmetic is
 * representable: the audited method contains no common 0..100 clamp.
 */
export function applyFmsPlaneBrush(
  elevations: readonly number[],
  sliderValue: number,
  mode: FmsPlaneBrushMode,
): number[] {
  if (!['add', 'subtract', 'min', 'max', 'average', 'replace', 'erase'].includes(mode)) {
    throw new FmsNativeBrushError('unsupported-mode', `Plane brush mode ${String(mode)} has no recovered numeric implementation.`);
  }
  if (!Array.isArray(elevations) || elevations.length > MAX_FMS_PLANE_BRUSH_CELLS) {
    throw new FmsNativeBrushError('invalid-batch', `Expected at most ${MAX_FMS_PLANE_BRUSH_CELLS} selected elevations.`);
  }
  const slider = Math.fround(sliderValue);
  if (!Number.isFinite(sliderValue) || !Number.isFinite(slider)) {
    throw new FmsNativeBrushError('invalid-slider', 'The slider must be finite both as a number and as float32.');
  }
  for (let index = 0; index < elevations.length; index += 1) {
    if (!isInt32(elevations[index])) {
      throw new FmsNativeBrushError('invalid-elevation', 'Every elevation must be a signed 32-bit integer.', index);
    }
  }

  // Replace promotes the float32 slider to double; the other modes first
  // truncate it to int32. Do not accidentally truncate Replace's input here.
  // SetCellAsSea writes elevation zero regardless of the height slider. Its
  // separate State/Biom writes and the caller's province/army maintenance are
  // intentionally outside this elevation-only batch API.
  // Source: docs/evidence/fms-brush-input-2026-10-04/BRUSH_INPUT_REPORT.md.
  const operand = mode === 'erase' ? 0 : mode === 'replace'
    ? checkedInt32(Math.trunc((slider / 100) * 80 + 20))
    : checkedInt32(Math.trunc(slider));
  return elevations.map((height, index) => {
    switch (mode) {
      case 'add': return checkedInt32(height + operand, index);
      case 'subtract': return checkedInt32(height - operand, index);
      case 'min': return checkedInt32(Math.min(height, operand), index);
      case 'max': return checkedInt32(Math.max(height, operand), index);
      case 'average': {
        const sum = checkedInt32(height + operand, index);
        return checkedInt32(Math.trunc(sum / 2), index);
      }
      case 'replace': return operand;
      case 'erase': return 0;
      default: throw new FmsNativeBrushError('unsupported-mode', 'This brush mode is not implemented.');
    }
  });
}

/**
 * Combines independently generated Hill contributions with old elevations.
 * The five arithmetic branches are recovered; Hill Replace/Erase are not.
 * Contributions must be nonnegative int32 values, the bounded generator domain.
 */
export function applyFmsHillBrush(
  elevations: readonly number[],
  contributions: readonly number[],
  mode: FmsPlaneBrushMode,
): number[] {
  if (!['add', 'subtract', 'min', 'max', 'average'].includes(mode)) {
    throw new FmsNativeBrushError('unsupported-mode', `Hill brush mode ${String(mode)} has no recovered numeric implementation.`);
  }
  if (!Array.isArray(elevations) || !Array.isArray(contributions)
    || elevations.length !== contributions.length || elevations.length > MAX_FMS_HILL_BRUSH_CELLS) {
    throw new FmsNativeBrushError('invalid-batch', `Expected matching batches of at most ${MAX_FMS_HILL_BRUSH_CELLS} elevations and contributions.`);
  }
  for (let index = 0; index < elevations.length; index += 1) {
    if (!isInt32(elevations[index])) {
      throw new FmsNativeBrushError('invalid-elevation', 'Every elevation must be a signed 32-bit integer.', index);
    }
    if (!isInt32(contributions[index]) || contributions[index] < 0) {
      throw new FmsNativeBrushError('invalid-contribution', 'Every contribution must be a nonnegative signed 32-bit integer.', index);
    }
  }
  return elevations.map((height, index) => {
    const contribution = contributions[index];
    switch (mode) {
      case 'add': return checkedInt32(height + contribution, index);
      case 'subtract': return Math.max(0, checkedInt32(height - contribution, index));
      case 'min': return checkedInt32(Math.min(height, contribution), index);
      case 'max': return checkedInt32(Math.max(height, contribution), index);
      case 'average': return checkedInt32(Math.trunc(checkedInt32(height + contribution, index) / 2), index);
      default: throw new FmsNativeBrushError('unsupported-mode', 'This brush mode is not implemented.');
    }
  });
}

export interface FmsHillBrushInput {
  selectedCells: ReadonlySet<number>;
  centerCell: number;
  centerHeight: number;
  decayFactor: number;
  /** Must retain the original list order; sorting changes first-path results. */
  orderedNeighbors: (cell: number) => readonly number[];
  /** Explicit random source; this adapter does not reproduce Unity RNG state. */
  randomValue: () => number;
}

// Browser work limits only. A selected cell can be discovered at most once.
export const MAX_FMS_HILL_BRUSH_CELLS = 1_000_000;
export const MAX_FMS_HILL_NEIGHBOR_VISITS = 8_000_000;

function isCellId(value: number): boolean {
  return isInt32(value) && value >= 0;
}

/**
 * The recovered HeightMapGenerator.GetHeightMap traversal and float32 steps.
 * Returns contributions, not edited elevations; no world entities are updated.
 * Source: docs/evidence/fms-hill-recovery-2026-10-04/hill-static-fixtures.json.
 *
 * Exponents 0 and 1 match the audited power special branches. General exponents
 * use Math.pow rounded to float32: native powf may differ, including at integer
 * thresholds. The fixed fixtures are static derivations, not native executions.
 *
 * Input containers are not mutated. Injected neighbor/random callbacks are
 * invoked in traversal order and should supply stable data; random state belongs
 * to the caller. Validation/work limits are web adapter safeguards, not proof of
 * the native method's behavior for invalid or overflowing inputs.
 */
export function generateFmsHillContributions(input: FmsHillBrushInput): Map<number, number> {
  const { selectedCells, centerCell, centerHeight, orderedNeighbors, randomValue } = input;
  if (!Number.isInteger(selectedCells.size) || selectedCells.size < 0 || selectedCells.size > MAX_FMS_HILL_BRUSH_CELLS) {
    throw new FmsNativeBrushError('invalid-batch', `Expected at most ${MAX_FMS_HILL_BRUSH_CELLS} selected cells.`);
  }
  if (!isCellId(centerCell)) {
    throw new FmsNativeBrushError('invalid-topology', 'The center cell must have a nonnegative signed 32-bit index.');
  }
  for (const cell of selectedCells) {
    if (!isCellId(cell)) {
      throw new FmsNativeBrushError('invalid-topology', 'Selected cell indices must be nonnegative signed 32-bit integers.');
    }
  }
  if (!isInt32(centerHeight) || centerHeight < 0) {
    throw new FmsNativeBrushError('invalid-elevation', 'The center height must be a nonnegative signed 32-bit integer.');
  }
  const decay = Math.fround(input.decayFactor);
  if (!Number.isFinite(input.decayFactor) || !Number.isFinite(decay)) {
    throw new FmsNativeBrushError('invalid-decay', 'Decay must be finite both as a number and as float32.');
  }

  // The original method seeds and visits the center even outside the selection,
  // and does not clamp the center to the neighbor floor of 20.
  const discovered = new Map<number, number>([[centerCell, centerHeight === 0 ? 0 : centerHeight]]);
  const queue = [centerCell];
  let neighborVisits = 0;
  const jitterWidth = Math.fround(0.2);
  const jitterBase = Math.fround(0.9);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    const neighbors = orderedNeighbors(current);
    if (!Array.isArray(neighbors) || neighbors.length > MAX_FMS_HILL_NEIGHBOR_VISITS - neighborVisits) {
      throw new FmsNativeBrushError('invalid-topology', `A brush traversal may inspect at most ${MAX_FMS_HILL_NEIGHBOR_VISITS} neighbor entries.`);
    }
    neighborVisits += neighbors.length;
    for (const neighbor of neighbors) {
      if (!isCellId(neighbor)) {
        throw new FmsNativeBrushError('invalid-topology', 'Neighbor indices must be nonnegative signed 32-bit integers.');
      }
      if (!selectedCells.has(neighbor) || discovered.has(neighbor)) continue;

      const parentHeight = Math.fround(discovered.get(current)!);
      const power = Math.fround(decay === 0 ? 1 : decay === 1 ? parentHeight : Math.pow(parentHeight, decay));
      if (!Number.isFinite(power)) {
        throw new FmsNativeBrushError('unsupported-power', 'The power result is outside the finite recovered numeric domain.');
      }
      const random = randomValue();
      if (!Number.isFinite(random) || random < 0 || random > 1) {
        throw new FmsNativeBrushError('invalid-random', 'The injected random value must be finite and in [0, 1].');
      }
      const factor = Math.fround(Math.fround(Math.fround(random) * jitterWidth) + jitterBase);
      const value = Math.fround(power * factor);
      if (!Number.isFinite(value)) {
        throw new FmsNativeBrushError('integer-overflow', 'The generated contribution is not finite.');
      }
      const height = checkedInt32(Math.trunc(value > 20 ? value : 20));
      discovered.set(neighbor, height);
      if (height > 20) queue.push(neighbor);
    }
  }
  return new Map(Array.from(selectedCells, cell => [cell, discovered.get(cell) ?? 0]));
}
