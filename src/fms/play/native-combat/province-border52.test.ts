import {describe,it,expect} from 'vitest';
import {nativeProvinceNeighbors52,nativeProvinceProtruding52} from './province-border52';
import {nativeRegularTarget47} from '../native-war/army-target47';

describe('native province border contracts',()=>{
 it('requires strictly more than half, including empty and exactly half',()=>{
  expect(nativeProvinceProtruding52(1,[],[])).toBe(false);
  expect(nativeProvinceProtruding52(1,[0,1],[1,2])).toBe(false);
  expect(nativeProvinceProtruding52(1,[0,1,2],[1,2,2])).toBe(true);
 });
 it('counts repeated entries and state zero, without diplomacy filtering',()=>{
  expect(nativeProvinceProtruding52(1,[0,1,1],[1,0])).toBe(true);
  expect(nativeProvinceProtruding52(1,[0,1],[1,0])).toBe(false);
 });
 it('rejects invalid cell references instead of treating missing data as foreign',()=>{
  for(const cell of [-1,2,.5])expect(()=>nativeProvinceProtruding52(1,[cell],[1,2])).toThrow();
 });
 it('derives distinct foreign provinces from actual cell adjacency and clears the separate list',()=>{
  const cells=[0,1],adj=[[1,2,3],[0,2,4]];
  const out=nativeProvinceNeighbors52(7,cells,c=>adj[c],[7,7,9,0,9]);
  expect(out).toEqual({neighbors:[9,0],borderNeighborCells:[]});
  expect(cells).toEqual([0,1]);
  expect(()=>nativeProvinceNeighbors52(7,[0],()=>[99],[7])).toThrow();
 });
 it('resolved protrusion changes the existing native target preference',()=>{
  const target=(id:string,x:number,protruding:boolean)=>({id,center:{x,y:0},feature:'land',port:false,protruding});
  const near=target('near',9,false),far=target('far',10,nativeProvinceProtruding52(2,[0,1,2],[1,1,2]));
  expect(nativeRegularTarget47({x:0,y:0},{x:0,y:0},'land',[near,far])?.id).toBe('far');
  expect(nativeRegularTarget47({x:0,y:0},{x:0,y:0},'land',[near,{...far,protruding:false}])?.id).toBe('near');
 });
});
