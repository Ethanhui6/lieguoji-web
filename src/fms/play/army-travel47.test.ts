import {describe,it,expect} from 'vitest';
import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import {grid} from './fixture.test-support';
import {landFaces} from './settlement25-mesh';
import {seaGraph} from './sea-path';
import {buildArmyTravelGraph47,findArmyTravelPath47,unrestrictedTravel47,armyTravelPathPoints47,type TravelGraph47} from './army-travel47-graph';
import {advanceArmyTravel47,armyTravelLocation47,assertArmyTravel47,beginArmyTravel47,haltArmyTravel47,redirectArmyTravel47} from './army-travel47-state';
import {nativeArmyCellDistance,nativeArmyRouteCost,nativeArmyMovementSpeed} from './native-war/army-path';
import {armyPreviewTicks47} from './army-route-budget47';

// Geometry-only fixture. It is not a valid saved game and never bypasses a run
// validator. Each clipped land face is one province, without fabricated sea land.
function geographicWorld(doc:FmsDocument):World{
 const scale=1000/Math.max(doc.width,doc.height);
 return {provinces:landFaces(doc).map((f,i)=>({id:`p-${i}`,polygon:f.ring.map(p=>({x:p.x*scale,y:p.y*scale}))}))} as World;
}
function square(heights:number[]):FmsDocument{
 return {...grid(),width:10,height:10,points:[[0,0],[10,0],[0,10],[10,10]],triangles:new Uint32Array([0,1,2,1,3,2]),elevations:new Int32Array(heights),neighbors:[[1,2],[0,2,3],[0,1,3],[1,2]]};
}
function strip():TravelGraph47{
 return{scale:1,polygonWork:0,byProvince:new Map([['home',[0]],['enemy',[2]]]),cells:new Map([0,1,2].map(id=>[id,{id,face:id,surface:id===1?'sea':'land',provinceId:id===0?'home':id===2?'enemy':null,center:{x:id*10+5,y:5},polygon:[{x:id*10,y:0},{x:id*10+10,y:0},{x:id*10+10,y:10},{x:id*10,y:10}],links:[...(id>0?[{to:id-1,gate:{x:id*10,y:5},distance:10,toGate:5}]:[]),...(id<2?[{to:id+1,gate:{x:id*10+10,y:5},distance:10,toGate:5}]:[])]}]))};
}
const copy=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
describe('v47 actual clipped land/sea graph',()=>{
 it('does not bridge an h20/h20 dry ridge although clipped water polygons share it',()=>{
  const d=square([0,20,20,0]),w=geographicWorld(d),g=buildArmyTravelGraph47(d,w);
  expect(g.cells.size).toBe(2);expect(g.cells.get(1)!.links).toHaveLength(0);expect(findArmyTravelPath47(g,1,3,unrestrictedTravel47)).toBeNull();
 });
 it('keeps a positive-width wet edge and both halves of a real shoreline',()=>{
  const d=square([0,19,20,45]),w=geographicWorld(d),g=buildArmyTravelGraph47(d,w);
  const p=findArmyTravelPath47(g,1,2,unrestrictedTravel47)!;expect(p.nodes).toEqual([1,3,2]);expect(armyTravelPathPoints47(g,p.nodes)).toHaveLength(5);
  expect(g.cells.get(2)!.provinceId).toBe('p-0');expect(g.cells.get(3)!.provinceId).toBeNull();
 });
 it('takes a real wet detour around a ridge instead of cutting through it',()=>{
  const d=grid((x,y)=>x===120&&y===120||x===130&&y===110?20:0),w=geographicWorld(d),wet=seaGraph(d,w),g=buildArmyTravelGraph47(d,w);
  const a=2*(11*25+12),b=a+1,p=findArmyTravelPath47(g,a*2+1,b*2+1,unrestrictedTravel47)!;
  expect(p.nodes.length).toBeGreaterThan(2);
  for(const c of g.cells.values())expect(c.links.map(l=>g.cells.get(l.to)!.face).sort((x,y)=>x-y)).toEqual(wet.nodes.get(c.face)!.links.map(l=>l.to).sort((x,y)=>x-y));
 });
 it('respects land access, permits open sea without a Navy, and cannot invent an air bridge',()=>{
  const g=strip();expect(findArmyTravelPath47(g,0,2,unrestrictedTravel47)?.nodes).toEqual([0,1,2]);
  expect(findArmyTravelPath47(g,0,2,{...unrestrictedTravel47,canEnter:id=>id==='home'})).toBeNull();
  expect(findArmyTravelPath47(g,0,2,{...unrestrictedTravel47,allowSea:false})).toBeNull();
  g.cells.get(1)!.links=g.cells.get(1)!.links.filter(l=>l.to!==2);expect(findArmyTravelPath47(g,0,2,unrestrictedTravel47)).toBeNull();
 });
});
describe('v47 same-Army continuous physical position',()=>{
 it('budgets the same arrival time as actual movement across unequal land, sea and mountain speeds',()=>{
  const g=strip(),origin={x:8,y:3},cells=[0,1,2],points=armyTravelPathPoints47(g,cells);points[0]=origin;
  const speed=(cell:{id:number})=>[.12,.18,.04][cell.id],ticks=armyPreviewTicks47({valid:true,cells,points},g,speed),travel=beginArmyTravel47('budget',cells,g,origin);
  expect(advanceArmyTravel47(travel,g,ticks-.01,speed,()=>true).travel.status).toBe('moving');
  expect(advanceArmyTravel47(travel,g,ticks+.01,speed,()=>true).travel.status).toBe('arrived');
  expect(armyPreviewTicks47({valid:true,cells:[0],points:[origin]},g,speed)).toBe(0);
  expect(armyPreviewTicks47({valid:true,cells,points},g,()=>0)).toBe(Infinity);
 });
 it('crosses land/sea edges with one identity and surface speed, not at the next center',()=>{
  const g=strip(),s=beginArmyTravel47('army-1',[0,1,2],g),a=advanceArmyTravel47(s,g,6,c=>c.surface==='sea'?1.5:1,()=>true);
  expect(a.entered).toEqual([1]);expect(a.travel.armyId).toBe('army-1');expect(armyTravelLocation47(a.travel,g)).toMatchObject({onLand:false,point:{x:11.5,y:5},cell:{id:1}});expect(s.offset).toBe(0);
  const b=advanceArmyTravel47(a.travel,g,100,()=>1,()=>true);expect(b.entered).toEqual([2]);expect(b.travel.status).toBe('arrived');expect(armyTravelLocation47(b.travel,g).point).toEqual({x:25,y:5});
 });
 it('revoked entry after departure stops exactly before the gate, serializes and resumes without teleport',()=>{
  const g=strip(),s=beginArmyTravel47('army-1',[0,1,2],g),a=advanceArmyTravel47(s,g,2,()=>1,()=>true).travel;
  const b=advanceArmyTravel47(a,g,10,()=>1,()=>false);expect(b.travel).toMatchObject({offset:5,crossed:false,status:'blocked'});expect(b.entered).toEqual([]);expect(b.unusedSeconds).toBe(7);
  const restored=copy(b.travel);assertArmyTravel47(restored,g);expect(armyTravelLocation47(restored,g)).toMatchObject({point:{x:10,y:5},cell:{id:0},onLand:true});
  expect(advanceArmyTravel47(restored,g,10,()=>1,()=>false).travel).toEqual(restored);
  const c=advanceArmyTravel47(restored,g,1,()=>1,()=>true);expect(c.entered).toEqual([1]);expect(armyTravelLocation47(c.travel,g).point).toEqual({x:11,y:5});
 });
 it('stops at a newly forbidden landing coast and does not count it as enemy land',()=>{
  const g=strip(),s=advanceArmyTravel47(beginArmyTravel47('army-1',[0,1,2],g),g,12,()=>1,()=>true).travel;
  const out=advanceArmyTravel47(s,g,100,()=>1,c=>c.surface==='sea');expect(out.travel.status).toBe('blocked');expect(out.entered).toEqual([]);expect(armyTravelLocation47(out.travel,g)).toMatchObject({cell:{id:1},onLand:false,point:{x:20,y:5}});
 });
 it('already-entered cell is not teleported back after a treaty changes',()=>{
  const g=strip(),s=advanceArmyTravel47(beginArmyTravel47('army-1',[0,1,2],g),g,6,()=>1,()=>true).travel;
  const out=advanceArmyTravel47(s,g,100,()=>1,()=>false);expect(out.travel).toMatchObject({leg:1,offset:0,status:'blocked'});expect(armyTravelLocation47(out.travel,g)).toMatchObject({cell:{id:1},point:{x:15,y:5}});
 });
 it('substeps and save/restore preserve the same physical outcome and edge entries',()=>{
  const g=strip(),s=beginArmyTravel47('army-1',[0,1,2],g),speed=(c:{surface:string})=>c.surface==='sea'?1.5:1,whole=advanceArmyTravel47(s,g,10,speed,()=>true);let split=s;const entries:number[]=[];
  for(let i=0;i<100;i++){const r=advanceArmyTravel47(copy(split),g,.1,speed,()=>true);split=r.travel;entries.push(...r.entered);}
  expect(entries).toEqual(whole.entered);expect(armyTravelLocation47(split,g).point.x).toBeCloseTo(armyTravelLocation47(whole.travel,g).point.x,10);
 });
 it.each([2,5,7,12,15,17])('cancel and redirect at distance %s keeps the actual position',offset=>{
  const g=strip(),s=advanceArmyTravel47(beginArmyTravel47('army-1',[0,1,2],g),g,offset,()=>1,()=>true).travel,point=armyTravelLocation47(s,g).point;
  const h=haltArmyTravel47(s,g);expect(advanceArmyTravel47(h,g,100,()=>1,()=>true).travel).toEqual(h);
  const redirect=redirectArmyTravel47(copy(h),g,0,unrestrictedTravel47)!;expect(armyTravelLocation47(redirect,g).point).toEqual(point);expect(armyTravelLocation47(redirect,g).cell.id).toBe(armyTravelLocation47(h,g).cell.id);
  const out=advanceArmyTravel47(redirect,g,100,()=>1,()=>true);expect(out.travel.status).toBe('arrived');expect(out.travel.armyId).toBe(s.armyId);expect(armyTravelLocation47(out.travel,g).point).toEqual(armyTravelLocation47(h,g).cell.id===0?point:{x:5,y:5});
 });
 it('failed redirect and zero-time step leave the existing journey untouched',()=>{
  const g=strip(),s=advanceArmyTravel47(beginArmyTravel47('army-1',[0,1,2],g),g,3,()=>1,()=>true).travel,before=copy(s);
  expect(redirectArmyTravel47(s,g,2,{...unrestrictedTravel47,allowSea:false})).toBeNull();expect(advanceArmyTravel47(s,g,0,()=>1,()=>true).travel).toEqual(s);expect(s).toEqual(before);
 });
 it('rejects malformed save progress rather than repairing it into another position',()=>{
  const g=strip(),s=beginArmyTravel47('army-1',[0,1,2],g);
  const sparse=[0,1,2];Reflect.deleteProperty(sparse,1);
  for(const bad of [{...s,offset:6,crossed:false},{...s,offset:4,crossed:true},{...s,offset:3,status:'blocked'},{...s,nodes:[0,2]},{...s,nodes:sparse},{...s,extra:true},{...s,offset:Infinity}])expect(()=>assertArmyTravel47(bad,g)).toThrow();
 });
 it('retains an arbitrary in-cell start without snapping to its centroid',()=>{
  const g=strip(),origin={x:8,y:3},s=beginArmyTravel47('army-1',[0,1,2],g,origin);expect(armyTravelLocation47(s,g).point).toEqual(origin);
  const out=advanceArmyTravel47(s,g,Math.sqrt(8),()=>1,()=>true);expect(out.entered).toEqual([1]);expect(armyTravelLocation47(out.travel,g)).toMatchObject({point:{x:10,y:5},onLand:false});
  expect(()=>beginArmyTravel47('army-1',[0],g,{x:15,y:5})).toThrow(/起点/);
 });
 it('a zero-speed step from a gate keeps entered identity after permission is revoked',()=>{
  const g=strip(),s=beginArmyTravel47('army-1',[0,1,2],g,{x:10,y:5});
  const entered=advanceArmyTravel47(s,g,1,()=>0,()=>true);expect(entered.travel).toMatchObject({offset:0,crossed:true});
  const next=advanceArmyTravel47(copy(entered.travel),g,1,()=>1,()=>false);expect(armyTravelLocation47(next.travel,g)).toMatchObject({cell:{id:1},point:{x:11,y:5}});
 });
});
describe('recovered native scalar boundaries',()=>{
 it('keeps .02 sea-lane cost distinct from speed and applies a soft non-port penalty',()=>{
  expect(nativeArmyCellDistance({x:0,y:0},{x:10,y:10})).toBeCloseTo(14.14,4);
  expect(nativeArmyRouteCost(10,true,false,false,false)).toBeCloseTo(.2,6);expect(nativeArmyRouteCost(10,false,true,true,false)).toBe(460);expect(nativeArmyRouteCost(10,false,true,true,true)).toBe(10);
  expect(nativeArmyMovementSpeed({base:10,onLand:false,unitMultiplier:3,mountain:true})).toBe(15);expect(nativeArmyMovementSpeed({base:10,onLand:true,unitMultiplier:2,mountain:true,biomeMultiplier:4})).toBe(10);
 });
});
