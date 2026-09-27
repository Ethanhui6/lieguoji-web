/** Physical-height palette. Between these anchors colour is continuous; there
 * is no random colour, political ownership or camera-dependent shading. */
const sea: readonly (readonly [number, number])[] = [[-12000, 0x10283f], [-5000, 0x12354d], [-2000, 0x1b5269], [-600, 0x28798d], [-100, 0x4c97a8], [-1, 0x79bac0]];
const land: readonly (readonly [number, number])[] = [[0, 0xb2b585], [300, 0x87a76c], [650, 0x8ba370], [1200, 0x68815a], [2400, 0x86806f], [4200, 0xbeb9a9], [6000, 0xe5e5dc], [12000, 0xf5f4ef]];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function atlasElevationColor(meters: number): number {
  const anchors = meters < 0 ? sea : land;
  if (meters <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [height, color] = anchors[i], [previousHeight, previousColor] = anchors[i - 1];
    if (meters > height) continue;
    const t = (meters - previousHeight) / (height - previousHeight);
    return [16, 8, 0].reduce((value, shift) => value | Math.round(((previousColor >> shift) & 255) * (1 - t) + ((color >> shift) & 255) * t) << shift, 0);
  }
  return anchors[anchors.length - 1][1];
}

/** A fixed north-west light reveals the real four-neighbour slope. Bounded
 * contrast preserves depth/height legibility, including at sharp cliffs. The
 * world edge uses the centre height, never fabricated land or sea. */
export function atlasTerrainColor(meters: number, west: number, east: number, north: number, south: number, step: number): number {
  const base = atlasElevationColor(meters);
  const slope = Math.atan((east - west + south - north) / Math.max(160, step * 16)) / (Math.PI / 2);
  const light = 1 + clamp(slope * .13, -.13, .13);
  return [16, 8, 0].reduce((value, shift) => value | clamp(Math.round(((base >> shift) & 255) * light), 0, 255) << shift, 0);
}
