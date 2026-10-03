import { assertFmsDocument, FMS_SEA_LEVEL, type FmsDocument } from './model';
import { defaultFmsCatchmentArea, deriveFmsRunoff, FMS_DRAINAGE_ALGORITHM } from './runoff';

export interface FmsDrainageOptions {
  /** Upstream land area in square world units; not cubic metres or rainfall. */
  minCatchment?: number;
}

export interface FmsDrainageStats {
  algorithm: typeof FMS_DRAINAGE_ALGORITHM;
  landArea: number;
  cellCount: number;
  landCells: number;
  seaCells: number;
  connectedComponents: number;
  endorheicBasins: number;
  filledLandCells: number;
  maxLakeDepth: number;
  minCatchment: number;
  riverSegmentCount: number;
  seaDischarge: number;
  endorheicDischarge: number;
  maxAccumulation: number;
}

export interface FmsDrainage {
  /** Adjacent downstream cell; -1 means sea or an explicit closed-basin terminal. */
  receiver: Int32Array;
  /** Local clipped land area. Sea cells contribute zero. Derived, never saved. */
  runoff: Float64Array;
  /** Upstream land area. Float64 avoids repeated float32 accumulation loss. */
  accumulation: Float64Array;
  /** Spill surface used for routing; the original terrain is never raised. */
  filledElevation: Float64Array;
  /** Static filled depth on land, zero on sea. Not a time-dependent water volume. */
  lakeDepth: Float32Array;
  /** Source/receiver cell indices on the document's own adjacency edges. */
  riverSegments: [number, number][];
  stats: FmsDrainageStats;
}

export class FmsHydrologyError extends Error {
  readonly code = 'invalid-options';
  constructor() { super('河流汇水面积阈值须大于0且不超过67108864平方世界单位。'); this.name = 'FmsHydrologyError'; }
}

/** Each cell enters once; (filled elevation, stable cell id) is a total order. */
class FloodHeap {
  private readonly cells: number[] = [];
  constructor(private readonly elevation: Float64Array) {}
  get length(): number { return this.cells.length; }
  private before(a: number, b: number): boolean {
    return this.elevation[a] < this.elevation[b] || (this.elevation[a] === this.elevation[b] && a < b);
  }
  push(cell: number): void {
    let position = this.cells.length;
    this.cells.push(cell);
    while (position > 0) {
      const parent = (position - 1) >> 1;
      if (!this.before(cell, this.cells[parent])) break;
      this.cells[position] = this.cells[parent]; position = parent;
    }
    this.cells[position] = cell;
  }
  pop(): number {
    const first = this.cells[0], last = this.cells.pop()!;
    if (this.cells.length) {
      let position = 0;
      while (position * 2 + 1 < this.cells.length) {
        let child = position * 2 + 1;
        if (child + 1 < this.cells.length && this.before(this.cells[child + 1], this.cells[child])) child += 1;
        if (!this.before(this.cells[child], last)) break;
        this.cells[position] = this.cells[child]; position = child;
      }
      this.cells[position] = last;
    }
    return first;
  }
}

/**
 * Static wet-climate assumption: depressions fill to their lowest spill surface
 * before routing onward. This is a web-derived drainage model, not recovered
 * original-game logic, a rainfall simulation, erosion, or dynamic lake filling.
 *
 * All sea cells are terminals. A graph component with no sea instead drains to
 * its lowest land cell (stable id breaks ties); it never gets an invented ocean
 * outlet. A receiver is an already-popped flood parent, so even a perfectly flat
 * spill surface is a DAG. Reverse pop order conserves clipped land-area runoff.
 *
 * Equal-height ties use cell ids, never neighbor iteration order or randomness.
 * Complexity after validation: O((cells + edges) log cells), O(cells) workspace.
 */
export function deriveFmsDrainage(doc: FmsDocument, options: FmsDrainageOptions = {}): FmsDrainage {
  assertFmsDocument(doc);
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => key !== 'minCatchment')
    || (options.minCatchment !== undefined && (!Number.isFinite(options.minCatchment)
      || options.minCatchment <= 0 || options.minCatchment > 8192 ** 2))) throw new FmsHydrologyError();

  const count = doc.points.length;
  const runoff = deriveFmsRunoff(doc), accumulation = runoff.slice();
  const landArea = runoff.reduce((sum, value) => sum + value, 0);
  const receiver = new Int32Array(count).fill(-1);
  const filledElevation = Float64Array.from(doc.elevations), lakeDepth = new Float32Array(count);
  const visitedComponent = new Uint8Array(count), visitedFlood = new Uint8Array(count);
  const roots: number[] = [];
  let connectedComponents = 0, endorheicBasins = 0, landCells = 0;
  for (let cell = 0; cell < count; cell += 1) {
    if (doc.elevations[cell] >= FMS_SEA_LEVEL) landCells += 1;
    if (visitedComponent[cell]) continue;
    connectedComponents += 1;
    const stack = [cell]; visitedComponent[cell] = 1;
    let lowest = cell, hasSea = false;
    while (stack.length) {
      const current = stack.pop()!;
      if (doc.elevations[current] < FMS_SEA_LEVEL) { roots.push(current); hasSea = true; }
      if (doc.elevations[current] < doc.elevations[lowest]
        || (doc.elevations[current] === doc.elevations[lowest] && current < lowest)) lowest = current;
      for (const neighbor of doc.neighbors[current]) if (!visitedComponent[neighbor]) {
        visitedComponent[neighbor] = 1; stack.push(neighbor);
      }
    }
    if (!hasSea) { roots.push(lowest); endorheicBasins += 1; }
  }

  const heap = new FloodHeap(filledElevation), order = new Uint32Array(count);
  for (const root of roots) { visitedFlood[root] = 1; heap.push(root); }
  let settled = 0;
  while (heap.length) {
    const current = heap.pop(); order[settled++] = current;
    for (const neighbor of doc.neighbors[current]) if (!visitedFlood[neighbor]) {
      visitedFlood[neighbor] = 1;
      receiver[neighbor] = current;
      filledElevation[neighbor] = Math.max(doc.elevations[neighbor], filledElevation[current]);
      heap.push(neighbor);
    }
  }
  // Every component has a root; every receiver precedes its source in this order.
  for (let index = settled - 1; index >= 0; index -= 1) {
    const source = order[index], target = receiver[source];
    if (target !== -1) accumulation[target] += accumulation[source];
  }

  const minCatchment = options.minCatchment ?? defaultFmsCatchmentArea(landArea);
  const riverSegments: [number, number][] = [];
  let filledLandCells = 0, maxLakeDepth = 0, maxAccumulation = 0, seaDischarge = 0, endorheicDischarge = 0;
  for (let cell = 0; cell < count; cell += 1) {
    maxAccumulation = Math.max(maxAccumulation, accumulation[cell]);
    if (doc.elevations[cell] < FMS_SEA_LEVEL) { seaDischarge += accumulation[cell]; continue; }
    lakeDepth[cell] = Math.max(0, filledElevation[cell] - doc.elevations[cell]);
    if (lakeDepth[cell] > 0) { filledLandCells += 1; maxLakeDepth = Math.max(maxLakeDepth, lakeDepth[cell]); }
    if (receiver[cell] === -1) endorheicDischarge += accumulation[cell];
    else if (lakeDepth[cell] <= 0.5 && accumulation[cell] >= minCatchment)
      riverSegments.push([cell, receiver[cell]]);
  }

  return {
    receiver, runoff, accumulation, filledElevation, lakeDepth, riverSegments,
    stats: { algorithm: FMS_DRAINAGE_ALGORITHM, landArea, cellCount: count, landCells, seaCells: count - landCells, connectedComponents, endorheicBasins,
      filledLandCells, maxLakeDepth, minCatchment, riverSegmentCount: riverSegments.length,
      seaDischarge, endorheicDischarge, maxAccumulation },
  };
}
