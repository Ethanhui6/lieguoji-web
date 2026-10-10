import type {FoundingForces47} from './civilization47-forces';
import type {ArmySpace47} from './army-space47';
import {isOwnedTravelWindow47} from './owned-travel47';

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

/** Only the fixed leased Session owner installs this. Between invalidations
 * its pure travel/port phases can change these scalar inputs, but cannot edit
 * combat definitions, rulers, province ownership or diplomatic relationships.
 * Keep VALUES, not references: ports and army records can be mutated in place. */
export function createSessionOccupationObserver47(){
 let previous:readonly (string|number|boolean|null)[]|undefined,key:string|undefined;
 const invalidate=()=>{previous=undefined;key=undefined;};
 return {invalidate,read:(r:FoundingForces47,space:ArmySpace47)=>{
  if(!isOwnedTravelWindow47())throw Error('占领观察复用仅允许私有同步推演。');
  const values:(string|number|boolean|null)[]=[space.byArmy.size];
  for(const {army:a,province:p} of space.byArmy.values())values.push(a.id,a.nationId,a.troops,a.status==='retreating',p?.id??null);
  const ports=Object.entries(r.portControl.ports);values.push(ports.length);
  for(const [id,p]of ports)values.push(id,p.landOwnerId,p.occupierId);
  if(key!==undefined&&previous?.length===values.length&&values.every((v,i)=>v===previous![i]))return key;
  previous=values;key=occupationObservationKey47(r,space);return key;
 }};
}
