import {it,expect} from 'vitest';
import {isoDate,isoPlusDays,isoWholeYears,isoWholeMonths,createNativeIsoCalendar} from './civilization47-iso-calendar';
import {nativeGetMonthSince} from './native-economy/character-calendar';
import * as original from './native-economy/iso-calendar';
import {recordHistory} from './civilization47-history';
import {recordHistory as legacyRecord} from './chronicle-records';
import {assertChronicleState47} from './civilization47-chronicle-validation';
import {Culture47Session} from './culture47-session';
import {grid} from './fixture.test-support';
import {validateCivilizationWorld47} from './civilization47-world-validation';

it('retains Gregorian results in the original domain and continues beyond year9999',()=>{
 for(const y of [-9998,-400,-1,0,1,4,100,400,2000,9998])for(const m of [1,2,3,12]){
  const a=isoDate(y,m,1),b=original.isoDate(y,m,1);
  for(const days of [0,27,28,30,366])expect(isoPlusDays(a,days)).toEqual(original.isoPlusDays(b,days));
 }
 expect(isoPlusDays(isoDate(9999,12,31),1)).toEqual({year:10000,month:1,day:1});
 expect(isoPlusDays(isoDate(10000,2,28),1)).toEqual({year:10000,month:2,day:29});
 expect(isoWholeYears(isoDate(1,1,1),isoDate(20001,1,1))).toBe(20000);
 expect(isoWholeMonths(isoDate(9999,12,31),isoDate(10000,1,31))).toBe(1);
 expect(()=>isoPlusDays(isoDate(1,1,1),Number.MAX_SAFE_INTEGER+1)).toThrow();
 for(const time of [-Infinity,Infinity,-3.4028234663852886e38,0])expect(nativeGetMonthSince(time,32,.1,createNativeIsoCalendar(isoDate(1,1,1)))).toBe(nativeGetMonthSince(time,32,.1,original.createNativeIsoCalendar(isoDate(1,1,1))));
});
it('keeps all permanent records past ten thousand while original recorder remains bounded',()=>{
 const r=new Culture47Session().create({terrain:grid(),count:2,cityCount:6,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}}).run;
 const oldEntries=structuredClone(r.chronicle.entries);
 const remoteDay=structuredClone(r.world);remoteDay.day=1_000_000_001;
 expect(validateCivilizationWorld47(remoteDay)).toBe(true);
 remoteDay.day=Number.MAX_SAFE_INTEGER;expect(validateCivilizationWorld47(remoteDay)).toBe(false);
 while(r.chronicle.entries.length<10005)recordHistory(r.chronicle,r.world,r.clock.tick,'diplomacy','连续历史验证','固定数据的史书容量回归，不代表实际发生一万场战争。',['n-0'],null);
 expect(r.chronicle.entries.slice(0,oldEntries.length)).toEqual(oldEntries);expect(r.chronicle.entries.at(-1)!.id).toBe(r.chronicle.nextEntryId-1);expect(()=>assertChronicleState47(r)).not.toThrow();
 expect(()=>legacyRecord(r.chronicle,r.world,r.clock.tick,'diplomacy','旧规则','旧版保护',['n-0'],null)).toThrow('一万条');
},30000);
