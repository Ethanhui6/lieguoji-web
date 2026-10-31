import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {patch} from './run-view';
import {settleWar47,advancePeace47} from '../fms/play/civilization47-war-settlement';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';

type Run=PoliticalRun47;
/** What settleWar47 itself writes and reads: territory, treasuries, grain ledgers, relations, wars,
 * offices, core distances and the chronicle (the follow-up force reconciliation is excluded). */
function settleView(r:Run){
  const w=r.world;
  return structuredClone({
    clock:r.clock,life:{gameTime:r.life.gameTime,secondsPerDay:r.life.secondsPerDay,startDate:r.life.startDate,currentDate:r.life.currentDate},
    world:{day:w.day,nextEventId:w.nextEventId,events:w.events,custom:{seed:w.custom!.seed},nations:w.nations.map(n=>({id:n.id,name:n.name,capitalId:n.capitalId})),
      provinces:w.provinces.map(p=>({id:p.id,name:p.name,controller:p.controller,legalOwner:p.legalOwner,center:p.center,neighbors:p.neighbors})),cities:w.cities.map(c=>({id:c.id,name:c.name,provinceId:c.provinceId})),
      armies:w.armies.map(a=>({id:a.id,nationId:a.nationId,status:a.status,troops:a.troops})),
      statecraft:{relations:w.statecraft!.relations,nations:w.statecraft!.nations.map(n=>({nationId:n.nationId,lastLedger:n.lastLedger})),provinces:w.statecraft!.provinces.map(p=>({provinceId:p.provinceId,grain:p.grain}))}},
    transports:{cargo:r.transports.cargo.map(c=>({army:{nationId:c.army.nationId,status:c.army.status,troops:c.army.troops}}))},navy:{fleets:r.navy.fleets.map(f=>({nationId:f.nationId,status:f.status,ships:f.ships}))},
    nativeWars:r.nativeWars,nativeDiplomacy:{declarations:r.nativeDiplomacy.declarations},
    finance:{nations:Object.fromEntries(Object.entries(r.finance.nations).map(([k,v])=>[k,{gold:v.gold,goldPerMonth:v.goldPerMonth,armyCostGold:v.armyCostGold}]))},
    people:{revision:r.people.revision,nations:Object.fromEntries(Object.entries(r.people.nations).map(([k,v])=>[k,{id:v.id,offices:v.offices}]))},
    upperCombat:{provinces:Object.fromEntries(Object.entries(r.upperCombat.provinces).map(([k,p])=>[k,{distance:p.distance,connected:p.connected}])),nations:Object.fromEntries(Object.entries(r.upperCombat.nations).map(([k,n])=>[k,{provinceOrder:n.provinceOrder,polity:n.polity,traits:n.traits,destiny:n.destiny,coreThreshold:n.coreThreshold,coreYear:n.coreYear}]))},
    civilization:{nations:Object.fromEntries(Object.entries(r.civilization.nations).map(([k,v])=>[k,{polity:v.polity}]))},diplomacy:{worldAuto:r.diplomacy.worldAuto,maximumMonths:r.diplomacy.maximumMonths,nations:r.diplomacy.nations},
    chronicle:{nextEntryId:r.chronicle.nextEntryId,entries:r.chronicle.entries.slice(-3)},
  });
}

/** Golden samples for the Swift war settlement (settleWar47 on the typed treaty ports): every ten
 * days for three years, each active war settled on a copy with the reasons 0/1/2/4/11 in turn, and
 * one advancePeace47 month on a copy. Inputs are chained. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports settlement golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null,turn=0;const samples:unknown[]=[];
  for(let day=0;day<1100&&samples.length<120;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%10!==9)continue;
    const base=x.run as Run;
    for(const c of base.nativeWars.campaigns.filter(c=>c.endedTick===null)){
      const r=structuredClone(base),reason=[0,1,2,4,11][turn++%5],input=settleView(r);
      settleWar47(r,r.nativeWars.campaigns.find(v=>v.id===c.id)!,reason as never);
      samples.push({kind:'settle',war:c.id,reason,inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,settleView(r))});previous=input;
    }
    const r=structuredClone(base);r.life.currentDate={...r.life.currentDate,day:1};const input=settleView(r);advancePeace47(r,true);
    samples.push({kind:'month',inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,settleView(r))});previous=input;
  }
  expect(samples.length).toBeGreaterThan(30);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/settle.json',JSON.stringify({samples}));
},3600000);
