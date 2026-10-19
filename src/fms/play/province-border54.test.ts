import {beforeAll,it,expect} from 'vitest';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {grid} from './fixture.test-support';
import {provinceBorderReader54} from './province-border54';
import {combatReader47} from './civilization47-combat';
import {actualForces47} from './force-runtime47';
import {originalCellProvinces} from '../original/original-politics';
let base:FoundingForces47;
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),3,24,'war',{mode:'culture-generated',enabled:['chinese','japanese','english']});},30000);
it('uses rendered cell ownership and updates the same reader immediately on capture',()=>{
 const r=structuredClone(base),read=provinceBorderReader54(r),owners=originalCellProvinces(r.terrain,r.world.provinces,r.scale);
 for(let i=0;i<r.world.provinces.length;i++){
  let count=0,foreign=0;for(let c=0;c<owners.length;c++)if(owners[c]===i)for(const n of r.terrain.neighbors[c])if(owners[n]>=0&&owners[n]!==i){count++;if(r.world.provinces[owners[n]].controller!==r.world.provinces[i].controller)foreign++;}
  expect(read(r.world.provinces[i].id)).toBe(foreign/count>.5);
 }
 expect(r.world.provinces.some(p=>read(p.id))).toBe(true);
 const nation=r.world.nations[0].id;for(const p of r.world.provinces)p.controller=nation;
 expect(r.world.provinces.every(p=>!read(p.id))).toBe(true);
 expect(r.world.provinces.every(p=>!provinceBorderReader54(structuredClone(r))(p.id))).toBe(true);
});
it('changes actual combat efficiency at a surrounded home province without stale-reader defense',()=>{
 const r=structuredClone(base),spatial=actualForces47(r).spatial;
 const entry=[...spatial.space.byArmy.values()].find(v=>v.province)!;const a=entry.army,p=entry.province!;
 const enemy=r.world.nations.find(n=>n.id!==a.nationId)!.id;
 for(const q of r.world.provinces)q.controller=a.nationId;
 const read=combatReader47(r),normal=read.army(a).efficiency;
 for(const q of r.world.provinces)if(q.id!==p.id)q.controller=enemy;
 expect(provinceBorderReader54(r)(p.id)).toBe(true);
 expect(read.army(a).efficiency).toBeCloseTo(normal/2,5);
 for(const q of r.world.provinces)q.controller=a.nationId;
 expect(read.army(a).efficiency).toBe(normal);
});
it('does not keep stale topology after a same-ID adjacency edit',()=>{
 const r=structuredClone(base),read=provinceBorderReader54(r),p=r.world.provinces.find(p=>read(p.id))!;expect(p).toBeDefined();
 r.terrain.neighbors=r.terrain.neighbors.map(()=>[]);
 expect(provinceBorderReader54(r)(p.id)).toBe(false);
});
