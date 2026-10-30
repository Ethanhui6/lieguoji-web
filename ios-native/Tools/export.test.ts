import {it,expect} from 'vitest';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createFmsOriginalDocument,originalGridFor} from '../../src/fms/original/original-document';
import {generateFmsFullMap} from '../../src/fms/full-map-terrain';
it('exports real original-grid terrain',async()=>{
 const doc=await createFmsOriginalDocument('20k');
 const grid=(await originalGridFor(doc))!;
 const {elevations}=await generateFmsFullMap(doc,{seed:'421730',template:'continents'},{yieldTask:async()=>{}});
 const cells=grid.polygons.flatMap((p,i)=>elevations[i]>=20?[{points:Array.from(p),height:elevations[i]}]:[]);
 expect(cells.length).toBeGreaterThan(1000);
 const data=JSON.stringify({width:1600,height:900,cells});
 await writeFile('ios-native/Resources/terrain.json',data);
 await writeFile('ios-native/Resources/SOURCE.md',`# Terrain source\nOriginal grid-20k.ts; recovered-height-original-grid-v1; continents seed 421730.\nLand cells: ${cells.length}. SHA256 terrain.json: ${createHash('sha256').update(data).digest('hex')}\nGenerated read-only from src; no personal saves. Runtime is Swift/Metal.\n`);
});


