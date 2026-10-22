import type {Foundings47} from './civilization47-founding-time';
import {setVassalManager47} from './civilization47-vassal-manager';
import {annexOwned47} from './civilization47-territory-edit';
import {makeVassal47,releaseVassal47,reconcileVassals47} from './civilization47-vassal';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import type {AllianceEdit46} from './war46-alliance';
import {applyAllianceOwned47,reconcileAlliances47} from './civilization47-alliance';
import {applyDiplomacy,type DiplomacyEdit} from './war29-diplomacy';
import {reconcileNativeDiplomacy46} from './civilization47-diplomatic-state';
import {reconcileGovernmentContinuity47,assertPolitics47,politicalStamp47} from './civilization47-political-owner';
import {reconcileMilitaryClock47} from './force-tick47';

/** 全局指令 and nation actions recorded as one journaled world command. */
export type VassalEdit47={type:'make';vassalId:string;overlordId:string}|{type:'release';vassalId:string}|{type:'automatic';enabled:boolean};
export type GlobalOrder47={kind:'alliance';edit:AllianceEdit46}|{kind:'diplomacy';edit:DiplomacyEdit}|{kind:'vassal';edit:VassalEdit47}|{kind:'annex';edit:{nationId:string;targetId:string}}|{kind:'rebellion';edit:RebellionEdit47}|{kind:'families';edit:FamilySettingsEdit47};
/** AI全局配置: 允许家族叛乱 / 家族叛乱最小间隔 / 允许内战 / 内战最小间隔 (original-family worlds). */
export type FamilySettingsEdit47={type:'family-rebellion'|'civil-war';enabled:boolean}|{type:'family-interval'|'civil-interval';months:number};
/** EditPanelUI AI全局配置: 开启叛乱 (EnableRebellions) and 行省叛乱最小间隔 (0–240 months). */
export type RebellionEdit47={type:'enabled';enabled:boolean}|{type:'interval';months:number};
export const globalStamp47=(r:PoliticalRun47)=>({...politicalStamp47(r),settings:r.diplomacy.revision,alliances:r.alliances.revision,vassals:r.vassals.revision,vassalManager:r.vassalManager.revision});
export type GlobalStamp47=ReturnType<typeof globalStamp47>;
export function assertGlobalOrder47(v:unknown):asserts v is GlobalOrder47{
  const o=v as GlobalOrder47;
  if(!o||typeof o!=='object'||Object.keys(o).sort().join()!=='edit,kind'||!['alliance','diplomacy','vassal','annex','rebellion','families'].includes(o.kind)||!o.edit||typeof o.edit!=='object'||Array.isArray(o.edit))throw Error('全局指令无效。');
}
export function applyGlobalOrder47(r:PoliticalRun47,order:GlobalOrder47,expected:GlobalStamp47){
  assertGlobalOrder47(order);
  const stamp=globalStamp47(r),keys=Object.keys(stamp) as (keyof GlobalStamp47)[];
  if(!expected||typeof expected!=='object'||Object.keys(expected).length!==keys.length||keys.some(k=>expected[k]!==stamp[k]))throw Error('世界已变化，请重新操作；原世界未改动。');
  const next=structuredClone(r);
  if(order.kind==='alliance')applyAllianceOwned47(next,order.edit);
  else if(order.kind==='diplomacy')applyDiplomacy(next,order.edit);
  else if(order.kind==='rebellion'){const e=order.edit,s=(next as {foundings?:Foundings47}).foundings;if(!s)throw Error('本世界未启用叛乱规则。');
    if(e.type==='enabled'&&Object.keys(e).sort().join()==='enabled,type'&&typeof e.enabled==='boolean'&&e.enabled!==s.enabled)s.enabled=e.enabled;
    else if(e.type==='interval'&&Object.keys(e).sort().join()==='months,type'&&Number.isSafeInteger(e.months)&&e.months>=0&&e.months<=240&&e.months!==s.minMonths)s.minMonths=e.months;
    else throw Error('叛乱设置无效或未变化。');s.revision++;}
  else if(order.kind==='families'){const e=order.edit,n=(next as {nobility?:{settings:{allowFamilyRebellion:boolean;familyRebelMinMonths:number;allowCivilWar:boolean;civilWarMinMonths:number}}}).nobility;if(!n)throw Error('本世界未使用原作家族规则。');const st=n.settings;
    if((e.type==='family-rebellion'||e.type==='civil-war')&&Object.keys(e).sort().join()==='enabled,type'&&typeof e.enabled==='boolean'){const key=e.type==='family-rebellion'?'allowFamilyRebellion':'allowCivilWar';if(st[key]===e.enabled)throw Error('家族设置未变化。');st[key]=e.enabled;}
    else if((e.type==='family-interval'||e.type==='civil-interval')&&Object.keys(e).sort().join()==='months,type'&&Number.isSafeInteger(e.months)&&e.months>=0&&e.months<=240){const key=e.type==='family-interval'?'familyRebelMinMonths':'civilWarMinMonths';if(st[key]===e.months)throw Error('家族设置未变化。');st[key]=e.months;}
    else throw Error('家族设置无效。');}
  else if(order.kind==='annex'){const e=order.edit;if(Object.keys(e).sort().join()!=='nationId,targetId')throw Error('吞并参数无效。');annexOwned47(next,e.nationId,e.targetId);}
  else{const e=order.edit;
    if(e.type==='make'){if(Object.keys(e).sort().join()!=='overlordId,type,vassalId')throw Error('附庸参数无效。');makeVassal47(next,e.vassalId,e.overlordId);}
    else if(e.type==='automatic'){if(Object.keys(e).sort().join()!=='enabled,type')throw Error('附庸参数无效。');setVassalManager47(next,e.enabled);}
    else if(e.type==='release'){if(Object.keys(e).sort().join()!=='type,vassalId')throw Error('附庸参数无效。');if(!releaseVassal47(next,e.vassalId))throw Error('该国不是附庸。');}
    else throw Error('附庸参数无效。');}
  reconcileVassals47(next);
  reconcileAlliances47(next);reconcileGovernmentContinuity47(next);reconcileNativeDiplomacy46(next.nativeDiplomacy,next);
  reconcileMilitaryClock47(next,next.clock.tick);assertPolitics47(next);
  return next;
}
