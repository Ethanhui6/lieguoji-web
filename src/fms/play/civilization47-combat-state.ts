import {fastChecks47} from './checks47';
import original from './native-economy/character-traits.json';
import {nativeCharacterSkills} from './native-economy/character-income';
import {nativeDamageSnapshot47,nativeLeaderEnemies47,type DamageTrait47} from './native-combat/personnel47';
import type {FoundingForces47} from './civilization47-forces';
import type {World} from '../../sim/types';
import type {Population47} from './civilization47-population-types';

type ArmyCombat47={nationAtInitialization:string;initializedTick:number;command:'central';damageTraitsAtInitialization:DamageTrait47[];damageToArmy:number;damageToProvince:number};
type LeaderCombat47={leaderId:number|null;traitNames:string[];enemyIds:string[];refreshedTick:number;modifier:number};
export type CombatPersonnel47={version:1;rule:'native-personnel-web-central-v1';hullPerNativeCount:1;protrusion:'neutral-unrecovered-v1';nations:Record<string,{damageTraits:DamageTrait47[];leader:LeaderCombat47}>;armies:Record<string,ArmyCombat47>};
type PeopleRun=Pick<Population47,'people'|'kin'>;
/** Names, religion and culture never turn into combat traits. Missing JSON
 * optional float fields are explicitly normalized to the web loader's zero. */
export function combatTraits47(names:readonly string[]|null){return (names??[]).map(name=>{const t=original.traits.find(t=>t.name===name);if(!t)throw Error('未知人物战斗特性。');return {...t,combatModifierPerEnemy:('combatModifierPerEnemy' in t?t.combatModifierPerEnemy:0) as number,navalCombatModifier:('navalCombatModifier' in t?t.navalCombatModifier:0) as number};});}
/** Current leader must be the existing, matching live person; a stale/dead
 * reference is corrupt, not an excuse to keep a former ruler's bonus. */
export function livingCombatLeader47(r:PeopleRun,id:string){
  const nation=r.people.nations[id];if(!nation)throw Error('军事人物所属国家缺失。');if(nation.leaderId===null)return null;
  const p=r.kin.persons[nation.leaderId],c=r.people.persons[nation.leaderId];
  if(!p||!c||!p.isAlive||!c.alive||p.stateId!==nation.id||c.stateId!==nation.id||c.nationId!==id||p.id!==nation.leaderId||JSON.stringify(c.base)!==JSON.stringify(p.base)||JSON.stringify(c.traits)!==JSON.stringify(p.traits))throw Error('当前军事领袖身份或能力投影无效。');
  const traits=combatTraits47(p.traits),skills=nativeCharacterSkills(p.base,traits);if(Object.values(skills).some(n=>!Number.isFinite(n)))throw Error('当前军事领袖能力无效。');return {person:p,traits,skills};
}
type WarRun=PeopleRun&Pick<FoundingForces47,'nativeWars'|'world'|'clock'>;
/** Native all-active-wars opposite-side HashSet, mapped to the web's saved
 * campaign identities. No alive-land filter: extinct but unresolved members
 * remain enemies until their actual departure/end is recorded. */
export function militaryEnemyIds47(r:WarRun,id:string){
  const state=r.people.nations[id]?.id;if(!state)throw Error('敌国查询缺少国家身份。');const ids=new Map(r.nativeWars.nationIds),result=new Set<string>();
  for(const war of r.nativeWars.campaigns){if(war.endedTick!==null)continue;const members=war.participants,own=members.find(m=>m.stateId===state);if(!own)continue;
    for(const m of members)if(m.side!==own.side){const other=ids.get(m.stateId);if(!other||!r.world.nations.some(n=>n.id===other))throw Error('战争参战国家身份无效。');result.add(other);}
  }return [...result].sort();
}
export function refreshLeaderCombat47(r:WarRun,state:CombatPersonnel47){
  for(const n of r.world.nations){const leader=livingCombatLeader47(r,n.id),enemyIds=militaryEnemyIds47(r,n.id);state.nations[n.id].leader={leaderId:leader?.person.id??null,traitNames:[...(leader?.person.traits??[])],enemyIds,refreshedTick:r.clock.tick,modifier:nativeLeaderEnemies47(leader?.traits??null,enemyIds.length)};}
}
export function initializedArmyCombat47(nationId:string,tick:number,traits:readonly DamageTrait47[]):ArmyCombat47{
  return {nationAtInitialization:nationId,initializedTick:tick,command:'central',damageTraitsAtInitialization:[...traits],...nativeDamageSnapshot47(traits)};
}
export function initialCombatPersonnel47(r:WarRun):CombatPersonnel47{
  const out:CombatPersonnel47={version:1,rule:'native-personnel-web-central-v1',hullPerNativeCount:1,protrusion:'neutral-unrecovered-v1',nations:Object.fromEntries(r.world.nations.map(n=>[n.id,{damageTraits:[],leader:{leaderId:null,traitNames:[],enemyIds:[],refreshedTick:0,modifier:0}}])),armies:Object.fromEntries(r.world.armies.map(a=>[a.id,initializedArmyCombat47(a.nationId,r.clock.tick,[])]))};refreshLeaderCombat47(r,out);return out;
}
const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('/')===[...keys].sort().join('/');
const dense=(v:unknown):v is unknown[]=>Array.isArray(v)&&Object.keys(v).length===v.length&&Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).every(Boolean);
export function assertCombatPersonnel47(s:CombatPersonnel47,w:World,tick:number,known:Pick<Population47,'kin'|'people'>){if(fastChecks47())return;
  const fail=()=>{throw Error('人物战力缓存或军队伤害快照无效。');},validTick=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=tick,traits=(v:unknown):v is DamageTrait47[]=>dense(v)&&v.length<=2&&new Set(v).size===v.length&&v.every(t=>t==='FieldCombatElite'||t==='SiegeCapture');
  if(!exact(s,['version','rule','hullPerNativeCount','protrusion','nations','armies'])||s.version!==1||s.rule!=='native-personnel-web-central-v1'||s.hullPerNativeCount!==1||s.protrusion!=='neutral-unrecovered-v1'||!exact(s.nations,w.nations.map(n=>n.id))||!exact(s.armies,w.armies.map(a=>a.id)))return fail();
  for(const [id,n] of Object.entries(s.nations)){const l=n.leader,c=l?.leaderId===null?null:known.people.persons[l?.leaderId];if(!exact(n,['damageTraits','leader'])||!traits(n.damageTraits)||!exact(l,['leaderId','traitNames','enemyIds','refreshedTick','modifier'])||l.leaderId!==null&&(!Number.isSafeInteger(l.leaderId)||l.leaderId<1||!Object.hasOwn(known.kin.persons,l.leaderId)||known.kin.persons[l.leaderId].stateId!==known.people.nations[id]?.id||!c||c.id!==l.leaderId||c.stateId!==known.people.nations[id]?.id||c.nationId!==id)||!dense(l.traitNames)||l.leaderId===null&&l.traitNames.length!==0||!dense(l.enemyIds)||new Set(l.enemyIds).size!==l.enemyIds.length||l.enemyIds.some(enemy=>typeof enemy!=='string'||enemy===id||!Object.hasOwn(s.nations,enemy))||!validTick(l.refreshedTick)||l.modifier!==nativeLeaderEnemies47(combatTraits47(l.traitNames),l.enemyIds.length))return fail();}
  for(const a of Object.values(s.armies)){if(!exact(a,['nationAtInitialization','initializedTick','command','damageTraitsAtInitialization','damageToArmy','damageToProvince'])||!Object.hasOwn(s.nations,a.nationAtInitialization)||!validTick(a.initializedTick)||a.command!=='central'||!traits(a.damageTraitsAtInitialization))return fail();const expected=nativeDamageSnapshot47(a.damageTraitsAtInitialization);if(a.damageToArmy!==expected.damageToArmy||a.damageToProvince!==expected.damageToProvince)return fail();}
}
