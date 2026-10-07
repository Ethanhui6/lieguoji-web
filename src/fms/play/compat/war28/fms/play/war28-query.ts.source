import {nativeCountLand,type NativeWarProvince} from './native-war/score';
import type {NativePeaceQueries} from './native-war/peace';
import {nativeHasStateCollapsed,nativeGoalAchieved,type NativeCollapseQueries} from './native-war/achievement';
import type {NativeFatigueNation} from './native-war/weariness';
import {war26Strength} from './war26-strength';
import {war28Months,stateNumber,orderedWar28Provinces,type War28World,type War28State} from './war28-state';

export type War28Policy={territoryLossThreshold:(nationId:string)=>number;autonomousDiplomacy:(nationId:string)=>boolean};
export type War28Queries=NativePeaceQueries&NativeCollapseQueries&{currentOwner:(id:number)=>number};
/** Stable objects expose live state through accessors: a transfer/effect must
 * be visible to the final classifier without rebuilding a stale snapshot. */
export function war28Queries(r:War28World,s:War28State,policy:War28Policy):War28Queries{
 const numbers=new Map(s.provinceIds.map((id,i)=>[id,i+1]));
 const nation=(id:number)=>{const key=s.nationIds.find(v=>v[0]===id)?.[1];if(!key||!r.world.nations.some(n=>n.id===key))throw Error('战争国家引用缺失。');return key;};
 const provinces=new Map<number,NativeWarProvince>(s.provinceIds.map((key,i)=>[i+1,{id:i+1,isLand:true,get stateId(){const p=r.world.provinces.find(p=>p.id===key);if(!p)throw Error('战争地块引用缺失。');return stateNumber(r,p.controller);}}]));
 const states=new Map<number,NativeFatigueNation>();
 const state=(id:number):NativeFatigueNation|null=>{
  const key=s.nationIds.find(v=>v[0]===id)?.[1],n=r.world.nations.find(n=>n.id===key);if(!n)return null;
  if(stateNumber(r,n.id)!==id)throw Error('战争国家身份尚未同步。');
  if(!states.has(id)){const finance=()=>{const v=r.finance.nations[n.id];if(!v)throw Error('战争国家财政引用缺失。');return v;};
   states.set(id,{get dead(){return !r.world.provinces.some(p=>p.controller===n.id);},get provinces(){return orderedWar28Provinces(r,n.id).map(p=>provinces.get(numbers.get(p.id)!)!);},get gold(){return finance().gold;},set gold(v:number){finance().gold=v;},get goldPerMonth(){return finance().goldPerMonth;},get armyCostGold(){return finance().armyCostGold;}});
  }return states.get(id)!;
 };
 const q:War28Queries={province:id=>provinces.get(id)??null,state,currentOwner:id=>provinces.get(id)?.stateId??-1,
  // Strength still uses the documented WEB troop/ship scale.
  strength:(_state,id)=>war26Strength(r.world,r,nation(id)),monthsSince:time=>war28Months(r,time),
  rawTerritoryLossThreshold:(_state,id)=>{const v=policy.territoryLossThreshold(nation(id));if(!Number.isFinite(v))throw Error('国家战争崩溃阈值缺失。');return Math.fround(v);},
  isDeadOrZero:id=>{const value=state(id);return !value||value.dead||nativeCountLand(value)<=0;},
  hasStateCollapsed:(war,id)=>nativeHasStateCollapsed(war,id,q),goalAchieved:(war,goal)=>nativeGoalAchieved(war,goal,q),
  internalGoalsAchieved:()=>{throw Error('内部战争结算尚未接入，不能走外战适配。');},
  autonomousDiplomacy:id=>{const v=policy.autonomousDiplomacy(nation(id));if(typeof v!=='boolean')throw Error('国家自主外交开关缺失。');return v;},
 };
 return q;
}
