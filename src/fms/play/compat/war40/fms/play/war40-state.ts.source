import {diplomaticEndPairs40} from './war40-coalition';
import type {War29Run} from './war29-model';
import type {NativeDeclaredGoal} from './native-war/casus-goals';
import {nativeAccumulateDiplomaticPower,nativeInitializeWarPowers,type NativeDiplomaticPower} from './native-war/diplomatic-power';
import {nativeGenerateExpansionism} from './native-war/state-initialization';
import {NATIVE_INITIAL_WAR_TIME,nativeTruceYears} from './native-war/diplomatic-relations';
import {nativeGetMonthSince,nativeGetYearSince} from './native-economy/character-calendar';
import {createNativeIsoCalendar,isoPlusDays} from './native-economy/iso-calendar';

type Input=Pick<War29Run,'world'|'clock'|'life'|'culture'|'people'|'nativeWars'>;
export type DiplomaticNation40={origin:'new-world'|'explicit-copy'|'secession';parentId:string|null;initializedTick:number;expansionism:number;activeTime:number|null;passiveTime:number|null;pools:NativeDiplomaticPower;updateDay:number;updatedMonth:number};
export type DiplomaticRelation40={a:string;b:string;history:'complete'|'unknown';lastWar:number|null;warCount:number|null;endedWarIds:number[]};
export type Declaration40={warId:number;casusBelliId:number;attackerId:number;defenderId:number;goals:NativeDeclaredGoal[]};
export type NativeDiplomacy40={version:1;revision:number;originTick:number;originTime:number;rng:number;draws:number;month:number;lastDay:number;nations:Record<string,DiplomaticNation40>;relations:DiplomaticRelation40[];declarations:Declaration40[]};
export const diplomacyMonth40=(r:Input)=>r.life.currentDate.year*12+r.life.currentDate.month-1;
function seed(value:string){let h=2166136261;for(const c of value)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
/** Persisted browser PRNG, deliberately not claimed to be Unity.Random. */
export function diplomacyRandom40(s:NativeDiplomacy40){
 if(!Number.isSafeInteger(s.draws+1))throw Error('外交随机序列超过安全范围。');
 s.rng=(s.rng+0x6d2b79f5)>>>0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);s.draws++;return ((t^(t>>>14))>>>0)/4294967296;
}
const daysInMonth=(r:Input)=>{const d=r.life.currentDate;let n=28;while(isoPlusDays({year:d.year,month:d.month,day:1},n).month===d.month)n++;return n;};
const drawDay=(s:NativeDiplomacy40,r:Input)=>1+Math.floor(diplomacyRandom40(s)*daysInMonth(r));
const revise=(s:NativeDiplomacy40)=>{if(!Number.isSafeInteger(s.revision+1))throw Error('外交历史超过安全范围。');s.revision++;};
function addNation(s:NativeDiplomacy40,r:Input,id:string,origin:DiplomaticNation40['origin'],parentId:string|null){
 const pools:NativeDiplomaticPower={power:100,startWar:100,endWar:100,efficiency:0};nativeAccumulateDiplomaticPower(pools,20);
 const expansionism=parentId?s.nations[parentId]?.expansionism:nativeGenerateExpansionism(()=>Math.fround(diplomacyRandom40(s)));
 if(expansionism===undefined)throw Error('新国家缺少外交来源。');
 nativeInitializeWarPowers(pools,100,100,(min,max)=>Math.fround(min+Math.fround(Math.fround(diplomacyRandom40(s))*Math.fround(max-min))));
 s.nations[id]={origin,parentId,initializedTick:r.clock.tick,expansionism,activeTime:origin==='explicit-copy'?null:NATIVE_INITIAL_WAR_TIME,passiveTime:origin==='explicit-copy'?null:NATIVE_INITIAL_WAR_TIME,pools,updateDay:drawDay(s,r),updatedMonth:diplomacyMonth40(r)};
}
export function initialNativeDiplomacy40(r:Input,origin:'new-world'|'explicit-copy'):NativeDiplomacy40{
 const s:NativeDiplomacy40={version:1,revision:0,originTick:r.clock.tick,originTime:r.life.gameTime,rng:seed(`${r.world.custom!.seed}/diplomacy30/${r.clock.tick}`),draws:0,month:diplomacyMonth40(r),lastDay:r.world.day,nations:{},relations:[],declarations:[]};
 for(const n of r.world.nations)addNation(s,r,n.id,origin,null);
 // A chosen war-start preset has no recorded initiator. Conservatively start
 // both cooldowns now, without inventing an attacker or declaration reason.
 if(origin==='new-world')for(const p of r.world.statecraft!.relations)if(p.status==='war')for(const id of [p.a,p.b]){s.nations[id].activeTime=r.life.gameTime;s.nations[id].passiveTime=r.life.gameTime;}
 // Existing campaigns are not reconstructed. Only future ends are observed.
 for(const w of r.nativeWars.campaigns)if(w.endedTick!==null)for(const [a,b]of diplomaticEndPairs40(r.nativeWars,w)){const p=relation40(s,a,b);if(!p.endedWarIds.includes(w.id))p.endedWarIds.push(w.id);}
 return s;
}
export function relation40(s:NativeDiplomacy40,a:string,b:string):DiplomaticRelation40{
 if(a===b||!s.nations[a]||!s.nations[b])throw Error('外交双方无效。');
 const old=s.relations.find(p=>p.a===a&&p.b===b||p.a===b&&p.b===a);if(old)return old;
 const unknown=s.nations[a].origin==='explicit-copy'&&s.nations[b].origin==='explicit-copy';
 const p:DiplomaticRelation40={a:a<b?a:b,b:a<b?b:a,history:unknown?'unknown':'complete',lastWar:unknown?null:-200,warCount:unknown?null:0,endedWarIds:[]};s.relations.push(p);revise(s);return p;
}
export const elapsedDiplomacyMonths40=(r:Input,s:NativeDiplomacy40,time:number|null)=>nativeGetMonthSince(time??s.originTime,r.life.gameTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));
/** A legacy unknown count stays null. After an observed end, the conservative
 * maximum 12-year truce is a named WEB policy, not a fabricated native count. */
export function truce40(r:Input,p:DiplomaticRelation40){
 const required=p.warCount===null?12:nativeTruceYears({warCount:p.warCount},3);
 const elapsed=p.lastWar===null?null:nativeGetYearSince(p.lastWar,r.life.gameTime,r.life.secondsPerDay,createNativeIsoCalendar(r.life.startDate));
 const old=r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(p.a)&&[v.a,v.b].includes(p.b));
 return {required,elapsed,blocked:elapsed===null?r.world.day<(old?.truceUntilDay??0):elapsed<required};
}
export function reconcileNativeDiplomacy40(s:NativeDiplomacy40,r:Input){
 for(const n of r.world.nations)if(!s.nations[n.id]){const culture=r.culture.nations[n.id];if(culture?.origin!=='secession'||!culture.parentId)throw Error('新国家缺少已记录的独立来源。');addNation(s,r,n.id,'secession',culture.parentId);revise(s);}
 // UpdateRelationOnWarEnd: count/time are changed at END, exactly once.
 for(const w of r.nativeWars.campaigns)if(w.endedTick!==null)for(const [a,b]of diplomaticEndPairs40(r.nativeWars,w)){const p=relation40(s,a,b);if(p.endedWarIds.includes(w.id))continue;p.endedWarIds.push(w.id);if(p.warCount!==null){if(p.warCount>=2147483647)throw Error('战争次数超过安全范围。');p.warCount++;}p.lastWar=Math.fround(r.life.gameTime);revise(s);}
}
/** One callback per living country's assigned day each calendar month. Caller
 * has already updated life/army state. Initial first update is not repeated. */
export function advanceDiplomaticSchedule40(s:NativeDiplomacy40,r:Input,update:(id:string)=>void){
 reconcileNativeDiplomacy40(s,r);if(r.world.day===s.lastDay)return;if(r.world.day!==s.lastDay+1)throw Error('外交日历不连续，已取消本批。');
 const month=diplomacyMonth40(r),live=new Set(r.world.provinces.map(p=>p.controller));
 if(month!==s.month){if(month!==s.month+1)throw Error('外交月份不连续。');s.month=month;for(const n of r.world.nations)if(live.has(n.id))s.nations[n.id].updateDay=drawDay(s,r);}
 s.lastDay=r.world.day;revise(s);
 for(const n of r.world.nations){const d=s.nations[n.id];if(!live.has(n.id)||d.updateDay!==r.life.currentDate.day||d.updatedMonth===month)continue;nativeAccumulateDiplomaticPower(d.pools,20);d.updatedMonth=month;update(n.id);}
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
const stateKeys=['version','revision','originTick','originTime','rng','draws','month','lastDay','nations','relations','declarations'];
const nationKeys=['origin','parentId','initializedTick','expansionism','activeTime','passiveTime','pools','updateDay','updatedMonth'];
const relationKeys=['a','b','history','lastWar','warCount','endedWarIds'];
const declarationKeys=['warId','casusBelliId','attackerId','defenderId','goals'];
const goalKeys=['id','type','addedBy','target','beneficiary','primary','scopeType','scope','districtId','secondaryStateId'];
export function assertNativeDiplomacySchema40(v:unknown){const s=v as NativeDiplomacy40|undefined;
 if(unknown(s,stateKeys)||s?.version!=null&&s.version!==1||record(s?.nations)&&Object.values(s.nations).some(n=>unknown(n,nationKeys)||unknown(n?.pools,['power','startWar','endWar','efficiency'])||n?.origin!=null&&!['new-world','explicit-copy','secession'].includes(n.origin))||Array.isArray(s?.relations)&&s.relations.some(p=>unknown(p,relationKeys)||p?.history!=null&&!['complete','unknown'].includes(p.history))||Array.isArray(s?.declarations)&&s.declarations.some(d=>unknown(d,declarationKeys)||d?.casusBelliId!=null&&![1,2,3,6].includes(d.casusBelliId)||Array.isArray(d?.goals)&&d.goals.some(g=>unknown(g,goalKeys)||unknown(g?.scope,['provinceIds','requiredCount']))))throw Error('国家外交历史含未来规则或未知字段，已锁定读写。');
}
export function assertNativeDiplomacy40(s:NativeDiplomacy40,r:Input){
 assertNativeDiplomacySchema40(s);const fail=()=>{throw Error('国家外交历史损坏，已保留原档。');};const int=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;const f40=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.fround(v)===v;
 if(!record(s)||Object.keys(s).length!==stateKeys.length||s.version!==1||!int(s.revision)||!int(s.originTick,0,r.clock.tick)||!f40(s.originTime)||s.originTime>r.life.gameTime||!int(s.rng,0,4294967295)||!int(s.draws)||s.month!==diplomacyMonth40(r)||s.lastDay!==r.world.day||!record(s.nations)||Object.keys(s.nations).length!==r.world.nations.length||!Array.isArray(s.relations)||!Array.isArray(s.declarations))return fail();
 for(const n of r.world.nations){const p=s.nations[n.id];if(!record(p)||Object.keys(p).length!==nationKeys.length||!int(p.initializedTick,s.originTick,r.clock.tick)||!f40(p.expansionism)||p.expansionism<1||p.expansionism>6||!int(p.updateDay,1,31)||!int(p.updatedMonth,12,s.month)||!record(p.pools)||Object.keys(p.pools).length!==4||Object.values(p.pools).some(v=>!f40(v)||v<0)||p.pools.efficiency!==20)return fail();
  for(const time of [p.activeTime,p.passiveTime])if(time!==null&&time!==NATIVE_INITIAL_WAR_TIME&&(!f40(time)||time<0||time>r.life.gameTime))return fail();
  if(p.origin==='secession'){if(!p.parentId||p.parentId===n.id||!s.nations[p.parentId]||r.culture.nations[n.id]?.parentId!==p.parentId)return fail();}else if(!['new-world','explicit-copy'].includes(p.origin)||p.parentId!==null)return fail();
  if(p.origin!=='explicit-copy'&&(p.activeTime===null||p.passiveTime===null))return fail();
 }
 const pairs=new Set<string>(),ends=new Set<string>();for(const p of s.relations){const key=JSON.stringify([p?.a,p?.b]);if(!record(p)||Object.keys(p).length!==relationKeys.length||!s.nations[p.a]||!s.nations[p.b]||p.a>=p.b||pairs.has(key)||!Array.isArray(p.endedWarIds)||p.lastWar!==null&&p.lastWar!==-200&&(!f40(p.lastWar)||p.lastWar<0||p.lastWar>r.life.gameTime))return fail();pairs.add(key);
  if(p.history==='unknown'){if(p.warCount!==null||s.nations[p.a].origin!=='explicit-copy'||s.nations[p.b].origin!=='explicit-copy')return fail();}else if(p.history!=='complete'||!int(p.warCount,0,2147483647)||p.lastWar===null||p.warCount!==p.endedWarIds.length)return fail();
  for(const id of p.endedWarIds){const w=r.nativeWars.campaigns.find(w=>w.id===id);if(!int(id,1)||ends.has(key+'/'+id)||!w||w.endedTick===null||!diplomaticEndPairs40(r.nativeWars,w).some(pair=>pair.includes(p.a)&&pair.includes(p.b)))return fail();ends.add(key+'/'+id);}
 }
 if(r.nativeWars.campaigns.some(w=>w.endedTick!==null&&diplomaticEndPairs40(r.nativeWars,w).some(([a,b])=>!ends.has(JSON.stringify(a<b?[a,b]:[b,a])+'/'+w.id))))return fail();
 const declared=new Set<number>();for(const d of s.declarations){const w=r.nativeWars.campaigns.find(w=>w.id===d?.warId);if(!record(d)||Object.keys(d).length!==declarationKeys.length||!int(d.warId,1)||declared.has(d.warId)||![1,2,3,6].includes(d.casusBelliId)||!w||w.history!=='complete'||r.people.nations[w.attacker!]?.id!==d.attackerId||r.people.nations[w.defender!]?.id!==d.defenderId||!Array.isArray(d.goals)||d.goals.length!==w.goals.length)return fail();declared.add(d.warId);
  for(const [i,g]of d.goals.entries()){if(!record(g)||Object.keys(g).length!==goalKeys.length||typeof g.primary!=='boolean'||g.primary!==(i===0)||g.scopeType!==([3,4,11].includes(g.type)?3:0)||g.districtId!==0||g.secondaryStateId!==0)return fail();const {primary,scopeType,districtId,secondaryStateId,...projection}=g;void primary;void scopeType;void districtId;void secondaryStateId;if(JSON.stringify(projection)!==JSON.stringify(w.goals[i]))return fail();}
 }
}
