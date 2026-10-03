import { FIELD_Q, hashAt, noiseQ12 } from '../world/generation/seed';
import { assertFmsDocument, FMS_SEA_LEVEL, type FmsDocument } from './model';
import { fixedFmsCoastVertices } from './coastline';
import { FMS_DEFAULT_COASTAL_WIDTH, fmsCoastalWidthWorld, validFmsNaturalizationOptions, type FmsNaturalizationOptions } from './terrain-options';
export type { FmsNaturalizationOptions } from './terrain-options';

export const FMS_NATURALIZATION_ALGORITHM = 'fms-shape-preserving-relief-v4';
export interface FmsNaturalizationStats {
  algorithm: typeof FMS_NATURALIZATION_ALGORITHM;
  seed: number; strength: number; landCells: number; seaCells: number; changedCells: number;
  coastalWidth: number; coastalWidthWorld: number;
  coastalLandCells: number; landComponents: number; fallbackBoundaryComponents: number;
  minLandHeight: number; maxLandHeight: number; meanLandHeight: number;
  meanCoastHeight: number | null; meanInteriorHeight: number | null;
  maxDistanceToCoast: number; landMaskPreserved: true;
}
export interface FmsNaturalizationResult { elevations: Int32Array; stats: FmsNaturalizationStats }
export class FmsNaturalizationError extends Error {
  constructor(public readonly code: 'invalid-options' | 'invalid-height' | 'no-land', message: string) {
    super(message); this.name = 'FmsNaturalizationError';
  }
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t); };

/** Index heap: at most one entry per cell, with deterministic distance/id ties. */
class DistanceQueue {
  private heap: number[] = [];
  private positions: Int32Array;
  constructor(private readonly distances: Float64Array) {
    this.positions = new Int32Array(distances.length); this.positions.fill(-1);
  }
  private before(a: number, b: number): boolean { return this.distances[a] < this.distances[b] || (this.distances[a] === this.distances[b] && a < b); }
  private swap(a: number, b: number): void {
    [this.heap[a], this.heap[b]] = [this.heap[b], this.heap[a]];
    this.positions[this.heap[a]] = a; this.positions[this.heap[b]] = b;
  }
  pushOrDecrease(cell: number): void {
    let at = this.positions[cell];
    if (at < 0) { at = this.heap.length; this.heap.push(cell); this.positions[cell] = at; }
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!this.before(this.heap[at], this.heap[parent])) break;
      this.swap(at, parent); at = parent;
    }
  }
  pop(): number | undefined {
    if (!this.heap.length) return undefined;
    const result = this.heap[0], last = this.heap.pop()!;
    this.positions[result] = -1;
    if (this.heap.length) {
      this.heap[0] = last; this.positions[last] = 0;
      let at = 0;
      while (at * 2 + 1 < this.heap.length) {
        const left = at * 2 + 1, right = left + 1;
        const next = right < this.heap.length && this.before(this.heap[right], this.heap[left]) ? right : left;
        if (!this.before(this.heap[next], this.heap[at])) break;
        this.swap(at, next); at = next;
      }
    }
    return result;
  }
}

function coastDistances(doc: FmsDocument, land: Uint8Array) {
  const count = land.length, distances = new Float64Array(count); distances.fill(Infinity);
  const coast = new Uint8Array(count), seen = new Uint8Array(count), queue = new DistanceQueue(distances);
  let components = 0, fallbackBoundaryComponents = 0;
  const edgeLength = (a: number, b: number) => Math.hypot(doc.points[a][0] - doc.points[b][0], doc.points[a][1] - doc.points[b][1]);
  for (let cell = 0; cell < count; cell += 1) {
    if (!land[cell]) continue;
    for (const neighbor of doc.neighbors[cell]) if (!land[neighbor]) {
      coast[cell] = 1;
      // The midpoint estimates this classified edge's coastline. It depends
      // only on geometry/membership, so repeating a full-strength seed cannot
      // drift as heights change. This graph metric is not the interpolated
      // renderer's exact sea-level line or an exact Euclidean transform.
      distances[cell] = Math.min(distances[cell], edgeLength(cell, neighbor) * 0.5);
    }
    if (coast[cell]) queue.pushOrDecrease(cell);
  }
  for (let start = 0; start < count; start += 1) {
    if (!land[start] || seen[start]) continue;
    const component = [start]; seen[start] = 1; components += 1;
    let hasCoast = false, boundaryDistance = Infinity;
    for (let head = 0; head < component.length; head += 1) {
      const cell = component[head], [x, y] = doc.points[cell];
      hasCoast ||= coast[cell] === 1;
      boundaryDistance = Math.min(boundaryDistance, x, y, doc.width - x, doc.height - y);
      for (const neighbor of doc.neighbors[cell]) if (land[neighbor] && !seen[neighbor]) { seen[neighbor] = 1; component.push(neighbor); }
    }
    // A fully land-covered component has no sea to measure from. Use its sites
    // nearest the map boundary as explicit distance anchors, without creating sea.
    if (!hasCoast) {
      fallbackBoundaryComponents += 1;
      for (const cell of component) {
        const [x, y] = doc.points[cell], distance = Math.min(x, y, doc.width - x, doc.height - y);
        if (distance === boundaryDistance) { distances[cell] = 0; queue.pushOrDecrease(cell); }
      }
    }
  }
  const settled = new Uint8Array(count);
  for (let cell = queue.pop(); cell !== undefined; cell = queue.pop()) {
    settled[cell] = 1;
    for (const neighbor of doc.neighbors[cell]) {
      if (!land[neighbor] || settled[neighbor]) continue;
      const candidate = distances[cell] + edgeLength(cell, neighbor);
      if (candidate < distances[neighbor]) { distances[neighbor] = candidate; queue.pushOrDecrease(neighbor); }
    }
  }
  return { distances, coast, components, fallbackBoundaryComponents };
}

/**
 * Deterministic web relief adaptation, not recovered FMS terrain equivalence.
 * Changes real elevations while preserving every sample's sea/land membership.
 * Sea samples remain byte-for-byte unchanged. Mountain ranges use correlated,
 * domain-warped fields and a coast-distance envelope, never per-cell colors.
 *
 * Mixed sea/land triangles and exact sea-level vertices retain their original
 * heights, preserving the renderer's linear sea-level contour and land area.
 * No coastline displacement is allowed by this generation mode. Lighting and
 * derived water may change; the coastline contract is not pixel-color equality.
 */
export function naturalizeFmsTerrain(doc: FmsDocument, options: FmsNaturalizationOptions): FmsNaturalizationResult {
  if (!validFmsNaturalizationOptions(options)) {
    throw new FmsNaturalizationError('invalid-options', '自然化参数无效：种子须为32位非负整数，强度须在0至1之间，沿海低地宽度须为地图短边的1%至20%。');
  }
  assertFmsDocument(doc);
  const { seed, strength } = options, coastalWidth = options.coastalWidth ?? FMS_DEFAULT_COASTAL_WIDTH, land = new Uint8Array(doc.points.length);
  let landCells = 0;
  for (let cell = 0; cell < doc.elevations.length; cell += 1) {
    const height = doc.elevations[cell];
    if (height < 0 || height > 100) throw new FmsNaturalizationError('invalid-height', '当前高程超出0至100范围，未修改地图；请先检查绘图数据。');
    if (height >= FMS_SEA_LEVEL) { land[cell] = 1; landCells += 1; }
  }
  if (landCells === 0) throw new FmsNaturalizationError('no-land', '请先绘制一块陆地，再生成自然地形。');
  const { distances, coast, components, fallbackBoundaryComponents } = coastDistances(doc, land);
  const coastLocks = fixedFmsCoastVertices(doc);
  const elevations = doc.elevations.slice();
  const scale = Math.min(doc.width, doc.height), spacing = Math.sqrt(doc.width * doc.height / doc.points.length);
  const coastWidth = fmsCoastalWidthWorld(doc.width, doc.height, doc.points.length, coastalWidth), wavelength = Math.max(scale * 0.2, spacing * 5);
  // Fixed Q12 lattice interpolation reuses the project's deterministic numeric
  // helper only. It does not call the old world-generation/simulation engine.
  const field = (tag: number, x: number, y: number, wave: number) => noiseQ12(seed, tag, Math.round(x * 256), Math.round(y * 256), Math.max(1, Math.round(wave * 256))) / FIELD_Q;
  const direction = hashAt(seed, 101, 0, 0) % 8;
  const axes: readonly (readonly [number, number])[] = [[1, 0], [0.8, 0.6], [0, 1], [-0.6, 0.8], [-1, 0], [-0.8, -0.6], [0, -1], [0.6, -0.8]];
  const [cos, sin] = axes[direction];
  let changedCells = 0, coastalLandCells = 0, minLandHeight = 100, maxLandHeight = 20;
  let landSum = 0, coastSum = 0, interiorSum = 0, maxDistanceToCoast = 0;
  for (let cell = 0; cell < land.length; cell += 1) {
    if (!land[cell]) continue;
    const [x, y] = doc.points[cell], distance = distances[cell];
    if (strength > 0 && !coastLocks[cell] && !doc.terrainLocks?.[cell]) {
      const warpX = x + field(11, x, y, wavelength * 2.1) * wavelength * 0.42;
      const warpY = y + field(17, x, y, wavelength * 2.1) * wavelength * 0.42;
      const u = warpX * cos - warpY * sin, v = warpX * sin + warpY * cos;
      const broad = 0.5 + 0.5 * (0.7 * field(23, x, y, wavelength * 2.4) + 0.3 * field(29, x, y, wavelength * 1.2));
      // Anisotropic coherent ridges make chains; domain warping prevents a set
      // of straight lattice-aligned mountain stripes.
      const ridge = 1 - Math.abs(field(31, u * 0.62, v * 1.6, wavelength));
      const tributaryRidge = 1 - Math.abs(field(37, u * 0.8, v * 1.4, wavelength * 0.48));
      const rangeCoverage = smooth((broad - 0.22) / 0.48);
      const mountain = (0.78 * ridge ** 4 + 0.22 * tributaryRidge ** 3) * rangeCoverage;
      const foothills = 0.5 + 0.5 * (0.65 * field(41, warpX, warpY, wavelength * 0.45) + 0.35 * field(43, warpX, warpY, wavelength * 0.21));
      const coastEnvelope = smooth(distance / coastWidth), inlandRise = smooth(distance / Math.max(spacing * 3, scale * 0.2));
      const candidate = Math.max(FMS_SEA_LEVEL, Math.min(100, Math.round(22 + coastEnvelope * (8 + 12 * broad + 50 * mountain + 18 * inlandRise + 6 * foothills))));
      elevations[cell] = Math.max(FMS_SEA_LEVEL, Math.min(100, Math.round(doc.elevations[cell] * (1 - strength) + candidate * strength)));
    }
    const height = elevations[cell];
    changedCells += height !== doc.elevations[cell] ? 1 : 0;
    minLandHeight = Math.min(minLandHeight, height); maxLandHeight = Math.max(maxLandHeight, height);
    maxDistanceToCoast = Math.max(maxDistanceToCoast, distance); landSum += height;
    if (coast[cell]) { coastalLandCells += 1; coastSum += height; } else interiorSum += height;
  }
  return { elevations, stats: {
    algorithm: FMS_NATURALIZATION_ALGORITHM, seed, strength, coastalWidth, coastalWidthWorld: coastWidth, landCells, seaCells: land.length - landCells, changedCells,
    coastalLandCells, landComponents: components, fallbackBoundaryComponents,
    minLandHeight, maxLandHeight, meanLandHeight: landSum / landCells,
    meanCoastHeight: coastalLandCells ? coastSum / coastalLandCells : null,
    meanInteriorHeight: landCells > coastalLandCells ? interiorSum / (landCells - coastalLandCells) : null,
    maxDistanceToCoast, landMaskPreserved: true,
  } };
}
