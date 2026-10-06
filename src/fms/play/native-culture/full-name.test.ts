import {describe,it,expect,vi} from 'vitest';
import {nativeNameOrder,nativeFullName,nativeLastName,nativeFullNameCulture,nativeFamilyIncludingHistorical,type NativeNameOrderCulture} from './full-name';
describe('original family-derived full name formatting',()=>{
 it('keeps native no-separator family-first versus single-space given-first',()=>{
  expect(nativeFullName('明','李',1)).toBe('李明');for(const order of [null,0,2,-1])expect(nativeFullName('明','李',order)).toBe('明 李');
 });
 it('preserves null/empty/Unknown/whitespace concat semantics',()=>{
  expect(nativeFullName(null,null,1)).toBe('');expect(nativeFullName(null,null,null)).toBe(' ');expect(nativeFullName(null,'李',0)).toBe(' 李');expect(nativeFullName('明',null,0)).toBe('明 ');expect(nativeFullName('Unknown','Unknown',1)).toBe('UnknownUnknown');expect(nativeFullName(' 明 ',' 李 ',1)).toBe(' 李  明 ');
 });
 it('checks female then male then surname and does not touch later null pools',()=>{
  const c:NativeNameOrderCulture={nameOrder:1,female:{size:2},male:null,surnames:null},fallback=vi.fn(()=>null);expect(nativeNameOrder(c,fallback)).toBe(1);c.female={size:0};expect(()=>nativeNameOrder(c,fallback)).toThrow('Missing');c.male={size:1};expect(nativeNameOrder(c,fallback)).toBe(1);expect(fallback).not.toHaveBeenCalled();
 });
 it('all-empty pools use exact default ID, ignoring configured order',()=>{
  const c={nameOrder:0,female:{size:0},male:{size:0},surnames:{size:0}};expect(nativeNameOrder(c,()=> 'EasternFantasy')).toBe(1);c.nameOrder=1;for(const id of [null,'EasternFantasy ','WesternFantasy'])expect(nativeNameOrder(c,()=>id)).toBe(0);
 });
 it('resolves surname and order independently from original/current families',()=>{
  const families=new Map([[1,{surname:'李',cultureName:''}],[2,{surname:'王',cultureName:'map-west'}]]),lookup=(id:number)=>families.get(id)??null;
  const last=nativeLastName(1,2,'Stored',lookup),culture=nativeFullNameCulture(1,2,lookup,id=>id==='map-west'?{order:0}:null);expect(last).toBe('李');expect(nativeFullName('明',last,culture!.order)).toBe('明 李');
 });
 it('uses original culture even when its surname falls back to current family',()=>{
  const families=new Map([[1,{surname:'',cultureName:'original'}],[2,{surname:'王',cultureName:'current'}]]),lookup=(id:number)=>families.get(id)??null,map=vi.fn((id:string)=>id==='original'?1:0);
  expect(nativeFullName('明',nativeLastName(1,2,null,lookup),nativeFullNameCulture(1,2,lookup,map))).toBe('王明');expect(map.mock.calls).toEqual([['original']]);
 });
 it('does not trim family values, deduplicate equal IDs, or infer culture from stored names',()=>{
  const lookup=vi.fn(()=>({surname:'',cultureName:'missing'})),map=vi.fn(()=>null);expect(nativeLastName(2,2,null,lookup)).toBe('');expect(lookup.mock.calls).toEqual([[2],[2]]);lookup.mockClear();expect(nativeFullNameCulture(2,2,lookup,map)).toBeNull();expect(map).toHaveBeenCalledTimes(2);
  expect(nativeLastName(1,2,'stored',()=>({surname:' ',cultureName:' '}))).toBe(' ');expect(nativeLastName(0,-1,'stored',lookup)).toBe('stored');expect(nativeFullNameCulture(1,2,null,map)).toBeNull();
 });
 it('current nonnull family suppresses historical even with empty fields; null value falls through',()=>{
  const current=new Map([[1,{surname:'',cultureName:''}],[2,null]]),historical=new Map([[1,{surname:'Old',cultureName:'East'}],[2,{surname:'Other',cultureName:'West'}]]);
  expect(nativeFamilyIncludingHistorical(1,current,historical)).toBe(current.get(1));expect(nativeFamilyIncludingHistorical(2,current,historical)).toBe(historical.get(2));expect(nativeFamilyIncludingHistorical(1,current,null)).toBe(current.get(1));expect(()=>nativeFamilyIncludingHistorical(2,current,null)).toThrow('Missing historical');
 });
 it('family lookup itself supports zero/negative IDs and does not validate record identity',()=>{
  const family={id:99},current=new Map([[0,family],[-1,family]]);expect(nativeFamilyIncludingHistorical(0,current,null)).toBe(family);expect(nativeFamilyIncludingHistorical(-1,current,null)).toBe(family);expect(()=>nativeFamilyIncludingHistorical(0,null,new Map())).toThrow('Missing current');
 });
});
