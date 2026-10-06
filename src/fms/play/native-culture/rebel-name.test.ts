import {describe,it,expect,vi} from 'vitest';
import type {NativeNamingCulture} from './localized-name';
import {nativeRebelNameSets,nativeRebelNameKey,nativeMapRebelNameKey} from './rebel-name';
const culture=(names:readonly (string|null)[]=['甲','乙','丙']):NativeNamingCulture=>({languages:new Map([['Chinese',0]]),states:new Map(names.map((v,i)=>['k'+i,{key:'k'+i,names:[v]}])),cities:new Map()});
describe('original rebel country display-name pools, not initial name shuffle',()=>{
 it('collects history and IsValid names separately, preserves spaces and negative nonzero i',()=>{
  const s=(i:number,isDead:boolean,name:string|null,cultureName:string|null='c')=>({i,isDead,name,cultureName});
  const r=nativeRebelNameSets([null,s(0,false,'空白国'),s(1,true,'已亡'),s(-1,false,'负数'),s(2,false,' '),s(3,false,''),s(4,false,null),s(5,false,'外','other'),s(6,false,'负数')],'c');
  expect([...r.used]).toEqual(['空白国','已亡','负数',' ']);expect([...r.current]).toEqual(['负数',' ']);
 });
 it('preferred excludes only used, even when its choice appears in current',()=>{
  const random=vi.fn(()=>0);expect(nativeRebelNameKey(culture(),'Chinese',new Set(['乙','丙']),new Set(['甲']),random)).toBe('k0');expect(random).toHaveBeenCalledExactlyOnceWith(0,1);
 });
 it('exhausted preferred falls back to current-only exclusions and permits a historic name',()=>{
  const random=vi.fn(()=>1);expect(nativeRebelNameKey(culture(),'Chinese',new Set(['甲','乙','丙']),new Set(['乙']),random)).toBe('k2');expect(random).toHaveBeenCalledExactlyOnceWith(0,2);
 });
 it('empty final pool returns null without a random draw',()=>{
  const random=vi.fn(()=>0),all=new Set(['甲','乙','丙']);expect(nativeRebelNameKey(culture(),'Chinese',all,all,random)).toBeNull();expect(random).not.toHaveBeenCalled();
 });
 it('uses only current-language rows: no fallback translation/key/trim and no duplicate-display dedupe',()=>{
  const random=vi.fn(()=>2);expect(nativeRebelNameKey(culture([null,'',' ','同名','同名']),'Chinese',null,null,random)).toBe('k4');expect(random).toHaveBeenCalledExactlyOnceWith(0,3);
  const no=vi.fn(()=>0);expect(nativeRebelNameKey(culture(),'English',null,null,no)).toBeNull();expect(no).not.toHaveBeenCalled();
 });
 it('keeps supplied membership semantics without copying or normalizing',()=>{
  const used={has:(s:string)=>s.toLowerCase()==='alpha'};expect(nativeRebelNameKey(culture(['ALPHA','Beta']),'Chinese',used,null,()=>0)).toBe('k1');
 });
 it('skips a snapshotted key removed during an earlier comparison, but still rejects an existing null row',()=>{
  const c=culture(),states=new Map(c.states);c.states=states;const used={has:()=>{states.delete('k1');return false;}},random=vi.fn(()=>1);expect(nativeRebelNameKey(c,'Chinese',used,null,random)).toBe('k2');expect(random).toHaveBeenCalledExactlyOnceWith(0,2);
 });
 it('unknown map culture has no alias/default fallback; null map value throws',()=>{
  const maps=new Map([['map-c',culture()],['null',null]]),random=vi.fn(()=>0);for(const id of [null,'','c'])expect(nativeMapRebelNameKey(maps,id,'Chinese',null,null,random)).toBeNull();expect(random).not.toHaveBeenCalled();expect(()=>nativeMapRebelNameKey(maps,'null','Chinese',null,null,random)).toThrow();expect(nativeMapRebelNameKey(maps,'map-c','Chinese',null,null,random)).toBe('k0');
 });
 it('negative language index throws, high index skips, and null row fails',()=>{
  const c=culture();c.languages=new Map([['Chinese',-1]]);expect(()=>nativeRebelNameKey(c,'Chinese',null,null,()=>0)).toThrow('index');c.languages=new Map([['Chinese',1]]);expect(nativeRebelNameKey(c,'Chinese',null,null,()=>0)).toBeNull();c.languages=new Map([['Chinese',0]]);c.states=new Map([['broken',null]]);expect(()=>nativeRebelNameKey(c,'Chinese',null,null,()=>0)).toThrow('row');
 });
});
