import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createFmsOriginalDocument,originalGridFor} from '../fms/original/original-document';
import {generateRecoveredHeights} from '../world/recovered-terrain/engine';
import {SEED_TERRAIN_TEMPLATES} from '../world/seed-terrain';

/** The original 20k grid as the height generator reads it (grid20k.bin) and golden heightmaps.
 *
 * grid20k.bin, little endian: "LGGR" u32 version 1 · f64 width · f64 height · u32 cellsX · u32 cellsY
 *   · u32 cells · f64 points[cells*2] · u32 neighbourOffsets[cells+1] · u32 neighbours[…]
 * terrain.json: for 6 seeds × 4 templates, the generated heights (base64 of the Uint8Array).
 * Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports the grid and terrain golden samples',async()=>{
  const doc=await createFmsOriginalDocument('20k'),grid=(await originalGridFor(doc))!;
  const n=grid.points.length,links=grid.neighbors.reduce((s,a)=>s+a.length,0);
  const size=4*2+16+4*3+16*n+4*(n+1)+4*links,buf=new ArrayBuffer(size),v=new DataView(buf);let o=0;
  const u32=(x:number)=>{v.setUint32(o,x,true);o+=4;},f64=(x:number)=>{v.setFloat64(o,x,true);o+=8;};
  u32(0x5247474c);u32(1);f64(grid.width);f64(grid.height);u32(grid.cellsX);u32(grid.cellsY);u32(n);
  for(const [x,y] of grid.points){f64(x);f64(y);}
  let k=0;for(const a of grid.neighbors){u32(k);k+=a.length;}u32(k);
  for(const a of grid.neighbors)for(const id of a)u32(id);
  expect(o).toBe(size);
  await mkdir('ios-native/Resources/World',{recursive:true});
  await writeFile('ios-native/Resources/World/grid20k.bin',new Uint8Array(buf));
  const samples:{seed:string;template:string;heights:string}[]=[];
  for(const seed of ['421730','1','777','20261031','98765','lieguoji'])for(const t of SEED_TERRAIN_TEMPLATES){
    const h=await generateRecoveredHeights(grid,seed,t.id);
    samples.push({seed,template:t.id,heights:Buffer.from(h).toString('base64')});
  }
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/terrain.json',JSON.stringify({samples}));
},600000);
