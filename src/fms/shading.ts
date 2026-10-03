import type { FmsDocument } from './model';

/** Sea-level knots carry interpolated shading, not a new hillside sample.
 * Ignoring them in slope estimates keeps original-site shade stable when a
 * triangle is star-subdivided. Three-neighbor knots interpolate that parent
 * face's values, avoiding a dark cliff caused only by increased tessellation. */
export function deriveFmsShade(doc:FmsDocument):Float32Array{
  const shade=new Float32Array(doc.points.length).fill(1);
  for(let cell=0;cell<doc.points.length;cell++){
    const h=doc.elevations[cell];if(h<=20)continue;
    const [x,y]=doc.points[cell];let gx=0,gy=0,count=0;
    for(const neighbor of doc.neighbors[cell]){
      if(doc.elevations[neighbor]<=20)continue;
      const dx=doc.points[neighbor][0]-x,dy=doc.points[neighbor][1]-y,d2=dx*dx+dy*dy;
      if(d2<=0)continue;const dh=doc.elevations[neighbor]-h;gx+=dh*dx/d2;gy+=dh*dy/d2;count++;
    }
    if(count){gx=gx/count*4;gy=gy/count*4;const light=(1+gx*.48+gy*.6)/Math.hypot(gx,gy,1)/1.26;shade[cell]=Math.max(.65,Math.min(1.13,.65+light*.48));}
  }
  for(let cell=0;cell<doc.points.length;cell++){
    const row=doc.neighbors[cell];if(doc.elevations[cell]!==20||row.length!==3||row.some(id=>doc.elevations[id]===20))continue;
    const [a,b,c]=row.map(id=>doc.points[id].map(Math.fround)),[x,y]=doc.points[cell].map(Math.fround);
    const total=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(total)<1e-8)continue;
    const wa=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/total,wb=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/total,wc=1-wa-wb;
    if(Math.min(wa,wb,wc)<0)continue;shade[cell]=wa*shade[row[0]]+wb*shade[row[1]]+wc*shade[row[2]];
  }
  // Explicit sea-level edges have more than one h20 neighbor. Reconstruct a
  // bounded, deterministic coast shade from the stored mesh on every load;
  // treating every inserted vertex as shade=1 creates a false bright ribbon.
  const edgeKnots=doc.neighbors.flatMap((row,i)=>doc.elevations[i]===20&&row.some(j=>doc.elevations[j]===20)?[i]:[]);
  for(let pass=0;pass<24&&edgeKnots.length;pass++){
    const next=new Float32Array(shade);
    for(const i of edgeKnots){let sum=0,weight=0;for(const j of doc.neighbors[i]){
      const distance=Math.hypot(doc.points[i][0]-doc.points[j][0],doc.points[i][1]-doc.points[j][1]);
      if(distance<=0)continue;const w=1/distance;sum+=shade[j]*w;weight+=w;
    }if(weight)next[i]=sum/weight;}
    for(const i of edgeKnots)shade[i]=next[i];
  }
  return shade;
}
