import type {FoundingForces47} from './civilization47-forces';
import type {ForceActivity47} from './force-activity47';
import {unitProfile,isUnitKey} from './military-profile';
import {armyKills47} from './civilization47-original-army';

type Army=FoundingForces47['world']['armies'][number];
/** Army.GetName: the "ArmyName" text 「{0}第{1}军团」 with the state name and the army id. */
export function armyName47(r:Pick<FoundingForces47,'world'>,army:Army){
  const state=r.world.nations.find(n=>n.id===army.nationId)?.name??'',number=/(\d+)$/.exec(army.id)?.[1]??army.id;
  return `${state}第${number}军团`;
}
export type ArmyInfoRow47={label:string;value:string};
/** Army.GetCurrentStatus / GetHomeProvinceStatus / GetCurrentPosition (军团信息), in the
 * original order: 军队人数, 兵种, 当前状态, 故乡, 当前位置. Status values follow
 * BuildCurrentStatusRow / BuildAttackingStatusValue: 重组, 参与{战役}, 前往进攻{0}, 前往防守,
 * 在海洋中航行, 休整待命. The web keeps no per-army annihilation total, so 「战史共歼灭敌军」 is
 * not shown, and the battle name omits the original running count (第{0}次). */
export function armyInfo47(r:FoundingForces47,army:Army,activity:ForceActivity47|null,reorganizing:boolean):ArmyInfoRow47[]{
  const provinces=new Map(r.world.provinces.map(p=>[p.id,p])),unit=r.units?.[army.id];
  const status=()=>{
    if(reorganizing)return '重组';
    if(!activity)return '休整待命';
    if(activity.siege||activity.contact){const at=activity.siege?.provinceName??(activity.location.kind==='land'?activity.location.label:'');return activity.location.kind==='sea'?'海战':`参与${at}战役`;}
    if(activity.target&&activity.decision!=='garrison'&&activity.decision!=='waiting'){
      const target=provinces.get(activity.target.id);
      if(target&&target.controller!==army.nationId)return `前往进攻${activity.target.label}`;
      if(activity.decision==='supporting'||activity.decision==='staging')return '前往防守';
    }
    if(activity.location.kind==='sea')return '在海洋中航行';
    return '休整待命';
  };
  const homeId=(r as {tactics?:{forces:Record<string,{homeId:string}>}}).tactics?.forces[army.id]?.homeId??army.originId,home=provinces.get(homeId);
  const homeValue=home?(home.controller===army.nationId?home.name:`${home.name}（已沦陷）`):'未知';
  const position=activity?activity.location.kind==='sea'?'在海洋中航行':activity.location.label:provinces.get(army.provinceId)?.name??'未知';
  return [
    {label:'军队人数',value:Math.round(army.troops).toLocaleString('zh-CN')},
    ...(()=>{const kills=armyKills47(r,army.id);return kills===null?[]:[{label:'战史共歼灭敌军',value:kills.toLocaleString('zh-CN')}];})(),
    {label:'兵种',value:unit&&isUnitKey(unit)?unitProfile(unit).name:'步兵'},
    {label:'当前状态',value:status()},
    {label:'故乡',value:homeValue},
    {label:'当前位置',value:position},
  ];
}
