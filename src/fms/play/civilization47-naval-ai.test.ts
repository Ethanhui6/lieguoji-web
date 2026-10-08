import {beforeAll,describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {issueAutonomousNavalOrders47} from './civilization47-naval-ai';
import {assertNavalAutonomy47} from './civilization47-naval-ai-state';
import {navalPresence47,reconcilePortLandOwnersOwned47} from './civilization47-ports';
import {armyTravelLocation47,beginArmyTravel47,haltArmyTravel47} from './army-travel47-state';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {applyFleetCommand47,fleetStamp47} from './fleet-commands47';
import {settleCivilizationDay47} from './civilization47-daily';

let base:FoundingForces47;
const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),5,60,'peace',{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman']});},30000);
/** Explicit single AI phase fixture. Does not advance calendar or economy. */
function phase(r:FoundingForces47){r.clock.tick++;issueAutonomousNavalOrders47(r,weights);return r;}
function offAnchor(){const r=structuredClone(base),view=navalPresence47(r),f=r.navy.fleets[0],at=armyTravelLocation47(r.fleetPositions.records[f.id],view.spatial.graph),v=at.cell.polygon.find(v=>Math.hypot(v.x-at.point.x,v.y-at.point.y)>1e-4)!;
 const point={x:at.point.x*.999+v.x*.001,y:at.point.y*.999+v.y*.001};r.fleetPositions.records[f.id]=beginArmyTravel47(f.id,[at.cell.id],view.spatial.graph,point);const home=view.sea.ports.find(p=>p.id===f.dockId)!;return{r,f,view,point,home};}
describe('persistent actual-position naval autonomy',()=>{
 it('records qualified founding homes and rejects unknown state without using legacy fleet node',()=>{
  assertNavalAutonomy47(base);for(const f of base.navy.fleets)expect(base.navalAutonomy.fleets[f.id].homePortId).toBe(f.dockId);
  const {r,f}=offAnchor();f.node=-1;f.food=f.crew*3;phase(r);expect(r.navalAutonomy.fleets[f.id].decision).toBe('resupply');
  const future=structuredClone(base);Object.assign(future.navalAutonomy,{future:1});expect(()=>assertNavalAutonomy47(future)).toThrow();
 });
 it('returns from the actual nearby sea point without teleporting or provisioning and preserves the valid route',()=>{
  const {r,f,view,point,home}=offAnchor();f.food=f.crew*3;const grain=r.world.statecraft!.provinces.map(p=>p.grain);phase(r);
  expect(r.navalAutonomy.fleets[f.id]).toMatchObject({decision:'resupply',assignedPortId:home.id,issuedTick:1});expect(r.fleetPositions.records[f.id].status).toBe('moving');expect(armyTravelLocation47(r.fleetPositions.records[f.id],view.spatial.graph).point).toEqual(point);expect(f.food).toBe(f.crew*3);expect(r.world.statecraft!.provinces.map(p=>p.grain)).toEqual(grain);
  const order=structuredClone(r.fleetPositions.records[f.id]);for(let i=0;i<45;i++)phase(r);expect(r.fleetPositions.records[f.id]).toEqual(order);expect(r.voyages.manualFleets).not.toContain(f.id);
 });
 it('honors player takeover and patrol opt-out, even when food is low',()=>{
  for(const manual of [true,false]){const {r,f,home}=offAnchor(),next=manual?applyFleetCommand47(r,{type:'fleet-sail',fleetId:f.id,target:{kind:'port',id:home.id}},fleetStamp47(r),weights):r;if(!manual)next.navy.fleets.find(v=>v.id===f.id)!.patrol=false;
   next.navy.fleets.find(v=>v.id===f.id)!.food=1;const before=structuredClone(next.fleetPositions.records[f.id]);phase(next);expect(next.navalAutonomy.fleets[f.id].decision).toBe('manual');expect(next.fleetPositions.records[f.id]).toEqual(before);}
 });
 it('clears lost or peaceful offensive goals before reselecting, and leaves no invalid sea attack running',()=>{
  const {r,f,home,view}=offAnchor(),foreign=view.sea.ports.find(p=>r.portControl.ports[p.provinceId].landOwnerId!==f.nationId)!,row=r.navalAutonomy.fleets[f.id];
  r.portControl.fleets[f.id].targetId=foreign.provinceId;r.portControl.fleets[f.id].lastWar=true;r.portControl.fleets[f.id].active=true;row.assignedPortId=foreign.id;row.decision='attacking';
  phase(r);expect(r.portControl.fleets[f.id].targetId).toBeNull();expect(r.portControl.fleets[f.id].active).toBe(false);expect(row.assignedPortId).not.toBe(foreign.id);expect(['guarding','no-route']).toContain(row.decision);expect(home.id).not.toBe(foreign.id);
 });
 it('finds a reachable own harbor for low food and clearly records no route when all own ports are lost',()=>{
  const {r,f,view}=offAnchor();f.food=f.crew;const other=r.world.nations.find(n=>n.id!==f.nationId)!.id;for(const p of view.sea.ports){const land=r.world.provinces.find(v=>v.id===p.provinceId)!;if(land.controller===f.nationId){land.controller=other;land.legalOwner=other;}}reconcilePortLandOwnersOwned47(r);
  const before=structuredClone(r.fleetPositions.records[f.id]);phase(r);expect(r.navalAutonomy.fleets[f.id].decision).toBe('no-route');expect(r.fleetPositions.records[f.id]).toEqual(before);expect(f.food).toBe(f.crew);
 });
 it('reclaims an occupied home port using an actual affordable approach rather than a free arrival',()=>{
  const {r,f,home,view,point}=offAnchor(),occupier=r.world.nations.find(n=>n.id!==f.nationId)!.id;
  r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(f.nationId)&&[v.a,v.b].includes(occupier))!.status='war';Object.assign(r.portControl.ports[home.provinceId],{occupierId:occupier,value:50});
  for(const other of r.navy.fleets)if(other.id!==f.id){other.status='lost';r.maritime.hulls[other.id]=0;}
  phase(r);expect(r.navalAutonomy.fleets[f.id]).toMatchObject({decision:'attacking',assignedPortId:home.id});expect(r.portControl.fleets[f.id].targetId).toBe(home.provinceId);expect(r.fleetPositions.records[f.id].status).toBe('moving');expect(armyTravelLocation47(r.fleetPositions.records[f.id],view.spatial.graph).point).toEqual(point);expect(r.portControl.ports[home.provinceId].occupierId).toBe(occupier);
 });
 it('cancels a newly lost resupply destination immediately despite a long idle cooldown',()=>{
  const {r,f,home}=offAnchor();f.food=f.crew*3;phase(r);const row=r.navalAutonomy.fleets[f.id];expect(row.assignedPortId).toBe(home.id);row.nextTick=r.clock.tick+1000;
  const other=r.world.nations.find(n=>n.id!==f.nationId)!.id;for(const p of r.world.provinces)if(p.controller===f.nationId)p.controller=p.legalOwner=other;reconcilePortLandOwnersOwned47(r);
  phase(r);expect(row.assignedPortId).toBeNull();expect(row.decision).toBe('no-route');expect(r.fleetPositions.records[f.id].status).toBe('halted');expect(row.nextTick).toBe(r.clock.tick+40);
 });
 it('player takeover clears stale autonomous bookings without changing the new player route',()=>{
  const {r,f,home}=offAnchor(),row=r.navalAutonomy.fleets[f.id];row.assignedPortId=home.id;row.decision='guarding';
  const out=applyFleetCommand47(r,{type:'fleet-sail',fleetId:f.id,target:{kind:'port',id:home.id}},fleetStamp47(r),weights),travel=structuredClone(out.fleetPositions.records[f.id]);phase(out);expect(out.navalAutonomy.fleets[f.id].assignedPortId).toBeNull();expect(out.fleetPositions.records[f.id]).toEqual(travel);
 });
 it('does not dispatch an adequately stocked fleet on an unaffordable routine voyage',()=>{
  const {r,f,view}=offAnchor();f.food=f.crew*30;const far=view.sea.ports.find(p=>Math.hypot(view.sea.nodes.get(p.node)!.center.x-view.sea.nodes.get(f.node)!.center.x,view.sea.nodes.get(p.node)!.center.y-view.sea.nodes.get(f.node)!.center.y)>100)!;
  const p=r.world.provinces.find(p=>p.id===far.provinceId)!;p.controller=p.legalOwner=f.nationId;reconcilePortLandOwnersOwned47(r);r.navalAutonomy.fleets[f.id].homePortId=far.id;
  for(let i=0;i<3;i++){r.navalAutonomy.fleets[f.id].nextTick=0;phase(r);expect(r.navalAutonomy.fleets[f.id].assignedPortId).not.toBe(far.id);}
 });
 it('keeps neutral observers and active withdrawals out of autonomous orders',()=>{
  const {r,f,view}=offAnchor(),here=armyTravelLocation47(r.fleetPositions.records[f.id],view.spatial.graph),others=r.navy.fleets.filter(v=>v.nationId!==f.nationId).slice(0,2);for(const v of others)r.fleetPositions.records[v.id]=beginArmyTravel47(v.id,[here.cell.id],view.spatial.graph,here.point);
  r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(others[0].nationId)&&[v.a,v.b].includes(others[1].nationId))!.status='war';f.food=1;const before=structuredClone(r.fleetPositions.records[f.id]);phase(r);expect(r.navalAutonomy.fleets[f.id].decision).toBe('busy');expect(r.fleetPositions.records[f.id]).toEqual(before);
  for(const rel of r.world.statecraft!.relations)rel.status='peace';r.maritime.retreating[f.id]=10;phase(r);expect(r.navalAutonomy.fleets[f.id].decision).toBe('busy');expect(r.fleetPositions.records[f.id]).toEqual(before);
 });
 it('never treats a halted route midpoint as arrival at an enemy port',()=>{
  const {r,f,view}=offAnchor(),foreign=view.sea.ports.find(p=>r.portControl.ports[p.provinceId].landOwnerId!==f.nationId)!,owner=r.portControl.ports[foreign.provinceId].landOwnerId;
  r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(f.nationId)&&[v.a,v.b].includes(owner))!.status='war';const row=r.navalAutonomy.fleets[f.id];row.assignedPortId=foreign.id;row.decision='attacking';r.portControl.fleets[f.id].targetId=foreign.provinceId;r.fleetPositions.records[f.id]=haltArmyTravel47(r.fleetPositions.records[f.id],view.spatial.graph);
  phase(r);if(!view.atPort(foreign.id).some(v=>v.fleet.id===f.id))expect(row.reason).not.toMatch(/已在目标港湾/);
 });
 it('preserves seeded deployment, deadlines and orders across full military windows and JSON reload',()=>{
  const r=structuredClone(base),before=structuredClone(r),one=advanceCivilizationMilitary47(r,120,weights).run;let split=r;
  for(const dt of [1,39,41,39]){const {terrain,...mutable}=split;split=advanceCivilizationMilitary47({...JSON.parse(JSON.stringify(mutable)),terrain},dt,weights).run;}
  expect(split).toEqual(one);expect(r).toEqual(before);expect(one.navalAutonomy.lastTick).toBe(120);const settled=settleCivilizationDay47(one,()=>undefined);expect(advanceCivilizationMilitary47(settled,1,weights).run.navalAutonomy.lastTick).toBe(121);
 },30000);
 it('rolls back earlier port progression and all orders on invalid persistent deployment state',()=>{
  const r=structuredClone(base);r.navalAutonomy.rng=0;const before=structuredClone(r);expect(()=>advanceCivilizationMilitary47(r,2,weights)).toThrow(/自主部署/);expect(r).toEqual(before);
 });
});
