import {nameSeed} from './chronicle-records';
import {TRAITS,type CombatTrait,type UpperCombat} from './upper14-state';

/** Original state traits (StreamingAssets/Base/Traits/StateTraits/traits.json, Chinese names and
 * descriptions from its localization.csv). */
export const STATE_TRAITS47=[
  {id:'FightToTheEnd',label:'决战到底',description:'永远不会投降，直到最后一兵一卒',effect:'IsFightToTheEnd'},
  {id:'StrengthenCore',label:'强化核心',description:'核心省份上限占比增加',effect:'CoreProvinceRate'},
  {id:'ManifestDestiny',label:'天命昭昭',description:'命由天定，一往无前，天赋荣光，唯我独尊',effect:'IsManifestDestiny'},
  {id:'BullyTheWeak',label:'恃强凌弱',description:'选择最弱小的国家发动进攻',effect:'IsBullyTheWeak'},
  {id:'DefyTheStrong',label:'不畏强权',description:'选择最强大的国家发动攻击',effect:'IsDefyTheStrong'},
  {id:'TotalWar',label:'全面战争',description:'与每一个接触的国家发生战争',effect:'IsTotalWar'},
  {id:'WellTrained',label:'训练有素',description:'无视负面地形对军队战斗力的削弱',effect:'IsWellTrained'},
  {id:'CoreDefense',label:'核心防御',description:'在核心领土上战斗力增加',effect:'CoreDefenseEfficiencyBoost'},
  {id:'CavalryTradition',label:'骑兵传统',description:'军队移动速度增加',effect:'IsCavalryTradition'},
  {id:'HomelandDefense',label:'保家卫国',description:'在防守的时候战斗力增加',effect:'IsHomelandDefense'},
  {id:'Conqueror',label:'征服者',description:'在进攻时战斗力增加',effect:'IsConqueror'},
  {id:'SiegeCapture',label:'攻城掠地',description:'能够快速的占领地方行省',effect:'SiegeDamageBoost'},
  {id:'FieldCombatElite',label:'野战精锐',description:'能够快速的击败敌人的军队',effect:'FieldCombatEfficiency'},
] as const;
export type StateTrait47=typeof STATE_TRAITS47[number]['id'];
export const stateTrait47=(id:string)=>STATE_TRAITS47.find(t=>t.id===id);
/** Traits whose effects the web's combat already applies (upperCombat nation traits). */
export const ACTIVE_STATE_TRAITS47:readonly string[]=TRAITS;

/** MapCulture.GenerateTraitsForState: Random.Range(2,6) traits drawn without repetition, each by its
 * culture weight (CultureData.TraitProbabilities). The original's fantasy presets weigh every
 * trait 50, so the web's cultures draw them evenly. Each state draws from its own seeded stream. */
export function generateStateTraits47(seed:string,nationId:string):StateTrait47[]{
  let s=nameSeed(`${seed}/state-traits47/${nationId}`);const next=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const count=2+Math.floor(next()*4),pool:StateTrait47[]=STATE_TRAITS47.map(t=>t.id),out:StateTrait47[]=[];
  while(out.length<count&&pool.length)out.push(pool.splice(Math.floor(next()*pool.length),1)[0]);
  return out;
}
export type StateTraitRun47={world:{nations:{id:string}[];custom?:{seed:string}};upperCombat:UpperCombat;stateTraits47?:Record<string,StateTrait47[]>};
/** Worlds created with the ledger give every state its traits once (states founded later too) and
 * keep the combat traits in the state's combat record. */
export function recordStateTraits47(r:StateTraitRun47){
  const ledger=r.stateTraits47;if(!ledger)return;
  for(const n of r.world.nations){
    const traits=ledger[n.id]??(ledger[n.id]=generateStateTraits47(r.world.custom!.seed,n.id)),combat=r.upperCombat.nations[n.id];if(!combat)continue;
    const want=TRAITS.filter(t=>(traits as readonly string[]).includes(t)) as CombatTrait[];
    if(want.join()!==combat.traits.join())combat.traits=want;
  }
}
