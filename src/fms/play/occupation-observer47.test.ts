import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {recordPoliticalOccupation47,finishPoliticalTick47} from './civilization47-political-owner';
import {actualForces47} from './force-runtime47';
import {beginArmyTravel47} from './army-travel47-state';
import {withOwnedTravel47} from './owned-travel47';
import {occupationObservationKey47} from './occupation-observer47';
import {reconcileCore} from './upper14-state';

const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
let base:ReturnType<Culture47Session['snapshot']>['run'];
beforeAll(()=>{base=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:60,relations:'war',setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}}).run;},30000);
function fixture(){
 const r=structuredClone(base),{spatial}=actualForces47(r),graph=spatial.graph;
 for(const a of r.world.armies){a.troops=0;a.status='destroyed';}
 for(const f of r.navy.fleets)f.patrol=false;
 const late=r.world.provinces.at(-1)!,x=late.controller,early=r.world.provinces.find(p=>p.controller!==x)!,y=early.controller,z=r.world.nations.find(n=>n.id!==x&&n.id!==y)!.id;
 for(const p of r.world.provinces)if(p!==late&&p.controller===x)p.controller=z;
 reconcileCore(r.world,r.upperCombat);
 const army=(id:string)=>{const a=r.world.armies.find(a=>a.nationId===id)!;a.troops=100;a.status='idle';return a;},ax=army(x),az=army(z);
 const spare=r.world.armies.find(a=>a.nationId===z&&a!==az)!;spare.troops=100;spare.status='idle';
 const cell=(id:string)=>[...graph.cells.values()].find(c=>c.surface==='land'&&c.provinceId===id)!;
 for(const a of [ax,az])r.armyPositions.records[a.id]=beginArmyTravel47(a.id,[cell(early.id).id],graph);
 r.armyPositions.records[spare.id]=beginArmyTravel47(spare.id,[cell(late.id).id],graph);
 return {r,x,early,late,ax,az,spare};
}
describe('fixed session occupation observation',()=>{
 it.each(['takeover','resistance'] as const)('preserves capture, leadership, siege and event order: %s',mode=>{
  const {r,x,early,late}=fixture();r.tactics.unopposed=mode;const before=structuredClone(r);
  const ordinary=advanceCivilizationMilitary47(r,8,weights,recordPoliticalOccupation47,finishPoliticalTick47);
  const optimized=withOwnedTravel47(()=>advanceCivilizationMilitary47(r,8,weights,recordPoliticalOccupation47,finishPoliticalTick47));
  expect(optimized).toEqual(ordinary);expect(r).toEqual(before);
  if(mode==='resistance')expect(optimized.run.occupation.sieges.some(s=>s.provinceId===early.id)).toBe(true);
  if(mode==='takeover'){expect(optimized.run.people.nations[x].leaderId).toBeNull();expect(optimized.run.world.provinces.find(p=>p.id===late.id)!.controller).not.toBe(x);expect(optimized.run.chronicle.entries.some(e=>e.kind==='extinction')).toBe(true);}
 },30000);
 it('invalidates for real ownership, port, leadership, combat and peaceful relationships',()=>{
  const {r}=fixture(),key=()=>occupationObservationKey47(r,actualForces47(r).spatial.space);let previous=key();
  const changes=[()=>{r.world.provinces[0].controller=r.world.nations.find(n=>n.id!==r.world.provinces[0].controller)!.id;},()=>{Object.values(r.portControl.ports)[0].occupierId=r.world.nations.find(n=>n.id!==Object.values(r.portControl.ports)[0].occupierId)!.id;},()=>{r.people.nations[r.world.nations[0].id].leaderId=null;},()=>{Object.values(r.upperCombat.armies)[0].base+=1;},()=>{r.world.statecraft!.relations[0].status='peace';}];
  for(const change of changes){change();const next=key();expect(next).not.toBe(previous);previous=next;}
 });
 it('does not suppress arbitrary ownership or political hooks even inside the owned travel window',()=>{
  const {r}=fixture();r.tactics.unopposed='resistance';let ordinaryCalls=0,ownedCalls=0;
  const ordinary=advanceCivilizationMilitary47(r,4,weights,()=>{ordinaryCalls++;},()=>{ordinaryCalls++;});
  const optimized=withOwnedTravel47(()=>advanceCivilizationMilitary47(r,4,weights,()=>{ownedCalls++;},()=>{ownedCalls++;}));
  expect(ownedCalls).toBe(ordinaryCalls);expect(optimized).toEqual(ordinary);
 },30000);
});
