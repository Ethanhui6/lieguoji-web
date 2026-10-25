import {nativeFindSuccessor} from './native-economy/family-succession';
import {diePersonOwned47} from './civilization47-lifecycle';
import {assertPopulation47} from './civilization47-population-validation';
import {populationStamp47,type FamilyPerson47,type Population47,type PopulationStamp47} from './civilization47-population-types';
import {sameCulture47Value} from './culture47-equal';

/** Original FamilyTreeUI family actions (FamilyActionType), the ones that change existing
 * people. Texts are the original localization (FamilyAction*, FamilyTreeConfirm*):
 * - 设为族长 PromoteToPatriarch: a living member becomes patriarch (a collateral relative is
 *   first made a member, Family.AddMember), then FamilyManager.UpdateFamilyHeir picks the heir;
 * - 设为继承人 SetHeir: a living member other than the patriarch becomes heir;
 * - 离婚 Divorce: both spouses lose the marriage (spouse link and Spouse role);
 * - 处死角色 KillCharacter: the person dies now through the same death path as a natural death
 *   (a ruler's reign ends and succession runs; patriarchship passes on).
 * 设置年龄、添加配偶、添加子嗣、删除角色 change birth or population records and come later. */
export type FamilyEdit47={type:'patriarch'|'heir'|'divorce'|'kill';personId:number};
export const FAMILY_ACTIONS47:readonly {type:FamilyEdit47['type'];label:string;confirm?:string}[]=[
  {type:'patriarch',label:'设为族长'},{type:'heir',label:'设为继承人'},
  {type:'divorce',label:'离婚',confirm:'确定要离婚吗？'},{type:'kill',label:'处死角色',confirm:'确定要处死该角色吗？'},
];
export function assertFamilyEdit47(v:unknown):asserts v is FamilyEdit47{
  const e=v as FamilyEdit47;
  if(!e||typeof e!=='object'||Object.keys(e).length!==2||!['patriarch','heir','divorce','kill'].includes(e.type)||!Number.isSafeInteger(e.personId)||e.personId<1)throw Error('家族操作无效。');
}
/** Why the action cannot run now (shown on the disabled button), or null. */
export function familyEditBlocker47(r:Population47,edit:FamilyEdit47):string|null{
  const p=r.kin.persons[edit.personId],f=p&&r.kin.families[p.familyId];
  if(!p)return '找不到这个人物。';
  if(!p.isAlive)return '人物已故。';
  if(!f)return '人物不属于任何家族。';
  if(edit.type==='patriarch'&&f.headId===p.id)return '已是族长。';
  if(edit.type==='heir'){if(f.headId===p.id)return '族长不能同时是继承人。';if(f.heirId===p.id)return '已是继承人。';}
  if(edit.type==='divorce'){const s=r.kin.persons[p.spouseId];if(!s||!s.isAlive)return '没有在世的配偶。';}
  return null;
}
const member=(r:Population47,p:FamilyPerson47)=>{const f=r.kin.families[p.familyId];if(!f.memberIds.includes(p.id)){f.collateralMemberIds=f.collateralMemberIds.filter(id=>id!==p.id);f.memberIds.push(p.id);}return f;};
export function applyFamilyEdit47<T extends Population47>(run:T,edit:FamilyEdit47,expected:PopulationStamp47):T{
  assertFamilyEdit47(edit);
  if(!sameCulture47Value(expected,populationStamp47(run)))throw Error('世界已经推进，请重新操作。');
  const reason=familyEditBlocker47(run,edit);if(reason)throw Error(reason);
  const {terrain,...rest}=run as T&{terrain?:unknown},next={...structuredClone(rest),...(terrain===undefined?{}:{terrain})} as T;
  const p=next.kin.persons[edit.personId],getCharacter=(id:number)=>next.kin.persons[id]??null;
  if(edit.type==='patriarch'){
    const f=member(next,p);f.headId=p.id;p.isHistoricallyImportant=true;
    const heir=nativeFindSuccessor(f,p,getCharacter,()=>null);f.heirId=heir&&heir.id!==p.id?heir.id:0;
  }else if(edit.type==='heir'){
    member(next,p).heirId=p.id;
  }else if(edit.type==='divorce'){
    const s=next.kin.persons[p.spouseId];
    for(const [a,b] of [[p,s],[s,p]] as const){a.spouseId=0;a.roles=a.roles.filter(role=>!(role.nativeKind==='spouse'&&role.spouseOfId===b.id));}
  }else{
    diePersonOwned47(next,p,'executed');
  }
  next.kin.revision++;
  assertPopulation47(next);
  return next;
}
