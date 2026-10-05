import * as legacy from '../../compat/v0_4/sim/core';
import { militaryRules } from './military-registry';
import { formStartingUnits, initialUnitAssignments, type MilitaryAction } from './military-actions';
import type { StateVersion } from '../../sim/types';
import type { FmsRun } from './world';
import { mobilize } from './mobilization';
export function playRules(run:FmsRun){return run.version===1?legacy:militaryRules(run.engine,run.units);}
export function withMilitary(run:FmsRun,copy=false):Extract<FmsRun,{version:2}>{
  const cloned=structuredClone(run),formed=copy?{world:cloned.world,units:cloned.version===2?cloned.units:initialUnitAssignments(cloned.world)}:formStartingUnits(cloned.world);
  const id=copy?`fms-${crypto.randomUUID()}`:run.id;
  formed.world.custom!.id=id;
  return {...cloned,...formed,id,version:2,rules:'fms-military-1',engine:__FMS_PLAY_ENGINE__};
}
export function stepRunDay(run:FmsRun):FmsRun {
  const prepared=run.version===2&&run.engine===__FMS_PLAY_ENGINE__?{...run,...mobilize(run.world,run.units)}:run;
  return {...prepared,world:playRules(prepared).advanceWorld(prepared.world,1)};
}
export function executeMilitary(run:FmsRun,action:MilitaryAction,expected:StateVersion):FmsRun{
  if(run.version!==2)throw new Error('旧世界保留旧规则；请先创建新版推演副本。');
  return {...run,...militaryRules(run.engine,run.units).applyMilitaryAction(run.world,run.units,action,expected)};
}
