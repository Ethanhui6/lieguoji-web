import {describe,it,expect} from 'vitest';
import type {World} from '../../sim/types';
import {reconcileCore,reconcileNationCore} from './core-refresh51';
import type {UpperCombat} from './upper14-state';
import {nativeCoreDistances} from './native-combat/core-distance';
function fixture(){
 const world={day:0,nations:[{id:'a',capitalId:'ca'},{id:'b',capitalId:'cb'}],cities:[{id:'ca',provinceId:'p'},{id:'cb',provinceId:'x'}],provinces:[{id:'p',controller:'a',neighbors:['q']},{id:'q',controller:'a',neighbors:['p','x']},{id:'island',controller:'a',neighbors:[]},{id:'x',controller:'b',neighbors:['q']}],custom:{seed:'fixture'}} as unknown as World;
 const upper={version:1,initialization:'native-combat-web-inputs-v1',nations:{},armies:{},provinces:Object.fromEntries(world.provinces.map(p=>[p.id,{distance:0,connected:false}]))} as UpperCombat;
 return {world,upper};
}
function oracle(w:World,u:UpperCombat,id:string){const n=w.nations.find(n=>n.id===id)!,capital=w.cities.find(c=>c.id===n.capitalId)!;return nativeCoreDistances(w.provinces.map(p=>({id:p.id,stateRef:p.controller,neighbors:p.neighbors})),id,capital.provinceId,u.nations[id].provinceOrder);}
describe('single nation core refresh with private exact-input cache',()=>{
 it('matches native disconnected ordering and skips unchanged BFS while repairing outputs',()=>{
  const {world:w,upper:u}=fixture();reconcileCore(w,u);expect(u.provinces.island.distance).toBe(3);
  expect(reconcileNationCore(w,u,'a')).toBe(false);u.provinces.q.distance=999;u.provinces.q.connected=false;
  expect(reconcileNationCore(w,u,'a')).toBe(false);
  for(const [id,v]of Object.entries(oracle(w,u,'a')))expect(u.provinces[id]).toEqual(v);
  const clone=structuredClone(u);expect(reconcileNationCore(w,clone,'a')).toBe(true);expect(clone).toEqual(u);
 });
 it('invalidates capital movement, ownership and in-place adjacency edits without growing core thresholds',()=>{
  const {world:w,upper:u}=fixture();reconcileCore(w,u);const threshold=u.nations.a.coreThreshold;
  w.cities[0].provinceId='q';expect(reconcileNationCore(w,u,'a')).toBe(true);expect(u.provinces.q.distance).toBe(0);
  expect(reconcileNationCore(w,u,'b')).toBe(false);
  w.provinces[1].controller='b';reconcileCore(w,u);expect(u.provinces.p.distance).toBe(2147483647);expect(u.provinces.q.distance).toBe(1);
  w.cities[0].provinceId='p';w.provinces[0].neighbors.push('island');w.provinces[2].neighbors.push('p');reconcileNationCore(w,u,'a');expect(u.provinces.island).toEqual({distance:1,connected:true});
  expect(u.nations.a.coreThreshold).toBe(threshold);expect(u.nations.a.coreYear).toBe(0);
 });
 it('does not let cached data hide missing neighbors or duplicate graph IDs',()=>{
  const {world:w,upper:u}=fixture();reconcileCore(w,u);w.provinces[0].neighbors.push('missing');expect(()=>reconcileNationCore(w,u,'a')).toThrow();w.provinces[0].neighbors.pop();
  w.provinces.push({...w.provinces[3]});expect(()=>reconcileNationCore(w,u,'a')).toThrow();
 });
});
