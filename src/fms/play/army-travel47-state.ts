import type {Point} from '../../sim/types';
import {findArmyTravelPath47,insideTravelCell47,type TravelPolicy47,type TravelGraph47,type TravelCell47} from './army-travel47-graph';
export type ArmyTravel47={version:1;armyId:string;origin:Point;nodes:number[];leg:number;offset:number;crossed:boolean;status:'moving'|'arrived'|'blocked'|'halted'};
const keys=['version','armyId','origin','nodes','leg','offset','crossed','status'];
function segment(s:ArmyTravel47,g:TravelGraph47){
 const a=g.cells.get(s.nodes[s.leg])!,b=g.cells.get(s.nodes[s.leg+1]);if(!b)return null;
 const link=a.links.find(l=>l.to===b.id);if(!link)return null;
 const start=s.leg===0?s.origin:a.center,toGate=Math.hypot(start.x-link.gate.x,start.y-link.gate.y),distance=toGate+Math.hypot(b.center.x-link.gate.x,b.center.y-link.gate.y);
 return{a,b,start,gate:link.gate,toGate,distance};
}
/** Validate real topology and distance before accepting a saved mixed path.
 * This geometry guard does not replace run/Army identity and diplomatic guards. */
export function assertArmyTravel47(value:unknown,g:TravelGraph47):asserts value is ArmyTravel47{
 const s=value as ArmyTravel47;
 if(!s||typeof s!=='object'||Object.keys(s).length!==keys.length||Object.keys(s).some(k=>!keys.includes(k))||s.version!==1||typeof s.armyId!=='string'||!s.armyId||!Array.isArray(s.nodes)||!s.nodes.length||s.nodes.length>g.cells.size+1||Array.from({length:s.nodes.length},(_,i)=>i).some(i=>!Object.hasOwn(s.nodes,i)||!Number.isSafeInteger(s.nodes[i])||!g.cells.has(s.nodes[i]))||!Number.isSafeInteger(s.leg)||s.leg<0||s.leg>=s.nodes.length||!Number.isFinite(s.offset)||s.offset<0||typeof s.crossed!=='boolean'||!['moving','arrived','blocked','halted'].includes(s.status))throw Error('海陆行军记录无效，已保留原档。');
 for(let i=1;i<s.nodes.length;i++)if(!g.cells.get(s.nodes[i-1])!.links.some(l=>l.to===s.nodes[i]))throw Error('海陆行军记录跨越了不相邻格。');
 if(!s.origin||Object.keys(s.origin).sort().join('/')!=='x/y'||!insideTravelCell47(g.cells.get(s.nodes[0])!,s.origin))throw Error('海陆行军起点不在实际格内。');
 const link=segment(s,g);
 if(s.leg===s.nodes.length-1){if(s.offset!==0||s.crossed||!['arrived','halted'].includes(s.status))throw Error('海陆行军终点状态无效。');}
 else if(!link||s.offset>=link.distance||s.status==='arrived'||(s.crossed?s.offset<link.toGate:s.offset>link.toGate)||s.status==='blocked'&&(s.crossed||s.offset!==0&&s.offset!==link.toGate))throw Error('海陆行军进度与路径不一致。');
}
export function beginArmyTravel47(armyId:string,nodes:readonly number[],g:TravelGraph47,origin?:Point):ArmyTravel47{
 const start=origin??g.cells.get(nodes[0])?.center;if(!start)throw Error('行军起点不存在。');
 const value:ArmyTravel47={version:1,armyId,origin:{...start},nodes:[...nodes],leg:0,offset:0,crossed:false,status:nodes.length===1?'arrived':'moving'};assertArmyTravel47(value,g);return value;
}
export function armyTravelLocation47(s:ArmyTravel47,g:TravelGraph47):{point:Point;cell:TravelCell47;onLand:boolean}{
 const a=g.cells.get(s.nodes[s.leg])!,b=g.cells.get(s.nodes[s.leg+1]);if(!b)return{point:{...(s.leg===0?s.origin:a.center)},cell:a,onLand:a.surface==='land'};
 const l=segment(s,g)!;
 const first=!s.crossed,start=first?l.start:l.gate,end=first?l.gate:b.center,total=first?l.toGate:l.distance-l.toGate;
 const ratio=total>0?(first?s.offset:s.offset-l.toGate)/total:0,cell=first?a:b;
 return{point:{x:start.x+(end.x-start.x)*ratio,y:start.y+(end.y-start.y)*ratio},cell,onLand:cell.surface==='land'};
}
/** Functional motion step. Base/world time conversion remains explicit at the
 * caller. Each segment stays inside its clipped convex half-face. New access
 * restrictions recheck at the physical shared edge, even after departure.
 * Crossed distinguishes a stopped gate from an entered destination cell.
 * No world, fleet, cargo or Army record is created/mutated by this primitive. */
export function advanceArmyTravel47(input:ArmyTravel47,g:TravelGraph47,seconds:number,speed:(cell:TravelCell47)=>number,canEnter:(cell:TravelCell47)=>boolean):{travel:ArmyTravel47;entered:number[];unusedSeconds:number}{
 assertArmyTravel47(input,g);if(!Number.isFinite(seconds)||seconds<0)throw Error('海陆行军时间无效。');
 const travel={...input,origin:{...input.origin},nodes:[...input.nodes]},entered:number[]=[];let remaining=seconds;
 if(travel.status==='arrived'||travel.status==='halted')return{travel,entered,unusedSeconds:remaining};
 while(remaining>0&&travel.leg<travel.nodes.length-1){
  const l=segment(travel,g)!,{a,b}=l;
  if(!travel.crossed&&travel.offset===0&&!canEnter(b)){travel.status='blocked';break;}travel.status='moving';
  if(!travel.crossed&&travel.offset===l.toGate){if(!canEnter(b)){travel.status='blocked';break;}travel.crossed=true;entered.push(b.id);}
  const first=!travel.crossed,end=first?l.toGate:l.distance,v=speed(first?a:b);if(!Number.isFinite(v)||v<0)throw Error('海陆行军速度无效。');if(v===0)break;
  const time=(end-travel.offset)/v;if(remaining<time){travel.offset+=remaining*v;remaining=0;break;}
  remaining=Math.max(0,remaining-time);travel.offset=end;
  if(first){if(!canEnter(b)){travel.status='blocked';break;}travel.crossed=true;entered.push(b.id);}
  else{travel.leg++;travel.offset=0;travel.crossed=false;if(travel.leg===travel.nodes.length-1)travel.status='arrived';}
 }
 assertArmyTravel47(travel,g);return{travel,entered,unusedSeconds:remaining};
}
/** Cancel preserves the actual point, avoiding a snap to an old land province. */
export function haltArmyTravel47(input:ArmyTravel47,g:TravelGraph47):ArmyTravel47{
 assertArmyTravel47(input,g);return{...input,origin:{...input.origin},nodes:[...input.nodes],status:'halted'};
}
/** Web adapter: redirect from the exact current point through gates of the
 * containing convex face. No nearest-center snapping, including shore stops. */
export function redirectArmyTravel47(input:ArmyTravel47,g:TravelGraph47,target:number,policy:TravelPolicy47):ArmyTravel47|null{
 assertArmyTravel47(input,g);const location=armyTravelLocation47(input,g),path=findArmyTravelPath47(g,location.cell.id,target,policy);if(!path)return null;
 return beginArmyTravel47(input.armyId,path.nodes,g,location.point);
}
