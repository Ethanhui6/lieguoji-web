import {describe,it,expect} from 'vitest';
import {nativeFilterProvinceCells53,type NativeCellInput53} from './province-cells53';
import {nativeProvinceNeighbors52,nativeProvinceProtruding52} from './province-border52';
import {nativeRegularTarget47} from '../native-war/army-target47';
const input=():NativeCellInput53=>({province:[1,1,2,3,0],neighbor:[[1,2,4],[0,2,3],[0,1],[1],[0]],height:[30,30,30,19,0],feature:[7,7,7,8,8]});
describe('native FilterProvinceCells producer',()=>{
 it('preserves external contact multiplicity and excludes unassigned sea',()=>{
  const data=input(),before=structuredClone(data),rows=nativeFilterProvinceCells53(data,[true,true,true,true]);
  expect(rows[1]).toEqual({cells:[0,1],neighbors:[2,3],borderNeighborCells:[2,2,3],isSeaNeighbor:true,isAllCellsConnected:true});
  expect(rows[0]).toEqual({cells:[],neighbors:[],borderNeighborCells:[],isSeaNeighbor:false,isAllCellsConnected:false});
  expect(data).toEqual(before);
 });
 it('unassigned water alone is not sea-neighbor and feature equality is not graph reachability',()=>{
  const data={...input(),province:[1,1,1,1,0],feature:[7,8,7,7,8]};
  const row=nativeFilterProvinceCells53(data,[true,true])[1]!;
  expect(row.isSeaNeighbor).toBe(false);expect(row.isAllCellsConnected).toBe(false);expect(row.borderNeighborCells).toEqual([]);
 });
 it('strict sea height threshold and missing slots follow original population scan',()=>{
  const rows=nativeFilterProvinceCells53({...input(),height:[30,30,30,20,0]},[true,true,false,true]);
  expect(rows[1]!.isSeaNeighbor).toBe(false);expect(rows[2]).toBeNull();expect(rows[1]!.borderNeighborCells).toEqual([2,2,3]);
 });
 it('feeds actual weighted contacts into protrusion and native target selection',()=>{
  const row=nativeFilterProvinceCells53(input(),[true,true,true,true])[1]!;
  // Two contacts to foreign state, one to own state: dedup would give exactly half.
  const states=[1,1,2,1,0],protruding=nativeProvinceProtruding52(1,row.borderNeighborCells,states);
  expect(protruding).toBe(true);
  expect(nativeProvinceProtruding52(1,[...new Set(row.borderNeighborCells)],states)).toBe(false);
  const targets=[{id:'near',center:{x:9,y:0},feature:'land',port:false,protruding:false},{id:'border',center:{x:10,y:0},feature:'land',port:false,protruding}];
  expect(nativeRegularTarget47({x:0,y:0},{x:0,y:0},'land',targets)?.id).toBe('border');
 });
 it('regeneration replaces stale borders while local neighbor recalculation stays distinct',()=>{
  const data=input(),first=nativeFilterProvinceCells53(data,[true,true,true,true])[1]!;
  first.borderNeighborCells.push(99);
  const next=nativeFilterProvinceCells53({...data,province:[1,1,1,3,0]},[true,true,true,true])[1]!;
  expect(next.borderNeighborCells).toEqual([3]);
  const local=nativeProvinceNeighbors52(1,[0,1],c=>data.neighbor[c],data.province);
  expect(local.borderNeighborCells).toEqual([]);expect(local.neighbors).toContain(0);
 });
 it('rejects mismatched arrays and invalid references without mutating input',()=>{
  expect(()=>nativeFilterProvinceCells53({...input(),height:[]},[true,true])).toThrow();
  expect(()=>nativeFilterProvinceCells53({...input(),neighbor:[[99],[],[],[],[]]},[true,true])).toThrow();
 });
});
