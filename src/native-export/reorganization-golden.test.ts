import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {progressOriginalReorganization47} from '../fms/play/civilization47-original-army';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

type Run=FoundingForces47;
/** Golden samples for the Swift reorganization port (civilization47-original-army
 * progressOriginalReorganization47): every day for three years with an army rebuilding at home,
 * one daily progress step on a copy. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports reorganization golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;const samples:unknown[]=[];
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    const r=structuredClone(x.run) as Run,w=r.world;
    if(!Object.keys(r.reorganization.active).length)continue;
    const index=new Map(w.provinces.map((p,i)=>[p.id,i])),pop=new Map(w.statecraft!.provinces.map(d=>[d.provinceId,d.population]));
    const active=Object.entries(r.reorganization.active).map(([id,s])=>{const a=w.armies.find(a=>a.id===id),f=r.tactics.forces[id];
      return {id,fraction:s.fraction,troops:a?.troops??0,alive:!!a&&a.troops>0&&a.status!=='destroyed'&&!!f,home:f?index.get(f.homeId)??-1:-1,completed:r.reorganization.completed[id]??0};});
    const input={secondsPerDay:r.life.secondsPerDay,populations:w.provinces.map(p=>pop.get(p.id)!),others:w.statecraft!.provinces.filter(d=>!index.has(d.provinceId)).map(d=>d.population),active};
    progressOriginalReorganization47(r);
    samples.push({input,output:active.map(v=>{const s=r.reorganization.active[v.id],a=r.world.armies.find(a=>a.id===v.id);
      return {active:!!s,fraction:s?.fraction??0,troops:a?.troops??0,fullStrength:r.tactics.forces[v.id]?.fullStrength??0,completed:r.reorganization.completed[v.id]??0};})});
  }
  expect(samples.length).toBeGreaterThan(20);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/reorganization.json',JSON.stringify({samples:samples.slice(0,300)}));
},3600000);
