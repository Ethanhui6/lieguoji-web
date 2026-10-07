import type {Upper14Run} from './upper14-model';
import {POLITIES,TRAITS,reconcileUpper,type CombatTrait} from './upper14-state';
import type {NativePolity} from './native-combat/upper-efficiency';
export const POLITY_NAMES:Record<NativePolity,string>={Kingdom:'王国',Empire:'帝国',Federation:'联邦',Republic:'共和国',Tribal:'部落',Theocracy:'神权制'};
/** Short labels and precise explanations are web wording, not recovered titles. */
export const TRAIT_LABELS:Record<CombatTrait,string>={WellTrained:'训练有素',CoreDefense:'核心防御',HomelandDefense:'保卫国土',Conqueror:'征服者',StrengthenCore:'强化核心'};
export const TRAIT_HELP:Record<CombatTrait,string>={WellTrained:'进攻时免除敌国核心区的额外惩罚，仍受地貌影响。',CoreDefense:'核心区防御倍率由1.15提高到1.5。',HomelandDefense:'在本国控制区防守时，战力乘以1.5。',Conqueror:'在他国控制区进攻时，战力乘以1.5。',StrengthenCore:'核心省份目标比例由15%提高到30%，每年逐步扩大。'};
export type CombatEdit={nationId:string;polity:NativePolity;traits:CombatTrait[];destiny:number};
export type CombatStamp={day:number;nextEventId:number;tick:number};
export function previewCombatEdit(r:Upper14Run,edit:CombatEdit,expected:CombatStamp,runId:string){
 const invalid=(reason:string)=>({valid:false,reason,changes:[] as string[]});
 if(runId!==r.id||!expected||![expected.day,expected.nextEventId,expected.tick].every(Number.isSafeInteger)||expected.day!==r.world.day||expected.nextEventId!==r.world.nextEventId||expected.tick!==r.clock.tick)return invalid('局势或世界已经改变，请重新打开国家设置。');
 if(!edit||typeof edit!=='object'||Object.keys(edit).some(k=>!['nationId','polity','traits','destiny'].includes(k))||!POLITIES.includes(edit.polity)||!Array.isArray(edit.traits)||new Set(edit.traits).size!==edit.traits.length||edit.traits.some(t=>!TRAITS.includes(t))||!Number.isFinite(edit.destiny)||edit.destiny<0||edit.destiny>100)return invalid('国家战力设置无效。');
 const old=r.upperCombat.nations[edit.nationId],nation=r.world.nations.find(n=>n.id===edit.nationId);
 if(!old||!nation||!r.world.provinces.some(p=>p.controller===nation.id))return invalid('只能调整仍有实际领土的国家。');
 const changes:string[]=[];
 if(old.polity!==edit.polity)changes.push(`政体：${POLITY_NAMES[old.polity]} → ${POLITY_NAMES[edit.polity]}`);
 if(old.destiny!==edit.destiny)changes.push(`国运：${old.destiny} → ${edit.destiny}`);
 for(const key of TRAITS)if(old.traits.includes(key)!==edit.traits.includes(key))changes.push(`${edit.traits.includes(key)?'启用':'取消'}${TRAIT_LABELS[key]}：${TRAIT_HELP[key]}`);
 return changes.length?{valid:true,reason:`调整${nation.name}的国家战力；立即影响下一次交锋，不消耗时间。`,changes}:invalid('尚未修改任何设置。');
}
export function applyCombatEdit(r:Upper14Run,edit:CombatEdit,expected:CombatStamp,runId:string):Upper14Run{
 const preview=previewCombatEdit(r,edit,expected,runId);if(!preview.valid)throw Error(preview.reason);
 const next=structuredClone(r),n=next.upperCombat.nations[edit.nationId];
 n.polity=edit.polity;n.traits=TRAITS.filter(t=>edit.traits.includes(t));n.destiny=Math.fround(edit.destiny);reconcileUpper(next,next.upperCombat);
 next.world.events.push({id:next.world.nextEventId++,day:next.world.day,kind:'system',text:`${next.world.nations.find(n=>n.id===edit.nationId)!.name}调整国家制度与战力`,reason:preview.changes.join('；')});next.world.events=next.world.events.slice(-160);
 return next;
}
