import {it,expect,vi} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createFmsOriginalDocument,originalGridFor} from '../fms/original/original-document';
import {generateRecoveredHeights} from '../world/recovered-terrain/engine';
import {SETTLEMENT47_ALGORITHM} from '../fms/play/settlement47-regions';
import {createCivilizationWorld47} from '../fms/play/civilization47-world';
import {buildHarbors46} from '../fms/play/war46-geography';
import {seaGraph} from '../fms/play/sea-path';
import {harborCells42} from '../fms/play/war42-harbor';
import type {FmsDocument} from '../fms/model';
import type {World} from '../sim/types';

/** Golden sea geography (seaGraph) and capital harbours (buildHarbors46 'capital-neighbor-v1') on the
 * four creation-golden worlds: input provinces/cities, a node digest, the coastal ports and the layout.
 * Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports harbour golden samples',async()=>{
  vi.spyOn(crypto,'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000047');
  const doc=await createFmsOriginalDocument('20k'),grid=(await originalGridFor(doc))!;
  const setup={mode:'culture-generated' as const,enabled:['chinese','japanese','english','arab','roman','german'] as never};
  const samples:unknown[]=[];
  for(const [seed,template,cities,count,relations] of [['421730','continents',80,8,'peace'],['777','pangea',120,12,'war'],['421730','highIsland',40,5,'peace'],['777','archipelago',80,24,'war']] as const){
    const heights=await generateRecoveredHeights(grid,seed,template);
    const d:FmsDocument={...doc,worldId:'42173000-0000-4000-8000-000000000000',elevations:Int32Array.from(heights)} as FmsDocument;
    const created=createCivilizationWorld47(d,count,cities,relations,setup,SETTLEMENT47_ALGORITHM,undefined,'original') as unknown as {world:World};
    const world=created.world,g=seaGraph(d,world),harbors=buildHarbors46({terrain:d,world}),openSea=buildHarbors46({terrain:d,world},'capital-neighbor-v2');
    const nodes=[...g.nodes.values()];
    samples.push({seed,template,cities,count,heights:Buffer.from(heights).toString('base64'),
      provinces:world.provinces.map(p=>({id:p.id,polygon:p.polygon})),cityList:world.cities.map(c=>({id:c.id,provinceId:c.provinceId,position:c.position})),
      nodes:{count:nodes.length,ids:nodes.map(n=>n.id),components:nodes.map(n=>n.component),ocean:nodes.map(n=>n.ocean?1:0),links:nodes.map(n=>n.links.length),
        sample:nodes.filter((_,i)=>i%97===0).map(n=>({id:n.id,center:n.center,polygon:n.polygon,links:n.links}))},
      ports:g.ports,portCells:Object.fromEntries(g.ports.map(p=>[p.id,[...harborCells42(g,p.id)]])),harbors,openSea});
  }
  expect(samples.length).toBe(4);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/harbor.json',JSON.stringify({samples}));
},900000);
