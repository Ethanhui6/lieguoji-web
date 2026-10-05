import * as legacy from '../../compat/v0_4/sim/core';
import { militaryRules, mobilizationFingerprint,navalFingerprint,realtimeFingerprint,battleFingerprint } from './military-registry';
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
import {advanceCombat,reconcileCombat} from './battle';
import {createMilitaryCore as rtCore} from './compat/realtime1/fms/play/military-core';
import {mobilize as rtMobilize} from './compat/realtime1/fms/play/mobilization';
import * as rtNavy from './compat/realtime1/fms/play/navy';
import {seaGraph as rtGraph} from './compat/realtime1/fms/play/sea-path';
import {advanceCombat as oldCombat,reconcileCombat as oldReconcile,initialBattles as oldInitialBattles} from './compat/battle1/fms/play/battle';
import {TICKS_PER_DAY as BATTLE_TICKS_PER_DAY} from './compat/battle1/fms/play/clock';
import {createMilitaryCore as oldBattleCore} from './compat/battle1/fms/play/military-core';
import {mobilize as oldBattleMobilize} from './compat/battle1/fms/play/mobilization';
import * as oldBattleNavy from './compat/battle1/fms/play/navy';
import {seaGraph as oldBattleGraph} from './compat/battle1/fms/play/sea-path';
import {initialOccupation,advanceOccupation,reconcileOccupation} from './occupation';
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
  if(run.version===6)throw Error('不能将围城版降级。');
  const base=run.version===3||run.version===4||run.version===5?structuredClone(run):withNavy(run,copy);
  const id=copy?`fms-${crypto.randomUUID()}`:base.id;base.world.custom!.id=id;
  const {battles:_b,...oldBase}=base as typeof base & {battles?:unknown};void _b;return {...oldBase,id,version:4,rules:'fms-realtime-1',engine:realtimeFingerprint,clock:{version:1,tick:run.version===4||run.version===5?run.clock.tick:base.world.day*TICKS_PER_DAY}};
}
export function withBattle(run:FmsRun,copy=false):Extract<FmsRun,{version:5}>{const base=withRealtime(run,copy);return {...base,version:5,rules:'fms-battle-1',engine:battleFingerprint,battles:oldInitialBattles()};}
export function withOccupation(run:FmsRun,copy=false):Extract<FmsRun,{version:6}>{
  if(run.version===6)throw Error('本世界已是围城版。');
  const base=run.version===5?structuredClone(run):withBattle(run,copy);
  const id=copy?'fms-'+crypto.randomUUID():base.id;base.world.custom!.id=id;
  for(const a of base.world.armies){const path=[a.provinceId,...a.route];if(a.status==='marching'&&a.route.length&&!base.battles.plans[a.id]&&new Set(path).size===path.length)base.battles.plans[a.id]={path,targets:[path.at(-1)!]};}
  return {...base,id,version:6,rules:'fms-occupation-1',engine:__FMS_PLAY_ENGINE__,occupation:initialOccupation()};
}
export function advanceRunTick<T extends Extract<FmsRun,{version:4|5|6}>>(run:T,graph:SeaGraph=(run.version===4?rtGraph:run.version===5?oldBattleGraph:seaGraph)(run.terrain,run.world)):T{
  if(run.version===4){const clock={version:1 as const,tick:run.clock.tick+1},naval=rtNavy.moveNavy(run.world,run.navy,graph,1/TICKS_PER_DAY);let next={...run,...naval,world:rtCore(run.units,true).advanceMovement(naval.world,1/TICKS_PER_DAY),clock};if(clock.tick%TICKS_PER_DAY===0){const formed=rtMobilize(next.world,next.units),first=formed.world.nextEventId,provisioned=rtNavy.advanceNavy(formed.world,next.navy,graph,false),world=rtCore(formed.units,true).settleDay(provisioned.world);for(const e of world.events)if(e.id>=first&&e.id<provisioned.world.nextEventId)e.day=world.day;next={...next,...formed,...provisioned,world};}return next;}
  if(run.version===5){
    const clock={version:1 as const,tick:run.clock.tick+1};
    const naval=oldBattleNavy.moveNavy(run.world,run.navy,graph,1/BATTLE_TICKS_PER_DAY);
    let next={...run,...naval,...oldCombat(naval.world,run.battles,run.units,clock.tick),clock};
    if(clock.tick%BATTLE_TICKS_PER_DAY===0){
      const formed=oldBattleMobilize(next.world,next.units),first=formed.world.nextEventId;
      const provisioned=oldBattleNavy.advanceNavy(formed.world,next.navy,graph,false);
      const world=oldBattleCore(formed.units,true,true).settleDay(provisioned.world);
      for(const e of world.events)if(e.id>=first&&e.id<provisioned.world.nextEventId)e.day=world.day;
      next={...next,...formed,...provisioned,...oldReconcile(world,next.battles,clock.tick)};
    }return next;
  }
  const clock={version:1 as const,tick:run.clock.tick+1};
  const naval=moveNavy(run.world,run.navy,graph,1/TICKS_PER_DAY);
  let next:Extract<FmsRun,{version:6}>={...(run as Extract<FmsRun,{version:6}>),...naval,...advanceCombat(naval.world,run.battles,run.units,clock.tick),clock};
  const previousControl=next.world.provinces.map(p=>p.controller);
  next={...next,...advanceOccupation(next.world,next.occupation,next.units,clock.tick)};
  if(next.world.provinces.some((p,i)=>p.controller!==previousControl[i]))next={...next,...reconcileCombat(next.world,next.battles,clock.tick)};
  if(clock.tick%TICKS_PER_DAY===0){
    const formed=mobilize(next.world,next.units),first=formed.world.nextEventId;
    const provisioned=advanceNavy(formed.world,next.navy,graph,false);
    const world=createMilitaryCore(formed.units,true,true).settleDay(provisioned.world);
    for(const event of world.events)if(event.id>=first&&event.id<provisioned.world.nextEventId)event.day=world.day;
    next={...next,...formed,...provisioned,...reconcileCombat(world,next.battles,clock.tick)};
  }next={...next,...reconcileOccupation(next.world,next.occupation)};return next as T;
}
export function stepRunDay(run:FmsRun):FmsRun {
  if(run.version===4||run.version===5||run.version===6){let next=run;const graph=(run.version===4?rtGraph:run.version===5?oldBattleGraph:seaGraph)(run.terrain,run.world);for(let i=0;i<(run.version===5?BATTLE_TICKS_PER_DAY:TICKS_PER_DAY);i++)next=advanceRunTick(next,graph);return next;}
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
