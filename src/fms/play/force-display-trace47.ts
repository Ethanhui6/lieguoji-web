import type {Point} from '../../sim/types';
import type {MovingForce47} from './force-motion47';
import type {TravelGraph47} from './army-travel47-graph';
import {armyTravelLocation47} from './army-travel47-state';

export type ForceTracePoint47=Point&{tick:number};
export type ForceDisplayTrace47={runId:string;fromSequence:number;toSequence:number;fromTick:number;toTick:number;armies:Record<string,ForceTracePoint47[]>;fleets:Record<string,ForceTracePoint47[]>};
export type ForceMotionObserver47=(forces:readonly MovingForce47[],graph:TravelGraph47,tick:number)=>void;
/** Request-local presentation evidence. Sample only actual event endpoints;
 * never persist it or feed it back into movement, damage, access or saves. */
export class ForceDisplayTraceCollector47 {
 private size=0;private overflow=false;
 readonly value:ForceDisplayTrace47;
 constructor(runId:string,fromSequence:number,fromTick:number){this.value={runId,fromSequence,toSequence:fromSequence,fromTick,toTick:fromTick,armies:{},fleets:{}};}
 record(kind:'army'|'fleet',id:string,tick:number,point:Point){
  if(this.overflow)return;
  const book=kind==='army'?this.value.armies:this.value.fleets,path=book[id]??(book[id]=[]),last=path.at(-1);
  if(last&&tick===last.tick){if(last.x!==point.x||last.y!==point.y){this.overflow=true;}return;}
  const sample={tick,x:point.x,y:point.y},before=path.at(-2);
  // Remove only a sample with the same time-parametrized velocity. Corners,
  // reversals, speed changes and the beginning/end of waits remain intact.
  if(before&&last&&tick>last.tick){const t=(last.tick-before.tick)/(tick-before.tick);
   if(Math.abs(before.x+(sample.x-before.x)*t-last.x)<1e-9&&Math.abs(before.y+(sample.y-before.y)*t-last.y)<1e-9){path[path.length-1]=sample;return;}}
  path.push(sample);if(++this.size>200000||path.length>8192)this.overflow=true;
 }
 observe:ForceMotionObserver47=(forces,graph,tick)=>{if(this.overflow)return;for(const force of forces)this.record(force.kind,force.id,tick,armyTravelLocation47(force.travel,graph).point);};
 finish(toSequence:number,toTick:number){if(this.overflow)return undefined;this.value.toSequence=toSequence;this.value.toTick=toTick;return this.value;}
}
