import type {Army,Province,World} from '../../sim/types';
import type {FoundingForces47} from './civilization47-forces';
import {actualForces47} from './force-runtime47';
import {readArmySpace47} from './army-space47';
import {assertCombatPersonnel47,livingCombatLeader47} from './civilization47-combat-state';
import {nativeLeadership47,nativeNavalCharacter47} from './native-combat/personnel47';
import {nativeUpperEfficiency,defaultPoliticalCombat} from './native-combat/upper-efficiency';
import {traitProjection,provinceDefense} from './upper14-state';
import {unitProfile} from './military-profile';
import {nativeUnitModifier} from './terrain13-native';
import {landAttackMultiplier46} from './war46-blockade';
import {economicEthnic47} from './civilization47-economy';
import type {MovingForce47} from './force-motion47';

/** Rebuilt from the actual current candidate, including the occupation copy.
 * Province references remain live through sequential captures in that copy.
 * No old Army.provinceId, target province, culture or rendered label is used. */
export function combatReader47(r:FoundingForces47,world:World=r.world){
  assertCombatPersonnel47(r.combatPersonnel,world,r.clock.tick,r);
  const {spatial}=actualForces47(r),space=readArmySpace47(world,{...spatial,positions:r.armyPositions});
  const leaders=new Map(world.nations.map(n=>[n.id,livingCombatLeader47(r,n.id)]));
  const national=(id:string)=>{const n=r.upperCombat.nations[id];if(!n||n.polity!==r.civilization.nations[id]?.polity||n.destiny!==r.destiny.nations[id]?.destiny||!Number.isFinite(r.finance.nations[id]?.goldBattleModifier))throw Error('人物战力的国家、国运或财政缓存不一致。');return n;};
  const army=(a:Army)=>{
    const location=space.byArmy.get(a.id);if(!location||location.army.nationId!==a.nationId)throw Error('战力查询缺少实际活动军队。');
    const p=location.province,state=national(a.nationId),snapshot=r.combatPersonnel.armies[a.id],base=r.upperCombat.armies[a.id],owner=p?r.upperCombat.nations[p.controller]:undefined,defense=p?r.upperCombat.provinces[p.id]:undefined;
    if(!base||p&&(!owner||!defense))throw Error('军队或实际地区的战力记录缺失。');
    const attacking=!p||p.controller!==a.nationId,traits=traitProjection(state.traits),politics=defaultPoliticalCombat(state.polity),land=p?r.terrainContext.provinces[p.id]:undefined,key=unitProfile(r.units[a.id]).key,leader=leaders.get(a.nationId);
    // Current web armies are explicitly state-central. Military office/army
    // family assignment is not yet exposed; native missing-office fallback
    // is the current live state leader, then a neutral military skill of 50.
    const leadership=nativeLeadership47(leader?.skills.military??50,{kind:snapshot.command});
    const efficiency=nativeUpperEfficiency({baseCombatEfficiency:base.base,destiny:state.destiny,leadershipModifier:leadership,leaderCombatModifier:r.combatPersonnel.nations[a.nationId].leader.modifier,provinceDefense:p?provinceDefense(r.upperCombat,p.id):1,coreDefense:owner&&defense&&defense.distance!==2147483647&&defense.distance<=owner.coreThreshold?traitProjection(owner.traits).CoreDefenseEfficiencyBoost:1,politicalAttack:politics.attack,politicalDefense:politics.defense,goldBattleModifier:r.finance.nations[a.nationId].goldBattleModifier,attacking,sameNationId:!!p&&p.controller===a.nationId,protruding:false,wellTrained:traits.IsWellTrained,homelandDefense:traits.IsHomelandDefense,conqueror:traits.IsConqueror,unitModifier:nativeUnitModifier(key,attacking,land?.biomes??[],land?.mountain??false),elite:key==='Elite'});
    if(!Number.isFinite(efficiency)||efficiency<0)throw Error('实际人物战力超出有效范围。');
    return {efficiency,damageToArmy:snapshot.damageToArmy,damageToProvince:snapshot.damageToProvince,multiplier:p?landAttackMultiplier46(world,r.portControl,p.id,a.nationId):1};
  };
  return {
    army,
    province:(a:Army,p:Province)=>{if(space.byArmy.get(a.id)?.province?.id!==p.id)throw Error('地区攻防军队不在实际地区。');return army(a);},
    volley:{navyCountToHull:r.combatPersonnel.hullPerNativeCount,
      army:(force:MovingForce47)=>{if(force.kind!=='army')throw Error('海军不能读取陆军伤害。');const a=world.armies.find(a=>a.id===force.id);if(!a||a.nationId!==force.nationId)throw Error('齐射军队身份无效。');return army(a);},
      navy:(force:MovingForce47)=>{if(force.kind!=='fleet'||!r.navy.fleets.some(f=>f.id===force.id&&f.nationId===force.nationId&&f.status!=='lost'))throw Error('齐射舰队身份无效。');const leader=leaders.get(force.nationId);return {destiny:national(force.nationId).destiny,maritime:economicEthnic47(r.economy,force.nationId)==='Maritime',livingLeaderModifier:leader?nativeNavalCharacter47(leader.traits):null};},
    },
  };
}
