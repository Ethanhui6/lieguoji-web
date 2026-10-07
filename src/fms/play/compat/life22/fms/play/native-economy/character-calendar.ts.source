/** Native time conversion and age update contracts. Calendar operations are
 * explicit dependencies until a real NodaTime-compatible date bridge is bound.
 * No production caller yet; recordedDay is never used as a birth date. */
import {f,int32} from './numeric';
/** GetBirthTimeFromAge 522C80: all inputs and each operation are float32.
 * This reverse estimate is not the inverse of whole calendar years. Native
 * negative ages and FP overflow propagate; no hidden clamp or date fallback. */
export function nativeBirthTimeFromAge(ageInYears:number,gameTime:number,secondsPerDay:number):number{
 return f(f(gameTime)-f(f(f(ageInYears)*f(365.25))*f(secondsPerDay)));
}
export interface NativeCalendar<DateValue>{
 readonly startDate:DateValue;readonly minDate:DateValue;readonly maxDate:DateValue;
 addDays:(date:DateValue,days:number)=>DateValue;
 /** True only for native ArgumentOutOfRange / Overflow equivalents. */
 isDateRangeFailure:(error:unknown)=>boolean;
 wholeYears:(start:DateValue,end:DateValue)=>number;
 wholeMonths:(start:DateValue,end:DateValue)=>number;
}
/** GetDateByDayCount 522CC0. Other failures remain visible to the transaction. */
export function nativeGetDateByDayCount<D>(dayCount:number,calendar:NativeCalendar<D>):D{
 const days=int32(dayCount);
 try{return calendar.addDays(calendar.startDate,days);}catch(error){
  if(!calendar.isDateRangeFailure(error))throw error;
  return days<0?calendar.minDate:calendar.maxDate;
 }
}
/** GetDate 523400: double time / widened float day interval, then truncation.
 * Non-finite quotients have explicit native branches; do not reject them first. */
export function nativeGetDate<D>(time:number,secondsPerDay:number,calendar:NativeCalendar<D>):D{
 const days=time/f(secondsPerDay);
 if(Number.isNaN(days))return calendar.startDate;
 if(days<=-2147483648)return calendar.minDate;
 if(days>=2147483647)return calendar.maxDate;
 return nativeGetDateByDayCount(Math.trunc(days),calendar);
}
/** GetYearSince 523680 / GetMonthSince 5235E0. Current gameTime is a float,
 * the historical time argument is double; calendar whole periods are required. */
export function nativeGetYearSince<D>(time:number,gameTime:number,secondsPerDay:number,calendar:NativeCalendar<D>):number{
 const start=nativeGetDate(time,secondsPerDay,calendar),end=nativeGetDate(f(gameTime),secondsPerDay,calendar);
 return int32(calendar.wholeYears(start,end));
}
export function nativeGetMonthSince<D>(time:number,gameTime:number,secondsPerDay:number,calendar:NativeCalendar<D>):number{
 const start=nativeGetDate(time,secondsPerDay,calendar),end=nativeGetDate(f(gameTime),secondsPerDay,calendar);
 return int32(calendar.wholeMonths(start,end));
}
export interface CharacterAge {isAlive:boolean;age:number;birthTime:number}
/** Character.UpdateAge 83DD30. Mutates only the caller's private candidate.
 * Dead characters never read birthday or calendar; this does not roll death. */
export function nativeUpdateCharacterAge(character:CharacterAge,getYearSince:(birthTime:number)=>number):void{
 if(!character.isAlive)return;
 const age=int32(getYearSince(character.birthTime));character.age=age;
}
