import type {TerrainContext} from './fiscal15-state';
import type {Army,Province,World} from '../../sim/types';
import {unitProfile,type UnitAssignments} from './military-profile';
import {nativeUnitModifier} from './terrain13-native';
import type {ProvinceTerrain} from './terrain13-context';
import {traitProjection,provinceDefense} from './upper14-state';
import {nativeUpperEfficiency,defaultPoliticalCombat} from './native-combat/upper-efficiency';
export {combatInterval,TACTICS_SECOND} from './tactics-rules';
/** Actual and AI prospective province evaluations share one resolved-input
 * calculation. Personnel/protrusion remain explicit neutral inputs;
 * they are not inferred from names, morale, food or the web fort level. */
export function combatEfficiency(_w:World,a:Army,units:UnitAssignments,p:Province,atNode=true,context?:TerrainContext,field?:ProvinceTerrain){
 if(!context)throw Error('缺少新版战力上下文。');
 const u=context.upper,state=u.nations[a.nationId],army=u.armies[a.id];if(!state||!army)throw Error('军队战力输入缺失。');
 const current=atNode||field?p:undefined,owner=current&&u.nations[current.controller],native=current&&u.provinces[current.id];
 const attacking=!current||current.controller!==a.nationId,traits=traitProjection(state.traits),politics=defaultPoliticalCombat(state.polity),land=atNode?context.provinces[p.id]:field,key=unitProfile(units[a.id]).key;
 return nativeUpperEfficiency({baseCombatEfficiency:army.base,destiny:state.destiny,leadershipModifier:1,leaderCombatModifier:0,provinceDefense:current?provinceDefense(u,current.id):1,coreDefense:owner&&native&&native.distance!==2147483647&&native.distance<=owner.coreThreshold?traitProjection(owner.traits).CoreDefenseEfficiencyBoost:1,politicalAttack:politics.attack,politicalDefense:politics.defense,goldBattleModifier:context.finance.nations[a.nationId].goldBattleModifier,attacking,sameNationId:!!current&&current.controller===a.nationId,protruding:false,wellTrained:traits.IsWellTrained,homelandDefense:traits.IsHomelandDefense,conqueror:traits.IsConqueror,unitModifier:nativeUnitModifier(key,attacking,land?.biomes??[],land?.mountain??false),elite:key==='Elite'});
}
export function combatPotential(w:World,a:Army,units:UnitAssignments,p:Province,atNode=true,context?:TerrainContext){return Math.sqrt(a.troops*(units[a.id]==='Elite'?10:1)*combatEfficiency(w,a,units,p,atNode,context));}
