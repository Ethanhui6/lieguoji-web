import { chainFmsCoastSegments, fmsSmoothBorderLines } from './coast-curve';
import type { FmsCoastSegment } from './ocean-coast';

/** Recovered state borders (static, read-only, from the user's FMS build):
 * BorderDataProcessor.UpdateStateLine 0x3744E0 extracts every edge between a
 * state's cells and any other owner (sea and the map frame included), joins
 * them with ConnectBorderPoints and smooths them with SmoothBorderLines, i.e.
 * the same CurveBasis(points, 4) as the coastline. StateLineRenderer.
 * SetStateLines 0x4F89A0 strokes each line at stateLineThickness (0.25 world
 * units, z -0.2, below the coastline at z -0.25) in AdjustColor(DeepColor,
 * +0.2 saturation, -0.2 value); MaterialManager.UpdateStateColor 0x3EDEE0
 * sets DeepColor = AdjustColor(color, +0.1, -0.05). The web chains the actual
 * province polygons, not Voronoi cell edges (see fmsStateOutlines). */
export const FMS_STATE_LINE = 'recovered-state-outline-curve-basis-4-v1';
export const FMS_STATE_LINE_WIDTH = Math.fround(0.25) / (240 / 1600);

type Rgb = [number, number, number];

/** DefaultNamespace.ColorUtils.AdjustColor 0x83EDE0 via Unity RGBToHSV and
 * HSVToRGB: saturation and value are each clamped to [0, 1]. */
export function fmsAdjustColor([r, g, b]: Rgb, saturationIncrease: number, valueDecrease: number): Rgb {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) / 6;
    else if (max === g) h = (2 + (b - r) / delta) / 6;
    else h = (4 + (r - g) / delta) / 6;
    if (h < 0) h += 1;
  }
  const s = Math.min(1, Math.max(0, (max > 0 ? delta / max : 0) + saturationIncrease));
  const v = Math.min(1, Math.max(0, max - valueDecrease));
  const sector = h * 6, i = Math.floor(sector) % 6, f = sector - Math.floor(sector);
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  return ([[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]] as Rgb[])[i];
}

export function fmsStateLineColor(color: string): number {
  const value = Number.parseInt(color.replace('#', ''), 16);
  const rgb: Rgb = [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
  const [r, g, b] = fmsAdjustColor(fmsAdjustColor(rgb, .1, .05), .2, .2);
  return Math.round(r * 255) << 16 | Math.round(g * 255) << 8 | Math.round(b * 255);
}

export interface FmsStateRegion { controller: string; polygon: readonly { x: number; y: number }[] }

/** Each owner's border with other owners. The original also outlines coastal
 * cell edges, but there the state line and the coastline come from the same
 * Voronoi edges and SmoothBorderLines, and the coastline (z -0.25) covers it.
 * Web province polygons do not follow the rendered h20 contour, so their
 * coastal edges are left to the coastline ink rather than drawn offshore. An
 * edge is interior when two regions of the same owner share it. Coordinates
 * are divided by `scale` into map units. */
export function fmsStateOutlines(regions: readonly FmsStateRegion[], scale: number): Map<string, [number, number][][]> {
  const edges = new Map<string, { owners: Map<string, number>; segment: FmsCoastSegment }>();
  for (const region of regions) {
    const polygon = region.polygon;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      if (a.x === b.x && a.y === b.y) continue;
      const ka = `${a.x},${a.y}`, kb = `${b.x},${b.y}`, key = ka < kb ? ka + '/' + kb : kb + '/' + ka;
      let edge = edges.get(key);
      if (!edge) edges.set(key, edge = { owners: new Map(), segment: [a.x / scale, a.y / scale, b.x / scale, b.y / scale] });
      edge.owners.set(region.controller, (edge.owners.get(region.controller) ?? 0) + 1);
    }
  }
  const perimeter = new Map<string, FmsCoastSegment[]>();
  for (const { owners, segment } of edges.values()) {
    if (owners.size < 2) continue;
    for (const [owner, count] of owners) {
      if (count !== 1) continue;
      const list = perimeter.get(owner);
      if (list) list.push(segment); else perimeter.set(owner, [segment]);
    }
  }
  return new Map([...perimeter].map(([owner, segments]) => [owner, fmsSmoothBorderLines(chainFmsCoastSegments(segments))]));
}
