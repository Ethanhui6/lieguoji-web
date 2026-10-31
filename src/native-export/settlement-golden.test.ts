import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {peaceInput} from './peace-state';
import {settleWar47} from '../fms/play/civilization47-war-settlement';
import {stateNumber} from '../fms/play/war47-wars';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';
import type {NativePeaceReason} from '../fms/play/native-war/peace';

type Run=PoliticalRun47;
/** Golden samples for the Swift peace settlement (native-war settlement plan / verdict /
 * classification / execute, reparations): every active external war every 30 days for three
 * years, settled on copies with each peace reason (0 goals, 1 decisive, 2 collapse, 4 weariness).
 * Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports settlement golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;const samples:unknown[]=[];
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%30!==15)continue;
    const live=x.run as Run;
    for(const c0 of live.nativeWars.campaigns){
      if(c0.endedTick!==null||c0.history!=='complete'||c0.internal)continue;
      for(const reason of [0,1,2,4] as NativePeaceReason[]){
        const r=structuredClone(live) as Run,c=r.nativeWars.campaigns.find(v=>v.id===c0.id)!;
        const {war,world}=peaceInput(r,c);
        settleWar47(r,c,reason);
        const s=c.settlement!;
        samples.push({reason,war,world,output:{
          victorSide:null,winnerSide:s.winnerSide,enforcedGoals:s.enforcedGoals,transfers:s.transfers,
          effects:s.effects.map(e=>({sourceGoalId:e.sourceGoalId,type:e.type,beneficiary:e.beneficiary,target:e.target,status:e.status})),
          outcomes:s.outcomes,
          provinceStates:r.world.provinces.map(p=>stateNumber(r,p.controller)),
          gold:r.world.nations.map(n=>({id:stateNumber(r,n.id),gold:r.finance.nations[n.id].gold}))}});
      }
    }
  }
  expect(samples.length).toBeGreaterThan(40);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/settlement.json',JSON.stringify({samples}));
},3600000);
