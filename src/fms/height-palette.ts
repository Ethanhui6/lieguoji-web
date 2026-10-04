/** Display-only recovery of sharedassets0 Shader189 Custom/HeightColorDisplay,
 * _DisplayMode=2. This is the original height view, NOT its biome-colored mode 0.
 * Shader constants and operation order: evidence/ORIGINAL_LAND.md.
 * The browser keeps height as geometry data; switching views never edits a map.
 */
export type FmsTerrainDisplay = 'height' | 'relief' | 'biome';
export const FMS_HEIGHT_PALETTE_CONTRACT = 'recovered-shader189-mode2-v1';
// Exact binary32 constants read from the compiled D3D11 fragment, including
// coefficients that differ by one ULP from rounding their short decimal names.
const low = [.9679999947547913, 1, .9129999876022339] as const;
const lowSlope = [.0008000001544132829, -.007850000634789467, -.010075000114738941] as const;
const high = [1, .6859999895095825, .5099999904632568] as const;
const highSlope = [-.38600003719329834, -.9559999704360962, -1.0199999809265137] as const;
const qScale = .012500000186264515;
const cubic = [.30530601739883423, .682171106338501, .012522878125309944] as const;

/** Unity's recovered shader explicitly uses this cubic sRGB approximation. */
export function recoveredHeightLinear(height: number): [number, number, number] {
  const d = Math.min(100, Math.max(20, height)) - 20;
  const q = d * qScale - .5;
  const color = low.map((_, i) => d <= 40 ? low[i] + lowSlope[i] * d : high[i] + highSlope[i] * q);
  return color.map(c => c * (c * (cubic[0] * c + cubic[1]) + cubic[2])) as [number, number, number];
}

// Linear output from the recovered shader is encoded for Pixi's regular
// display framebuffer. No automatic sRGB framebuffer conversion is assumed.
export const linearToSrgb = (c: number): number => c <= .0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - .055;
export const srgbToLinear = (c: number): number => c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);

export const FMS_COLOR_GLSL = `
vec3 fmsToDisplay(vec3 c){
 return mix(12.92*c,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));
}
vec3 fmsHeightColor(float height){
 float d=clamp(height,20.0,100.0)-20.0;
 vec3 c=d<=40.0?vec3(${low.join(',')})+d*vec3(${lowSlope.join(',')})
                 :vec3(${high.join(',')})+(d*${qScale}-.5)*vec3(${highSlope.join(',')});
 return fmsToDisplay(c*(c*(${cubic[0]}*c+${cubic[1]})+${cubic[2]}));
}`;
