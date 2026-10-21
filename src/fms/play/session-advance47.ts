import {withDeferredLiveChecks47} from './live-checks47';
import {actualContactFrame47} from './force-runtime47';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import type {ArmyRouteWeights47} from './army-commands47';
import type {ForceMotionObserver47} from './force-display-trace47';
import {cloneMilitaryCandidate47,prepareOwnedGeography47,withOwnedNumericGeography47} from './geography-content47';
import {withOwnedTravel47} from './owned-travel47';
import {advanceSessionCivilizationMilitary47} from './civilization47-military';
import {settleSessionArmyAutonomyDay47} from './civilization47-army-ai';
import {advancePolitics47} from './civilization47-political-owner';

declare const ownership:unique symbol;
export type SessionAdvanceLease47={readonly [ownership]:true};
const candidates=new WeakMap<SessionAdvanceLease47,PoliticalRun47>();

/** Only the fixed scheduler below can mint/update a lease. A caller cannot
 * certify an arbitrary live input, copy the token, or reuse it after failure. */
export function readSessionAdvanceCandidate47(lease:SessionAdvanceLease47):PoliticalRun47{
 const run=candidates.get(lease);if(!run)throw Error('推演候选凭证无效或已经关闭。');return run;
}

/** A batch owns one isolated dynamic candidate; numeric buffers are separately
 * isolated and checked after EVERY accepted action. Public/replay paths keep
 * their original copies and validation, and remain an independent oracle. */
export function advanceSessionBatch47(input:PoliticalRun47,actions:readonly {kind:'advance';ticks:number}[],weights:ArmyRouteWeights47,observe?:ForceMotionObserver47):PoliticalRun47{
 if(!actions.length||actions.length>10||actions.some(a=>a.kind!=='advance'||!Number.isSafeInteger(a.ticks)||a.ticks<1||a.ticks>120))throw Error('私有推进批次无效。');
 const lease=Object.freeze({}) as SessionAdvanceLease47;
 let run=cloneMilitaryCandidate47(input);
 try{
  run=withOwnedNumericGeography47(run,candidate=>withOwnedTravel47(()=>{
   withDeferredLiveChecks47(()=>{
   for(const [index,action] of actions.entries()){
    candidates.set(lease,candidate);let remaining=action.ticks;
    while(remaining){
     const current=readSessionAdvanceCandidate47(lease),take=Math.min(remaining,120-current.clock.tick%120);
     const out=advanceSessionCivilizationMilitary47(lease,take,weights,observe);
     candidates.set(lease,out.run);
     if(out.dailyPending)candidates.set(lease,settleSessionArmyAutonomyDay47(lease,weights));
     // Full world validation once, on the batch's final step (the candidate
     // is accepted only after it); intermediate steps are inside the same lease.
     advancePolitics47(readSessionAdvanceCandidate47(lease),out.dailyPending,index===actions.length-1&&remaining===take);
     remaining-=take;
    }
    candidate=readSessionAdvanceCandidate47(lease);
    // Keep the per-action invariant, while retaining one isolated numeric
    // window (and its verified geometry caches) across this bounded batch.
    for(const key of ['triangles','elevations'] as const){
     const before=input.terrain[key],after=candidate.terrain[key];
     if(before.length!==after.length)throw Error('推演期间地形发生变化，取消本次候选。');
     for(let i=0;i<before.length;i++)if(before[i]!==after[i])throw Error('推演期间地形发生变化，取消本次候选。');
    }
    prepareOwnedGeography47(candidate);
   }
   });
   // Deferred live checks: one complete check of the final run.
   actualContactFrame47(candidate);
   return candidate;
  }));
  return run;
 }finally{candidates.delete(lease);}
}
