import {describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {EditorSession} from './editor-session';
import {assertFmsRun,type FmsRun} from './world';
import {graphFor} from './naval-rules';
import {applyTransport,previewTransport,mobilizeWithCargo,provisionCargo} from './transport';
import {advanceTransportTick} from './transport-runtime';
import {fleetPosition} from './navy';
import {militaryCapacity} from './mobilization';
import {loadRun,saveRun,TRANSPORT_DATABASE} from './storage';
const stamp=(r:Extract<FmsRun,{version:7}>)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
function fixture(){
  const run=new EditorSession().execute({type:'create',terrain:grid((x,y)=>((x>=30&&x<=80)||(x>=130&&x<=220))&&y>=30&&y<=210?45:0),count:2,relations:'war'}).run!;
  if(run.version!==7)throw Error('version');const g=graphFor(run),w=run.world;
  const from=g.ports.find(p=>w.provinces.find(v=>v.id===p.provinceId)!.controller===w.nations[0].id)!,to=g.ports.find(p=>w.provinces.find(v=>v.id===p.provinceId)!.controller===w.nations[1].id)!;
  const a=w.armies.find(a=>a.nationId===w.nations[0].id)!;Object.assign(a,{provinceId:from.provinceId,originId:from.provinceId,troops:500,supplies:100,status:'idle',progress:0,route:[]});
  for(const other of w.armies)if(other.id!==a.id)Object.assign(other,{status:'destroyed',troops:0});
  run.navy.fleets=[{id:'transport-test',name:'渡海水师',nationId:a.nationId,ships:1,crew:40,food:2400,node:from.node,route:[],progress:0,dockId:from.id,targetId:null,patrol:false,status:'docked'}];
  assertFmsRun(run);return {run,g,from,to,a,f:run.navy.fleets[0]};
}
const embark=(r:ReturnType<typeof fixture>)=>applyTransport(r.run,r.g,{type:'embark',fleetId:r.f.id,armyId:r.a.id},stamp(r.run));
describe('real island-mainland army transport',()=>{
  it.each(['current','backup'])('locks a future nested passenger field in %s before recovery or saving',async slot=>{
    const x=fixture(),n=embark(x),f=new IDBFactory();await saveRun(n,null,f);await saveRun(n,1,f);
    await new Promise<void>((resolve,reject)=>{const q=f.open(TRANSPORT_DATABASE);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves','readwrite'),s=t.objectStore('saves'),r=s.get(slot);r.onsuccess=()=>{r.result.run.transports.cargo[0].army.equipment={future:1};s.put(r.result,slot);};t.oncomplete=()=>{d.close();resolve();};t.onerror=()=>reject(t.error);};});
    await expect(loadRun(f,9)).rejects.toThrow('未知字段');await expect(saveRun(n,2,f)).rejects.toThrow('未知字段');
  });
  it('allows mainland-to-island return and friendly landing without duplicating the passenger',()=>{
    const x=fixture();let n=embark(x);const c=n.transports.cargo[0],f=n.navy.fleets[0];c.targetPortId=x.to.id;Object.assign(f,{node:x.to.node,dockId:null,status:'anchored'});assertFmsRun(n);
    n=applyTransport(n,x.g,{type:'voyage',fleetId:f.id,portId:x.from.id},stamp(n));let count=0;while(n.navy.fleets[0].route.length&&count++<2000)n=advanceTransportTick(n,x.g);
    const survivor=structuredClone(n.transports.cargo[0].army);n=applyTransport(n,x.g,{type:'land',fleetId:f.id},stamp(n));assertFmsRun(n);
    expect(n.transports.cargo).toHaveLength(0);expect(n.world.armies.filter(a=>a.id===c.army.id)).toHaveLength(1);expect(n.world.armies.find(a=>a.id===c.army.id)).toEqual({...survivor,provinceId:x.from.provinceId});
  });
  it('rejects mismatched destinations, fractional day batches and a 31st national army including passengers',()=>{
    const x=fixture(),n=embark(x),bad=structuredClone(n);bad.transports.cargo[0].targetPortId=x.to.id;expect(()=>assertFmsRun(bad)).toThrow('运输');
    const s=new EditorSession();s.execute({type:'load',run:n});expect(()=>s.execute({type:'step',days:.5})).toThrow('参数');
    for(let i=0;i<29;i++){const a={...structuredClone(x.a),id:'quota-'+i};n.world.armies.push(a);n.units={...n.units,[a.id]:x.run.units[x.a.id]};}s.execute({type:'load',run:n});
    expect(()=>s.execute({type:'military',action:{type:'recruit',nationId:x.a.nationId,cityId:n.world.cities.find(c=>c.provinceId===x.from.provinceId)!.id,unit:x.run.units[x.a.id],troops:100},expected:stamp(n)})).toThrow('30支');
  });
  it('counts passengers against monthly targets while freeing the departure province for recruitment',()=>{
    const x=fixture(),n=embark(x);n.world.day=29;for(const p of n.world.statecraft!.provinces){p.population=p.provinceId===x.from.provinceId?30000:100;p.grain=p.population*100;}
    const target=militaryCapacity(n.world,x.a.nationId).target;expect(target).toBeGreaterThan(1);
    const result=mobilizeWithCargo(n.world,n.units,n.transports),active=result.world.armies.filter(a=>a.nationId===x.a.nationId&&a.status!=='destroyed');
    expect(active.some(a=>a.provinceId===x.from.provinceId)).toBe(true);expect(active.length+1).toBeLessThanOrEqual(target);expect(result.world.armies.some(a=>a.id===x.a.id)).toBe(false);
  });
  it('moves exactly one army aboard without a ghost land garrison, retains personnel and supplies',()=>{const x=fixture(),old=structuredClone(x.run),n=embark(x);expect(x.run).toEqual(old);expect(n.world.armies.some(a=>a.id===x.a.id)).toBe(false);expect(n.units[x.a.id]).toBeUndefined();expect(n.transports.cargo[0].army).toEqual(x.a);expect(n.transports.cargo[0].unit).toBe(x.run.units[x.a.id]);assertFmsRun(n);expect(()=>applyTransport(n,x.g,{type:'embark',fleetId:x.f.id,armyId:x.a.id},stamp(x.run))).toThrow('时刻');});
  it('sails along ocean links, never lands early and reaches the other coast continuously',()=>{const x=fixture();let n=embark(x);const action={type:'voyage' as const,fleetId:x.f.id,portId:x.to.id},p=previewTransport(n,x.g,action);expect(p.valid,p.reason).toBe(true);for(let i=1;i<p.route.length;i++)expect(x.g.nodes.get(p.route[i-1])!.links.some(e=>e.to===p.route[i])).toBe(true);n=applyTransport(n,x.g,action,stamp(n));expect(previewTransport(n,x.g,{type:'land',fleetId:x.f.id}).valid).toBe(false);const start=fleetPosition(x.g,n.navy.fleets[0]);n=advanceTransportTick(n,x.g);expect(fleetPosition(x.g,n.navy.fleets[0])).not.toEqual(start);let count=0;while(n.navy.fleets[0].route.length&&count++<2000)n=advanceTransportTick(n,x.g);expect(n.navy.fleets[0].node).toBe(x.to.node);expect(n.navy.fleets[0].route).toHaveLength(0);const owner=n.world.provinces.find(p=>p.id===x.to.provinceId)!.controller;const s=new EditorSession();s.execute({type:'load',run:n});const landed=s.execute({type:'transport',action:{type:'land',fleetId:x.f.id},expected:stamp(n)}).run!;expect(landed.version).toBe(7);if(landed.version!==7)throw Error('version');expect(landed.transports.cargo).toHaveLength(0);expect(landed.world.armies.find(a=>a.id===x.a.id)?.provinceId).toBe(x.to.provinceId);expect(landed.world.provinces.find(p=>p.id===x.to.provinceId)!.controller).toBe(owner);expect(advanceTransportTick(landed,x.g).occupation.sieges.some(s=>s.provinceId===x.to.provinceId)).toBe(true);});
  it('rechecks peace at voyage and at landing, keeping soldiers aboard',()=>{const x=fixture(),n=embark(x);n.world.statecraft!.relations.forEach(r=>r.status='peace');expect(previewTransport(n,x.g,{type:'voyage',fleetId:x.f.id,portId:x.to.id}).valid).toBe(false);n.transports.cargo[0].targetPortId=x.to.id;Object.assign(n.navy.fleets[0],{node:x.to.node,dockId:null,status:'anchored'});expect(previewTransport(n,x.g,{type:'land',fleetId:x.f.id}).reason).toContain('和平');expect(()=>applyTransport(n,x.g,{type:'land',fleetId:x.f.id},stamp(n))).toThrow('和平');expect(n.transports.cargo[0].army.troops).toBe(500);});
  it('counts passengers in mobilization quotas without refilling or reinforcing them on land',()=>{const x=fixture(),n=embark(x),before=structuredClone(n.transports);n.world.day=29;const withCargo=mobilizeWithCargo(n.world,n.units,n.transports);expect(n.transports).toEqual(before);expect(withCargo.world.armies.some(a=>a.id===x.a.id)).toBe(false);expect(withCargo.units[x.a.id]).toBeUndefined();});
  it('charges passenger supplies once per day and records losses when the carrier is lost',()=>{const x=fixture(),n=embark(x);let stepped=n;for(let i=0;i<120;i++)stepped=advanceTransportTick(stepped,x.g);expect(stepped.transports.cargo[0].army.supplies).toBe(94);n.navy.fleets[0].crew=0;n.navy.fleets[0].status='lost';const loss=provisionCargo(n.world,n.navy,n.units,n.transports);expect(loss.transports.cargo).toHaveLength(0);expect(loss.world.armies.find(a=>a.id===x.a.id)?.status).toBe('destroyed');expect(loss.world.events.at(-1)!.reason).toContain('船员');});
  it('restores an at-sea save exactly, keeps CAS and locks unknown cargo in either slot',async()=>{const x=fixture();let n=embark(x);n=applyTransport(n,x.g,{type:'voyage',fleetId:x.f.id,portId:x.to.id},stamp(n));n=advanceTransportTick(n,x.g);const f=new IDBFactory();await saveRun(n,null,f);await saveRun(n,1,f);const loaded=(await loadRun(f,9))!.run;if(loaded.version!==7)throw Error('version');expect(loaded).toEqual(n);expect(advanceTransportTick(loaded,x.g)).toEqual(advanceTransportTick(n,x.g));await expect(saveRun(n,1,f)).rejects.toThrow('另一窗口');await new Promise<void>(resolve=>{const q=f.open(TRANSPORT_DATABASE);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves','readwrite'),s=t.objectStore('saves'),r=s.get('backup');r.onsuccess=()=>{r.result.run.transports.cargo[0].future=true;s.put(r.result,'backup');};t.oncomplete=()=>{d.close();resolve();};};});await expect(loadRun(f,9)).rejects.toThrow('未知');await expect(saveRun(n,2,f)).rejects.toThrow('未知');});
});
