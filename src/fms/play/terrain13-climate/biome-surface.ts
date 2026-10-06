import { assertFmsDocument, type FmsDocument } from '../../model';
import { FMS_BIOMES, FMS_CLIMATE_ALGORITHM, FMS_CLIMATE_DEFAULTS, FmsClimateError, generateFmsClimateGrid, recoveredBiome, recoveredTemperature } from './climate';
import { srgbToLinear } from './height-palette';
import { deriveFmsClimateRivers, recoveredRiverMoisture, type FmsClimateRivers } from './climate-rivers';

/** Grid is a climate calculation surface, never a replacement for the visible
 * coast/geometry. We sample the SAME float32 triangles the renderer uploads. */
export function sampleFmsClimateHeights(doc: FmsDocument, columns: number, rows: number): Uint8Array {
  if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns>192||rows>192)throw new FmsClimateError();
  const heights=new Uint8Array(columns*rows),covered=new Uint8Array(heights.length);
  const points=doc.points.map(([x,y])=>[Math.fround(x),Math.fround(y)]),stepX=doc.width/columns,stepY=doc.height/rows;
  const cross=(ax:number,ay:number,bx:number,by:number)=>ax*by-ay*bx;
  let work=0;
  for(let t=0;t<doc.triangles.length;t+=3){
    const ia=doc.triangles[t],ib=doc.triangles[t+1],ic=doc.triangles[t+2],a=points[ia],b=points[ib],c=points[ic];
    const area=cross(b[0]-a[0],b[1]-a[1],c[0]-a[0],c[1]-a[1]);if(area===0)continue;
    const x0=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0])/stepX-.5)),x1=Math.min(columns-1,Math.floor(Math.max(a[0],b[0],c[0])/stepX-.5));
    const y0=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1])/stepY-.5)),y1=Math.min(rows-1,Math.floor(Math.max(a[1],b[1],c[1])/stepY-.5));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      if(++work>4_000_000)throw new FmsClimateError('这张地图的气候采样超出本次预算，请先使用高度或阴影视图。');
      const id=y*columns+x;if(covered[id])continue;
      const px=(x+.5)*stepX,py=(y+.5)*stepY;
      const u=cross(b[0]-px,b[1]-py,c[0]-px,c[1]-py)/area,v=cross(c[0]-px,c[1]-py,a[0]-px,a[1]-py)/area,w=1-u-v;
      if(u < -1e-8||v < -1e-8||w < -1e-8)continue;
      // Integer climate sampling is a web bridge. It never changes source h.
      heights[id]=Math.min(100,Math.max(0,u*doc.elevations[ia]+v*doc.elevations[ib]+w*doc.elevations[ic]));covered[id]=1;
    }
  }
  return heights;
}

export interface FmsBiomeSurface {
  ids: Uint8Array; colors: Float32Array; temperatures: Int8Array; precipitation: Uint8Array; rivers:FmsClimateRivers;
  stats: {algorithm:string;columns:number;rows:number;counts:number[];minTemperature:number|null;maxTemperature:number|null;riverMoisture:true;riverChangedBiomes:number;riverStats:FmsClimateRivers['stats'];bytes:number};
}
const palette=FMS_BIOMES.map(([,hex])=>[1,3,5].map(start=>srgbToLinear(parseInt(hex.slice(start,start+2),16)/255)));
/** Climate is derived from current terrain. No biome field is silently inserted
 * in v1/v2 documents. Original river ids/flux are NOT approximated with area. */
export function deriveFmsBiomeSurface(doc:FmsDocument):FmsBiomeSurface {
  assertFmsDocument(doc);
  const longest=Math.max(doc.width,doc.height),columns=Math.max(2,Math.round(doc.width/longest*192)),rows=Math.max(2,Math.round(doc.height/longest*192));
  const heights=sampleFmsClimateHeights(doc,columns,rows),climate=generateFmsClimateGrid(heights,columns,rows);
  const references=doc.points.map(([x,y])=>Math.min(rows-1,Math.floor(y/doc.height*rows))*columns+Math.min(columns-1,Math.floor(x/doc.width*columns)));
  // Temperature must use the actual vertex height: a narrow summit/island can
  // fall between climate samples. Only precipitation is resampled from grid.
  const temperatures=Int8Array.from(doc.elevations,(h,i)=>recoveredTemperature(Math.min(100,Math.max(0,h)),FMS_CLIMATE_DEFAULTS.north-doc.points[i][1]/doc.height*(FMS_CLIMATE_DEFAULTS.north-FMS_CLIMATE_DEFAULTS.south)));
  const ids=new Uint8Array(doc.points.length),precipitation=Uint8Array.from(references,i=>climate.precipitation[i]);
  const rivers=deriveFmsClimateRivers(doc,precipitation);
  const colors=new Float32Array(ids.length*3),counts=new Array<number>(13).fill(0);
  let min=Infinity,max=-Infinity,riverChangedBiomes=0;
  for(let i=0;i<ids.length;i++){
    let sum=precipitation[i],n=1;
    for(const j of doc.neighbors[i])if(doc.elevations[j]>=20){sum+=precipitation[j];n++;}
    const rainfallOnly=recoveredBiome(Math.round(4+sum/n),temperatures[i],doc.elevations[i],false);
    ids[i]=recoveredBiome(recoveredRiverMoisture(i,doc.elevations,doc.neighbors,precipitation,rivers),temperatures[i],doc.elevations[i],Boolean(rivers.riverIds[i]));counts[ids[i]]++;
    if(ids[i]!==rainfallOnly)riverChangedBiomes++;
    if(doc.elevations[i]>=20){min=Math.min(min,temperatures[i]);max=Math.max(max,temperatures[i]);}
  }
  for(let i=0;i<ids.length;i++){
    const land=doc.elevations[i]>=20,base=palette[ids[i]],rgb=land?base.map(c=>c*10):[0,0,0];let weight=land?10:0;
    // Linear RGB neighbor blend, followed by the existing continuous mesh.
    // Sea vertices borrow adjoining land colors only to support interpolation;
    // their ids stay marine and the shader's h20 coast still controls coverage.
    for(const j of doc.neighbors[i])if(doc.elevations[j]>=20){const c=palette[ids[j]];for(let k=0;k<3;k++)rgb[k]+=c[k];weight++;}
    for(let k=0;k<3;k++)colors[i*3+k]=weight?rgb[k]/weight:base[k];
  }
  return {ids,colors,temperatures,precipitation,rivers,stats:{algorithm:FMS_CLIMATE_ALGORITHM,columns,rows,counts,minTemperature:Number.isFinite(min)?min:null,maxTemperature:Number.isFinite(max)?max:null,riverMoisture:true,riverChangedBiomes,riverStats:rivers.stats,bytes:ids.byteLength+colors.byteLength+temperatures.byteLength+precipitation.byteLength+rivers.stats.bytes}};
}

type Entry={doc:FmsDocument;surface:FmsBiomeSurface};
export class FmsBiomeFields {
  private entries:Entry[]=[];
  private builds=0;
  private elapsed=0;
  get(doc:FmsDocument):FmsBiomeSurface {
    const index=this.entries.findIndex(e=>e.doc.elevations===doc.elevations&&e.doc.points===doc.points&&e.doc.triangles===doc.triangles&&e.doc.neighbors===doc.neighbors&&e.doc.width===doc.width&&e.doc.height===doc.height);
    if(index>=0){const [entry]=this.entries.splice(index,1);this.entries.unshift(entry);return entry.surface;}
    const start=performance.now(),surface=deriveFmsBiomeSurface(doc);this.elapsed=performance.now()-start;this.builds++;
    this.entries.unshift({doc,surface});if(this.entries.length>3)this.entries.pop();return surface;
  }
  metrics(){return {builds:this.builds,elapsedMs:this.elapsed,entries:this.entries.length,bytes:this.entries.reduce((sum,e)=>sum+e.surface.stats.bytes,0),...FMS_CLIMATE_DEFAULTS};}
  clear(){this.entries=[];}
}
