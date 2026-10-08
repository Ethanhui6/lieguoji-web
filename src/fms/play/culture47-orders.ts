import {previewArmyCommand47,applyArmyCommand47,type ArmyCommand47,type ArmyStamp47} from './army-commands47';
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
  Object.assign(row,{decision:'manual',targetId:null,campaignId:null,issuedTick:next.clock.tick,nextTick:next.clock.tick,reason:'玩家军令生效，自主决策保留手动控制。'});next.armyAutonomy.revision++;
 }else{
  const row=next.navalAutonomy.fleets[intent.command.fleetId];
  Object.assign(row,{decision:'manual',assignedPortId:null,issuedTick:next.clock.tick,nextTick:next.clock.tick,reason:'玩家接管舰队，解除原自主目标预订。'});next.navalAutonomy.revision++;
 }
 assertPolitics47(next);return next;
}
