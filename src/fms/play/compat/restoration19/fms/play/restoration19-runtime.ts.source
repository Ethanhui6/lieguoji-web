import {chargeReorganizations,settleFiscalMonth,type TerrainContext} from './restoration19-state';
import {reconcileUpper} from './upper14-state';
/** v14 native upper-combat adapter; daily supply remains the frozen web model. */
import {maritimeView,tacticsWrap} from './tactics-model';
import {tacticsView,campaignWrap,type CampaignRun} from './campaign-model';
import {advanceTacticsSeaTick} from './tactics-sea';
import type {SeaGraph} from './sea-path';
import {advanceNavy,moveNavy} from './navy';
import {advanceCombat,reconcileCombatOwned} from './restoration19-battle';
import {advanceTacticsOccupation,dueCombatRounds} from './fiscal15-occupation';
import {reconcileOccupation} from './occupation';
import {createMilitaryCore} from './restoration19-core';
import {provisionCargo,type ExpeditionRun} from './transport';
import {regularMuster} from './tactics-muster';
import {progressReorganization,startReorganization} from './reorganization';
export function advanceRestoration19Tick(run:CampaignRun,g:SeaGraph,terrainContext:TerrainContext):CampaignRun{
 const {terrain,world,...state}=run,prepared={...structuredClone(state),world:structuredClone({...world,provinces:[]}) as typeof world,terrain};prepared.world.provinces=world.provinces.map(p=>({...p}));progressReorganization(prepared);chargeReorganizations(run.reorganization.completed,{...prepared,upperCombat:terrainContext.upper,people:terrainContext.people,culture:terrainContext.culture},terrainContext.finance);
 const metadata=prepared.tactics;
 const maritime=advanceTacticsSeaTick(maritimeView(tacticsView(prepared)),g,(base,g)=>{
  const clock={version:1 as const,tick:base.clock.tick+1},naval=moveNavy(base.world,base.navy,g,1/120);let due=new Set<string>();
  let n:ExpeditionRun={...base,...naval,...advanceCombat(naval.world,base.battles,base.units,clock.tick,w=>(due=dueCombatRounds(w,metadata,clock.tick,base.occupation)),terrainContext),clock};
  n={...n,...advanceTacticsOccupation(n.world,n.occupation,n.units,clock.tick,due,metadata.unopposed,terrainContext)};
  n={...n,...reconcileCombatOwned(n.world,n.battles,clock.tick)};
  if(clock.tick%120===0){const first=n.world.nextEventId,provisioned=advanceNavy(n.world,n.navy,g,false),passengers=provisionCargo(provisioned.world,provisioned.navy,n.units,n.transports),world=createMilitaryCore(passengers.units,true,true,terrainContext,w=>settleFiscalMonth({...n,...passengers,world:w,upperCombat:terrainContext.upper,reorganization:prepared.reorganization,people:terrainContext.people,culture:terrainContext.culture},terrainContext.finance)).settleDay(passengers.world);
   for(const e of world.events)if(e.id>=first&&e.id<passengers.world.nextEventId)e.day=world.day;
   n={...n,...provisioned,...passengers,...reconcileCombatOwned(world,n.battles,clock.tick)};
  }
  return {...n,...reconcileOccupation(n.world,n.occupation)};
 });
 let result=campaignWrap(tacticsWrap(maritime,metadata),prepared.reorganization);startReorganization(prepared,result);
 result={...result,...reconcileCombatOwned(result.world,result.battles,result.clock.tick)};
 if(result.clock.tick%120===0&&result.world.day%30===0)result=campaignWrap(regularMuster(tacticsView(result)),result.reorganization);
 reconcileUpper(result,terrainContext.upper,Object.entries(result.reorganization.active).filter(([,state])=>state.startedTick===result.clock.tick).map(([id])=>id));
 return result;
}
