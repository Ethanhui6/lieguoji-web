import type {World} from '../../sim/types';
export type DiplomacySettings={version:1;revision:number;worldAuto:boolean;maximumMonths:number;nations:Record<string,boolean>};
export type DiplomacyEdit={scope:'world';enabled:boolean}|{scope:'nation';nationId:string;enabled:boolean}|{scope:'duration';months:number};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(n:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
/** World ctor 6CB340, State ctors 5E2510/5E2F20 and WorldSettings cctor
 * 6E2240 defaults. These do not read the installed game's personal settings. */
export const initialDiplomacy=(world:World):DiplomacySettings=>({version:1,revision:0,worldAuto:true,maximumMonths:240,nations:Object.fromEntries(world.nations.map(n=>[n.id,true]))});
export function assertDiplomacySchema(value:unknown){
 if(!record(value))return;
 if(value.version!=null&&value.version!==1||Object.keys(value).some(k=>!['version','revision','worldAuto','maximumMonths','nations'].includes(k)))throw Error('外交设置含未来版本或未知字段，已锁定读写。');
}
export function assertDiplomacy(value:unknown,world:World):asserts value is DiplomacySettings{
 assertDiplomacySchema(value);
 if(!record(value)||value.version!==1||!integer(value.revision)||typeof value.worldAuto!=='boolean'||!integer(value.maximumMonths,0,480)||!record(value.nations)||Object.keys(value.nations).length!==world.nations.length)throw Error('外交设置损坏，原进度未覆盖。');
 const nations=value.nations;if(world.nations.some(n=>!Object.hasOwn(nations,n.id)||typeof nations[n.id]!=='boolean'))throw Error('国家外交设置缺失。');
}
const revise=(s:DiplomacySettings)=>{if(!integer(s.revision+1))throw Error('外交设置版本超过安全范围。');s.revision++;};
export function reconcileDiplomacy(s:DiplomacySettings,world:World){
 let changed=false;for(const n of world.nations)if(!Object.hasOwn(s.nations,n.id)){s.nations[n.id]=true;changed=true;}
 if(changed)revise(s);
}
export const autonomousNation=(s:DiplomacySettings,id:string)=>s.worldAuto&&s.nations[id]===true;
export function previewDiplomacy(r:{world:World;diplomacy:DiplomacySettings},edit:DiplomacyEdit){
 const bad=(reason:string)=>({valid:false,reason,details:[] as string[]});
 if(!record(edit))return bad('外交设置格式无效。');
 const fields=edit.scope==='world'?['scope','enabled']:edit.scope==='nation'?['scope','nationId','enabled']:edit.scope==='duration'?['scope','months']:[];
 if(!fields.length||Object.keys(edit).length!==fields.length||Object.keys(edit).some(k=>!fields.includes(k)))return bad('外交设置字段无效。');
 if(edit.scope==='duration'){
  if(!integer(edit.months,0,480))return bad('战争期限须为 0 至 480 的整数月。');
  if(edit.months===r.diplomacy.maximumMonths)return bad('战争期限没有变化。');
  return {valid:true,reason:edit.months?`将最长战争期限设为 ${edit.months} 个月。`:'关闭最长战争期限。',details:['每月首日检查开战后的完整历月；达到期限后，普通外战按实际战局结算，并非无条件白和。','仅在世界自动外交开启时生效；国家单独关闭自动外交不豁免这一世界期限。','确认只改变设置，下次月初检查生效；缩短期限可能使正在进行的战争提前进入结算。']};
 }
 if(typeof edit.enabled!=='boolean')return bad('自动外交开关无效。');
 if(edit.scope==='world'){
  if(edit.enabled===r.diplomacy.worldAuto)return bad('世界自动外交没有变化。');
  return {valid:true,reason:`${edit.enabled?'开启':'关闭'}世界自动外交。`,details:[edit.enabled?'各国按各自开关恢复自主外交，并检查战争期限。':'暂停自主宣战、自动议和与战争期限检查。','已在进行的战争、行军、战斗和补给继续；玩家仍可手动干预。']};
 }
 const n=r.world.nations.find(n=>n.id===edit.nationId);if(!n)return bad('国家不存在。');
 if(edit.enabled===r.diplomacy.nations[n.id])return bad('该国自动外交没有变化。');
 return {valid:true,reason:`${edit.enabled?'允许':'禁止'}${n.name}自主外交。`,details:['关闭后该国不自主宣战，但仍会防御，也仍可能被其他国家宣战。','普通自动议和至少需要一名存活参战国开启自主外交；世界战争期限另行约束。',...(r.diplomacy.worldAuto?[]:['世界自动外交当前关闭，本国开关将在世界开关开启后生效。'])]};
}
/** Mutate only the session's private candidate after the preview stamp check. */
export function applyDiplomacy(r:{world:World;diplomacy:DiplomacySettings},edit:DiplomacyEdit){
 const p=previewDiplomacy(r,edit);if(!p.valid)throw Error(p.reason);
 revise(r.diplomacy);
 if(edit.scope==='world')r.diplomacy.worldAuto=edit.enabled;
 else if(edit.scope==='duration')r.diplomacy.maximumMonths=edit.months;
 else r.diplomacy.nations[edit.nationId]=edit.enabled;
 r.world.events.push({id:r.world.nextEventId++,day:r.world.day,kind:'system',text:p.reason,reason:p.details.join(' ')});r.world.events=r.world.events.slice(-160);
}
