import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FmsBiomeClient } from './biome-client';
import { fmsBiomeTransfer, runFmsBiomeRequest, type FmsBiomeRequest } from './biome.worker';
import { deriveFmsBiomeSurface } from './biome-surface';
import type { FmsDocument } from './model';

export function biomeFixture():FmsDocument{return {format:'lieguoji-fms-world',version:1,worldId:'00000000-0000-4000-8000-000000000001',revision:4,width:20,height:10,points:[[0,0],[20,0],[20,10],[0,10]],triangles:Uint32Array.of(0,1,2,0,2,3),neighbors:[[1,2,3],[0,2],[0,1,3],[0,2]],elevations:Int32Array.of(0,80,80,0)};}
class FakeWorker {
  static instances:FakeWorker[]=[];
  onmessage:((event:MessageEvent)=>void)|null=null;
  onerror:((event:ErrorEvent)=>void)|null=null;
  onmessageerror:(()=>void)|null=null;
  messages:FmsBiomeRequest[]=[];
  terminate=vi.fn();
  postMessage=vi.fn((request:FmsBiomeRequest,transfer?:Transferable[])=>this.messages.push(structuredClone(request,transfer?{transfer}:undefined)));
  constructor(){FakeWorker.instances.push(this);}
  reply(raw:unknown=runFmsBiomeRequest(this.messages.at(-1))){this.onmessage?.({data:raw} as MessageEvent);}
}
const clients:FmsBiomeClient[]=[];
function client(timeout?:number){const c=new FmsBiomeClient(timeout);clients.push(c);return c;}
const active=()=>FakeWorker.instances.at(-1)!;
beforeEach(()=>{FakeWorker.instances=[];vi.stubGlobal('Worker',FakeWorker);});
afterEach(()=>{clients.splice(0).forEach(c=>c.close());vi.unstubAllGlobals();vi.useRealTimers();});
describe('isolated optional climate Worker',()=>{
  it('matches the existing climate/river result without detaching input arrays',async()=>{
    const doc=biomeFixture(),before=structuredClone(doc),expected=deriveFmsBiomeSurface(doc);
    const pending=client().compute(doc,new AbortController().signal);active().reply();
    expect((await pending).surface).toEqual(expected);expect(doc).toEqual(before);
    expect(active().postMessage.mock.calls[0][1]).toBeUndefined();
  });
  it('transfers only derived output arrays and preserves request terrain',()=>{
    const doc=biomeFixture(),result=runFmsBiomeRequest({requestId:1,document:doc});
    if(result.kind!=='biome')throw Error('fixture failed');
    const transferred=structuredClone(result,{transfer:fmsBiomeTransfer(result.surface)});
    expect(result.surface.colors.byteLength).toBe(0);expect(transferred.surface.colors.length).toBe(12);expect(doc.elevations.byteLength).toBe(16);
  });
  it.each(['requestId','worldId','baseRevision','typed','nan','length','counts','riverIndex','shapeNaN','shapeOutside','shapeLength','shapeBytes'] as const)('rejects wrong or malformed %s results and restarts cleanly',async fault=>{
    const c=client(),pending=c.compute(biomeFixture(),new AbortController().signal),worker=active();
    const rejected=expect(pending).rejects.toThrow('数据无效'),response=runFmsBiomeRequest(worker.messages[0]);
    if(response.kind!=='biome')throw Error('fixture failed');
    if(fault==='requestId')response.requestId++;
    if(fault==='worldId')response.worldId='other';
    if(fault==='baseRevision')response.baseRevision++;
    if(fault==='typed')Object.assign(response.surface,{colors:new Uint8Array(12)});
    if(fault==='nan')response.surface.colors[0]=NaN;
    if(fault==='length')response.surface.ids=new Uint8Array(0);
    if(fault==='counts')response.surface.stats.counts[0]++;
    if(fault==='riverIndex')response.surface.rivers.segments=[[99,0]];
    if(fault.startsWith('shape')){
      const shape=response.surface.rivers.shape;shape.positions=new Float32Array(6);shape.stats.bytes=24;shape.stats.triangles=1;
      if(fault==='shapeNaN')shape.positions[0]=NaN;
      if(fault==='shapeOutside')shape.positions[0]=999;
      if(fault==='shapeLength')shape.positions=new Float32Array(7);
      if(fault==='shapeBytes')shape.stats.bytes=0;
    }
    worker.reply(response);await rejected;expect(worker.terminate).toHaveBeenCalledOnce();
    const next=c.compute(biomeFixture(),new AbortController().signal);active().reply();await expect(next).resolves.toHaveProperty('surface');
  });
  it('terminates cancelled work and ignores a captured late handler while the next request runs',async()=>{
    const c=client(),abort=new AbortController(),a=c.compute(biomeFixture(),abort.signal),old=active(),late=old.onmessage!;
    const response=runFmsBiomeRequest(old.messages[0]),rejected=expect(a).rejects.toMatchObject({name:'AbortError'});abort.abort();await rejected;
    const b=c.compute(biomeFixture(),new AbortController().signal);late({data:response} as MessageEvent);active().reply();
    await expect(b).resolves.toHaveProperty('surface');expect(old.terminate).toHaveBeenCalledOnce();
  });
  it.each(['timeout','error','messageerror','close'] as const)('settles %s and removes pending callbacks',async fault=>{
    vi.useFakeTimers();const c=client(50),pending=c.compute(biomeFixture(),new AbortController().signal),worker=active(),rejected=expect(pending).rejects.toBeInstanceOf(Error);
    if(fault==='timeout')vi.advanceTimersByTime(51);
    if(fault==='error')worker.onerror?.({preventDefault:vi.fn()} as unknown as ErrorEvent);
    if(fault==='messageerror')worker.onmessageerror?.();
    if(fault==='close')c.close();
    await rejected;expect(worker.terminate).toHaveBeenCalledOnce();expect(worker.onmessage).toBeNull();expect(vi.getTimerCount()).toBe(0);
  });
  it('refuses pre-aborted/closed requests without creating a Worker',async()=>{
    const c=client(),abort=new AbortController();abort.abort();await expect(c.compute(biomeFixture(),abort.signal)).rejects.toMatchObject({name:'AbortError'});
    c.close();await expect(c.compute(biomeFixture(),new AbortController().signal)).rejects.toMatchObject({name:'AbortError'});expect(FakeWorker.instances).toHaveLength(0);
  });
  it('handles Worker startup and clone failures without hanging or late listeners',async()=>{
    vi.useFakeTimers();const c=client();
    vi.stubGlobal('Worker',class {constructor(){throw Error('startup');}});
    await expect(c.compute(biomeFixture(),new AbortController().signal)).rejects.toThrow('startup');expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal('Worker',FakeWorker);
    const a=c.compute(biomeFixture(),new AbortController().signal);active().reply();await a;
    const old=active();old.postMessage.mockImplementationOnce(()=>{throw Error('clone');});
    await expect(c.compute(biomeFixture(),new AbortController().signal)).rejects.toThrow('clone');expect(vi.getTimerCount()).toBe(0);expect(old.terminate).toHaveBeenCalledOnce();expect(old.onmessage).toBeNull();
  });
  it('reports Worker validation failure without deriving on the main thread',async()=>{
    const pending=client().compute({...biomeFixture(),width:0},new AbortController().signal);active().reply();await expect(pending).rejects.toThrow();
    expect(runFmsBiomeRequest(null).kind).toBe('error');
  });
});
