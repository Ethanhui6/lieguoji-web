import {makeVassal31,overlord31} from './war31-vassals';
import {nativeBuildSettlementPlan} from './native-war/settlement-plan';
import {nativeExecuteSettlement} from './native-war/settlement-execute';
import {nativeBuildEffect,nativeEffectResult,nativeReparationAmount} from './native-war/settlement-effects';
import {nativeDecidePeaceReason,nativeHasAutonomousDiplomacyParticipant,type NativePeaceReason} from './native-war/peace';
import type {NativeSettlementPlan} from './native-war/settlement-classification';
import {nativeWar28,reconcileParticipants28,type War28Campaign} from './war28-state';
import {war28Queries} from './war28-query';
import {war28Policy} from './war28-policy';
import {createFiscalFood} from './war28-food';
import {reconcileCore} from './upper14-state';
import {reconcileCombat} from './chronicle-battle';
import {reconcileOccupation} from './occupation';
import {reconcileMaritime} from './maritime';
import {maritimeView} from './tactics-model';
import {tacticsView} from './campaign-model';
import {campaignView,type War31Run} from './war31-model';
import {graphFor} from './naval-rules';
import {reconcileWar26} from './war26-state';
import {war26Strength} from './war26-strength';
import {reconcileLosses} from './war27-losses';

export type War28Settlement={reason:NativePeaceReason;tick:number;winnerSide:0|1|2|null;outcomes:[number,0|1|2][];enforcedGoals:number[];transfers:NativeSettlementPlan['appliedTransfers'];effects:NativeSettlementPlan['effectResults'];confirmedOwnership:[number,number][]};
export const WAR28_PEACE_LABELS:Record<NativePeaceReason,string>={0:'战争目标达成',1:'战局已定',2:'国家无法继续战争',3:'战争结束',4:'战争疲惫',5:'名义和平',6:'战争取消',7:'战争取消',8:'战争取消',9:'投降',10:'战争取消',11:'上帝干预停战'};
const revision=(r:War31Run)=>{if(!Number.isSafeInteger(r.nativeWars.revision+1))throw Error('战争记录超过安全范围。');r.nativeWars.revision++;};
/** Writes only to the session's discardable candidate. Native uses one owner;
 * v28 preserves web occupation while fighting, then confirms ONLY land that
 * belonged to these participants at declaration. Third-party wars stay intact.
 * Manual ceasefire skips settlement and ownership confirmation, as reason 11. */
export function settleWar31(r:War31Run,c:War28Campaign,reason:NativePeaceReason,settling=new Set<number>()){
 if(c.endedTick!==null||c.settlement!==null||settling.has(c.id))return false;
 settling.add(c.id);
 if(c.history!=='complete')throw Error('旧战争缺少开战资料，不能自动分配和约。');
 const w=nativeWar28(c),q=war28Queries(r,r.nativeWars,war28Policy(r));
 const key=(id:number)=>{const k=r.nativeWars.nationIds.find(p=>p[0]===id)?.[1];if(!k)throw Error('和约国家身份缺失。');return k;};
 const plan=nativeBuildSettlementPlan(w,reason,{...q,buildEffect:nativeBuildEffect,buildInternalPlan:()=>{throw Error('内战和约尚未接入。');}});
 const food=createFiscalFood(r.finance),confirmedOwnership:[number,number][]=[];
 const stripOffice=(pid:number)=>{const officeId=r.world.provinces.findIndex(p=>p.id===r.nativeWars.provinceIds[pid-1])+1;if(!officeId)throw Error('总督地区引用缺失。');for(const n of Object.values(r.people.nations)){const old=n.offices.assignments;if(!old)continue;n.offices.assignments=old.filter(a=>!a||a.officeId!=='Governor'||a.scopeId!==officeId);if(old.length!==n.offices.assignments.length){n.offices.revision++;r.people.revision++;}}};
 const syncParticipants=()=>{reconcileParticipants28(r.nativeWars,r);w.participants=structuredClone(c.participants);w.destroyedParticipants=structuredClone(c.destroyedParticipants);};
 const color=(id:number)=>{const hex=r.world.nations.find(n=>n.id===key(id))!.color.slice(1);return {r:parseInt(hex.slice(0,2),16)/255,g:parseInt(hex.slice(2,4),16)/255,b:parseInt(hex.slice(4,6),16)/255,a:1};};
 const idFor=(state:ReturnType<typeof q.state>)=>{const id=r.nativeWars.nationIds.find(([id])=>q.state(id)===state)?.[0];if(id===undefined)throw Error('和约执行国家缺失。');return id;};
 nativeExecuteSettlement(w,plan,{...q,capitalFallSuppression:{depth:0},stateId:idFor,stateColor:s=>color(idFor(s)),
  conquerProvince:(province,target)=>{const p=r.world.provinces.find(p=>p.id===r.nativeWars.provinceIds[province.id-1]);if(!p)throw Error('和约地区缺失。');const owner=key(idFor(target));if(p.controller!==owner)food.transferEconomy(r.world,p.id,p.controller,owner);p.controller=owner;if(c.nations.includes(p.legalOwner))p.legalOwner=owner;stripOffice(province.id);reconcileCore(r.world,r.upperCombat);syncParticipants();},
  // Existing political rendering animates actual territory data; no fake
  // conquest frames or result state are fabricated here.
  makeConquestAnimation:(_p,_from,_to,transfer)=>transfer,playConquestAnimations:()=>{},warnTransfer:()=>{},warnEffect:()=>{},
  applyEffect:e=>{if(e.type===4){const a=q.state(e.beneficiary),b=q.state(e.target);if(!a||!b||a.dead||b.dead)return nativeEffectResult(e,2,'宗主或目标不存在/已灭亡');if(!b.provinces?.some(p=>p?.isLand))return nativeEffectResult(e,2,'目标已无陆地行省');const target=key(e.target),lord=key(e.beneficiary);if(overlord31(r,target)===lord)return nativeEffectResult(e,1,'目标已是该受益方的附庸');
   // Existing v30 history with missing initiator cannot safely be settled.
   if(r.nativeWars.campaigns.some(w=>w.endedTick===null&&w.nations.includes(target)&&w.history!=='complete'))return nativeEffectResult(e,2,'目标仍有旧战争缺失开战资料，请先明确停战。');
   const made=makeVassal31(r,target,lord,id=>{for(const other of [...r.nativeWars.campaigns])if(other.endedTick===null&&other.nations.includes(id)&&!settling.has(other.id))settleWar31(r,other,2,settling);});return nativeEffectResult(e,made.success?0:2,made.reason);
  }if(e.type!==6)return nativeEffectResult(e,2,'该和约效果尚未接入完整世界状态。');const a=q.state(e.beneficiary),b=q.state(e.target);if(!a||!b||b.dead)return nativeEffectResult(e,2,'赔款受益方或承担方不存在/已灭亡');const amount=nativeReparationAmount(b.gold,b.goldPerMonth);b.gold=(b.gold-amount)|0;a.gold=(a.gold+amount)|0;return nativeEffectResult(e,0,null);},
  classifyInternal:()=>{throw Error('内战和约尚未接入。');},trySuppressionDestiny:()=>{throw Error('内战国运尚未接入。');},
  wasSettlementOutcomeRecorded:()=>c.settlement!==null,recordOutcome:()=>{},logOutcomeComparison:()=>{},
 });
 const subjugated=new Set(plan?.effectResults.filter(e=>e.type===4&&e.status<=1).map(e=>e.target)??[]);
 for(const [pid,original]of c.initialOwners){if(!subjugated.has(original))continue;const p=r.world.provinces.find(p=>p.id===r.nativeWars.provinceIds[pid-1])!;if(!c.nations.includes(p.controller))continue;const owner=key(original);if(p.controller!==owner)food.transferEconomy(r.world,p.id,p.controller,owner);p.controller=owner;p.legalOwner=owner;stripOffice(pid);}
 if(subjugated.size){reconcileCore(r.world,r.upperCombat);syncParticipants();}
 if(plan){for(const [pid,original]of c.initialOwners){const p=r.world.provinces.find(p=>p.id===r.nativeWars.provinceIds[pid-1])!,owner=q.currentOwner(pid);if(owner!==original&&c.nations.includes(p.controller)&&c.nations.includes(p.legalOwner)){if(p.legalOwner!==p.controller){p.legalOwner=p.controller;stripOffice(pid);}confirmedOwnership.push([pid,owner]);}}}
 const names=c.nations.map(id=>r.world.nations.find(n=>n.id===id)!.name),label=WAR28_PEACE_LABELS[reason];
 r.world=food.applyManagementAction(r.world,{type:'make-peace',nationId:c.attacker!,targetNationId:c.defender!},{day:r.world.day,nextEventId:r.world.nextEventId},(world,kind,text)=>{world.events.push({id:world.nextEventId++,day:world.day,kind,text,reason:`${label}。${plan?`和约已执行：${plan.appliedTransfers.length}项转地、${plan.effectResults.filter(e=>e.status===0).length}项效果。`:'不执行割地与赔款。'}`});world.events=world.events.slice(-160);});
 const last=r.world.events.at(-1)!;last.text=`${names.join('与')}停战：${label}`;
 for(const id of c.nations){const n=r.world.statecraft!.nations.find(n=>n.nationId===id)!;n.lastDecision={day:r.world.day,action:'停战',reason:last.reason};}
 Object.assign(r,reconcileCombat(r.world,r.battles,r.clock.tick));Object.assign(r,reconcileOccupation(r.world,r.occupation));r.maritime=reconcileMaritime(maritimeView(tacticsView(campaignView(r)))).maritime;
 c.settlement={reason,tick:r.clock.tick,winnerSide:plan?.winnerSide??null,outcomes:[...(plan?.outcomes??[])],enforcedGoals:[...(plan?.enforcedGoals??[])],transfers:structuredClone(plan?.appliedTransfers??[]),effects:structuredClone(plan?.effectResults??[]),confirmedOwnership};
 c.endedTick=r.clock.tick;revision(r);
 reconcileWar26(r.world,r.warfare,graphFor(maritimeView(tacticsView(campaignView(r)))),r.clock.tick,(world,id)=>war26Strength(world,r,id));
 reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);settling.delete(c.id);return true;
}
/** Web scheduling runs once per actual day after combat; elapsed thresholds
 * are still native full calendar months. Manager deadline and internal wars
 * remain separate until their production world settings are represented. */
export function advanceWar31PeaceLegacy(r:War31Run){
 for(const c of [...r.nativeWars.campaigns]){if(c.endedTick!==null||c.history!=='complete')continue;const w=nativeWar28(c),q=war28Queries(r,r.nativeWars,war28Policy(r));
  const destroyed=q.isDeadOrZero(w.primaryAttackerId)||q.isDeadOrZero(w.primaryDefenderId);
  if(!destroyed&&!nativeHasAutonomousDiplomacyParticipant(w,q))continue;
  const reason=destroyed?2:nativeDecidePeaceReason(w,q);if(reason!==null)settleWar31(r,c,reason);
 }
}
