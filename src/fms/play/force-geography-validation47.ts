import {assertDiplomaticGeography,assertGeographySchema,type DiplomaticGeography} from './war30-geography';
import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import {certifiedGeography47,copyGeographyContent47,geographyDependencies47,retainGeographyWitness47,sameGeographyContent47} from './geography-content47';
const cache:{value:unknown;cost:number}[]=[];
/** Exact content memo, not the short geometry hash or object identity. The
 * original validator depends only on these terrain/province fields and the
 * complete water partition. Ownership, dates and force positions stay live.
 * Only successful validations enter this bounded, non-serialized cache. */
export function assertForceGeography47(s:DiplomaticGeography,r:{terrain:FmsDocument;world:World}){
 assertGeographySchema(s);
 const dependencies={geography:s,geometry:geographyDependencies47(r)};
 const hit=cache.find(entry=>sameGeographyContent47(dependencies,entry.value));
 if(hit){const old=hit.value as typeof dependencies;if(certifiedGeography47(s)&&old.geography!==s||certifiedGeography47(dependencies.geometry.points)&&old.geometry.points!==dependencies.geometry.points){const witness=copyGeographyContent47(dependencies);if(witness){cache.splice(cache.indexOf(hit),1);retainGeographyWitness47(cache,witness);}}return;}
 assertDiplomaticGeography(s,r);
 const witness=copyGeographyContent47(dependencies);if(witness)retainGeographyWitness47(cache,witness);
}
