/** Original four economic profiles and resolved-holder contracts.
 * RVAs 87EF40, 883010, 723F90, 723210, 7237C0. Not wired into v15.
 * Assignment lookup/lifecycle and final skill generation remain separate. */
import {f,finite,int32} from './numeric';
export const NATIVE_ECONOMIC_OFFICES={
  Chancellor:{scope:0,cap:f(.06),a:f(.45),m:f(.05),d:f(.30),c:f(.20)},
  Steward:{scope:0,cap:f(.08),a:f(.65),m:f(.05),d:f(.15),c:f(.15)},
  Governor:{scope:1,cap:f(.08),a:f(.50),m:f(.10),d:f(.20),c:f(.20)},
  DistrictGovernor:{scope:3,cap:f(.05),a:f(.45),m:f(.10),d:f(.25),c:f(.20)},
} as const;
export type NativeEconomicOffice=keyof typeof NATIVE_ECONOMIC_OFFICES;
export interface NativeOfficeCharacter { id:number;stateId:number;alive:boolean }
export interface NativeFinalSkills { administrative:number;military:number;diplomatic:number;charisma:number }
export type ResolvedOfficeHolder=NativeOfficeCharacter&{skills:NativeFinalSkills};
export interface ResolvedOfficeAssignment {holderCharacterId:number}

/** The assignment has already been selected by the not-yet-ported lookup.
 * Do not delete it, substitute the monarch, or reject ID zero on our behalf. */
export function resolvedNativeOfficeHolder<T extends NativeOfficeCharacter>(stateId:number|null,assignment:ResolvedOfficeAssignment|null,characters:ReadonlyMap<number,T>|null):T|null {
  if(stateId===null||!assignment||!characters)return null;
  int32(stateId);int32(assignment.holderCharacterId);
  const holder=characters.get(assignment.holderCharacterId);
  return holder?.alive&&holder.stateId===stateId?holder:null;
}
export function nativeOfficeSuitability(stateId:number|null,holder:ResolvedOfficeHolder|null,office:NativeEconomicOffice|null):number {
  if(stateId===null||!holder?.alive||holder.stateId!==stateId||office===null)return 0;
  int32(stateId);
  const p=NATIVE_ECONOMIC_OFFICES[office],s=holder.skills;
  const a=f(p.a*finite(s.administrative)),m=f(p.m*finite(s.military)),d=f(p.d*finite(s.diplomatic)),c=f(finite(s.charisma)*p.c);
  const score=f(f(f(m+a)+d)+c);
  return Math.min(1,Math.max(-1,f(f(score-50)/50)));
}
function suitability(n:number):number {
  const v=finite(n);if(v < -1||v > 1)throw Error('Expected resolved normalized office suitability');return v;
}
const cap=(n:number)=>Math.min(f(.12),Math.max(f(-.12),n));
/** No holder means suitability 0, hence a neutral multiplier of 1. */
export function nativeCentralIncome(chancellor:number,steward:number):number {
  const c=f(NATIVE_ECONOMIC_OFFICES.Chancellor.cap*suitability(chancellor));
  const s=f(suitability(steward)*NATIVE_ECONOMIC_OFFICES.Steward.cap);
  return f(cap(f(s+c))+1);
}
/** Local governor factors multiply before the +/-12% cap; not an added sum. */
export function nativeLocalIncome(governor:number,districtGovernor:number):number {
  const g=f(1+f(suitability(governor)*NATIVE_ECONOMIC_OFFICES.Governor.cap));
  const d=f(1+f(suitability(districtGovernor)*NATIVE_ECONOMIC_OFFICES.DistrictGovernor.cap));
  return f(cap(f(f(d*g)-1))+1);
}
