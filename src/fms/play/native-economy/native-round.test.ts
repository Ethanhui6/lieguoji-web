import {describe,it,expect} from 'vitest';
import {nativeRoundToEven as round} from './native-round';
describe('original IL2CPP double ToEven',()=>{
 it.each([[.5,0], [1.5,2], [2.5,2], [3.5,4], [-.5,-0], [-1.5,-2], [-2.5,-2], [-3.5,-4]] as const)('midpoint %s follows even integral (%s)',(v,want)=>expect(round(v,0)).toBe(want));
 it('native nonnegative zero path discards the input negative zero',()=>{expect(Object.is(round(-0,2),0)).toBe(true);expect(Object.is(round(-.005,2),-0)).toBe(true);expect(Object.is(round(-.004,2),-0)).toBe(true);});
 it('retains double scaled addition at 2^52 rather than ideal round',()=>{expect(round(4503599627370497,0)).toBe(4503599627370498);expect(round(-4503599627370497,0)).toBe(-4503599627370498);expect(round(4503599627370496,0)).toBe(4503599627370496);});
 it('keeps double decimal precision without f32 or string decimal rounding',()=>{expect(round(16777217.125,2)).toBe(16777217.12);expect(round(1.125,2)).toBe(1.12);expect(round(1.135,2)).toBe(1.14);expect(round(.123456789012345,15)).toBe(.123456789012345);});
 it.each([1e16,-1e16,1e20,-1e20,Infinity,-Infinity,NaN])('returns outside-limit %s unchanged',v=>expect(round(v,15)).toBe(v));
 it.each([-1,16,1.5,NaN,Infinity])('rejects invalid digits %s even for nonfinite values',d=>{expect(()=>round(NaN,d)).toThrow('digits');expect(()=>round(Infinity,d)).toThrow('digits');});
});
