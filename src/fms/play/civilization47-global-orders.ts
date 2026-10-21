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
export type VassalEdit47={type:'make';vassalId:string;overlordId:string}|{type:'release';vassalId:string};
export type GlobalOrder47={kind:'alliance';edit:AllianceEdit46}|{kind:'diplomacy';edit:DiplomacyEdit}|{kind:'vassal';edit:VassalEdit47}|{kind:'annex';edit:{nationId:string;targetId:string}};
export const globalStamp47=(r:PoliticalRun47)=>({...politicalStamp47(r),settings:r.diplomacy.revision,alliances:r.alliances.revision,vassals:r.vassals.revision});
export type GlobalStamp47=ReturnType<typeof globalStamp47>;
export function assertGlobalOrder47(v:unknown):asserts v is GlobalOrder47{
  const o=v as GlobalOrder47;
  if(!o||typeof o!=='object'||Object.keys(o).sort().join()!=='edit,kind'||!['alliance','diplomacy','vassal','annex'].includes(o.kind)||!o.edit||typeof o.edit!=='object'||Array.isArray(o.edit))throw Error('全局指令无效。');
}
export function applyGlobalOrder47(r:PoliticalRun47,order:GlobalOrder47,expected:GlobalStamp47){
  assertGlobalOrder47(order);
  const stamp=globalStamp47(r),keys=Object.keys(stamp) as (keyof GlobalStamp47)[];
  if(!expected||typeof expected!=='object'||Object.keys(expected).length!==keys.length||keys.some(k=>expected[k]!==stamp[k]))throw Error('世界已变化，请重新操作；原世界未改动。');
  const next=structuredClone(r);
  if(order.kind==='alliance')applyAllianceOwned47(next,order.edit);
  else if(order.kind==='diplomacy')applyDiplomacy(next,order.edit);
  else if(order.kind==='annex'){const e=order.edit;if(Object.keys(e).sort().join()!=='nationId,targetId')throw Error('吞并参数无效。');annexOwned47(next,e.nationId,e.targetId);}
  else{const e=order.edit;
    if(e.type==='make'){if(Object.keys(e).sort().join()!=='overlordId,type,vassalId')throw Error('附庸参数无效。');makeVassal47(next,e.vassalId,e.overlordId);}
    else if(e.type==='release'){if(Object.keys(e).sort().join()!=='type,vassalId')throw Error('附庸参数无效。');if(!releaseVassal47(next,e.vassalId))throw Error('该国不是附庸。');}
    else throw Error('附庸参数无效。');}
  reconcileVassals47(next);
  reconcileAlliances47(next);reconcileGovernmentContinuity47(next);reconcileNativeDiplomacy46(next.nativeDiplomacy,next);
  reconcileMilitaryClock47(next,next.clock.tick);assertPolitics47(next);
  return next;
}
