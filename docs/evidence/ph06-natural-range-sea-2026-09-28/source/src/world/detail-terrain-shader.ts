import { GlProgram, Shader, UniformGroup, type TextureSource } from 'pixi.js';
import { detailTerrainPageLayout, detailTerrainSourceLedger } from './detail-terrain-pages';
import { TERRAIN_LUT_WIDTH, TERRAIN_LUT_HEIGHT, TERRAIN_LUT_PIXELS } from './terrain-mesh';
import type { DetailCoastVertex } from './detail-coast-types';

export const DETAIL_TERRAIN_SHADER_VERSION = 'final-q8-pieces-gl2-shared-light-v2';

const displayLight = (gx: number, gy: number) => 1 + Math.max(-.13, Math.min(.13, Math.atan((gx + gy) / 40) / (Math.PI / 2) * .13));
type SideLights = readonly [land: number, sea: number];
/** Display-only oracle. The geographic sampler, source heights and clipped
 * geometry stay authoritative; this does not replace any pick/height path. */
function lightCrossing(a: DetailCoastVertex, b: DetailCoastVertex): DetailCoastVertex {
  if (a.coverageQ === 0) return a;
  if (b.coverageQ === 0) return b;
  if (a.xQ > b.xQ || a.xQ === b.xQ && a.yQ > b.yQ) [a, b] = [b, a];
  const numerator = 512 * Math.abs(a.coverageQ), denominator = Math.abs(a.coverageQ - b.coverageQ);
  const offset = Math.max(1, Math.min(511, Math.floor((2 * numerator + denominator) / (2 * denominator))));
  return { xQ: a.xQ + Math.sign(b.xQ - a.xQ) * offset, yQ: a.yQ + Math.sign(b.yQ - a.yQ) * offset, coverageQ: 0, heightMeters: 0 };
}
/** Each node has an independent light on each side. Opposite-domain heights
 * never enter a slope: an axis stops at the actual quantized zero crossing. */
export function detailTerrainNodeLights(node: DetailCoastVertex, west: DetailCoastVertex, east: DetailCoastVertex, north: DetailCoastVertex, south: DetailCoastVertex): SideLights {
  const light = (land: boolean) => {
    const inside = (point: DetailCoastVertex) => land ? point.coverageQ >= 0 : point.coverageQ <= 0;
    if (!inside(node)) return 1;
    const sameSide = (point: DetailCoastVertex) => inside(point) ? point : lightCrossing(node, point);
    const w = sameSide(west), e = sameSide(east), n = sameSide(north), s = sameSide(south);
    const gx = e.xQ === w.xQ ? 0 : 256 * (e.heightMeters - w.heightMeters) / (e.xQ - w.xQ);
    const gy = s.yQ === n.yQ ? 0 : 256 * (s.heightMeters - n.heightMeters) / (s.yQ - n.yQ);
    return displayLight(gx, gy);
  };
  return [light(true), light(false)];
}
/** Bounded CPU reference for GPU probes: twelve unique source nodes at most,
 * independent of mesh origin, page boundaries and which source fan is hit. */
export function detailTerrainCellLighting(sampleNode: (x: number, y: number) => DetailCoastVertex, column: number, row: number) {
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0 || column > 2047 || row > 2047) throw new Error('细地形光照格坐标无效。');
  const samples = new Map<number, DetailCoastVertex>();
  const read = (x: number, y: number) => {
    x = Math.max(0, Math.min(2048, x)); y = Math.max(0, Math.min(2048, y));
    const key = y * 2049 + x, known = samples.get(key); if (known) return known;
    const node = sampleNode(x, y); samples.set(key, node); return node;
  };
  const coordinates = [[column, row], [column + 1, row], [column + 1, row + 1], [column, row + 1]];
  const nodes = coordinates.map(([x, y]) => read(x, y));
  const lights = coordinates.map(([x, y], i) => detailTerrainNodeLights(nodes[i], read(x - 1, y), read(x + 1, y), read(x, y - 1), read(x, y + 1)));
  const same = (a: DetailCoastVertex, b: DetailCoastVertex) => a.xQ === b.xQ && a.yQ === b.yQ;
  return {
    sampledNodes: samples.size,
    lightAt(vertex: DetailCoastVertex, land: boolean): number {
      const side = land ? 0 : 1, corner = nodes.findIndex(node => same(vertex, node));
      if (corner >= 0) return lights[corner][side];
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]]) {
        if (nodes[a].coverageQ * nodes[b].coverageQ >= 0 || !same(vertex, lightCrossing(nodes[a], nodes[b]))) continue;
        return lights[(land ? nodes[a].coverageQ > 0 : nodes[a].coverageQ < 0) ? a : b][side];
      }
      throw new Error('光照点必须属于实际细格的源角点或规范裁切交点。');
    },
  };
}

/** Analytic derivative of the authoritative height piece. Display lighting now
 * interpolates shared node lights; this derivative remains an independent
 * physical-height oracle, not a claim of GPU execution or display continuity. */
export function detailTerrainPieceRelief(a: { xQ: number; yQ: number; heightMeters: number }, b: typeof a, c: typeof a) {
  const abx = b.xQ - a.xQ, aby = b.yQ - a.yQ, acx = c.xQ - a.xQ, acy = c.yQ - a.yQ;
  const area = abx * acy - aby * acx;
  if (area <= 0) return { gradient: { x: 0, y: 0 }, light: 1 };
  const dhb = b.heightMeters - a.heightMeters, dhc = c.heightMeters - a.heightMeters;
  const x = 256 * (dhb * acy - dhc * aby) / area, y = 256 * (abx * dhc - acx * dhb) / area;
  // Existing NW light at the actual fine-node step 2:
  // (east-west + south-north) / max(160, step*16) = (gx+gy)/40.
  const slope = Math.atan((x + y) / 40) / (Math.PI / 2);
  return { gradient: { x, y }, light: 1 + Math.max(-.13, Math.min(.13, slope * .13)) };
}
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

struct FineVertex { ivec2 q; int coverage; int height; vec2 lights; };
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
  return FineVertex(localQ, signed16(bytes.r, bytes.g), signed16(bytes.b, bytes.a), vec2(1.0));
}
FineVertex neighbourAt(ivec2 node, ivec2 localQ, FineVertex boundary) {
  if (any(lessThan(node, ivec2(0))) || any(greaterThan(node, ivec2(2048)))) return boundary;
  return nodeAt(node, localQ);
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
  // Each side uses its own source endpoint's shared light. The canonical
  // edge gives exactly the same pair from either incident cell/fan.
  vec2 lights = vec2(a.coverage > 0 ? a.lights.x : b.lights.x, a.coverage < 0 ? a.lights.y : b.lights.y);
  return FineVertex(a.q + sign(difference) * offset, 0, 0, lights);
}
bool inside(FineVertex vertex, bool land) { return land ? vertex.coverage >= 0 : vertex.coverage <= 0; }
FineVertex sameSideNode(FineVertex node, FineVertex neighbour, bool land) {
  if (inside(neighbour, land)) return neighbour;
  return crossing(node, neighbour);
}
float nodeLight(FineVertex node, FineVertex west, FineVertex east, FineVertex north, FineVertex south, bool land) {
  if (!inside(node, land)) return 1.0;
  FineVertex w = sameSideNode(node, west, land), e = sameSideNode(node, east, land);
  FineVertex n = sameSideNode(node, north, land), s = sameSideNode(node, south, land);
  float gx = e.q.x == w.q.x ? 0.0 : 256.0 * float(e.height - w.height) / float(e.q.x - w.q.x);
  float gy = s.q.y == n.q.y ? 0.0 : 256.0 * float(s.height - n.height) / float(s.q.y - n.q.y);
  float slope = atan((gx + gy) / 40.0) / 1.5707963267948966;
  return 1.0 + clamp(slope * 0.13, -0.13, 0.13);
}
vec2 nodeLights(FineVertex node, FineVertex west, FineVertex east, FineVertex north, FineVertex south) {
  return vec2(nodeLight(node, west, east, north, south, true), nodeLight(node, west, east, north, south, false));
}
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
bool triangleHit(FineVertex a, FineVertex b, FineVertex c, bool land, vec2 target, out float height, out float light) {
  light = 1.0;
  int area = areaQ(a.q, b.q, c.q);
  if (area <= 0) return false;
  vec2 aq = vec2(a.q), bq = vec2(b.q), cq = vec2(c.q);
  if (crossAt(aq, bq, target) < 0.0 || crossAt(bq, cq, target) < 0.0 || crossAt(cq, aq, target) < 0.0) return false;
  height = (crossAt(target, bq, cq) * float(a.height) + crossAt(aq, target, cq) * float(b.height) + crossAt(aq, bq, target) * float(c.height)) / float(area);
  // Only display light is reconstructed continuously. Height above remains
  // the exact canonical clipped height plane, including one-Q8 slivers.
  float la = land ? a.lights.x : a.lights.y, lb = land ? b.lights.x : b.lights.y, lc = land ? c.lights.x : c.lights.y;
  light = (crossAt(target, bq, cq) * la + crossAt(aq, target, cq) * lb + crossAt(aq, bq, target) * lc) / float(area);
  return true;
}
bool pieceHit(FineVertex triangle[3], bool land, vec2 target, out float height, out float light) {
  bool allLand = triangle[0].coverage >= 0 && triangle[1].coverage >= 0 && triangle[2].coverage >= 0;
  // The all-zero source triangle is entirely land and emits no sea piece.
  if (allLand) return land && triangleHit(triangle[0], triangle[1], triangle[2], land, target, height, light);
  FineVertex polygon[6]; int count = clipped(triangle, land, polygon);
  for (int index = 1; index < 5; index++) {
    if (index + 1 >= count) break;
    if (triangleHit(polygon[0], polygon[index], polygon[index + 1], land, target, height, light)) return true;
  }
  return false;
}
bool zeroHit(FineVertex triangle[3], vec2 target, out float light) {
  light = 1.0;
  for (int edge = 0; edge < 3; edge++) {
    FineVertex a = triangle[edge], b = triangle[(edge + 1) % 3];
    if (a.coverage == 0 && all(equal(vec2(a.q), target))) { light = a.lights.x; return true; }
    if (a.coverage == 0 && b.coverage == 0 && crossAt(vec2(a.q), vec2(b.q), target) == 0.0
      && all(greaterThanEqual(target, vec2(min(a.q, b.q)))) && all(lessThanEqual(target, vec2(max(a.q, b.q))))) {
      float t = a.q.x != b.q.x ? (target.x - float(a.q.x)) / float(b.q.x - a.q.x) : (target.y - float(a.q.y)) / float(b.q.y - a.q.y);
      light = mix(a.lights.x, b.lights.x, t); return true;
    }
  }
  return false;
}
void writeResult(bool land, float height, float light) {
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
  // Same bounded physical palette; only the shared display-light field is
  // interpolated. Sea and land continue to use separate material sources.
  float normalizedLight = clamp((light - 0.87) / 0.26, 0.0, 1.0);
  vec2 uv = vec2((0.5 + normalized * 1200.0) / 1201.0, (0.5 + normalizedLight * 32.0) / 33.0);
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
  // Twelve unique reads total: the four real corners plus eight axis-neighbours.
  // No page format change, full-world light texture or extra source allocation.
  FineVertex nwW = neighbourAt(cell + ivec2(-1, 0), ivec2(-512, 0), nw), nwN = neighbourAt(cell + ivec2(0, -1), ivec2(0, -512), nw);
  FineVertex neN = neighbourAt(cell + ivec2(1, -1), ivec2(512, -512), ne), neE = neighbourAt(cell + ivec2(2, 0), ivec2(1024, 0), ne);
  FineVertex seE = neighbourAt(cell + ivec2(2, 1), ivec2(1024, 512), se), seS = neighbourAt(cell + ivec2(1, 2), ivec2(512, 1024), se);
  FineVertex swS = neighbourAt(cell + ivec2(0, 2), ivec2(0, 1024), sw), swW = neighbourAt(cell + ivec2(-1, 1), ivec2(-512, 512), sw);
  nw.lights = nodeLights(nw, nwW, ne, nwN, sw);
  ne.lights = nodeLights(ne, nw, neE, neN, se);
  se.lights = nodeLights(se, sw, seE, ne, seS);
  sw.lights = nodeLights(sw, swW, se, nw, swS);
  FineVertex upper[3] = FineVertex[3](nw, ne, se);
  FineVertex lower[3] = FineVertex[3](nw, se, sw);
  float height = 0.0;
  float light = 1.0;
  // Match CPU's complete land pass, zero-edge pass, then complete sea pass.
  if (pieceHit(upper, true, target, height, light) || pieceHit(lower, true, target, height, light)) { writeResult(true, height, light); return; }
  if (zeroHit(upper, target, light) || zeroHit(lower, target, light)) { writeResult(true, 0.0, light); return; }
  if (pieceHit(upper, false, target, height, light) || pieceHit(lower, false, target, height, light)) { writeResult(false, height, light); return; }
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
