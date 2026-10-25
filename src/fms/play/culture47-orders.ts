import {previewArmyCommand47,applyArmyCommand47,issueArmyOrderOwned47,type ArmyCommand47,type ArmyStamp47} from './army-commands47';
import {previewFleetCommand47,applyFleetCommand47,type FleetCommand47,type FleetStamp47} from './fleet-commands47';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {assertPolitics47} from './civilization47-political-owner';
export type MilitaryIntent47={force:'army';command:ArmyCommand47}|{force:'fleet';command:FleetCommand47};
export type MilitaryExpected47=ArmyStamp47|FleetStamp47;
const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
const exact=(x:unknown,keys:string[]):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
export function assertMilitaryIntent47(v:unknown):asserts v is MilitaryIntent47 {
 if(!exact(v,['force','command'])||!['army','fleet'].includes(String(v.force)))throw Error('未知军种命令。');
 const c=v.command,id=v.force==='army'?'armyId':'fleetId',halt=v.force+'-halt',move=v.force==='army'?'army-move':'fleet-sail';
 if(!c||typeof c!=='object')throw Error('军令无效。');const a=c as Record<string,unknown>;
 if(typeof a[id]!=='string'||!a[id]||![halt,move].includes(String(a.type))||!exact(a,a.type===halt?['type',id]:v.force==='army'?['type',id,'target','kind']:['type',id,'target']))throw Error('军令字段无效。');
 if(a.type===halt)return;
 if(v.force==='army'&&!['march','retreat'].includes(String(a.kind)))throw Error('行军模式无效。');
 if(!exact(a.target,['kind','id'])||!(a.target.kind==='cell'?Number.isSafeInteger(a.target.id)&&Number(a.target.id)>=0:a.target.kind===(v.force==='army'?'province':'port')&&typeof a.target.id==='string'&&a.target.id.length>0))throw Error('军令目标无效。');
}
export function assertMilitaryExpected47(v:unknown,force:MilitaryIntent47['force']):asserts v is MilitaryExpected47 {
 const keys=force==='army'?['runId','day','nextEventId','tick','positionsRevision','binding']:['runId','day','tick','nextEventId','binding','fleetRevision','armyRevision','portRevision'];
 if(!exact(v,keys)||typeof v.runId!=='string'||typeof v.binding!=='string'||keys.filter(k=>k!=='runId'&&k!=='binding').some(k=>!Number.isSafeInteger(v[k])||Number(v[k])<0))throw Error('军令预览凭据无效。');
}
export function previewMilitary47(run:PoliticalRun47,intent:MilitaryIntent47){
 assertMilitaryIntent47(intent);const r=structuredClone(run);
 return intent.force==='army'?previewArmyCommand47(r,intent.command,weights):previewFleetCommand47(r,intent.command,weights);
}
export function applyMilitary47(run:PoliticalRun47,intent:MilitaryIntent47,expected:MilitaryExpected47){
 assertMilitaryIntent47(intent);assertMilitaryExpected47(expected,intent.force);
 const next=intent.force==='army'?applyArmyCommand47(run,intent.command,expected as ArmyStamp47,weights):applyFleetCommand47(run,intent.command,expected as FleetStamp47,weights);
 if(intent.force==='army'){
  const row=next.armyAutonomy.armies[intent.command.armyId];
  Object.assign(row,{decision:'manual',targetId:null,garrisonId:null,campaignId:null,issuedTick:next.clock.tick,nextTick:next.clock.tick,reason:'玩家军令生效，自主决策保留手动控制。'});next.armyAutonomy.revision++;
 }else{
  const row=next.navalAutonomy.fleets[intent.command.fleetId];
  Object.assign(row,{decision:'manual',assignedPortId:null,issuedTick:next.clock.tick,nextTick:next.clock.tick,reason:'玩家接管舰队，解除原自主目标预订。'});next.navalAutonomy.revision++;
 }
 assertPolitics47(next);return next;
}

/** Original RTSController (即时战略模式): the player's order to the armies selected with the
 * selection box, applied when the action executes, with the positions of that moment (the
 * world keeps running while the player picks a target). 攻击模式 marches and fights on the way;
 * 防御模式 moves as a retreat (does not seek battle). Armies of another state, already gone, or
 * with no way to the target are skipped; at least one army must move. Every moved army comes
 * under manual control, exactly like a single player order. */
export type RtsOrder47={nationId:string;armyIds:string[];target:{kind:'province';id:string};mode:'attack'|'defend'};
export function assertRtsOrder47(v:unknown):asserts v is RtsOrder47{
 if(!exact(v,['nationId','armyIds','target','mode'])||typeof v.nationId!=='string'||!v.nationId||!Array.isArray(v.armyIds)||v.armyIds.length<1||v.armyIds.length>200||v.armyIds.some(id=>typeof id!=='string'||!id)||new Set(v.armyIds).size!==v.armyIds.length||!['attack','defend'].includes(String(v.mode)))throw Error('即时战略命令无效。');
 if(!exact(v.target,['kind','id'])||v.target.kind!=='province'||typeof v.target.id!=='string'||!v.target.id)throw Error('即时战略目标无效。');
}
export function applyRtsOrder47(run:PoliticalRun47,order:RtsOrder47):PoliticalRun47{
 assertRtsOrder47(order);
 if(!run.world.provinces.some(p=>p.id===order.target.id))throw Error('目标行省不存在。');
 // Like army-commands47 candidate(): the validated terrain is immutable and shared by value.
 const {terrain,...mutable}=run,next={...structuredClone(mutable),terrain} as PoliticalRun47;let moved=0;
 for(const armyId of order.armyIds){
  const a=next.world.armies.find(x=>x.id===armyId);
  if(!a||a.nationId!==order.nationId||a.troops<=0||a.status==='destroyed')continue;
  try{issueArmyOrderOwned47(next as never,{type:'army-move',armyId,target:order.target,kind:order.mode==='attack'?'march':'retreat'},weights,'player');}catch{continue;}
  const row=next.armyAutonomy.armies[armyId];
  if(row)Object.assign(row,{decision:'manual',targetId:null,garrisonId:null,campaignId:null,issuedTick:next.clock.tick,nextTick:next.clock.tick,reason:'即时战略模式：玩家直接指挥。'});
  moved++;
 }
 if(!moved)throw Error('选中的军团都无法前往该行省。');
 next.armyAutonomy.revision++;assertPolitics47(next);return next;
}
