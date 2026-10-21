import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {nativeUpdateAlliance} from './native-war/alliance';
import {diplomaticContext46} from './civilization47-declaration';
import {diplomacyRandom46,reconcileNativeDiplomacy46} from './civilization47-diplomatic-state';
import {allianceOf46,type Alliance46,type AllianceEdit46} from './war46-alliance';
import {overlord46} from './war46-vassals';
import {coversPair46} from './war46-coalition';
import {settleWar47,reconcileDiplomaticForces47} from './civilization47-war-settlement';
import {announce} from './civilization47-history';
import {nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './native-economy/iso-calendar';

/** Texts follow the original localization (AllianceName, AllianceFormedBetweenStates,
 * AllianceDisbandedByState). Alliance rules of the frozen war46 owner (war46-alliance.ts), bound to the
 * live 47 diplomatic context and war settlement. The native decision
 * (nativeUpdateAlliance), naming and ForceAlliance semantics are unchanged. */
const bump=(r:PoliticalRun47)=>{if(!Number.isSafeInteger(r.alliances.revision+1))throw Error('联盟记录超过安全范围。');r.alliances.revision++;};
const name=(r:PoliticalRun47,id:string)=>r.world.nations.find(n=>n.id===id)!.name;
const years=(r:PoliticalRun47,time:number|null)=>nativeGetYearSince(time??r.alliances.originTime,r.life.gameTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));
const notice=(r:PoliticalRun47,text:string,reason:string,ids:string[])=>announce(r.chronicle,r.world,r.clock.tick,'diplomacy',text,reason,ids,null);
const alive=(r:PoliticalRun47,id:string)=>r.world.nations.some(n=>n.id===id)&&r.world.provinces.some(p=>p.controller===id);
function create(r:PoliticalRun47,a:string,b:string){
  if(allianceOf46(r,a)||allianceOf46(r,b)||a===b)throw Error('两国联盟状态已变化。');
  const id=r.alliances.nextId++;if(!Number.isSafeInteger(r.alliances.nextId))throw Error('联盟数量超过安全范围。');
  const v:Alliance46={id,name:`${name(r,a)}-${name(r,b)}联盟`,founders:[a,b],members:[a,b],startedTime:Math.fround(r.life.gameTime),joinedTime:-100,startedTick:r.clock.tick,endedTick:null,unbreakable:false};
  r.alliances.records.push(v);bump(r);notice(r,`${name(r,a)}与${name(r,b)}结成联盟`,'双方将在今后的宣战中共同参战；联盟不转移领土。',[a,b]);return v;
}
function join(r:PoliticalRun47,v:Alliance46,id:string,record=true){
  if(v.endedTick!==null||allianceOf46(r,id))throw Error('加入联盟的状态已变化。');
  v.members.push(id);v.joinedTime=Math.fround(r.life.gameTime);bump(r);
  if(record)notice(r,`${name(r,id)}加入${v.name}`,'今后的外部战争按当前盟约决定参战；不补入既有战争。',[...v.members]);
}
function dissolve(r:PoliticalRun47,v:Alliance46,actor:string|null,force=false){
  if(v.endedTick!==null||v.unbreakable&&!force)return false;
  const members=[...v.members];v.members=[];v.endedTick=r.clock.tick;
  if(actor!==null){for(const id of members)r.alliances.lastAction[id]=Math.fround(r.life.gameTime);notice(r,`${v.name}被${name(r,actor)}解散`,`${name(r,actor)}终止联盟；既有战争与土地归属保留。`,members);}
  bump(r);return true;
}
/** Monthly AI step (native AllianceManager via the diplomatic schedule). */
export function evaluateAlliance47(r:PoliticalRun47,id:string){
  if(!r.diplomacy.worldAuto||!r.diplomacy.nations[id]||overlord46(r,id)!==null)return null;
  const c=diplomaticContext46(r),a=c.states.find(n=>n.nationId===id)!;if(a.dead)return null;
  const members=(v:Alliance46)=>v.members.map(id=>c.states.find(n=>n.nationId===id)!);
  const result=nativeUpdateAlliance(a,r.nativeDiplomacy.nations[id].pools,{...c,isAtWar:n=>c.enemies(n).length>0},{
    enabled:r.alliances.enabled,sinceAction:years(r,r.alliances.lastAction[id]),states:c.states,alliances:r.alliances.records.filter(v=>v.endedTick===null),current:allianceOf46(r,id),members,sinceJoin:v=>years(r,v.joinedTime),age:v=>years(r,v.startedTime),
    randomIndex:count=>Math.floor(diplomacyRandom46(r.nativeDiplomacy)*count),
    join:v=>{join(r,v,id);r.alliances.lastAction[id]=Math.fround(r.life.gameTime);},
    create:target=>{create(r,id,target.nationId);r.alliances.lastAction[id]=Math.fround(r.life.gameTime);},destroy:v=>{dissolve(r,v,id);},
  });if(result){bump(r);r.nativeDiplomacy.revision++;}return result;
}
export function leaveAlliance47(r:PoliticalRun47,id:string,force=false){
  const v=allianceOf46(r,id);if(!v)return false;
  const dead=!r.world.provinces.some(p=>p.controller===id);if(v.unbreakable&&!force&&!dead)return false;
  v.members=v.members.filter(n=>n!==id);v.joinedTime=Math.fround(r.life.gameTime);bump(r);
  if(!dead)notice(r,`${name(r,id)}退出${v.name}`,'退出盟约不等于退出战争，已参加的战争仍继续。',[id,...v.members]);
  if(v.members.length===1)dissolve(r,v,v.members[0],force||dead);return true;
}
/** Dead members leave; alliances under two members disband without history. */
export function reconcileAlliances47(r:PoliticalRun47){
  for(const n of r.world.nations)if(!Object.hasOwn(r.alliances.lastAction,n.id)){r.alliances.lastAction[n.id]=-100;bump(r);}
  const live=new Set(r.world.provinces.map(p=>p.controller));
  for(const v of r.alliances.records.filter(a=>a.endedTick===null)){
    const members=v.members.filter(id=>live.has(id));if(members.length!==v.members.length){v.members=members;bump(r);}
    if(v.members.length<2)dissolve(r,v,null,true);
  }
}

/** Player orders: ForceAlliance / ExitAlliance / AllowAlliance. */
export function applyAllianceOwned47(r:PoliticalRun47,edit:AllianceEdit46){
  if(!edit||typeof edit!=='object')throw Error('联盟操作无效。');
  const keys=Object.keys(edit).sort().join();
  if(edit.type==='automatic'){if(keys!=='enabled,type'||typeof edit.enabled!=='boolean'||edit.enabled===r.alliances.enabled)throw Error('联盟开关已变化。');r.alliances.enabled=edit.enabled;bump(r);
    notice(r,edit.enabled?'允许各国自主结盟':'暂停各国自主结盟','全局指令：只改变今后的自主结盟，已有联盟保留。',[]);return;}
  if(!['unite','leave'].includes(edit.type)||keys!==(edit.type==='unite'?'nationId,targetId,type':'nationId,type'))throw Error('联盟参数含未知字段。');
  if(!alive(r,edit.nationId))throw Error('该国已不存在。');
  if(edit.type==='leave'){if(!leaveAlliance47(r,edit.nationId,true))throw Error('该国当前没有联盟。');return;}
  if(!alive(r,edit.targetId)||edit.nationId===edit.targetId)throw Error('结盟对象无效。');
  const a=allianceOf46(r,edit.nationId),b=allianceOf46(r,edit.targetId);
  if(a&&a===b)throw Error('两国已在同一联盟。');
  // Native ForceAlliance ends every real campaign opposing the selected pair (reason 8).
  for(const war of [...r.nativeWars.campaigns])if(war.endedTick===null&&coversPair46(war,r.nativeWars,edit.nationId,edit.targetId))settleWar47(r,war,8);
  reconcileDiplomaticForces47(r,new Set());reconcileNativeDiplomacy46(r.nativeDiplomacy,r);
  if(!a&&!b){create(r,edit.nationId,edit.targetId);return;}
  if(!a&&b){join(r,b,edit.nationId);return;}
  if(a&&!b){join(r,a,edit.targetId);return;}
  const members=[...a!.members];dissolve(r,a!,edit.nationId,true);for(const id of members)join(r,b!,id,false);
  notice(r,`${a!.name}并入${b!.name}`,'合并盟约，保留目标联盟；取消所选两国相对参战的战争，其他战争保留。',[...b!.members]);
}

