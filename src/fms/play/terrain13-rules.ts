import type {Army,Province,World} from '../../sim/types';
import {unitProfile,type UnitAssignments} from './military-profile';
import {nativeUnitModifier} from './terrain13-native';
import type {ProvinceTerrain,TerrainContext} from './terrain13-context';
export {combatInterval,TACTICS_SECOND} from './tactics-rules';
/** Morale, supplies and fort are retained web adapters. Native biome tables
 * replace, rather than stack with, the old generic forest/mountain bonus. */
export function combatEfficiency(w:World,a:Army,units:UnitAssignments,p:Province,atNode=true,terrain?:TerrainContext,field?:ProvinceTerrain){
 const defender=p.controller===a.nationId,land=atNode?terrain?.provinces[p.id]:field;
 const fort=atNode?Math.max(0,...w.cities.filter(c=>c.provinceId===p.id).map(c=>c.fort)):0,defense=1+fort*.12;
 const base=Math.min(10,Math.max(.1,(.35+a.morale*.0065)*(a.supplies>0?1:.5)*(defender?defense:1/defense)));
 const key=unitProfile(units[a.id]).key;return base*nativeUnitModifier(key,!defender,land?.biomes??[],land?.mountain??false)*(key==='Elite'?10:1);
}
export function combatPotential(w:World,a:Army,units:UnitAssignments,p:Province,atNode=true,terrain?:TerrainContext){return Math.sqrt(a.troops*(units[a.id]==='Elite'?10:1)*combatEfficiency(w,a,units,p,atNode,terrain));}
