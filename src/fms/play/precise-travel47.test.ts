import {describe,it,expect} from 'vitest';
import type {TravelGraph47} from './army-travel47-graph';
import {unrestrictedTravel47} from './army-travel47-graph';
import {advanceArmyTravel47,armyTravelLocation47,assertArmyTravel47,beginArmyTravel47,beginArmyTravelToPoint47,haltArmyTravel47,redirectArmyTravel47,redirectArmyTravelToPoint47,remainingArmyTravelPoints47} from './army-travel47-state';
import {advanceForceContacts47,initialForceContacts47,type MovingForce47,forceKey47} from './force-motion47';
// Small explicit convex geometry, not a gameplay or visual-acceptance fixture.
function graph():TravelGraph47{return{scale:1,polygonWork:0,byProvince:new Map(),cells:new Map([0,1,2].map(id=>[id,{id,face:id,surface:'sea',provinceId:null,center:{x:5+id*10,y:5},polygon:[{x:id*10,y:0},{x:id*10+10,y:0},{x:id*10+10,y:10},{x:id*10,y:10}],links:[...(id?[{to:id-1,gate:{x:id*10,y:5},distance:10,toGate:5}]:[]),...(id<2?[{to:id+1,gate:{x:id*10+10,y:5},distance:10,toGate:5}]:[])]}]))};}
const rules={enemy:(a:string,b:string)=>a!==b,canEnter:()=>true,speed:()=>1,seaRegion:(face:number)=>face};
const force=(travel:MovingForce47['travel'],nationId='a'):MovingForce47=>({kind:'fleet',id:travel.armyId,nationId,withdrawing:false,travel});
const json=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
describe('exact-endpoint travel without changing old single-cell semantics',()=>{
 it('reads and advances V1 single-cell records unchanged while explicitly created V2 moves inside it',()=>{
  const g=graph(),origin={x:1,y:2},old=beginArmyTravel47('a',[0],g,origin),oldCopy=json(old);assertArmyTravel47(oldCopy,g);expect(advanceArmyTravel47(oldCopy,g,20,()=>1,()=>true).travel).toEqual(old);expect(old.version).toBe(1);
  expect(redirectArmyTravel47(old,g,0,unrestrictedTravel47)).toEqual(old);
  const next=redirectArmyTravelToPoint47(old,g,0,{x:4,y:6},unrestrictedTravel47)!;expect(next.version).toBe(2);expect(next.status).toBe('moving');expect(remainingArmyTravelPoints47(next,g)).toEqual([origin,{x:4,y:6}]);
  const half=advanceArmyTravel47(next,g,2.5,()=>1,()=>false);expect(half.entered).toEqual([]);expect(armyTravelLocation47(half.travel,g).point).toEqual({x:2.5,y:4});
  const end=advanceArmyTravel47(json(half.travel),g,10,()=>1,()=>false);expect(end.travel.status).toBe('arrived');expect(end.unusedSeconds).toBe(7.5);expect(armyTravelLocation47(end.travel,g).point).toEqual({x:4,y:6});expect(old).toEqual(oldCopy);
 });
 it('halt, zero speed, JSON replay and redirected endpoint retain the exact intermediate position',()=>{
  const g=graph(),s=beginArmyTravelToPoint47('a',[0],g,{x:1,y:2},{x:9,y:2}),half=advanceArmyTravel47(s,g,3,()=>1,()=>true).travel,halt=haltArmyTravel47(half,g);
  expect(advanceArmyTravel47(halt,g,100,()=>1,()=>true).travel).toEqual(halt);expect(advanceArmyTravel47(half,g,100,()=>0,()=>true).travel).toEqual(half);
  const redirected=redirectArmyTravelToPoint47(json(halt),g,0,{x:4,y:8},unrestrictedTravel47)!;expect(armyTravelLocation47(redirected,g).point).toEqual({x:4,y:2});expect(remainingArmyTravelPoints47(redirected,g)).toEqual([{x:4,y:2},{x:4,y:8}]);
  if(redirected.version===2)redirected.destination.x=5;expect(halt.version===2&&halt.destination.x).toBe(9);
 });
 it('takes the final gate directly to destination rather than visiting the final centroid first',()=>{
  const g=graph(),s=beginArmyTravelToPoint47('a',[0,1],g,{x:5,y:5},{x:12,y:3}),distance=5+Math.sqrt(8),out=advanceArmyTravel47(s,g,distance,()=>1,()=>true);
  expect(remainingArmyTravelPoints47(s,g)).toEqual([{x:5,y:5},{x:10,y:5},{x:12,y:3}]);expect(out.travel.status).toBe('arrived');expect(out.entered).toEqual([1]);expect(armyTravelLocation47(out.travel,g).point).toEqual({x:12,y:3});
  const coupled=advanceForceContacts47([force(s)],initialForceContacts47(),g,distance,rules);expect(coupled.forces[0].travel).toEqual(out.travel);
 });
 it.each([false,true])('finishes a destination exactly at an admission gate, zero-distance=%s',zero=>{
  const g=graph(),s=beginArmyTravelToPoint47('a',[0,1],g,{x:zero?10:5,y:5},{x:10,y:5}),duration=zero?1:5;
  const out=advanceArmyTravel47(s,g,duration,()=>1,()=>true);expect(out.travel.status).toBe('arrived');expect(out.entered).toEqual([1]);expect(armyTravelLocation47(out.travel,g)).toMatchObject({point:{x:10,y:5},cell:{id:1}});
  const coupled=advanceForceContacts47([force(s)],initialForceContacts47(),g,duration,rules,100,true);expect(coupled.forces[0].travel).toEqual(out.travel);expect(coupled.elapsed).toBe(zero?0:5);expect(coupled.unusedSeconds).toBe(zero?1:0);
 });
 it('holds on the old side when an exact gate destination loses entry permission, then resumes without snapping',()=>{
  const g=graph(),start=beginArmyTravelToPoint47('a',[0,1],g,{x:5,y:5},{x:10,y:5}),mid=advanceArmyTravel47(start,g,2,()=>1,()=>true).travel,blocked=advanceArmyTravel47(mid,g,3,()=>1,()=>false).travel;
  expect(blocked.status).toBe('blocked');expect(armyTravelLocation47(blocked,g)).toMatchObject({cell:{id:0},point:{x:10,y:5}});assertArmyTravel47(json(blocked),g);
  expect(advanceArmyTravel47(blocked,g,1,()=>1,()=>true).travel.status).toBe('arrived');
 });
 it('yields at local arrival on the shared event clock and never invents an entered-cell event',()=>{
  const g=graph(),f=force(beginArmyTravelToPoint47('a',[0],g,{x:1,y:2},{x:4,y:6})),out=advanceForceContacts47([f],initialForceContacts47(),g,10,rules,100,true);
  expect(out.elapsed).toBe(5);expect(out.unusedSeconds).toBe(5);expect(out.contacts.pairs).toEqual([]);expect(out.forces[0].travel.status).toBe('arrived');expect(armyTravelLocation47(out.forces[0].travel,g).point).toEqual({x:4,y:6});
  expect(advanceForceContacts47(out.forces,out.contacts,g,5,rules,100,true).elapsed).toBe(5);
 });
 it('normalizes a rounded local endpoint even when the supplied time is just below the computed remaining time',()=>{
  const g=graph(),s=beginArmyTravelToPoint47('a',[0],g,{x:1,y:1},{x:2,y:1});s.offset=1-2**-53;const dt=3*2**-55;
  expect(dt).toBeLessThan(1-s.offset);expect(s.offset+dt).toBe(1);const single=advanceArmyTravel47(s,g,dt,()=>1,()=>true);
  expect(single.travel.status).toBe('arrived');expect(armyTravelLocation47(single.travel,g).point).toEqual({x:2,y:1});
  const coupled=advanceForceContacts47([force(s)],initialForceContacts47(),g,dt,rules,100,true);expect(coupled.forces[0].travel).toEqual(single.travel);expect(coupled.elapsed).toBe(dt);
 });
 it('keeps a local mover held in real sea combat and allows explicit withdrawing motion while retaining exposure',()=>{
  const g=graph(),a=force(beginArmyTravelToPoint47('a',[0],g,{x:1,y:2},{x:4,y:6})),b=force(beginArmyTravel47('b',[0],g),'b'),out=advanceForceContacts47([a,b],initialForceContacts47(),g,2,rules);
  expect(out.forces.find(f=>f.id==='a')!.travel).toEqual(a.travel);expect(out.exposure[forceKey47(a)]).toBe(2);
  a.withdrawing=true;const escape=advanceForceContacts47([a,b],initialForceContacts47(),g,2,rules);expect(armyTravelLocation47(escape.forces.find(f=>f.id==='a')!.travel,g).point).toEqual({x:2.2,y:3.6});expect(escape.exposure[forceKey47(a)]).toBe(2);
 });
 it('retains a simultaneous encounter when the outgoing enemy finishes exactly on a different gate',()=>{
  const g=graph(),a=force(beginArmyTravelToPoint47('a',[0,1],g,{x:5,y:5},{x:12,y:5})),b=force(beginArmyTravelToPoint47('b',[1,2],g,{x:15,y:5},{x:20,y:5}),'b');
  const out=advanceForceContacts47([a,b],initialForceContacts47(),g,20,rules);expect(out.contacts.pairs).toHaveLength(1);expect(out.contacts.pairs[0].area).toBe('sea/1');expect(out.forces.find(f=>f.id==='b')!.travel.status).toBe('arrived');
  const reload=advanceForceContacts47(json(out.forces),json(out.contacts),g,3,rules);expect(reload.forces).toEqual(out.forces);expect(reload.contacts).toEqual(out.contacts);expect(out.exposure[forceKey47(a)]).toBe(15);
 });
 it('replays substeps and preserves V1 byte shape while refusing unknown versions or invalid endpoint states',()=>{
  const g=graph(),s=beginArmyTravelToPoint47('a',[0,1,2],g,{x:2,y:3},{x:22,y:7});let step=s;for(let i=0;i<80;i++)step=advanceArmyTravel47(json(step),g,.2,()=>1,()=>true).travel;
  const whole=advanceArmyTravel47(s,g,16,()=>1,()=>true).travel;expect(armyTravelLocation47(step,g).point.x).toBeCloseTo(armyTravelLocation47(whole,g).point.x,10);expect(step.leg).toBe(whole.leg);
  const local=beginArmyTravelToPoint47('a',[0],g,{x:1,y:1},{x:5,y:1});
  for(const bad of [{...local,version:3},{...local,destination:{x:11,y:1}},{...local,destination:{x:NaN,y:1}},{...local,crossed:true},{...local,status:'blocked'},{...local,offset:4},{...local,status:'arrived'},{...local,unknown:1}])expect(()=>assertArmyTravel47(bad,g)).toThrow();
  const same=beginArmyTravelToPoint47('a',[0],g,{x:1,y:1},{x:1,y:1});expect(same.status).toBe('arrived');expect(advanceArmyTravel47(same,g,4,()=>1,()=>true).unusedSeconds).toBe(4);
 });
});
