import type {FoundingForces47} from './civilization47-forces';
import {announce} from './civilization47-history';
import {reconcileCore} from './upper14-state';

/** Live candidate transition after land ownership changes. Native July 2026
 * behavior separates immediate relocation from the later capital-fall crisis.
 * Seat selection below is an explicit web adapter: largest connected surviving
 * holding, prefer legal home cities, then population, distance, stable city ID.
 * It does not claim the native candidate scoring or month-later crisis. */
export function relocateLostCapitals47(r:FoundingForces47):void {
  const provinces=new Map(r.world.provinces.map(p=>[p.id,p]));let changed=false;
  for(const nation of r.world.nations){
    const previous=r.world.cities.find(c=>c.id===nation.capitalId);
    if(!previous||provinces.get(previous.provinceId)?.controller===nation.id)continue;
    const owned=r.world.provinces.filter(p=>p.controller===nation.id);
    if(!owned.length)continue; // Extinction keeps the historical seat, rendered without a live capital icon.
    const sizes=new Map<string,number>(),seen=new Set<string>();
    for(const p of owned){if(seen.has(p.id))continue;const component=[p];seen.add(p.id);
      for(let i=0;i<component.length;i++)for(const id of component[i].neighbors){const q=provinces.get(id);if(q?.controller===nation.id&&!seen.has(id)){seen.add(id);component.push(q);}}
      for(const q of component)sizes.set(q.id,component.length);
    }
    const population=new Map(r.world.statecraft!.provinces.map(p=>[p.provinceId,p.population]));
    const distance=(c:typeof previous)=>(c.position.x-previous.position.x)**2+(c.position.y-previous.position.y)**2;
    const candidates=r.world.cities.filter(c=>provinces.get(c.provinceId)?.controller===nation.id).sort((a,b)=>
      sizes.get(b.provinceId)!-sizes.get(a.provinceId)!||Number(provinces.get(b.provinceId)!.legalOwner===nation.id)-Number(provinces.get(a.provinceId)!.legalOwner===nation.id)||
      population.get(b.provinceId)!-population.get(a.provinceId)!||distance(a)-distance(b)||a.id.localeCompare(b.id));
    const next=candidates[0];if(!next)throw Error('仍有领土的国家没有可用城市，迁都候选未提交。');
    const captor=provinces.get(previous.provinceId)!.controller,by=r.world.nations.find(n=>n.id===captor)!;
    nation.capitalId=next.id;changed=true;
    announce(r.chronicle,r.world,r.clock.tick,'capital',`${nation.name}迁都${next.name}`,
      `旧首都${previous.name}现由${by.name}控制，改以${next.name}为首都。优先选择最大连片控制区内的本土城市，再依人口和距离择址。`,
      [nation.id,captor],next.provinceId);
  }
  if(changed)reconcileCore(r.world,r.upperCombat);
}
