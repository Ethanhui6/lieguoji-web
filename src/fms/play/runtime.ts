import * as legacy from '../../compat/v0_4/sim/core';
import { militaryRules, mobilizationFingerprint } from './military-registry';
import { formStartingUnits, initialUnitAssignments } from './compat/mobilization1/fms/play/military-actions';
import type { MilitaryAction } from './military-actions';
import type { StateVersion } from '../../sim/types';
import type { FmsRun } from './world';
import { mobilize } from './mobilization';
import { mobilize as legacyMobilize } from './compat/mobilization1/fms/play/mobilization';
import { seaGraph } from './sea-path';
import { advanceNavy, initialNavy } from './navy';
export function playRules(run:FmsRun){return run.version===1?legacy:militaryRules(run.engine,run.units);}
export function withMilitary(run:FmsRun,copy=false):Extract<FmsRun,{version:2}>{
  const cloned=structuredClone(run),formed=copy?{world:cloned.world,units:cloned.version!==1?cloned.units:initialUnitAssignments(cloned.world)}:formStartingUnits(cloned.world);
  const id=copy?`fms-${crypto.randomUUID()}`:run.id;
  formed.world.custom!.id=id;
  return {terrain:cloned.terrain,scale:cloned.scale,...formed,id,version:2,rules:'fms-military-1',engine:mobilizationFingerprint};
}
export function withNavy(run:FmsRun,copy=false):Extract<FmsRun,{version:3}>{
  const base=withMilitary(run,copy),formed=copy?{world:base.world,navy:{version:1 as const,fleets:[]}}:initialNavy(base.world,seaGraph(base.terrain,base.world));
  return {...base,...formed,version:3,rules:'fms-naval-1',engine:__FMS_PLAY_ENGINE__};
}
export function stepRunDay(run:FmsRun):FmsRun {
  const prepared=run.version===3?{...run,...mobilize(run.world,run.units)}:run.version===2&&run.engine===mobilizationFingerprint?{...run,...legacyMobilize(run.world,run.units)}:run;
  if(prepared.version===3){
    const first=prepared.world.nextEventId,naval=advanceNavy(prepared.world,prepared.navy,seaGraph(prepared.terrain,prepared.world));
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
