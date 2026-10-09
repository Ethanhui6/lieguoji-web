import type {FoundingForces47} from './civilization47-forces';
import type {ArmySpace47} from './army-space47';

/** Fixed session window only: geometry, terrain and unit definitions cannot
 * change here. Key the actual land holders and mutable combat inputs, never
 * render coordinates or a per-motion revision. Keep the PRE-observation key:
 * capture/core/leadership changes must be observed again at the next original
 * opportunity, including earlier provinces in the sequential capture loop. */
export function occupationObservationKey47(r:FoundingForces47,space:ArmySpace47):string {
 return JSON.stringify([
  [...space.byArmy.values()].map(({army:a,province:p})=>[a.id,a.nationId,a.troops,a.status==='retreating',p?.id??null]),
  r.world.provinces.map(p=>[p.id,p.controller,p.legalOwner]),
  r.world.statecraft!.relations.map(p=>[p.a,p.b,p.status]),
  r.occupation,r.tactics.unopposed,
  Object.entries(r.portControl.ports).map(([id,p])=>[id,p.landOwnerId,p.occupierId]),
  r.upperCombat,r.finance.nations,r.units,r.combatPersonnel,
  r.world.nations.map(n=>{const id=r.people.nations[n.id].leaderId,p=id===null?null:r.kin.persons[id];return[n.id,n.capitalId,id,p?.isAlive,p?.base,p?.traits];}),
 ]);
}
