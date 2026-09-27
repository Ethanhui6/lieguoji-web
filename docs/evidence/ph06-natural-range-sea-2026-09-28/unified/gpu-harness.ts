import { DETAIL_TERRAIN_VERTEX, DETAIL_TERRAIN_FRAGMENT, decodeDetailTerrainDiagnostic, detailTerrainCellLighting, readDetailTerrainGlCapabilities, assertDetailTerrainGlCapabilities } from '../../../src/world/detail-terrain-shader';
import { detailTerrainSourceLedger, detailTerrainNodeAddress, writeDetailTerrainSample } from '../../../src/world/detail-terrain-pages';
import { detailCoastNodeOwner, detailCoastOwnerLayout, type DetailCoastKey, type DetailCoastSampleTile, type DetailCoastVertex, type DetailCoastTriangle } from '../../../src/world/detail-coast-types';
import { buildDetailCoastSurface, pickDetailCoastSurface } from '../../../src/world/detail-coast-geometry';
import { sampleDetailCoastNode } from '../../../src/world/detail-coast-field';
import { terrainMaterialTable, terrainMaterialUv, TERRAIN_LUT_WIDTH, TERRAIN_LUT_HEIGHT } from '../../../src/world/terrain-mesh';

// The actual production GLSL runs in Chromium WebGL2. This isolated harness is
// not product-frame performance or user visual acceptance.
const canvas = document.createElement('canvas'); canvas.width = 65; canvas.height = 33; document.body.append(canvas);
const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true })!;
const ledger = detailTerrainSourceLedger(), tiles = new Map<DetailCoastKey, DetailCoastSampleTile>();
const field = { tiles, sampleBaseElevation: () => -17 };
const pages = ledger.pages.map(layout => {
  const bytes = new Uint8Array(layout.byteLength);
  // -32767 coverage, -17 metres; pack once before any GPU work.
  for (let i = 0; i < bytes.length; i += 4) bytes.set([1, 128, 239, 255], i);
  return bytes;
});
const tables = { land: terrainMaterialTable('land'), sea: terrainMaterialTable('sea') };
const textures: WebGLTexture[] = [], nodes = new Set<string>(), failures: unknown[] = [], probes: unknown[] = [], compilation: unknown[] = [], seams: unknown[] = [];
let program: WebGLProgram, buffer: WebGLBuffer, vao: WebGLVertexArrayObject;
function set(x: number, y: number, coverageQ: number, heightMeters: number) {
  const owner = detailCoastNodeOwner(x, y); let tile = tiles.get(owner.key);
  if (!tile) {
    const { count } = detailCoastOwnerLayout(owner.bx, owner.by);
    tile = { format: 'lieguoji-detail-coast-tile', version: 1, mode: 'samples', bx: owner.bx, by: owner.by, coverageQ: new Int16Array(count).fill(-32767), elevationMeters: new Int16Array(count).fill(-17) }; tiles.set(owner.key, tile);
  }
  tile.coverageQ[owner.slot] = coverageQ; tile.elevationMeters[owner.slot] = heightMeters;
  const address = detailTerrainNodeAddress(x, y); writeDetailTerrainSample(pages[address.page], address.byteOffset, { coverageQ, heightMeters });
  if (textures.length) {
    gl.activeTexture(gl.TEXTURE0 + address.page); gl.bindTexture(gl.TEXTURE_2D, textures[address.page]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, address.x, address.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pages[address.page].subarray(address.byteOffset, address.byteOffset + 4));
  }
  nodes.add(`${x},${y}`);
}
function fixture(column: number, row: number, sample: (x: number, y: number) => [number, number]) {
  for (const key of [...nodes]) { const [x, y] = key.split(',').map(Number); set(x, y, -32767, -17); } nodes.clear();
  for (let y = Math.max(0, row - 1); y <= Math.min(2048, row + 3); y++) for (let x = Math.max(0, column - 1); x <= Math.min(2048, column + 3); x++) set(x, y, ...sample(x, y));
}
function compile(kind: number, source: string) {
  const shader = gl.createShader(kind)!; gl.shaderSource(shader, source); gl.compileShader(shader);
  const passed = !!gl.getShaderParameter(shader, gl.COMPILE_STATUS), log = gl.getShaderInfoLog(shader); compilation.push({ kind, passed, log });
  if (!passed) throw new Error(`GLSL compile failed: ${log}`); return shader;
}
function init() {
  if (!gl) throw new Error('Actual WebGL2 unavailable'); assertDetailTerrainGlCapabilities(readDetailTerrainGlCapabilities(gl));
  const v = compile(gl.VERTEX_SHADER, DETAIL_TERRAIN_VERTEX), f = compile(gl.FRAGMENT_SHADER, DETAIL_TERRAIN_FRAGMENT);
  program = gl.createProgram()!; gl.attachShader(program, v); gl.attachShader(program, f); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`GLSL link failed: ${gl.getProgramInfoLog(program)}`);
  gl.deleteShader(v); gl.deleteShader(f); gl.useProgram(program);
  gl.disable(gl.BLEND); gl.disable(gl.DITHER); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  [...pages, tables.land, tables.sea].forEach((bytes, index) => {
    const texture = gl.createTexture()!; textures.push(texture); gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, texture);
    const filter = index < 5 ? gl.NEAREST : gl.LINEAR; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, index < 5 ? ledger.pages[index].width : TERRAIN_LUT_WIDTH, index < 5 ? ledger.pages[index].height : TERRAIN_LUT_HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    gl.uniform1i(gl.getUniformLocation(program, index < 5 ? `uDetailPage${index}` : index === 5 ? 'uDetailLandLut' : 'uDetailSeaLut'), index);
  });
  for (const name of ['uWorldTransformMatrix', 'uTransformMatrix']) gl.uniformMatrix3fv(gl.getUniformLocation(program, name), false, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  vao = gl.createVertexArray()!; gl.bindVertexArray(vao); buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const position = gl.getAttribLocation(program, 'aPosition'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
}
function draw(xQ: number, yQ: number, origin: [number, number], diagnostic: boolean) {
  const left = xQ - origin[0] - 1, top = yQ - origin[1] - 1;
  gl.viewport(0, 0, 1, 1); gl.useProgram(program); gl.uniform1i(gl.getUniformLocation(program, 'uDetailDiagnostic'), diagnostic ? 1 : 0);
  gl.uniform2i(gl.getUniformLocation(program, 'uDetailOriginCell'), Math.floor(origin[0] / 512), Math.floor(origin[1] / 512));
  gl.uniform2i(gl.getUniformLocation(program, 'uDetailOriginOffsetQ'), origin[0] % 512, origin[1] % 512);
  const l = left / 256, t = top / 256, r = (left + 2) / 256, b = (top + 2) / 256;
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([l, t, r, t, r, b, l, t, r, b, l, b]), gl.STREAM_DRAW);
  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'uProjectionMatrix'), false, [256, 0, 0, 0, 256, 0, -1 - left, -1 - top, 1]);
  gl.drawArrays(gl.TRIANGLES, 0, 6); const rgba = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL draw error'); return Array.from(rgba);
}
const cross = (a: DetailCoastVertex, b: DetailCoastVertex, c: DetailCoastVertex) => (b.xQ - a.xQ) * (c.yQ - a.yQ) - (b.yQ - a.yQ) * (c.xQ - a.xQ);
function lightAt(xQ: number, yQ: number, land: boolean) {
  const column = Math.min(2047, Math.floor(xQ / 512)), row = Math.min(2047, Math.floor(yQ / 512));
  const cell = buildDetailCoastSurface(field, { column, row, columns: 1, rows: 1 }).cells[0], lighting = detailTerrainCellLighting((x, y) => sampleDetailCoastNode(field, x, y), column, row);
  const q = { xQ, yQ, coverageQ: 0, heightMeters: 0 };
  for (const triangle of land ? cell.land : cell.sea) {
    const weights = [cross(q, triangle[1], triangle[2]), cross(triangle[0], q, triangle[2]), cross(triangle[0], triangle[1], q)];
    if (weights.every(weight => weight >= 0)) return weights.reduce((n, w, i) => n + w * lighting.lightAt(triangle[i], land), 0) / cross(...triangle);
  }
  // Exact zero-area tie, same source node/edge land priority as CPU picking.
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]]) {
    const corners = [[column, row], [column + 1, row], [column + 1, row + 1], [column, row + 1]].map(([x, y]) => sampleDetailCoastNode(field, x, y));
    const v = corners[a], w = corners[b];
    if (v.coverageQ === 0 && v.xQ === xQ && v.yQ === yQ) return lighting.lightAt(v, true);
    if (v.coverageQ === 0 && w.coverageQ === 0 && cross(v, w, q) === 0 && xQ >= Math.min(v.xQ, w.xQ) && xQ <= Math.max(v.xQ, w.xQ) && yQ >= Math.min(v.yQ, w.yQ) && yQ <= Math.max(v.yQ, w.yQ)) {
      const t = v.xQ !== w.xQ ? (xQ - v.xQ) / (w.xQ - v.xQ) : (yQ - v.yQ) / (w.yQ - v.yQ);
      return lighting.lightAt(v, true) * (1 - t) + lighting.lightAt(w, true) * t;
    }
  }
  throw new Error('No actual piece for light probe');
}
function colorAt(height: number, light: number, land: boolean) {
  const domain = land ? 'land' : 'sea', [u, v] = terrainMaterialUv(height, light, domain), table = tables[domain];
  const x = Math.max(0, Math.min(1200, u * TERRAIN_LUT_WIDTH - .5)), y = Math.max(0, Math.min(32, v * TERRAIN_LUT_HEIGHT - .5)), x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  return [0, 1, 2, 3].map(channel => {
    const at = (dx: number, dy: number) => table[(Math.min(32, y0 + dy) * TERRAIN_LUT_WIDTH + Math.min(1200, x0 + dx)) * 4 + channel];
    return Math.round((at(0, 0) * (1 - tx) + at(1, 0) * tx) * (1 - ty) + (at(0, 1) * (1 - tx) + at(1, 1) * tx) * ty);
  });
}
function probe(label: string, xQ: number, yQ: number, origin: [number, number]) {
  const picked = pickDetailCoastSurface(field, { x: xQ / 256, y: yQ / 256 })!;
  const rawHeight = draw(xQ, yQ, origin, true), decoded = decodeDetailTerrainDiagnostic(rawHeight)!;
  const light = lightAt(xQ, yQ, picked.land), expected = colorAt(picked.height, light, picked.land), actual = draw(xQ, yQ, origin, false);
  const heightError = Math.abs(decoded.height - picked.height), colorError = Math.max(...actual.map((value, i) => Math.abs(value - expected[i])));
  const result = { label, xQ, yQ, origin, picked, decoded, light, expected, actual, heightError, colorError }; probes.push(result);
  if (![picked.height, decoded.height, light, heightError, colorError, ...expected, ...actual].every(Number.isFinite) || decoded.land !== picked.land || heightError > 1 / 128 || colorError > 2) failures.push(result);
  return actual;
}
async function run() {
  let exception: string | null = null;
  try {
    init();
    const cases = [
      { name: 'owner-edge-curved-sea', column: 31, row: 32, sample: (x: number, y: number): [number, number] => [-100, -500 + 8 * (x - 31) ** 2 + 4 * (y - 32) ** 2] },
      { name: 'rounded-shore', column: 31, row: 32, sample: (x: number, y: number): [number, number] => y <= 32 ? [3, 100 + (x - 31) * 15] : [-1021, -600] },
      { name: 'zero-edge', column: 8, row: 8, sample: (x: number, y: number): [number, number] => x === 9 ? [0, 0] : x < 9 ? [1, 200 + (y - 8) * 40] : [-1, -800 - (y - 8) * 90] },
      { name: 'one-Q8-sliver', column: 10, row: 10, sample: (x: number, y: number): [number, number] => x === 10 && y === 10 ? [1, 12000] : [-32767, -12000] },
      ...[[0, 0], [2047, 0], [0, 2047], [2047, 2047]].map(([column, row]) => ({ name: `world-${column}-${row}`, column, row, sample: (x: number, y: number): [number, number] => [-1, -600 + (x - column) * 10 + (y - row) * 14] })),
      ...[1, 2, 3, 4].map(page => { const index = page * 1048576, column = index % 2049 - 1, row = Math.floor(index / 2049); return { name: `page-${page}`, column, row, sample: (x: number, y: number): [number, number] => [-1, -500 + 8 * (x - column) ** 2 + 4 * (y - row) ** 2] }; }),
    ];
    for (const item of cases) {
      fixture(item.column, item.row, item.sample);
      const base: [number, number] = [item.column * 512, item.row * 512], seen = new Set<string>();
      const inspect = (name: string, xQ: number, yQ: number) => {
        const key = `${xQ},${yQ}`; if (seen.has(key)) return; seen.add(key);
        const a = probe(`${item.name}/${name}`, xQ, yQ, base);
        const b = probe(`${item.name}/${name}/shifted-origin`, xQ, yQ, [Math.max(0, base[0] - 17), Math.max(0, base[1] - 35)]);
        if (JSON.stringify(a) !== JSON.stringify(b)) failures.push({ kind: 'origin-color-invariance', name: item.name, xQ, yQ, a, b });
      };
      for (const [x, y] of [[0, 0], [512, 0], [512, 512], [0, 512], [128, 128], [256, 256], [384, 128], [128, 384], [511.5, 256], [512, 256]]) inspect('grid', base[0] + x, base[1] + y);
      const cell = buildDetailCoastSurface(field, { column: item.column, row: item.row, columns: 1, rows: 1 }).cells[0];
      for (const triangle of [...cell.land, ...cell.sea] as DetailCoastTriangle[]) inspect('actual-piece', (2 * triangle[0].xQ + triangle[1].xQ + triangle[2].xQ) / 4, (2 * triangle[0].yQ + triangle[1].yQ + triangle[2].yQ) / 4);
      for (const shore of cell.shore) for (const v of [shore.a, shore.b]) inspect('actual-shore', v.xQ, v.yQ);
      if (item.name === 'owner-edge-curved-sea' || item.name === 'rounded-shore') {
        const pairs = item.name === 'owner-edge-curved-sea'
          ? [[511.5, 256, 512.5, 256], [256, 511.5, 256, 512.5], [255.5, 256.5, 256.5, 255.5]]
          : [[511.5, 1, 512.5, 1], [511.5, 256, 512.5, 256]];
        for (const [ax, ay, bx, by] of pairs) {
          const a = draw(base[0] + ax, base[1] + ay, base, false), b = draw(base[0] + bx, base[1] + by, base, false);
          const aPick = pickDetailCoastSurface(field, { x: (base[0] + ax) / 256, y: (base[1] + ay) / 256 })!, bPick = pickDetailCoastSurface(field, { x: (base[0] + bx) / 256, y: (base[1] + by) / 256 })!;
          const difference = Math.max(...a.map((value, i) => Math.abs(value - b[i])));
          const seam = { fixture: item.name, ax, ay, bx, by, a, b, aLand: aPick.land, bLand: bPick.land, difference }; seams.push(seam);
          if (![difference, ...a, ...b].every(Number.isFinite) || aPick.land !== bPick.land || difference > 1) failures.push({ kind: 'actual-GPU-continuity', ...seam });
        }
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (error) { exception = error instanceof Error ? error.stack ?? error.message : String(error); }
  const report = { kind: 'isolated-actual-WebGL2-display-light-and-geography', passed: !exception && !failures.length && seams.length === 5, exception, compilation, capabilities: gl && readDetailTerrainGlCapabilities(gl), sourceLedger: ledger, nodeReadsPerInteriorCell: 12, probes, seams, failures, heightToleranceMeters: 1 / 128, colorToleranceBytes: 2, actualContinuityToleranceBytes: 1 };
  for (const texture of textures) gl.deleteTexture(texture); if (buffer) gl.deleteBuffer(buffer); if (vao) gl.deleteVertexArray(vao); if (program) gl.deleteProgram(program);
  document.querySelector('#status')!.textContent = report.passed ? 'GPU probes passed (not product visual acceptance)' : 'GPU probes failed';
  return report;
}
(window as unknown as { continuousLightRun: typeof run }).continuousLightRun = run;
