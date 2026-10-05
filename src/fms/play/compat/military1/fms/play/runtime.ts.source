import * as legacy from '../../compat/v0_4/sim/core';
import { militaryRules } from './military-registry';
import { formStartingUnits, initialUnitAssignments, type MilitaryAction } from './military-actions';
import type { StateVersion } from '../../sim/types';
import type { FmsRun } from './world';
export function playRules(run:FmsRun){return run.version===1?legacy:militaryRules(run.engine,run.units);}
export function withMilitary(run:Extract<FmsRun,{version:1}>,copy=false):Extract<FmsRun,{version:2}>{
  const cloned=structuredClone(run),formed=copy?{world:cloned.world,units:initialUnitAssignments(cloned.world)}:formStartingUnits(cloned.world);
  const id=copy?`fms-${crypto.randomUUID()}`:run.id;
  formed.world.custom!.id=id;
  return {...cloned,...formed,id,version:2,rules:'fms-military-1',engine:__FMS_PLAY_ENGINE__};
}
export function executeMilitary(run:FmsRun,action:MilitaryAction,expected:StateVersion):FmsRun{
  if(run.version!==2)throw new Error('旧世界保留旧规则；请先创建新版推演副本。');
  return {...run,...militaryRules(run.engine,run.units).applyMilitaryAction(run.world,run.units,action,expected)};
}
