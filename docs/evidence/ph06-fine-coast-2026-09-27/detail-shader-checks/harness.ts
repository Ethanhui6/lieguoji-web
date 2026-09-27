import { Application, BufferImageSource, Container, Geometry, Mesh, RenderTexture } from 'pixi.js';
import { DETAIL_TERRAIN_VERTEX, DETAIL_TERRAIN_FRAGMENT, createDetailTerrainShader, decodeDetailTerrainDiagnostic, readDetailTerrainGlCapabilities, assertDetailTerrainGlCapabilities } from '/src/world/detail-terrain-shader.ts';
import { detailTerrainSourceLedger, detailTerrainNodeAddress, writeDetailTerrainSample } from '/src/world/detail-terrain-pages.ts';
import { detailCoastNodeOwner, detailCoastOwnerLayout } from '/src/world/detail-coast-types.ts';
import { buildDetailCoastSurface, pickDetailCoastSurface } from '/src/world/detail-coast-geometry.ts';
import { terrainMaterialTable, TERRAIN_LUT_WIDTH, TERRAIN_LUT_HEIGHT } from '/src/world/terrain-mesh.ts';

// This module is an isolated correctness harness. No production renderer,
// app state, IndexedDB, build/dist or performance benchmark is involved.
const tolerance = 1 / 128; // 1/256 diagnostic quantization + bounded highp interpolation.
const report: any = { kind: 'real-webgl2-detail-kernel', toleranceMeters: tolerance, failures: [], patterns: [], special: [], pixi: null };
const status = document.querySelector('#status')!;
const canvas = document.createElement('canvas'); canvas.width = 33; canvas.height = 33; document.body.append(canvas);
const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true })!;
const ledger = detailTerrainSourceLedger();
const pages = ledger.pages.map(layout => {
  const bytes = new Uint8Array(layout.byteLength);
  for (let index = 0; index < layout.pixels; index++) { const offset = index * 4; bytes[offset] = 1; bytes[offset + 1] = 128; bytes[offset + 2] = 239; bytes[offset + 3] = 255; }
  return bytes;
});
const tiles = new Map(); const field = { tiles, sampleBaseElevation: () => -17 };
let gpuTextures: WebGLTexture[] = [], program: WebGLProgram, buffer: WebGLBuffer, vao: WebGLVertexArrayObject;
let currentNodes: Array<[number, number]> = [];
let probes = 0, exactLand = 0, maxError = 0, compileLogs: any[] = [];

function node(x: number, y: number, coverageQ: number, heightMeters: number) {
  const owner = detailCoastNodeOwner(x, y), layout = detailCoastOwnerLayout(owner.bx, owner.by);
  let tile = tiles.get(owner.key);
  if (!tile) { tile = { format: 'lieguoji-detail-coast-tile', version: 1, mode: 'samples', bx: owner.bx, by: owner.by,
    coverageQ: new Int16Array(layout.count).fill(-32767), elevationMeters: new Int16Array(layout.count).fill(-17) }; tiles.set(owner.key, tile); }
  tile.coverageQ[owner.slot] = coverageQ; tile.elevationMeters[owner.slot] = heightMeters;
  const address = detailTerrainNodeAddress(x, y); writeDetailTerrainSample(pages[address.page], address.byteOffset, { coverageQ, heightMeters });
  if (gpuTextures.length) { gl.activeTexture(gl.TEXTURE0 + address.page); gl.bindTexture(gl.TEXTURE_2D, gpuTextures[address.page]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, address.x, address.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pages[address.page].subarray(address.byteOffset, address.byteOffset + 4)); }
}
function fixture(column: number, row: number, coverages: number[], heights?: number[]) {
  for (const [x, y] of currentNodes) node(x, y, -32767, -17);
  currentNodes = [[column, row], [column + 1, row], [column + 1, row + 1], [column, row + 1]];
  for (let i = 0; i < 4; i++) node(...currentNodes[i], coverages[i], heights?.[i] ?? (coverages[i] === 0 ? 0 : coverages[i] > 0 ? [12000, 703, 4201, 193][i] : [-11999, -123, -6001, -19][i]));
}
function compile(type: number, source: string) {
  const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
  const passed = gl.getShaderParameter(shader, gl.COMPILE_STATUS), log = gl.getShaderInfoLog(shader);
  compileLogs.push({ stage: type === gl.VERTEX_SHADER ? 'vertex' : 'fragment', passed, log });
  if (!passed) throw new Error(`GLSL compile failed: ${log}`); return shader;
}
function initRaw() {
  if (!gl) throw new Error('WebGL2 context unavailable');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  report.capabilities = readDetailTerrainGlCapabilities(gl); assertDetailTerrainGlCapabilities(report.capabilities);
  report.gpu = { version: gl.getParameter(gl.VERSION), shaderVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION), renderer: gl.getParameter(gl.RENDERER), vendor: gl.getParameter(gl.VENDOR),
    unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null };
  const vertex = compile(gl.VERTEX_SHADER, DETAIL_TERRAIN_VERTEX), fragment = compile(gl.FRAGMENT_SHADER, DETAIL_TERRAIN_FRAGMENT);
  program = gl.createProgram()!; gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  report.link = { passed: gl.getProgramParameter(program, gl.LINK_STATUS), log: gl.getProgramInfoLog(program) }; if (!report.link.passed) throw new Error(`Program link failed: ${report.link.log}`);
  gl.deleteShader(vertex); gl.deleteShader(fragment); gl.useProgram(program);
  gl.disable(gl.BLEND); gl.disable(gl.DITHER); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  const sources = [...pages, terrainMaterialTable('land'), terrainMaterialTable('sea')];
  gpuTextures = sources.map((source, index) => {
    const texture = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, index < 5 ? ledger.pages[index].width : TERRAIN_LUT_WIDTH, index < 5 ? ledger.pages[index].height : TERRAIN_LUT_HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(gl.getUniformLocation(program, index < 5 ? `uDetailPage${index}` : index === 5 ? 'uDetailLandLut' : 'uDetailSeaLut'), index); return texture;
  });
  gl.uniform1i(gl.getUniformLocation(program, 'uDetailDiagnostic'), 1);
  for (const name of ['uWorldTransformMatrix', 'uTransformMatrix']) gl.uniformMatrix3fv(gl.getUniformLocation(program, name), false, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  vao = gl.createVertexArray()!; gl.bindVertexArray(vao); buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const position = gl.getAttribLocation(program, 'aPosition'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
}
function draw(originQ: [number, number], leftQ: number, topQ: number, widthQ: number, heightQ: number, width: number, height: number) {
  gl.viewport(0, 0, width, height); gl.useProgram(program);
  gl.uniform2i(gl.getUniformLocation(program, 'uDetailOriginCell'), Math.floor(originQ[0] / 512), Math.floor(originQ[1] / 512));
  gl.uniform2i(gl.getUniformLocation(program, 'uDetailOriginOffsetQ'), originQ[0] % 512, originQ[1] % 512);
  const l = leftQ / 256, t = topQ / 256, r = (leftQ + widthQ) / 256, b = (topQ + heightQ) / 256;
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([l,t,r,t,r,b,l,t,r,b,l,b]), gl.STREAM_DRAW);
  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'uProjectionMatrix'), false, [512 / widthQ,0,0,0,512 / heightQ,0,-1 - 2 * leftQ / widthQ,-1 - 2 * topQ / heightQ,1]);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const result = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, result);
  const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`WebGL error ${error}`); return result;
}
function compare(label: string, xQ: number, yQ: number, pixel: ArrayLike<number>) {
  const expected = pickDetailCoastSurface(field, { x: xQ / 256, y: yQ / 256 }), actual = decodeDetailTerrainDiagnostic(pixel); probes++;
  const error = expected && actual ? Math.abs(expected.height - actual.height) : expected === actual ? 0 : Infinity;
  const correctLand = expected?.land === actual?.land && (!!expected === !!actual); if (correctLand) exactLand++;
  maxError = Math.max(maxError, error);
  if ((!correctLand || error > tolerance) && report.failures.length < 100) report.failures.push({ label, xQ, yQ, expected, actual, rgba: Array.from(pixel), error });
  return { label, xQ, yQ, expected: expected && { land: expected.land, height: expected.height }, actual, rgba: Array.from(pixel), error };
}
function probe(label: string, xQ: number, yQ: number, originQ: [number, number]) {
  return compare(label, xQ, yQ, draw(originQ, xQ - originQ[0] - 1, yQ - originQ[1] - 1, 2, 2, 1, 1));
}
async function runPatterns() {
  const values = [-32767,-1,0,1,32767], column = 20, row = 20, originQ: [number, number] = [column * 512, row * 512];
  for (let index = 0; index < 625; index++) {
    let code = index; const signs: number[] = []; for (let digit = 0; digit < 4; digit++) { signs.push(values[code % 5]); code = Math.floor(code / 5); }
    fixture(column,row,signs);
    const bytes = draw(originQ,-32,-32,576,576,9,9), expectedGrid: any[] = [], before = maxError;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { const item = compare(`pattern-${index}/grid-${x}-${y}`, originQ[0] + x * 64, originQ[1] + y * 64, bytes.subarray((y * 9 + x) * 4, (y * 9 + x + 1) * 4)); expectedGrid.push(item.expected); }
    const cell = buildDetailCoastSurface(field, { column,row,columns:1,rows:1 }).cells[0];
    const extras: any[] = [], seen = new Set<string>();
    const add = (kind: string, xQ: number, yQ: number) => { const key = `${xQ},${yQ}`; if (seen.has(key)) return; seen.add(key); extras.push(probe(`pattern-${index}/${kind}`,xQ,yQ,originQ)); };
    for (const [land, triangles] of [[true,cell.land],[false,cell.sea]] as const) for (const triangle of triangles) {
      // Dyadic interior avoids introducing representational uncertainty at test coordinates.
      add(land?'land-interior':'sea-interior',(triangle[0].xQ * 2 + triangle[1].xQ + triangle[2].xQ) / 4,(triangle[0].yQ * 2 + triangle[1].yQ + triangle[2].yQ) / 4);
    }
    for (const shore of cell.shore) { add('shore-a',shore.a.xQ,shore.a.yQ); add('shore-b',shore.b.xQ,shore.b.yQ); add('shore-middle',(shore.a.xQ+shore.b.xQ)/2,(shore.a.yQ+shore.b.yQ)/2); }
    report.patterns.push({ index, signs, rawGrid: Array.from(bytes), expectedGrid, extras, cumulativeMaxError: maxError, increasedError: maxError > before });
    if (index % 25 === 24) { status.textContent = `${index + 1}/625 canonical patterns`; await new Promise(resolve => setTimeout(resolve,0)); }
  }
}
async function runSpecial() {
  const cases: Array<{ name:string; column:number; row:number; signs:number[]; heights?:number[]; originOffset?:[number,number] }> = [
    { name:'world-northwest',column:0,row:0,signs:[0,1,-1,32767] },
    { name:'world-southeast-last-page',column:2047,row:2047,signs:[32767,-1,0,-32767] },
    { name:'owner-four-way',column:32,row:32,signs:[-3,2,-11,7],originOffset:[17,35] },
    { name:'half-rounding',column:91,row:111,signs:[1,-1023,1023,-1] },
    { name:'height-extremes',column:91,row:111,signs:[-32767,32767,32767,-32767],heights:[-12000,12000,12000,-12000] },
    ...[1,2,3,4].map(page => { const index = page * 1048576; return { name:`page-${page}-transition`,column:index%2049 - 1,row:Math.floor(index/2049),signs:[-32767,1,32767,-1] }; }),
  ];
  for (const item of cases) {
    fixture(item.column,item.row,item.signs,item.heights); const base: [number,number] = [item.column*512,item.row*512];
    const origin: [number,number] = [base[0]+(item.originOffset?.[0]??0),base[1]+(item.originOffset?.[1]??0)];
    const points: any[] = [];
    for (const [x,y] of [[0,0],[512,0],[512,512],[0,512],[256,256],[1,1],[511,511],[.5,.5],[511.5,511.5],[255.5,256.5]]) points.push(probe(`${item.name}/${x}-${y}`,base[0]+x,base[1]+y,origin));
    const cell = buildDetailCoastSurface(field,{column:item.column,row:item.row,columns:1,rows:1}).cells[0];
    for (const [index,shore] of cell.shore.entries()) for (const [x,y] of [[shore.a.xQ,shore.a.yQ],[shore.b.xQ,shore.b.yQ],[(shore.a.xQ+shore.b.xQ)/2,(shore.a.yQ+shore.b.yQ)/2]]) points.push(probe(`${item.name}/shore-${index}`,x,y,origin));
    report.special.push({ ...item,origin,points });
  }
  for (const [x,y] of [[-1,0],[0,-1],[1048577,1048576],[1048576,1048577]]) {
    const origin: [number,number] = [x<0?0:1048064,y<0?0:1048064]; report.special.push(probe('outside-world',x,y,origin));
  }
}
async function runPixi() {
  fixture(20,20,[-32767,1,32767,-1]);
  const app = new Application(); await app.init({ width:9,height:9,resolution:1,antialias:false,preference:'webgl',backgroundAlpha:0,autoStart:false });
  document.body.append(app.canvas); const renderer = app.renderer as any;
  const sources = pages.map((bytes,page) => new BufferImageSource({ resource:bytes,width:ledger.pages[page].width,height:ledger.pages[page].height,format:'rgba8unorm',alphaMode:'no-premultiply-alpha',scaleMode:'nearest',autoGenerateMipmaps:false,mipLevelCount:1,resolution:1 }));
  const lut = (domain: 'land'|'sea') => new BufferImageSource({ resource:terrainMaterialTable(domain),width:TERRAIN_LUT_WIDTH,height:TERRAIN_LUT_HEIGHT,format:'rgba8unorm',alphaMode:'no-premultiply-alpha',scaleMode:'linear',autoGenerateMipmaps:false,mipLevelCount:1,resolution:1 });
  const landLut = lut('land'), seaLut = lut('sea'), backend = createDetailTerrainShader({ gl:renderer.gl,pages:sources,landLut,seaLut,originQ:{xQ:20*512,yQ:20*512},diagnostic:true });
  const geometry = new Geometry({ attributes:{ aPosition:{buffer:new Float32Array([-.125,-.125,2.125,-.125,2.125,2.125,-.125,2.125]),format:'float32x2'} },indexBuffer:new Uint32Array([0,1,2,0,2,3]) });
  const mesh = new Mesh({ geometry,shader:backend.shader }); mesh.position.set(.5,.5); mesh.scale.set(4);
  const container = new Container(); container.addChild(mesh); const target = RenderTexture.create({ width:9,height:9,resolution:1,antialias:false });
  renderer.render({ container,target,clear:true }); const extracted = renderer.extract.pixels({ target });
  const bytes = extracted.pixels as Uint8Array, points:any[] = [];
  for(let y=0;y<9;y++)for(let x=0;x<9;x++)points.push(compare(`pixi/${x}-${y}`,20*512+x*64,20*512+y*64,bytes.subarray((y*9+x)*4,(y*9+x+1)*4)));
  report.pixi = { capabilities:readDetailTerrainGlCapabilities(renderer.gl),sourcePixels:backend.sourcePixels,sourceBytes:backend.sourceBytes,extractWidth:extracted.width,extractHeight:extracted.height,points };
  mesh.destroy({ texture:false,textureSource:false }); geometry.destroy(true); target.destroy(true); backend.destroy();
  report.pixi.borrowedSourcesSurviveShaderDestroy = [...sources,landLut,seaLut].every(source=>!source.destroyed);
  for(const source of [...sources,landLut,seaLut])source.destroy(); container.destroy(); app.destroy(true);
}
async function runSupplement() {
  fixture(90,110,[3,-1021,1021,-3]); const base: [number,number]=[90*512,110*512];
  const cell=buildDetailCoastSurface(field,{column:90,row:110,columns:1,rows:1}).cells[0];
  const points:any[]=[];
  for(const shore of cell.shore) for(const vertex of [shore.a,shore.b]) {
    points.push(probe('internal-half-rounding',vertex.xQ,vertex.yQ,base));
    for(const delta of [-.5,.5])if(vertex.yQ===base[1])points.push(probe('half-rounding-neighbour',vertex.xQ+delta,vertex.yQ,base));
  }
  report.special.push({name:'3-over-1024-rounds-1.5Q-to-2Q',shore:cell.shore,points});
  const origins: Array<[number,number]>=[base,[base[0]-512,base[1]-512],[base[0]+17,base[1]+35],[0,0]],samePoints=[[base[0]+2,base[1]],[base[0]+256,base[1]+256],[base[0]+256.5,base[1]+255.5],[base[0]+511.5,base[1]+511.5]];
  for(const point of samePoints){const samples=origins.map(origin=>probe(`origin-invariant-${origin.join(',')}`,point[0],point[1],origin));
    const identical=samples.every(sample=>JSON.stringify(sample.rgba)===JSON.stringify(samples[0].rgba));if(!identical)report.failures.push({kind:'origin-invariance',samples});report.special.push({name:'same-world-point-different-core-origin',identical,samples});}
  const old=document.createElement('canvas').getContext('webgl');
  if(old){let rejected=false;try{assertDetailTerrainGlCapabilities(readDetailTerrainGlCapabilities(old));}catch{rejected=true;}
    report.special.push({name:'real-WebGL1-rejected',capabilities:readDetailTerrainGlCapabilities(old),rejected});if(!rejected)report.failures.push({kind:'WebGL1 accepted'});old.getExtension('WEBGL_lose_context')?.loseContext();}
}
(window as any).detailShaderRun = async (mode='full') => {
  const start = performance.now();
  try { initRaw(); if(mode==='supplement')await runSupplement();else{await runPatterns(); await runSpecial();} await runPixi(); }
  catch(error) { report.exception = { message:String(error),stack:error instanceof Error?error.stack:null }; }
  report.compile = compileLogs; report.probes = probes; report.exactLand = exactLand; report.maxHeightError = maxError; report.elapsedMs = performance.now()-start;
  report.sourceLedger = ledger; report.mode=mode; report.passed = !report.exception && report.failures.length===0 && (mode==='supplement'||report.patterns.length===625) && !!report.pixi;
  for(const texture of gpuTextures)gl.deleteTexture(texture); if(buffer)gl.deleteBuffer(buffer);if(vao)gl.deleteVertexArray(vao);if(program)gl.deleteProgram(program);
  status.textContent=report.passed?'GPU contract passed':'GPU contract failed: inspect raw report'; return report;
};
