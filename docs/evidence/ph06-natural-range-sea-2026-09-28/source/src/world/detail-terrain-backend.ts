import { BufferImageSource, Container, Geometry, Mesh, Texture, type WebGLRenderer } from 'pixi.js';
import type { AtlasControl, AtlasGeographyView } from './model';
import { extractDetailCoastBase } from './detail-coast-base';
import { createDetailShapeBaseSampler } from './generation/detail-shape-height';
import type { DetailCoastField } from './detail-coast-types';
import { pickDetailCoastSurface } from './detail-coast-geometry';
import { createDetailTerrainShader, assertDetailTerrainGlCapabilities, readDetailTerrainGlCapabilities } from './detail-terrain-shader';
import { copyDetailTerrainChunkToPage, detailTerrainSourceLedger, packDetailTerrainNodeRange, DETAIL_TERRAIN_PACK_NODE_LIMIT } from './detail-terrain-pages';
import { ensureTerrainMaterials, TERRAIN_LUT_PIXELS } from './terrain-mesh';
import type { AtlasAabb } from './spatial-index';
import type { AtlasTextureCache } from './atlas-texture-cache';

const layout = detailTerrainSourceLedger();
export const DETAIL_TERRAIN_SHARED_PIXELS = layout.pixels + TERRAIN_LUT_PIXELS;
let nextOwner = 0;
type Control = AtlasControl & { check?: () => void };
const aborted = (message: string) => new DOMException(message, 'AbortError');
async function yieldWork(control: Control, stage: string, completed: number, total: number) {
  control.check?.(); control.signal?.throwIfAborted(); control.onProgress?.({ stage, completed, total });
  if (control.yieldTask) await control.yieldTask(); else await new Promise<void>(resolve => setTimeout(resolve, 0));
  control.check?.(); control.signal?.throwIfAborted();
}

/** A tiny disposable draw mesh, not a fine-cell tessellation. Its exact buffer
 * charge is admitted through the existing terrain geometry cache (one quad). */
export class DetailTerrainMesh extends Container {
  readonly terrainBuffers = { bytes: 56, vertices: 4, triangles: 2, shoreSegments: 0 };
  private readonly geometry: Geometry;
  constructor(shader: ReturnType<typeof createDetailTerrainShader>['shader'], bounds: AtlasAabb, origin: { xQ: number; yQ: number }) {
    super();
    const x = origin.xQ / 256, y = origin.yQ / 256;
    this.geometry = new Geometry({ attributes: { aPosition: { buffer: new Float32Array([
      bounds.minX-x,bounds.minY-y,bounds.maxX-x,bounds.minY-y,bounds.maxX-x,bounds.maxY-y,bounds.minX-x,bounds.maxY-y,
    ]), format: 'float32x2' } }, indexBuffer: new Uint32Array([0,1,2,0,2,3]) });
    this.geometry.autoGarbageCollect = false;
    for (const buffer of this.geometry.buffers) buffer.autoGarbageCollect = false;
    const mesh = new Mesh({ geometry: this.geometry, shader }); mesh.position.set(x,y); this.addChild(mesh);
  }
  override destroy(): void {
    if (this.destroyed) return;
    let failure: unknown;
    for (const child of [...this.children]) try { child.destroy({ children: true, texture: false, textureSource: false }); } catch (error) { failure ??= error; }
    try { this.geometry.destroy(true); } catch (error) { failure ??= error; }
    try { super.destroy({ children: false }); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  }
}

/** Derived display state for one already verified/owned immutable v4 snapshot.
 * CPU pages have an explicit separate byte ledger. Every GPU source is owned
 * by AtlasTextureCache; nothing here creates a free texture or render target. */
export class DetailTerrainBackend {
  private readonly owner = ++nextOwner;
  private readonly lifetime = new AbortController();
  private pages: Uint8Array[] = [];
  private field?: DetailCoastField;
  private preparation?: { promise: Promise<void>; signal?: AbortSignal };
  private gpuWork?: Promise<void>;
  private shader?: ReturnType<typeof createDetailTerrainShader>;
  private gpuKeys: string[] = [];
  private cache?: AtlasTextureCache;
  private gpuSerial = 0;
  private complete = false;
  private hadGpu = false;
  private pageBytes = 0;
  private baseBytes = 0;
  private chunkBytes = 0;
  private peakCpuBytes = 0;
  private completedNodes = 0;
  constructor(readonly data: AtlasGeographyView) {
    if (data.manifest.version !== 4 || !data.detailCoast) throw new Error('细地表后端只接收真实第四版完整细场。');
  }
  get gpuReady() { return !!this.shader; }
  metrics() {
    return { cpuPageBytes: this.pageBytes, cpuBaseBytes: this.baseBytes, cpuChunkBytes: this.chunkBytes, cpuBytes: this.pageBytes + this.baseBytes + this.chunkBytes, peakCpuBytes: this.peakCpuBytes,
      cpuByteLimit: layout.byteLength + this.data.manifest.spec.columns ** 2 * 24 + DETAIL_TERRAIN_PACK_NODE_LIMIT * 4,
      completedNodes: this.completedNodes, totalNodes: layout.nodeCount, complete: this.complete, gpuReady: this.gpuReady,
      nodeSourcePixels: layout.pixels, nodeSourceBytes: layout.byteLength, retainedAcrossGpuLoss: this.complete && this.hadGpu && !this.gpuReady };
  }
  private cpuCharge() {
    const bytes = this.pageBytes + this.baseBytes + this.chunkBytes;
    if (bytes > this.metrics().cpuByteLimit) throw new Error('细地表派生 CPU 数据超出固定字节预算。');
    this.peakCpuBytes = Math.max(this.peakCpuBytes,bytes);
  }
  private check(control: Control) { this.lifetime.signal.throwIfAborted(); control.signal?.throwIfAborted(); control.check?.(); }
  async prepare(control: Control = {}): Promise<void> {
    // A recovery waiter may share a preview's work, but must not inherit that
    // preview caller's later cancellation. One precisely identified cancelled
    // owner may hand off to the current still-valid caller; real failures and
    // a second cancellation propagate, rather than forming an unbounded retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      this.check(control); if (this.complete) return;
      const shared = this.preparation;
      if (shared) {
        try { await shared.promise; }
        catch (error) {
          this.check(control);
          if (attempt !== 0 || !(error instanceof Error) || error.name !== 'AbortError'
            || !shared.signal?.aborted || error !== shared.signal.reason) throw error;
          // Another waiter may already own the next preparation. Never clear
          // its slot or start a parallel writer over the same private pages.
          if (this.preparation === shared) this.preparation = undefined;
          continue;
        }
        this.check(control); return;
      }
      const work = { promise: this.prepareOwned(control), signal: control.signal }; this.preparation = work;
      try { await work.promise; this.check(control); return; }
      finally { if (this.preparation === work) this.preparation = undefined; }
    }
    throw new Error('细地表准备交接未完成。');
  }
  private async prepareOwned(control: Control) {
    try {
      // Keep extraction in a separate async frame so its input arrays and area
      // scratch have no references throughout the long page-packing phase.
      this.field=await this.prepareField(control);
      for (const page of layout.pages) {
        this.check(control); const bytes=new Uint8Array(page.byteLength);this.pages.push(bytes);this.pageBytes+=bytes.byteLength;this.cpuCharge();
        for(let offset=0;offset<page.nodeCount;offset+=DETAIL_TERRAIN_PACK_NODE_LIMIT){
          this.check(control);const count=Math.min(DETAIL_TERRAIN_PACK_NODE_LIMIT,page.nodeCount-offset);this.chunkBytes=count*4;this.cpuCharge();
          const chunk=packDetailTerrainNodeRange(this.field,page.startNode+offset,count);
          if(copyDetailTerrainChunkToPage(page.page,bytes,chunk)!==count)throw new Error('细地表节点页存在未覆盖分片。');
          this.completedNodes+=count;await yieldWork({...control,check:()=>this.check(control)},'重建真实细地表节点页',this.completedNodes,layout.nodeCount);
          this.chunkBytes=0;
        }
      }
      this.check(control);this.complete=true;
    }catch(error){this.pages=[];this.field=undefined;this.pageBytes=0;this.baseBytes=0;this.chunkBytes=0;this.completedNodes=0;this.complete=false;throw error;}
  }
  private async prepareField(control:Control):Promise<DetailCoastField>{
    const count=this.data.manifest.spec.columns**2;
    // Existing measureGeography temporarily owns area(8)+xy(8)+height(4).
    this.baseBytes=count*20;this.cpuCharge();
    const base=await extractDetailCoastBase(this.data,{signal:control.signal,
      onProgress:progress=>{this.check(control);control.onProgress?.(progress);},
      yieldTask:async()=>{if(control.yieldTask)await control.yieldTask();else await new Promise<void>(resolve=>setTimeout(resolve,0));this.check(control);}});
    this.check(control);this.baseBytes=count*24;this.cpuCharge();
    const sampleBaseElevation=createDetailShapeBaseSampler(base.size,base.centersQ,base.elevationsMeters);
    this.baseBytes=count*12;return{tiles:this.data.detailCoast!,sampleBaseElevation};
  }
  /** Each source upload is one <=4 MiB bounded allocation; yield between them.
   * The renderer provides the real WebGL2 system, never a guessed GPU backend. */
  async installGpu(renderer: WebGLRenderer, cache: AtlasTextureCache, control: Control = {}) {
    this.check(control); if (!this.complete) throw new Error('细地表节点页尚未完整，禁止显示半页。');
    if(this.shader)return;
    if(this.gpuWork){await this.gpuWork.catch(()=>undefined);this.check(control);if(this.shader)return;}
    const work=this.installOwned(renderer,cache,control);this.gpuWork=work;
    try{await work;}finally{if(this.gpuWork===work)this.gpuWork=undefined;}
  }
  private async installOwned(renderer: WebGLRenderer, cache: AtlasTextureCache, control: Control) {
    assertDetailTerrainGlCapabilities(readDetailTerrainGlCapabilities(renderer.gl));
    const serial=++this.gpuSerial,keys:string[]=[],textures:Texture[]=[];
    const check=()=>{this.check(control);if(serial!==this.gpuSerial)throw aborted('细地表 GPU 上下文已变化。');};
    try{
      for(const page of layout.pages){
        check();const key=`detail-node-pages/${this.owner}/${serial}/${page.page}`;
        const texture=cache.ensureShared(key,page.width,page.height,()=>new Texture({source:new BufferImageSource({resource:this.pages[page.page],width:page.width,height:page.height,
          format:'rgba8unorm',alphaMode:'no-premultiply-alpha',scaleMode:'nearest',autoGenerateMipmaps:false,mipLevelCount:1,autoGarbageCollect:false,resolution:1})}),new Set());
        keys.push(key);textures.push(texture);renderer.texture.initSource(texture.source);
        await yieldWork({...control,check},'上传已核验细地表节点页',page.page+1,layout.pages.length);
      }
      check();const materials=ensureTerrainMaterials(cache);
      const shader=createDetailTerrainShader({gl:renderer.gl,pages:textures.map(texture=>texture.source),landLut:materials.land.source,seaLut:materials.sea.source,originQ:{xQ:0,yQ:0}});
      this.shader=shader;this.gpuKeys=keys;this.cache=cache;this.hadGpu=true;
    }catch(error){let releaseFailure:unknown;for(const key of keys)try{cache.releaseShared(key);}catch(failure){releaseFailure??=failure;}if(releaseFailure)throw releaseFailure;throw error;}
  }
  setDrawOrigin(origin:{xQ:number;yQ:number}) { if(!this.shader)throw new Error('细地表 GPU 尚未就绪。');this.shader.setOriginQ(origin); }
  createMesh(bounds:AtlasAabb,origin:{xQ:number;yQ:number}) { if(!this.shader)throw new Error('细地表 GPU 尚未就绪。');return new DetailTerrainMesh(this.shader.shader,bounds,origin); }
  pick(point:{x:number;y:number}) { if(!this.complete||!this.field)throw new Error('真实细场尚未完整。');return pickDetailCoastSurface(this.field,point); }
  /** Renderer must first destroy geometry that borrows this shader. CPU pages
   * deliberately survive a context loss and are reported in metrics. */
  releaseGpu() {
    this.gpuSerial++;let failure:unknown;
    try{this.shader?.destroy();}catch(error){failure=error;}this.shader=undefined;
    if(this.cache)for(const key of this.gpuKeys)try{this.cache.releaseShared(key);}catch(error){failure??=error;}
    this.gpuKeys=[];this.cache=undefined;if(failure)throw failure;
  }
  destroy() {
    this.lifetime.abort(aborted('细地表快照已卸载。'));
    try{this.releaseGpu();}finally{this.pages=[];this.field=undefined;this.pageBytes=0;this.baseBytes=0;this.chunkBytes=0;this.completedNodes=0;this.complete=false;}
  }
}
