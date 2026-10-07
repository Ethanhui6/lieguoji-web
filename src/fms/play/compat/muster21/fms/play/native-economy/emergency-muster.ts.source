/** Recovered quantity kernels only. Not yet wired into production v20.
 * UpdateArmy 5DC560–5DC837 and EmergencyCallArmy 5C50F0.
 * Eligibility, scheduling, placement and mutations belong to their caller. */
import original from './character-traits.json';
import {f,finite,int32} from './numeric';
export interface EmergencyTrait {name?:string;emergencyMobilizationModifier?:number;canEmergencyMobilization?:boolean}
export const ORIGINAL_EMERGENCY_TRAITS:readonly EmergencyTrait[]=original.traits;
export type EmergencyQuantity={allowed:boolean;count:number;multiplier:number};
/** CharacterTrait constructor defaults the omitted boolean to true, not false.
 * A missing leader/list is neutral. Null entries remain unresolved native data. */
export function nativeEmergencyMultiplier(traits:readonly (EmergencyTrait|null)[]|null):{allowed:boolean;multiplier:number}{
 let multiplier=f(1);
 for(const trait of traits??[]){
  if(!trait||trait.canEmergencyMobilization!==undefined&&typeof trait.canEmergencyMobilization!=='boolean')throw Error('Unresolved emergency trait');
  if(trait.canEmergencyMobilization===false)return {allowed:false,multiplier};
  const add=finite(trait.emergencyMobilizationModifier??0);if(add>0)multiplier=f(multiplier+add);
 }
 return {allowed:true,multiplier};
}
/** Native round-up then cvttsd2si; invalid/out-of-range becomes INT_MIN under
 * masked FP exceptions. The web adapter must reject unusable negative counts. */
function ceilInt(value:number){const n=Math.ceil(f(value));return !Number.isFinite(n)||n< -2147483648||n>2147483647?-2147483648:n|0;}
export function nativeMonthlyEmergencyQuantity(destiny:number,traits:readonly (EmergencyTrait|null)[]|null):EmergencyQuantity{
 const result=nativeEmergencyMultiplier(traits);if(!result.allowed)return {...result,count:0};
 const d=finite(destiny);return {...result,count:ceilInt(f(f(f(d/f(100))*f(10))*result.multiplier))};
}
/** Public explicit request: do not apply the monthly destiny formula first or
 * run this after it, which would multiply positive traits twice. */
export function nativeRequestedEmergencyQuantity(requested:number,traits:readonly (EmergencyTrait|null)[]|null):EmergencyQuantity{
 // Public entry scans all vetoes before reading any positive modifier. Unlike
 // the monthly single pass, an earlier unresolved modifier cannot mask a veto.
 for(const trait of traits??[]){
  if(!trait||trait.canEmergencyMobilization!==undefined&&typeof trait.canEmergencyMobilization!=='boolean')throw Error('Unresolved emergency trait');
  if(trait.canEmergencyMobilization===false)return {allowed:false,count:0,multiplier:1};
 }
 const result=nativeEmergencyMultiplier(traits);if(!result.allowed)return {...result,count:0};
 return {...result,count:ceilInt(f(f(int32(requested))*result.multiplier))};
}
