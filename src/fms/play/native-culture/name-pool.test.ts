import {it,expect,describe} from 'vitest';
import {nativeAvailableNameKeys,nativeStateNameKey,nativeCityNameKey,nativeCultureSeedDistance} from './name-pool';
describe('resolved original culture naming pools',()=>{
 it('removes one key per used value before exactly one rank draw per survivor',()=>{
  const keys=['a','b','a','c'],used=['a','unknown'],draws=[.8,.1,.5];let calls=0;
  expect(nativeAvailableNameKeys(keys,used,()=>draws[calls++])).toEqual(['a','c','b']);expect(calls).toBe(3);expect(keys).toEqual(['a','b','a','c']);expect(used).toEqual(['a','unknown']);
 });
 it('does not confuse a state display name with a key and preserves tied f32 rank order',()=>{
  const ranks=[.5+1e-9,.5,0,1];let calls=0;expect(nativeAvailableNameKeys(['k0','k1','k2','k3'],['shown-name'],()=>ranks[calls++])).toEqual(['k2','k0','k1','k3']);expect(calls).toBe(4);
 });
 it('state exhaustion returns a missing assignment rather than recycling or numbering',()=>{
  expect(nativeStateNameKey(['a','b'],0)).toBe('a');expect(nativeStateNameKey(['a','b'],1)).toBe('b');expect(nativeStateNameKey(['a','b'],2)).toBeNull();expect(nativeStateNameKey([],0)).toBeNull();
 });
 it('city overflow independently reuses full-pool keys, including locked keys and previous results',()=>{
  const calls:number[][]=[],draw=(min:number,max:number)=>{calls.push([min,max]);return 0;};expect(nativeCityNameKey(['free'],['locked','free'],0,draw)).toBe('free');expect(calls).toHaveLength(0);expect(nativeCityNameKey(['free'],['locked','free'],1,draw)).toBe('locked');expect(nativeCityNameKey(['free'],['locked','free'],2,draw)).toBe('locked');expect(calls).toEqual([[0,2],[0,2]]);expect(nativeCityNameKey([],[],0,draw)).toBeNull();expect(calls).toHaveLength(2);
 });
 it('uses rounded capital-cell Euclidean distance rather than squared distance',()=>{
  expect(nativeCultureSeedDistance({x:3,y:4},{x:0,y:0})).toBe(5);expect(nativeCultureSeedDistance({x:16777217,y:4},{x:16777216,y:0})).toBe(4);expect(nativeCultureSeedDistance({x:-3,y:-4},{x:0,y:0})).toBe(5);
 });
 it('rejects unsupported JS random/index/coordinate inputs without consuming a fallback draw',()=>{
  for(const raw of [NaN,Infinity,1+Number.EPSILON,-Number.MIN_VALUE])expect(()=>nativeAvailableNameKeys(['a'],[],()=>raw)).toThrow('Invalid');expect(()=>nativeCityNameKey([],['a'],0,()=>1)).toThrow('Invalid');expect(()=>nativeCityNameKey([],['a'],0,()=>-.1)).toThrow('Invalid');expect(()=>nativeStateNameKey(['a'],-1)).toThrow('Invalid');expect(()=>nativeCultureSeedDistance({x:NaN,y:0},{x:0,y:0})).toThrow('Unresolved');
 });
});
