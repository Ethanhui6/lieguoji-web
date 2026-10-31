import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {peopleView,patch,type Run} from './run-view';
import {advanceNobility47} from '../fms/play/civilization47-nobility-monthly';
import {CULTURES47} from '../fms/play/civilization47-catalog';
import {ROMAN_HOUSES_FEMALE47} from '../fms/play/civilization47-chinese-catalog';
import original from '../fms/play/native-economy/character-traits.json';
import type {NobilityRun47} from '../fms/play/civilization47-nobility';

/** The people view plus what the family step reads: armies, core distances, the foundings switch. */
function nobilityView(r:Run){
  const v=peopleView(r) as Record<string,unknown>&{world:Record<string,unknown>};
  v.world.armies=r.world.armies.map(a=>({id:a.id,status:a.status,originId:a.originId,nationId:a.nationId}));
  v.upperCombat={provinces:Object.fromEntries(Object.entries(r.upperCombat.provinces).map(([k,p])=>[k,{distance:p.distance}])),nations:Object.fromEntries(Object.entries(r.upperCombat.nations).map(([k,n])=>[k,{coreThreshold:n.coreThreshold}]))};
  v.foundings=(r as {foundings?:unknown}).foundings?{enabled:true}:null;
  return v;
}

/** Golden samples for the Swift family step (advanceNobility47): every third day for 18 months
 * (month 6/12 rebellion checks excluded until ported), every fourth one with a family's last province
 * taken by another state so its fate is decided. Inputs are chained as patches on the previous input. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports nobility golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null;const samples:unknown[]=[];
  for(let day=0;day<540;day++){
    const before=x.run as Run;
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    const after=x.run as Run;
    if(day%3!==1)continue;
    const r=structuredClone(before) as Run&NobilityRun47;
    r.life.currentDate=structuredClone(after.life.currentDate);r.life.gameTime=after.life.gameTime;r.clock.tick=after.clock.tick;r.world.day=after.world.day;
    const month=r.life.currentDate.year*12+r.life.currentDate.month-1;
    if(month!==r.nobility!.month&&r.life.currentDate.month%6===0)continue;
    let forced:unknown=null;
    if(samples.length%4===3){
      // A family holding one province loses it to another living state.
      const n=r.nobility!,living=r.world.nations.filter(v=>r.world.provinces.some(p=>p.controller===v.id)).map(v=>v.id);
      const id=Object.keys(n.families).find(id=>n.families[id].controlledProvinces.length===1);
      if(id){const p=r.world.provinces.find(p=>p.id===n.families[id].controlledProvinces[0])!,to=living.find(v=>v!==p.controller)!;p.controller=to;forced={familyId:id,provinceId:p.id,to};}
    }
    const input=nobilityView(r);advanceNobility47(r);
    samples.push({forced,inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,nobilityView(r))});
    previous=input;
  }
  expect(samples.length).toBeGreaterThan(50);
  const cultures=Object.fromEntries(Object.entries(CULTURES47).map(([id,c])=>[id,{givenMale:c.givenMale,givenFemale:c.givenFemale,houses:c.houses,familyFirst:c.familyFirst,join:c.join,romanFemale:id==='roman'?ROMAN_HOUSES_FEMALE47:null}]));
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/nobility.json',JSON.stringify({traits:original.traits,cultures,samples}));
},3600000);
