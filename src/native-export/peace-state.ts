import {nativeWar46,stateNumber,orderedWar28Provinces} from '../fms/play/war47-wars';
import {peaceQueries47} from '../fms/play/civilization47-war-settlement';
import {nativeDecidePeaceReason,nativeHasAutonomousDiplomacyParticipant,nativeAllEnforceableGoalsAchieved} from '../fms/play/native-war/peace';
import {nativeWarScoreParts} from '../fms/play/native-war/score';
import {nativeWarWeariness,nativeForceSettleThreshold} from '../fms/play/native-war/weariness';
import {nativeHasStateCollapsed} from '../fms/play/native-war/achievement';
import {war26Strength} from '../fms/play/war26-strength';
import {WAR28_LOSS_THRESHOLD} from '../fms/play/war28-policy';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';

type Run=PoliticalRun47;
/** One active war as the peace AI reads it (nativeWar46) with the world facts its queries return. */
export function peaceInput(r:Run,c:Run['nativeWars']['campaigns'][number]){
  const w=nativeWar46(c),q=peaceQueries47(r),index=new Map(r.world.provinces.map((p,i)=>[p.id,i+1]));
  return {
    war:{id:w.id,internal:w.internal,legacyWarType:w.legacyWarType,primaryAttackerId:w.primaryAttackerId,primaryDefenderId:w.primaryDefenderId,startTime:w.startTime,
      participants:w.participants,destroyedParticipants:w.destroyedParticipants,goals:w.goals.map(g=>({id:(g as {id?:number}).id??0,type:g.type,addedBy:g.addedBy,target:g.target,beneficiary:g.beneficiary,provinceIds:g.scope?.provinceIds??null,requiredCount:g.scope?.requiredCount??0,hasScope:!!g.scope})),
      initialOwners:[...w.initialOwners],initialProvinceCounts:[...w.initialProvinceCounts],initialCapitals:[...(w.initialCapitals??new Map())],kills:[...w.killsByState],deaths:[...w.deathsByState]},
    world:{gameTime:r.life.gameTime,secondsPerDay:r.life.secondsPerDay,start:r.life.startDate,
      provinceStates:r.world.provinces.map(p=>stateNumber(r,p.controller)),
      states:r.world.nations.map(n=>({id:stateNumber(r,n.id),dead:!r.world.provinces.some(p=>p.controller===n.id),provinces:orderedWar28Provinces(r,n.id).map(p=>index.get(p.id)!),
        gold:r.finance.nations[n.id].gold,goldPerMonth:r.finance.nations[n.id].goldPerMonth,armyCostGold:r.finance.nations[n.id].armyCostGold,
        strength:war26Strength(r.world,r,n.id),lossThreshold:Math.fround(WAR28_LOSS_THRESHOLD[r.civilization.nations[n.id].polity]),autonomous:r.diplomacy.nations[n.id]===true}))},
    output:{score:nativeWarScoreParts(w,q),attackerWeariness:nativeWarWeariness(w,w.primaryAttackerId,q),defenderWeariness:nativeWarWeariness(w,w.primaryDefenderId,q),
      forceSettle:nativeForceSettleThreshold(w,q),months:q.monthsSince(w.startTime),
      attackerCollapsed:nativeHasStateCollapsed(w,w.primaryAttackerId,q),defenderCollapsed:nativeHasStateCollapsed(w,w.primaryDefenderId,q),
      goalsAchieved:nativeAllEnforceableGoalsAchieved(w,q),autonomous:nativeHasAutonomousDiplomacyParticipant(w,q),reason:nativeDecidePeaceReason(w,q)},
  };
}

