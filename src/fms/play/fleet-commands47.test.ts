import {beforeAll,describe,it,expect} from 'vitest';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {grid} from './fixture.test-support';
import {applyFleetCommand47,previewFleetCommand47,issueFleetOrderOwned47,fleetStamp47} from './fleet-commands47';
import {actualForces47,advanceActualForces47} from './force-runtime47';
import {armyTravelLocation47,beginArmyTravel47} from './army-travel47-state';
import {actualForceSpeed47} from './force-speed47';
import {settleFleetFood47} from './civilization47-upkeep';
import {graphFor46} from './war46-geography';
let base:FoundingForces47;
const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),5,60,'peace',{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman']});},30000);
/** Move a fleet slightly off its real port anchor in the SAME cell as an
 * explicit test placement. No prior sailing/day is claimed by this setup. */
function displaced(){const r=structuredClone(base),fleet=r.navy.fleets[0],{spatial}=actualForces47(r),current=r.fleetPositions.records[fleet.id],at=armyTravelLocation47(current,spatial.graph),vertex=at.cell.polygon.find(p=>Math.hypot(p.x-at.point.x,p.y-at.point.y)>1e-4)!;
 const origin={x:at.point.x*.95+vertex.x*.05,y:at.point.y*.95+vertex.y*.05};r.fleetPositions.records[fleet.id]=beginArmyTravel47(fleet.id,[at.cell.id],spatial.graph,origin);
 const port=graphFor46(r).ports.find(p=>p.id===fleet.dockId)!;return{r,fleet,port,origin,anchor:at.point,graph:spatial.graph};}
describe('actual47 sea-only fleet commands and exact docking',()=>{
 it('previews nonzero in-cell sailing and confirms from exact position without teleporting, provisioning or touching Army orders',()=>{
  const {r,fleet,port,origin,anchor,graph}=displaced(),before=structuredClone(r),action={type:'fleet-sail' as const,fleetId:fleet.id,target:{kind:'port' as const,id:port.id}},preview=previewFleetCommand47(r,action,weights);
  expect(preview.valid,preview.reason).toBe(true);expect(preview.distance).toBeGreaterThan(0);expect(preview.points).toEqual([origin,anchor]);
  const out=applyFleetCommand47(r,action,preview.basedOn,weights),changed=out.navy.fleets.find(f=>f.id===fleet.id)!;
  expect(r).toEqual(before);expect(out.fleetPositions.records[fleet.id]).toMatchObject({version:2,status:'moving'});expect(armyTravelLocation47(out.fleetPositions.records[fleet.id],graph).point).toEqual(origin);expect(changed.food).toBe(fleet.food);expect(changed.dockId).toBeNull();expect(changed.node).toBe(fleet.node);expect(out.armyPositions).toEqual(r.armyPositions);expect(out.voyages.manualFleets).toContain(fleet.id);
  expect(previewFleetCommand47(out,action,weights).valid).toBe(false);
 });
 it('requires real arrival before daily food transfer and follows the same unified movement speed',()=>{
  const {r,fleet,port,anchor,graph}=displaced(),stock=r.world.statecraft!.provinces.find(p=>p.provinceId===port.provinceId)!;fleet.food=fleet.crew*3;stock.grain=stock.population*10+fleet.crew*100;
  const action={type:'fleet-sail' as const,fleetId:fleet.id,target:{kind:'port' as const,id:port.id}},preview=previewFleetCommand47(r,action,weights),out=applyFleetCommand47(r,action,preview.basedOn,weights),sailing=out.navy.fleets.find(f=>f.id===fleet.id)!,opening=out.world.statecraft!.provinces.find(p=>p.provinceId===port.provinceId)!.grain;
  // Phase checks: these calls do not pretend to advance economic days.
  settleFleetFood47(out);expect(sailing.food).toBe(fleet.crew*2);expect(out.world.statecraft!.provinces.find(p=>p.provinceId===port.provinceId)!.grain).toBe(opening);
  const f=actualForces47(out).forces.find(f=>f.kind==='fleet'&&f.id===fleet.id)!,v=actualForceSpeed47(out,f,graph.cells.get(out.fleetPositions.records[fleet.id].nodes[0])!),seconds=preview.distance/v;
  const halfway=advanceActualForces47(out,seconds/2,weights,actualForceSpeed47).run;expect(halfway.fleetPositions.records[fleet.id].status).toBe('moving');
  const arrived=advanceActualForces47(halfway,seconds,weights,actualForceSpeed47).run;expect(armyTravelLocation47(arrived.fleetPositions.records[fleet.id],graph).point).toEqual(anchor);expect(arrived.fleetPositions.records[fleet.id].status).toBe('arrived');expect(arrived.navy.fleets.find(f=>f.id===fleet.id)!.dockId).toBeNull();
  settleFleetFood47(arrived);expect(arrived.navy.fleets.find(f=>f.id===fleet.id)!.food).toBe(fleet.crew*59);expect(arrived.world.statecraft!.provinces.find(p=>p.provinceId===port.provinceId)!.grain).toBe(opening-fleet.crew*58);
 });
 it('uses the same route for autonomous orders while honoring manual takeover and patrol opt-out',()=>{
  const {r,fleet,port}=displaced(),action={type:'fleet-sail' as const,fleetId:fleet.id,target:{kind:'port' as const,id:port.id}},manual=applyFleetCommand47(r,action,fleetStamp47(r),weights),auto=structuredClone(r);
  issueFleetOrderOwned47(auto,action,weights,'autonomous');expect(auto.fleetPositions).toEqual(manual.fleetPositions);expect(auto.voyages).toEqual(r.voyages);
  const before=structuredClone(manual);expect(()=>issueFleetOrderOwned47(manual,action,weights,'autonomous')).toThrow(/玩家/);expect(manual).toEqual(before);fleet.patrol=false;expect(()=>issueFleetOrderOwned47(r,action,weights,'autonomous')).toThrow(/玩家/);
 });
 it('halts at the current point and redirects inside that same sea cell to another exact target',()=>{
  const {r,fleet,port,graph}=displaced(),action={type:'fleet-sail' as const,fleetId:fleet.id,target:{kind:'port' as const,id:port.id}},out=applyFleetCommand47(r,action,fleetStamp47(r),weights),half=advanceActualForces47(out,.001,weights,actualForceSpeed47).run,point=armyTravelLocation47(half.fleetPositions.records[fleet.id],graph).point;
  const halt=applyFleetCommand47(half,{type:'fleet-halt',fleetId:fleet.id},fleetStamp47(half),weights);expect(halt.fleetPositions.records[fleet.id].status).toBe('halted');expect(armyTravelLocation47(halt.fleetPositions.records[fleet.id],graph).point).toEqual(point);
  const resume=applyFleetCommand47(halt,action,fleetStamp47(halt),weights);expect(armyTravelLocation47(resume.fleetPositions.records[fleet.id],graph).point).toEqual(point);expect(resume.fleetPositions.records[fleet.id].status).toBe('moving');
 });
 it.each(['port','army','fleet','event','clock'])('rejects a stale %s preview atomically',change=>{
  const {r,fleet,port}=displaced(),stamp=fleetStamp47(r),action={type:'fleet-sail' as const,fleetId:fleet.id,target:{kind:'port' as const,id:port.id}};
  if(change==='port')r.portControl.revision++;if(change==='army')r.armyPositions.revision++;if(change==='fleet')r.fleetPositions.revision++;if(change==='event')r.world.nextEventId++;if(change==='clock')r.clock.tick++;
  const before=structuredClone(r);expect(()=>applyFleetCommand47(r,action,stamp,weights)).toThrow(/过期/);expect(r).toEqual(before);
 });
 it('rejects land targets and stops orders from cancelling actual sea combat or an active withdrawal',()=>{
  const {r,fleet,graph}=displaced(),land=[...graph.cells.values()].find(c=>c.surface==='land')!;expect(previewFleetCommand47(r,{type:'fleet-sail',fleetId:fleet.id,target:{kind:'cell',id:land.id}},weights).valid).toBe(false);
  const enemy=r.navy.fleets.find(f=>f.nationId!==fleet.nationId)!,at=armyTravelLocation47(r.fleetPositions.records[fleet.id],graph);r.fleetPositions.records[enemy.id]=beginArmyTravel47(enemy.id,[at.cell.id],graph,at.point);
  const relation=r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(enemy.nationId)&&[v.a,v.b].includes(fleet.nationId))!;relation.status='war';
  const action={type:'fleet-sail' as const,fleetId:fleet.id,target:{kind:'cell' as const,id:at.cell.id}},before=structuredClone(r);expect(previewFleetCommand47(r,action,weights).reason).toMatch(/交锋/);expect(()=>applyFleetCommand47(r,action,fleetStamp47(r),weights)).toThrow(/交锋/);expect(r).toEqual(before);
  relation.status='peace';r.maritime.retreating[fleet.id]=r.clock.tick+1;expect(previewFleetCommand47(r,action,weights).reason).toMatch(/脱离/);
 });
});
