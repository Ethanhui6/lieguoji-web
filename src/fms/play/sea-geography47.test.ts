import {beforeAll,it,expect,vi} from 'vitest';
import {grid} from './fixture.test-support';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {graphFor47} from './sea-geography47';
import {graphFor46,areaFor46} from './war46-geography';
import {prepareOwnedGeography47,withOwnedNumericGeography47} from './geography-content47';
let base:FoundingForces47;
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),5,60,'peace',{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman']});expect(base.harbors.sites.length).toBeGreaterThan(0);},30000);
it('reuses exactly equal geography across private numeric buffers, retaining harbor areas',()=>{
 const r=structuredClone(base);prepareOwnedGeography47(r);const first=graphFor47(r);expect(first).toEqual(graphFor46(r));
 withOwnedNumericGeography47(r,next=>{expect(graphFor47(next)).toBe(first);return next;});
 for(const p of r.harbors.sites)expect(areaFor46(first,p.id)).toEqual(new Set(p.cells));
});
it('detects in-place numeric and harbor alias edits rather than returning an identity hit',()=>{
 const r=structuredClone(base),first=graphFor47(r);const sample=r.terrain.elevations.findIndex(h=>h<20);new Int32Array(r.terrain.elevations.buffer)[sample]=19;
 expect(graphFor47(r)).not.toBe(first);const second=graphFor47(r);r.harbors.sites[0].shore.x+=.1;expect(graphFor47(r)).not.toBe(second);
});
it('promotes a pre-freeze sea witness without rescanning the mesh or trusting mutable samples',()=>{
 const r=structuredClone(base),first=graphFor47(r);prepareOwnedGeography47(r);expect(graphFor47(r)).toBe(first);
 const names=vi.spyOn(Object,'getOwnPropertyNames');
 try{
  withOwnedNumericGeography47(r,next=>{expect(graphFor47(next)).toBe(first);return next;});
  expect(names.mock.calls.some(([value])=>value===r.terrain.points)).toBe(false);
 }finally{names.mockRestore();}
 const before=new Int32Array(r.terrain.elevations);
 expect(()=>withOwnedNumericGeography47(r,next=>{expect(graphFor47(next)).toBe(first);next.terrain.elevations[0]++;return next;})).toThrow(/地形发生变化/);
 expect(r.terrain.elevations).toEqual(before);
 // Outside the private action, a promoted witness must still inspect samples.
 r.terrain.elevations[0]++;expect(graphFor47(r)).not.toBe(first);
});
