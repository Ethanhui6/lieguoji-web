import {beforeAll,describe,it,expect} from 'vitest';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {grid} from './fixture.test-support';
import {buildArmyTravelGraph47} from './army-travel47-graph';
import {cellSurfaceFeature55,projectCellData55} from './celldata-projection55';
import {stateBorderView55} from './state-border55';
import {nativeFilterProvinceCells53} from './native-combat/province-cells53';
import {nativeCountBorderContactCells} from './native-combat/border-contact55';
import {provinceBorderReader54} from './province-border54';

describe('CellData projection',()=>{
 it('copies a provided Feature and leaves the source untouched',()=>{
  const terrain=grid(()=>45),feature=Int32Array.from({length:terrain.points.length},(_,i)=>i%3);
  const before=feature.slice(),projected=projectCellData55(terrain,[{polygon:[{x:0,y:0},{x:1,y:0},{x:0,y:1}]}],1,feature);
  expect(projected.adaptation).toEqual({province:'web-triangle-vote',feature:'provided'});
  expect(projected.feature).not.toBe(feature);expect(Array.from(projected.feature)).toEqual(Array.from(before));
  projected.feature[0]=99;expect(feature[0]).toBe(before[0]);expect(Array.from(feature)).toEqual(Array.from(before));
 });
 it('floods same-surface cell neighbors instead of bridging land across sea',()=>{
  const feature=cellSurfaceFeature55([[1],[0,2],[1]],[30,0,30]);
  expect(feature[0]).toBeGreaterThan(0);expect(feature[0]).not.toBe(feature[1]);expect(feature[0]).not.toBe(feature[2]);
  expect(projectCellData55(grid(()=>45),[],1).adaptation.feature).toBe('web-surface-flood');
  expect(()=>cellSurfaceFeature55([[1]],[30,30])).toThrow();
  expect(()=>projectCellData55(grid(()=>45),[],1,[1])).toThrow();
 });
});

let base:FoundingForces47;
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),3,24,'war',{mode:'culture-generated',enabled:['chinese','japanese','english']});},30000);
describe('production border view on the founding grid',()=>{
 it('matches FilterProvinceCells and keeps neighbors, sea and feature stable across ownership',()=>{
  const r=structuredClone(base),view=stateBorderView55(r),projected=projectCellData55(r.terrain,r.world.provinces,r.scale);
  const direct=nativeFilterProvinceCells53({province:projected.province,neighbor:projected.neighbor,height:projected.height,feature:projected.feature},Array(r.world.provinces.length+1).fill(true));
  const slots=r.world.provinces.map(p=>r.world.nations.findIndex(n=>n.id===p.controller)+1),states=new Int32Array(projected.owners.length);
  for(let c=0;c<projected.owners.length;c++)if(projected.owners[c]>=0)states[c]=slots[projected.owners[c]];
  const attacker=r.world.nations[0].id;
  for(let i=0;i<r.world.provinces.length;i++){
   const row=direct[i+1]!,id=r.world.provinces[i].id,profile=view.profile(id);
   expect(profile.neighbors).toEqual(row.neighbors.map(slot=>r.world.provinces[slot-1].id));
   expect(profile.sea).toBe(row.isSeaNeighbor);expect(profile.connected).toBe(row.isAllCellsConnected);
   expect(profile.feature).toBe(row.cells.length?projected.feature[row.cells[0]]:0);
   expect(profile.contacts).toBe(row.borderNeighborCells.length);
   expect(view.contacts(id).reduce((n,c)=>n+c.cells,0)).toBe(row.borderNeighborCells.length);
   expect(view.contactCount(id,attacker)).toBe(nativeCountBorderContactCells(row.borderNeighborCells,states,1));
   expect(view.protruding(id)).toBe(provinceBorderReader54(r)(id));
  }
  const before=r.world.provinces.map(p=>({id:p.id,profile:view.profile(p.id),contacts:view.contacts(p.id),count:view.contactCount(p.id,attacker),protruding:view.protruding(p.id)}));
  for(const p of r.world.provinces)p.controller=attacker;
  for(const row of before){
   expect(view.profile(row.id)).toEqual(row.profile);expect(view.contacts(row.id)).toEqual(row.contacts);
  }
  expect(before.some(row=>view.contactCount(row.id,attacker)!==row.count||view.protruding(row.id)!==row.protruding)).toBe(true);
  expect(r.world.provinces.every(p=>!view.protruding(p.id))).toBe(true);
  expect(()=>view.contactCount(r.world.provinces[0].id,'missing-nation')).toThrow();
 });
 it('uses cell-contact counts that are not clipped march-face links',()=>{
  const r=structuredClone(base),view=stateBorderView55(r),graph=buildArmyTravelGraph47(r.terrain,r.world);
  const march=(id:string)=>{let n=0;for(const cellId of graph.byProvince.get(id)??[]){const cell=graph.cells.get(cellId)!;for(const link of cell.links){const to=graph.cells.get(link.to)!;if(to.surface==='land'&&to.provinceId&&to.provinceId!==id)n++;}}return n;};
  expect(r.world.provinces.some(p=>view.profile(p.id).contacts!==march(p.id))).toBe(true);
  expect(r.world.provinces.some(p=>view.profile(p.id).contacts>0)).toBe(true);
 });
});
