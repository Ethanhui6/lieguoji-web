import {describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {createFmsRun,assertFmsRun} from './world';
import {withMilitary,withNavy,stepRunDay} from './runtime';
import {seaGraph,seaRoute,seaRoutePoints,routeDistance,type SeaTerrain} from './sea-path';
import {advanceNavy,applyNaval,previewNaval,fleetPosition,assertNavy,CREW_PER_SHIP,RATION_DAYS} from './navy';
import {PlaySession} from './session';
import {loadRun,saveRun,NAVAL_DATABASE,runStore} from './storage';
import {mobilizationFingerprint} from './military-registry';
import {mobilize as frozenMobilize} from './compat/mobilization1/fms/play/mobilization';
import {createMilitaryCore as frozenCore} from './compat/mobilization1/fms/play/military-core';
import type {World,Point} from '../../sim/types';
const empty={provinces:[]} as unknown as World;
const make=()=>withNavy(createFmsRun(grid((x,y)=>x>=30&&x<=210&&y>=30&&y<=200?45:0),4,'peace'));
const expected=(w:World)=>({day:w.day,nextEventId:w.nextEventId});
// Independent barycentric oracle on the ORIGINAL triangles, not the graph polygons.
function heightAt(t:SeaTerrain,p:Point){const scale=1000/Math.max(t.width,t.height),x=p.x/scale,y=p.y/scale;for(let i=0;i<t.triangles.length;i+=3){const [ai,bi,ci]=Array.from(t.triangles.slice(i,i+3)),a=t.points[ai],b=t.points[bi],c=t.points[ci],den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]),u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)return u*t.elevations[ai]+v*t.elevations[bi]+(1-u-v)*t.elevations[ci];}throw Error('outside source mesh');}
describe('real naval geometry and playable commands',()=>{
 it('does not reuse ports for a different province geometry or call an interior mesh hole ocean',()=>{
  const t:SeaTerrain={width:10,height:10,points:[[0,0],[10,0],[0,10]],triangles:new Uint32Array([0,1,2]),elevations:new Int32Array([0,40,40])};
  const a={provinces:[{id:'a',polygon:[{x:500,y:0},{x:0,y:500},{x:1000,y:0}]}]} as unknown as World,b=structuredClone(a);b.provinces[0].id='b';
  expect(seaGraph(t,a).ports[0].provinceId).toBe('a');expect(seaGraph(t,b).ports[0].provinceId).toBe('b');
  t.elevations.fill(40);expect(seaGraph(t,b).nodes.size).toBe(0);t.elevations[0]=0;
  const hole={...t,width:100,height:100,points:[[40,40],[60,40],[50,60]] as [number,number][]};expect(seaGraph(hole,empty).nodes.get(0)!.ocean).toBe(false);
  const tiny={...t,width:1000,height:1000,points:[[1000,1000],[1000-2**-13,1000],[1000,1000-2**-13]] as [number,number][],elevations:new Int32Array([19,100,100])};expect(seaGraph(tiny,empty).nodes.size).toBe(1);
 });
 it('clips a partly wet triangle, not its vertex mask; h20 ridges do not connect',()=>{
  const t:SeaTerrain={width:10,height:10,points:[[0,0],[10,0],[0,10]],triangles:new Uint32Array([0,1,2]),elevations:new Int32Array([0,100,100])};
  const g=seaGraph(t,empty),n=g.nodes.get(0)!;expect(n.polygon).toHaveLength(3);expect(n.center.x+n.center.y).toBeLessThan(200);expect(heightAt(t,n.center)).toBeLessThan(20);
  const ridge=seaGraph(grid(x=>x===120?20:0),empty);expect(new Set([...ridge.nodes.values()].map(n=>n.component)).size).toBe(2);
  const channel=seaGraph(grid((x,y)=>x===120&&y!==120?20:0),empty);expect(new Set([...channel.nodes.values()].map(n=>n.component)).size).toBe(1);
 });
 it('detours around a peninsula with every route segment wet; excludes inland lake ports',()=>{
  const t=grid((x,y)=>(x>=100&&x<=140&&y>=60)||(x>=30&&x<=60&&y>=30&&y<=60)?45:0),g=seaGraph(t,empty);
  const nearest=(p:Point)=>[...g.nodes.values()].sort((a,b)=>Math.hypot(a.center.x-p.x,a.center.y-p.y)-Math.hypot(b.center.x-p.x,b.center.y-p.y))[0].id;
  const a=nearest({x:350,y:800}),b=nearest({x:650,y:800}),route=seaRoute(g,a,b)!;expect(routeDistance(g,route)).toBeGreaterThan(1100);
  const pts=seaRoutePoints(g,route);for(let i=1;i<pts.length;i++)for(let k=0;k<=8;k++){const u=k/8;expect(heightAt(t,{x:pts[i-1].x*(1-u)+pts[i].x*u,y:pts[i-1].y*(1-u)+pts[i].y*u})).toBeLessThan(20+1e-7);}
  const lake=createFmsRun(grid((x,y)=>x<20||x>230||y<20||y>230||(x>=100&&x<=140&&y>=100&&y<=140)?0:45),3),lg=seaGraph(lake.terrain,lake.world);
  expect([...lg.nodes.values()].some(n=>!n.ocean)).toBe(true);expect(lg.ports.length).toBeGreaterThan(0);expect(lg.ports.every(p=>lg.nodes.get(p.node)!.ocean)).toBe(true);
  const outside=[...lg.nodes.values()].find(n=>n.ocean)!,inside=[...lg.nodes.values()].find(n=>!n.ocean)!;expect(seaRoute(lg,outside.id,inside.id)).toBeNull();
 });
 it('creates separately anchored fleets from actual port resources and rejects enemy/non-port targets',()=>{
  const r=make(),g=seaGraph(r.terrain,r.world);expect(r.navy.fleets.length).toBeGreaterThan(1);expect(()=>assertFmsRun(r)).not.toThrow();
  const f=r.navy.fleets[0],p=g.ports.find(p=>p.id===f.dockId)!,action={type:'build-fleet' as const,nationId:f.nationId,portId:p.id,ships:2};
  const before=structuredClone(r),next=applyNaval(r.world,r.navy,g,action,expected(r.world));
  const oldLocal=r.world.statecraft!.provinces.find(v=>v.provinceId===p.provinceId)!,newLocal=next.world.statecraft!.provinces.find(v=>v.provinceId===p.provinceId)!;
  expect(oldLocal.population-newLocal.population).toBe(2*CREW_PER_SHIP);expect(oldLocal.grain-newLocal.grain).toBe(2*CREW_PER_SHIP*RATION_DAYS);expect(r).toEqual(before);
  expect(fleetPosition(g,f)).toEqual(g.nodes.get(p.node)!.center);expect(fleetPosition(g,f)).not.toEqual(p.shore);
  expect(previewNaval(r.world,r.navy,g,{...action,portId:'inland'}).valid).toBe(false);expect(previewNaval(r.world,r.navy,g,{...action,nationId:r.world.nations.find(n=>n.id!==f.nationId)!.id}).valid).toBe(false);
 });
 it('preview and execution share the exact sea route, arrive on time, consume food and refill from port',()=>{
  const r=make(),g=seaGraph(r.terrain,r.world),f=r.navy.fleets[0];r.navy.fleets.forEach(f=>f.patrol=false);
  const options=g.ports.map(p=>({action:{type:'sail' as const,fleetId:f.id,portId:p.id},preview:previewNaval(r.world,r.navy,g,{type:'sail',fleetId:f.id,portId:p.id})})).filter(p=>p.preview.valid&&p.preview.days>1);
  expect(options.length).toBeGreaterThan(0);const {action,preview}=options[0];let state=applyNaval(r.world,r.navy,g,action,expected(r.world));expect(state.navy.fleets[0].route).toEqual(preview.route.slice(1));
  for(let day=0;day<preview.days;day++){state=advanceNavy(state.world,state.navy,g);const ship=state.navy.fleets[0];expect(heightAt(r.terrain,fleetPosition(g,ship))).toBeLessThan(20+1e-7);expect(()=>assertNavy(state.navy,state.world,g)).not.toThrow();}
  const arrived=state.navy.fleets[0];expect(arrived.dockId).toBe(action.portId);expect(arrived.food).toBe(f.food-f.crew*preview.days);expect(arrived.route).toEqual([]);
  const port=g.ports.find(p=>p.id===arrived.dockId)!,before=state.world.statecraft!.provinces.find(p=>p.provinceId===port.provinceId)!.grain;
  const refilled=advanceNavy(state.world,state.navy,g);expect(refilled.world.statecraft!.provinces.find(p=>p.provinceId===port.provinceId)!.grain).toBeLessThan(before);expect(refilled.navy.fleets[0].food).toBe(f.crew*(RATION_DAYS-1));
 });
 it('Worker rejects stale fleet commands atomically; captured ports cannot supply and no malformed route loads',()=>{
  const r=make(),g=seaGraph(r.terrain,r.world),f=r.navy.fleets[0],session=new PlaySession();session.execute({type:'load',run:r});
  const action={type:'patrol' as const,fleetId:f.id,enabled:false};session.execute({type:'naval',action,expected:expected(r.world)});expect(()=>session.execute({type:'naval',action,expected:expected(r.world)})).toThrow('重新预览');
  const bad=structuredClone(r);bad.navy.fleets[0].route=[999999];expect(()=>assertFmsRun(bad)).toThrow();
  const port=g.ports.find(p=>p.id===f.dockId)!;r.world.provinces.find(p=>p.id===port.provinceId)!.controller=r.world.nations.find(n=>n.id!==f.nationId)!.id;
  const next=advanceNavy(r.world,r.navy,g);expect(next.navy.fleets[0].status).toBe('anchored');expect(next.navy.fleets[0].node).toBe(f.node);expect(next.navy.fleets[0].food).toBe(f.food-f.crew);
 });
 it('preserves 52f49 monthly and five-day reinforcement dispatch exactly',()=>{
  for(const day of [4,29]){const r=withMilitary(createFmsRun(grid(),4,'peace'));r.world.day=day;r.world.armies[0].troops=100;expect(r.engine).toBe(mobilizationFingerprint);
   const prepared=frozenMobilize(r.world,r.units),next=stepRunDay(r);expect(next.world).toEqual(frozenCore(prepared.units).advanceWorld(prepared.world,1));if(next.version!==1)expect(next.units).toEqual(prepared.units);
  }
 });
 it('records automatic patrol and arrival on the actual completed day and keeps the grain ledger exact',()=>{
  const r=make();r.world.day=14;const next=stepRunDay(r);expect(next.version).toBe(3);const navalEvents=next.world.events.filter(e=>e.id>=r.world.nextEventId&&e.text.startsWith('驶往'));expect(navalEvents.length).toBeGreaterThan(0);expect(navalEvents.every(e=>e.day===15)).toBe(true);
  for(const n of next.world.statecraft!.nations){const owned=next.world.provinces.filter(p=>p.controller===n.nationId).map(p=>p.id);expect(n.lastLedger!.closingGrain).toBe(next.world.statecraft!.provinces.filter(p=>owned.includes(p.provinceId)).reduce((s,p)=>s+p.grain,0));}
 });
 it.each(['navy','fleet'])('locks unknown %s fields even with a valid backup, before fallback can overwrite them',async field=>{
  const factory=new IDBFactory(),r=make();await saveRun(r,null,factory);await saveRun(stepRunDay(r),1,factory);
  await new Promise<void>(resolve=>{const q=factory.open(NAVAL_DATABASE);q.onsuccess=()=>{const db=q.result,tx=db.transaction('saves','readwrite'),store=tx.objectStore('saves'),get=store.get('current');get.onsuccess=()=>{const raw=get.result;(field==='navy'?raw.run.navy:raw.run.navy.fleets[0]).futureFeature=1;store.put(raw,'current');};tx.oncomplete=()=>{db.close();resolve();};};});
  await expect(loadRun(factory,4)).rejects.toThrow('未知规则字段');await expect(saveRun(r,2,factory)).rejects.toThrow('未知规则字段');
 });
 it('explicit naval copy and two saves preserve original Store3; CAS and future navy backup lock writes',async()=>{
  const f=new IDBFactory(),old=withMilitary(createFmsRun(grid(),4,'peace')),before=structuredClone(old);await saveRun(old,null,f);
  const copy=withNavy(old,true);expect(copy.version).toBe(3);expect(runStore(copy)).toBe(4);expect(copy.world.armies).toEqual(old.world.armies);expect(copy.world.statecraft).toEqual(old.world.statecraft);
  await saveRun(copy,null,f);const next=stepRunDay(copy);await saveRun(next,1,f);expect((await loadRun(f,3))?.run).toEqual(before);expect((await loadRun(f,4))?.run).toEqual(next);await expect(saveRun(copy,1,f)).rejects.toThrow('另一窗口');
  await new Promise<void>(resolve=>{const req=f.open(NAVAL_DATABASE,1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('saves','readwrite'),s=tx.objectStore('saves'),q=s.get('backup');q.onsuccess=()=>{const raw=q.result;raw.run.navy.version=2;s.put(raw,'backup');};tx.oncomplete=()=>{db.close();resolve();};};});
  await expect(loadRun(f,4)).rejects.toThrow('锁定');await expect(saveRun(copy,2,f)).rejects.toThrow('锁定');expect((await loadRun(f,3))?.run).toEqual(before);
 });
 it('rejects v3 engine masquerading as v2 and unknown navy fields',()=>{
  const r=make();expect(()=>assertFmsRun({...withMilitary(r),engine:r.engine})).toThrow();expect(()=>assertFmsRun({...r,navy:{...r.navy,secretRule:1}})).toThrow();
  r.navy.fleets[0].food=.5;expect(()=>assertFmsRun(r)).toThrow();
 });
});
