import type {FoundingForces47} from './civilization47-forces';
import {nativeRegularTarget47,type RegularTarget47} from './native-war/army-target47';
import {assertArmyAutonomy47,type ArmyDecision47} from './civilization47-army-ai-state';
import {actualForces47} from './force-runtime47';
import {readArmySpace47,landHolders47} from './army-space47';
import {armyTravelLocation47} from './army-travel47-state';
import {locateTravelCell47,type TravelGraph47} from './army-travel47-graph';
import {previewArmyCommand47,issueArmyOrderOwned47,type ArmyRouteWeights47,type ArmyCommand47} from './army-commands47';
import {militaryAccess46} from './war46-access';
import {nationsAtWar} from './realtime-statecraft';
import {forceKey47} from './force-motion47';
import {settleCivilizationDay47} from './civilization47-daily';
import {TICKS_PER_DAY} from './clock';

const featureCache=new WeakMap<TravelGraph47,Map<number,string>>();
/** Explicit WEB Feature mapping: positive-width same-surface connectivity.
 * Never use ownership, a water district ID, or connect land through sea. */
export function travelFeatures47(g:TravelGraph47){
  const cached=featureCache.get(g);if(cached)return cached;const out=new Map<number,string>();let index=0;
  for(const cell of g.cells.values()){if(out.has(cell.id))continue;const feature=cell.surface+'/'+index++,queue=[cell.id];out.set(cell.id,feature);
    for(let i=0;i<queue.length;i++)for(const link of g.cells.get(queue[i])!.links){const to=g.cells.get(link.to)!;if(to.surface===cell.surface&&!out.has(to.id)){out.set(to.id,feature);queue.push(to.id);}}
  }featureCache.set(g,out);return out;
}
/** Current external campaigns are the explicit WEB regular-war bridge;
 * complete native regular/rebel classification remains separately unverified. */
export function regularCampaigns47(r:FoundingForces47,nationId:string){
  const own=r.nativeWars.nationIds.find(v=>v[1]===nationId)?.[0];if(own===undefined)throw Error('自主军令缺少战争国家身份。');
  const ids=new Map(r.nativeWars.nationIds),out=new Map<string,number>();
  for(const c of r.nativeWars.campaigns){if(c.endedTick!==null||c.internal)continue;const p=c.participants.find(p=>p.stateId===own);if(!p)continue;
    for(const enemy of c.participants)if(enemy.side!==p.side){const id=ids.get(enemy.stateId);if(!id)throw Error('自主军令敌国身份缺失。');if(nationsAtWar(r.world,nationId,id)&&!out.has(id))out.set(id,c.id);}
  }return out;
}
/** Synchronous owned daily candidate. Native score/target persistence are
 * reused; web actual contacts, eligibility and food gates are declared bridges.
 * No movement, damage, cargo, war declaration or ownership is written here. */
export function issueAutonomousArmyOrders47(r:FoundingForces47,weights:ArmyRouteWeights47):undefined{
  assertArmyAutonomy47(r);const state=r.armyAutonomy;
  if(r.clock.tick!==r.world.day*TICKS_PER_DAY||r.clock.tick>Number.MAX_SAFE_INTEGER-TICKS_PER_DAY||state.revision>=Number.MAX_SAFE_INTEGER)throw Error('自主军令必须在有效日界执行。');
  if(state.lastDay===r.world.day)return undefined;
  const {spatial}=actualForces47(r),g=spatial.graph,features=travelFeatures47(g),space=readArmySpace47(r.world,spatial),access=militaryAccess46(r),held=new Set(r.forceContacts.pairs.flatMap(p=>[p.a,p.b]));
  const places=new Map(r.world.provinces.map(p=>[p.id,p])),ports=new Set(r.harbors.sites.map(p=>p.provinceId)),coasts=new Set<string>(),provinceFeatures=new Map<string,string>();
  for(const p of r.world.provinces){const cell=locateTravelCell47(g,p.center,p.id);if(!cell)throw Error('自主目标中心不在真实陆地。');provinceFeatures.set(p.id,features.get(cell.id)!);
    if((g.byProvince.get(p.id)??[]).some(id=>g.cells.get(id)!.links.some(l=>g.cells.get(l.to)!.surface==='sea')))coasts.add(p.id);
  }
  const enemyMaps=new Map(r.world.nations.map(n=>[n.id,regularCampaigns47(r,n.id)]));
  for(const a of r.world.armies){
    const row=state.armies[a.id],here=space.byArmy.get(a.id),enemies=enemyMaps.get(a.nationId)!;
    const note=(decision:ArmyDecision47['decision'],reason:string,clear=false)=>{row.decision=decision;row.reason=reason;row.nextTick=r.clock.tick+TICKS_PER_DAY;if(clear){row.targetId=null;row.campaignId=null;row.issuedTick=null;}};
    if(!here){note('lost','部队已失去战斗力，保留既有军令历史。',true);continue;}
    if(r.voyages.manualArmies.includes(a.id)){note('manual','玩家已接管，自主指挥保留其军令。',true);continue;}
    if(held.has(forceKey47({kind:'army',id:a.id}))||a.status==='fighting'||r.reorganization.active[a.id]){note('busy','正在实际交锋或整编，保留当前任务。');continue;}
    if(r.clock.tick<row.nextTick)continue;
    const enemyAt=(id:string)=>landHolders47(space,id).find(b=>enemies.has(b.nationId));
    const target=row.targetId===null?null:places.get(row.targetId),targetEnemy=target&&(enemies.has(target.controller)?target.controller:access(r.world,a.nationId,target.controller)?enemyAt(target.id)?.nationId:undefined);
    const ongoing=here.travel.status==='moving',low=a.supplies<35||a.morale<50||a.troops<=180;
    // Unknown/handed-back moving routes are preserved. Known offensive goals
    // are reselected only after capture/peace; their remaining travel is not reset daily.
    if(ongoing&&!(low&&here.province?.controller===a.nationId)&&(!row.targetId||targetEnemy||row.decision==='returning'&&target?.controller===a.nationId||a.status==='retreating')){row.nextTick=r.clock.tick+TICKS_PER_DAY;continue;}
    if(a.status!=='retreating'&&here.province&&nationsAtWar(r.world,a.nationId,here.province.controller)){note('busy','部队已在敌方真实陆地，等待交锋或地区抵抗结算。');continue;}
    if(low&&here.province?.controller===a.nationId){
      if(ongoing)issueArmyOrderOwned47(r,{type:'army-halt',armyId:a.id},weights,'autonomous');
      note('resting','军粮、士气或兵力不足，在当前本国陆地休整。',true);continue;
    }
    const attackIds=new Set<string>(),owned=r.world.provinces.filter(p=>p.controller===a.nationId),invaded=owned.filter(p=>enemyAt(p.id));
    if(!low&&a.status!=='retreating'&&enemies.size){
      for(const p of invaded)attackIds.add(p.id);
      for(const p of owned)for(const id of p.neighbors)if(enemies.has(places.get(id)!.controller))attackIds.add(id);
      // Ally assistance never inherits another state's wars. This is an
      // explicit access-and-current-enemy bridge, not native ally eligibility.
      if(!invaded.length)for(const p of r.world.provinces)if(p.controller!==a.nationId&&access(r.world,a.nationId,p.controller)){
        if(enemyAt(p.id))attackIds.add(p.id);for(const id of p.neighbors)if(enemies.has(places.get(id)!.controller))attackIds.add(id);
      }
      for(const p of r.world.provinces)if(enemies.has(p.controller)&&coasts.has(p.id))attackIds.add(p.id);
    }
    const location=armyTravelLocation47(here.travel,g),home=places.get(r.tactics.forces[a.id].homeId);if(!home)throw Error('自主军令缺少真实故乡。');
    let candidates:RegularTarget47[]=[...attackIds].map(id=>({id,center:places.get(id)!.center,feature:provinceFeatures.get(id)!,protruding:false,port:ports.has(id)}));
    let chosen:RegularTarget47|null=null,reason='';
    while(candidates.length){const p=nativeRegularTarget47(location.point,home.center,features.get(location.cell.id)!,candidates);if(!p)break;
      const action:ArmyCommand47={type:'army-move',armyId:a.id,target:{kind:'province',id:p.id},kind:'march'},preview=previewArmyCommand47(r,action,weights);
      if(preview.valid){issueArmyOrderOwned47(r,action,weights,'autonomous');chosen=p;break;}
      reason=preview.reason;candidates=candidates.filter(v=>v!==p);
    }
    if(chosen){const p=places.get(chosen.id)!,enemy=enemies.has(p.controller)?p.controller:enemyAt(p.id)!.nationId;row.targetId=p.id;row.campaignId=enemies.get(enemy)!;row.issuedTick=r.clock.tick;
      note(p.controller===a.nationId||access(r.world,a.nationId,p.controller)?'supporting':'attacking','按原目标优先级选定真实陆地，并通过当前外交通行和海陆路径校验。');continue;
    }
    // No new offensive task at home: keep the exact position. Outside home,
    // choose a reachable owned province; never jump to the historical anchor.
    if(here.province?.controller===a.nationId){if(ongoing)issueArmyOrderOwned47(r,{type:'army-halt',armyId:a.id},weights,'autonomous');note(attackIds.size?'no-route':'waiting',reason||'当前没有可执行的常规战争目标，留在本国驻地。',true);continue;}
    const homes=[...owned].sort((x,y)=>Math.hypot(x.center.x-here.point.x,x.center.y-here.point.y)-Math.hypot(y.center.x-here.point.x,y.center.y-here.point.y));let returning=false;
    for(const p of homes){const action:ArmyCommand47={type:'army-move',armyId:a.id,target:{kind:'province',id:p.id},kind:'retreat'},preview=previewArmyCommand47(r,action,weights);if(!preview.valid){reason=preview.reason;continue;}
      issueArmyOrderOwned47(r,action,weights,'autonomous');row.targetId=p.id;row.campaignId=null;row.issuedTick=r.clock.tick;note('returning',low?'部队状态不足，从实际位置撤回本国。':'原目标已结束，从实际位置撤回本国。');returning=true;break;
    }
    if(!returning){if(ongoing&&(!here.province||!nationsAtWar(r.world,a.nationId,here.province.controller)))issueArmyOrderOwned47(r,{type:'army-halt',armyId:a.id},weights,'autonomous');note('no-route',reason||'暂时没有符合当前通行权的返乡路线，保留实际位置。',true);}
  }
  state.lastDay=r.world.day;state.revision++;assertArmyAutonomy47(r);return undefined;
}
/** Army-autonomy daily owner, not the complete political/naval/save session. */
export function settleArmyAutonomyDay47<T extends FoundingForces47>(input:T,weights:ArmyRouteWeights47):T{
  return settleCivilizationDay47(input,owned=>issueAutonomousArmyOrders47(owned,weights));
}
