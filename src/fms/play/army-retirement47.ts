import {fastChecks47} from './checks47';
import type {FoundingForces47} from './civilization47-forces';
import {populationStamp47,type PopulationStamp47} from './civilization47-population-types';
import {sameCulture47Value} from './culture47-equal';
import {cloneMilitaryCandidate47} from './geography-content47';
import {forceKey47} from './force-motion47';

export const ARMY_RETIREMENT_RULE47='retired-roster-web-v1';
type RetiredArmy47={army:FoundingForces47['world']['armies'][number];unit:FoundingForces47['units'][string];formation:FoundingForces47['tactics']['forces'][string];travel:FoundingForces47['armyPositions']['records'][string];speed:FoundingForces47['forceSpeed']['armies'][string];personnel:FoundingForces47['combatPersonnel']['armies'][string];combat:FoundingForces47['upperCombat']['armies'][string];combatLosses:number;damageCarry:number;completedReorganizations:number;archivedTick:number;archivedDay:number};
export type ArmyRetirement47={version:1;rule:typeof ARMY_RETIREMENT_RULE47;enabledTick:number;records:Record<string,RetiredArmy47>};
const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const integer=(v:number,min=0)=>Number.isSafeInteger(v)&&v>=min;
export function assertArmyRetirement47(r:FoundingForces47){if(fastChecks47())return;
 const s=r.armyRetirement;if(s===undefined)return;
 const fail=()=>{throw Error('退役军队档案不一致，原世界保持。');};
 if(!exact(s,['version','rule','enabledTick','records'])||s.version!==1||s.rule!==ARMY_RETIREMENT_RULE47||!integer(s.enabledTick)||s.enabledTick>r.clock.tick||!s.records||typeof s.records!=='object'||Array.isArray(s.records))return fail();
 const live=new Set([...r.world.armies,...r.transports.cargo.map(c=>c.army)].map(a=>a.id)),nations=new Set(r.world.nations.map(n=>n.id));
 for(const [id,v] of Object.entries(s.records)){
  if(!exact(v,['army','unit','formation','travel','speed','personnel','combat','combatLosses','damageCarry','completedReorganizations','archivedTick','archivedDay'])||!v.army||id!==v.army.id||live.has(id)||!nations.has(v.army.nationId)||v.army.status!=='destroyed'||v.army.troops!==0||!v.formation||!v.unit||!v.speed||!v.personnel||!v.combat||v.travel?.armyId!==id||!integer(v.archivedTick,s.enabledTick)||v.archivedTick>r.clock.tick||!integer(v.archivedDay)||v.archivedDay!==Math.floor(v.archivedTick/120)||!integer(v.combatLosses)||!integer(v.completedReorganizations)||!Number.isFinite(v.damageCarry)||v.damageCarry<0||v.damageCarry>=1)return fail();
 }
}
/** Enabling only writes the explicit rule switch. Old prefixes remain byte-
 * equivalent; the first completed daily settlement performs the collection. */
export function enableArmyRetirement47<T extends FoundingForces47>(input:T,expected:PopulationStamp47):T {
 assertArmyRetirement47(input);
 if(input.armyRetirement||!sameCulture47Value(expected,populationStamp47(input)))throw Error('退役补军规则已启用或世界已变化，请重新操作。');
 const r=cloneMilitaryCandidate47(input);r.armyRetirement={version:1,rule:ARMY_RETIREMENT_RULE47,enabledTick:r.clock.tick,records:{}};return r;
}
/** Owned daily candidate only, after volley/loss/voyage settlement. Never call
 * within a volley: both sides must fire and national losses must be accounted. */
export function retireArmiesOwned47(r:FoundingForces47):void {
 const s=r.armyRetirement;if(!s)return;assertArmyRetirement47(r);
 const retired=r.world.armies.filter(a=>a.status==='destroyed'&&a.troops===0);if(!retired.length)return;
 const ids=new Set(retired.map(a=>a.id)),manual=r.voyages.manualArmies.filter(id=>!ids.has(id)),manualChanged=manual.length!==r.voyages.manualArmies.length;
 if(manualChanged&&(!Number.isSafeInteger(r.voyages.revision)||r.voyages.revision>=Number.MAX_SAFE_INTEGER))throw Error('远征记录版本溢出，原世界保持。');
 if(r.battles.engagements.length||r.maritime.contacts.length||r.transports.cargo.length||r.armyPositions.revision>=Number.MAX_SAFE_INTEGER||r.armyAutonomy.revision>=Number.MAX_SAFE_INTEGER)throw Error('退役清算尚未完成或版本溢出，原世界保持。');
 for(const army of retired){
  const id=army.id,key=forceKey47({kind:'army',id});
  if(r.reorganization.active[id]||r.voyages.missions[army.nationId]?.armyId===id)throw Error('退役军队仍有待完成任务，原世界保持。');
  s.records[id]=structuredClone({army,unit:r.units[id],formation:r.tactics.forces[id],travel:r.armyPositions.records[id],speed:r.forceSpeed.armies[id],personnel:r.combatPersonnel.armies[id],combat:r.upperCombat.armies[id],combatLosses:r.forceDamage.losses[key]??0,damageCarry:r.forceDamage.carry[key]??0,completedReorganizations:r.reorganization.completed[id]??0,archivedTick:r.clock.tick,archivedDay:r.world.day});
  for(const table of [r.units,r.tactics.forces,r.tactics.rounds,r.armyPositions.records,r.forceSpeed.armies,r.combatPersonnel.armies,r.upperCombat.armies,r.armyAutonomy.armies,r.reorganization.completed,r.battles.plans])delete table[id];
  delete r.forceDamage.losses[key];delete r.forceDamage.carry[key];delete r.forceClock.deadlines[key];
 }
 const keys=new Set(retired.map(a=>forceKey47({kind:'army',id:a.id})));
 r.world.armies=r.world.armies.filter(a=>!ids.has(a.id));r.voyages.manualArmies=manual;if(manualChanged)r.voyages.revision++;r.forceContacts.pairs=r.forceContacts.pairs.filter(p=>!keys.has(p.a)&&!keys.has(p.b));
 r.armyPositions.revision++;r.armyAutonomy.revision++;assertArmyRetirement47(r);
}
