import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {actualContactFrame47,actualForces47} from './force-runtime47';
import {assertForceContacts47,forceKey47,reconcileForceContactsOwned47} from './force-motion47';
import {waterRegions47} from './geography-content47';
import {nationsAtWar} from './realtime-statecraft';
let base:FoundingForces47;
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),5,60,'peace',{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman']});},30000);
describe('single-phase validated actual contact reader',()=>{
 it('matches the full public composition and never changes the input',()=>{
  const r=structuredClone(base),before=structuredClone(r),v=actualForces47(r),regions=waterRegions47(r.diplomaticGeography),region=(face:number)=>regions.get(face)!;
  assertForceContacts47(r.forceContacts,v.forces,v.spatial.graph,region);
  const expected=reconcileForceContactsOwned47(v.forces,v.spatial.graph,r.forceContacts,(a,b)=>nationsAtWar(r.world,a,b),region);
  expect(actualContactFrame47(r).contact).toEqual(expected);expect(r).toEqual(before);
 });
 it('revalidates changed routes including inactive units on the next read of the same run object',()=>{
  for(const inactive of [false,true]){const r=structuredClone(base);actualContactFrame47(r);const a=r.world.armies[0];if(inactive){a.troops=0;a.status='destroyed';}r.armyPositions.records[a.id].offset=NaN;expect(()=>actualContactFrame47(r)).toThrow();}
 });
 it('rejects fleet routes on land even after an earlier valid read',()=>{
  const r=structuredClone(base),v=actualContactFrame47(r),f=r.navy.fleets[0],land=[...v.spatial.graph.cells.values()].find(c=>c.surface==='land')!;
  Object.assign(r.fleetPositions.records[f.id],{nodes:[land.id],leg:0,offset:0,crossed:false,status:'arrived',origin:{...land.center}});expect(()=>actualContactFrame47(r)).toThrow();
 });
 it('does not reconcile away a forged contact point or duplicate force identity',()=>{
  const r=structuredClone(base),v=actualContactFrame47(r),[a,b]=v.forces,pa=v.spatial.space.byArmy.get(a.id)!,pb=v.spatial.space.byArmy.get(b.id)!;
  r.forceContacts.pairs=[{a:forceKey47(a),b:forceKey47(b),cellA:0,cellB:0,pointA:{x:pa.point.x+1,y:pa.point.y},pointB:pb.point,area:'land/'+pa.province!.id}];expect(()=>actualContactFrame47(r)).toThrow();
  r.forceContacts.pairs=[];r.world.armies.push({...r.world.armies[0]});expect(()=>actualContactFrame47(r)).toThrow();
 });
});
