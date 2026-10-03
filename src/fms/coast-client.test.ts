import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FmsCoastClient, type FmsCoastRequest } from './coast-client';
import { runFmsCoastRequest } from './coast.worker';
import { coastFixture } from '../../tests/helpers/fms-coast-metrics';
const options={seed:1337,maxOffset:4};
class WorkerDouble {
  static all:WorkerDouble[]=[];
  onmessage:((event:MessageEvent)=>void)|null=null;onerror:(()=>void)|null=null;onmessageerror:(()=>void)|null=null;
  messages:FmsCoastRequest[]=[];terminate=vi.fn();
  postMessage=vi.fn((request:FmsCoastRequest)=>{this.messages.push(structuredClone(request));});
  constructor(){WorkerDouble.all.push(this);}
  reply(raw:unknown=runFmsCoastRequest(this.messages.at(-1))){this.onmessage?.({data:raw} as MessageEvent);}
}
const clients:FmsCoastClient[]=[];
const client=(timeout?:number)=>{const value=new FmsCoastClient(timeout);clients.push(value);return value;};
const worker=()=>WorkerDouble.all.at(-1)!;
beforeEach(()=>{WorkerDouble.all=[];vi.stubGlobal('Worker',WorkerDouble);});
afterEach(()=>{clients.splice(0).forEach(c=>c.close());vi.unstubAllGlobals();vi.useRealTimers();vi.restoreAllMocks();});
describe('coast Worker lifecycle and owned preview',()=>{
  it.each([false,true])('routes smoothing (resample=%s) and refuses a response for the other mode',async resample=>{
    const chosen={maxOffset:4,...(resample?{resample:true as const}:{})},doc=coastFixture('neck'),original=structuredClone(doc),c=client(),pending=c.smooth(doc,chosen);
    expect(worker().messages[0].kind).toBe('smooth-coast');doc.elevations.fill(0);worker().reply();const answer=await pending;
    expect(answer.result.moves.length).toBeGreaterThan(0);expect(answer.document.elevations.slice(0,original.points.length)).toEqual(original.elevations);expect(answer.document.points.length).toBe(original.points.length+answer.result.stats.addedPoints);
    const next=c.smooth(original,chosen),reject=expect(next).rejects.toThrow();
    const response=runFmsCoastRequest(worker().messages.at(-1));worker().reply({...response,kind:'refined-coast'});await reject;
  });
  it('cancels smoothing without a late completion, then switches safely to microdetail',async()=>{
    const c=client(),pending=c.smooth(coastFixture('neck'),{maxOffset:4}),old=worker(),late=old.onmessage!,raw=runFmsCoastRequest(old.messages[0]);
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});c.cancel();await rejected;
    const next=c.refine(coastFixture('neck'),options);late({data:raw} as MessageEvent);worker().reply();expect((await next).result.splits.length).toBeGreaterThan(0);
  });
  it('returns a validated full mesh, owns input snapshot, reuses a healthy Worker and never transfers source',async()=>{
    const doc=coastFixture('neck'),original=structuredClone(doc),chosen={...options},c=client(),pending=c.refine(doc,chosen);
    doc.elevations.fill(0);chosen.maxOffset=0;worker().reply();const answer=await pending;
    expect(answer.document.points.length).toBeGreaterThan(original.points.length);expect(answer.document.elevations.slice(0,original.points.length)).toEqual(original.elevations);
    expect(worker().postMessage.mock.calls[0]).toHaveLength(1);expect(doc.elevations.byteLength).toBe(original.elevations.byteLength);
    const next=c.refine(original,options);worker().reply();await next;expect(WorkerDouble.all).toHaveLength(1);
  });
  it('cancels, ignores a late old-worker response and allows a fresh request',async()=>{
    const c=client(),signal=new AbortController(),pending=c.refine(coastFixture('neck'),options,{signal:signal.signal});
    const old=worker(),late=old.onmessage!,raw=runFmsCoastRequest(old.messages[0]),reject=expect(pending).rejects.toMatchObject({name:'AbortError'});
    signal.abort();await reject;expect(old.terminate).toHaveBeenCalledOnce();expect(old.onmessage).toBeNull();
    const next=c.refine(coastFixture('neck'),options);late({data:raw} as MessageEvent);worker().reply();expect((await next).result.splits.length).toBeGreaterThan(0);
  });
  it('rejects pre-aborted, busy and closed requests without disrupting the active computation',async()=>{
    const c=client(),controller=new AbortController();controller.abort();await expect(c.refine(coastFixture('neck'),options,{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
    expect(WorkerDouble.all).toHaveLength(0);const pending=c.refine(coastFixture('neck'),options);
    await expect(c.refine(coastFixture('neck'),options)).rejects.toThrow('仍在');worker().reply();await pending;c.close();await expect(c.refine(coastFixture('neck'),options)).rejects.toThrow('关闭');
  });
  it.each(['request','revision','point','stats','options','error','messageerror','workererror'] as const)('rejects %s failures and supports retry',async fault=>{
    const c=client(),pending=c.refine(coastFixture('neck'),options),response=runFmsCoastRequest(worker().messages[0]);
    if(response.kind!=='refined-coast')throw new Error('Fixture must refine');
    const rejected=expect(pending).rejects.toBeInstanceOf(Error);
    if(fault==='request')response.requestId++;
    if(fault==='revision')response.result.baseRevision++;
    if(fault==='point')response.result.splits[0].point=[0,0];
    if(fault==='stats')response.result.stats.maxAreaFraction=0;
    if(fault==='options')response.result.options.maxOffset=0;
    if(fault==='error')worker().reply({kind:'error',requestId:response.requestId,worldId:response.result.worldId,baseRevision:response.result.baseRevision,message:'fixture error'});
    else if(fault==='messageerror')worker().onmessageerror?.();else if(fault==='workererror')worker().onerror?.();else worker().reply(response);
    await rejected;expect(worker().terminate).toHaveBeenCalledOnce();const retry=c.refine(coastFixture('neck'),options);worker().reply();await retry;
  });
  it('timeouts stop the worker and late output cannot revive a failed request',async()=>{
    vi.useFakeTimers();const c=client(20),pending=c.refine(coastFixture('neck'),options),rejection=expect(pending).rejects.toThrow('超时');
    const old=worker(),late=old.onmessage!;await vi.advanceTimersByTimeAsync(20);await rejection;
    late({data:runFmsCoastRequest(old.messages[0])} as MessageEvent);expect(old.terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
    const retry=c.refine(coastFixture('neck'),options);worker().reply();await retry;expect(vi.getTimerCount()).toBe(0);
  });
  it('drops completion listeners and catches clone/send failure',async()=>{
    const c=client(),controller=new AbortController(),first=c.refine(coastFixture('neck'),options,{signal:controller.signal});worker().reply();await first;
    const next=c.refine(coastFixture('neck'),options);controller.abort();worker().reply();await next;
    worker().postMessage.mockImplementationOnce(()=>{throw new Error('clone failed');});await expect(c.refine(coastFixture('neck'),options)).rejects.toThrow('发送');
  });
  it('worker rejects unknown fields and invalid documents without throwing out of the handler',()=>{
    for(const value of [null,{}, {kind:'refine-coast',requestId:1,document:coastFixture('neck'),options,extra:true},
      {kind:'refine-coast',requestId:1,document:{...coastFixture('neck'),version:9},options}])expect(runFmsCoastRequest(value).kind).toBe('error');
  });
});
