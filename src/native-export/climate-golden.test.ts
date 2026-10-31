import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createFmsOriginalDocument,originalGridFor} from '../fms/original/original-document';
import {generateRecoveredHeights} from '../world/recovered-terrain/engine';
import {settlementBiomeData} from '../fms/play/settlement25-biomes';
import type {FmsDocument} from '../fms/model';

/** The 20k drawing document (doc20k.bin) and golden climate / river / biome data.
 *
 * doc20k.bin, little endian: "LGDC" u32 version 1 · f64 width · f64 height · u32 points · f64 xy[points*2]
 *   · u32 triangleIndices · u32 triangles[…] · u32 neighbourOffsets[points+1] · u32 neighbours[…]
 * climate.json: for 2 seeds × 4 templates, settlementBiomeData of the generated terrain (base64 arrays).
 * Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports the document and climate golden samples',async()=>{
  const doc=await createFmsOriginalDocument('20k'),grid=(await originalGridFor(doc))!;
  const n=doc.points.length,tri=doc.triangles.length,links=doc.neighbors.reduce((s,a)=>s+a.length,0);
  const size=8+16+4+16*n+4+4*tri+4*(n+1)+4*links,buf=new ArrayBuffer(size),v=new DataView(buf);let o=0;
  const u32=(x:number)=>{v.setUint32(o,x,true);o+=4;},f64=(x:number)=>{v.setFloat64(o,x,true);o+=8;};
  u32(0x4344474c);u32(1);f64(doc.width);f64(doc.height);u32(n);for(const [x,y] of doc.points){f64(x);f64(y);}
  u32(tri);for(const t of doc.triangles)u32(t);
  let k=0;for(const a of doc.neighbors){u32(k);k+=a.length;}u32(k);for(const a of doc.neighbors)for(const id of a)u32(id);
  expect(o).toBe(size);
  await mkdir('ios-native/Resources/World',{recursive:true});
  await writeFile('ios-native/Resources/World/doc20k.bin',new Uint8Array(buf));
  const b64=(a:ArrayBufferView)=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
  const samples:unknown[]=[];
  for(const seed of ['421730','777'])for(const template of ['continents','pangea','archipelago','highIsland'] as const){
    const heights=await generateRecoveredHeights(grid,seed,template);
    const d:FmsDocument={...doc,elevations:Int32Array.from(heights)} as FmsDocument;
    const s=settlementBiomeData(d);
    samples.push({seed,template,heights:b64(heights),ids:b64(s.ids),precipitation:b64(s.precipitation),temperatures:b64(s.temperatures),
      riverIds:b64(s.rivers.riverIds),segments:s.rivers.segments.flat(),riverCount:s.rivers.riverCount});
  }
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/climate.json',JSON.stringify({samples}));
},600000);
