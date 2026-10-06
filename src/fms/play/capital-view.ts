import type {World} from '../../sim/types';

/** A historical capital reference is not evidence of a currently held capital.
 * Keep the city and nation in saved history; only its visible capital status ends. */
export function currentCapital(world:World,nationId:string){
  const nation=world.nations.find(n=>n.id===nationId);
  const city=world.cities.find(c=>c.id===nation?.capitalId);
  return city&&world.provinces.some(p=>p.id===city.provinceId&&p.controller===nationId)?city:undefined;
}
export function countryFocus(world:World,nationId:string){
  const capital=currentCapital(world,nationId);
  if(capital)return {provinceId:capital.provinceId,position:capital.position};
  const province=world.provinces.find(p=>p.controller===nationId);
  return province?{provinceId:province.id,position:province.center}:undefined;
}
