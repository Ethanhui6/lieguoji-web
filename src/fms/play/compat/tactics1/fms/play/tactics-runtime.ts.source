import {maritimeView,tacticsWrap,type TacticsRun} from './tactics-model';
import {advanceTacticsSeaTick} from './tactics-sea';
import type {SeaGraph} from './sea-path';
import {advanceNavy,moveNavy} from './navy';
import {advanceCombat,reconcileCombat} from './tactics-battle';
import {advanceTacticsOccupation,dueCombatRounds} from './tactics-occupation';
import {reconcileOccupation} from './occupation';
import {createMilitaryCore} from './tactics-core';
import {provisionCargo,type ExpeditionRun} from './transport';
import {regularMuster} from './tactics-muster';
export function advanceTacticsTick(run:TacticsRun,g:SeaGraph):TacticsRun{
  const metadata=structuredClone(run.tactics);
  const maritime=advanceTacticsSeaTick(maritimeView(run),g,(base,g)=>{
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
  let result=tacticsWrap(maritime,metadata);if(result.clock.tick%120===0&&result.world.day%30===0)result=regularMuster(result);return result;
}
