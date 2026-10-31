import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {patch} from './run-view';
import {diplomacyStatic} from './diplomacy-state';
import {advanceDiplomaticSchedule46} from '../fms/play/civilization47-diplomatic-state';
import {evaluateDeclaration47} from '../fms/play/civilization47-declaration';
import {evaluateAlliance47} from '../fms/play/civilization47-alliance';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';

type Run=PoliticalRun47;
/** What the schedule and the declaration read and write (wars plans and loss ledgers excluded). */
function declareView(r:Run){
  const w=r.world;
  return structuredClone({
    clock:r.clock,life:{gameTime:r.life.gameTime,secondsPerDay:r.life.secondsPerDay,startDate:r.life.startDate,currentDate:r.life.currentDate},
    world:{day:w.day,nextEventId:w.nextEventId,events:w.events,nations:w.nations.map(n=>({id:n.id,name:n.name,capitalId:n.capitalId})),
      provinces:w.provinces.map(p=>({id:p.id,name:p.name,controller:p.controller,legalOwner:p.legalOwner,center:p.center})),cities:w.cities.map(c=>({id:c.id,provinceId:c.provinceId})),
      armies:w.armies.map(a=>({nationId:a.nationId,status:a.status,troops:a.troops})),statecraft:{relations:w.statecraft!.relations,nations:w.statecraft!.nations.map(n=>({nationId:n.nationId,lastDecision:n.lastDecision??null}))}},
    transports:{cargo:r.transports.cargo.map(c=>({army:{nationId:c.army.nationId,status:c.army.status,troops:c.army.troops}}))},navy:{fleets:r.navy.fleets.map(f=>({nationId:f.nationId,status:f.status,ships:f.ships}))},
    nativeWars:r.nativeWars,nativeDiplomacy:r.nativeDiplomacy,alliances:r.alliances,vassals:r.vassals,diplomacy:r.diplomacy,
    people:{nations:Object.fromEntries(Object.entries(r.people.nations).map(([k,v])=>[k,{id:v.id,leaderId:v.leaderId}])),persons:r.people.persons},
    civilization:{nations:Object.fromEntries(Object.entries(r.civilization.nations).map(([k,v])=>[k,{cultureId:v.cultureId}]))},
    sovereignty:{provinces:Object.fromEntries(Object.entries(r.sovereignty.provinces).map(([k,v])=>[k,{mapCultureId:v.mapCultureId}]))},
    upperCombat:{provinces:Object.fromEntries(Object.entries(r.upperCombat.provinces).map(([k,p])=>[k,{connected:p.connected}])),nations:Object.fromEntries(Object.entries(r.upperCombat.nations).map(([k,n])=>[k,{provinceOrder:n.provinceOrder,polity:n.polity}]))},
    chronicle:{nextEntryId:r.chronicle.nextEntryId,entries:r.chronicle.entries.slice(-3)},
  });
}

/** Golden samples for the Swift calendar diplomacy (advanceDiplomaticSchedule46 with
 * evaluateAlliance47 and evaluateDeclaration47 as the monthly steps): every day of the first two years on a copy moved one day
 * ahead of the schedule. Inputs are chained. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports declaration golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null;const samples:unknown[]=[];let statics:unknown=null;
  for(let day=0;day<730;day++){
    const before=x.run as Run;
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    const after=x.run as Run;
    statics??=diplomacyStatic(after);
    if(day%2!==0)continue;
    const r=structuredClone(before);
    r.life.currentDate=structuredClone(after.life.currentDate);r.life.gameTime=after.life.gameTime;r.clock.tick=after.clock.tick;r.world.day=after.world.day;
    const input=declareView(r);
    advanceDiplomaticSchedule46(r.nativeDiplomacy,r,id=>{evaluateAlliance47(r,id);evaluateDeclaration47(r,id);});
    const output=declareView(r);
    if(samples.length%3!==0&&JSON.stringify(input.nativeWars)===JSON.stringify(output.nativeWars)&&JSON.stringify(input.alliances)===JSON.stringify(output.alliances)&&JSON.stringify(input.nativeDiplomacy.nations)===JSON.stringify(output.nativeDiplomacy.nations))continue;
    samples.push({inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,output)});previous=input;
  }
  expect(samples.length).toBeGreaterThan(30);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/declare.json',JSON.stringify({statics,samples}));
},3600000);
