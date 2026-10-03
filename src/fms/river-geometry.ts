import { FMS_SEA_LEVEL, type FmsDocument, type FmsPoint } from './model';

export interface FmsRiverLine {from:number;to:number;a:FmsPoint;b:FmsPoint;mouth:boolean}
/** Render only the above-sea part of a validated drainage edge. Coordinates
 * match the float32 mesh; the receiver and runoff graph are not changed.
 * Sea-level knots draining to sea have no inland length and draw no dot. */
export function clipFmsRiverSegments(doc:FmsDocument,segments:readonly (readonly [number,number])[]):FmsRiverLine[]{
  const lines:FmsRiverLine[]=[];
  for(const[from,to]of segments){
    const ha=doc.elevations[from],hb=doc.elevations[to];
    if(ha<FMS_SEA_LEVEL)continue;
    const a=doc.points[from].map(Math.fround) as FmsPoint,point=doc.points[to].map(Math.fround) as FmsPoint;
    const clipped=hb<FMS_SEA_LEVEL,mouth=hb<=FMS_SEA_LEVEL;
    if(clipped&&ha===FMS_SEA_LEVEL)continue;
    // A>20 -> B=20 -> sea loses its zero-length last segment. A->B must
    // therefore also end flat at the shore rather than leaving a round dot.
    const t=clipped?(FMS_SEA_LEVEL-ha)/(hb-ha):1;
    const b:FmsPoint=[a[0]+(point[0]-a[0])*t,a[1]+(point[1]-a[1])*t];
    if(a[0]===b[0]&&a[1]===b[1])continue;
    lines.push({from,to,a,b,mouth});
  }
  return lines;
}
