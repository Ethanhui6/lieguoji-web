import {describe,it,expect} from 'vitest';
import table from './culture-ethnic-weights.json';
import {nativeEnsureEthnicWeights,nativeGenerateEthnic,nativeSetEthnicWeight,nativeWeightedEthnic,loadNamedEthnicWeights,type EthnicRandom} from './ethnic-generation';
import {originalCultureWeights} from './original-cultures';
const noRandom:EthnicRandom={floatRange:()=>{throw Error('Unexpected float draw');},intRange:()=>{throw Error('Unexpected integer draw');}};

describe('recovered ethnic generation',()=>{
  it('loads all six real base cultures, retaining source property order and unequal weights',()=>{
    expect(table.cultures).toHaveLength(6);expect(table.cultures.every(c=>c.weights.length===5&&c.sourceSha256.length===64)).toBe(true);
    expect([...originalCultureWeights('Ciestundu')!]).toEqual([[0,40],[1,50],[2,5],[3,0],[4,50]]);
    expect([...originalCultureWeights('Wristhos')!.values()]).toEqual([40,10,100,0,65]);
    expect([...originalCultureWeights('Oeczea')!.values()]).toEqual([70,20,0,100,100]);
    const a=originalCultureWeights('EasternFantasy')!;a.set(0,0);expect(originalCultureWeights('EasternFantasy')!.get(0)).toBe(50);
    expect(originalCultureWeights('WorldII')).toBeNull();expect(originalCultureWeights('未知地图文化')).toBeNull();
  });
  it('initializes empty dictionaries only, leaving partial/nonpositive dictionaries untouched',()=>{
    const empty=new Map<number,number>();nativeEnsureEthnicWeights(empty);expect([...empty]).toEqual([[0,50],[1,50],[2,50],[3,50],[4,50]]);
    for(const value of [0,-1,NaN]){const partial=new Map([[4,value]]);nativeEnsureEthnicWeights(partial);expect([...partial]).toEqual([[4,value]]);}
    expect(()=>nativeEnsureEthnicWeights(null!)).toThrow('Missing');
  });
  it('loads named/int32 numeric enum keys without clearing, filling or normalizing the dictionary',()=>{
    const values=new Map([[2,7]]);loadNamedEthnicWeights(values,null);expect([...values]).toEqual([[2,7]]);
    loadNamedEthnicWeights(values,[['Maritime',-5],['Agriculture',120],['commercial',8],['2147483648',4],[' 99 ',9]]);
    expect([...values]).toEqual([[2,7],[3,0],[1,100],[99,9]]);nativeSetEthnicWeight(values,4,NaN);expect(Number.isNaN(values.get(4))).toBe(true);
  });
  it('keeps property order, excludes zero/negative/NaN and selects on inclusive cumulative boundaries',()=>{
    const weights=new Map([[4,4],[2,0],[1,1],[0,-3],[3,NaN]]),calls:number[][]=[];
    const random={...noRandom,floatRange:(a:number,b:number)=>{calls.push([a,b]);return 4;}};
    expect(nativeGenerateEthnic(weights,random)).toBe(4);expect(calls).toEqual([[0,5]]);
    expect(nativeGenerateEthnic(weights,{...random,floatRange:()=>Math.fround(4.000001)})).toBe(1);expect(weights.size).toBe(5);
  });
  it('distinguishes initialized equal weights from all-nonpositive integer fallback',()=>{
    const empty=new Map<number,number>();nativeEnsureEthnicWeights(empty);expect(nativeGenerateEthnic(empty,{...noRandom,floatRange:(a,b)=>{expect([a,b]).toEqual([0,250]);return b;}})).toBe(4);
    expect(nativeGenerateEthnic(new Map([[2,-1],[0,NaN],[4,0]]),{...noRandom,intRange:(a,b)=>{expect([a,b]).toEqual([0,5]);return 3;}})).toBe(3);
  });
  it('uses double summation then float cumulative steps and falls back to FIRST on roundoff gap',()=>{
    const candidates=[{ethnic:4,weight:16777216},{ethnic:2,weight:1},{ethnic:1,weight:1}];
    expect(nativeWeightedEthnic(candidates,3,{floatRange:(a,b)=>{expect([a,b]).toEqual([0,16777218]);return b;}})).toBe(4);
    expect(nativeWeightedEthnic(null,3,noRandom)).toBe(3);expect(nativeWeightedEthnic([],1,noRandom)).toBe(1);
  });
  it('validates unsupported web random/candidate inputs instead of inventing a native result',()=>{
    expect(()=>nativeGenerateEthnic(new Map(),{...noRandom,intRange:()=>5})).toThrow('Invalid');
    expect(()=>nativeWeightedEthnic([{ethnic:1,weight:1}],1,{floatRange:()=>2})).toThrow('Invalid');
    for(const raw of [1+Number.EPSILON,-Number.MIN_VALUE])expect(()=>nativeWeightedEthnic([{ethnic:1,weight:1}],1,{floatRange:()=>raw})).toThrow('Invalid');
    expect(()=>nativeWeightedEthnic([{ethnic:1,weight:-1}],1,noRandom)).toThrow('positive');
  });
});
