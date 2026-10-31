import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createFmsOriginalDocument,originalGridFor} from '../fms/original/original-document';
import {generateRecoveredHeights} from '../world/recovered-terrain/engine';
import {settlementRegions47} from '../fms/play/settlement47-regions';
import {defaultLayout47} from '../fms/play/opening-layout47';
import {initialCivilization47,nationName47,cityName47} from '../fms/play/civilization47-names';
import {CULTURE_IDS47,CULTURES47} from '../fms/play/civilization47-catalog';
import type {FmsDocument} from '../fms/model';

/** The culture name catalogue (cultures.json) and golden openings: nation seeds and territory
 * (opening-layout47 defaultLayout47), cultures, religions, polities, state and city names
 * (civilization47-names initialCivilization47) on generated partitions. Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports cultures and opening golden samples',async()=>{
  const cultures=CULTURE_IDS47.map(id=>{const c=CULTURES47[id];return {id,label:c.label,suggestedReligion:c.suggestedReligion,suggestedPolity:c.suggestedPolity,
    stateRoots:c.stateRoots,stateEnds:c.stateEnds,cityRoots:c.cityRoots,cityEnds:c.cityEnds,historicalStates:c.historicalStates,historicalCities:c.historicalCities};});
  await mkdir('ios-native/Resources/World',{recursive:true});
  await writeFile('ios-native/Resources/World/cultures.json',JSON.stringify(cultures));
  const doc=await createFmsOriginalDocument('20k'),grid=(await originalGridFor(doc))!;
  const setups=[{mode:'culture-generated' as const,enabled:['chinese','japanese','english','arab','roman','german'] as never},
    {mode:'historical-names' as const,enabled:['chinese','roman','persian','norse'] as never}];
  const samples:unknown[]=[];
  for(const [seed,template,cities,count] of [['421730','continents',80,8],['777','pangea',120,12],['421730','highIsland',40,5],['777','archipelago',80,24]] as const){
    const heights=await generateRecoveredHeights(grid,seed,template);
    const d:FmsDocument={...doc,elevations:Int32Array.from(heights)} as FmsDocument;
    const regions=settlementRegions47(d,cities).regions,layout=defaultLayout47(regions,count);
    for(const [k,setup] of setups.entries()){
      const worldId=`42173000-0000-4000-8000-00000000000${k}`,c=initialCivilization47(worldId,count,layout.owners,setup);
      samples.push({seed,template,cities,count,worldId,setup,heights:Buffer.from(heights).toString('base64'),seeds:layout.seeds,owners:layout.owners,
        nations:Object.keys(c.nations).sort((a,b)=>+a.slice(2)-+b.slice(2)).map(id=>{const n=c.nations[id];return {cultureId:n.cultureId,religionId:n.religionId,polity:n.polity,name:n.name.value,sourceKey:n.name.sourceKey,full:nationName47(n)};}),
        cityNames:regions.map((_,i)=>cityName47(c.cities['c-'+i])),cityCultures:regions.map((_,i)=>c.cities['c-'+i].cultureId)});
    }
  }
  expect(samples.length).toBe(8);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/opening.json',JSON.stringify({samples}));
},900000);
