import {it,expect} from 'vitest';
import {writeFile} from 'node:fs/promises';
import {createFmsOriginalDocument,originalGridFor} from '../fms/original/original-document';

/** 原作 20k 格网的共享 Voronoi 边（双精度，原生建世界画海岸线与河口用）。
 * edges20k.bin，小端："LGGE" u32 版本 1 · u32 边数 · 每条 i32 a · i32 b（−1 为地图边界）· f64 x1 · f64 y1 · f64 x2 · f64 y2。
 * 顺序即 buildOriginalGrid 的 grid.edges。用 EXPORT_NATIVE_WORLD=1 运行。 */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports the original 20k grid edges',async()=>{
  const grid=(await originalGridFor(await createFmsOriginalDocument('20k')))!;
  const buf=new ArrayBuffer(12+grid.edges.length*40),v=new DataView(buf);let o=0;
  v.setUint32(o,0x4547474c,true);o+=4;v.setUint32(o,1,true);o+=4;v.setUint32(o,grid.edges.length,true);o+=4;
  for(const e of grid.edges){v.setInt32(o,e.a,true);o+=4;v.setInt32(o,e.b,true);o+=4;for(const x of e.segment){v.setFloat64(o,x,true);o+=8;}}
  expect(o).toBe(buf.byteLength);
  await writeFile('ios-native/Resources/World/edges20k.bin',new Uint8Array(buf));
},120000);
