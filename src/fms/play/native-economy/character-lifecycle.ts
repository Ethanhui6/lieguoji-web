/** Resolved age/death/retention kernels only. Callers must supply real calendar
 * years and the full native death transaction before production integration. */
import {f,finite,int32} from './numeric';

/** RVA837BC0. Int32 age delta precedes f32 conversion; each SSE op rounds. */
export function nativeNaturalDeathProbability(age:number):number{
  int32(age);
  if(age<40)return 0;
  if(age<=60)return f(f(f(f(age-40)/20)*f(.002))+f(.0005));
  if(age<=70)return f(f(f(f(age-60)/10)*f(.01))+f(.0025));
  if(age<=80)return f(f(f(f(age-70)/10)*f(.02))+f(.0125));
  return Math.min(f(.1),f(f(f(age-80)*f(.003))+f(.0325)));
}
/** Selection only, not Character.Die. Even probability zero consumes a draw. */
export function nativeRollNaturalDeath(age:number,randomValue:()=>number):boolean{
  const probability=nativeNaturalDeathProbability(age),raw=randomValue();
  if(!Number.isFinite(raw)||raw<0||raw>1)throw Error('Invalid natural death random value');
  const roll=finite(raw);
  return roll<probability;
}
export interface RetainedCharacter {
  id:number;isAlive:boolean;deathTime:number;isHistoricallyImportant:boolean;
  spouseId:number;fatherId:number;motherId:number;childrenIds:readonly number[]|null;
}
/** RVA837F00 returns the exact deletion IDs without performing deletion.
 * GetYearSince is injected, never approximated as /365 or recordedDay. */
export function nativeExpiredCharacterIds(characters:ReadonlyMap<number,RetainedCharacter>,getYearSince:(time:number)=>number):number[]{
  const important=new Set([...characters].filter(([,c])=>c.isHistoricallyImportant).map(([key])=>key));
  const result:number[]=[];
  for(const c of characters.values()){
    if(c.isAlive||int32(getYearSince(c.deathTime))<10||c.isHistoricallyImportant)continue;
    if([c.spouseId,c.fatherId,c.motherId].some(id=>id>0&&important.has(id)))continue;
    if(c.childrenIds?.some(id=>important.has(id)))continue;
    result.push(c.id);
  }
  return result;
}
