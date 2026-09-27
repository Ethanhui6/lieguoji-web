import { describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Texture } from 'pixi.js';
import { AtlasTextureCache, type AtlasTextureSpec } from './atlas-texture-cache';

// Only allocation/release boundary is mocked. Pixel reservations, source
// identity, alias release, eviction and failure locking are the real cache.
vi.mock('pixi.js',()=>{
  class BufferImageSource { destroyed=false;pixelWidth:number;pixelHeight:number; constructor(options:{width:number;height:number}){this.pixelWidth=options.width;this.pixelHeight=options.height;} destroy(){this.destroyed=true;} }
  class Texture {destroyed=false;source:BufferImageSource;constructor(options:{source:BufferImageSource}){this.source=options.source;}destroy(source:boolean){this.destroyed=true;if(source)this.source.destroy();}}
  class RenderTexture extends Texture {static create(options:{width:number;height:number}){return new RenderTexture({source:new BufferImageSource(options)});}}
  class Sprite {destroyed=false;visible=false;position={set(){}};scale={set(){}};constructor(texture:unknown){void texture;}destroy(){this.destroyed=true;}}
  class Rectangle {constructor(...values:number[]){void values;}}
  return{BufferImageSource,Texture,RenderTexture,Sprite,Rectangle};
});
const texture=(width=10,height=10)=>new Texture({source:new BufferImageSource({width,height,resource:new Uint8Array(width*height*4)})});
const spec=(key:string):AtlasTextureSpec=>({key,blockKey:'geometry:0:0',layer:'terrain',level:0,pixelWidth:10,pixelHeight:10,worldX:0,worldY:0,sampleX:0,sampleY:0,density:1,core:{x:0,y:0,width:10,height:10},dependencies:['geometry:0:0']});

describe('shared detail sources stay inside the original texture ledger',()=>{
  it('counts a source once even when a second texture wrapper/key borrows it, and releases only its last key',()=>{
    const cache=new AtlasTextureCache(300),original=cache.ensureShared('first',10,10,()=>texture());
    const destroySource=vi.spyOn(original.source,'destroy'),second=new Texture({source:original.source}),destroyWrapper=vi.spyOn(second,'destroy');
    expect(cache.ensureShared('second',10,10,()=>second)).toBe(original);
    expect(destroyWrapper).toHaveBeenCalledWith(false);
    expect(cache.stats()).toMatchObject({pixels:100,sharedPixels:100,sharedEntries:1,sharedBindings:2,sharedCreated:1});
    cache.releaseShared('first');expect(destroySource).not.toHaveBeenCalled();expect(cache.stats().pixels).toBe(100);
    cache.releaseShared('second');expect(destroySource).toHaveBeenCalledTimes(1);expect(cache.stats()).toMatchObject({pixels:0,sharedCreated:1,sharedDestroyed:1});
    cache.clear();expect(destroySource).toHaveBeenCalledTimes(1);
  });
  it('evicts an unprotected target before creating a real detail source and refuses protected allocations before the factory',()=>{
    const cache=new AtlasTextureCache(150);cache.ensure(spec('old'),()=>undefined,new Set());
    const create=vi.fn(()=>texture());cache.ensureShared('page',10,10,create,new Set());
    expect(create).toHaveBeenCalledTimes(1);expect(cache.stats()).toMatchObject({pixels:100,entries:0,evictions:1,sharedPixels:100});
    const denied=vi.fn(()=>texture());expect(()=>cache.ensureShared('other',10,10,denied,new Set())).toThrow('像素预算');
    expect(denied).not.toHaveBeenCalled();expect(cache.stats().reservedPixels).toBe(0);cache.clear();
  });
  it('preserves the legacy default that protects cached targets while installing material tables',()=>{
    const cache=new AtlasTextureCache(150);cache.ensure(spec('keep'),()=>undefined,new Set());
    const create=vi.fn(()=>texture());expect(()=>cache.ensureShared('material',10,10,create)).toThrow('像素预算');
    expect(create).not.toHaveBeenCalled();expect(cache.has('keep')).toBe(true);cache.clear();
  });
  it('does not destroy the existing canonical wrapper when an invalid alias request is rejected',()=>{
    const cache=new AtlasTextureCache(300),original=cache.ensureShared('valid',10,10,()=>texture());
    expect(()=>cache.ensureShared('wrong-dimensions',5,20,()=>original)).toThrow('像素账');
    expect(original.destroyed).toBe(false);expect(original.source.destroyed).toBe(false);expect(cache.stats()).toMatchObject({pixels:100,sharedEntries:1,reservedPixels:0});cache.clear();
  });
  it('retains an uncertain failed source release in the ledger and locks allocations',()=>{
    const cache=new AtlasTextureCache(300),source=cache.ensureShared('page',10,10,()=>texture());
    vi.spyOn(source,'destroy').mockImplementationOnce(()=>{throw new Error('release unknown');});
    expect(()=>cache.releaseShared('page')).toThrow('release unknown');expect(cache.stats()).toMatchObject({pixels:100,sharedEntries:1,releaseFailures:1});
    expect(()=>cache.ensureShared('new',10,10,()=>texture())).toThrow('release unknown');
    cache.clear();expect(cache.stats()).toMatchObject({pixels:0,sharedCreated:1,sharedDestroyed:1});
  });
});
