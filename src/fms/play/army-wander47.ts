import type {Point} from '../../sim/types';

const inside=(p:Point,ring:readonly Point[])=>{let r=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)r=!r;}return r;};
const hash=(s:string)=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
/** Display-only stand-in for Army.RandomMoveInProvince: a stationary army stands at a
 * fixed point of its province picked from its id, so armies sharing a province spread out
 * instead of stacking. Points near `avoid` (city markers, whose names sit just above them)
 * are skipped while another spot exists, so icons do not cover city names. Falls back to
 * the polygon centroid of the vertices. */
export function wanderPoint(polygon:readonly Point[],armyId:string,avoid:readonly Point[]=[]):Point{
  if(!polygon.length)return {x:0,y:0};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of polygon){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
  let h=hash(armyId),fallback:Point|null=null;const clear=Math.min(maxX-minX,maxY-minY)*.22;
  for(let i=0;i<32;i++){
    h=Math.imul(h^h>>>15,2246822519)>>>0;const u=(h&0xffff)/0x10000,v=(h>>>16)/0x10000;
    const p={x:minX+(maxX-minX)*(.15+.7*u),y:minY+(maxY-minY)*(.15+.7*v)};
    if(!inside(p,polygon))continue;
    if(avoid.every(c=>Math.abs(p.x-c.x)>clear*1.6||p.y-c.y>clear*.6||c.y-p.y>clear*1.2))return p;
    fallback??=p;
  }
  if(fallback)return fallback;
  return {x:polygon.reduce((s,p)=>s+p.x,0)/polygon.length,y:polygon.reduce((s,p)=>s+p.y,0)/polygon.length};
}
