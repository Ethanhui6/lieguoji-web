import type {FoundingForces47} from './civilization47-forces';
import {landHolders47,type ArmySpace47} from './army-space47';
import {nationsAtWar} from './realtime-statecraft';

/** Display-only projection of the already validated, current Army space.
 * Not an occupation decision or a substitute for order validation. */
export function activeSiegesFromSpace47(r:Pick<FoundingForces47,'world'|'occupation'>,space:ArmySpace47):string[]{
 const provinces=new Map(r.world.provinces.map(p=>[p.id,p]));
 return r.occupation.sieges.filter(s=>{const p=provinces.get(s.provinceId);return p&&landHolders47(space,p.id).some(a=>nationsAtWar(r.world,a.nationId,p.controller));}).map(s=>s.provinceId);
}
