import * as legacy from '../../compat/v0_4/sim/core';
import { militaryRules, mobilizationFingerprint,navalFingerprint } from './military-registry';
import { formStartingUnits, initialUnitAssignments } from './compat/mobilization1/fms/play/military-actions';
import type { MilitaryAction } from './military-actions';
import type { StateVersion } from '../../sim/types';
import type { FmsRun } from './world';
import { mobilize } from './mobilization';
import { mobilize as legacyMobilize } from './compat/mobilization1/fms/play/mobilization';
import { seaGraph,type SeaGraph } from './sea-path';
import { advanceNavy,moveNavy } from './navy';
import {initialNavy as oldInitialNavy,advanceNavy as oldAdvanceNavy} from './compat/naval1/fms/play/navy';
import {seaGraph as oldSeaGraph} from './compat/naval1/fms/play/sea-path';
import {mobilize as oldNavalMobilize} from './compat/naval1/fms/play/mobilization';
import {createMilitaryCore} from './military-core';
import {TICKS_PER_DAY} from './clock';
export function playRules(run:FmsRun){return run.version===1?legacy:militaryRules(run.engine,run.units);}
export function withMilitary(run:FmsRun,copy=false):Extract<FmsRun,{version:2}>{
  const cloned=structuredClone(run),formed=copy?{world:cloned.world,units:cloned.version!==1?cloned.units:initialUnitAssignments(cloned.world)}:formStartingUnits(cloned.world);
  const id=copy?`fms-${crypto.randomUUID()}`:run.id;
  formed.world.custom!.id=id;
  return {terrain:cloned.terrain,scale:cloned.scale,...formed,id,version:2,rules:'fms-military-1',engine:mobilizationFingerprint};
}
export function withNavy(run:FmsRun,copy=false):Extract<FmsRun,{version:3}>{
  const base=withMilitary(run,copy),formed=copy?{world:base.world,navy:{version:1 as const,fleets:[]}}:oldInitialNavy(base.world,oldSeaGraph(base.terrain,base.world));
  return {...base,...formed,version:3,rules:'fms-naval-1',engine:navalFingerprint};
}
export function withRealtime(run:FmsRun,copy=false):Extract<FmsRun,{version:4}>{
  const base=run.version===3||run.version===4?structuredClone(run):withNavy(run,copy);
  const id=copy?`fms-${crypto.randomUUID()}`:base.id;base.world.custom!.id=id;
  return {...base,id,version:4,rules:'fms-realtime-1',engine:__FMS_PLAY_ENGINE__,clock:{version:1,tick:run.version===4?run.clock.tick:base.world.day*TICKS_PER_DAY}};
}
export function advanceRunTick(run:Extract<FmsRun,{version:4}>,graph:SeaGraph=seaGraph(run.terrain,run.world)):Extract<FmsRun,{version:4}>{
  const clock={version:1 as const,tick:run.clock.tick+1},core=createMilitaryCore(run.units,true);
  const naval=moveNavy(run.world,run.navy,graph,1/TICKS_PER_DAY);
  let next={...run,...naval,world:core.advanceMovement(naval.world,1/TICKS_PER_DAY),clock};
  if(clock.tick%TICKS_PER_DAY===0){
    const formed=mobilize(next.world,next.units),first=formed.world.nextEventId;
    const provisioned=advanceNavy(formed.world,next.navy,graph,false);
    const world=createMilitaryCore(formed.units,true).settleDay(provisioned.world);
    for(const event of world.events)if(event.id>=first&&event.id<provisioned.world.nextEventId)event.day=world.day;
    next={...next,...formed,...provisioned,world};
  }return next;
}
export function stepRunDay(run:FmsRun):FmsRun {
  if(run.version===4){let next=run;const graph=seaGraph(run.terrain,run.world);for(let i=0;i<TICKS_PER_DAY;i++)next=advanceRunTick(next,graph);return next;}
  const prepared=run.version===3?{...run,...oldNavalMobilize(run.world,run.units)}:run.version===2&&run.engine===mobilizationFingerprint?{...run,...legacyMobilize(run.world,run.units)}:run;
  if(prepared.version===3){
    const first=prepared.world.nextEventId,naval=oldAdvanceNavy(prepared.world,prepared.navy,oldSeaGraph(prepared.terrain,prepared.world));
    const world=playRules(prepared).advanceWorld(naval.world,1);
    // The land core requires input events <= its input day. Date the naval
    // daily events only after that core has atomically completed the new day.
    for(const event of world.events)if(event.id>=first&&event.id<naval.world.nextEventId)event.day=world.day;
    return {...prepared,...naval,world};
  }
  return {...prepared,world:playRules(prepared).advanceWorld(prepared.world,1)};
}
export function executeMilitary(run:FmsRun,action:MilitaryAction,expected:StateVersion):FmsRun{
  if(run.version===1)throw new Error('旧世界保留旧规则；请先创建新版推演副本。');
  return {...run,...militaryRules(run.engine,run.units).applyMilitaryAction(run.world,run.units,action,expected)};
}
