import {beforeAll,describe,it,expect} from 'vitest';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {grid} from './fixture.test-support';
import {navalPresence47,advancePortIntervalOwned47,reconcilePortLandOwnersOwned47,settlePortPeaceOwned47} from './civilization47-ports';
import {armyTravelLocation47,beginArmyTravel47} from './army-travel47-state';
import {fleetRation47} from './logistics-clock47';
import {initialForceContacts47,forceKey47} from './force-motion47';
import {advanceMilitaryWindow47,type MilitaryRules47} from './force-tick47';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {nativePortAttack,nativePortRecovery} from './native-war/port-occupation';
import {settleFleetFood47} from './civilization47-upkeep';
import {settleCivilizationDay47} from './civilization47-daily';
import {harborCells46} from './war46-harbor';

let base:FoundingForces47;
const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),5,60,'peace',{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman']});},30000);
function fixture(){const r=structuredClone(base),view=navalPresence47(r),fleet=r.navy.fleets[0],port=view.sea.ports.find(p=>r.portControl.ports[p.provinceId].landOwnerId!==fleet.nationId)!;
 for(const a of r.world.armies){a.troops=0;a.status='destroyed';}for(const f of r.navy.fleets){f.patrol=false;if(f.id!==fleet.id){f.status='lost';f.crew=0;r.maritime.hulls[f.id]=0;}}
 const owner=r.portControl.ports[port.provinceId].landOwnerId,relation=r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(owner)&&[v.a,v.b].includes(fleet.nationId))!;relation.status='war';
 r.forceContacts=initialForceContacts47();const cell=view.spatial.graph.cells.get(port.node*2+1)!;r.fleetPositions.records[fleet.id]=beginArmyTravel47(fleet.id,[cell.id],view.spatial.graph,view.sea.nodes.get(port.node)!.center);
 return {r,fleet,port,owner,graph:view.spatial.graph,sea:view.sea,cell,relation};}
const noCombat={navyCountToHull:1,army:()=>({efficiency:0,damageToArmy:0,multiplier:1}),navy:()=>({destiny:0,maritime:false,livingLeaderModifier:null})};
const rules:MilitaryRules47<FoundingForces47>={speed:()=>1,combat:()=>noCombat,afterOccupation:reconcilePortLandOwnersOwned47,portInterval:advancePortIntervalOwned47};
const json=(r:FoundingForces47):FoundingForces47=>{const {terrain,...mutable}=r;return {...JSON.parse(JSON.stringify(mutable)),terrain};};

describe('actual military interval port occupation',()=>{
 it('uses real harbor presence and exact native dt/hull while preserving input and land ownership',()=>{
  const {r,fleet,port}=fixture(),before=structuredClone(r),expected=structuredClone(r.portControl.ports[port.provinceId]);fleet.node=-1;fleet.dockId=null;
  nativePortRecovery(expected,expected.landOwnerId,false,true,r.forceClock.secondsPerTick);nativePortAttack(expected,fleet.nationId,1,r.forceClock.secondsPerTick,()=>true);
  const out=advanceMilitaryWindow47(r,1,weights,rules).run;expect(out.portControl.ports[port.provinceId]).toEqual(expected);expect(out.world.provinces).toEqual(before.world.provinces);expect(r.portControl).toEqual(before.portControl);
 });
 it('changes only harbor occupancy, emits one real capture and does not instantly annex its city',()=>{
  const {r,fleet,port}=fixture(),control=r.portControl.ports[port.provinceId];control.value=.001;const owner=r.world.provinces.find(p=>p.id===port.provinceId)!.controller;
  const out=advanceMilitaryWindow47(r,2,weights,rules).run;expect(out.portControl.ports[port.provinceId].occupierId).toBe(fleet.nationId);expect(out.world.provinces.find(p=>p.id===port.provinceId)!.controller).toBe(owner);expect(out.portControl.fleets[fleet.id].forwardBaseId).toBe(port.provinceId);expect(out.world.events.filter(e=>e.text.includes('控制')&&e.text.includes('海港'))).toHaveLength(1);
 });
 it('credits only time after crossing the real harbor boundary, never the arriving segment',()=>{
  const {r,fleet,port,sea,graph}=fixture(),area=harborCells46(sea,port.id),to=[...graph.cells.values()].find(c=>c.surface==='sea'&&area.has(c.face)&&c.links.some(l=>graph.cells.get(l.to)!.surface==='sea'&&!area.has(graph.cells.get(l.to)!.face)))!,link=to.links.find(l=>graph.cells.get(l.to)!.surface==='sea'&&!area.has(graph.cells.get(l.to)!.face))!,from=graph.cells.get(link.to)!;
  r.fleetPositions.records[fleet.id]=beginArmyTravel47(fleet.id,[from.id,to.id],graph);const distance=Math.hypot(from.center.x-link.gate.x,from.center.y-link.gate.y),segments:{from:number;to:number;inside:boolean}[]=[];
  const out=advanceMilitaryWindow47(r,1,weights,{...rules,speed:()=>distance*2,portInterval:(before,after,start,end)=>{segments.push({from:start,to:end,inside:navalPresence47(before).atPort(port.id).some(v=>v.fleet.id===fleet.id)});return advancePortIntervalOwned47(before,after,start,end);}}).run;
  expect(segments[0]).toEqual({from:0,to:.5,inside:false});expect(segments.filter(s=>s.inside).reduce((n,s)=>n+s.to-s.from,0)).toBeCloseTo(.5,12);
  const expected=structuredClone(r.portControl.ports[port.provinceId]);for(const s of segments)if(s.inside)nativePortAttack(expected,fleet.nationId,1,(s.to-s.from)*r.forceClock.secondsPerTick,()=>true);expect(out.portControl.ports[port.provinceId]).toEqual(expected);
 });
 it('credits departure only until the real wet-cell boundary',()=>{
  const {r,fleet,port,sea,graph}=fixture(),area=harborCells46(sea,port.id),from=[...graph.cells.values()].find(c=>c.surface==='sea'&&area.has(c.face)&&c.links.some(l=>graph.cells.get(l.to)!.surface==='sea'&&!area.has(graph.cells.get(l.to)!.face)))!,link=from.links.find(l=>graph.cells.get(l.to)!.surface==='sea'&&!area.has(graph.cells.get(l.to)!.face))!,to=graph.cells.get(link.to)!;
  r.fleetPositions.records[fleet.id]=beginArmyTravel47(fleet.id,[from.id,to.id],graph);const distance=Math.hypot(from.center.x-link.gate.x,from.center.y-link.gate.y),segments:{inside:boolean;dt:number}[]=[];
  const out=advanceMilitaryWindow47(r,1,weights,{...rules,speed:()=>distance*2,portInterval:(before,after,start,end)=>{segments.push({inside:navalPresence47(before).atPort(port.id).some(v=>v.fleet.id===fleet.id),dt:end-start});return advancePortIntervalOwned47(before,after,start,end);}}).run;
  expect(segments.filter(s=>s.inside).reduce((n,s)=>n+s.dt,0)).toBeCloseTo(.5,12);const expected=structuredClone(r.portControl.ports[port.provinceId]);for(const s of segments){nativePortRecovery(expected,expected.landOwnerId,false,s.inside,s.dt*r.forceClock.secondsPerTick);if(s.inside)nativePortAttack(expected,fleet.nationId,1,s.dt*r.forceClock.secondsPerTick,()=>true);}expect(out.portControl.ports[port.provinceId]).toEqual(expected);
 });
 it('blocks attack during real contact or withdrawal; neutral presence remains separate from attack eligibility',()=>{
  const {r,fleet,port,graph,cell}=fixture(),other=r.navy.fleets.find(f=>f.nationId!==fleet.nationId&&f.nationId!==r.portControl.ports[port.provinceId].landOwnerId)!;other.status='anchored';other.crew=1;r.maritime.hulls[other.id]=100;r.fleetPositions.records[other.id]=beginArmyTravel47(other.id,[cell.id],graph);
  const enemy=r.navy.fleets.find(f=>f.nationId===r.portControl.ports[port.provinceId].landOwnerId)!;enemy.status='anchored';enemy.crew=1;r.maritime.hulls[enemy.id]=100;r.fleetPositions.records[enemy.id]=beginArmyTravel47(enemy.id,[cell.id],graph);
  const view=navalPresence47(r);expect(view.held.has(forceKey47({kind:'fleet',id:other.id}))).toBe(true);expect(r.forceContacts.pairs).toEqual([]);
  const out=structuredClone(r);advancePortIntervalOwned47(r,out,0,1);expect(out.portControl.ports[port.provinceId]).toEqual(r.portControl.ports[port.provinceId]);
  enemy.status='lost';other.status='lost';r.maritime.hulls[enemy.id]=0;r.maritime.hulls[other.id]=0;r.maritime.retreating[fleet.id]=1;const retreat=structuredClone(r);advancePortIntervalOwned47(r,retreat,0,1);expect(retreat.portControl.ports[port.provinceId]).toEqual(r.portControl.ports[port.provinceId]);
 });
 it('returns ports only after all current wars between land owner and occupier end',()=>{
  const {r,fleet,port,owner,relation}=fixture();Object.assign(r.portControl.ports[port.provinceId],{occupierId:fleet.nationId,value:45});settlePortPeaceOwned47(r,new Set([owner,fleet.nationId]));expect(r.portControl.ports[port.provinceId].occupierId).toBe(fleet.nationId);relation.status='peace';settlePortPeaceOwned47(r,new Set([owner,fleet.nationId]));expect(r.portControl.ports[port.provinceId]).toEqual({landOwnerId:owner,occupierId:owner,value:100});
 });
 it('synchronizes land title at zero time and never resurrects stale port ownership',()=>{
  const {r,fleet,port}=fixture();r.world.provinces.find(p=>p.id===port.provinceId)!.controller=fleet.nationId;reconcilePortLandOwnersOwned47(r);expect(r.portControl.ports[port.provinceId]).toEqual({landOwnerId:fleet.nationId,occupierId:fleet.nationId,value:100});const before=structuredClone(r.portControl);reconcilePortLandOwnersOwned47(r);expect(r.portControl).toEqual(before);
 });
 it('is identical across 120 ticks, subdivisions and JSON reload with no extra day-boundary progress',()=>{
  const {r}=fixture(),one=advanceMilitaryWindow47(r,120,weights,rules).run;let split=r;for(const dt of [7,33,40,40])split=advanceMilitaryWindow47(json(split),dt,weights,rules).run;expect(split).toEqual(one);
  const normal=structuredClone(base);for(const f of normal.navy.fleets)f.patrol=false;const pending=advanceCivilizationMilitary47(normal,120,weights).run,settled=settleCivilizationDay47(pending,()=>undefined);expect(settled.portControl).toEqual(pending.portControl);
 },30000);
 it('rejects bad intervals and late asynchronous hooks without committing input',async()=>{
  const {r}=fixture(),before=structuredClone(r);for(const [a,b] of [[0,0],[0,2],[NaN,1],[0,Infinity]])expect(()=>advancePortIntervalOwned47(r,structuredClone(r),a,b)).toThrow();
  const asynchronous=(async(_before:FoundingForces47,after:FoundingForces47)=>{await Promise.resolve();after.world.day=999;}) as unknown as NonNullable<MilitaryRules47<FoundingForces47>['portInterval']>;
  expect(()=>advanceMilitaryWindow47(r,1,weights,{...rules,portInterval:asynchronous})).toThrow(/同步/);await Promise.resolve();expect(r).toEqual(before);
 });
 it('does not provision a neutral fleet held by somebody else\'s sea battle',()=>{
  const r=structuredClone(base),view=navalPresence47(r),neutral=r.navy.fleets[0],port=view.sea.ports.find(p=>p.id===neutral.dockId)!,at=armyTravelLocation47(r.fleetPositions.records[neutral.id],view.spatial.graph),others=r.navy.fleets.filter(f=>f.nationId!==neutral.nationId).slice(0,2);
  expect(others).toHaveLength(2);for(const f of others)r.fleetPositions.records[f.id]=beginArmyTravel47(f.id,[at.cell.id],view.spatial.graph,at.point);
  r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(others[0].nationId)&&[v.a,v.b].includes(others[1].nationId))!.status='war';neutral.food=neutral.crew*3;
  const stock=r.world.statecraft!.provinces.find(p=>p.provinceId===port.provinceId)!,grain=stock.grain;settleFleetFood47(r);expect(neutral.food).toBe(neutral.crew*3-fleetRation47(neutral.crew));expect(stock.grain).toBe(grain);
 });
});
