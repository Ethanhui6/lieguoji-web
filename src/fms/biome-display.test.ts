import { describe, expect, it, vi } from 'vitest';
import { FmsBiomeDisplay, type FmsBiomeDisplayState } from './biome-display';
import type { FmsBiomeComputer, FmsBiomeResult } from './biome-client';
import { deriveFmsBiomeSurface } from './biome-surface';
import type { FmsDocument } from './model';

function fixture():FmsDocument{return {format:'lieguoji-fms-world',version:1,worldId:'00000000-0000-4000-8000-000000000001',revision:0,width:20,height:10,points:[[0,0],[20,0],[20,10],[0,10]],triangles:Uint32Array.of(0,1,2,0,2,3),neighbors:[[1,2,3],[0,2],[0,1,3],[0,2]],elevations:Int32Array.of(0,80,80,0)};}
class Deferred implements FmsBiomeComputer {
  calls:{doc:FmsDocument;signal:AbortSignal;resolve:(r:FmsBiomeResult)=>void;reject:(e:Error)=>void}[]=[];
  compute(doc:FmsDocument,signal:AbortSignal){return new Promise<FmsBiomeResult>((resolve,reject)=>this.calls.push({doc,signal,resolve,reject}));}
  close=vi.fn();
  reply(i:number){const request=this.calls[i];request.resolve({surface:deriveFmsBiomeSurface(request.doc),elapsedMs:42});}
}
const tick=()=>Promise.resolve();
describe('latest document and display own asynchronous climate',()=>{
  it.each(['undo','redo','cancel','candidate'])('never lets a late previous result overwrite the %s target',async()=>{
    const compute=new Deferred(),states:FmsBiomeDisplayState[]=[],view=new FmsBiomeDisplay(s=>states.push(s),compute),doc=fixture(),target={...doc,elevations:Int32Array.of(0,35,45,0)};
    view.select(doc,'biome');expect(view.snapshot()).toMatchObject({display:'height',pending:true});
    view.select(target,'biome');expect(compute.calls[0].signal.aborted).toBe(true);
    compute.reply(1);await tick();const correct=view.snapshot();compute.reply(0);await tick();
    expect(view.snapshot()).toBe(correct);expect(correct.surface).toEqual(deriveFmsBiomeSurface(target));expect(states).toHaveLength(3);expect(view.metrics().builds).toBe(1);
  });
  it('switches to relief immediately and ignores late success or failure',async()=>{
    const c=new Deferred(),changed=vi.fn(),view=new FmsBiomeDisplay(changed,c),doc=fixture();
    view.select(doc,'biome');view.select(doc,'relief');c.reply(0);await tick();
    expect(view.snapshot()).toEqual({requested:'relief',display:'relief',pending:false});
    view.select(doc,'biome');view.select(doc,'height');c.calls[1].reject(Error('old failure'));await tick();expect(view.snapshot().error).toBeUndefined();expect(view.metrics().builds).toBe(0);
  });
  it('deduplicates matching pending inputs and returns cached original immediately after candidate cancellation',async()=>{
    const c=new Deferred(),view=new FmsBiomeDisplay(()=>{},c),doc=fixture();
    view.select(doc,'biome');view.select({...doc,revision:1},'biome');expect(c.calls).toHaveLength(1);c.reply(0);await tick();const original=view.snapshot().surface;
    view.select({...doc,elevations:doc.elevations.slice()},'biome');view.select(doc,'biome');
    expect(c.calls[1].signal.aborted).toBe(true);expect(view.snapshot()).toMatchObject({pending:false,surface:original});c.reply(1);await tick();expect(view.snapshot().surface).toBe(original);
  });
  it('invalidates all climate inputs, bounds cache to three snapshots and clears on close',async()=>{
    const c=new Deferred(),view=new FmsBiomeDisplay(()=>{},c),doc=fixture();
    const variants=[doc,{...doc,elevations:doc.elevations.slice()},{...doc,points:doc.points.map(p=>[...p] as [number,number])},{...doc,width:40},{...doc,triangles:doc.triangles.slice()},{...doc,neighbors:doc.neighbors.map(n=>n.slice())},{...doc,height:20}];
    for(const candidate of variants){view.select(candidate,'biome');c.reply(c.calls.length-1);await tick();}
    expect(c.calls).toHaveLength(7);expect(view.metrics()).toMatchObject({builds:7,entries:3,elapsedMs:42});
    view.select(doc,'biome');expect(c.calls).toHaveLength(8);view.close();c.reply(7);await tick();expect(view.metrics()).toMatchObject({entries:0,bytes:0});expect(c.close).toHaveBeenCalledOnce();
  });
  it('falls back for the actual failing target, never caches failure, and permits retry',async()=>{
    const c=new Deferred(),view=new FmsBiomeDisplay(()=>{},c),doc=fixture();view.select(doc,'biome');c.calls[0].reject(Error('budget'));await tick();
    expect(view.snapshot()).toEqual({requested:'height',display:'height',pending:false,error:'budget'});expect(view.metrics().entries).toBe(0);
    view.select(doc,'biome');c.reply(1);await tick();expect(view.snapshot()).toMatchObject({requested:'biome',pending:false});
  });
  it('teardown never emits a late status or permits another request',async()=>{
    const c=new Deferred(),changed=vi.fn(),view=new FmsBiomeDisplay(changed,c),doc=fixture();view.select(doc,'biome');view.close();view.close();c.calls[0].reject(Error('late'));await tick();
    view.select(doc,'biome');expect(changed).toHaveBeenCalledOnce();expect(c.calls[0].signal.aborted).toBe(true);expect(c.close).toHaveBeenCalledOnce();expect(c.calls).toHaveLength(1);
  });
});
