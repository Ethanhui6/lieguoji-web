import {describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {createFmsRun,assertFmsRun,type FmsRun} from './world';
import {withNavy,withRealtime,advanceRunTick,stepRunDay,playRules} from './runtime';
import {TICKS_PER_DAY} from './clock';
import {PlaySession} from './session';
import {armyPosition} from './navigation';
import {graphFor,navalRules} from './naval-rules';
import {fleetPosition,moveNavy,previewRealtimeNaval,applyRealtimeNaval} from './navy';
import {seaRoute} from './sea-path';
import {loadRun,saveRun,runStore,REALTIME_DATABASE} from './storage';
import {mobilize as oldMobilize} from './compat/naval1/fms/play/mobilization';
import {advanceNavy as oldNavy} from './compat/naval1/fms/play/navy';
import {createMilitaryCore as oldCore} from './compat/naval1/fms/play/military-core';
import {navalFingerprint} from './military-registry';
const legacy=()=>withNavy(createFmsRun(grid((x,y)=>x>=30&&x<=210&&y>=30&&y<=200?45:0),4,'peace'));
const make=()=>withRealtime(legacy());
const expected=(r:FmsRun)=>({day:r.world.day,nextEventId:r.world.nextEventId,...(r.version===4?{tick:r.clock.tick}:{})});
function march(r:ReturnType<typeof make>){const a=r.world.armies[0],p=r.world.provinces.find(p=>p.controller===a.nationId&&p.neighbors.some(id=>r.world.provinces.find(q=>q.id===id)!.controller===a.nationId))!,q=r.world.provinces.find(q=>p.neighbors.includes(q.id)&&q.controller===a.nationId)!;Object.assign(a,{provinceId:p.id,originId:p.id,route:[q.id],progress:.2,status:'marching'});return a;}
function voyage(r:ReturnType<typeof make>){const g=graphFor(r),f=r.navy.fleets[0],port=g.ports.find(p=>p.id!==f.dockId&&r.world.provinces.find(q=>q.id===p.provinceId)!.controller===f.nationId&&seaRoute(g,f.node,p.node)!.length>3)!;const route=seaRoute(g,f.node,port.node)!;Object.assign(f,{route:route.slice(1),progress:0,dockId:null,targetId:port.id,status:'sailing',patrol:false});return f;}
async function tamper(f:IDBFactory,key:string,edit:(raw:{run:ReturnType<typeof make>&{clock:Record<string,unknown>};checksum:string})=>void){await new Promise<void>((resolve,reject)=>{const req=f.open(REALTIME_DATABASE);req.onsuccess=()=>{const db=req.result,tx=db.transaction('saves','readwrite'),s=tx.objectStore('saves'),q=s.get(key);q.onsuccess=()=>{edit(q.result);s.put(q.result,key);};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});}
describe('authoritative sub-day simulation and isolated saves',()=>{
 it.each(['tick','step'] as const)('stops %s at first actual contact, before either army can depart or daily losses occur',type=>{
  const r=make(),a=march(r),b=r.world.armies.find(b=>b.nationId!==a.nationId)!;
  r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(a.nationId)&&[v.a,v.b].includes(b.nationId))!.status='war';
  Object.assign(a,{progress:0});Object.assign(b,{provinceId:a.provinceId,originId:a.provinceId,route:[],progress:0,status:'idle'});
  expect(playRules(r).previewOrder(r.world,{armyId:a.id,targetId:a.route[0],kind:'march'}).valid).toBe(false);
  const s=new PlaySession();s.execute({type:'load',run:r});const result=s.execute(type==='tick'?{type,ticks:120,expected:expected(r),pauseOnBattle:true}:{type,days:1,pauseOnBattle:true});
  expect(result.halted).toBeDefined();if(result.run?.version!==4)throw Error('expected v4');expect(result.run.clock.tick).toBe(1);
  for(const old of [a,b]){const n=result.world.armies.find(v=>v.id===old.id)!;expect(n.status).toBe('fighting');expect(n.route).toEqual([]);expect(n.progress).toBe(0);expect(n.troops).toBe(old.troops);}
 });
 it('charges pursuit once on departure, and never contests a province from a partial road position',()=>{
  const r=make(),a=march(r),b=r.world.armies.find(b=>b.nationId!==a.nationId)!;
  r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(a.nationId)&&[v.a,v.b].includes(b.nationId))!.status='war';
  Object.assign(a,{progress:0,status:'retreating'});Object.assign(b,{provinceId:a.provinceId,originId:a.provinceId,progress:0,route:[],status:'fighting'});
  const first=advanceRunTick(r),second=advanceRunTick(first);expect(first.world.armies[0].troops).toBe(a.troops-Math.ceil(a.troops*.025));expect(second.world.armies[0].troops).toBe(first.world.armies[0].troops);
  const oldReport=playRules(r).nationReports(r.world).find(v=>v.nationId===a.nationId)!;
  Object.assign(b,{route:[a.route[0]],progress:.5,status:'marching'});
  const awayReport=playRules(r).nationReports(r.world).find(v=>v.nationId===a.nationId)!;
  expect(awayReport.productionPerDay).toBeGreaterThan(oldReport.productionPerDay);
 });
 it('does not promise to pass enemies at the next waypoint while retargeting mid-leg',()=>{
  const r=make(),a=march(r),b=r.world.armies.find(b=>b.nationId!==a.nationId)!;
  r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(a.nationId)&&[v.a,v.b].includes(b.nationId))!.status='war';
  Object.assign(b,{provinceId:a.route[0],originId:a.route[0],progress:0,route:[],status:'idle'});
  expect(playRules(r).previewOrder(r.world,{armyId:a.id,targetId:r.world.provinces.find(p=>p.id!==a.route[0]&&p.id!==a.provinceId)!.id,kind:'march'}).reason).toContain('阻断');
 });
 it('moves inside the day without billing food, casualties or recruitment again',()=>{
  const r=make(),a=march(r),f=voyage(r),before=structuredClone(r),n=advanceRunTick(r);
  expect(n.clock.tick).toBe(1);expect(n.world.day).toBe(0);expect(n.world.statecraft).toEqual(r.world.statecraft);expect(n.world.armies.map(a=>a.troops)).toEqual(r.world.armies.map(a=>a.troops));expect(n.units).toEqual(r.units);expect(n.navy.fleets[0].food).toBe(f.food);
  expect(n.world.armies.find(v=>v.id===a.id)!.progress).toBeGreaterThan(a.progress);expect(n.navy.fleets[0].progress).toBeGreaterThan(0);expect(r).toEqual(before);assertFmsRun(n);
 });
 it('charges one daily ledger only at the boundary, and batching is exactly deterministic',()=>{
  const r=make();march(r);let n=r;for(let i=0;i<TICKS_PER_DAY-1;i++)n=advanceRunTick(n);
  expect(n.world.statecraft).toEqual(r.world.statecraft);expect(n.world.day).toBe(0);
  n=advanceRunTick(n);expect(n.world.day).toBe(1);expect(n.world.statecraft!.nations.every(n=>n.lastLedger?.day===1)).toBe(true);
  const s=new PlaySession();s.execute({type:'load',run:r});const whole=s.execute({type:'tick',ticks:120,expected:expected(r)}).run!;expect(whole).toEqual(n);
  const small=new PlaySession();small.execute({type:'load',run:r});let many:FmsRun=r;for(let i=0;i<10;i++)many=small.execute({type:'tick',ticks:12,expected:expected(many)}).run!;expect(many).toEqual(whole);
 });
 it('modifies the onward route without resetting the current land/sea position',()=>{
  const r=make(),a=march(r),p=playRules(r).previewOrder(r.world,{armyId:a.id,targetId:a.route[0],kind:'march'});expect(p.valid).toBe(true);
  const s=new PlaySession();s.execute({type:'load',run:r});const next=s.execute({type:'order',order:{armyId:a.id,targetId:a.route[0],kind:'march'},expected:expected(r)}).run!;
  expect(armyPosition(next.world,next.world.armies.find(v=>v.id===a.id)!)).toEqual(armyPosition(r.world,a));expect(next.world.armies.find(v=>v.id===a.id)!.progress).toBe(.2);
  const f=voyage(r),g=graphFor(r);f.progress=g.nodes.get(f.node)!.links.find(e=>e.to===f.route[0])!.distance*.3;
  const action={type:'sail' as const,fleetId:f.id,portId:f.targetId!};expect(previewRealtimeNaval(r.world,r.navy,g,action).valid).toBe(true);
  const changed=applyRealtimeNaval(r.world,r.navy,g,action,expected(r));expect(fleetPosition(g,changed.navy.fleets[0])).toEqual(fleetPosition(g,f));
 });
 it.each(['order','action','military','naval','tick'] as const)('rejects stale tick %s even when day and event sequence match, without late mutation',type=>{
  const r=make();march(r);const s=new PlaySession();s.execute({type:'load',run:r});const n=s.execute({type:'tick',ticks:1,expected:expected(r)}).run!;expect(n.world.nextEventId).toBe(r.world.nextEventId);
  const commands={order:{type:'order',order:{armyId:r.world.armies[0].id,targetId:r.world.armies[0].route[0],kind:'march'}},action:{type:'action',action:{type:'policy',nationId:r.world.nations[0].id,priority:'balanced'}},military:{type:'military',action:{type:'relocate-capital',nationId:r.world.nations[0].id,cityId:r.world.nations[0].capitalId}},naval:{type:'naval',action:{type:'patrol',fleetId:r.navy.fleets[0].id,enabled:false}},tick:{type:'tick',ticks:1}};
  expect(()=>s.execute({...commands[type],expected:expected(r)} as Parameters<PlaySession['execute']>[0])).toThrow('时刻');
  expect(s.execute({type:'tick',ticks:1,expected:expected(n)}).run).toEqual(advanceRunTick(n as ReturnType<typeof make>));
 });
 it('gives exactly one day of ship rations full speed; one ration short is half speed',()=>{
  const r=make(),f=voyage(r),g=graphFor(r);f.food=f.crew;const full=moveNavy(r.world,r.navy,g,1/120);f.food=f.crew-1;const half=moveNavy(r.world,r.navy,g,1/120);
  expect(full.navy.fleets[0].progress).toBeCloseTo(35/120);expect(half.navy.fleets[0].progress).toBeCloseTo(35/240);expect(full.navy.fleets[0].food).toBe(f.crew);
 });
 it('copies an in-flight v3 fleet into current v5 without resetting it, saves twice in Store6 and resumes the exact next tick',async()=>{
  const factory=new IDBFactory(),old=legacy();const staging=withRealtime(old);march(staging);voyage(staging);old.world=staging.world;old.navy=staging.navy;await saveRun(old,null,factory);
  const oldSaved=await loadRun(factory,4),session=new PlaySession(),copy=session.execute({type:'copy',run:old}).run!;
  expect(copy.version).toBe(5);expect(copy.id).not.toBe(old.id);if(copy.version!==5)throw Error('expected v5');expect(copy.navy).toEqual(old.navy);expect(copy.world.armies).toEqual(old.world.armies);expect(runStore(copy)).toBe(6);
  let next=copy;for(let i=0;i<47;i++)next=advanceRunTick(next);await saveRun(next,null,factory);await saveRun(next,1,factory);
  const loaded=(await loadRun(factory,6))!.run;expect(loaded).toEqual(next);expect(advanceRunTick(loaded as typeof next)).toEqual(advanceRunTick(next));expect(await loadRun(factory,4)).toEqual(oldSaved);await expect(saveRun(next,1,factory)).rejects.toThrow('另一窗口');
 });
 it.each(['current','backup'])('locks future clock fields in %s before any valid-slot fallback',async key=>{
  const f=new IDBFactory(),r=make();await saveRun(r,null,f);await saveRun(advanceRunTick(r),1,f);await tamper(f,key,raw=>{raw.run.clock.futureFeature=true;});await expect(loadRun(f,5)).rejects.toThrow('未知');await expect(saveRun(r,2,f)).rejects.toThrow('未知');
 });
 it('recovers corrupt current from valid backup and preserves that backup on the next write',async()=>{
  const f=new IDBFactory(),r=make();await saveRun(r,null,f);await saveRun(advanceRunTick(r),1,f);await tamper(f,'current',raw=>{raw.checksum='bad';});const restored=await loadRun(f,5);expect(restored?.recovered).toBe(true);expect(restored?.run).toEqual(r);await saveRun(advanceRunTick(r),2,f);expect((await loadRun(f,5))?.revision).toBe(3);
 });
 it.each([4,14,29])('keeps frozen v3 dispatch exactly at day %s',day=>{
  const r=legacy();r.world.day=day;r.world.armies[0].troops=100;const formed=oldMobilize(r.world,r.units),first=formed.world.nextEventId,naval=oldNavy(formed.world,r.navy,graphFor(r)),world=oldCore(formed.units).advanceWorld(naval.world,1);for(const e of world.events)if(e.id>=first&&e.id<naval.world.nextEventId)e.day=world.day;
  const n=stepRunDay(r);expect(n.engine).toBe(navalFingerprint);expect(n.world).toEqual(world);if(n.version!==3)throw Error('expected frozen');expect(n.navy).toEqual(naval.navy);expect(n.units).toEqual(formed.units);expect(navalRules(n).previewNaval(n.world,n.navy,graphFor(n),{type:'patrol',fleetId:n.navy.fleets[0].id,enabled:false}).valid).toBe(true);
 });
 it('rejects an invalid tick batch atomically',()=>{const r=make(),s=new PlaySession();s.execute({type:'load',run:r});expect(()=>s.execute({type:'tick',ticks:121,expected:expected(r)})).toThrow();expect(s.execute({type:'tick',ticks:1,expected:expected(r)}).run).toEqual(advanceRunTick(r));});
});
