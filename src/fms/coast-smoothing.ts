import { assertFmsDocument, FmsModelError, type FmsDocument, type FmsPoint } from './model';

export const FMS_COAST_SMOOTHING='bounded-coast-relaxation-v1';
export interface FmsCoastSmoothOptions { maxOffset:number }
export interface FmsCoastSmoothResult {
  worldId:string; baseRevision:number; options:FmsCoastSmoothOptions; moves:{cell:number;point:FmsPoint}[];
  stats:{algorithm:typeof FMS_COAST_SMOOTHING;maxDisplacement:number;maxComponentAreaFraction:number;maxGradient:number;smallComponentArea:number;turningEnergyBefore:number;turningEnergyAfter:number};
}
const AREA_LIMIT=.02,GRADIENT_LIMIT=.2,SMALL_AREA=4096,EPS=1e-8;
const cross=(a:FmsPoint,b:FmsPoint,c:FmsPoint)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const dist=(a:FmsPoint,b:FmsPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const fail=()=>new FmsModelError('invalid-edit','海岸平滑未满足几何保护要求，原地图未改变。');
export function validFmsCoastSmoothOptions(raw:unknown):raw is FmsCoastSmoothOptions{
  return !!raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).length===1&&Object.hasOwn(raw,'maxOffset')
    &&typeof (raw as FmsCoastSmoothOptions).maxOffset==='number'&&Number.isFinite((raw as FmsCoastSmoothOptions).maxOffset)
    &&(raw as FmsCoastSmoothOptions).maxOffset>=0&&(raw as FmsCoastSmoothOptions).maxOffset<=4;
}
interface Face { ids:number[]; area:number; landFraction:number; landComponent:number; seaComponent:number }
interface Node {point:FmsPoint;sites:[number,number][];next:Set<number>}
interface Source { points:FmsPoint[]; faces:Face[]; components:Float64Array; fixed:Uint8Array;nodes:Node[] }

function landFraction(points:FmsPoint[],heights:number[],area:number):number{
  const polygon:FmsPoint[]=[];
  for(let i=0;i<3;i++){const a=points[i],b=points[(i+1)%3],ha=heights[i],hb=heights[(i+1)%3];if(ha>=20)polygon.push(a);
    if((ha<20)!==(hb<20)){const t=(20-ha)/(hb-ha);polygon.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
  let signed=0;for(let i=1;i<polygon.length-1;i++)signed+=cross(polygon[0],polygon[i],polygon[i+1]);
  return Math.max(0,Math.min(1,Math.abs(signed)/area));
}
/** A connected, orientable manifold disk with a once-covered rectangular
 * boundary and strictly positive oriented faces has degree one. This verifies
 * the global source-embedding precondition, not just each triangle in isolation. */
function sourceGeometry(doc:FmsDocument):Source{
  assertFmsDocument(doc);if(doc.elevations.some(h=>h<0||h>100))throw fail();
  const points=doc.points.map(p=>p.map(Math.fround) as FmsPoint),n=points.length,incident:number[][]=Array.from({length:n},()=>[]);
  const edges=new Map<string,{a:number;b:number;count:number;balance:number;faces:number[]}>(),faces:Face[]=[],fixed=new Uint8Array(n);
  for(let t=0;t<doc.triangles.length;t+=3){
    const ids=Array.from(doc.triangles.slice(t,t+3)),signed=cross(points[ids[0]],points[ids[1]],points[ids[2]]);if(!Number.isFinite(signed)||Math.abs(signed)<=EPS||signed*cross(doc.points[ids[0]],doc.points[ids[1]],doc.points[ids[2]])<=0)throw fail();
    const oriented=signed>0?ids:[ids[0],ids[2],ids[1]];ids.forEach(i=>incident[i].push(t/3));
    for(let j=0;j<3;j++){const a=oriented[j],b=oriented[(j+1)%3],low=Math.min(a,b),high=Math.max(a,b),key=`${low}:${high}`,edge=edges.get(key);
      if(edge){edge.count++;edge.balance+=a===low?1:-1;edge.faces.push(t/3);}else edges.set(key,{a:low,b:high,count:1,balance:a===low?1:-1,faces:[t/3]});}
    faces.push({ids,area:Math.abs(signed),landFraction:landFraction(ids.map(i=>points[i]),ids.map(i=>doc.elevations[i]),Math.abs(signed)),landComponent:-1,seaComponent:-1});
  }
  if(n-edges.size+faces.length!==1)throw fail();
  const boundaryDegree=new Uint8Array(n);let perimeter=0;
  for(const edge of edges.values()){
    if(edge.count===2){if(edge.balance!==0)throw fail();continue;}if(edge.count!==1)throw fail();
    const a=edge.balance>0?points[edge.a]:points[edge.b],b=edge.balance>0?points[edge.b]:points[edge.a];
    if(!((a[1]===0&&b[1]===0&&b[0]>a[0])||(a[0]===doc.width&&b[0]===doc.width&&b[1]>a[1])
      ||(a[1]===doc.height&&b[1]===doc.height&&b[0]<a[0])||(a[0]===0&&b[0]===0&&b[1]<a[1])))throw fail();
    perimeter+=dist(a,b);boundaryDegree[edge.a]++;boundaryDegree[edge.b]++;fixed[edge.a]=fixed[edge.b]=1;
  }
  if(Math.abs(perimeter-2*(doc.width+doc.height))>1e-6)throw fail();
  for(let cell=0;cell<n;cell++){
    if(boundaryDegree[cell]!==0&&boundaryDegree[cell]!==2)throw fail();
    const link=new Map<number,number[]>();
    for(const face of incident[cell]){const [a,b]=faces[face].ids.filter(i=>i!==cell);if(!link.has(a))link.set(a,[]);if(!link.has(b))link.set(b,[]);link.get(a)!.push(b);link.get(b)!.push(a);}
    const ends=[...link.values()].filter(row=>row.length===1).length;
    if([...link.values()].some(row=>row.length<1||row.length>2)||ends!==(boundaryDegree[cell]?2:0))throw fail();
    const seen=new Set<number>(),stack=[link.keys().next().value!];while(stack.length){const i=stack.pop()!;if(seen.has(i))continue;seen.add(i);stack.push(...link.get(i)!);}
    if(seen.size!==link.size)throw fail();
  }
  const connected=new Set<number>(),queue=[0];while(queue.length){const i=queue.pop()!;if(connected.has(i))continue;connected.add(i);queue.push(...doc.neighbors[i].filter(j=>!connected.has(j)));}
  if(connected.size!==n)throw fail();
  // Components join clipped faces through a positive-length shared interval.
  // A sea-level point contact must not combine two islands' area budgets.
  const parents=Int32Array.from({length:faces.length*2},(_,i)=>i);
  const root=(i:number)=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(const edge of edges.values())if(edge.faces.length===2){const [a,b]=edge.faces,ha=doc.elevations[edge.a],hb=doc.elevations[edge.b];
    if((Math.max(ha,hb)>20||Math.min(ha,hb)===20)&&faces[a].landFraction>0&&faces[b].landFraction>0)parents[root(a)]=root(b);
    if(Math.min(ha,hb)<20&&faces[a].landFraction<1&&faces[b].landFraction<1)parents[root(a+faces.length)]=root(b+faces.length);}
  const labels=new Map<number,number>();
  const label=(id:number)=>{const key=root(id);if(!labels.has(key))labels.set(key,labels.size);return labels.get(key)!;};
  faces.forEach((face,i)=>{if(face.landFraction>0)face.landComponent=label(i);if(face.landFraction<1)face.seaComponent=label(i+faces.length);});
  const components=new Float64Array(labels.size),nodes:Node[]=[],keys=new Map<string,number>();
  const node=(key:string,point:FmsPoint,sites:[number,number][])=>{let id=keys.get(key);if(id===undefined){id=nodes.length;keys.set(key,id);nodes.push({point,sites,next:new Set()});}return id;};
  for(const face of faces){
    if(face.landComponent>=0)components[face.landComponent]+=face.area*.5*face.landFraction;
    if(face.seaComponent>=0)components[face.seaComponent]+=face.area*.5*(1-face.landFraction);
    const hits=new Set<number>();
    for(let j=0;j<3;j++){let a=face.ids[j],b=face.ids[(j+1)%3];if(a>b)[a,b]=[b,a];const ha=doc.elevations[a],hb=doc.elevations[b];
      if(ha===20)hits.add(node(`v${a}`,points[a],[[a,1]]));if(hb===20)hits.add(node(`v${b}`,points[b],[[b,1]]));
      if((ha<20&&hb>20)||(hb<20&&ha>20)){const t=(20-ha)/(hb-ha),p=points[a],q=points[b];hits.add(node(`${a}:${b}`,[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t],[[a,1-t],[b,t]]));}}
    if(hits.size===2){const[a,b]=[...hits];if(dist(nodes[a].point,nodes[b].point)>EPS){nodes[a].next.add(b);nodes[b].next.add(a);}}
    else if(hits.size>2)face.ids.forEach(i=>fixed[i]=1);
  }
  const interior=doc.neighbors.map((row,i)=>doc.elevations[i]!==20&&row.every(j=>doc.elevations[j]!==20&&(doc.elevations[j]<20)===(doc.elevations[i]<20)));
  const support=doc.neighbors.map((row,i)=>doc.elevations[i]===20?true:row.some(j=>interior[j]&&(doc.elevations[j]<20)===(doc.elevations[i]<20)));
  for(const face of faces){const mixed=face.landComponent>=0&&face.seaComponent>=0;
    const coast=mixed||face.ids.some(i=>doc.elevations[i]===20);
    const small=(face.landComponent>=0&&components[face.landComponent]<SMALL_AREA)||(face.seaComponent>=0&&components[face.seaComponent]<SMALL_AREA);
    if(face.ids.some(i=>doc.terrainLocks?.[i])||(mixed&&face.ids.some(i=>!support[i]))||(coast&&small))face.ids.forEach(i=>fixed[i]=1);}
  for(const node of nodes)if(node.next.size!==2)node.sites.forEach(([i])=>fixed[i]=1);
  return {points,faces,components,fixed,nodes};
}
function faceGradient(source:FmsPoint[],candidate:FmsPoint[],ids:number[]):number{
  const [a,b,c]=ids.map(i=>source[i]),[da,db,dc]=ids.map(i=>[Math.fround(candidate[i][0])-source[i][0],Math.fround(candidate[i][1])-source[i][1]]),D=cross(a,b,c);
  const x1=b[0]-a[0],y1=b[1]-a[1],x2=c[0]-a[0],y2=c[1]-a[1],u1=db[0]-da[0],v1=db[1]-da[1],u2=dc[0]-da[0],v2=dc[1]-da[1];
  return Math.hypot((u1*y2-u2*y1)/D,(-u1*x2+u2*x1)/D,(v1*y2-v2*y1)/D,(-v1*x2+v2*x1)/D);
}
function metrics(source:Source,points:FmsPoint[]):FmsCoastSmoothResult['stats']{
  const area=new Float64Array(source.components.length);let maxGradient=0,maxDisplacement=0;
  const rounded=points.map(p=>p.map(Math.fround) as FmsPoint);
  points.forEach((_,i)=>maxDisplacement=Math.max(maxDisplacement,dist(source.points[i],rounded[i])));
  for(const face of source.faces){const a=Math.abs(cross(...face.ids.map(i=>rounded[i]) as [FmsPoint,FmsPoint,FmsPoint]))*.5;
    maxGradient=Math.max(maxGradient,faceGradient(source.points,points,face.ids));
    if(face.landComponent>=0)area[face.landComponent]+=a*face.landFraction;if(face.seaComponent>=0)area[face.seaComponent]+=a*(1-face.landFraction);}
  let maxComponentAreaFraction=0;area.forEach((a,i)=>{if(source.components[i]>EPS)maxComponentAreaFraction=Math.max(maxComponentAreaFraction,Math.abs(a/source.components[i]-1));});
  const energy=(positions:FmsPoint[])=>{
    const nodes=source.nodes.map(node=>node.sites.reduce((sum,[i,w])=>[sum[0]+positions[i][0]*w,sum[1]+positions[i][1]*w] as FmsPoint,[0,0] as FmsPoint));
    let value=0;source.nodes.forEach((node,i)=>{if(node.next.size!==2)return;const[a,b]=[...node.next].map(j=>nodes[j]),p=nodes[i];
      const ax=a[0]-p[0],ay=a[1]-p[1],bx=b[0]-p[0],by=b[1]-p[1],length=Math.hypot(ax,ay)*Math.hypot(bx,by);
      if(length)value+=Math.acos(Math.max(-1,Math.min(1,-(ax*bx+ay*by)/length)))**2;});return value;
  };
  return {algorithm:FMS_COAST_SMOOTHING,maxDisplacement,maxComponentAreaFraction,maxGradient,smallComponentArea:SMALL_AREA,turningEnergyBefore:energy(source.points),turningEnergyAfter:energy(rounded)};
}
/** A separate, explicitly chosen operation. Per connected land/sea component
 * area is bounded by 2%; displacement gradient norm <= .2 bounds compression
 * and shear. This is NOT the previous per-parent-face microdetail contract. */
export function smoothFmsCoast(doc:FmsDocument,options:FmsCoastSmoothOptions):FmsCoastSmoothResult{
  if(!validFmsCoastSmoothOptions(options))throw fail();const source=sourceGeometry(doc),n=doc.points.length;
  const empty=()=>({worldId:doc.worldId,baseRevision:doc.revision,options:{...options},moves:[],stats:metrics(source,doc.points)});
  if(options.maxOffset===0||!source.nodes.length)return empty();
  const weights=new Float64Array(n),delta:FmsPoint[]=Array.from({length:n},()=>[0,0]),radius=Math.sqrt(doc.width*doc.height/n)*2;
  for(let index=0;index<source.nodes.length;index++){
    const node=source.nodes[index];if(node.next.size!==2)continue;let x=node.point[0],y=node.point[1],weight=1;
    for(let next of node.next){let previous=index,arc=0;for(let step=0;step<30;step++){
      const current=source.nodes[next];arc+=dist(current.point,source.nodes[previous].point);if(arc>radius*2||current.next.size!==2||next===index)break;
      const w=Math.exp(-3*(arc/radius)**2);x+=current.point[0]*w;y+=current.point[1]*w;weight+=w;
      const further=[...current.next].find(i=>i!==previous)!;previous=next;next=further;}}
    let dx=(x/weight-node.point[0])*.8,dy=(y/weight-node.point[1])*.8;const length=Math.hypot(dx,dy);
    // Keep a common field when changing the user's bound. Clamping each node
    // to a different radius first can create extra bends at low settings.
    if(length>4){dx*=4/length;dy*=4/length;}
    for(const[i,w]of node.sites){delta[i][0]+=dx*w;delta[i][1]+=dy*w;weights[i]+=w;}
  }
  for(let i=0;i<n;i++){
    if(source.fixed[i]){delta[i]=[0,0];continue;}
    if(weights[i]){delta[i][0]/=weights[i];delta[i][1]/=weights[i];}
  }
  let field=delta;
  for(let pass=0;pass<8;pass++){const next=field.map(v=>[...v] as FmsPoint);for(let i=0;i<n;i++){
    if(source.fixed[i]){next[i]=[0,0];continue;}if(weights[i])continue;const row=doc.neighbors[i];
    next[i]=[row.reduce((sum,j)=>sum+field[j][0],0)/row.length*.9,row.reduce((sum,j)=>sum+field[j][1],0)/row.length*.9];}field=next;}
  if(field.every(v=>v[0]===0&&v[1]===0))return empty();
  // A valence-three h20 knot introduced by microdetail belongs to one original
  // parent face. Transport it with that face's affine field; independent local
  // damping of the knot created new zigzags on an otherwise smoothing coast.
  const knots=new Map<number,{ids:number[];weights:number[]}>();
  for(let i=0;i<n;i++)if(!source.fixed[i]&&doc.elevations[i]===20&&doc.neighbors[i].length===3&&doc.neighbors[i].every(j=>doc.elevations[j]!==20)){
    const ids=doc.neighbors[i],[a,b,c]=ids.map(j=>source.points[j]),D=cross(a,b,c),p=source.points[i];
    const weights=[cross(p,b,c)/D,cross(a,p,c)/D,cross(a,b,p)/D];
    if(weights.every(w=>w>0&&w<1))knots.set(i,{ids,weights});
  }
  const scales=new Float64Array(n).fill(1);let points:FmsPoint[]=doc.points;
  const proposal=(factor=1)=>{
    const next=source.points.map((p,i)=>source.fixed[i]||Math.hypot(...field[i])*scales[i]*factor<1e-5?doc.points[i]:[Math.fround(p[0]+field[i][0]*scales[i]*factor),Math.fround(p[1]+field[i][1]*scales[i]*factor)] as FmsPoint);
    for(const[i,{ids,weights}]of knots){const displacement=[0,0];ids.forEach((j,k)=>{displacement[0]+=weights[k]*(Math.fround(next[j][0])-source.points[j][0]);displacement[1]+=weights[k]*(Math.fround(next[j][1])-source.points[j][1]);});
      next[i]=Math.hypot(...displacement)<1e-5?doc.points[i]:[Math.fround(source.points[i][0]+displacement[0]),Math.fround(source.points[i][1]+displacement[1])];}
    return next;
  };
  let accepted=false;
  for(let pass=0;pass<150;pass++){
    points=proposal();const reduce=new Uint8Array(n);let violations=0;
    for(const face of source.faces)if(faceGradient(source.points,points,face.ids)>GRADIENT_LIMIT){violations++;face.ids.forEach(i=>reduce[i]=1);}
    if(!violations){accepted=true;break;}
    for(const[i,knot]of knots)if(reduce[i])knot.ids.forEach(j=>reduce[j]=1);
    for(let i=0;i<n;i++)if(reduce[i])scales[i]*=.8;
  }
  if(!accepted)return empty();
  let stats=metrics(source,points);
  for(let pass=0;pass<24&&(stats.maxComponentAreaFraction>AREA_LIMIT||stats.maxDisplacement>options.maxOffset||stats.maxGradient>GRADIENT_LIMIT||stats.turningEnergyAfter>=stats.turningEnergyBefore);pass++){points=proposal(.8**(pass+1));stats=metrics(source,points);}
  if(stats.maxComponentAreaFraction>AREA_LIMIT||stats.maxDisplacement>options.maxOffset||stats.maxGradient>GRADIENT_LIMIT||stats.turningEnergyAfter>=stats.turningEnergyBefore)return empty();
  const moves=points.flatMap((point,cell)=>point[0]===doc.points[cell][0]&&point[1]===doc.points[cell][1]?[]:[{cell,point:[...point] as FmsPoint}]);
  return {worldId:doc.worldId,baseRevision:doc.revision,options:{...options},moves,stats};
}
export function prepareFmsCoastSmoothPreview(doc:FmsDocument,raw:FmsCoastSmoothResult,options:FmsCoastSmoothOptions):FmsDocument{
  if(!validFmsCoastSmoothOptions(options)||!raw||Object.keys(raw).length!==5||raw.worldId!==doc.worldId||raw.baseRevision!==doc.revision||!validFmsCoastSmoothOptions(raw.options)
    ||raw.options.maxOffset!==options.maxOffset||!Array.isArray(raw.moves)||raw.moves.length>doc.points.length)throw fail();
  const source=sourceGeometry(doc),points=doc.points.map(p=>[...p] as FmsPoint),seen=new Set<number>();
  for(const move of raw.moves){if(!move||Object.keys(move).length!==2||!Number.isInteger(move.cell)||move.cell<0||move.cell>=points.length||seen.has(move.cell)||source.fixed[move.cell]
    ||!Array.isArray(move.point)||move.point.length!==2||move.point.some(v=>!Number.isFinite(v)||v!==Math.fround(v)))throw fail();
    seen.add(move.cell);points[move.cell]=[...move.point];}
  const stats=metrics(source,points);
  for(const face of source.faces)if(cross(doc.points[face.ids[0]],doc.points[face.ids[1]],doc.points[face.ids[2]])*cross(points[face.ids[0]],points[face.ids[1]],points[face.ids[2]])<=0)throw fail();
  if(!raw.stats||Object.keys(raw.stats).length!==Object.keys(stats).length||Object.keys(stats).some(key=>raw.stats[key as keyof typeof stats]!==stats[key as keyof typeof stats])
    ||stats.maxDisplacement>options.maxOffset||stats.maxComponentAreaFraction>AREA_LIMIT||stats.maxGradient>GRADIENT_LIMIT||(seen.size>0&&stats.turningEnergyAfter>=stats.turningEnergyBefore))throw fail();
  if(!seen.size)return doc;
  const candidate={...doc,points,revision:doc.revision+1};assertFmsDocument(candidate);return candidate;
}
