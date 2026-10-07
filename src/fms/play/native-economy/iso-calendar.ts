/** Bounded, timezone-free ISO/Gregorian calendar adapter. Algorithm written for
 * the web; NodaTime semantic evidence is recorded separately. No JS Date, local
 * timezone, 0..99 year remapping, or fixed 365-day year approximation. */
import type {NativeCalendar} from './character-calendar';
import {int32} from './numeric';

export interface IsoDate {readonly year:number;readonly month:number;readonly day:number}
export class IsoDateRangeError extends RangeError {}
const MIN_YEAR=-9998,MAX_YEAR=9999;
const leap=(year:number)=>year%4===0&&(year%100!==0||year%400===0);
const monthLength=(year:number,month:number)=>month===2?(leap(year)?29:28):[4,6,9,11].includes(month)?30:31;

export function isoDate(year:number,month:number,day:number):IsoDate{
 if(!Number.isInteger(year)||year<MIN_YEAR||year>MAX_YEAR||!Number.isInteger(month)||month<1||month>12||!Number.isInteger(day)||day<1||day>monthLength(year,month))throw new IsoDateRangeError('ISO calendar date out of range');
 return Object.freeze({year:year===0?0:year,month,day});
}
export const ISO_MIN_DATE=isoDate(MIN_YEAR,1,1),ISO_MAX_DATE=isoDate(MAX_YEAR,12,31);
const startOfYear=(year:number)=>{const y=year-1;return 365*y+Math.floor(y/4)-Math.floor(y/100)+Math.floor(y/400);};
function dayNumber(value:IsoDate):number{
 const date=isoDate(value.year,value.month,value.day);let result=startOfYear(date.year)+date.day-1;
 for(let month=1;month<date.month;month++)result+=monthLength(date.year,month);
 return result;
}
const MIN_DAY=dayNumber(ISO_MIN_DATE),MAX_DAY=dayNumber(ISO_MAX_DATE);
function fromDayNumber(day:number):IsoDate{
 if(day<MIN_DAY||day>MAX_DAY)throw new IsoDateRangeError('ISO day addition out of range');
 let low=MIN_YEAR,high=MAX_YEAR;
 while(low<high){const middle=Math.ceil((low+high)/2);if(startOfYear(middle)<=day)low=middle;else high=middle-1;}
 let remaining=day-startOfYear(low),month=1;
 while(remaining>=monthLength(low,month)){remaining-=monthLength(low,month);month++;}
 return isoDate(low,month,remaining+1);
}
export function isoPlusDays(date:IsoDate,days:number):IsoDate{return fromDayNumber(dayNumber(date)+int32(days));}
const compare=(a:IsoDate,b:IsoDate)=>dayNumber(a)-dayNumber(b);
/** End-of-month adjustment belongs to date addition before deciding whether a
 * whole period overshoots. Negative periods need not negate the reverse pair. */
export function isoWholeYears(start:IsoDate,end:IsoDate):number{
 dayNumber(start);dayNumber(end);
 const difference=end.year-start.year,candidate=isoDate(end.year,start.month,Math.min(start.day,monthLength(end.year,start.month)));
 const order=compare(candidate,end);return difference>0&&order>0?difference-1:difference<0&&order<0?difference+1:int32(difference);
}
export function isoWholeMonths(start:IsoDate,end:IsoDate):number{
 // Validate both complete dates, including the otherwise unused starting day.
 dayNumber(start);dayNumber(end);
 const difference=(end.year-start.year)*12+end.month-start.month,candidate=isoDate(end.year,end.month,Math.min(start.day,monthLength(end.year,end.month)));
 const order=compare(candidate,end);return difference>0&&order>0?difference-1:difference<0&&order<0?difference+1:int32(difference);
}
export function createNativeIsoCalendar(start:IsoDate):NativeCalendar<IsoDate>{
 return {startDate:isoDate(start.year,start.month,start.day),minDate:ISO_MIN_DATE,maxDate:ISO_MAX_DATE,addDays:isoPlusDays,isDateRangeFailure:(error)=>error instanceof IsoDateRangeError,wholeYears:isoWholeYears,wholeMonths:isoWholeMonths};
}
