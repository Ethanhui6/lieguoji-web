import {fastChecks47} from './checks47';
import type {Point} from '../../sim/types';
import {hasOwnedTravelProof47,rememberOwnedTravel47,cloneTravel47,ownedTravelSegment47,rememberOwnedTravelSegment47} from './owned-travel47';
import {findArmyTravelPath47,insideTravelCell47,type TravelPolicy47,type TravelGraph47,type TravelCell47} from './army-travel47-graph';
type TravelBody47={armyId:string;origin:Point;nodes:number[];leg:number;offset:number;crossed:boolean;status:'moving'|'arrived'|'blocked'|'halted'};
/** V1 is unchanged. V2 explicitly saves an exact final point; old records are
 * never silently upgraded or made to move within their last cell. */
export type ArmyTravel47=TravelBody47&({version:1}|{version:2;destination:Point});
const keys=['version','armyId','origin','nodes','leg','offset','crossed','status'];
const travelKeys=new Set([...keys,'destination']);
const isPointShape=(p:Point)=>!!p&&typeof p==='object'&&Object.keys(p).length===2&&Object.hasOwn(p,'x')&&Object.hasOwn(p,'y');
export type TravelSegment47={kind:'gate';a:TravelCell47;b:TravelCell47;start:Point;gate:Point;endPoint:Point;toGate:number;distance:number}|{kind:'local';cell:TravelCell47;start:Point;endPoint:Point;distance:number};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Both movement engines and previews consume this geometry. */
export function armyTravelSegment47(s:ArmyTravel47,g:TravelGraph47):TravelSegment47|null{
 const known=ownedTravelSegment47(s,g);if(known)return known;
 if(s.version===2&&s.nodes.length===1)return rememberOwnedTravelSegment47(s,g,{kind:'local',cell:g.cells.get(s.nodes[0])!,start:s.origin,endPoint:s.destination,distance:distance(s.origin,s.destination)});
 const a=g.cells.get(s.nodes[s.leg])!,b=g.cells.get(s.nodes[s.leg+1]);if(!b)return null;
 const link=a.links.find(l=>l.to===b.id);if(!link)return null;
 const start=s.leg===0?s.origin:a.center,endPoint=s.version===2&&s.leg===s.nodes.length-2?s.destination:b.center,toGate=distance(start,link.gate);
 return rememberOwnedTravelSegment47(s,g,{kind:'gate',a,b,start,gate:link.gate,endPoint,toGate,distance:toGate+distance(link.gate,endPoint)});
}
/** Validate real topology and distance before accepting a saved mixed path.
 * This geometry guard does not replace run/Army identity and diplomatic guards. */
export function assertArmyTravel47(value:unknown,g:TravelGraph47):asserts value is ArmyTravel47{if(fastChecks47())return;
 const s=value as ArmyTravel47;
 if(!s||typeof s!=='object'||Object.keys(s).length!==(s.version===2?9:8)||Object.keys(s).some(k=>!travelKeys.has(k)||k==='destination'&&s.version!==2)||(s.version!==1&&s.version!==2)||typeof s.armyId!=='string'||!s.armyId||!Array.isArray(s.nodes)||!s.nodes.length||s.nodes.length>g.cells.size+1||!Number.isSafeInteger(s.leg)||s.leg<0||s.leg>=s.nodes.length||!Number.isFinite(s.offset)||s.offset<0||typeof s.crossed!=='boolean'||!['moving','arrived','blocked','halted'].includes(s.status))throw Error('海陆行军记录无效，已保留原档。');
 // A single dense scan still rejects holes, unknown cells and broken edges.
 // Avoid allocating an index array for every force at every sub-tick.
 if(!hasOwnedTravelProof47(s,g)){
 let previous:TravelCell47|undefined;
 for(let i=0;i<s.nodes.length;i++){
  const id=s.nodes[i],cell=g.cells.get(id);
  if(!Object.hasOwn(s.nodes,i)||!Number.isSafeInteger(id)||!cell)throw Error('海陆行军记录无效，已保留原档。');
  if(previous&&!previous.links.some(l=>l.to===id))throw Error('海陆行军记录跨越了不相邻格。');
  previous=cell;
 }
 if(!isPointShape(s.origin)||!insideTravelCell47(g.cells.get(s.nodes[0])!,s.origin))throw Error('海陆行军起点不在实际格内。');
 if(s.version===2&&(!isPointShape(s.destination)||!insideTravelCell47(g.cells.get(s.nodes.at(-1)!)!,s.destination)))throw Error('精确行军终点不在目标格内。');
 rememberOwnedTravel47(s,g);
 }
 const link=armyTravelSegment47(s,g);
 if(link?.kind==='local'){
  if(s.crossed||s.status==='blocked'||s.offset>link.distance||s.status==='moving'&&s.offset===link.distance||s.status==='arrived'&&s.offset!==link.distance)throw Error('格内行军进度无效。');
 }else if(s.leg===s.nodes.length-1){if(s.offset!==0||s.crossed||!['arrived','halted'].includes(s.status))throw Error('海陆行军终点状态无效。');}
 else if(!link||s.offset>=link.distance&&!(s.version===2&&s.offset===link.distance&&link.toGate===link.distance&&!s.crossed)||s.status==='arrived'||(s.crossed?s.offset<link.toGate:s.offset>link.toGate)||s.status==='blocked'&&(s.crossed||s.offset!==0&&s.offset!==link.toGate))throw Error('海陆行军进度与路径不一致。');
}
export function beginArmyTravel47(armyId:string,nodes:readonly number[],g:TravelGraph47,origin?:Point):ArmyTravel47{
 const start=origin??g.cells.get(nodes[0])?.center;if(!start)throw Error('行军起点不存在。');
 const value:ArmyTravel47={version:1,armyId,origin:{...start},nodes:[...nodes],leg:0,offset:0,crossed:false,status:nodes.length===1?'arrived':'moving'};assertArmyTravel47(value,g);return value;
}
export function armyTravelLocation47(s:ArmyTravel47,g:TravelGraph47):{point:Point;cell:TravelCell47;onLand:boolean}{
 const a=g.cells.get(s.nodes[s.leg])!,l=armyTravelSegment47(s,g);
 if(l?.kind==='local'){const ratio=l.distance>0?s.offset/l.distance:1;return{point:ratio===1?{...l.endPoint}:ratio===0?{...l.start}:{x:l.start.x+(l.endPoint.x-l.start.x)*ratio,y:l.start.y+(l.endPoint.y-l.start.y)*ratio},cell:a,onLand:a.surface==='land'};}
 if(!l)return{point:{...(s.version===2?s.destination:s.leg===0?s.origin:a.center)},cell:a,onLand:a.surface==='land'};
 const first=!s.crossed,start=first?l.start:l.gate,end=first?l.gate:l.endPoint,total=first?l.toGate:l.distance-l.toGate;
 const ratio=total>0?(first?s.offset:s.offset-l.toGate)/total:0,cell=first?a:l.b;
 // Boundary points are canonical on both sides. Interpolating ratio=1 can
 // produce a different float from the same gate reached with ratio=0.
 if(s.offset===l.toGate)return{point:{...l.gate},cell,onLand:cell.surface==='land'};
 return{point:{x:start.x+(end.x-start.x)*ratio,y:start.y+(end.y-start.y)*ratio},cell,onLand:cell.surface==='land'};
}
/** Functional motion step. Base/world time conversion remains explicit at the
 * caller. Each segment stays inside its clipped convex half-face. New access
 * restrictions recheck at the physical shared edge, even after departure.
 * Crossed distinguishes a stopped gate from an entered destination cell.
 * No world, fleet, cargo or Army record is created/mutated by this primitive. */
export function advanceArmyTravel47(input:ArmyTravel47,g:TravelGraph47,seconds:number,speed:(cell:TravelCell47)=>number,canEnter:(cell:TravelCell47)=>boolean):{travel:ArmyTravel47;entered:number[];unusedSeconds:number}{
 assertArmyTravel47(input,g);if(!Number.isFinite(seconds)||seconds<0)throw Error('海陆行军时间无效。');
 const travel=cloneTravel47(input),entered:number[]=[];let remaining=seconds;
 if(travel.status==='arrived'||travel.status==='halted')return{travel,entered,unusedSeconds:remaining};
 while(remaining>0&&!['arrived','halted'].includes(travel.status)){
  const l=armyTravelSegment47(travel,g)!;
  if(l.kind==='local'){
   const v=speed(l.cell);if(!Number.isFinite(v)||v<0)throw Error('海陆行军速度无效。');if(v===0)break;
   const time=(l.distance-travel.offset)/v;if(remaining<time){travel.offset=Math.min(l.distance,travel.offset+remaining*v);if(travel.offset===l.distance)travel.status='arrived';remaining=0;break;}
   remaining=Math.max(0,remaining-time);travel.offset=l.distance;travel.status='arrived';break;
  }
  const {a,b}=l;
  if(!travel.crossed&&travel.offset===0&&!canEnter(b)){travel.status='blocked';break;}travel.status='moving';
  if(!travel.crossed&&travel.offset===l.toGate){if(!canEnter(b)){travel.status='blocked';break;}travel.crossed=true;entered.push(b.id);}
  if(travel.crossed&&travel.offset===l.distance){finishGate47(travel);continue;}
  const first=!travel.crossed,end=first?l.toGate:l.distance,v=speed(first?a:b);if(!Number.isFinite(v)||v<0)throw Error('海陆行军速度无效。');if(v===0)break;
  const time=(end-travel.offset)/v;if(remaining<time){travel.offset+=remaining*v;remaining=0;break;}
  remaining=Math.max(0,remaining-time);travel.offset=end;
  if(first){if(!canEnter(b)){travel.status='blocked';break;}travel.crossed=true;entered.push(b.id);if(travel.offset===l.distance)finishGate47(travel);}
  else finishGate47(travel);
 }
 assertArmyTravel47(travel,g);return{travel,entered,unusedSeconds:remaining};
}
/** Cancel preserves the actual point, avoiding a snap to an old land province. */
export function haltArmyTravel47(input:ArmyTravel47,g:TravelGraph47):ArmyTravel47{
 assertArmyTravel47(input,g);return{...cloneTravel47(input),status:'halted'};
}
/** Web adapter: redirect from the exact current point through gates of the
 * containing convex face. No nearest-center snapping, including shore stops. */
export function redirectArmyTravel47(input:ArmyTravel47,g:TravelGraph47,target:number,policy:TravelPolicy47):ArmyTravel47|null{
 assertArmyTravel47(input,g);const location=armyTravelLocation47(input,g),path=findArmyTravelPath47(g,location.cell.id,target,policy);if(!path)return null;
 return beginArmyTravel47(input.armyId,path.nodes,g,location.point);
}
function finishGate47(s:ArmyTravel47){s.leg++;s.offset=0;s.crossed=false;if(s.leg===s.nodes.length-1)s.status='arrived';}
export function beginArmyTravelToPoint47(armyId:string,nodes:readonly number[],g:TravelGraph47,origin:Point,destination:Point):ArmyTravel47{
 const value:ArmyTravel47={version:2,armyId,origin:{...origin},destination:{...destination},nodes:[...nodes],leg:0,offset:0,crossed:false,status:nodes.length===1&&distance(origin,destination)===0?'arrived':'moving'};
 assertArmyTravel47(value,g);return value;
}
export function redirectArmyTravelToPoint47(input:ArmyTravel47,g:TravelGraph47,target:number,destination:Point,policy:TravelPolicy47):ArmyTravel47|null{
 assertArmyTravel47(input,g);const at=armyTravelLocation47(input,g),path=findArmyTravelPath47(g,at.cell.id,target,policy);if(!path)return null;
 return beginArmyTravelToPoint47(input.armyId,path.nodes,g,at.point,destination);
}
/** Remaining actual polyline, including exact in-cell travel and last point. */
export function remainingArmyTravelPoints47(s:ArmyTravel47,g:TravelGraph47):Point[]{
 assertArmyTravel47(s,g);const points=[armyTravelLocation47(s,g).point];
 if(s.status==='arrived'||s.status==='halted')return points;
 const add=(p:Point)=>{const last=points.at(-1)!;if(last.x!==p.x||last.y!==p.y)points.push({...p});};
 if(s.version===2&&s.nodes.length===1){add(s.destination);return points;}
 for(let leg=s.leg;leg<s.nodes.length-1;leg++){const part=armyTravelSegment47({...s,leg},g);if(part?.kind!=='gate')throw Error('航线缺少实际通道。');if(leg!==s.leg||!s.crossed)add(part.gate);add(part.endPoint);}
 return points;
}
