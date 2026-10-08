import {afterEach,describe,it,expect,vi} from 'vitest';
import {Culture47Client} from './culture47-client';
import type {Culture47Response} from './culture47.worker';
import type {Culture47Journal} from './culture47-session';
import {Culture47Unavailable} from './culture47-contract';
import {readFileSync} from 'node:fs';
import frozen from './culture47-frozen.json';
class FakeWorker{
  static latest:FakeWorker;
  onmessage?: (e:{data:Culture47Response})=>void;onerror?:()=>void;onmessageerror?:()=>void;
  request?:{id:number};terminated=false;
  constructor(){FakeWorker.latest=this;}
  postMessage(request:{id:number}){this.request=request;}
  terminate(){this.terminated=true;}
  respond(data:Omit<Culture47Response,'id'>){this.onmessage?.({data:{id:this.request!.id,...data}});}
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
const j={engine:__CULTURE47_ENGINE__,id:'fixture',actions:[]} as unknown as Culture47Journal;
describe('culture worker request boundaries',()=>{
  it('a cancellable original replay is not declared stalled for lacking a progress protocol',async()=>{
    const entry=frozen[1],bytes=readFileSync('compat/culture47/'+entry.file),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    vi.stubGlobal('Worker',FakeWorker);vi.stubGlobal('fetch',async()=>({ok:true,arrayBuffer:async()=>buffer}));vi.useFakeTimers();
    const c=new Culture47Client(entry.engine),controller=new AbortController(),p=c.verify({...j,engine:entry.engine},{signal:controller.signal,longReplay:true}),rejected=expect(p).rejects.toBeInstanceOf(Culture47Unavailable);
    await vi.waitFor(()=>expect(FakeWorker.latest.request).toBeDefined());await vi.advanceTimersByTimeAsync(180001);expect(c.isClosed).toBe(false);controller.abort();await rejected;
  });
  it('progress cannot complete a pending request; only matching ACK confirms verification',async()=>{
    vi.stubGlobal('Worker',FakeWorker);const c=new Culture47Client(),progress=vi.fn();let completed=false;
    const p=c.verify(j,{progress}).then(v=>{completed=true;return v;});await vi.waitFor(()=>expect(FakeWorker.latest.request).toBeDefined());
    const w=FakeWorker.latest;w.respond({progress:{stage:'opening',completed:0,total:0,ticks:0}});await Promise.resolve();expect(completed).toBe(false);expect(progress).toHaveBeenCalledTimes(1);
    w.respond({verified:{engine:j.engine,worldId:j.id,actions:0,source:'witness'}});expect(await p).toBe('witness');c.close();
  });
  it('abort terminates the candidate and ignores a late response',async()=>{
    vi.stubGlobal('Worker',FakeWorker);const c=new Culture47Client(),signal=new AbortController(),p=c.verify(j,{signal:signal.signal});const rejected=expect(p).rejects.toBeInstanceOf(Culture47Unavailable);await vi.waitFor(()=>expect(FakeWorker.latest.request).toBeDefined());signal.abort();await rejected;
    expect(FakeWorker.latest.terminated).toBe(true);FakeWorker.latest.respond({verified:{engine:j.engine,worldId:j.id,actions:0,source:'replay'}});expect(c.isClosed).toBe(true);
  });
  it('incorrect ACK identity fails closed, not as damaged save data',async()=>{
    vi.stubGlobal('Worker',FakeWorker);const c=new Culture47Client(),p=c.verify(j);const rejected=expect(p).rejects.toBeInstanceOf(Culture47Unavailable);await vi.waitFor(()=>expect(FakeWorker.latest.request).toBeDefined());FakeWorker.latest.respond({verified:{engine:j.engine,worldId:'another-world',actions:0,source:'witness'}});await rejected;expect(c.isClosed).toBe(true);
  });
});
