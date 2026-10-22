import {advanceRebellion47,stateRebellionMonth47} from './civilization47-rebellion';
import {advanceNobility47} from './civilization47-nobility-monthly';
import type {NobilityRun47} from './civilization47-nobility';
import {initialVassalManager47,advanceVassalManager47} from './civilization47-vassal-manager';
import {reconcileVassals47} from './civilization47-vassal';
import {evaluateAlliance47,reconcileAlliances47} from './civilization47-alliance';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {initialDiplomacy,assertDiplomacy} from './war29-diplomacy';
import {initialNativeDiplomacy46,advanceDiplomaticSchedule46,reconcileNativeDiplomacy46,assertNativeDiplomacy46} from './civilization47-diplomatic-state';
import {evaluateDeclaration47,declareWar47,previewDeclaration47,diplomaticContext46} from './civilization47-declaration';
import {claimEntry47} from './civilization47-diplomatic-world';
import {relocateLostCapitals47} from './civilization47-capitals';
import {advancePeace47,settleWar47,reconcileDiplomaticForces47} from './civilization47-war-settlement';
import {coversPair46} from './war46-coalition';
import {assertWars47} from './war47-validation';
import {assertPopulation47} from './civilization47-population-validation';
import {refreshLeaderCombat47} from './civilization47-combat-state';
import {announce,recordHistory} from './civilization47-history';
import {closeLeaderRole47} from './civilization47-roles';
import {appointKnownPersonOwned47} from './civilization47-succession';
import {resolveKnownSuccessionOwned47} from './civilization47-lifecycle';
import type {FoundingForces47} from './civilization47-forces';
import type {PreviousOwnership47} from './force-tick47';
import {assertArmyAutonomy47} from './civilization47-army-ai-state';
import {assertNavalAutonomy47} from './civilization47-naval-ai-state';
import {advanceHouseGovernance47} from './civilization47-house-governance';
export type PoliticalCommand47={type:'declare-war'|'make-peace';nationId:string;targetNationId:string};
export const politicalStamp47=(r:PoliticalRun47)=>({runId:r.id,day:r.world.day,tick:r.clock.tick,nextEventId:r.world.nextEventId,diplomacy:r.nativeDiplomacy.revision,wars:r.nativeWars.revision,civilization:r.civilization.revision});
export type PoliticalStamp47=ReturnType<typeof politicalStamp47>;
export function attachPolitics47(r:FoundingForces47):PoliticalRun47 {
  return {...r,diplomacy:initialDiplomacy(r.world),nativeDiplomacy:initialNativeDiplomacy46(r,'new-world'),vassalManager:initialVassalManager47(r.world.day)};
}
/** New-world preset only. Existing wars with unknown history stay unknown.
 * Stable relation order explicitly selects the initiator; this is not inferred
 * history. Every created conflict goes through the live declaration contract. */
export function initializeOpeningWars47(r:PoliticalRun47):void {
  const relations=r.world.statecraft!.relations;
  if(r.clock.tick!==0||r.world.day!==0||r.nativeWars.campaigns.length||r.nativeDiplomacy.declarations.length||relations.some(p=>p.status!=='peace')||r.alliances.records.length||r.vassals.records.length)throw Error('战乱开局只能初始化尚未推进的新世界。');
  const c=diplomaticContext46(r),states=new Map(c.states.map(s=>[s.nationId,s]));
  const pairs=relations.filter(({a,b})=>c.usable(1,states.get(a)!,states.get(b)!)&&claimEntry47(r,a,b)).map(({a,b})=>({a,b}));
  for(const {a,b}of pairs)declareWar47(r,a,b);
  reconcileDiplomaticForces47(r,new Set());reconcileNativeDiplomacy46(r.nativeDiplomacy,r);assertPolitics47(r);
}
/** WEB real-identity lifecycle: extinction ends office, not the person's life.
 * Regaining land uses the eligible previous ruler or a known candidate, never
 * resurrects or regenerates a person. Full native restoration selection remains
 * separate from this deliberately stated continuation policy. */
export function reconcileGovernmentContinuity47(r:FoundingForces47){
  let changed=false;
  for(const n of r.world.nations){const land=r.world.provinces.filter(p=>p.controller===n.id),ended=Object.hasOwn(r.chronicle.ended,n.id),history=r.chronicle.leaders[n.id],last=history.at(-1)!;
    if(!land.length&&!ended){closeLeaderRole47(r,n.id,'extinction');r.chronicle.ended[n.id]=r.world.day;if(last.endedDay===null)last.endedDay=r.world.day;r.people.nations[n.id].leaderId=null;r.people.revision++;delete r.kin.lifecycle.vacancies[n.id];r.kin.revision++;changed=true;
      announce(r.chronicle,r.world,r.clock.tick,'extinction',`${n.name}失去全部领土，国家覆亡`,'实控领土归零，结束当前任期；人物、家族、城市与历史保留。',[n.id],null,[last]);
    }else if(land.length&&ended){
      const previous=r.kin.persons[r.sovereignty.reigns[last.id]],polity=r.civilization.nations[n.id].polity;
      delete r.chronicle.ended[n.id];
      if(previous.isAlive&&(!['Republic','Federation'].includes(polity)||previous.age>=25)&&(polity!=='Tribal'||previous.age>=12))appointKnownPersonOwned47(r,n.id,previous,'restoration',last.regnalName);
      else resolveKnownSuccessionOwned47(r,n.id,previous,'restoration');
      r.sovereignty.restorations[n.id]++;r.sovereignty.revision++;changed=true;
      const reign=history.at(-1)!,active=reign.endedDay===null;
      announce(r.chronicle,r.world,r.clock.tick,'restoration',`${n.name}重获领土${active?`，${reign.name}${r.sovereignty.reigns[reign.id]===previous.id?'复位':'接任'}`:'，领袖暂缺'}`,'保留已知身份，符合本政体年龄资格的在世前任复位；否则按政体选已知候选，没有合法候选则保持空位。',[n.id],land[0].id,active?[reign]:[]);
    }
  }if(changed)refreshLeaderCombat47(r,r.combatPersonnel);
  relocateLostCapitals47(r);
}
/** Called at each actual occupation transaction, before any family validation.
 * IDs come from the transfer itself, never substring matching visible names. */
export function recordPoliticalOccupation47(r:FoundingForces47,before:PreviousOwnership47){
  let changed=false;
  for(const p of r.world.provinces){const old=before.provinces.find(v=>v.id===p.id);if(!old||old.controller===p.controller)continue;changed=true;
    const names=[old.controller,p.controller].map(id=>r.world.nations.find(n=>n.id===id)!.name);
    recordHistory(r.chronicle,r.world,r.clock.tick,'occupation',`${names[1]}取得${p.name}`,`实际控制从${names[0]}转移至${names[1]}；城市、地形与法理归属分别保留。`,[old.controller,p.controller],p.id);
  }if(changed)reconcileGovernmentContinuity47(r);
}
export function assertPolitics47(r:PoliticalRun47){assertPopulation47(r);assertDiplomacy(r.diplomacy,r.world);assertWars47(r.nativeWars,r);assertNativeDiplomacy46(r.nativeDiplomacy,r);assertArmyAutonomy47(r);assertNavalAutonomy47(r);}
/** validate=false is only for steps inside one private session batch; that
 * batch validates its final step before the candidate can be accepted. */
export function advancePolitics47(r:PoliticalRun47,dayChanged:boolean,validate=true){
  reconcileGovernmentContinuity47(r);reconcileAlliances47(r);reconcileVassals47(r);advancePeace47(r,dayChanged);reconcileGovernmentContinuity47(r);
  if(dayChanged){advanceHouseGovernance47(r);advanceDiplomaticSchedule46(r.nativeDiplomacy,r,id=>{evaluateAlliance47(r,id);evaluateDeclaration47(r,id);stateRebellionMonth47(r,id);});advanceVassalManager47(r);advanceRebellion47(r);advanceNobility47(r as unknown as NobilityRun47);}
  reconcileNativeDiplomacy46(r.nativeDiplomacy,r);if(validate)assertPolitics47(r);
}
export function finishPoliticalTick47(r:PoliticalRun47){advancePeace47(r,false);reconcileGovernmentContinuity47(r);}
export function assertPoliticalCommand47(a:unknown):asserts a is PoliticalCommand47 {
  const v=a as PoliticalCommand47;if(!v||typeof v!=='object'||Object.keys(v).sort().join('/')!=='nationId/targetNationId/type'||!['declare-war','make-peace'].includes(v.type)||typeof v.nationId!=='string'||typeof v.targetNationId!=='string'||v.nationId===v.targetNationId)throw Error('外交命令无效。');
}
function applyOwned(r:PoliticalRun47,a:PoliticalCommand47){
  assertPoliticalCommand47(a);
  if(a.type==='declare-war'){declareWar47(r,a.nationId,a.targetNationId);reconcileDiplomaticForces47(r,new Set());}
  else {const c=r.nativeWars.campaigns.find(c=>c.endedTick===null&&coversPair46(c,r.nativeWars,a.nationId,a.targetNationId));if(!c)throw Error('两国当前没有可结束的战争。');settleWar47(r,c,11);}
  reconcileGovernmentContinuity47(r);reconcileNativeDiplomacy46(r.nativeDiplomacy,r);assertPolitics47(r);
}
export function previewPoliticalCommand47(r:PoliticalRun47,action:PoliticalCommand47){
  const expected=politicalStamp47(r);try{assertPoliticalCommand47(action);const copy=structuredClone(r);applyOwned(copy,action);
    const details=action.type==='declare-war'?previewDeclaration47(r,action.nationId,action.targetNationId).changes:['结束选中的这场战争；其他战争继续。','保持当前土地实控与法理归属，不强制割地或赔款。','取消双方交锋、占领和港口争夺，部队保留真实位置。'];
    return{valid:true,reason:copy.chronicle.entries.at(-1)!.text,details,expected,action:structuredClone(action)};
  }catch(e){return{valid:false,reason:e instanceof Error?e.message:'外交预览失败。',details:[] as string[],expected,action:structuredClone(action)};}
}
export function applyPoliticalCommand47(r:PoliticalRun47,a:PoliticalCommand47,expected:PoliticalStamp47){
  const stamp=politicalStamp47(r),keys=Object.keys(stamp) as (keyof PoliticalStamp47)[];
  if(!expected||Object.keys(expected).length!==keys.length||keys.some(k=>expected[k]!==stamp[k]))throw Error('外交预览已过期，请重新预览；原世界未改动。');
  const next=structuredClone(r);applyOwned(next,a);return next;
}
