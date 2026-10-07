import {assertFmsDocument,type FmsDocument} from '../model';
import type {Point} from '../../sim/types';
import {settlementBiomeData as deriveFmsBiomeSurface} from './settlement25-biomes';
import {landFaces,mergeRing,edgeKey,polygonArea,type Vertex} from './settlement25-mesh';
import {cutSettlementFaces} from './settlement25-cuts';

export const SETTLEMENT25_ALGORITHM='terrain-connected-unions-v1';
export type Region={ring:Vertex[];center:Point;height:number;neighbors:Set<number>;members:number[];area:number};
type Border={length:number;resistance:number;edges:number};
type Cluster={ring:Vertex[];area:number;x:number;y:number;height:number;members:number[];adjacent:Map<number,Border>;revision:number;live:boolean};
type Entry={a:number;b:number;ar:number;br:number;cost:number};
class Queue{
 private values:Entry[]=[];
 private less(a:Entry,b:Entry){return a.cost<b.cost||a.cost===b.cost&&(a.a<b.a||a.a===b.a&&a.b<b.b);}
 push(e:Entry){let i=this.values.push(e)-1;while(i){const p=(i-1)>>1;if(!this.less(e,this.values[p]))break;this.values[i]=this.values[p];i=p;}this.values[i]=e;}
 pop(){const first=this.values[0],last=this.values.pop();if(!this.values.length)return first;let i=0;while(i*2+1<this.values.length){let child=i*2+1;if(child+1<this.values.length&&this.less(this.values[child+1],this.values[child]))child++;if(!this.less(this.values[child],last!))break;this.values[i]=this.values[child];i=child;}this.values[i]=last!;return first;}
}
const middle=(ring:Vertex[]):Point=>({x:ring.reduce((s,p)=>s+p.x,0)/ring.length,y:ring.reduce((s,p)=>s+p.y,0)/ring.length});

/** Web adaptation: area-weighted compact unions on the real clipped mesh.
 * Finite ridge/river costs favour natural divides; no face is dropped, moved,
 * filled or joined across sea. Exact requested count or an explicit failure.
 * This is NOT claimed to be the original game's province-generation algorithm. */
export function settlementRegions(document:FmsDocument,cityCount:number):Region[]{
 assertFmsDocument(document);
 if(!Number.isInteger(cityCount)||cityCount<2||cityCount>480)throw Error('城市数量须为 2—480。');
 const faces=landFaces(document),scale=1000/Math.max(document.width,document.height);
 if(faces.length<cityCount)throw Error(`这片陆地只能提供 ${faces.length} 个独立地形面，无法放置 ${cityCount} 座城市；请扩大陆地或减少城市。原稿已保留。`);
 const visited=new Uint8Array(faces.length);let components=0;
 for(let i=0;i<faces.length;i++)if(!visited[i]){components++;const q=[i];visited[i]=1;for(let h=0;h<q.length;h++)for(const j of faces[q[h]].neighbors)if(!visited[j]){visited[j]=1;q.push(j);}}
 if(components>cityCount)throw Error(`地图有 ${components} 片不相连的陆地，至少需要 ${components} 座城市；不能隔海拼接辖区。原稿已保留。`);
 const surface=deriveFmsBiomeSurface(document),rivers=new Set(surface.rivers.segments.map(([a,b])=>edgeKey({key:'p'+a,x:0,y:0},{key:'p'+b,x:0,y:0})));
 const clusters:Cluster[]=faces.map((f,i)=>{const p=middle(f.ring),area=polygonArea(f.ring);return {ring:f.ring,area,x:p.x,y:p.y,height:f.height,members:[i],adjacent:new Map(),revision:0,live:true};});
 const edges=new Map<string,{face:number;length:number}>();
 faces.forEach((f,i)=>f.ring.forEach((a,k)=>{const b=f.ring[(k+1)%f.ring.length],key=edgeKey(a,b),previous=edges.get(key),length=Math.hypot(a.x-b.x,a.y-b.y);if(previous){const j=previous.face,resistance=1+Math.max(0,(f.height+faces[j].height)/2-55)/18+Math.abs(f.height-faces[j].height)/15+(rivers.has(key)?3:0),border={length,resistance:length*resistance,edges:1};clusters[i].adjacent.set(j,border);clusters[j].adjacent.set(i,border);}else edges.set(key,{face:i,length});}));
 const heap=new Queue();
 const offer=(aa:number,bb:number)=>{const a=Math.min(aa,bb),b=Math.max(aa,bb),x=clusters[a],y=clusters[b],border=x.adjacent.get(b);if(!x.live||!y.live||!border)return;
  const ward=((x.x-y.x)**2+(x.y-y.y)**2)*x.area*y.area/(x.area+y.area);
  // Shared boundary support discourages long, one-face-wide tendrils.
  const neck=1+Math.min(4,Math.sqrt(Math.min(x.area,y.area))/Math.max(border.length,1e-9));
  heap.push({a,b,ar:x.revision,br:y.revision,cost:ward*neck*border.resistance/border.length*(1+Math.max(0,(x.ring.length+y.ring.length-2*border.edges-60)/60)**2)});
 };
 clusters.forEach((c,i)=>{for(const j of c.adjacent.keys())if(i<j)offer(i,j);});let count=clusters.length;
 while(count>cityCount){
  const e=heap.pop();if(!e){
   const alternative=cutSettlementFaces(faces,cityCount);if(!alternative)throw Error(`为保留海岸与湖泊，本次划分停在 ${count} 个辖区，未能达到所选数量；请选择更多城市或编辑陆地。原稿已保留。`);
   clusters.forEach(c=>c.live=false);const owner=new Int32Array(faces.length);
   alternative.forEach((r,id)=>{let area=0,x=0,y=0,height=0;for(const i of r.members){owner[i]=id;const a=polygonArea(faces[i].ring),p=middle(faces[i].ring);area+=a;x+=p.x*a;y+=p.y*a;height+=faces[i].height*a;}clusters[id]={...r,area,x:x/area,y:y/area,height:height/area,adjacent:new Map(),revision:0,live:true};});
   faces.forEach((f,i)=>f.neighbors.forEach(j=>{if(owner[i]!==owner[j])clusters[owner[i]].adjacent.set(owner[j],{length:1,resistance:1,edges:1});}));break;
  }
  const a=clusters[e.a],b=clusters[e.b];if(!a.live||!b.live||a.revision!==e.ar||b.revision!==e.br)continue;
  const ring=mergeRing(a.ring,b.ring);if(!ring)continue;
  const area=a.area+b.area;a.x=(a.x*a.area+b.x*b.area)/area;a.y=(a.y*a.area+b.y*b.area)/area;a.height=(a.height*a.area+b.height*b.area)/area;a.area=area;a.ring=ring;a.members.push(...b.members);a.revision++;b.live=false;count--;
  a.adjacent.delete(e.b);
  for(const [j,border] of b.adjacent){if(j===e.a)continue;const old=a.adjacent.get(j),next=old?{length:old.length+border.length,resistance:old.resistance+border.resistance,edges:old.edges+border.edges}:border;a.adjacent.set(j,next);clusters[j].adjacent.delete(e.b);clusters[j].adjacent.set(e.a,next);}
  b.adjacent.clear();for(const j of a.adjacent.keys())offer(e.a,j);
 }
 const ids=clusters.flatMap((c,i)=>c.live?[i]:[]),index=new Map(ids.map((id,i)=>[id,i]));
 return ids.map(id=>{const c=clusters[id];if(c.area*scale*scale<.01)throw Error('地图含无法建立城市的极小独立碎片，请扩大该岛或用海洋笔刷移除；原稿已保留。');
  let best=c.members[0],score=Infinity;const radius=Math.sqrt(c.area/Math.PI);
  for(const i of c.members){const f=faces[i],p=middle(f.ring),heights=f.source.map(j=>document.elevations[j]),slope=Math.max(...heights)-Math.min(...heights),water=f.source.some(j=>surface.rivers.riverIds[j]>0||document.neighbors[j].some(k=>document.elevations[k]<20));
   const value=Math.hypot(p.x-c.x,p.y-c.y)/radius+Math.max(0,f.height-35)/30+slope/35-(water?.15:0);if(value<score){score=value;best=i;}}
  return {ring:c.ring,area:c.area,center:middle(faces[best].ring),height:c.height,members:c.members,neighbors:new Set([...c.adjacent.keys()].map(j=>index.get(j)!))};
 });
}
