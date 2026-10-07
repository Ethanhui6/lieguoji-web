import {describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {createSettlement25Base} from './settlement25-world';
import {seaGraph} from './sea-path';
import {polygonArea} from './settlement25-mesh';
import {buildDiplomaticGeography,assertDiplomaticGeography,assertGeographySchema,diplomaticProvinceView} from './war30-geography';
import {nativeUpdateDiplomaticNeighbors} from './native-war/diplomatic-geography';

const make=(height:(x:number,y:number)=>number)=>createSettlement25Base(grid(height),4,24,'peace').base;
const island=()=>make((x,y)=>x>50&&x<200&&y>50&&y<200?45:0);
describe('persisted diplomatic water provinces',()=>{
 it.each(['continent','islands','lake','h20-ridge','all-land'] as const)('partitions every real wet face exactly once for %s and leaves land and cities untouched',kind=>{
  const r=make((x,y)=>kind==='continent'?(x>40&&x<200&&y>30&&y<220?45:0):kind==='islands'?(((x>30&&x<80)||(x>150&&x<210))&&y>30&&y<210?45:0):kind==='lake'?(x>60&&x<180&&y>60&&y<180?0:45):kind==='h20-ridge'?(x===120?20:x<30||x>210?45:0):45),before=structuredClone(r),s=buildDiplomaticGeography(r),g=seaGraph(r.terrain,r.world);
  assertDiplomaticGeography(s,r);expect(r).toEqual(before);expect(buildDiplomaticGeography(r)).toEqual(s);
  const faces=s.water.flatMap(w=>w.faces);expect(new Set(faces).size).toBe(g.nodes.size);expect(faces.length).toBe(g.nodes.size);
  expect(s.water.reduce((a,w)=>a+w.area,0)).toBeCloseTo([...g.nodes.values()].reduce((a,n)=>a+polygonArea(n.polygon),0),6);
  expect(s.landIds).toEqual(r.world.provinces.map(p=>p.id));
  if(kind==='lake'){expect(g.ports).toHaveLength(0);expect(s.water.some(w=>w.landIds.length)).toBe(true);expect(s.water.every(w=>!w.ocean)).toBe(true);}
  if(kind==='h20-ridge')expect(new Set(s.water.map(w=>w.component)).size).toBe(2);
  if(kind==='all-land')expect(s.water).toHaveLength(0);
 });
 it('builds a stable native lookup with real coast contacts, without adding land, cities or moving war IDs',()=>{
  const r=island(),s=buildDiplomaticGeography(r),state=(id:string)=>r.world.nations.findIndex(n=>n.id===id)+1,{provinces,lookup}=diplomaticProvinceView(s,r.world,state);
  for(const [i,p]of r.world.provinces.entries())expect(lookup(i+1)).toMatchObject({id:i+1,stateId:state(p.controller),isLand:true});
  for(const p of provinces)for(const id of p.neighbors)expect([...lookup(id).neighbors]).toContain(p.id);
  expect(lookup(1)).toBe(lookup(1));expect(()=>lookup(-1)).toThrow(/索引/);
  for(const n of r.world.nations){const id=state(n.id),neighbors=new Set<number>(),seaNeighbors=new Set<number>();nativeUpdateDiplomaticNeighbors({id,provinces:provinces.filter(p=>p.stateId===id),neighbors,seaNeighbors},lookup);expect(neighbors.has(id)).toBe(false);expect(seaNeighbors.has(id)).toBe(false);}
  const old=lookup(1).stateId;r.world.provinces[0].controller=r.world.nations.find(n=>state(n.id)!==old)!.id;
  assertDiplomaticGeography(s,r);expect(diplomaticProvinceView(s,r.world,state).lookup(1).stateId).not.toBe(old);expect(lookup(1).stateId).toBe(old);
 });
 it('counts logical water provinces rather than rendering triangles across two actual islands',()=>{
  const r=make((x,y)=>((x>30&&x<80)||(x>150&&x<210))&&y>30&&y<210?45:0),s=buildDiplomaticGeography(r);
  // Give each connected land mass one owner so a cross-sea relation cannot be
  // mistaken for an ordinary land border between generated seed countries.
  r.world.provinces.forEach(p=>p.controller=p.center.x<500?'n-0':'n-1');
  const {provinces,lookup}=diplomaticProvinceView(s,r.world,id=>id==='n-0'?1:2),neighbors=new Set<number>(),seaNeighbors=new Set<number>();
  nativeUpdateDiplomaticNeighbors({id:1,provinces:provinces.filter(p=>p.stateId===1),neighbors,seaNeighbors},lookup);
  expect(neighbors.size).toBe(0);expect(seaNeighbors.has(2)).toBe(true);expect(s.water.some(w=>w.faces.length>4)).toBe(true);
 });
 it.each(['missing-face','duplicate-face','wrong-owner-contact','wrong-adjacency','wrong-area','wrong-component','wrong-center','wrong-land-order','terrain-change','land-shape-change'] as const)('rejects %s instead of silently regenerating stored geography',kind=>{
  const r=island(),s=buildDiplomaticGeography(r),w=s.water.find(w=>w.landIds.length)!;
  if(kind==='missing-face')w.faces.pop();if(kind==='duplicate-face')w.faces.push(w.faces[0]);if(kind==='wrong-owner-contact')w.landIds=[];
  if(kind==='wrong-adjacency')w.neighbors.push(9999);if(kind==='wrong-area')w.area+=1;if(kind==='wrong-component')w.component++;
  if(kind==='wrong-center')w.center.x+=1;if(kind==='wrong-land-order')s.landIds.reverse();if(kind==='terrain-change')r.terrain.elevations[0]++;
  if(kind==='land-shape-change')r.world.provinces[0].polygon[0].x+=.01;
  expect(()=>assertDiplomaticGeography(s,r)).toThrow(/地图不一致/);
 });
 it('locks future root, partition and nested coordinate fields',()=>{
  const s=buildDiplomaticGeography(island());
  for(const mutate of [(v:typeof s)=>Object.assign(v,{future:true}),(v:typeof s)=>Object.assign(v.water[0],{future:true}),(v:typeof s)=>Object.assign(v.water[0].center,{future:true}),(v:typeof s)=>Object.assign(v,{method:'wet-v2'})]){const copy=structuredClone(s);mutate(copy);expect(()=>assertGeographySchema(copy)).toThrow(/未来/);}
 });
 it('refuses an unmappable legacy shore instead of losing cross-sea diplomatic contacts',()=>{
  const r=island(),g=seaGraph(r.terrain,r.world),port=g.ports[0],p=r.world.provinces.find(p=>p.id===port.provinceId)!;
  // Shifting the entire coastal province is deliberately incompatible with
  // the terrain, but must not be silently accepted with fewer contacts.
  p.polygon=p.polygon.map(v=>({x:v.x+.25,y:v.y}));const before=structuredClone(r);
  expect(()=>buildDiplomaticGeography(r)).toThrow(/海岸与地形边界/);expect(r).toEqual(before);
 });
 it('keeps the gap and all water around a ring island as real face members, never a filled convex hull',()=>{
  const r=make((x,y)=>x>30&&x<210&&y>30&&y<210&&!(x>80&&x<160&&y>80&&y<160)?45:0),s=buildDiplomaticGeography(r);
  assertDiplomaticGeography(s,r);expect(new Set(s.water.map(w=>w.component)).size).toBe(2);
  expect(s.water.some(w=>w.ocean)).toBe(true);expect(s.water.some(w=>!w.ocean&&w.landIds.length>0)).toBe(true);
 });
});
