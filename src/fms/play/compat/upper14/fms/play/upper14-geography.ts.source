import type {FmsDocument} from '../model';
import type {World,Point} from '../../sim/types';
import {deriveFmsBiomeSurface} from './terrain13-climate/biome-surface';
import type {TerrainContext as LandContext} from './terrain13-context';
import type {ProvinceCombat} from './upper14-state';
import {resetNativeProvinceDefense} from './native-combat/upper-efficiency';
const area=(p:Point[])=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-b.x*a.y;},0))/2;
function contains(polygon:Point[],p:Point){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
/** Web source-cell bridge: all original vertices of each clipped face,
 * including ocean vertices, are counted once for that province. Shared-border
 * vertices may occur in both provinces. First appearance follows source index.
 * This is not claimed to reproduce Unity cell ownership or insertion order. */
export function buildProvinceCombat(doc:FmsDocument,world:World,scale:number,land:LandContext):Record<string,ProvinceCombat>{
 const ids=deriveFmsBiomeSurface(doc).ids,points=doc.points.map(([x,y])=>({x:Math.fround(x),y:Math.fround(y)}));
 const groups=world.provinces.map(p=>({p,minX:Math.min(...p.polygon.map(v=>v.x)),maxX:Math.max(...p.polygon.map(v=>v.x)),minY:Math.min(...p.polygon.map(v=>v.y)),maxY:Math.max(...p.polygon.map(v=>v.y)),counts:new Array<number>(13).fill(0),vertices:new Set<number>(),area:0}));
 const cell=(n:number)=>Math.min(31,Math.max(0,Math.floor(n/1000*32))),bins=new Map<number,typeof groups>();
 for(const g of groups)for(let y=cell(g.minY);y<=cell(g.maxY);y++)for(let x=cell(g.minX);x<=cell(g.maxX);x++){const key=y*32+x,list=bins.get(key)??[];list.push(g);bins.set(key,list);}
 let work=0;
 for(let t=0;t<doc.triangles.length;t+=3){
  const tri=Array.from(doc.triangles.slice(t,t+3));if(!tri.some(i=>doc.elevations[i]>20))continue;
  const ring:Point[]=[];
  for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3],ha=doc.elevations[a],hb=doc.elevations[b];if(ha>=20)ring.push(points[a]);if((ha>=20)!==(hb>=20)){const lo=Math.min(a,b),hi=Math.max(a,b),u=(20-doc.elevations[lo])/(doc.elevations[hi]-doc.elevations[lo]);ring.push({x:points[lo].x+u*(points[hi].x-points[lo].x),y:points[lo].y+u*(points[hi].y-points[lo].y)});}}
  const a=area(ring);if(a<1e-7)continue;
  const center={x:ring.reduce((s,p)=>s+p.x,0)/ring.length*scale,y:ring.reduce((s,p)=>s+p.y,0)/ring.length*scale};
  const matches=(bins.get(cell(center.y)*32+cell(center.x))??[]).filter(g=>{if(center.x<g.minX||center.x>g.maxX||center.y<g.minY||center.y>g.maxY)return false;work+=g.p.polygon.length;if(work>40_000_000)throw Error('地貌归属计算超出预算，原地图和存档未改变。');return contains(g.p.polygon,center);}),g=matches[0];
  if(matches.length!==1)throw Error('陆地面无法唯一匹配现有辖区，原存档未改变。');
  g.area+=a*scale*scale;for(const v of tri)g.vertices.add(v);
 }
 const provinces:Record<string,ProvinceCombat>={};
 for(const g of groups){
  if(!g.vertices.size||Math.abs(g.area-area(g.p.polygon))>Math.max(1e-7,g.area*1e-7))throw Error('省防御地貌与实际陆地不一致。');
  const biomeCounts=new Array<number>(13).fill(0),biomeOrder:number[]=[];
  for(const v of [...g.vertices].sort((a,b)=>a-b)){const id=ids[v];if(!biomeCounts[id])biomeOrder.push(id);biomeCounts[id]++;}
  const terrain=land.provinces[g.p.id];
  provinces[g.p.id]={biomeCounts,biomeOrder,storedDefense:resetNativeProvinceDefense({...terrain,biomeCounts:biomeOrder.map(biome=>({biome,count:biomeCounts[biome]})),locked:false,stored:1}),locked:false,manualSet:false,manualFortress:false,distance:2147483647,connected:false};
 }
 return provinces;
}
