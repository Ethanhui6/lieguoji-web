import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createFmsOriginalDocument,originalGridFor} from '../fms/original/original-document';
import {generateRecoveredHeights} from '../world/recovered-terrain/engine';
import {settlementRegions47} from '../fms/play/settlement47-regions';
import {landFaces} from '../fms/play/settlement25-mesh';
import type {FmsDocument} from '../fms/model';

/** Golden samples for the Swift province partition (settlement47-regions settlementRegions47 over
 * settlement25 regions / cuts / perimeter unions): 2 seeds × 4 templates × 3 city counts.
 * Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports province partition golden samples',async()=>{
  const doc=await createFmsOriginalDocument('20k'),grid=(await originalGridFor(doc))!;
  const samples:unknown[]=[];
  for(const seed of ['421730','777'])for(const template of ['continents','pangea','archipelago','highIsland'] as const){
    const heights=await generateRecoveredHeights(grid,seed,template);
    const d:FmsDocument={...doc,elevations:Int32Array.from(heights)} as FmsDocument;
    const faces=landFaces(d);
    for(const cities of [40,80,120]){
      let out;try{out=settlementRegions47(d,cities);}catch(e){samples.push({seed,template,cities,heights:Buffer.from(heights).toString('base64'),faces:faces.length,error:(e as Error).message});continue;}
      samples.push({seed,template,cities,heights:Buffer.from(heights).toString('base64'),faces:faces.length,algorithm:out.algorithm,
        regions:out.regions.map(r=>({members:r.members,x:r.center.x,y:r.center.y,height:r.height,area:r.area,neighbors:[...r.neighbors],ring:r.ring.map(v=>v.key)}))});
    }
  }
  expect(samples.length).toBe(24);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/regions.json',JSON.stringify({samples}));
},900000);
