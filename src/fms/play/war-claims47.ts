import type {Point,Province,World} from '../../sim/types';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import type {War46Campaign} from './war47-wars';
import {territoryLabels} from './territory-labels';

/** State.polePos: the interior point of the state's largest territory that is
 * farthest from its border — the web places the country name there too. */
export function nationPoles47(world:World):Map<string,Point>{
  const best=new Map<string,{point:Point;area:number}>();
  for(const label of territoryLabels(world)){const old=best.get(label.nationId);if(!old||label.area>old.area)best.set(label.nationId,{point:label.point,area:label.area});}
  return new Map([...best].map(([id,v])=>[id,v.point]));
}
/** WarClaimResolverV2.CollectWarClaims (AppendGoalClaims): the provinces the war goals
 * claim — the goal scope for ceding/occupation goals, the target's whole land for annexation. */
export function warClaimProvinces47(r:PoliticalRun47,c:War46Campaign):Province[]{
  const seen=new Set<string>(),out:Province[]=[];
  const add=(p:Province|undefined)=>{if(p&&!seen.has(p.id)){seen.add(p.id);out.push(p);}};
  const nationOf=(stateId:number)=>r.nativeWars.nationIds.find(row=>row[0]===stateId)?.[1];
  for(const g of c.goals){
    if(g.type===3){const target=nationOf(g.target);if(target)for(const p of r.world.provinces)if(p.controller===target)add(p);continue;}
    for(const id of g.scope?.provinceIds??[])add(r.world.provinces.find(p=>p.id===r.nativeWars.provinceIds[id-1]));
  }
  return out;
}
