import { GlProgram, Shader, UniformGroup, type TextureSource } from 'pixi.js';
import { detailTerrainPageLayout, detailTerrainSourceLedger } from './detail-terrain-pages';
import { TERRAIN_LUT_WIDTH, TERRAIN_LUT_HEIGHT, TERRAIN_LUT_PIXELS } from './terrain-mesh';

export const DETAIL_TERRAIN_SHADER_VERSION = 'final-q8-pieces-gl2-v1';
export interface DetailTerrainGlCapabilities {
  webGL2: boolean; contextLost: boolean; maxTextureSize: number; fragmentTextureUnits: number;
  fragmentFloatPrecision: number; fragmentIntRangeMin: number; fragmentIntRangeMax: number;
}
export function readDetailTerrainGlCapabilities(gl: WebGLRenderingContext | WebGL2RenderingContext): DetailTerrainGlCapabilities {
  const floats = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT), integers = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_INT);
  return { webGL2: /^WebGL 2\.0\b/.test(String(gl.getParameter(gl.VERSION))) && 'texStorage2D' in gl,
    contextLost: gl.isContextLost(), maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)), fragmentTextureUnits: Number(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)),
    fragmentFloatPrecision: floats?.precision ?? 0, fragmentIntRangeMin: integers?.rangeMin ?? 0, fragmentIntRangeMax: integers?.rangeMax ?? 0 };
}
export function assertDetailTerrainGlCapabilities(capabilities: DetailTerrainGlCapabilities): void {
  if (!capabilities.webGL2 || capabilities.contextLost || !Number.isFinite(capabilities.maxTextureSize) || capabilities.maxTextureSize < Math.max(1024, TERRAIN_LUT_WIDTH)
    || !Number.isFinite(capabilities.fragmentTextureUnits) || capabilities.fragmentTextureUnits < 7
    || !Number.isFinite(capabilities.fragmentFloatPrecision) || capabilities.fragmentFloatPrecision < 23
    // The largest integer intermediate is 33,618,942 (<2^26). Query HIGH_INT
    // capacity rather than assuming every driver reports its signed range alike.
    || !Number.isFinite(capabilities.fragmentIntRangeMin) || capabilities.fragmentIntRangeMin < 26
    || !Number.isFinite(capabilities.fragmentIntRangeMax) || capabilities.fragmentIntRangeMax < 26) throw new Error('当前图形后端不能准确显示 v4 细地表：需要有效 WebGL2、highp 整数/浮点与七个纹理采样器。旧地表不能替代此世界。');
}

/** Mesh aPosition is local world units. The caller places that Mesh at exactly
 * originQ/256 in world space and uses the regular Pixi render-target transform.
 * Keep positions local so fine-cell cross products never use million-unit Q8. */
export const DETAIL_TERRAIN_VERTEX = `#version 300 es
precision highp float;
precision highp int;
in vec2 aPosition;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out highp vec2 vDetailPositionQ;
void main() {
  vDetailPositionQ = aPosition * 256.0;
  vec3 clipPosition = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
  gl_Position = vec4(clipPosition.xy, 0.0, 1.0);
}
`;

/** No coverage filtering: texelFetch returns the four genuine fine nodes.
 * This is the same clip/fan order as detail-coast-geometry, including land's
 * priority on zero-area source edges. GPU numerical parity remains a required
 * real-browser test; exporting this source is not evidence of GPU execution. */
export const DETAIL_TERRAIN_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in highp vec2 vDetailPositionQ;
uniform ivec2 uDetailOriginCell;
uniform ivec2 uDetailOriginOffsetQ;
uniform int uDetailDiagnostic;
uniform sampler2D uDetailPage0;
uniform sampler2D uDetailPage1;
uniform sampler2D uDetailPage2;
uniform sampler2D uDetailPage3;
uniform sampler2D uDetailPage4;
uniform sampler2D uDetailLandLut;
uniform sampler2D uDetailSeaLut;
out vec4 finalColor;

struct FineVertex { ivec2 q; int coverage; int height; };
vec4 fetchPage(int page, ivec2 address) {
  if (page == 0) return texelFetch(uDetailPage0, address, 0);
  if (page == 1) return texelFetch(uDetailPage1, address, 0);
  if (page == 2) return texelFetch(uDetailPage2, address, 0);
  if (page == 3) return texelFetch(uDetailPage3, address, 0);
  return texelFetch(uDetailPage4, address, 0);
}
int signed16(int lo, int hi) {
  int word = lo + hi * 256;
  return word >= 32768 ? word - 65536 : word;
}
FineVertex nodeAt(ivec2 node, ivec2 localQ) {
  int index = node.y * 2049 + node.x;
  int page = index / 1048576;
  int texel = index - page * 1048576;
  ivec4 bytes = ivec4(floor(fetchPage(page, ivec2(texel % 1024, texel / 1024)) * 255.0 + 0.5));
  return FineVertex(localQ, signed16(bytes.r, bytes.g), signed16(bytes.b, bytes.a));
}
int areaQ(ivec2 a, ivec2 b, ivec2 c) {
  ivec2 ab = b - a, ac = c - a;
  return ab.x * ac.y - ab.y * ac.x;
}
float crossAt(vec2 a, vec2 b, vec2 c) {
  vec2 ab = b - a, ac = c - a;
  return ab.x * ac.y - ab.y * ac.x;
}
FineVertex crossing(FineVertex a, FineVertex b) {
  if (a.coverage == 0) return a;
  if (b.coverage == 0) return b;
  if (a.q.x > b.q.x || (a.q.x == b.q.x && a.q.y > b.q.y)) {
    FineVertex temporary = a; a = b; b = temporary;
  }
  ivec2 difference = b.q - a.q;
  int numerator = 512 * abs(a.coverage), denominator = abs(a.coverage - b.coverage);
  // Max numerator expression is 33,618,942: signed highp int is exact.
  // Both operands are positive, so integer division equals CPU floor.
  int offset = clamp((2 * numerator + denominator) / (2 * denominator), 1, 511);
  return FineVertex(a.q + sign(difference) * offset, 0, 0);
}
bool inside(FineVertex vertex, bool land) { return land ? vertex.coverage >= 0 : vertex.coverage <= 0; }
int clipped(FineVertex triangle[3], bool land, out FineVertex polygon[6]) {
  FineVertex raw[6]; int count = 0;
  for (int edge = 0; edge < 3; edge++) {
    FineVertex a = triangle[edge], b = triangle[(edge + 1) % 3];
    bool aInside = inside(a, land), bInside = inside(b, land);
    if (aInside) { raw[count] = a; count++; }
    if (aInside != bInside) { raw[count] = crossing(a, b); count++; }
  }
  int kept = 0;
  for (int index = 0; index < 6; index++) {
    if (index >= count) break;
    // Keep the first member of an adjacent run, matching the CPU polygon fan.
    if (any(notEqual(raw[index].q, raw[(index + count - 1) % count].q))) { polygon[kept] = raw[index]; kept++; }
  }
  return kept;
}
bool triangleHit(FineVertex a, FineVertex b, FineVertex c, vec2 target, out float height) {
  int area = areaQ(a.q, b.q, c.q);
  if (area <= 0) return false;
  vec2 aq = vec2(a.q), bq = vec2(b.q), cq = vec2(c.q);
  if (crossAt(aq, bq, target) < 0.0 || crossAt(bq, cq, target) < 0.0 || crossAt(cq, aq, target) < 0.0) return false;
  height = (crossAt(target, bq, cq) * float(a.height) + crossAt(aq, target, cq) * float(b.height) + crossAt(aq, bq, target) * float(c.height)) / float(area);
  return true;
}
bool pieceHit(FineVertex triangle[3], bool land, vec2 target, out float height) {
  bool allLand = triangle[0].coverage >= 0 && triangle[1].coverage >= 0 && triangle[2].coverage >= 0;
  // The all-zero source triangle is entirely land and emits no sea piece.
  if (allLand) return land && triangleHit(triangle[0], triangle[1], triangle[2], target, height);
  FineVertex polygon[6]; int count = clipped(triangle, land, polygon);
  for (int index = 1; index < 5; index++) {
    if (index + 1 >= count) break;
    if (triangleHit(polygon[0], polygon[index], polygon[index + 1], target, height)) return true;
  }
  return false;
}
bool zeroHit(FineVertex triangle[3], vec2 target) {
  for (int edge = 0; edge < 3; edge++) {
    FineVertex a = triangle[edge], b = triangle[(edge + 1) % 3];
    if (a.coverage == 0 && all(equal(vec2(a.q), target))) return true;
    if (a.coverage == 0 && b.coverage == 0 && crossAt(vec2(a.q), vec2(b.q), target) == 0.0
      && all(greaterThanEqual(target, vec2(min(a.q, b.q)))) && all(lessThanEqual(target, vec2(max(a.q, b.q))))) return true;
  }
  return false;
}
void writeResult(bool land, float height) {
  if (uDetailDiagnostic == 1) {
    // RGB24: bit 23 is land; lower 23 bits encode (metres+12000)*256.
    // Alpha is always opaque so ordinary premultiplied-alpha output preserves
    // diagnostic bytes. Targets still require no MSAA and unfiltered readback.
    uint value = uint(clamp(floor((height + 12000.0) * 256.0 + 0.5), 0.0, 6144000.0));
    if (land) value |= 8388608u;
    finalColor = vec4(float(value & 255u), float((value >> 8u) & 255u), float((value >> 16u) & 255u), 255.0) / 255.0;
    return;
  }
  float normalized = clamp((height + (land ? 0.0 : 12000.0)) / 12000.0, 0.0, 1.0);
  // Exactly the existing physical-height palette at light=1; no invented noise.
  vec2 uv = vec2((0.5 + normalized * 1200.0) / 1201.0, 0.5);
  finalColor = land ? texture(uDetailLandLut, uv) : texture(uDetailSeaLut, uv);
}
void main() {
  vec2 relativeQ = vDetailPositionQ + vec2(uDetailOriginOffsetQ);
  ivec2 relativeCell = ivec2(floor(relativeQ / 512.0));
  ivec2 cell = uDetailOriginCell + relativeCell;
  vec2 target = relativeQ - vec2(relativeCell) * 512.0;
  if (any(lessThan(cell, ivec2(0))) || any(greaterThan(cell, ivec2(2048)))
    || (cell.x == 2048 && target.x != 0.0) || (cell.y == 2048 && target.y != 0.0)) { finalColor = vec4(0.0); return; }
  // The exact east/south world boundary belongs to the last real fine cell.
  if (cell.x == 2048) { cell.x = 2047; target.x = 512.0; }
  if (cell.y == 2048) { cell.y = 2047; target.y = 512.0; }
  FineVertex nw = nodeAt(cell, ivec2(0, 0)), ne = nodeAt(cell + ivec2(1, 0), ivec2(512, 0));
  FineVertex se = nodeAt(cell + ivec2(1, 1), ivec2(512, 512)), sw = nodeAt(cell + ivec2(0, 1), ivec2(0, 512));
  FineVertex upper[3] = FineVertex[3](nw, ne, se);
  FineVertex lower[3] = FineVertex[3](nw, se, sw);
  float height = 0.0;
  // Match CPU's complete land pass, zero-edge pass, then complete sea pass.
  if (pieceHit(upper, true, target, height) || pieceHit(lower, true, target, height)) { writeResult(true, height); return; }
  if (zeroHit(upper, target) || zeroHit(lower, target)) { writeResult(true, 0.0); return; }
  if (pieceHit(upper, false, target, height) || pieceHit(lower, false, target, height)) { writeResult(false, height); return; }
  // Uncovered output is explicitly invalid, never an invented sea fallback.
  finalColor = vec4(0.0);
}
`;

export interface DetailTerrainShaderOptions {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  /** Borrowed, complete sources already reserved by the atlas texture ledger. */
  pages: readonly TextureSource[];
  landLut: TextureSource; seaLut: TextureSource;
  originQ: { xQ: number; yQ: number };
  diagnostic?: boolean;
}
function validateSources(options: DetailTerrainShaderOptions): void {
  if (options.pages.length !== 5 || new Set(options.pages).size !== 5) throw new Error('细地形需要五个独立完整节点页。');
  if (options.landLut === options.seaLut) throw new Error('细地形海陆必须使用各自的真实高程 LUT。');
  for (let page = 0; page < 5; page++) {
    const source = options.pages[page], layout = detailTerrainPageLayout(page);
    if (source.destroyed || source.pixelWidth !== layout.width || source.pixelHeight !== layout.height || source.format !== 'rgba8unorm' || source.alphaMode !== 'no-premultiply-alpha'
      || source.autoGenerateMipmaps || source.mipLevelCount !== 1 || source.style.minFilter !== 'nearest' || source.style.magFilter !== 'nearest') throw new Error('细地形节点页必须符合实际布局并使用无颜色变换的 nearest RGBA8 数据源。');
  }
  for (const source of [options.landLut, options.seaLut]) {
    if (source.destroyed || source.pixelWidth !== TERRAIN_LUT_WIDTH || source.pixelHeight !== TERRAIN_LUT_HEIGHT || source.format !== 'rgba8unorm' || source.alphaMode !== 'no-premultiply-alpha'
      || source.autoGenerateMipmaps || source.mipLevelCount !== 1) throw new Error('细地形材质必须使用已核算的真实高程 LUT。');
  }
}
/** No texture, page buffer or geometry allocation occurs here. The caller owns
 * every borrowed source, must charge sourcePixels before upload, and must tear
 * down mesh/bindings before releasing those sources on cancellation/GPU loss.
 * This factory is WebGL2-only; it does not contain a fictitious WebGPU program. */
export function createDetailTerrainShader(options: DetailTerrainShaderOptions) {
  assertDetailTerrainGlCapabilities(readDetailTerrainGlCapabilities(options.gl)); validateSources(options);
  const uniforms = new UniformGroup({ uDetailOriginCell: { value: new Int32Array(2), type: 'vec2<i32>' },
    uDetailOriginOffsetQ: { value: new Int32Array(2), type: 'vec2<i32>' }, uDetailDiagnostic: { value: options.diagnostic ? 1 : 0, type: 'i32' } });
  const setOriginQ = (origin: { xQ: number; yQ: number }) => {
    if (![origin.xQ, origin.yQ].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 4096 * 256)) throw new Error('细地形 Mesh 原点必须为世界内 Q8 坐标。');
    uniforms.uniforms.uDetailOriginCell.set([Math.floor(origin.xQ / 512), Math.floor(origin.yQ / 512)]);
    uniforms.uniforms.uDetailOriginOffsetQ.set([origin.xQ % 512, origin.yQ % 512]); uniforms.update();
  };
  setOriginQ(options.originQ);
  // Unique program ownership allows destroy(true) without invalidating another
  // shader's shared GlProgram.from cache entry. Use one factory per live field.
  const program = new GlProgram({ vertex: DETAIL_TERRAIN_VERTEX, fragment: DETAIL_TERRAIN_FRAGMENT, name: DETAIL_TERRAIN_SHADER_VERSION,
    preferredVertexPrecision: 'highp', preferredFragmentPrecision: 'highp' });
  let shader: Shader;
  try {
    shader = new Shader({ glProgram: program, resources: { detailUniforms: uniforms,
      uDetailPage0: options.pages[0], uDetailPage1: options.pages[1], uDetailPage2: options.pages[2], uDetailPage3: options.pages[3], uDetailPage4: options.pages[4],
      uDetailLandLut: options.landLut, uDetailSeaLut: options.seaLut } });
  } catch (error) { program.destroy(); uniforms.removeAllListeners(); throw error; }
  // Pixi 8.21 GlMeshAdaptor supplies global/local groups at these slots.
  shader.addResource('globalUniforms', 100, 0); shader.addResource('localUniforms', 101, 0);
  const ledger = detailTerrainSourceLedger(); let destroyed = false;
  return { shader, sourcePixels: ledger.pixels + TERRAIN_LUT_PIXELS, sourceBytes: ledger.byteLength + TERRAIN_LUT_PIXELS * 4,
    nodePagePixels: ledger.pixels, nodePageBytes: ledger.byteLength,
    setOriginQ(origin: { xQ: number; yQ: number }) { if (destroyed) throw new Error('细地形 shader 已销毁。'); setOriginQ(origin); },
    setDiagnostic(value: boolean) { if (destroyed) throw new Error('细地形 shader 已销毁。'); uniforms.uniforms.uDetailDiagnostic = value ? 1 : 0; uniforms.update(); },
    // Non-UBO UniformGroup has no destroy API in Pixi 8.21. Shader destroys its
    // owned bind groups; this group owns only small CPU values/listeners.
    destroy() { if (destroyed) return; shader.destroy(true); uniforms.removeAllListeners(); destroyed = true; } };
}

/** Decodes unfiltered diagnostic RT pixels only. Height quantization is 1/256
 * metre; this helper does not assert that the GPU kernel has passed parity. */
export function decodeDetailTerrainDiagnostic(rgba: ArrayLike<number>): { land: boolean; height: number } | null {
  if (rgba.length !== 4 || Array.from(rgba).some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error('细地形诊断像素必须是四个字节。');
  if (rgba[3] === 0) return null;
  if (rgba[3] !== 255) throw new Error('细地形诊断像素受到透明度或滤波影响。');
  const packed = rgba[0] | rgba[1] << 8 | rgba[2] << 16, heightQ = packed & 0x7fffff;
  if (heightQ > 6144000) throw new Error('细地形诊断高度越界。');
  return { land: (packed & 0x800000) !== 0, height: heightQ / 256 - 12000 };
}
