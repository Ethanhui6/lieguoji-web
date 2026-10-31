import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {peopleView,patch,type Run} from './run-view';
import {stateNobilityMonth47} from '../fms/play/civilization47-nobility-territory';
import type {NobilityRun47} from '../fms/play/civilization47-nobility';

/** The people view plus what redistribution reads: neighbours, populations, province order, positions. */
function territoryView(r:Run){
  const v=peopleView(r) as Record<string,unknown>&{world:Record<string,unknown>};
  v.world.provinces=r.world.provinces.map(p=>({id:p.id,name:p.name,controller:p.controller,legalOwner:p.legalOwner,center:p.center,neighbors:p.neighbors}));
  v.world.cities=r.world.cities.map(c=>({id:c.id,name:c.name,provinceId:c.provinceId,position:c.position}));
  v.world.statecraft={provinces:r.world.statecraft!.provinces.map(p=>({provinceId:p.provinceId,population:p.population}))};
  v.upperCombat={nations:Object.fromEntries(Object.entries(r.upperCombat.nations).map(([k,n])=>[k,{provinceOrder:(n as {provinceOrder?:string[]}).provinceOrder??null}]))};
  return structuredClone(v);
}

/** Golden samples for the Swift territory redistribution (stateNobilityMonth47 for every state):
 * every ten days for three years, every other one with each state's countdown at 1 so it redistributes. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports territory golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null;const samples:unknown[]=[];
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%10!==7)continue;
    const r=structuredClone(x.run) as Run&NobilityRun47,forced=samples.length%2===1;
    if(forced)for(const n of r.world.nations)r.nobility!.redistribution[n.id]=1;
    const input=territoryView(r);
    for(const n of r.world.nations)stateNobilityMonth47(r,n.id);
    samples.push({forced,inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,territoryView(r))});
    previous=input;
  }
  expect(samples.length).toBeGreaterThan(50);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/territory.json',JSON.stringify({samples}));
},3600000);
