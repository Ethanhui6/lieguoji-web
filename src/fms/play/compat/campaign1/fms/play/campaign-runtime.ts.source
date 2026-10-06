import {maritimeView,tacticsWrap} from './tactics-model';
import {tacticsView,campaignWrap,type CampaignRun} from './campaign-model';
import {advanceTacticsSeaTick} from './tactics-sea';
import type {SeaGraph} from './sea-path';
import {advanceNavy,moveNavy} from './navy';
import {advanceCombat,reconcileCombat} from './tactics-battle';
import {advanceTacticsOccupation,dueCombatRounds} from './tactics-occupation';
import {reconcileOccupation} from './occupation';
import {createMilitaryCore} from './tactics-core';
import {provisionCargo,type ExpeditionRun} from './transport';
import {regularMuster} from './tactics-muster';
import {progressReorganization,startReorganization} from './reorganization';
export function advanceCampaignTick(run:CampaignRun,g:SeaGraph):CampaignRun{
 const {terrain,...state}=run,prepared={...structuredClone(state),terrain};progressReorganization(prepared);
 const metadata=prepared.tactics;
 const maritime=advanceTacticsSeaTick(maritimeView(tacticsView(prepared)),g,(base,g)=>{
  const clock={version:1 as const,tick:base.clock.tick+1},naval=moveNavy(base.world,base.navy,g,1/120);let due=new Set<string>();
  let n:ExpeditionRun={...base,...naval,...advanceCombat(naval.world,base.battles,base.units,clock.tick,w=>(due=dueCombatRounds(w,metadata,clock.tick,base.occupation))),clock};
  n={...n,...advanceTacticsOccupation(n.world,n.occupation,n.units,clock.tick,due,metadata.unopposed)};
  n={...n,...reconcileCombat(n.world,n.battles,clock.tick)};
  if(clock.tick%120===0){const first=n.world.nextEventId,provisioned=advanceNavy(n.world,n.navy,g,false),passengers=provisionCargo(provisioned.world,provisioned.navy,n.units,n.transports),world=createMilitaryCore(passengers.units,true,true).settleDay(passengers.world);
   for(const e of world.events)if(e.id>=first&&e.id<passengers.world.nextEventId)e.day=world.day;
   n={...n,...provisioned,...passengers,...reconcileCombat(world,n.battles,clock.tick)};
  }
  return {...n,...reconcileOccupation(n.world,n.occupation)};
 });
 let result=campaignWrap(tacticsWrap(maritime,metadata),prepared.reorganization);startReorganization(prepared,result);
 result={...result,...reconcileCombat(result.world,result.battles,result.clock.tick)};
 if(result.clock.tick%120===0&&result.world.day%30===0)result=campaignWrap(regularMuster(tacticsView(result)),result.reorganization);
 return result;
}
