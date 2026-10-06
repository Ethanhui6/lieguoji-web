/** Recovered initialization and trait selection. Random callbacks are explicit:
 * a seeded web stream is not the Unity global PRNG or its exact distribution. */
import original from './character-traits.json';
import {f,finite,int32} from './numeric';
import type {NativeBaseSkills,NativeIncomeTrait} from './character-income';
export interface NativeCharacterTrait extends NativeIncomeTrait {incompatibleTraits?:readonly string[]|null}
export interface CharacterRandom {value:()=>number;floatRange:(min:number,max:number)=>number;intRange:(min:number,max:number)=>number}
export const NATIVE_CHARACTER_POOL:readonly NativeCharacterTrait[]=original.traits;
/** Loader527800 ignores JSON.type, using ordered four-skill sum, strict +/-5. */
export function nativeTraitType(t:NativeCharacterTrait):'Positive'|'Negative'|'Neutral'{
 const sum=f(f(f(finite(t.militaryModifier)+finite(t.charismaModifier))+finite(t.diplomaticModifier))+finite(t.administrativeModifier));
 return sum>5?'Positive':sum < -5?'Negative':'Neutral';
}
export function nativeTraitsCompatible(candidate:NativeCharacterTrait|null,selected:readonly (NativeCharacterTrait|null)[]):boolean{
 for(const other of selected)if(candidate&&other&&(candidate.incompatibleTraits?.includes(other.name)||other.incompatibleTraits?.includes(candidate.name)))return false;
 return true;
}
export function nativeRandomTraits(count:number,pool:readonly NativeCharacterTrait[],random:Pick<CharacterRandom,'value'|'intRange'>):NativeCharacterTrait[]{
 int32(count);const result:NativeCharacterTrait[]=[];if(count<=0||!pool.length)return result;
 const positive=pool.filter(t=>nativeTraitType(t)==='Positive'),neutral=pool.filter(t=>nativeTraitType(t)==='Neutral'),negative=pool.filter(t=>nativeTraitType(t)==='Negative');
 const eligible=(t:NativeCharacterTrait)=>!result.includes(t)&&nativeTraitsCompatible(t,result);
 for(let i=0;i<count;i++){
  const r=finite(random.value());if(r<0||r>1)throw Error('Invalid character random value');
  const source=r<f(.4)&&positive.length?positive:r<f(.7)&&neutral.length?neutral:negative.length?negative:pool;
  let candidates=source.filter(eligible);if(!candidates.length)candidates=pool.filter(eligible);if(!candidates.length)break;
  const index=int32(random.intRange(0,candidates.length));if(index<0||index>=candidates.length)throw Error('Invalid character random index');result.push(candidates[index]);
 }
 return result;
}
export function nativeInitialCharacter(random:CharacterRandom,pool=NATIVE_CHARACTER_POOL):{base:NativeBaseSkills;traits:NativeCharacterTrait[]}{
 const draw=()=>Math.min(100,Math.max(0,finite(random.floatRange(20,80))));
 const charisma=draw(),military=draw(),diplomatic=draw(),administrative=draw();
 const count=int32(random.intRange(1,4));if(count<1||count>=4)throw Error('Invalid initial trait count');
 return {base:{charisma,military,diplomatic,administrative},traits:nativeRandomTraits(count,pool,random)};
}
/** Documented deterministic web bridge, stable by person identity. */
export function seededCharacterRandom(seed:string):CharacterRandom{
 let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);
 const word=()=>{h=(h+0x6d2b79f5)|0;let t=Math.imul(h^(h>>>15),1|h);t^=t+Math.imul(t^(t>>>7),61|t);return(t^(t>>>14))>>>0;};
 return {value:()=>f(word()/4294967295),floatRange:(min,max)=>f(f(min)+f(f(max-min)*f(word()/4294967295))),intRange:(min,max)=>min+Math.floor(word()/4294967296*(max-min))};
}
