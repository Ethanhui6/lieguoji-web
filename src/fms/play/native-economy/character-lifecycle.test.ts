import {describe,it,expect} from 'vitest';
import {nativeNaturalDeathProbability,nativeRollNaturalDeath,nativeExpiredCharacterIds,type RetainedCharacter} from './character-lifecycle';
const bits=(n:number)=>new Uint32Array(new Float32Array([n]).buffer)[0];
const person=(id:number,patch:Partial<RetainedCharacter>={}):RetainedCharacter=>({id,isAlive:false,deathTime:0,isHistoricallyImportant:false,spouseId:0,fatherId:0,motherId:0,childrenIds:null,...patch});

describe('recovered character lifecycle kernels, not production death scheduling',()=>{
  it.each([[39,0],[40,0x3a03126f],[60,0x3b23d70b],[61,0x3b656042],[70,0x3c4ccccc],[71,0x3c6d9169],[80,0x3d051eb8],[81,0x3d116872],[102,0x3dc9ba5e],[103,0x3dcccccd],[2147483647,0x3dcccccd]])('preserves original f32 branch arithmetic at age %s',(age,expected)=>{
    expect(bits(nativeNaturalDeathProbability(age))).toBe(expected);
  });
  it('does not impose a forced death age and still consumes a zero-probability random draw',()=>{
    let draws=0;expect(nativeRollNaturalDeath(39,()=>{draws++;return 0;})).toBe(false);expect(draws).toBe(1);
    expect(nativeRollNaturalDeath(2147483647,()=>1)).toBe(false);
    const threshold=nativeNaturalDeathProbability(81);expect(nativeRollNaturalDeath(81,()=>threshold)).toBe(false);expect(nativeRollNaturalDeath(81,()=>threshold-0.000001)).toBe(true);
  });
  it('rejects invalid web inputs without silently changing an age or PRNG value',()=>{
    expect(()=>nativeNaturalDeathProbability(40.5)).toThrow();expect(()=>nativeRollNaturalDeath(90,()=>NaN)).toThrow();expect(()=>nativeRollNaturalDeath(90,()=>1.01)).toThrow();
    for(const raw of [1+Number.EPSILON,-Number.MIN_VALUE])expect(()=>nativeRollNaturalDeath(90,()=>raw)).toThrow('Invalid');
    const characters=new Map([[1,person(1)]]);for(const years of [NaN,10.5,Infinity])expect(()=>nativeExpiredCharacterIds(characters,()=>years)).toThrow();
  });
  it('uses supplied calendar years since DEATH and includes the exact ten-year boundary',()=>{
    const input=new Map([[1,person(1,{deathTime:9})],[2,person(2,{deathTime:10})],[3,person(3,{deathTime:11})],[4,person(4,{isAlive:true,deathTime:99})]]),calls:number[]=[];
    expect(nativeExpiredCharacterIds(input,time=>{calls.push(time);return time;})).toEqual([2,3]);expect(calls).toEqual([9,10,11]);expect(input.size).toBe(4);
  });
  it.each(['spouseId','fatherId','motherId'] as const)('protects direct %s links to important people even if that person is dead',key=>{
    const important=person(8,{isHistoricallyImportant:true}),candidate=person(1,{[key]:8});expect(nativeExpiredCharacterIds(new Map([[1,candidate],[8,important]]),()=>20)).toEqual([]);
    important.isHistoricallyImportant=false;important.isAlive=true;expect(nativeExpiredCharacterIds(new Map([[1,candidate],[8,important]]),()=>20)).toEqual([1]);
  });
  it('protects child IDs from the important dictionary keys, without recursively retaining their relatives',()=>{
    const input=new Map([[99,person(8,{isHistoricallyImportant:true})],[2,person(2,{childrenIds:[99]})],[3,person(3,{fatherId:2})],[4,person(4,{childrenIds:[8]})]]);
    expect(nativeExpiredCharacterIds(input,()=>10)).toEqual([3,4]);expect(input.get(3)!.fatherId).toBe(2);
  });
});
