import { recoveredHeightLinear, linearToSrgb, srgbToLinear } from '../height-palette';

/** DisplaySettings#43912 (level0) displayPresets, as serialized Unity Colors
 * (gamma-space values; the Linear project converts them on upload). */
export interface OriginalPreset {
  stateLine: number; shallowSea: number; deepSea: number; coastLine: number; stateName: number;
  darkBorder: boolean; parchmentTexture: boolean; parchment: boolean; heightBackground: boolean; stateMapTransparency: number;
}
const rgb = (r: number, g: number, b: number) => (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
export const ORIGINAL_PRESETS: readonly OriginalPreset[] = [
  { stateLine: 0x1487ff, shallowSea: 0x3c9cff, deepSea: 0x1487ff, coastLine: 0x5f5f5f, stateName: 0x0c0c0c, darkBorder: true, parchmentTexture: true, parchment: true, heightBackground: true, stateMapTransparency: .8 },
  { stateLine: 0x1487ff, shallowSea: 0x3c9cff, deepSea: 0x1487ff, coastLine: 0x5f5f5f, stateName: 0x0c0c0c, darkBorder: false, parchmentTexture: false, parchment: false, heightBackground: true, stateMapTransparency: .8 },
  { stateLine: 0x5e86b0, shallowSea: 0x5e86b0, deepSea: 0x5e86b0, coastLine: 0x5f5f5f, stateName: 0x0c0c0c, darkBorder: false, parchmentTexture: false, parchment: false, heightBackground: true, stateMapTransparency: .8 },
  { stateLine: 0x1487ff, shallowSea: 0x4899ee, deepSea: 0x5881e3, coastLine: 0x5f5f5f, stateName: 0x0c0c0c, darkBorder: false, parchmentTexture: true, parchment: true, heightBackground: true, stateMapTransparency: .9 },
  { stateLine: 0x7da3ff, shallowSea: 0x7da3ff, deepSea: 0x7da3ff, coastLine: rgb(.3882, .4392, 1), stateName: 0x0c0c0c, darkBorder: false, parchmentTexture: false, parchment: false, heightBackground: false, stateMapTransparency: .5 },
  { stateLine: 0x269995, shallowSea: 0x269995, deepSea: 0x269995, coastLine: 0x5f5f5f, stateName: 0x0c0c0c, darkBorder: false, parchmentTexture: false, parchment: false, heightBackground: true, stateMapTransparency: .5 },
  { stateLine: 0xe6dcd3, shallowSea: 0xe6dcd3, deepSea: 0xe6dcd3, coastLine: rgb(.3098, .3098, .3098), stateName: 0x0c0c0c, darkBorder: false, parchmentTexture: false, parchment: false, heightBackground: true, stateMapTransparency: 1 },
  { stateLine: 0xdfdfdf, shallowSea: 0xffffff, deepSea: 0xffffff, coastLine: 0x5f5f5f, stateName: 0x0c0c0c, darkBorder: true, parchmentTexture: true, parchment: true, heightBackground: true, stateMapTransparency: 1 },
];

/** level0 PachmentMaterial → Custom/ParchmentEffect (sharedassets0 Shader#187)
 * with _ParchmentTex = sharedassets0 parchmentfinal2. Its compiled pixel shader:
 * world = camPos + ndc*(size*aspect, size); uv = world/(TilingX,TilingY)+.5;
 * c = m + strength*(p*m*ParchmentColor - m) (or a greyscale variant), then
 * brightness/saturation. Scene values: strength 1, white, brightness 1,
 * saturation 1, greyscale 0, so the frame is multiplied by the parchment. */
export const ORIGINAL_PARCHMENT = { tilingX: 249.3, tilingY: 137.2, strength: 1, worldPerMapUnit: 240 / 1600 } as const;
/** Parchment quad in map units, centered on the 1600x900 map. */
export function originalParchmentRect(width = 1600, height = 900) {
  const w = ORIGINAL_PARCHMENT.tilingX / ORIGINAL_PARCHMENT.worldPerMapUnit, h = ORIGINAL_PARCHMENT.tilingY / ORIGINAL_PARCHMENT.worldPerMapUnit;
  return { x: width / 2 - w / 2, y: height / 2 - h / 2, width: w, height: h };
}

export type OriginalLandMode = 'height-background' | 'height-palette';
/** Shader189 Custom/HeightColorDisplay: vertex alpha = Elevation/100.
 * _DisplayMode 1 (UseHeightMapBackground) outputs gray = 1 - alpha;
 * _DisplayMode 2 (height edit view) outputs the recovered palette. Linear RGB. */
export function originalLandLinear(height: number, mode: OriginalLandMode): [number, number, number] {
  if (mode === 'height-palette') return recoveredHeightLinear(height);
  const gray = Math.fround(1 - Math.fround(Math.min(100, Math.max(0, height)) / 100));
  return [gray, gray, gray];
}

const channels = (color: number) => [(color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255];
/** Shader191 sea: mix(shallow, deep, smoothstep(0, 1, t)) in linear space,
 * t = distance from the smoothed coast band / EdgeIntensity (0..1). */
export function originalSeaSrgb(preset: OriginalPreset, t: number): [number, number, number] {
  const s = channels(preset.shallowSea).map(srgbToLinear), d = channels(preset.deepSea).map(srgbToLinear);
  const k = Math.min(1, Math.max(0, t)), w = k * k * (3 - 2 * k);
  return s.map((v, i) => linearToSrgb(v + (d[i] - v) * w)) as [number, number, number];
}
export const toSrgb = (linear: readonly number[]) => linear.map(linearToSrgb) as [number, number, number];
