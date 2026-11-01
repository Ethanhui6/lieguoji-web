import {it,expect,vi} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createFmsOriginalDocument,originalGridFor} from '../fms/original/original-document';
import {generateRecoveredHeights} from '../world/recovered-terrain/engine';
import {SETTLEMENT47_ALGORITHM} from '../fms/play/settlement47-regions';
import {createCivilizationWorld47} from '../fms/play/civilization47-world';
import {attachGovernment47} from '../fms/play/civilization47-government';
import type {FmsDocument} from '../fms/model';

/** Golden government stage (attachGovernment47) on the four creation-golden worlds: the fields it adds
 * (terrain context, upper combat, finance, economy, destiny, units, tactics, army positions, opening)
 * and the world/statecraft it changes. The input is the creation output (creation.json). Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports government golden samples',async()=>{
  vi.spyOn(crypto,'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000047');
  const doc=await createFmsOriginalDocument('20k'),grid=(await originalGridFor(doc))!;
  const setup={mode:'culture-generated' as const,enabled:['chinese','japanese','english','arab','roman','german'] as never};
  const samples:unknown[]=[];
  for(const [seed,template,cities,count,relations] of [['421730','continents',80,8,'peace'],['777','pangea',120,12,'war'],['421730','highIsland',40,5,'peace'],['777','archipelago',80,24,'war']] as const){
    const heights=await generateRecoveredHeights(grid,seed,template);
    const d:FmsDocument={...doc,worldId:'42173000-0000-4000-8000-000000000000',elevations:Int32Array.from(heights)} as FmsDocument;
    const created=createCivilizationWorld47(d,count,cities,relations,setup,SETTLEMENT47_ALGORITHM,undefined,'original');
    const g=attachGovernment47(created as never) as unknown as Record<string,unknown>;
    const pick=(k:string[])=>Object.fromEntries(k.map(x=>[x,g[x]]));
    samples.push({seed,template,cities,count,relations,heights:Buffer.from(heights).toString('base64'),
      out:pick(['terrainContext','upperCombat','finance','economy','destiny','units','tactics','armyPositions','governmentOpening']),
      world:{armies:(g.world as {armies:unknown}).armies,statecraft:(g.world as {statecraft:unknown}).statecraft}});
  }
  expect(samples.length).toBe(4);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/opening-government.json',JSON.stringify({samples}));
},900000);
