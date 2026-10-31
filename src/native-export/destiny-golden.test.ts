import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {settleDestinyMonth} from '../fms/play/destiny20-state';
import {personTraits,personSkills} from '../fms/play/court16-people';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

type Run=FoundingForces47;
/** Golden samples for the Swift destiny port (destiny20-state settleDestinyMonth with the native
 * destiny kernel) and the ruler skill getters (character-income nativeCharacterSkills): every ten
 * days for three years, a copy moved to the next month boundary and settled. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports destiny golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;const samples:unknown[]=[];
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%10!==5)continue;
    for(const low of [false,true]){
    const r=structuredClone(x.run) as Run,w=r.world;
    // The low variant sits just above the manifest threshold so the month redraws destiny.
    if(low)w.nations.forEach((n,i)=>{const v=r.destiny.nations[n.id];v.destiny=Math.fround(10+1.5*Math.max(0,v.manifestCount)+(i%3)*0.01);v.manifest=i%2===0;});
    w.day=(Math.floor(w.day/30)+1)*30;
    const pop=new Map(w.statecraft!.provinces.map(d=>[d.provinceId,d.population]));
    const input=w.nations.map(n=>{const v=r.destiny.nations[n.id],owned=w.provinces.filter(p=>p.controller===n.id),leader=r.people.nations[n.id].leaderId,person=leader===null?null:r.people.persons[leader];
      return {destiny:v.destiny,decrease:v.decrease,manifestCount:v.manifestCount,manifest:v.manifest,seed:v.seed,lastMonth:v.lastMonth,
        populations:owned.map(p=>pop.get(p.id)!),capacities:owned.map(p=>r.finance.provinces[p.id].maxPopulation),gold:r.finance.nations[n.id].gold,
        leader:person?{base:person.base,traits:personTraits(person).map(t=>({administrative:t.administrativeModifier,military:t.militaryModifier,diplomatic:t.diplomaticModifier,charisma:t.charismaModifier})),skills:personSkills(person)}:null};});
    settleDestinyMonth(r,r.destiny);
    samples.push({day:w.day,input,output:w.nations.map(n=>{const v=r.destiny.nations[n.id];
      return {destiny:v.destiny,decrease:v.decrease,manifestCount:v.manifestCount,manifest:v.manifest,seed:v.seed,lastMonth:v.lastMonth,reset:v.ledger?.day===w.day&&v.ledger.reset,cleared:v.ledger?.day===w.day&&v.ledger.clearedRecent,upper:r.upperCombat.nations[n.id].destiny};})});
    }
  }
  expect(samples.length).toBeGreaterThan(50);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/destiny.json',JSON.stringify({samples}));
},3600000);
