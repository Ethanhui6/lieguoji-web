import type { Point, Province, World } from '../../sim/types';

const area=(p:Province)=>Math.abs(p.polygon.reduce((sum,a,i)=>{const b=p.polygon[(i+1)%p.polygon.length];return sum+a.x*b.y-b.x*a.y;},0))/2;
function inside(p:Point,ring:readonly Point[]){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;}return result;}
function centroid(ring:readonly Point[]):Point|null{
  let cross=0,x=0,y=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],k=a.x*b.y-b.x*a.y;cross+=k;x+=(a.x+b.x)*k;y+=(a.y+b.y)*k;}
  return Math.abs(cross)>1e-8?{x:x/(3*cross),y:y/(3*cross)}:null;
}
const edgeKey=(a:Point,b:Point)=>{const x=`${a.x},${a.y}`,y=`${b.x},${b.y}`;return x<y?`${x}/${y}`:`${y}/${x}`;};
function distance2(p:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;return (p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;}
export interface TerritoryLabel{nationId:string;point:Point;area:number;provinceIds:string[];clearance:number}

/** Current control, not capital/legal ownership. Find the largest land-connected
 * component by area, then a verified interior point with best boundary clearance.
 * This is a bounded web placement adapter, not a reproduction of Unity text paths. */
export function territoryLabels(world:World):TerritoryLabel[]{
  const byId=new Map(world.provinces.map(p=>[p.id,p])),result:TerritoryLabel[]=[];
  for(const nation of world.nations){
    const owned=world.provinces.filter(p=>p.controller===nation.id).sort((a,b)=>a.id.localeCompare(b.id)),seen=new Set<string>();
    let largest:Province[]=[],largestArea=0;
    for(const seed of owned){
      if(seen.has(seed.id))continue;const group=[seed];seen.add(seed.id);
      for(let i=0;i<group.length;i++)for(const id of group[i].neighbors){const p=byId.get(id);if(p?.controller===nation.id&&!seen.has(id)){group.push(p);seen.add(id);}}
      const size=group.reduce((sum,p)=>sum+area(p),0);if(size>largestArea){largest=group;largestArea=size;}
    }
    if(!largest.length)continue; // A landless state has no territory label.
    const edges=new Map<string,[Point,Point]>(),candidates:Point[]=[];let cx=0,cy=0;
    for(const p of largest){
      const center=centroid(p.polygon),weight=area(p);cx+=(center??p.center).x*weight;cy+=(center??p.center).y*weight;
      if(inside(p.center,p.polygon))candidates.push(p.center);
      if(center&&inside(center,p.polygon))candidates.push(center);
      for(let i=0;i<p.polygon.length;i++){const a=p.polygon[i],b=p.polygon[(i+1)%p.polygon.length],key=edgeKey(a,b);if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}
    }
    const middle={x:cx/largestArea,y:cy/largestArea},inLand=(point:Point)=>largest.some(p=>inside(point,p.polygon));
    if(inLand(middle))candidates.push(middle);
    const boundary=[...edges.values()];
    const clearance=(p:Point)=>boundary.reduce((min,[a,b])=>Math.min(min,distance2(p,a,b)),Infinity);
    const centreDistance=(p:Point)=>(p.x-middle.x)**2+(p.y-middle.y)**2;
    let best:Point|undefined,bestDistance=-1;
    for(const p of candidates){const d=clearance(p);if(d>bestDistance||(d===bestDistance&&best&&centreDistance(p)<centreDistance(best))){best=p;bestDistance=d;}}
    if(!best)continue;
    // Refine locally while always checking membership. No label may migrate
    // into an inland sea or to a distant enclave just because the centroid did.
    let step=Math.sqrt(largestArea)/8,refined:Point=best;
    for(let iteration=0;iteration<7;iteration++,step/=2){const origin:Point=refined;for(const dx of [-step,0,step])for(const dy of [-step,0,step]){const p:Point={x:origin.x+dx,y:origin.y+dy};if(!inLand(p))continue;const d=clearance(p);if(d>bestDistance){refined=p;bestDistance=d;}}}
    result.push({nationId:nation.id,point:{...refined},area:largestArea,provinceIds:largest.map(p=>p.id),clearance:Math.sqrt(bestDistance)});
  }
  return result;
}
