import type { FmsCoastSegment } from './ocean-coast';

/** Recovered from the user's FantasyMapSimulator GameAssembly.dll (static,
 * read-only): MathUtility.Basis 0x3EE280, CurveBasis 0x3EEBD0,
 * CurveBasisClosed 0x3EE750 and BorderCalculationHelper.SmoothBorderLines
 * 0x3655F0, which calls CurveBasis(points, 4). Float32 arithmetic mirrors the
 * compiled SSE order. The chained input below is a web bridge: it uses the
 * rendered h20 triangle contour instead of the original Voronoi coast edges. */
export const FMS_COAST_CURVE = 'recovered-curve-basis-4-v1';
export const FMS_COAST_CURVE_SEGMENTS = 4;
/** StateLineRenderer#31729 coastLineThickness 0.25 world units (Shapes Polyline
 * thicknessSpace Meters, round joins). World.Start → SetResolution(1600, 900)
 * scales the map quad to 240 world units, i.e. 0.15 world units per map unit. */
export const FMS_COAST_LINE_WIDTH = Math.fround(0.25) / (240 / 1600);
/** DisplaySettings#43912 parchment presets 0/3/7 coastLineColor (0.3725 gray). */
export const FMS_COAST_LINE_COLOR = 0x5f5f5f;

export type FmsCurvePoint = readonly [number, number];
const f = Math.fround;

export function fmsBasis(t: number): [number, number, number, number] {
  t = f(t);
  const t2 = f(t * t), t3 = f(t2 * t);
  return [
    f(f(f(f(1 - f(t * 3)) + f(t2 * 3)) - t3) / 6),
    f(f(f(4 - f(t2 * 6)) + f(t3 * 3)) / 6),
    f(f(f(f(f(t * 3) + 1) + f(t2 * 3)) - f(t3 * 3)) / 6),
    f(t3 / 6),
  ];
}

const mix = (p0: FmsCurvePoint, p1: FmsCurvePoint, p2: FmsCurvePoint, p3: FmsCurvePoint, b: number[]): [number, number] => [
  f(f(f(f(p1[0] * b[1]) + f(p0[0] * b[0])) + f(p2[0] * b[2])) + f(p3[0] * b[3])),
  f(f(f(f(p1[1] * b[1]) + f(p0[1] * b[0])) + f(p2[1] * b[2])) + f(p3[1] * b[3])),
];

export function fmsCurveBasisClosed(points: readonly FmsCurvePoint[], segments: number): [number, number][] {
  const result: [number, number][] = [], n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(n - 1 + i) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let j = 0; j <= segments; j++) {
      const point = mix(p0, p1, p2, p3, fmsBasis(f(j) / f(segments))), last = result[result.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) result.push(point);
    }
  }
  if (result.length && (result[0][0] !== result[result.length - 1][0] || result[0][1] !== result[result.length - 1][1])) result.push([result[0][0], result[0][1]]);
  return result;
}

export function fmsCurveBasis(points: readonly FmsCurvePoint[], segments: number): [number, number][] {
  const n = points.length;
  if (n >= 2 && Math.abs(f(points[0][0] - points[n - 1][0])) < f(.001) && Math.abs(f(points[0][1] - points[n - 1][1])) < f(.001)) {
    return fmsCurveBasisClosed(points, segments);
  }
  const result: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i], p1 = points[i], p2 = points[i + 1], p3 = i < n - 2 ? points[i + 2] : points[i + 1];
    for (let j = i !== 0 ? 1 : 0; j <= segments; j++) result.push(mix(p0, p1, p2, p3, fmsBasis(f(j) / f(segments))));
  }
  return result;
}

/** SmoothBorderLines keeps both ends and drops an interior sample within 0.001
 * of its predecessor on every axis (Vector3Extensions.NearlyEqual). */
export function fmsSmoothBorderLines(lines: readonly (readonly FmsCurvePoint[])[]): [number, number][][] {
  return lines.map(line => {
    const curve = fmsCurveBasis(line.map(p => [f(p[0]), f(p[1])] as const), FMS_COAST_CURVE_SEGMENTS), kept: [number, number][] = [];
    curve.forEach((point, i) => {
      const previous = curve[i - 1];
      if (i === 0 || i === curve.length - 1 || Math.abs(point[0] - previous[0]) >= .001 || Math.abs(point[1] - previous[1]) >= .001) kept.push(point);
    });
    return kept;
  });
}

/** Web bridge for ExtendCoastLine: join contour segments sharing exact
 * canonical endpoints into maximal chains; a loop repeats its first point. */
export function chainFmsCoastSegments(segments: readonly FmsCoastSegment[]): FmsCurvePoint[][] {
  const key = (x: number, y: number) => `${x},${y}`, ends = new Map<string, number[]>(), used = new Uint8Array(segments.length);
  segments.forEach(([ax, ay, bx, by], i) => {
    for (const k of [key(ax, ay), key(bx, by)]) { const list = ends.get(k); if (list) list.push(i); else ends.set(k, [i]); }
  });
  const next = (x: number, y: number): number => (ends.get(key(x, y)) ?? []).find(i => !used[i]) ?? -1;
  const extend = (line: FmsCurvePoint[]) => {
    for (let at = line[line.length - 1], i = next(at[0], at[1]); i !== -1; at = line[line.length - 1], i = next(at[0], at[1])) {
      used[i] = 1; const [ax, ay, bx, by] = segments[i];
      line.push(ax === at[0] && ay === at[1] ? [bx, by] : [ax, ay]);
    }
  };
  const chains: FmsCurvePoint[][] = [];
  // Start open chains at a degree-one end so each is walked once from its tip.
  const order = segments.map((_, i) => i).sort((a, b) => {
    const tip = (i: number) => Number((ends.get(key(segments[i][0], segments[i][1]))?.length ?? 0) !== 1 && (ends.get(key(segments[i][2], segments[i][3]))?.length ?? 0) !== 1);
    return tip(a) - tip(b) || a - b;
  });
  for (const start of order) {
    if (used[start]) continue;
    used[start] = 1;
    let [ax, ay, bx, by] = segments[start];
    if ((ends.get(key(bx, by))?.length ?? 0) === 1) [ax, ay, bx, by] = [bx, by, ax, ay];
    const line: FmsCurvePoint[] = [[ax, ay], [bx, by]];
    extend(line);
    if (line[0][0] !== line[line.length - 1][0] || line[0][1] !== line[line.length - 1][1]) {
      const head: FmsCurvePoint[] = [line[0]];
      extend(head);
      if (head.length > 1) line.unshift(...head.slice(1).reverse());
    }
    chains.push(line);
  }
  return chains;
}

export interface FmsCoastCurves { lines: [number, number][][]; chains: number; sourceSegments: number; points: number }

export function deriveFmsCoastCurves(segments: readonly FmsCoastSegment[]): FmsCoastCurves {
  const chains = chainFmsCoastSegments(segments), lines = fmsSmoothBorderLines(chains);
  return { lines, chains: chains.length, sourceSegments: segments.length, points: lines.reduce((sum, line) => sum + line.length, 0) };
}
