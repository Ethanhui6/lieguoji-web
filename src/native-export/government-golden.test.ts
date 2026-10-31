import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {peopleView,patch,type Run} from './run-view';
import {reconcileGovernmentContinuity47} from '../fms/play/civilization47-political-owner';
import {recordReigns47} from '../fms/play/leader-history47';
import {recordStateTraits47} from '../fms/play/state-traits47';

/** The people view plus continuity, capitals, leader combat, reigns and state traits. */
function governmentView(r:Run){
  const v=peopleView(r) as Record<string,unknown>&{world:Record<string,unknown>};
  const w=r.world;
  v.world.provinces=w.provinces.map(p=>({id:p.id,name:p.name,controller:p.controller,legalOwner:p.legalOwner,center:p.center,neighbors:p.neighbors}));
  v.world.cities=w.cities.map(c=>({id:c.id,name:c.name,provinceId:c.provinceId,position:c.position}));
  v.world.statecraft={provinces:w.statecraft!.provinces.map(p=>({provinceId:p.provinceId,population:p.population}))};
  v.world.nations=w.nations.map(n=>({id:n.id,name:n.name,capitalId:n.capitalId}));
  v.vassals=r.vassals;v.combatPersonnel={nations:r.combatPersonnel.nations};v.destiny=r.destiny;
  v.stateTraits47=(r as {stateTraits47?:unknown}).stateTraits47??null;v.reigns47=(r as {reigns47?:unknown}).reigns47??null;
  v.upperCombat={provinces:Object.fromEntries(Object.entries(r.upperCombat.provinces).map(([k,p])=>[k,{distance:p.distance,connected:p.connected}])),nations:r.upperCombat.nations};
  return structuredClone(v);
}

/** Golden samples for the Swift government continuity and records (reconcileGovernmentContinuity47,
 * recordReigns47, recordStateTraits47): every eleven days for three years; every third sample a state's
 * capital province is taken by a neighbour, every seventh a state loses all its land. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports government golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null;const samples:unknown[]=[];
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%11!==3)continue;
    const r=structuredClone(x.run) as Run,k=samples.length,living=r.world.nations.filter(n=>r.world.provinces.some(p=>p.controller===n.id));
    let variant='none';
    if(k%7===6&&living.length>2){const loser=living[k%living.length],winner=living[(k+1)%living.length];for(const p of r.world.provinces)if(p.controller===loser.id)p.controller=winner.id;variant='extinction';}
    else if(k%3===2){const n=living[k%living.length],cap=r.world.cities.find(c=>c.id===n.capitalId)!,p=r.world.provinces.find(q=>q.id===cap.provinceId)!,to=p.neighbors.map(id=>r.world.provinces.find(q=>q.id===id)!.controller).find(c=>c!==n.id)??living.find(v=>v.id!==n.id)!.id;
      if(p.controller===n.id&&r.world.provinces.filter(q=>q.controller===n.id).length>1){p.controller=to;variant='capital';}}
    const input=governmentView(r);
    reconcileGovernmentContinuity47(r);recordReigns47(r as never);recordStateTraits47(r as never);
    samples.push({variant,inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,governmentView(r))});previous=input;
  }
  expect(samples.length).toBeGreaterThan(70);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/government.json',JSON.stringify({samples}));
},3600000);
