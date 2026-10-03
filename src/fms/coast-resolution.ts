import { assertFmsDocument, FMS_MAX_POINTS, FmsModelError, type FmsDocument, type FmsPoint } from './model';

const key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
const area=(a:FmsPoint,b:FmsPoint,c:FmsPoint)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const fail=()=>new FmsModelError('invalid-edit','海岸加密无法保持原网格，原地图未改变。');

/** Subdivide only sea-level crossings/edges. Integer heights remain exact.
 * reference contains the preimages on the ORIGINAL float32 rendered surface;
 * smoothing must measure its final float32 geometry against these preimages,
 * never against an already rounded/remeshed intermediate map. */
export function resolveFmsCoast(doc:FmsDocument,fixed:Uint8Array):{document:FmsDocument;reference:FmsPoint[];interpolation:[number,number,number][]}{
  if(fixed.length!==doc.points.length)throw fail();
  const reference=doc.points.map(p=>p.map(Math.fround) as FmsPoint),points=doc.points.map(p=>[...p] as FmsPoint);
  const heights=Array.from(doc.elevations),locks=doc.terrainLocks?Array.from(doc.terrainLocks):undefined;
  const interpolation:[number,number,number][]=[];
  let triangles=Array.from(doc.triangles);
  const split=(selected:Map<string,number>)=>{
    const next:number[]=[];
    for(let t=0;t<triangles.length;t+=3){
      const ids=triangles.slice(t,t+3),m=ids.map((a,j)=>selected.get(key(a,ids[(j+1)%3]))),count=m.filter(x=>x!==undefined).length;
      if(count===0){next.push(...ids);continue;}
      if(count===3){const[a,b,c]=ids,[p,q,r]=m as number[];next.push(a,p,r,p,b,q,r,q,c,p,q,r);continue;}
      const start=count===1?m.findIndex(x=>x!==undefined):m.findIndex((x,j)=>x!==undefined&&m[(j+1)%3]!==undefined);
      const a=ids[start],b=ids[(start+1)%3],c=ids[(start+2)%3],p=m[start]!;
      if(count===1)next.push(a,p,c,p,b,c);
      else {const q=m[(start+1)%3]!;next.push(p,b,q,a,p,c,p,q,c);}
    }
    // Reject numerical slivers, reversed children and accidental outside points.
    for(let t=0;t<next.length;t+=3){const ids=next.slice(t,t+3),s=area(...ids.map(i=>reference[i]) as [FmsPoint,FmsPoint,FmsPoint]);
      const r=area(...ids.map(i=>reference[i].map(Math.fround) as FmsPoint) as [FmsPoint,FmsPoint,FmsPoint]);
      if(Math.abs(s)<1e-7||s*r<=0)throw fail();}
    triangles=next;
  };
  for(let pass=0;pass<4;pass++){
    const edges=new Map<string,{a:number;b:number;blocked:boolean;land:boolean;sea:boolean}>();
    for(let t=0;t<triangles.length;t+=3){const ids=triangles.slice(t,t+3),blocked=ids.some(i=>fixed[i]||locks?.[i]);
      for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],k=key(a,b),edge=edges.get(k)??{a,b,blocked:false,land:false,sea:false};
        edge.blocked ||= blocked;edge.land ||= ids.some(i=>heights[i]>20)||ids.every(i=>heights[i]===20);edge.sea ||= ids.some(i=>heights[i]<20);edges.set(k,edge);}}
    const selected=new Map<string,number>();
    for(const[k,{a,b,blocked,land,sea}]of edges){
      if(blocked||points.length>=FMS_MAX_POINTS)continue;
      const ha=heights[a],hb=heights[b],crossing=(ha<20&&hb>20)||(hb<20&&ha>20);
      if(pass===0?!crossing:!(ha===20&&hb===20&&land&&sea&&Math.hypot(reference[a][0]-reference[b][0],reference[a][1]-reference[b][1])>2))continue;
      const t=pass===0?(20-ha)/(hb-ha):.5,p:FmsPoint=[reference[a][0]+(reference[b][0]-reference[a][0])*t,reference[a][1]+(reference[b][1]-reference[a][1])*t];
      selected.set(k,points.length);reference.push(p);points.push([...p]);heights.push(20);locks?.push(0);interpolation.push([a,b,t]);
    }
    if(!selected.size)continue;
    split(selected);
  }
  if(points.length===doc.points.length)return {document:doc,reference,interpolation};
  const neighbors=points.map(()=>new Set<number>());
  for(let t=0;t<triangles.length;t+=3){const[a,b,c]=triangles.slice(t,t+3);neighbors[a].add(b).add(c);neighbors[b].add(a).add(c);neighbors[c].add(a).add(b);}
  const document:FmsDocument={...doc,points,triangles:Uint32Array.from(triangles),neighbors:neighbors.map(row=>[...row].sort((a,b)=>a-b)),elevations:Int32Array.from(heights),...(locks?{terrainLocks:Uint8Array.from(locks)}:{})};
  assertFmsDocument(document);return {document,reference,interpolation};
}
