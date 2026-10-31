import {it,expect} from 'vitest';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {originalGridFor} from '../fms/original/original-document';
import {createNativeWorld,NATIVE_WORLD_OPTIONS} from './native-world';
import {nativeEconomyState,monthlyInputs,nativeTravelState} from './native-state';
import {diplomacyStatic,diplomacySnapshot,diplomacySchedule} from './diplomacy-state';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';
import militaryIcons from '../fms/play/military-icons.json';
import {originalCellProvinces} from '../fms/original/original-politics';
import {originalClimate,originalBiomeIds,originalBiomeLinear} from '../fms/original/original-biomes';
import {nationColor} from '../fms/play/politics';
import {originalCoast,} from '../fms/original/original-layers';
import {createFmsCoastDistance} from '../fms/ocean-coast';
import {FMS_OCEAN_EDGE_INTENSITY,FMS_OCEAN_SDF_BAND_HALF_WIDTH} from '../fms/ocean-surface';
import {ORIGINAL_PRESETS,originalSeaSrgb,originalParchmentRect} from '../fms/original/original-style';
import {originalRiverGeometry} from '../fms/original/original-rivers';
import {fmsStateLineColor} from '../fms/state-line';
import {stateLabelBoxes47} from '../fms/play/original-labels47';

/** Native iOS stage 2 resource export (ios-native/docs/PORTING.md): reads src only and writes one
 * real generated world into ios-native/Resources/World. The world is the original 20k grid with
 * seed 421730 continents terrain and the culture47 opening (day 0) — map data only, no rules.
 *
 * world.bin, little-endian:
 *   "LGJW" u32 version=1 · f32 width · f32 height · u32 cells · u32 vertices · u32 edges
 *   u32 offsets[cells+1] · f32 xy[vertices*2] · i16 elevation[cells] · u8 biome[cells]
 *   (pad to 4) · i32 province[cells] (−1 sea) · u8 biomeRGB[cells*3] (pad to 4)
 *   edges: i32 a · i32 b (−1 map border) · f32 x1 · f32 y1 · f32 x2 · f32 y2
 *   (version 2) f32 site[cells*2] · u32 seaW · u32 seaH · u8 seaRGBA[seaW*seaH*4]
 *   · u32 coastSegments · f32 coast[n*4] (smoothed coastline) · u32 riverVertices · f32 river[n*2] (triangles)
 * world.json: provinces, nations (with the state-line colour), cities, nation label boxes, the opening chronicle,
 * the parchment rectangle and the source hashes. The sea, rivers and labels use the web's
 * reference-paper appearance (ORIGINAL_PRESETS[7] with sea 0x8eafb1 → 0x527c86).
 * Run with EXPORT_NATIVE_WORLD=1; the ordinary test suite skips it. */
const OUT='ios-native/Resources/World';
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports the stage-2 native world resources',async()=>{
  const {terrain,snapshot}=await createNativeWorld(),run=snapshot.run,options=NATIVE_WORLD_OPTIONS;
  const grid=(await originalGridFor(terrain))!;
  const province=originalCellProvinces(terrain,run.world.provinces,run.scale);
  const biome=originalBiomeIds(grid,terrain,originalClimate(grid,terrain)),linear=originalBiomeLinear(grid,biome);
  const heights=terrain.elevations,coast=originalCoast(grid,heights),preset={...ORIGINAL_PRESETS[7],shallowSea:0x8eafb1,deepSea:0x527c86,stateMapTransparency:.78};
  const seaW=800,seaH=450,cap=Math.max(grid.width,grid.height)*FMS_OCEAN_EDGE_INTENSITY,distance=createFmsCoastDistance(coast.segments,cap+FMS_OCEAN_SDF_BAND_HALF_WIDTH),sea=new Uint8Array(seaW*seaH*4);
  for(let y=0;y<seaH;y++)for(let x=0;x<seaW;x++){const d=Math.max(0,distance((x+.5)*grid.width/seaW,(y+.5)*grid.height/seaH)-FMS_OCEAN_SDF_BAND_HALF_WIDTH),c=originalSeaSrgb(preset,coast.segments.length?d/cap:1),o=(y*seaW+x)*4;
    sea[o]=Math.round(c[0]*255);sea[o+1]=Math.round(c[1]*255);sea[o+2]=Math.round(c[2]*255);sea[o+3]=255;}
  const rivers=originalRiverGeometry(grid,terrain,originalClimate(grid,terrain)).positions;
  const cells=grid.polygons.length,vertices=grid.polygons.reduce((n,p)=>n+p.length/2,0),edges=grid.edges.length;
  const pad=(n:number)=>(n+3)&~3;
  const size=4*7+4*(cells+1)+8*vertices+pad(2*cells+cells)+4*cells+pad(3*cells)+24*edges+8*cells+8+sea.length+4+16*coast.segments.length+4+4*rivers.length;
  const buf=new ArrayBuffer(size),view=new DataView(buf);let o=0;
  const u32=(v:number)=>{view.setUint32(o,v,true);o+=4;},i32=(v:number)=>{view.setInt32(o,v,true);o+=4;},f32=(v:number)=>{view.setFloat32(o,v,true);o+=4;};
  u32(0x574a474c);u32(2);f32(grid.width);f32(grid.height);u32(cells);u32(vertices);u32(edges);
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
  for(const [x,y] of grid.points){f32(x);f32(y);}
  u32(seaW);u32(seaH);new Uint8Array(buf,o,sea.length).set(sea);o+=sea.length;
  u32(coast.segments.length);for(const [x1,y1,x2,y2] of coast.segments){f32(x1);f32(y1);f32(x2);f32(y2);}
  u32(rivers.length/2);for(const v of rivers)f32(v);
  expect(o).toBe(size);
  const sc=run.scale,world=run.world;
  // Nation name boxes as the web lays them out (map.ts: one box per state, single-province states under 30 cells hidden).
  const owners=world.provinces.map(p=>p.controller),singles=new Map<string,number>();for(const id of owners)singles.set(id,(singles.get(id)??0)+1);
  const labelBoxes=stateLabelBoxes47({cellsX:grid.cellsX,points:grid.points},c=>heights[c]>=20&&province[c]>=0?owners[province[c]]:null,(key,cellCount)=>singles.get(key)===1&&cellCount<30)
    .map(b=>({nation:world.nations.findIndex(n=>n.id===b.key),x:b.x,y:b.y,width:b.width,height:b.height,fontMax:b.fontMax,fontMin:b.fontMin}));
  const meta={format:'lieguoji-native-world',version:1,seed:options.seed,template:options.template,grid:grid.id,
    provinces:world.provinces.map(p=>({id:p.id,name:p.name,x:p.center.x/sc,y:p.center.y/sc,nation:world.nations.findIndex(n=>n.id===p.controller),terrain:p.terrain})),
    nations:world.nations.map(n=>({id:n.id,name:n.name,color:nationColor(n),line:'#'+fmsStateLineColor(nationColor(n)).toString(16).padStart(6,'0'),capital:world.cities.findIndex(c=>c.id===n.capitalId),
      culture:run.civilization.nations[n.id].cultureId,polity:run.civilization.nations[n.id].polity,religion:run.civilization.nations[n.id].religionId})),
    labels:labelBoxes,parchment:originalParchmentRect(grid.width,grid.height),
    // Simulation start (provinces, policies, wars, armies) for the Swift engine.
    economy:nativeEconomyState(run),
    // Army motion (travel.bin graph): normalized→map scale, scaled seconds per tick, each army's travel cell and point, speed.
    travel:nativeTravelState(run),
    // Diplomacy (Swift DeclarationEngine): static geography, the day-0 snapshot and the monthly calendar.
    diplomacy:{statics:diplomacyStatic(run as PoliticalRun47),world:diplomacySnapshot(run as PoliticalRun47),schedule:diplomacySchedule(run as PoliticalRun47)},
    // Month-end treasury and destiny inputs on day 0 (static parts: resources, cells, offices, livelihood).
    monthly:monthlyInputs(structuredClone(run)),
    // The opening chronicle (CultureNews47 shows these at the start), day 0.
    events:run.chronicle.entries.slice(0,12).map(e=>({day:e.day,text:e.text,reason:e.reason})),
    cities:world.cities.map(c=>({id:c.id,name:c.name,x:c.position.x/sc,y:c.position.y/sc,province:world.provinces.findIndex(p=>p.id===c.provinceId)})),
    source:{} as Record<string,string>};
  const bin=new Uint8Array(buf);
  for(const f of ['src/fms/original/original-grid.ts','src/fms/original/original-biomes.ts','src/fms/original/original-politics.ts','src/fms/full-map-terrain.ts','src/fms/play/culture47-session.ts','src/native-export/world-export.test.ts','src/fms/original/original-layers.ts','src/fms/original/original-rivers.ts','src/fms/play/original-labels47.ts','src/fms/original/assets/parchment.jpg','src/fms/play/assets/tw-kai-subset.woff2'])
    meta.source[f]=createHash('sha256').update(await readFile(f)).digest('hex');
  meta.source['world.bin']=createHash('sha256').update(bin).digest('hex');
  expect(meta.provinces.length).toBeGreaterThan(50);expect(meta.nations).toHaveLength(8);
  await mkdir(OUT,{recursive:true});
  await writeFile(`${OUT}/world.bin`,bin);
  await writeFile(`${OUT}/world.json`,JSON.stringify(meta));
  // The original unit icons the web draws armies with (military-icons.json).
  for(const [key,url] of Object.entries(militaryIcons))await writeFile(`${OUT}/unit-${key}.png`,Buffer.from((url as string).split(',')[1],'base64'));
  // The original's parchment (sharedassets0 parchmentfinal2), the same reviewed file the web ships.
  await writeFile(`${OUT}/parchment.jpg`,await readFile('src/fms/original/assets/parchment.jpg'));
},300000);
