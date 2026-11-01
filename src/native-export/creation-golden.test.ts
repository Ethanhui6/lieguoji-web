import {it,expect,vi} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createFmsOriginalDocument,originalGridFor} from '../fms/original/original-document';
import {generateRecoveredHeights} from '../world/recovered-terrain/engine';
import {SETTLEMENT47_ALGORITHM} from '../fms/play/settlement47-regions';
import type {FmsDocument} from '../fms/model';

// Capture the web's own creation state at the point families are attached (civilization47-world
// createCivilizationWorld47 → attachFamilies47): the world with provinces, cities, nations and the
// statecraft ledger (initializeManagement), the civilization, chronicle, people and life.
const captured:unknown[]=[];
vi.mock('../fms/play/civilization47-family',async original=>{
  const m=await original<typeof import('../fms/play/civilization47-family')>();
  return {...m,attachFamilies47:(r:Parameters<typeof m.attachFamilies47>[0])=>{captured.push(structuredClone(r));return m.attachFamilies47(r);}};
});
const capturedNobility:unknown[]=[];
vi.mock('../fms/play/civilization47-nobility',async original=>{
  const m=await original<typeof import('../fms/play/civilization47-nobility')>();
  return {...m,attachNobility47:(r:Parameters<typeof m.attachNobility47>[0])=>{capturedNobility.push(structuredClone(r));return m.attachNobility47(r);}};
});
import {createCivilizationWorld47} from '../fms/play/civilization47-world';

/** Golden new worlds (createCivilizationWorld47): the base before attachFamilies47 (world, statecraft,
 * founding rulers and chronicle, people and life), the families and origins before attachNobility47, and the result. The run id is fixed. Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports world creation golden samples',async()=>{
  vi.spyOn(crypto,'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000047');
  const doc=await createFmsOriginalDocument('20k'),grid=(await originalGridFor(doc))!;
  const setups=[{mode:'culture-generated' as const,enabled:['chinese','japanese','english','arab','roman','german'] as never},
    {mode:'historical-names' as const,enabled:['chinese','roman','persian','norse'] as never}];
  const samples:unknown[]=[];
  for(const [seed,template,cities,count,relations] of [['421730','continents',80,8,'peace'],['777','pangea',120,12,'war'],['421730','highIsland',40,5,'peace'],['777','archipelago',80,24,'war']] as const){
    const heights=await generateRecoveredHeights(grid,seed,template);
    for(const [k,setup] of setups.entries()){
      const worldId=`42173000-0000-4000-8000-00000000000${k}`;
      const d:FmsDocument={...doc,worldId,elevations:Int32Array.from(heights)} as FmsDocument;
      captured.length=0;capturedNobility.length=0;const created=createCivilizationWorld47(d,count,cities,relations,setup,SETTLEMENT47_ALGORITHM,undefined,'original') as unknown as Record<string,unknown>;
      const strip=(v:unknown)=>{const rest={...v as Record<string,unknown>};delete rest.terrain;return rest;};
      // base: input of attachFamilies47; families: input of attachNobility47 (families, origins); created: the returned world.
      samples.push({seed,template,cities,count,relations,worldId,setup,heights:Buffer.from(heights).toString('base64'),base:strip(captured[0]),families:strip(capturedNobility[0]),created:strip(created)});
    }
  }
  expect(samples.length).toBe(8);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/creation.json',JSON.stringify({samples}));
},900000);
