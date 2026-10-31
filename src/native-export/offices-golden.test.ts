import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {peopleView,patch,type Run} from './run-view';
import {stateOfficeMonth47,centralIncome47,localIncome47,localRebellion47,type OfficeRun47} from '../fms/play/civilization47-offices';
import type {NobilityRun47} from '../fms/play/civilization47-nobility';

/** The people view plus what the office AI reads: offices, destiny, wars, the map scale. */
function officeView(r:Run){
  const v=peopleView(r) as Record<string,unknown>&{world:Record<string,unknown>};
  v.world.statecraft={relations:r.world.statecraft!.relations.map(x=>({a:x.a,b:x.b,status:x.status,sinceDay:x.sinceDay}))};
  v.offices47=(r as unknown as OfficeRun47).offices47;
  v.destiny={nations:Object.fromEntries(Object.entries(r.destiny.nations).map(([k,d])=>[k,{destiny:d.destiny}]))};
  v.scale=(r as unknown as {scale?:number}).scale??null;
  return structuredClone(v);
}

/** Golden samples for the Swift office AI (civilization47-offices stateOfficeMonth47 for every state,
 * with the income and rebellion effects after it): every ten days for three years, chained inputs. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports office golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null;const samples:unknown[]=[];
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%10!==3)continue;
    const r=structuredClone(x.run) as Run&OfficeRun47;
    const input=officeView(r);
    for(const n of r.world.nations)stateOfficeMonth47(r as unknown as NobilityRun47,n.id);
    const effects={central:r.world.nations.map(n=>centralIncome47(r,n.id)),local:r.world.provinces.map(p=>localIncome47(r,p.id)),rebellion:r.world.provinces.map(p=>localRebellion47(r,p.id))};
    samples.push({inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,officeView(r)),effects});
    previous=input;
  }
  expect(samples.length).toBeGreaterThan(50);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/offices.json',JSON.stringify({samples}));
},3600000);
