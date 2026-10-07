import type {War36Run} from './war36-model';
import {nativeUpdateAlliance} from './native-war/alliance';
import {diplomaticContext36} from './war36-declaration';
import {diplomacyRandom36,reconcileNativeDiplomacy36} from './war36-state';
import {overlord36} from './war36-vassals';
import {coversPair36} from './war36-coalition';
import {settleWar36} from './war36-settlement';
import {announce} from './chronicle-records';
import {nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar} from './native-economy/iso-calendar';
export type Alliance36={id:number;name:string;founders:[string,string];members:string[];startedTime:number;joinedTime:number;startedTick:number;endedTick:number|null;unbreakable:boolean};
export type Alliances36={version:1;revision:number;nextId:number;enabled:boolean;originTime:number;originTick:number;records:Alliance36[];lastAction:Record<string,number|null>};
type Input=Pick<War36Run,'world'|'life'|'clock'>;
export function initialAlliances36(r:Input,copy=false):Alliances36{return {version:1,revision:0,nextId:1,enabled:true,originTime:r.life.gameTime,originTick:r.clock.tick,records:[],lastAction:Object.fromEntries(r.world.nations.map(n=>[n.id,copy?null:-100]))};}
const bump=(r:War36Run)=>{if(!Number.isSafeInteger(r.alliances.revision+1))throw Error('联盟记录超过安全范围。');r.alliances.revision++;};
export const allianceOf36=(r:Pick<War36Run,'alliances'>,id:string)=>r.alliances.records.find(a=>a.endedTick===null&&a.members.includes(id))??null;
const name=(r:War36Run,id:string)=>r.world.nations.find(n=>n.id===id)!.name;
const years=(r:War36Run,time:number|null)=>nativeGetYearSince(time??r.alliances.originTime,r.life.gameTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));
function notice(r:War36Run,text:string,reason:string,ids:string[]){announce(r.chronicle,r.world,r.clock.tick,'diplomacy',text,reason,ids,null);}
function create(r:War36Run,a:string,b:string){
 if(allianceOf36(r,a)||allianceOf36(r,b)||a===b)throw Error('两国联盟状态已变化。');
 const id=r.alliances.nextId++;if(!Number.isSafeInteger(r.alliances.nextId))throw Error('联盟数量超过安全范围。');
 // Native uses a localized two-founder template. This is the Chinese web label.
 const v:Alliance36={id,name:`${name(r,a)}—${name(r,b)}联盟`,founders:[a,b],members:[a,b],startedTime:Math.fround(r.life.gameTime),joinedTime:-100,startedTick:r.clock.tick,endedTick:null,unbreakable:false};
 r.alliances.records.push(v);bump(r);notice(r,`${name(r,a)}与${name(r,b)}成立联盟`,'双方将在今后的宣战中共同参战；联盟不转移领土。',[a,b]);return v;
}
function join(r:War36Run,v:Alliance36,id:string,record=true){
 if(v.endedTick!==null||allianceOf36(r,id))throw Error('加入联盟的状态已变化。');
 v.members.push(id);v.joinedTime=Math.fround(r.life.gameTime);bump(r);
 if(record)notice(r,`${name(r,id)}加入${v.name}`,'今后的外部战争按当前盟约决定参战；不补入既有战争。',[...v.members]);
}
function dissolve(r:War36Run,v:Alliance36,actor:string|null,force=false){
 if(v.endedTick!==null||v.unbreakable&&!force)return false;
 const members=[...v.members];v.members=[];v.endedTick=r.clock.tick;
 // Disband (invalid/dead alliance) does not write cooldowns/history.
 if(actor!==null){for(const id of members)r.alliances.lastAction[id]=Math.fround(r.life.gameTime);notice(r,`${v.name}解散`,`${name(r,actor)}终止联盟；既有战争与土地归属保留。`,members);}
 bump(r);return true;
}
export function leaveAlliance36(r:War36Run,id:string,force=false){
 const v=allianceOf36(r,id);if(!v)return false;
 const dead=!r.world.provinces.some(p=>p.controller===id);if(v.unbreakable&&!force&&!dead)return false;
 v.members=v.members.filter(n=>n!==id);v.joinedTime=Math.fround(r.life.gameTime);bump(r);
 if(!dead)notice(r,`${name(r,id)}退出${v.name}`,'退出盟约不等于退出战争，已参加的战争仍继续。',[id,...v.members]);
 if(v.members.length===1)dissolve(r,v,v.members[0],force||dead);return true;
}
export function reconcileAlliances36(r:War36Run){
 for(const n of r.world.nations)if(!Object.hasOwn(r.alliances.lastAction,n.id)){r.alliances.lastAction[n.id]=-100;bump(r);}
 const live=new Set(r.world.provinces.map(p=>p.controller));
 for(const v of r.alliances.records.filter(a=>a.endedTick===null)){
  const members=v.members.filter(id=>live.has(id));if(members.length!==v.members.length){v.members=members;bump(r);}
  if(v.members.length<2)dissolve(r,v,null,true);
 }
}
export function evaluateAlliance36(r:War36Run,id:string){
 if(!r.diplomacy.worldAuto||!r.diplomacy.nations[id]||overlord36(r,id)!==null)return null;
 const c=diplomaticContext36(r),a=c.states.find(n=>n.nationId===id)!;if(a.dead)return null;
 const members=(v:Alliance36)=>v.members.map(id=>c.states.find(n=>n.nationId===id)!);
 const result=nativeUpdateAlliance(a,r.nativeDiplomacy.nations[id].pools,{...c,isAtWar:n=>c.enemies(n).length>0},{
  enabled:r.alliances.enabled,sinceAction:years(r,r.alliances.lastAction[id]),states:c.states,alliances:r.alliances.records.filter(v=>v.endedTick===null),current:allianceOf36(r,id),members,sinceJoin:v=>years(r,v.joinedTime),age:v=>years(r,v.startedTime),
  randomIndex:count=>Math.floor(diplomacyRandom36(r.nativeDiplomacy)*count),
  join:v=>{join(r,v,id);r.alliances.lastAction[id]=Math.fround(r.life.gameTime);},
  create:target=>{create(r,id,target.nationId);r.alliances.lastAction[id]=Math.fround(r.life.gameTime);},destroy:v=>{dissolve(r,v,id);},
 });if(result){bump(r);r.nativeDiplomacy.revision++;}return result;
}
export type AllianceEdit36={type:'unite';nationId:string;targetId:string}|{type:'leave';nationId:string}|{type:'automatic';enabled:boolean};
export function applyAlliance36(r:War36Run,edit:AllianceEdit36){
 if(!edit||typeof edit!=='object')throw Error('联盟操作无效。');
 const keys=Object.keys(edit).sort().join();
 if(edit.type==='automatic'){if(keys!=='enabled,type'||typeof edit.enabled!=='boolean'||edit.enabled===r.alliances.enabled)throw Error('联盟开关已变化。');r.alliances.enabled=edit.enabled;bump(r);return;}
 if(!['unite','leave'].includes(edit.type)||keys!==(edit.type==='unite'?'nationId,targetId,type':'nationId,type'))throw Error('联盟参数含未知字段。');
 const alive=(id:string)=>r.world.nations.some(n=>n.id===id)&&r.world.provinces.some(p=>p.controller===id);
 if(!alive(edit.nationId))throw Error('该国已不存在。');
 if(edit.type==='leave'){if(!leaveAlliance36(r,edit.nationId,true))throw Error('该国当前没有联盟。');return;}
 if(!alive(edit.targetId)||edit.nationId===edit.targetId)throw Error('结盟对象无效。');
 const a=allianceOf36(r,edit.nationId),b=allianceOf36(r,edit.targetId);
 if(a&&a===b)throw Error('两国已在同一联盟。');
 // ForceAlliance 5C7B30 clears every real opposing campaign for the selected
 // pair with reason 8. Other pairs' wars survive, even after a forced merger.
 for(const war of [...r.nativeWars.campaigns])if(war.endedTick===null&&coversPair36(war,r.nativeWars,edit.nationId,edit.targetId))settleWar36(r,war,8);
 reconcileNativeDiplomacy36(r.nativeDiplomacy,r);
 if(!a&&!b){create(r,edit.nationId,edit.targetId);return;}
 if(!a&&b){join(r,b,edit.nationId);return;}
 if(a&&!b){join(r,a,edit.targetId);return;}
 const members=[...a!.members];dissolve(r,a!,edit.nationId,true);for(const id of members)join(r,b!,id,false);
 notice(r,`${a!.name}并入${b!.name}`,'合并盟约，保留目标联盟；取消所选两国相对参战的战争，其他战争保留。',[...b!.members]);
}
export function previewAlliance36(r:War36Run,edit:AllianceEdit36){
 try{const copy=structuredClone(r);applyAlliance36(copy,edit);const ended=copy.nativeWars.campaigns.filter(w=>w.endedTick!==null&&r.nativeWars.campaigns.find(old=>old.id===w.id)?.endedTick===null),v='nationId'in edit?allianceOf36(copy,edit.nationId):null;
  return {valid:true,reason:edit.type==='automatic'?(edit.enabled?'恢复各国自主结盟':'暂停各国自主结盟'):edit.type==='leave'?'退出当前联盟':v?`加入${v.name}`:'联盟关系已更新',details:[...(v?[`联盟成员：${v.members.map(id=>name(copy,id)).join('、')}`]:[]),...(ended.length?[`将取消 ${ended.length} 场战争及其参战国之间的对应敌对关系，不执行割地或赔款。`]:[]),'结盟影响未来宣战的参战名单，不补入既有战争；退盟也不会自动退战。',...(edit.type==='unite'?['这是上帝干预。两方都有联盟时，将本国联盟合并到目标联盟。']:[])]};
 }catch(e){return {valid:false,reason:e instanceof Error?e.message:'联盟操作无效',details:[]};}
}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const rootKeys=['version','revision','nextId','enabled','originTime','originTick','records','lastAction'],recordKeys=['id','name','founders','members','startedTime','joinedTime','startedTick','endedTick','unbreakable'];
export function assertAllianceSchema36(v:unknown){const s=v as Alliances36|undefined;if(obj(s)&&(Object.keys(s).some(k=>!rootKeys.includes(k))||s.version!=null&&s.version!==1)||Array.isArray(s?.records)&&s.records.some(a=>obj(a)&&Object.keys(a).some(k=>!recordKeys.includes(k))))throw Error('联盟存档含未来字段，已锁定读写。');}
export function assertAlliances36(s:Alliances36,r:Input){
 assertAllianceSchema36(s);const fail=()=>{throw Error('联盟存档损坏，保留原档。');},int=(n:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
 const time=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&Math.fround(n)===n&&(n===-100||n>=0)&&n<=r.life.gameTime;
 if(!obj(s)||Object.keys(s).length!==rootKeys.length||s.version!==1||!int(s.revision)||!int(s.nextId,1)||typeof s.enabled!=='boolean'||!time(s.originTime)||s.originTime<0||!int(s.originTick,0,r.clock.tick)||!Array.isArray(s.records)||!obj(s.lastAction))return fail();
 const ids=new Set(r.world.nations.map(n=>n.id)),live=new Set(r.world.provinces.map(p=>p.controller)),taken=new Set<string>();
 if(Object.keys(s.lastAction).length!==ids.size||Object.entries(s.lastAction).some(([id,t])=>!ids.has(id)||t!==null&&!time(t))||s.nextId!==s.records.length+1)return fail();
 for(const [i,a]of s.records.entries()){
  if(!obj(a)||Object.keys(a).length!==recordKeys.length||a.id!==i+1||typeof a.name!=='string'||!a.name.length||a.name.length>200||typeof a.unbreakable!=='boolean'||!Array.isArray(a.founders)||a.founders.length!==2||new Set(a.founders).size!==2||a.founders.some(id=>!ids.has(id))||!Array.isArray(a.members)||new Set(a.members).size!==a.members.length||a.members.some(id=>!ids.has(id))||!time(a.startedTime)||a.startedTime<s.originTime||!time(a.joinedTime)||a.joinedTime!==-100&&a.joinedTime<a.startedTime||!int(a.startedTick,s.originTick,r.clock.tick))return fail();
  if(a.endedTick===null){if(a.members.length<2||a.members.some(id=>!live.has(id)||taken.has(id)))return fail();for(const id of a.members)taken.add(id);}
  else if(!int(a.endedTick,a.startedTick,r.clock.tick)||a.members.length)return fail();
 }
}
