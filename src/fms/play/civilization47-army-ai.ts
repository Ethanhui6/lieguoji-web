import {assertArmyBatch47,consumeArmyBatch47} from './army-batch47';
import {provinceBorderReader54,stateBorderReader55} from './province-border54';
import type {FoundingForces47} from './civilization47-forces';
import {nativeRegularTarget47,type RegularTarget47} from './native-war/army-target47';
import {assertArmyAutonomy47,type ArmyDecision47} from './civilization47-army-ai-state';
import {actualForces47} from './force-runtime47';
import {readArmySpace47,landHolders47} from './army-space47';
import {armyTravelLocation47} from './army-travel47-state';
import {locateTravelCell47,type TravelGraph47} from './army-travel47-graph';
import {previewArmyCommand47,issueArmyOrderOwned47,createArmyCommandSearch47,type ArmyRouteWeights47,type ArmyCommand47} from './army-commands47';
import {militaryAccess46} from './war46-access';
import {nationsAtWar} from './realtime-statecraft';
import {forceKey47} from './force-motion47';
import {settleCivilizationDay47,settleSessionCivilizationDay47} from './civilization47-daily';
import type {SessionAdvanceLease47} from './session-advance47';
import {TICKS_PER_DAY} from './clock';
import {armyPreviewTicks47} from './army-route-budget47';
import {actualForceSpeed47} from './force-speed47';
import {marchingRation47} from './logistics-clock47';
import {nativeIdleArmyPools,nativeChooseIdleArmy} from './native-war/army-deployment';

/** Stable WEB draw per army and assignment epoch. Native selection weights
 * are reused; Unity's global RNG is not claimed. The chosen target is saved. */
function garrisonRandom47(seed:string){let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h=(h+0x6d2b79f5)|0;let t=Math.imul(h^(h>>>15),h|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}

const featureCache=new WeakMap<TravelGraph47,Map<number,string>>();
/** Explicit WEB Feature mapping: positive-width same-surface connectivity.
 * Never use ownership, a water district ID, or connect land through sea. */
/** Province center cell feature and coast flags depend only on the immutable
 * travel graph and fixed province centers; computed once per graph. */
const provinceGeographyCache=new WeakMap<TravelGraph47,{key:string;coasts:Set<string>;provinceFeatures:Map<string,string>}>();
function provinceGeography47(r:FoundingForces47,g:TravelGraph47,features:Map<number,string>){
  const key=r.world.provinces.map(p=>p.id+'@'+p.center.x+','+p.center.y).join('|'),cached=provinceGeographyCache.get(g);if(cached?.key===key)return cached;
  const coasts=new Set<string>(),provinceFeatures=new Map<string,string>();
  for(const p of r.world.provinces){const cell=locateTravelCell47(g,p.center,p.id);if(!cell)throw Error('自主目标中心不在真实陆地。');provinceFeatures.set(p.id,features.get(cell.id)!);
    if((g.byProvince.get(p.id)??[]).some(id=>g.cells.get(id)!.links.some(l=>g.cells.get(l.to)!.surface==='sea')))coasts.add(p.id);
  }
  const out={key,coasts,provinceFeatures};provinceGeographyCache.set(g,out);return out;
}
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
  if(r.armyBatch){assertArmyBatch47(r);r.armyAutonomy.lastDay=r.world.day;assertArmyAutonomy47(r);return undefined;}
  return issueArmySelection47(r,weights);
}
/** Real per-frame orders. The native rotation chooses calls; existing WEB
 * target, ration and diplomacy policies remain explicit adaptations. */
export function issueArmyBatchOrders47(r:FoundingForces47,weights:ArmyRouteWeights47):boolean{
  if(!r.armyBatch)return false;
  const ids=consumeArmyBatch47(r);
  if(!ids.length)return false;
  issueArmySelection47(r,weights,ids);return true;
}
function issueArmySelection47(r:FoundingForces47,weights:ArmyRouteWeights47,ids?:readonly string[]):undefined{
  const protruding=provinceBorderReader54(r);
  const stateBorders=stateBorderReader55(r);
  assertArmyAutonomy47(r);const state=r.armyAutonomy;
  if((!ids&&r.clock.tick!==r.world.day*TICKS_PER_DAY)||r.clock.tick>Number.MAX_SAFE_INTEGER-TICKS_PER_DAY||state.revision>=Number.MAX_SAFE_INTEGER)throw Error('自主军令必须在有效日界执行。');
  if(!ids&&state.lastDay===r.world.day)return undefined;
  const {spatial}=actualForces47(r),g=spatial.graph,features=travelFeatures47(g),space=readArmySpace47(r.world,spatial),access=militaryAccess46(r),held=new Set(r.forceContacts.pairs.flatMap(p=>[p.a,p.b]));
  const places=new Map(r.world.provinces.map(p=>[p.id,p])),ports=new Set(r.harbors.sites.map(p=>p.provinceId)),{coasts,provinceFeatures}=provinceGeography47(r,g,features);
  const enemyMaps=new Map(r.world.nations.map(n=>[n.id,regularCampaigns47(r,n.id)]));
  const retry=ids?20:TICKS_PER_DAY;
  for(const a of ids?ids.map(id=>r.world.armies.find(a=>a.id===id)!):r.world.armies){
    const row=state.armies[a.id],here=space.byArmy.get(a.id),enemies=enemyMaps.get(a.nationId)!;
    const note=(decision:ArmyDecision47['decision'],reason:string,clear=false)=>{row.decision=decision;row.reason=reason;row.nextTick=r.clock.tick+retry;if(clear){row.targetId=null;row.campaignId=null;row.issuedTick=null;}};
    // Stop only where the shared command rules allow it: an enemy army in this
    // province forbids halting (retreat or fight only), so the march continues.
    const halt=(search?:ReturnType<typeof createArmyCommandSearch47>)=>{const action:ArmyCommand47={type:'army-halt',armyId:a.id};if(previewArmyCommand47(r,action,weights,search).valid)issueArmyOrderOwned47(r,action,weights,'autonomous',search);};
    if(enemies.size||row.garrisonId!==null&&places.get(row.garrisonId)?.controller!==a.nationId)row.garrisonId=null;
    if(!here){row.garrisonId=null;note('lost','部队已失去战斗力，保留既有军令历史。',true);continue;}
    if(r.voyages.manualArmies.includes(a.id)){row.garrisonId=null;note('manual','玩家已接管，自主指挥保留其军令。',true);continue;}
    if(held.has(forceKey47({kind:'army',id:a.id}))||a.status==='fighting'||r.reorganization.active[a.id]){note('busy','正在实际交锋或整编，保留当前任务。');continue;}
    if(r.clock.tick<row.nextTick)continue;
    const enemyAt=(id:string)=>landHolders47(space,id).find(b=>enemies.has(b.nationId));
    const target=row.targetId===null?null:places.get(row.targetId),targetEnemy=target&&(enemies.has(target.controller)?target.controller:access(r.world,a.nationId,target.controller)?enemyAt(target.id)?.nationId:undefined);
    const ongoing=here.travel.status==='moving',low=a.supplies<35||a.morale<50||a.troops<=180;
    // Unknown/handed-back moving routes are preserved. Known offensive goals
    // are reselected only after capture/peace; their remaining travel is not reset daily.
    if(ongoing&&!(low&&here.province?.controller===a.nationId)&&(!row.targetId||targetEnemy||row.decision==='returning'&&target?.controller===a.nationId||row.decision==='staging'&&target?.controller===a.nationId&&enemies.size>0||row.garrisonId===target?.id&&target?.controller===a.nationId&&enemies.size===0||a.status==='retreating')){
      if(row.garrisonId===target?.id&&target?.controller===a.nationId&&!enemies.size)note('garrison','正在沿原定路线前往驻地，保留既有行军进度。');
      else row.nextTick=r.clock.tick+retry;
      continue;
    }
    if(a.status!=='retreating'&&here.province&&nationsAtWar(r.world,a.nationId,here.province.controller)){note('busy','部队已在敌方真实陆地，等待交锋或地区抵抗结算。');continue;}
    if(low&&here.province?.controller===a.nationId){
      if(ongoing)halt();
      note('resting','军粮、士气或兵力不足，在当前本国陆地休整。',true);continue;
    }
    const attackIds=new Set<string>(),owned=r.world.provinces.filter(p=>p.controller===a.nationId),invaded=owned.filter(p=>enemyAt(p.id));
    if(!low&&a.status!=='retreating'&&enemies.size){
      for(const p of invaded)attackIds.add(p.id);
      for(const id of stateBorders(a.nationId,new Set(enemies.keys())))attackIds.add(id);
      // Ally assistance never inherits another state's wars. This is an
      // explicit access-and-current-enemy bridge, not native ally eligibility.
      if(!invaded.length)for(const p of r.world.provinces)if(p.controller!==a.nationId&&access(r.world,a.nationId,p.controller)){
        if(enemyAt(p.id))attackIds.add(p.id);for(const id of p.neighbors)if(enemies.has(places.get(id)!.controller))attackIds.add(id);
      }
      for(const p of r.world.provinces)if(enemies.has(p.controller)&&coasts.has(p.id))attackIds.add(p.id);
    }
    const search=createArmyCommandSearch47(r,weights,a.id);
    const location=armyTravelLocation47(here.travel,g),home=places.get(r.tactics.forces[a.id].homeId);if(!home)throw Error('自主军令缺少真实故乡。');
    let candidates:RegularTarget47[]=[...attackIds].map(id=>({id,center:places.get(id)!.center,feature:provinceFeatures.get(id)!,protruding:protruding(id),port:ports.has(id)}));
    let chosen:RegularTarget47|null=null,reason='';
    const unfunded:{target:RegularTarget47;preview:ReturnType<typeof previewArmyCommand47>}[]=[];
    const rationCost=(preview:ReturnType<typeof previewArmyCommand47>)=>marchingRation47*(Math.ceil(armyPreviewTicks47(preview,g,cell=>actualForceSpeed47(r,{kind:'army',id:a.id,nationId:a.nationId,withdrawing:false,travel:here.travel},cell))/TICKS_PER_DAY)+3);
    while(candidates.length){const p=nativeRegularTarget47(location.point,home.center,features.get(location.cell.id)!,candidates);if(!p)break;
      const action:ArmyCommand47={type:'army-move',armyId:a.id,target:{kind:'province',id:p.id},kind:'march'},preview=previewArmyCommand47(r,action,weights,search);
      if(preview.valid){
        // WEB ration policy: time-normalized march cost plus three days of
        // reserve. Retreat remains best-effort; this does not promise battle supply.
        if(a.supplies>=rationCost(preview)){issueArmyOrderOwned47(r,action,weights,'autonomous',search);chosen=p;break;}
        // A landing need only reach real hostile land, not march to the city
        // center on the same rations. Province occupation already reads cells.
        if(preview.hasSea){
          const shores=(g.byProvince.get(p.id)??[]).map(id=>g.cells.get(id)!).filter(c=>c.links.some(l=>g.cells.get(l.to)!.surface==='sea')).sort((a,b)=>Math.hypot(a.center.x-here.point.x,a.center.y-here.point.y)-Math.hypot(b.center.x-here.point.x,b.center.y-here.point.y)).slice(0,4);
          for(const cell of shores){const landing:ArmyCommand47={...action,target:{kind:'cell',id:cell.id}},route=previewArmyCommand47(r,landing,weights,search);if(route.valid&&a.supplies>=rationCost(route)){issueArmyOrderOwned47(r,landing,weights,'autonomous',search);chosen=p;break;}}
          if(chosen)break;
        }
        unfunded.push({target:p,preview});reason='现有军粮不足以走完这条路线并保留三日余粮。';candidates=candidates.filter(v=>v!==p);continue;
      }
      reason=preview.reason;candidates=candidates.filter(v=>v!==p);
    }
    if(chosen){const p=places.get(chosen.id)!,enemy=enemies.has(p.controller)?p.controller:enemyAt(p.id)!.nationId;row.targetId=p.id;row.campaignId=enemies.get(enemy)!;row.issuedTick=r.clock.tick;
      note(p.controller===a.nationId||access(r.world,a.nationId,p.controller)?'supporting':'attacking','按原目标优先级选定真实陆地，并通过当前外交通行和海陆路径校验。');continue;
    }
    // WEB logistics bridge: an inland force first rallies toward its preferred
    // target on safe, stocked home land. Arrival/refill use the real travel and
    // daily economy; never grant food or jump to a coastal staging point.
    if(unfunded.length&&here.province?.controller===a.nationId){
      const route=unfunded[0].preview,water=route.cells.findIndex(id=>g.cells.get(id)!.surface==='sea');
      const stocked=new Set(owned.filter(p=>!enemyAt(p.id)&&r.world.statecraft!.provinces.some(stock=>stock.provinceId===p.id&&stock.grain>stock.population)).map(p=>p.id));
      // Follow an affordable prefix of the chosen real route, stopping before
      // water. Avoid searching every map cell or rerouting daily mid-march.
      const stages=route.cells.slice(1,water<0?undefined:water).map((id,index)=>({cell:g.cells.get(id)!,index:index+1})).reverse().filter(({cell,index})=>stocked.has(cell.provinceId!)&&a.supplies>=rationCost({...route,cells:route.cells.slice(0,index+1),points:route.points.slice(0,2*index+1)}));
      let staged=false;
      for(const {cell:p} of stages){const action:ArmyCommand47={type:'army-move',armyId:a.id,target:{kind:'cell',id:p.id},kind:'march'},preview=previewArmyCommand47(r,action,weights,search);
        if(!preview.valid||preview.hasSea||a.supplies<rationCost(preview))continue;
        issueArmyOrderOwned47(r,action,weights,'autonomous',search);row.targetId=p.provinceId!;row.campaignId=null;row.issuedTick=r.clock.tick;note('staging','远征粮程不足，先在本国向前集结，抵达后从当地补给再评估。');staged=true;break;
      }
      if(staged)continue;
    }
    // Restore the native Idle -> FindTargetIdleProvince branch for peaceful
    // armies. Keep valid assignments, honor manual/food/combat checks above,
    // and execute the same real route as a player order; never jump a unit.
    if(!enemies.size&&here.province?.controller===a.nationId){
      let id=row.garrisonId;
      if(!id){
        const capital=r.world.cities.find(c=>c.id===r.world.nations.find(n=>n.id===a.nationId)!.capitalId),cp=capital?places.get(capital.provinceId):undefined;
        const area=new Set(cp?.controller===a.nationId?[cp.id,...cp.neighbors.filter(id=>places.get(id)?.controller===a.nationId)]:[]);
        const inputs=owned.map(p=>{const neighbors=p.neighbors.map(id=>places.get(id)!);return{id:p.id,capitalArea:area.has(p.id),border:coasts.has(p.id)||neighbors.some(n=>n.controller!==a.nationId),land:true,coastal:coasts.has(p.id),allyNeighbor:neighbors.some(n=>n.controller!==a.nationId&&access(r.world,a.nationId,n.controller)),foreignLandNeighbor:neighbors.some(n=>n.controller!==a.nationId),targeting:r.world.armies.filter(b=>b.troops>0&&state.armies[b.id].garrisonId===p.id).length};});
        id=nativeChooseIdleArmy(nativeIdleArmyPools(inputs),owned.some(p=>p.id===home.id)?home.id:null,owned.map(p=>p.id),garrisonRandom47(`${r.world.custom!.seed}/${a.id}/${r.world.day}/garrison47`));
      }
      if(id){
        row.garrisonId=id;
        if(here.province.id===id){if(ongoing)halt(search);row.targetId=id;row.campaignId=null;row.issuedTick??=r.clock.tick;note('garrison','驻守已分配的本国地区，保留驻地，不每天重抽。');continue;}
        const action:ArmyCommand47={type:'army-move',armyId:a.id,target:{kind:'province',id},kind:'march'},preview=previewArmyCommand47(r,action,weights,search);
        if(preview.valid&&a.supplies>=rationCost(preview)){issueArmyOrderOwned47(r,action,weights,'autonomous',search);row.targetId=id;row.campaignId=null;row.issuedTick=r.clock.tick;note('garrison','按原作首都圈与边境驻防权重部署，沿真实路线前往驻地。');continue;}
        reason=preview.valid?'前往既定驻地的粮程不足，补给后重试。':preview.reason;
      }
    }
    // No feasible new task at home: keep the exact position. Outside home,
    // choose a reachable owned province; never jump to the historical anchor.
    if(here.province?.controller===a.nationId){if(ongoing)halt(search);note(attackIds.size?'no-route':'waiting',reason||'当前没有可执行的常规战争目标，留在本国驻地。',true);continue;}
    const homes=[...owned].sort((x,y)=>Math.hypot(x.center.x-here.point.x,x.center.y-here.point.y)-Math.hypot(y.center.x-here.point.x,y.center.y-here.point.y));let returning=false;
    for(const p of homes){const action:ArmyCommand47={type:'army-move',armyId:a.id,target:{kind:'province',id:p.id},kind:'retreat'},preview=previewArmyCommand47(r,action,weights,search);if(!preview.valid){reason=preview.reason;continue;}
      issueArmyOrderOwned47(r,action,weights,'autonomous',search);row.targetId=p.id;row.campaignId=null;row.issuedTick=r.clock.tick;note('returning',low?'部队状态不足，从实际位置撤回本国。':'原目标已结束，从实际位置撤回本国。');returning=true;break;
    }
    if(!returning){if(ongoing&&(!here.province||!nationsAtWar(r.world,a.nationId,here.province.controller)))halt(search);note('no-route',reason||'暂时没有符合当前通行权的返乡路线，保留实际位置。',true);}
  }
  state.lastDay=r.world.day;state.revision++;assertArmyAutonomy47(r);return undefined;
}
/** Army-autonomy daily owner, not the complete political/naval/save session. */
export function settleArmyAutonomyDay47<T extends FoundingForces47>(input:T,weights:ArmyRouteWeights47):T{
  return settleCivilizationDay47(input,owned=>issueAutonomousArmyOrders47(owned,weights));
}
export function settleSessionArmyAutonomyDay47(lease:SessionAdvanceLease47,weights:ArmyRouteWeights47){
  return settleSessionCivilizationDay47(lease,owned=>issueAutonomousArmyOrders47(owned,weights));
}
