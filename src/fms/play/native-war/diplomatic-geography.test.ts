import {describe,it,expect,vi} from 'vitest';
import {NativeWarIdSet,type NativeWarProvince} from '../war26-native';
import {nativeUpdateDiplomaticNeighbors,type NativeNeighborState} from './diplomatic-geography';

const p=(id:number,isLand:boolean,stateId:number,neighbors:number[]=[]):NativeWarProvince=>({id,isLand,stateId,center:0,neighbors:new NativeWarIdSet(neighbors)});
function graph(){
 const provinces=[p(0,true,1,[1,6]),p(1,false,0,[0,2,6]),p(2,false,99,[1,3,7]),p(3,false,0,[2,4]),p(4,false,0,[3,5,8]),p(5,false,0,[4,9]),p(6,true,2),p(7,true,0),p(8,true,3),p(9,true,4)];
 const lookup=vi.fn((id:number)=>{if(id<0||id>=provinces.length)throw new RangeError('native province index');return provinces[id];});
 const s={id:1,provinces:[provinces[0]] as (NativeWarProvince|null)[],neighbors:new Set([100]),seaNeighbors:new Set([200])};return {s,provinces,lookup};
}
describe('native four-water-province sea neighbors',()=>{
 it('includes the fourth water layer but not the fifth, without ports or navy inputs',()=>{
  const t=graph();nativeUpdateDiplomaticNeighbors(t.s,t.lookup);expect([...t.s.neighbors]).toEqual([2]);expect([...t.s.seaNeighbors]).toEqual([2,3]);
 });
 it('allows land/sea overlap, excludes own and zero land owners, but does not require live foreign states',()=>{
  const t=graph();t.provinces[8].stateId=-7;nativeUpdateDiplomaticNeighbors(t.s,t.lookup);expect([...t.s.seaNeighbors]).toEqual([2,-7]);expect(t.s.seaNeighbors.has(0)).toBe(false);expect(t.s.seaNeighbors.has(1)).toBe(false);
 });
 it('duplicate queue entries consume no extra depth and cycles do not repeat an object expansion',()=>{
  const t=graph();t.provinces[1].neighbors=new NativeWarIdSet([0,2,3]);t.provinces[2].neighbors=new NativeWarIdSet([1,3]);nativeUpdateDiplomaticNeighbors(t.s,t.lookup);
  expect(t.s.seaNeighbors.has(4)).toBe(true);expect(t.lookup.mock.calls.filter(x=>x[0]===8)).toHaveLength(1);
 });
 it('uses object identity for seeds and visited, not a possibly aliased province ID',()=>{
  const t=graph();t.provinces[2].id=t.provinces[1].id;nativeUpdateDiplomaticNeighbors(t.s,t.lookup);expect(t.s.seaNeighbors.has(3)).toBe(true);
  const v=graph();v.provinces[0].neighbors=new NativeWarIdSet([1,2]);v.provinces[2]=v.provinces[1];nativeUpdateDiplomaticNeighbors(v.s,v.lookup);expect(v.lookup.mock.calls.filter(x=>x[0]===6)).toHaveLength(1);
 });
 it('does not filter the source list by owner or isLand and seeds its neighbors, not the source itself',()=>{
  const t=graph();t.s.provinces=[t.provinces[2]];nativeUpdateDiplomaticNeighbors(t.s,t.lookup);expect([...t.s.neighbors]).toEqual([]);expect([...t.s.seaNeighbors]).toEqual([2,3,4]);
 });
 it('keeps ordered clearing and partial writes if later source data is invalid',()=>{
  const t=graph();t.s.provinces.push(null);expect(()=>nativeUpdateDiplomaticNeighbors(t.s,t.lookup)).toThrow(/null reference/);expect([...t.s.neighbors]).toEqual([2]);expect([...t.s.seaNeighbors]).toEqual([]);
  const s:NativeNeighborState={...t.s,neighbors:new Set([100]),seaNeighbors:null};expect(()=>nativeUpdateDiplomaticNeighbors(s,t.lookup)).toThrow(/null reference/);expect([...(s.neighbors as Set<number>)]).toEqual([]);
 });
 it('propagates invalid index and null lookup/collection failures rather than silently skipping provinces',()=>{
  const t=graph();t.provinces[0].neighbors=new NativeWarIdSet([-1]);expect(()=>nativeUpdateDiplomaticNeighbors(t.s,t.lookup)).toThrow(/index/);
  expect(()=>nativeUpdateDiplomaticNeighbors(t.s,()=>null)).toThrow(/null reference/);
  expect(()=>nativeUpdateDiplomaticNeighbors({...t.s,provinces:null},t.lookup)).toThrow(/null reference/);
 });
 it('does not re-read an output set for a land owner excluded before the native add branch',()=>{
  const t=graph(),s:NativeNeighborState={...t.s,provinces:[p(20,true,1,[0])]};
  expect(()=>nativeUpdateDiplomaticNeighbors(s,()=>{s.neighbors=null;return t.provinces[0];})).not.toThrow();expect(s.neighbors).toBeNull();
 });
});
