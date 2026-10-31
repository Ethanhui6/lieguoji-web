import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {issueArmyBatchOrders47} from '../fms/play/civilization47-army-ai';
import {armyAiStatic,armyAiSnapshot} from './army-ai-state';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

/** Golden samples for the Swift army autonomy: a web world (wars from its first week) advanced a
 * day at a time for two years; at each day the next frame's batch of five army orders
 * (issueArmyBatchOrders47) is run on a copy. Input is the snapshot before, output every army's travel
 * record, status and decision row after, and the batch cursor. Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports army autonomy golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;
  type Snap=ReturnType<typeof armyAiSnapshot>;
  const statics=armyAiStatic(x.run),samples:{input:Snap;batches:{cursor:number;changes:[number,Snap['armies'][number]][]}[]}[]=[];
  const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
  for(let day=0;day<720;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%15!==0)continue;
    // A full sweep of the batch cursor, as the world stands and with every retry timer expired.
    for(const reset of [false,true]){
      const copy=structuredClone(x.run) as FoundingForces47;
      if(reset)for(const row of Object.values(copy.armyAutonomy.armies))row.nextTick=0;
      const sweeps=Math.ceil(copy.world.armies.filter(a=>a.troops>0).length/5),batches:{cursor:number;changes:[number,Snap['armies'][number]][]}[]=[];
      copy.armyBatch!.lastTick=copy.clock.tick-20;
      const input=armyAiSnapshot(copy);let before=input;
      for(let k=0;k<sweeps;k++){
        copy.armyBatch!.lastTick=copy.clock.tick-20;
        issueArmyBatchOrders47(copy,weights);
        const after=armyAiSnapshot(copy);
        batches.push({cursor:after.cursor,changes:after.armies.flatMap((a,i)=>JSON.stringify(a)!==JSON.stringify(before.armies[i])?[[i,a] as [number,Snap['armies'][number]]]:[])});
        before=after;
      }
      samples.push({input,batches});
    }
  }
  const orders=samples.flatMap(s=>s.batches).filter(b=>b.changes.length).length;
  expect(orders).toBeGreaterThan(20);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/army-ai.json',JSON.stringify({statics,samples}));
},3600000);
