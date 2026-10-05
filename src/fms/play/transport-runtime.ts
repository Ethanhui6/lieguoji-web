import type {FmsRun} from './world';
import {assertFmsRun} from './world';
import type {SeaGraph} from './sea-path';
import {seaGraph} from './sea-path';
import {moveNavy,advanceNavy} from './navy';
import {advanceCombat,reconcileCombat} from './battle';
import {advanceOccupation,reconcileOccupation} from './occupation';
import {createMilitaryCore} from './military-core';
import {mobilizeWithCargo,provisionCargo,initialTransports,type ExpeditionRun} from './transport';
import {TICKS_PER_DAY} from './clock';

export function withTransport(run:Extract<FmsRun,{version:6}>,copy=false):ExpeditionRun{
  const n=structuredClone(run);if(copy){n.id='fms-'+crypto.randomUUID();n.world.custom!.id=n.id;}
  return {...n,version:7,rules:'fms-transport-1',engine:__FMS_PLAY_ENGINE__,transports:initialTransports()};
}
export function advanceTransportTick(run:ExpeditionRun,g:SeaGraph=seaGraph(run.terrain,run.world)):ExpeditionRun{
  const clock={version:1 as const,tick:run.clock.tick+1},naval=moveNavy(run.world,run.navy,g,1/TICKS_PER_DAY);
  let n:ExpeditionRun={...run,...naval,...advanceCombat(naval.world,run.battles,run.units,clock.tick),clock};
  const owners=n.world.provinces.map(p=>p.controller);n={...n,...advanceOccupation(n.world,n.occupation,n.units,clock.tick)};
  if(n.world.provinces.some((p,i)=>p.controller!==owners[i]))n={...n,...reconcileCombat(n.world,n.battles,clock.tick)};
  if(clock.tick%TICKS_PER_DAY===0){
    const formed=mobilizeWithCargo(n.world,n.units,n.transports),first=formed.world.nextEventId,provisioned=advanceNavy(formed.world,n.navy,g,false);
    const passengers=provisionCargo(provisioned.world,provisioned.navy,formed.units,n.transports),world=createMilitaryCore(passengers.units,true,true).settleDay(passengers.world);
    for(const e of world.events)if(e.id>=first&&e.id<passengers.world.nextEventId)e.day=world.day;
    n={...n,...formed,...provisioned,...passengers,...reconcileCombat(world,n.battles,clock.tick)};
  }
  n={...n,...reconcileOccupation(n.world,n.occupation)};return n;
}
export function occupationBase(run:ExpeditionRun):Extract<FmsRun,{version:6}>{const {transports,...rest}=run;void transports;return {...rest,version:6,rules:'fms-occupation-1'};}
export function checkedTransport(run:ExpeditionRun){assertFmsRun(run);return {world:run.world,run};}
