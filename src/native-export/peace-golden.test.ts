import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
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
function peaceSnapshot(r:Run,c:Run['nativeWars']['campaigns'][number]){
  const w=nativeWar46(c),q=peaceQueries47(r),index=new Map(r.world.provinces.map((p,i)=>[p.id,i+1]));
  return {
    war:{id:w.id,internal:w.internal,legacyWarType:w.legacyWarType,primaryAttackerId:w.primaryAttackerId,primaryDefenderId:w.primaryDefenderId,startTime:w.startTime,
      participants:w.participants,destroyedParticipants:w.destroyedParticipants,goals:w.goals.map(g=>({type:g.type,addedBy:g.addedBy,target:g.target,beneficiary:g.beneficiary,provinceIds:g.scope?.provinceIds??null,requiredCount:g.scope?.requiredCount??0,hasScope:!!g.scope})),
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

/** Golden samples for the Swift peace AI (native-war peace / score / weariness / achievement): every
 * active complete war, every 10 days for three years. Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports peace golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;const samples:unknown[]=[];
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%10!==0)continue;
    const r=x.run as Run;
    for(const c of r.nativeWars.campaigns)if(c.endedTick===null&&c.history==='complete'&&!c.internal)samples.push(peaceSnapshot(r,c));
  }
  expect(samples.length).toBeGreaterThan(50);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/peace.json',JSON.stringify({samples}));
},3600000);
