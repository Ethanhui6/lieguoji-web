import {it,expect} from 'vitest';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createFmsOriginalDocument,originalGridFor} from '../fms/original/original-document';
import {generateFmsFullMap,prepareFmsFullMapPreview} from '../fms/full-map-terrain';
import {Culture47Session,type Culture47Opening} from '../fms/play/culture47-session';
import {SETTLEMENT47_ALGORITHM} from '../fms/play/settlement47-regions';
import {originalCellProvinces} from '../fms/original/original-politics';
import {originalClimate,originalBiomeIds,originalBiomeLinear} from '../fms/original/original-biomes';
import {nationColor} from '../fms/play/politics';

/** Native iOS stage 2 resource export (ios-native/docs/PORTING.md): reads src only and writes one
 * real generated world into ios-native/Resources/World. The world is the original 20k grid with
 * seed 421730 continents terrain and the culture47 opening (day 0) — map data only, no rules.
 *
 * world.bin, little-endian:
 *   "LGJW" u32 version=1 · f32 width · f32 height · u32 cells · u32 vertices · u32 edges
 *   u32 offsets[cells+1] · f32 xy[vertices*2] · i16 elevation[cells] · u8 biome[cells]
 *   (pad to 4) · i32 province[cells] (−1 sea) · u8 biomeRGB[cells*3] (pad to 4)
 *   edges: i32 a · i32 b (−1 map border) · f32 x1 · f32 y1 · f32 x2 · f32 y2
 * world.json: provinces, nations, cities and the source hashes.
 * Run with EXPORT_NATIVE_WORLD=1; the ordinary test suite skips it. */
const OUT='ios-native/Resources/World';
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports the stage-2 native world resources',async()=>{
  const blank=await createFmsOriginalDocument('20k');
  blank.worldId='42173000-0000-4000-8000-000000000001';
  const options={seed:'421730',template:'continents'} as const;
  const terrain=(await prepareFmsFullMapPreview(blank,{worldId:blank.worldId,baseRevision:blank.revision,
    ...await generateFmsFullMap(blank,options,{yieldTask:async()=>{}})},options)).document;
  const opening:Culture47Opening={terrain,count:8,cityCount:80,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,
    setup:{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman','german']},families:'original'};
  const {run}=new Culture47Session().create(opening);
  const grid=(await originalGridFor(terrain))!;
  const province=originalCellProvinces(terrain,run.world.provinces,run.scale);
  const biome=originalBiomeIds(grid,terrain,originalClimate(grid,terrain)),linear=originalBiomeLinear(grid,biome);
  const cells=grid.polygons.length,vertices=grid.polygons.reduce((n,p)=>n+p.length/2,0),edges=grid.edges.length;
  const pad=(n:number)=>(n+3)&~3;
  const size=4*7+4*(cells+1)+8*vertices+pad(2*cells+cells)+4*cells+pad(3*cells)+24*edges;
  const buf=new ArrayBuffer(size),view=new DataView(buf);let o=0;
  const u32=(v:number)=>{view.setUint32(o,v,true);o+=4;},i32=(v:number)=>{view.setInt32(o,v,true);o+=4;},f32=(v:number)=>{view.setFloat32(o,v,true);o+=4;};
  u32(0x574a474c);u32(1);f32(grid.width);f32(grid.height);u32(cells);u32(vertices);u32(edges);
  let v=0;for(const p of grid.polygons){u32(v);v+=p.length/2;}u32(v);
  for(const p of grid.polygons)for(const x of p)f32(x);
  for(let c=0;c<cells;c++){view.setInt16(o,terrain.elevations[c],true);o+=2;}
  for(let c=0;c<cells;c++)view.setUint8(o++,biome[c]);
  o=pad(o);
  for(let c=0;c<cells;c++)i32(terrain.elevations[c]>=20?province[c]:-1);
  const srgb=(x:number)=>Math.round(255*(x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055));
  for(let c=0;c<cells*3;c++)view.setUint8(o++,Math.max(0,Math.min(255,srgb(linear[c]))));
  o=pad(o);
  for(const e of grid.edges){i32(e.a);i32(e.b);const s=e.segment as unknown as {x1?:number;y1?:number;x2?:number;y2?:number}&ArrayLike<number>;
    const [x1,y1,x2,y2]=s.length===4?[s[0],s[1],s[2],s[3]]:[s.x1!,s.y1!,s.x2!,s.y2!];f32(x1);f32(y1);f32(x2);f32(y2);}
  expect(o).toBe(size);
  const sc=run.scale,world=run.world;
  const meta={format:'lieguoji-native-world',version:1,seed:options.seed,template:options.template,grid:grid.id,
    provinces:world.provinces.map(p=>({id:p.id,name:p.name,x:p.center.x/sc,y:p.center.y/sc,nation:world.nations.findIndex(n=>n.id===p.controller),terrain:p.terrain})),
    nations:world.nations.map(n=>({id:n.id,name:n.name,color:nationColor(n),capital:world.cities.findIndex(c=>c.id===n.capitalId),
      culture:run.civilization.nations[n.id].cultureId,polity:run.civilization.nations[n.id].polity,religion:run.civilization.nations[n.id].religionId})),
    cities:world.cities.map(c=>({id:c.id,name:c.name,x:c.position.x/sc,y:c.position.y/sc,province:world.provinces.findIndex(p=>p.id===c.provinceId)})),
    source:{} as Record<string,string>};
  const bin=new Uint8Array(buf);
  for(const f of ['src/fms/original/original-grid.ts','src/fms/original/original-biomes.ts','src/fms/original/original-politics.ts','src/fms/full-map-terrain.ts','src/fms/play/culture47-session.ts','src/native-export/world-export.test.ts'])
    meta.source[f]=createHash('sha256').update(await readFile(f)).digest('hex');
  meta.source['world.bin']=createHash('sha256').update(bin).digest('hex');
  expect(meta.provinces.length).toBeGreaterThan(50);expect(meta.nations).toHaveLength(8);
  await mkdir(OUT,{recursive:true});
  await writeFile(`${OUT}/world.bin`,bin);
  await writeFile(`${OUT}/world.json`,JSON.stringify(meta));
},300000);
