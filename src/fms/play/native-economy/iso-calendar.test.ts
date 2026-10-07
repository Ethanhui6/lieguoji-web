import {describe,it,expect} from 'vitest';
import {isoDate,isoPlusDays,isoWholeYears,isoWholeMonths,createNativeIsoCalendar,ISO_MIN_DATE,ISO_MAX_DATE,IsoDateRangeError} from './iso-calendar';
import {nativeGetDate,nativeGetDateByDayCount,nativeGetYearSince,nativeGetMonthSince,nativeBirthTimeFromAge,nativeUpdateCharacterAge} from './character-calendar';

describe('bounded proleptic ISO calendar',()=>{
 it.each([
  [1900,2,28,1,1900,3,1],[2000,2,28,1,2000,2,29],[2000,2,29,1,2000,3,1],
  [0,2,28,1,0,2,29],[-100,2,28,1,-100,3,1],[-400,2,28,1,-400,2,29],
  [1,1,1,-1,0,12,31],[0,1,1,-1,-1,12,31],[99,12,31,1,100,1,1],
  [2024,12,31,1,2025,1,1],[2024,3,1,-1,2024,2,29],
 ])('adds through year/month/leap boundaries (%s,%s,%s + %s)',(y,m,d,days,ey,em,ed)=>expect(isoPlusDays(isoDate(y,m,d),days)).toEqual(isoDate(ey,em,ed)));
 it.each([[-9999,1,1],[10000,1,1],[2023,2,29],[2024,2,30],[2024,0,1],[2024,13,1],[2024,1,0],[2024.1,1,1],[NaN,1,1]])('rejects invalid construction instead of rolling components (%s/%s/%s)',(y,m,d)=>expect(()=>isoDate(y,m,d)).toThrow(IsoDateRangeError));
 it('preserves range extrema and rejects crossing either bound',()=>{
  expect(isoPlusDays(ISO_MIN_DATE,0)).toEqual(ISO_MIN_DATE);expect(isoPlusDays(ISO_MAX_DATE,0)).toEqual(ISO_MAX_DATE);
  expect(()=>isoPlusDays(ISO_MIN_DATE,-1)).toThrow(IsoDateRangeError);expect(()=>isoPlusDays(ISO_MAX_DATE,1)).toThrow(IsoDateRangeError);
  expect(()=>isoPlusDays(isoDate(1,1,1),2147483647)).toThrow(IsoDateRangeError);expect(()=>isoPlusDays(isoDate(1,1,1),.5)).toThrow();
 });
 it('has exactly 146097 days in positive and negative 400-year cycles',()=>{
  for(const year of [-9600,-800,-400,0,400,2000,9200])expect(isoPlusDays(isoDate(year,3,1),146097)).toEqual(isoDate(year+400,3,1));
 });
 it('round-trips varied signed offsets without timezone or JS Date year remapping',()=>{
  for(const start of [isoDate(-8000,7,30),isoDate(-1,2,28),isoDate(0,2,29),isoDate(99,6,1),isoDate(2026,10,7),isoDate(8000,7,30)])for(const days of [-100000,-366,-31,-1,0,1,31,366,100000])expect(isoPlusDays(isoPlusDays(start,days),-days)).toEqual(start);
 });
 it('takes a defensive immutable snapshot of the configured origin',()=>{const input={year:1,month:1,day:1},c=createNativeIsoCalendar(input);input.year=2000;expect(c.startDate).toEqual(isoDate(1,1,1));expect(Object.isFrozen(c.startDate)).toBe(true);});
});

describe('whole date periods and age conversion',()=>{
 it.each([
  [2012,2,29,2013,2,28,1],[2013,2,28,2012,2,29,0],
  [2020,6,15,2021,6,14,0],[2020,6,15,2021,6,15,1],
  [2021,6,15,2020,6,16,0],[2021,6,15,2020,6,15,-1],
  [-1,1,1,1,1,1,2],[1,1,1,-1,1,1,-2],
 ])('counts whole years with clamped candidate (%s/%s/%s to %s/%s/%s)',(y,m,d,ey,em,ed,n)=>expect(isoWholeYears(isoDate(y,m,d),isoDate(ey,em,ed))).toBe(n));
 it.each([
  [2023,1,31,2023,2,28,1],[2023,2,28,2023,1,31,0],
  [2024,1,31,2024,2,28,0],[2024,1,31,2024,2,29,1],
  [2023,5,30,2023,3,31,-1],[2023,3,31,2023,5,30,1],
  [-1,12,31,0,1,31,1],[0,1,31,-1,12,31,-1],
 ])('counts whole months without an average month length (%s/%s/%s to %s/%s/%s)',(y,m,d,ey,em,ed,n)=>expect(isoWholeMonths(isoDate(y,m,d),isoDate(ey,em,ed))).toBe(n));
 it('does not accept invalid start dates hidden by the end-of-month clamp',()=>{const invalid={year:2023,month:2,day:30},end=isoDate(2024,2,28);expect(()=>isoWholeYears(invalid,end)).toThrow(IsoDateRangeError);expect(()=>isoWholeMonths(invalid,end)).toThrow(IsoDateRangeError);});
 it('converts times to real dates and clamps only at the supported date range',()=>{const c=createNativeIsoCalendar(isoDate(1,1,1));expect(nativeGetDateByDayCount(-1,c)).toEqual(isoDate(0,12,31));expect(nativeGetDateByDayCount(-2147483648,c)).toEqual(ISO_MIN_DATE);expect(nativeGetDateByDayCount(2147483647,c)).toEqual(ISO_MAX_DATE);expect(nativeGetDate(NaN,1,c)).toEqual(c.startDate);expect(nativeGetDate(-1.9,1,c)).toEqual(isoDate(0,12,31));});
 it('updates a real age across a birthday instead of dividing days by 365',()=>{const c=createNativeIsoCalendar(isoDate(2000,2,29)),p={isAlive:true,age:999,birthTime:0};nativeUpdateCharacterAge(p,time=>nativeGetYearSince(time,364,1,c));expect(p.age).toBe(0);nativeUpdateCharacterAge(p,time=>nativeGetYearSince(time,365,1,c));expect(p.age).toBe(1);expect(nativeGetMonthSince(0,31,1,c)).toBe(1);});
 it('birthtime estimate is not assumed to be the inverse of whole calendar age',()=>{const c=createNativeIsoCalendar(isoDate(1,1,1)),birthday=nativeBirthTimeFromAge(35,0,1);expect(birthday).toBe(-12783.75);expect(nativeGetDate(birthday,1,c)).toEqual(isoDate(-34,1,2));expect(nativeGetYearSince(birthday,0,1,c)).toBe(34);});
});
