/** CharacterManager.AdvanceMonth 836DC0: snapshot alive entries once, update
 * age then roll natural death, annual cleanup in month12, replace stats last. */
import {int32} from './numeric';
import type {NativeMonthlyDeathStats} from './natural-death';
export interface NativeMonthlyCharacter {isAlive:boolean;age:number;birthTime:number}
export interface NativeCharacterMonth<C> {characters:ReadonlyMap<number,C|null>|null;stats:NativeMonthlyDeathStats|null}
export function nativeDeathStatsDefaults():NativeMonthlyDeathStats{return {totalDeaths:0,deathAges:[],below40:0,from40To60:0,from61To70:0,from71To80:0,above80:0};}
export function nativeAdvanceCharacterMonth<C extends NativeMonthlyCharacter>(manager:NativeCharacterMonth<C>,p:{getYearSince:(time:number)=>number;processNaturalDeath:(character:C)=>boolean;currentMonth:()=>number;cleanupOldCharacters:()=>void}):void{
 if(manager.characters===null)throw Error('Missing native character dictionary');
 const alive:C[]=[];
 for(const c of manager.characters.values()){if(c===null)throw Error('Null native character entry');if(c.isAlive)alive.push(c);}
 for(const c of alive){
  if(c.isAlive)c.age=int32(p.getYearSince(c.birthTime));
  // The source still calls ProcessNaturalDeath if an earlier callback killed
  // this already-snapshotted person; no second death-selection alive gate.
  p.processNaturalDeath(c);
 }
 if(manager.stats===null)throw Error('Missing native monthly death stats');
 if(p.currentMonth()===12)p.cleanupOldCharacters();
 manager.stats=nativeDeathStatsDefaults();
}
