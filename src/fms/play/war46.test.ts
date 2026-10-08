import {describe,it,expect,beforeAll} from 'vitest';
import {rendezvousFixture46,context46,graph46,stamp46} from './war46.test-support';
import {advanceWar46Voyages} from './war46-voyages';
import {chronicleView,assertWar46Run,type War46Run} from './war46-model';
import {portAvailable46} from './war46-ports';
import {War46Session} from './war46-session';
import {War45Session} from './war45-session';
import {shipyardFixture45} from './war45.test-support';
import {IDBFactory} from 'fake-indexeddb';
import {saveRun,loadRun} from './war46-stores';
import {WAR46_DATABASE} from './war46-storage';
import {harborCells46} from './war46-harbor';
import {createMilitaryCore} from './war46-core';
let fixture:ReturnType<typeof rendezvousFixture46>;
beforeAll(()=>{fixture=rendezvousFixture46();});
function begin(r:War46Run,reserved:(id:string)=>boolean=()=>false){
 const out=advanceWar46Voyages(chronicleView(r),r.voyages,graph46(r),context46(r),r.warfare,()=>{},()=>false,(id,n)=>portAvailable46(r.portControl,id,n),reserved);return {...r,...out,version:46 as const,rules:'fms-war-46' as const,engine:r.engine};
}
describe('existing-fleet rendezvous',()=>{
 it('orders a real remote fleet to the assembly port, without new ships, debit or premature embark',()=>{
  const r=structuredClone(fixture.run),n=begin(r),m=n.voyages.missions[fixture.nationId],f=n.navy.fleets.find(f=>f.id===fixture.fleetId)!;
  expect(m).toMatchObject({fleetId:fixture.fleetId,armyId:fixture.armyId,phase:'assembling',fromPortId:fixture.fromPortId});
  expect(f.node).toBe(r.navy.fleets.find(f=>f.id===fixture.fleetId)!.node);expect(f.route.length).toBeGreaterThan(0);expect(f.targetId).toBe(fixture.fromPortId);expect(f.patrol).toBe(false);
  expect(n.navy.fleets.length).toBe(r.navy.fleets.length);expect(n.world.statecraft!.provinces).toEqual(r.world.statecraft!.provinces);expect(n.transports.cargo).toHaveLength(0);expect(n.world.armies.some(a=>a.id===fixture.armyId)).toBe(true);
 });
 it.each(['none','manual','combat','reserved','food','capacity','already-sailing'] as const)('waits without minting ships when fleet unavailable: %s',reason=>{
  const r=structuredClone(fixture.run),f=r.navy.fleets.find(f=>f.id===fixture.fleetId)!;
  if(reason==='none')f.status='lost';if(reason==='manual')r.voyages.manualFleets.push(f.id);if(reason==='combat')r.maritime.retreating[f.id]=r.clock.tick+60;if(reason==='food')f.food=0;if(reason==='capacity')r.world.armies.find(a=>a.id===fixture.armyId)!.troops=5000;if(reason==='already-sailing')f.route=[f.node];
  const before=structuredClone({world:r.world,navy:r.navy,shipbuilding:r.shipbuilding});const n=begin(r,()=>reason==='reserved');expect(n.voyages.missions[fixture.nationId]).toBeUndefined();expect({world:n.world,navy:n.navy,shipbuilding:n.shipbuilding}).toEqual(before);expect(n.voyages.decisions[fixture.nationId].text).toContain('等候舰队');
 });
 it('cancels assembly after disabling, losing the departure harbor, or peace before embark',()=>{
  for(const reason of ['disabled','port-lost','peace']){const r=begin(structuredClone(fixture.run));r.clock.tick=12;
   if(reason==='disabled')r.voyages.enabled[fixture.nationId]=false;if(reason==='port-lost')r.portControl.ports[graph46(r).ports.find(p=>p.id===fixture.fromPortId)!.provinceId].occupierId=fixture.enemyId;
   if(reason==='peace')r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(fixture.nationId)&&[v.a,v.b].includes(fixture.enemyId))!.status='peace';
   const n=begin(r);expect(n.voyages.missions[fixture.nationId]).toBeUndefined();expect(n.transports.cargo).toHaveLength(0);expect(n.world.armies.some(a=>a.id===fixture.armyId)).toBe(true);
  }
 });
 it('real session preserves the chosen physical leg, completes pickup, voyage and landing with one army identity',()=>{
  const s=new War46Session();let r=structuredClone(fixture.run);s.execute({type:'load',run:r});const phases=new Set<string>(),initialCount=r.navy.fleets.length;let picked=false,landed=false,validatedCargo=false;
  for(let i=0;i<800&&!landed;i++){
   r=s.execute({type:'tick',ticks:12,expected:stamp46(r)}).run as War46Run;const m=r.voyages.missions[fixture.nationId];if(m)phases.add(m.phase);picked||=r.transports.cargo.some(c=>c.army.id===fixture.armyId);landed=picked&&r.world.armies.some(a=>a.id===fixture.armyId&&a.provinceId===graph46(r).ports.find(p=>p.id===fixture.toPortId)!.provinceId);assertWar46Run(r);
   if(picked&&!validatedCargo&&!landed){
    const before=structuredClone(r);assertWar46Run(r);expect(r).toEqual(before);
    const bad=structuredClone(r);bad.transports.cargo[0].targetPortId=fixture.fromPortId;expect(()=>assertWar46Run(bad)).toThrow(/运输/);
    const short=structuredClone(r),shortFleet=short.navy.fleets.find(f=>f.id===fixture.fleetId)!;expect(shortFleet.route.length).toBeGreaterThan(1);expect(harborCells46(graph46(r),fixture.toPortId).has(shortFleet.route.at(-2)!)).toBe(true);shortFleet.route.pop();expect(()=>assertWar46Run(short)).toThrow(/指定登陆点/);
    const stopped=structuredClone(r),f=stopped.navy.fleets.find(f=>f.id===fixture.fleetId)!;f.route=[];f.progress=0;f.status='anchored';f.targetId=null;expect(()=>assertWar46Run(stopped)).toThrow(/运输/);validatedCargo=true;
   }
  }
  expect(phases.has('assembling'),JSON.stringify({phases:[...phases],decision:r.voyages.decisions[fixture.nationId],army:r.world.armies.find(a=>a.id===fixture.armyId)})).toBe(true);expect(phases.has('outbound')).toBe(true);expect(picked).toBe(true);expect(landed).toBe(true);expect(validatedCargo).toBe(true);expect(r.navy.fleets.length).toBe(initialCount);expect(r.world.armies.filter(a=>a.id===fixture.armyId)).toHaveLength(1);expect(r.transports.cargo.some(c=>c.army.id===fixture.armyId)).toBe(false);
 },120000);
});
it('recovers an in-flight rendezvous from backup, retains CAS and continues from its saved physical position',async()=>{
 const s=new War46Session();s.execute({type:'load',run:fixture.run});const r=s.execute({type:'tick',ticks:60,expected:stamp46(fixture.run)}).run as War46Run;
 expect(r.voyages.missions[fixture.nationId]?.phase).toBe('assembling');const db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);
 await new Promise<void>((resolve,reject)=>{const q=db.open(WAR46_DATABASE);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves','readwrite');t.objectStore('saves').delete('current');t.oncomplete=()=>{d.close();resolve();};t.onabort=()=>{d.close();reject(t.error);};};});
 const restored=await loadRun(db);expect(restored).toEqual({run:r,revision:2,recovered:true});await saveRun(r,2,db);await saveRun(r,3,db);await expect(saveRun(r,3,db)).rejects.toThrow(/另一|变化|冲突/);
 const reloaded=new War46Session();reloaded.execute({type:'load',run:(await loadRun(db))!.run});expect(reloaded.execute({type:'tick',ticks:12,expected:stamp46(r)})).toEqual(s.execute({type:'tick',ticks:12,expected:stamp46(r)}));
});
it('manual army takeover releases its empty partner fleet without moving it or overwriting the current sea leg',()=>{
 const s=new War46Session();s.execute({type:'load',run:fixture.run});const r=s.execute({type:'tick',ticks:60,expected:stamp46(fixture.run)}).run as War46Run,army=r.world.armies.find(a=>a.id===fixture.armyId)!,core=createMilitaryCore(r.units,true,true,context46(r));
 const target=r.world.provinces.find(p=>p.id!==army.provinceId&&p.controller===army.nationId&&core.previewOrder(r.world,{armyId:army.id,targetId:p.id,kind:'march'}).valid)!;expect(target).toBeDefined();
 const before=r.navy.fleets.find(f=>f.id===fixture.fleetId)!,n=s.execute({type:'order',order:{armyId:army.id,targetId:target.id,kind:'march'},expected:stamp46(r)}).run as War46Run,after=n.navy.fleets.find(f=>f.id===fixture.fleetId)!;
 expect(n.voyages.missions[fixture.nationId]).toBeUndefined();expect(after).toEqual({...before,patrol:true});expect(n.voyages.manualArmies).toContain(army.id);expect(n.voyages.manualFleets).not.toContain(after.id);assertWar46Run(n);
});
it('failed tick keeps the entire saved state when cancellation exceeds the revision limit',()=>{
 const s=new War46Session();s.execute({type:'load',run:fixture.run});const r=s.execute({type:'tick',ticks:60,expected:stamp46(fixture.run)}).run as War46Run;
 r.voyages.enabled[fixture.nationId]=false;r.voyages.revision=Number.MAX_SAFE_INTEGER;assertWar46Run(r);s.execute({type:'load',run:r});
 expect(()=>s.execute({type:'tick',ticks:1,expected:stamp46(r)})).toThrow();expect(Reflect.get(s,'current')).toEqual(r);
});
it('explicit copy preserves in-progress monthly construction, old execution and source save',()=>{
 const old=shipyardFixture45().run,snapshot=structuredClone(old),s=new War46Session(),copy=s.execute({type:'copy',run:old}).run as War46Run;expect(copy.shipbuilding).toEqual(old.shipbuilding);expect(copy.id).not.toBe(old.id);expect(old).toEqual(snapshot);
 const legacy=new War45Session();legacy.execute({type:'load',run:old});s.execute({type:'load',run:old});expect(s.execute({type:'step',days:1})).toEqual(legacy.execute({type:'step',days:1}));
});
