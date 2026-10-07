import {describe,it,expect,vi} from 'vitest';
import {nativeGenerateExpansionism} from './state-initialization';

describe('native automatic country expansionism',()=>{
 it.each([[0,1],[.1,1.5],[.2,2],[.5,3.5],[1,6]])('value %s yields persisted float32 %s', (value,expected)=>{
  const random=vi.fn(()=>value);expect(nativeGenerateExpansionism(random)).toBe(Math.fround(expected));expect(random).toHaveBeenCalledTimes(1);
 });
 it('keeps native float32 intermediates before double one-decimal rounding',()=>{
  // Exact 2.25 rounds to even. For .27 the Unity float path produces
  // 2.3499999046325684 instead of the double expression's 2.35.
  const value=.25;expect(nativeGenerateExpansionism(()=>value)).toBe(Math.fround(2.2));
  expect(nativeGenerateExpansionism(()=>.27)).toBe(Math.fround(2.3));
 });
 it('does not clamp or replace a malformed random port with a plausible personality',()=>{
  expect(nativeGenerateExpansionism(()=>NaN)).toBeNaN();expect(nativeGenerateExpansionism(()=>-1)).toBe(-4);
 });
});
