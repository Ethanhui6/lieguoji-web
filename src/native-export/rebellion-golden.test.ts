import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {peopleView,patch,type Run} from './run-view';
import {advanceRebellion47,stateRebellionMonth47} from '../fms/play/civilization47-rebellion';
import type {FoundingRun47} from '../fms/play/civilization47-founding';

/** The people view plus what the rebellion checks read: foundings, cores, destiny, sieges, wars,
 * offices and the forces that make up strength. */
function rebellionView(r:Run){
  const v=peopleView(r) as Record<string,unknown>&{world:Record<string,unknown>};
  const w=r.world;
  v.world.provinces=w.provinces.map(p=>({id:p.id,name:p.name,controller:p.controller,legalOwner:p.legalOwner,center:p.center,neighbors:p.neighbors}));
  v.world.armies=w.armies.map(a=>({id:a.id,nationId:a.nationId,status:a.status,troops:a.troops}));
  v.world.statecraft={relations:w.statecraft!.relations};
  v.transports={cargo:r.transports.cargo.map(c=>({army:{nationId:c.army.nationId,status:c.army.status,troops:c.army.troops}}))};v.navy={fleets:r.navy.fleets.map(f=>({nationId:f.nationId,status:f.status,ships:f.ships}))};
  v.foundings=(r as unknown as FoundingRun47).foundings;v.occupation={sieges:r.occupation.sieges};v.offices47=(r as {offices47?:unknown}).offices47??null;
  v.destiny={nations:Object.fromEntries(Object.entries(r.destiny.nations).map(([k,d])=>[k,{destiny:d.destiny,manifestCount:d.manifestCount}]))};
  v.upperCombat={provinces:Object.fromEntries(Object.entries(r.upperCombat.provinces).map(([k,p])=>[k,{distance:p.distance,connected:p.connected}])),nations:Object.fromEntries(Object.entries(r.upperCombat.nations).map(([k,n])=>[k,{coreThreshold:n.coreThreshold,provinceOrder:n.provinceOrder}]))};
  v.scale=(r as unknown as {scale?:number}).scale??null;
  return structuredClone(v);
}

/** Golden samples for the Swift province rebellions (advanceRebellion47 daily, stateRebellionMonth47
 * for every state on month starts): every fourth day for two years on a copy moved one day ahead. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports rebellion golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot,previous:unknown=null;const samples:unknown[]=[];
  for(let day=0;day<730;day++){
    const before=x.run as Run;
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    const after=x.run as Run;
    if(day%4!==0)continue;
    const r=structuredClone(before) as Run&FoundingRun47;
    r.life.currentDate=structuredClone(after.life.currentDate);r.life.gameTime=after.life.gameTime;r.clock.tick=after.clock.tick;r.world.day=after.world.day;
    const monthly=samples.length%5===4,input=rebellionView(r),entries=r.chronicle.nextEntryId;
    advanceRebellion47(r);if(monthly)for(const n of r.world.nations)stateRebellionMonth47(r,n.id);
    const rebelled=r.chronicle.entries.some(e=>e.id>=entries&&e.kind==='uprising');
    samples.push({monthly,rebelled,inputPatch:previous===null?null:patch(previous,input),input:previous===null?input:undefined,patch:patch(input,rebellionView(r))});previous=input;
  }
  expect(samples.length).toBeGreaterThan(80);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/rebellion.json',JSON.stringify({samples}));
},3600000);
