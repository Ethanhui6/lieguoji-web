import {describe,it,expect,vi} from 'vitest';
import {nativeInitStateLeaderBirth} from './leader-birth';
import {nativeBirthTimeFromAge} from './character-calendar';

describe('original ordinary founding leader birthday assignment',()=>{
 it.each([35,54])('takes the native integer [35,55) draw after generation (%s)',age=>{
  const p={age:0,birthTime:123},intRange=vi.fn(()=>age),birth=vi.fn((a:number)=>nativeBirthTimeFromAge(a,100,.1));
  nativeInitStateLeaderBirth(p,{intRange},birth);
  expect(intRange).toHaveBeenCalledExactlyOnceWith(35,55);expect(birth).toHaveBeenCalledExactlyOnceWith(age);
  expect(p).toEqual({age,birthTime:nativeBirthTimeFromAge(age,100,.1)});
 });
 it('does not consume age randomness or read time when the culture generation failed',()=>{
  const intRange=vi.fn(()=>35),birth=vi.fn(()=>0);nativeInitStateLeaderBirth(null,{intRange},birth);
  expect(intRange).not.toHaveBeenCalled();expect(birth).not.toHaveBeenCalled();
 });
 it('writes age before asking for the birthday and widens the returned float without an extra age refresh',()=>{
  const p={age:0,birthTime:123};nativeInitStateLeaderBirth(p,{intRange:()=>42},a=>{expect(p.age).toBe(42);expect(p.birthTime).toBe(123);expect(a).toBe(42);return 573.46453;});
  expect(p).toEqual({age:42,birthTime:Math.fround(573.46453)});
 });
 it('exposes failed time conversion while leaving the already assigned age in the private draft',()=>{
  const p={age:0,birthTime:123};expect(()=>nativeInitStateLeaderBirth(p,{intRange:()=>40},()=>{throw Error('clock unavailable');})).toThrow('clock unavailable');
  expect(p).toEqual({age:40,birthTime:123});
 });
 it.each([34,55,35.5,NaN])('rejects a broken random adapter rather than fabricating an adult birthday (%s)',value=>{
  const p={age:0,birthTime:123},birth=vi.fn(()=>0);expect(()=>nativeInitStateLeaderBirth(p,{intRange:()=>value},birth)).toThrow();expect(p).toEqual({age:0,birthTime:123});expect(birth).not.toHaveBeenCalled();
 });
});
