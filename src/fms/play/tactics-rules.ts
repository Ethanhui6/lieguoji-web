import type {Army,Province,World} from '../../sim/types';
import {unitProfile,type UnitAssignments} from './military-profile';
/** Native scaled seconds are mapped to 10 web ticks, not calendar half-days.
 * The deterministic interval preserves replay; it is not Unity's random stream. */
export const TACTICS_SECOND=10;
export function combatInterval(id:string,pulse:number){let seed=pulse>>>0;for(const c of id)seed=(Math.imul(seed,31)+c.charCodeAt(0))>>>0;return (2+seed%5)*TACTICS_SECOND;}
/** Source has no troop-count multiplier. Leader/destiny/biome mixture data is
 * not in this world schema; morale/supply and the existing terrain are adapters. */
export function combatEfficiency(w:World,a:Army,units:UnitAssignments,p:Province,atNode=true){
  const u=unitProfile(units[a.id]),defender=atNode&&p.controller===a.nationId;
  const fort=atNode?Math.max(0,...w.cities.filter(c=>c.provinceId===p.id).map(c=>c.fort)):0;
  const terrain=atNode?({plain:1,forest:1.15,mountain:1.3}[p.terrain]*(1+fort*.12)):1;
  const base=Math.max(.1,Math.min(10,(.35+a.morale*.0065)*(a.supplies>0?1:.5)*(defender?terrain:1/terrain)));
  return base*u.power*(atNode&&p.terrain==='mountain'?(defender?u.mountainDefense:u.mountainAttack):1)*(units[a.id]==='Elite'?10:1);
}

/** Web AI estimate: combine remaining endurance with actual per-object output.
 * A small elite force cannot be treated as weak merely by counting its people. */
export function combatPotential(w:World,a:Army,units:UnitAssignments,p:Province,atNode=true){return Math.sqrt(a.troops*(units[a.id]==='Elite'?10:1)*combatEfficiency(w,a,units,p,atNode));}
