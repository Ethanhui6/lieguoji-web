import type {FmsDocument} from '../model';
import type {World,Point} from '../../sim/types';
import {deriveFmsBiomeSurface} from './terrain13-climate/biome-surface';
import {analyzeElevation,nativeBiomeRatios} from './terrain13-native';
export type ProvinceTerrain=ReturnType<typeof analyzeElevation>&{biomes:number[];samples:number;area:number};
export type TerrainContext={version:1;algorithm:'clipped-face-biome-area-v1';provinces:Record<string,ProvinceTerrain>};
const area=(p:Point[])=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y;},0))/2;
export function contains(polygon:Point[],p:Point){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function terrainAt(world:World,context:TerrainContext,point:Point){const p=world.provinces.find(p=>contains(p.polygon,point));return p?context.provinces[p.id]:undefined;}
/** Web bridge: each clipped mesh face belongs wholly to an existing province.
 * Biomes use face area, not a fictitious native cell count. Mountain analysis
 * uses unique land source vertices of those faces. No land is re-partitioned. */
export function buildTerrainContext(doc:FmsDocument,world:World,scale:number):TerrainContext{
 const ids=deriveFmsBiomeSurface(doc).ids,points=doc.points.map(([x,y])=>({x:Math.fround(x),y:Math.fround(y)}));
 const groups=world.provinces.map(p=>({p,minX:Math.min(...p.polygon.map(v=>v.x)),maxX:Math.max(...p.polygon.map(v=>v.x)),minY:Math.min(...p.polygon.map(v=>v.y)),maxY:Math.max(...p.polygon.map(v=>v.y)),counts:new Array<number>(13).fill(0),vertices:new Set<number>(),area:0}));
 const cell=(n:number)=>Math.min(31,Math.max(0,Math.floor(n/1000*32))),bins=new Map<number,typeof groups>();
 for(const g of groups)for(let y=cell(g.minY);y<=cell(g.maxY);y++)for(let x=cell(g.minX);x<=cell(g.maxX);x++){const key=y*32+x,list=bins.get(key)??[];list.push(g);bins.set(key,list);}
 let work=0;
 for(let t=0;t<doc.triangles.length;t+=3){
  const tri=Array.from(doc.triangles.slice(t,t+3)),land=tri.filter(i=>doc.elevations[i]>=20);if(!tri.some(i=>doc.elevations[i]>20))continue;
  const ring:Point[]=[];
  for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3],ha=doc.elevations[a],hb=doc.elevations[b];if(ha>=20)ring.push(points[a]);if((ha>=20)!==(hb>=20)){const lo=Math.min(a,b),hi=Math.max(a,b),u=(20-doc.elevations[lo])/(doc.elevations[hi]-doc.elevations[lo]);ring.push({x:points[lo].x+u*(points[hi].x-points[lo].x),y:points[lo].y+u*(points[hi].y-points[lo].y)});}}
  const a=area(ring);if(a<1e-7)continue;
  const center={x:ring.reduce((s,p)=>s+p.x,0)/ring.length*scale,y:ring.reduce((s,p)=>s+p.y,0)/ring.length*scale};
  const matches=(bins.get(cell(center.y)*32+cell(center.x))??[]).filter(g=>{if(center.x<g.minX||center.x>g.maxX||center.y<g.minY||center.y>g.maxY)return false;work+=g.p.polygon.length;if(work>40_000_000)throw Error('地貌归属计算超出预算，原地图和存档未改变。');return contains(g.p.polygon,center);}),g=matches[0];
  if(matches.length!==1)throw Error('陆地面无法唯一匹配现有辖区，原存档未改变。');
  g.area+=a*scale*scale;for(const v of land){g.counts[ids[v]]+=a/land.length;g.vertices.add(v);}
 }
 const provinces:Record<string,ProvinceTerrain>={};for(const g of groups){if(!g.vertices.size)throw Error('辖区没有有效地貌样本，原存档未改变。');if(g.counts[0]!==0||Math.abs(g.area-area(g.p.polygon))>Math.max(1e-7,g.area*1e-7))throw Error('辖区陆地面积与地貌不一致，原存档未改变。');provinces[g.p.id]={biomes:nativeBiomeRatios(g.counts),...analyzeElevation([...g.vertices].map(i=>doc.elevations[i])),samples:g.vertices.size,area:g.area};}
 return{version:1,algorithm:'clipped-face-biome-area-v1',provinces};
}
export function assertTerrainSchema(v:unknown){
 const c=v as TerrainContext|undefined,unknown=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).some(k=>!keys.includes(k));
 // Only schema evolution locks both slots. Missing/null known values are
 // corruption; valid() rejects them and may recover the checked backup.
 if(unknown(c,['version','algorithm','provinces'])||(c?.version!=null&&c.version!==1)||(c?.algorithm!=null&&c.algorithm!=='clipped-face-biome-area-v1')||(c?.provinces&&typeof c.provinces==='object'&&!Array.isArray(c.provinces)&&Object.values(c.provinces).some(p=>unknown(p,['biomes','average','deviation','high','veryHigh','mountain','plateau','samples','area']))))throw Error('地貌存档含未来规则或未知字段，已锁定读写。');
}
export function assertTerrainContext(c:TerrainContext,w:World,pointCount:number){
 assertTerrainSchema(c);if(!c||c.version!==1||c.algorithm!=='clipped-face-biome-area-v1'||!c.provinces||typeof c.provinces!=='object'||Array.isArray(c.provinces))throw Error('地貌样本损坏。');const entries=Object.entries(c.provinces);if(entries.length!==w.provinces.length||entries.some(([id,p])=>!p||typeof p!=='object'||Array.isArray(p)||!w.provinces.some(p=>p.id===id)))throw Error('地貌辖区不完整。');
 for(const [,p] of entries){if(!Array.isArray(p.biomes)||p.biomes.length!==13||p.biomes[0]!==0||p.biomes.some(v=>!Number.isFinite(v)||v<0||v>1)||Math.abs(p.biomes.reduce((s,n)=>s+n,0)-1)>1e-5||!Number.isInteger(p.samples)||p.samples<1||p.samples>pointCount||![p.average,p.deviation,p.high,p.veryHigh,p.area].every(Number.isFinite)||p.average<20||p.average>2147483648||p.deviation<0||p.deviation>2147483648||p.high<0||p.high>1||p.veryHigh<0||p.veryHigh>p.high||p.area<=0||typeof p.mountain!=='boolean'||typeof p.plateau!=='boolean'||p.mountain!==((p.veryHigh>=Math.fround(.15)||p.high>=Math.fround(.30))&&p.deviation>5)||p.plateau!==(p.average>60&&!p.mountain))throw Error('地貌样本损坏。');}
}
