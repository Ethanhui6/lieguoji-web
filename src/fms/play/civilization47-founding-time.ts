/** Founding records of states created mid-run (see civilization47-founding.ts).
 * Kept dependency-free: population, calendar and lifecycle validators measure
 * founding ages from the founding time of the person's state (0 at opening). */
export const FOUNDING_RULE47='original-rebel-state-v1';
export type Founding47={nationId:string;stateId:number;parentId:string;provinceIds:string[];tick:number;day:number;gameTime:number;month:number;leaderId:number;personIds:number[];couples:[number,number][];entryId:number};
/** Rebellion state of the world. enabled = 允许叛乱; minMonths = 行省叛乱最小间隔
 * (WorldSettings.minMonthSinceLastRebel); destinyToRebel* and recalTime =
 * DiplomacyManager statics; coreMonths = Province.MonthsCoreProvinceForState;
 * conquered = Province.timeStampLastConquered; lastRebel / recent =
 * State.timeStampLastRebel and recentRebellionTimes; updateDays = the
 * provinces' random monthly update days. Times are game time. */
export type Foundings47={version:1;rule:typeof FOUNDING_RULE47;enabledTick:number;revision:number;records:Founding47[];
  enabled:boolean;minMonths:number;month:number;random:{state:number;draws:number};destinyToRebel:number;destinyToRebelConnected:number;recalTime:number;
  coreMonths:Record<string,Record<string,number>>;conquered:Record<string,{controller:string;time:number}>;lastRebel:Record<string,number>;recent:Record<string,number[]>;updateDays:Record<string,number>};
type WithFoundings={foundings?:Foundings47};
export function foundingOfState47(r:object,stateId:number):Founding47|null{return (r as WithFoundings).foundings?.records.find(f=>f.stateId===stateId)??null;}
/** Game time a state was founded (0 for opening states). */
export const foundingTimeOfState47=(r:object,stateId:number)=>foundingOfState47(r,stateId)?.gameTime??0;
/** Month key in which founding ages were set (12 = the opening month). */
export const foundingMonthOfState47=(r:object,stateId:number)=>foundingOfState47(r,stateId)?.month??12;
