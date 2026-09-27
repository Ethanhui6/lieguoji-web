import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { WebGLRenderer } from 'pixi.js';
import { DetailTerrainBackend, DETAIL_TERRAIN_SHARED_PIXELS } from './detail-terrain-backend';
import { AtlasTextureCache } from './atlas-texture-cache';
import { createGenerationDraft } from './generation-format';
import type { AtlasGeographyView } from './model';
import { detailCoastKey, detailCoastOwnerLayout } from './detail-coast-types';
import { hashDetailCoastTile } from './detail-coast-codec';

const boundary=vi.hoisted(()=>({uploaded:vi.fn(),factory:vi.fn(),shaderDestroyed:vi.fn(),origin:vi.fn()}));
vi.mock('./detail-terrain-shader',()=>({
  assertDetailTerrainGlCapabilities:vi.fn(),readDetailTerrainGlCapabilities:()=>({webGL2:true}),
  createDetailTerrainShader:(options:unknown)=>{boundary.factory(options);return{shader:{},destroy:()=>boundary.shaderDestroyed(),setOriginQ:boundary.origin};},
}));
vi.mock('pixi.js',()=>{
  class Container {children:Container[]=[];destroyed=false;position={set(){}};addChild(child:Container){this.children.push(child);return child;}destroy(){this.destroyed=true;}}
  class BufferImageSource {destroyed=false;pixelWidth:number;pixelHeight:number;resource:Uint8Array;constructor(options:{width:number;height:number;resource:Uint8Array}){this.pixelWidth=options.width;this.pixelHeight=options.height;this.resource=options.resource;}destroy(){this.destroyed=true;}}
  class Texture {destroyed=false;source:BufferImageSource;constructor(options:{source:BufferImageSource}){this.source=options.source;}destroy(source:boolean){this.destroyed=true;if(source)this.source.destroy();}}
  class Geometry {autoGarbageCollect=false;buffers=[];constructor(options:unknown){void options;}destroy(){}}
  class Mesh extends Container {constructor(options:unknown){super();void options;}}
  class Graphics extends Container {}
  class RenderTexture extends Texture {}
  class Sprite extends Container {}
  class Rectangle {}
  return{Container,BufferImageSource,Texture,Geometry,Mesh,Graphics,RenderTexture,Sprite,Rectangle};
});

let source:AtlasGeographyView;
beforeAll(async()=>{
  const document=await createGenerationDraft({size:128,seed:'backend-pages',name:'真实细场显示测试'},{yieldTask:async()=>{}},4);
  const owner=detailCoastOwnerLayout(0,0),coverageQ=new Int16Array(owner.count).fill(-32767),elevationMeters=new Int16Array(owner.count).fill(-17);
  // This local sample is deliberately independent of the zero coarse heights.
  for(const [x,y]of[[4,4],[5,4],[5,5],[4,5]]){coverageQ[y*owner.width+x]=32767;elevationMeters[y*owner.width+x]=231;}
  const tile={format:'lieguoji-detail-coast-tile' as const,version:1 as const,bx:0,by:0,mode:'samples' as const,coverageQ,elevationMeters};
  document.detailCoast.set(detailCoastKey(0,0),tile);document.manifest.detailCoast.refs=[{bx:0,by:0,hash:await hashDetailCoastTile(tile)}];source=document;
},30000);
const renderer={gl:{},texture:{initSource:boundary.uploaded}} as unknown as WebGLRenderer;

describe('v4 field/page/GPU lifecycle (GPU allocation boundary mocked)',()=>{
  it('hands a cancelled preview preparation to a valid recovery waiter without masking unrelated errors',async()=>{
    const backend=new DetailTerrainBackend(source),preview=new AbortController(),recovery=new AbortController();
    const previewReason=new DOMException('preview cancelled','AbortError'),stopRecovery=new DOMException('bounded recovery stop','AbortError');
    let announcePacking!:()=>void,releasePacking!:()=>void,packing=false;
    const reachedPacking=new Promise<void>(resolve=>{announcePacking=resolve;}),gate=new Promise<void>(resolve=>{releasePacking=resolve;});
    const first=backend.prepare({signal:preview.signal,onProgress:value=>{if(value.stage==='重建真实细地表节点页'){expect(value.completed).toBe(4096);packing=true;announcePacking();}},
      yieldTask:async()=>{if(packing)await gate;}}).catch(error=>error);
    await reachedPacking;
    // Same ordering as preview -> context restore waits -> user cancellation:
    // the recovery waiter exists while the original writer is still parked.
    const recoveryProgress:number[]=[];
    const second=backend.prepare({signal:recovery.signal,yieldTask:async()=>{},onProgress:value=>{
      if(value.stage==='重建真实细地表节点页'){recoveryProgress.push(value.completed);recovery.abort(stopRecovery);}
    }}).catch(error=>error);
    preview.abort(previewReason);releasePacking();
    expect(await first).toBe(previewReason);expect(await second).toBe(stopRecovery);
    expect(recoveryProgress).toEqual([4096]);expect(backend.metrics()).toMatchObject({complete:false,cpuBytes:0,completedNodes:0});backend.destroy();

    // An unrelated failure from the shared writer must reach both callers;
    // it is not a cancellation handoff even when a second waiter is present.
    const failed=new DetailTerrainBackend(source),failure=new Error('actual extraction failure');let yields=0;
    const owner=failed.prepare({yieldTask:async()=>{yields++;throw failure;}}).catch(error=>error);
    const waiter=failed.prepare({yieldTask:async()=>{yields++;}}).catch(error=>error);
    expect(await owner).toBe(failure);expect(await waiter).toBe(failure);expect(yields).toBe(1);failed.destroy();
  },30000);
  it('does not expose partial pages, yields after real packing and discards cancelled CPU resources',async()=>{
    const backend=new DetailTerrainBackend(source),controller=new AbortController(),progress:Array<{stage:string;completed:number;total:number}>=[];
    await expect(backend.prepare({signal:controller.signal,yieldTask:async()=>{},onProgress:value=>{
      progress.push(value);if(value.stage==='重建真实细地表节点页'){expect(value.completed).toBe(4096);expect(backend.metrics()).toMatchObject({complete:false,gpuReady:false,completedNodes:4096,cpuChunkBytes:16384});controller.abort();}
    }})).rejects.toMatchObject({name:'AbortError'});
    expect(progress.some(value=>value.stage==='读取细海岸实际粗格重心')).toBe(true);
    expect(backend.metrics()).toMatchObject({cpuBytes:0,completedNodes:0,complete:false,gpuReady:false});
    await expect(backend.installGpu(renderer,new AtlasTextureCache())).rejects.toThrow('禁止显示半页');backend.destroy();
  },30000);
  it('retains a complete exact CPU field on GPU loss, rolls back interrupted uploads and restores through the same ledger',async()=>{
    const backend=new DetailTerrainBackend(source),cache=new AtlasTextureCache(),progress: number[]=[];
    await backend.prepare({yieldTask:async()=>{},onProgress:value=>{if(value.stage==='重建真实细地表节点页')progress.push(value.completed);}});
    expect(progress[0]).toBe(4096);expect(progress.at(-1)).toBe(2049**2);expect(backend.metrics()).toMatchObject({complete:true,cpuPageBytes:16797696,cpuBaseBytes:128*128*12,cpuChunkBytes:0,gpuReady:false});
    expect(backend.metrics().peakCpuBytes).toBeLessThanOrEqual(backend.metrics().cpuByteLimit);
    expect(backend.pick({x:9,y:9})).toMatchObject({land:true,height:231});expect(backend.pick({x:20,y:20})).toMatchObject({land:false,height:-17});
    const controller=new AbortController();boundary.uploaded.mockClear();boundary.factory.mockClear();
    await expect(backend.installGpu(renderer,cache,{signal:controller.signal,yieldTask:async()=>{},onProgress:value=>{if(value.completed===2)controller.abort();}})).rejects.toMatchObject({name:'AbortError'});
    expect(boundary.uploaded).toHaveBeenCalledTimes(2);expect(boundary.factory).not.toHaveBeenCalled();expect(cache.stats()).toMatchObject({pixels:0,sharedEntries:0,reservedPixels:0});
    await backend.installGpu(renderer,cache,{yieldTask:async()=>{}});expect(backend.gpuReady).toBe(true);expect(cache.stats()).toMatchObject({pixels:DETAIL_TERRAIN_SHARED_PIXELS,sharedEntries:7});
    const options=boundary.factory.mock.calls.at(-1)![0] as {pages:Array<{resource:Uint8Array}>};expect(options.pages[4].resource.byteLength).toBe(20480);
    const mesh=backend.createMesh({minX:0,minY:0,maxX:64,maxY:64},{xQ:0,yQ:0});expect(mesh.terrainBuffers).toEqual({bytes:56,vertices:4,triangles:2,shoreSegments:0});mesh.destroy();
    backend.releaseGpu();expect(backend.metrics()).toMatchObject({gpuReady:false,complete:true,retainedAcrossGpuLoss:true,cpuPageBytes:16797696});cache.clear();
    expect(cache.stats()).toMatchObject({pixels:0,sharedEntries:0});await backend.installGpu(renderer,cache,{yieldTask:async()=>{}});
    expect(cache.stats().peakPixels).toBeLessThanOrEqual(cache.budgetPixels);expect(backend.pick({x:9,y:9})).toMatchObject({land:true,height:231});
    backend.destroy();cache.clear();expect(backend.metrics().cpuBytes).toBe(0);expect(cache.stats().pixels).toBe(0);expect(cache.stats().sharedCreated).toBe(cache.stats().sharedDestroyed);
  },60000);
  it('closes a destroyed snapshot during a cooperative coarse extraction without making a shader',async()=>{
    const backend=new DetailTerrainBackend(source);boundary.factory.mockClear();
    await expect(backend.prepare({yieldTask:async()=>backend.destroy()})).rejects.toMatchObject({name:'AbortError'});
    expect(backend.metrics()).toMatchObject({cpuBytes:0,complete:false,gpuReady:false});expect(boundary.factory).not.toHaveBeenCalled();
  },30000);
});
