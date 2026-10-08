import {describe,it,expect,beforeAll} from 'vitest';
import {grid} from './fixture.test-support';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {assertForceGeography47} from './force-geography-validation47';
import {assertDiplomaticGeography} from './war30-geography';
import {cloneMilitaryCandidate47,copyGeographyContent47,prepareOwnedGeography47,sameGeographyContent47} from './geography-content47';
let base:FoundingForces47;
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),2,24,'peace',{mode:'culture-generated',enabled:['chinese']});},20000);
describe('content-validated real47 geographic reuse',()=>{
 it('shares only certified immutable geometry and still rejects writable buffer or replacement mutations',()=>{
  const r=structuredClone(base);prepareOwnedGeography47(r);assertForceGeography47(r.diplomaticGeography,r);
  const snapshot=copyGeographyContent47({elevations:r.terrain.elevations})!;
  const next=cloneMilitaryCandidate47(r);expect(next.world).not.toBe(r.world);expect(next.world.provinces[0]).not.toBe(r.world.provinces[0]);expect(next.diplomaticGeography).toBe(r.diplomaticGeography);expect(Object.isFrozen(next.world.provinces[0].polygon)).toBe(true);
  next.world.provinces[0].controller='changed';expect(r.world.provinces[0].controller).not.toBe('changed');
  new Int32Array(r.terrain.elevations.buffer)[0]=25;expect(sameGeographyContent47({elevations:r.terrain.elevations},snapshot.value)).toBe(false);expect(()=>assertForceGeography47(r.diplomaticGeography,r)).toThrow();
  r.terrain.elevations[0]=base.terrain.elevations[0];next.world.provinces[0].polygon=next.world.provinces[0].polygon.map((p,i)=>i?{...p}:{...p,x:p.x+.1});expect(()=>assertForceGeography47(next.diplomaticGeography,next)).toThrow();
  expect(()=>assertForceGeography47(r.diplomaticGeography,r)).not.toThrow();
 });
 it('matches the original validator after cloning and ownership changes',()=>{
  assertForceGeography47(base.diplomaticGeography,base);
  const next=structuredClone(base);next.world.day++;next.world.provinces[0].controller=next.world.nations[1].id;
  expect(()=>assertForceGeography47(next.diplomaticGeography,next)).not.toThrow();expect(()=>assertDiplomaticGeography(next.diplomaticGeography,next)).not.toThrow();
 });
 it.each(['elevation','coast','neighbors','partition','area','center','unknown','missing','boxed'] as const)('does not trust a cached same-ID record after %s mutation',kind=>{
  assertForceGeography47(base.diplomaticGeography,base);const r=structuredClone(base);
  if(kind==='elevation')r.terrain.elevations[0]=25;
  if(kind==='coast')r.world.provinces[0].polygon[0].x+=.1;
  if(kind==='neighbors')r.world.provinces[0].neighbors=[];
  if(kind==='partition')r.diplomaticGeography.water[0].faces.pop();
  if(kind==='area')r.diplomaticGeography.water[0].area*=1.1;
  if(kind==='center')r.diplomaticGeography.water[0].center.x=NaN;
  if(kind==='unknown')Object.assign(r.diplomaticGeography,{future:undefined});
  if(kind==='missing')Object.assign(r.diplomaticGeography.water[0],{area:undefined});
  if(kind==='boxed')Object.assign(r.diplomaticGeography.water[0].center,{x:Object(r.diplomaticGeography.water[0].center.x)});
  expect(()=>assertDiplomaticGeography(r.diplomaticGeography,r)).toThrow();expect(()=>assertForceGeography47(r.diplomaticGeography,r)).toThrow();
  expect(()=>assertForceGeography47(base.diplomaticGeography,base)).not.toThrow();
 });
});
