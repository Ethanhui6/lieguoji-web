/** Original culture-weight and selection kernels, not yet a country-culture bridge.
 * Evidence: court16/NEXT_RECOVERY. No mutation of the frozen v16 engine. */
import {f,finite,int32} from './numeric';

export const NATIVE_ETHNIC_NAMES=['FishAndHunting','Agriculture','Nomadic','Maritime','Commercial'] as const;
export type NativeEthnicName=typeof NATIVE_ETHNIC_NAMES[number];
export type EthnicWeights=Map<number,number>;
export interface EthnicRandom {floatRange:(min:number,max:number)=>number;intRange:(min:number,max:number)=>number}

/** Original setter clamps each float, not the sum; NaN survives comparisons. */
export function nativeSetEthnicWeight(weights:EthnicWeights,ethnic:number,weight:number):void{
  if(!weights)throw Error('Missing original ethnic dictionary');
  int32(ethnic);let value=f(weight);if(value<0)value=0;else if(value>100)value=100;weights.set(ethnic,value);
}
/** Nonempty means initialized even when partial, zero-only or negative. */
export function nativeEnsureEthnicWeights(weights:EthnicWeights):void{
  if(!weights)throw Error('Missing original ethnic dictionary');
  if(weights.size)return;
  for(let i=0;i<NATIVE_ETHNIC_NAMES.length;i++)weights.set(i,50);
}
/** Enum.TryParse named/numeric finite int32 subset used by culture JSON.
 * The full C# comma-separated enum parser is deliberately outside this adapter. */
export function loadNamedEthnicWeights(weights:EthnicWeights,entries:readonly (readonly [string,number])[]|null):void{
  if(!entries)return;
  for(const [key,value]of entries){
    const trimmed=key.trim(),named=NATIVE_ETHNIC_NAMES.indexOf(trimmed as NativeEthnicName);
    const numeric=/^[+-]?\d+$/.test(trimmed)?Number(trimmed):NaN;
    const id=named>=0?named:numeric;
    if(!Number.isInteger(id)||id< -2147483648||id>2147483647)continue;
    nativeSetEthnicWeight(weights,id,value);
  }
}
export interface WeightedEthnic {ethnic:number;weight:number}
/** Float Sum accumulates in double, then rounds once; selection accumulates f32.
 * Generic helper accepts finite positive weights; native callers filter first. */
export function nativeWeightedEthnic(candidates:readonly WeightedEthnic[]|null,defaultEthnic:number,random:Pick<EthnicRandom,'floatRange'>):number{
  if(!candidates?.length)return defaultEthnic;
  let sum=0;for(const item of candidates){const weight=finite(item.weight);if(weight<=0)throw Error('Expected positive candidate weight');sum+=weight;}
  const total=finite(sum),raw=random.floatRange(0,total);
  if(!Number.isFinite(raw)||raw<0||raw>total)throw Error('Invalid ethnic random value');
  const draw=finite(raw);
  let cumulative=0;for(const item of candidates){cumulative=f(cumulative+f(item.weight));if(cumulative>=draw)return item.ethnic;}
  return candidates[0].ethnic;
}
/** Copies dictionary in enumeration order; no sorting or re-normalization. */
export function nativeGenerateEthnic(weights:ReadonlyMap<number,number>,random:EthnicRandom):number{
  if(!weights)throw Error('Missing original ethnic dictionary');
  const candidates=[...new Map(weights)].filter(([,weight])=>f(weight)>0).map(([ethnic,weight])=>({ethnic,weight:f(weight)}));
  if(candidates.length)return nativeWeightedEthnic(candidates,1,random);
  const id=int32(random.intRange(0,NATIVE_ETHNIC_NAMES.length));if(id<0||id>=NATIVE_ETHNIC_NAMES.length)throw Error('Invalid ethnic random index');return id;
}
