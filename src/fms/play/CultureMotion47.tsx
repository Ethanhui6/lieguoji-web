import type {Point} from '../../sim/types';
import type {Culture47Snapshot} from './culture47.worker';
import type {ForceDisplayTrace47,ForceTracePoint47} from './force-display-trace47';
import type {DisplayFrame} from './motion';
import type {ArmyTravel47} from './army-travel47-state';
import {armyTravelSegment47} from './army-travel47-state';
import type {TravelGraph47} from './army-travel47-graph';
import {sliceTrack} from './motion';

const near=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-7;
type Paths={armies:Map<string,ForceTracePoint47[]>;fleets:Map<string,ForceTracePoint47[]>};
function sample(path:ForceTracePoint47[],tick:number):Point {
 if(tick<=path[0].tick)return path[0];
 for(let i=1;i<path.length;i++)if(tick<path[i].tick){const a=path[i-1],b=path[i],t=(tick-a.tick)/(b.tick-a.tick);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
 return path.at(-1)!;
}
function tail(path:ForceTracePoint47[],tick:number){return [{...sample(path,tick),tick},...path.filter(p=>p.tick>tick)];}
/** Old frozen workers have no trace metadata. Only a provably unchanged route
 * may be reconstructed; unknown mid-batch reroutes are never joined by a chord. */
export function provedTravelTrack47(a:ArmyTravel47,b:ArmyTravel47,g:TravelGraph47):Point[]|null{
 if(a.version!==b.version||!near(a.origin,b.origin)||a.nodes.length!==b.nodes.length||a.nodes.some((id,i)=>id!==b.nodes[i])||a.version===2&&b.version===2&&!near(a.destination,b.destination))return null;
 const path:Point[]=[a.origin];let from=0,to=0,total=0;
 if(a.nodes.length===1){if(a.version!==2||b.version!==2)return[a.origin];path.push(a.destination);from=a.offset;to=b.offset;}
 else {for(let leg=0;leg<a.nodes.length-1;leg++){const segment=armyTravelSegment47({...a,leg},g);if(!segment||segment.kind!=='gate')return null;if(leg===a.leg)from=total+a.offset;if(leg===b.leg)to=total+b.offset;path.push(segment.gate,segment.endPoint);total+=segment.distance;}if(a.leg===a.nodes.length-1)from=total;if(b.leg===b.nodes.length-1)to=total;}
 return to+1e-8<from?null:sliceTrack(path,from,to);
}
function legacyTrace(previous:Culture47Snapshot,next:Culture47Snapshot,graph:()=>TravelGraph47):ForceDisplayTrace47{
 const trace:ForceDisplayTrace47={runId:next.run.id,fromSequence:previous.journal.actions.length,toSequence:next.journal.actions.length,fromTick:previous.run.clock.tick,toTick:next.run.clock.tick,armies:{},fleets:{}};let g:TravelGraph47|undefined;
 for(const kind of ['armies','fleets'] as const){const book=kind==='armies'?'armyPositions':'fleetPositions';for(const [id,end]of next.frame[kind]){const a=previous.run[book].records[id],b=next.run[book].records[id],start=previous.frame[kind].get(id);if(!a||!b||!start)continue;
  const issued=kind==='armies'?next.run.armyAutonomy.armies[id]?.issuedTick:next.run.navalAutonomy.fleets[id]?.issuedTick;
  if(typeof issued!=='number'||!Number.isFinite(issued)||issued>previous.run.clock.tick)continue;
  const points=near(start,end)&&a.status!=='moving'?[start,end]:provedTravelTrack47(a,b,g??(g=graph()));if(!points||!near(points[0],start)||!near(points.at(-1)!,end))continue;
  const distances=points.map((p,i)=>i?Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y):0),length=distances.reduce((s,n)=>s+n,0);let at=0;
  trace[kind][id]=points.map((p,i)=>{at+=distances[i];return{...p,tick:trace.fromTick+(trace.toTick-trace.fromTick)*(length?at/length:i/(points.length-1||1))};}).filter((p,i,all)=>!i||p.tick>all[i-1].tick);
 }}return trace;
}

/** A small, one-ACK presentation buffer. It plays already accepted movement,
 * including real waits and turns, and never predicts beyond the final point. */
export class CultureMotion47 {
 private snapshot?:Culture47Snapshot;private tracks:Paths={armies:new Map(),fleets:new Map()};
 private from=0;private to=0;private anchor=0;private duration=1;private fraction=1;private running=false;private received=0;private interval=0;
 revision=0;
 alpha(now:number){return Math.min(1,this.fraction+(this.running?Math.max(0,now-this.anchor)/this.duration:0));}
 tick(now:number){return this.from+(this.to-this.from)*this.alpha(now);}
 setRunning(value:boolean,now:number){if(value===this.running)return;this.fraction=this.alpha(now);this.anchor=now;this.running=value;if(value){this.received=now;this.interval=0;}}
 frame(now:number):DisplayFrame&{independentArmies:ReadonlySet<string>}{
  const tick=this.tick(now),independentArmies=new Set<string>(),points=(kind:'armies'|'fleets')=>new Map([...this.tracks[kind]].map(([id,path])=>{const point=sample(path,tick);if(kind==='armies'&&path.some(p=>p.tick>tick&&!near(p,point)))independentArmies.add(id);return[id,point];}));
  const armies=points('armies'),fleets=points('fleets');return{armies,fleets,alpha:this.alpha(now),independentArmies};
 }
 install(next:Culture47Snapshot,now:number,graph:()=>TravelGraph47,immediate=false){
  const previous=this.snapshot,oldTick=this.tick(now),end=next.run.clock.tick;this.snapshot=next;
  if(!previous||previous.run.id!==next.run.id||previous.journal.engine!==next.journal.engine||end<previous.run.clock.tick||immediate){
   this.tracks={armies:new Map([...next.frame.armies].map(([id,p])=>[id,[{...p,tick:end}]])),fleets:new Map([...next.frame.fleets].map(([id,p])=>[id,[{...p,tick:end}]]))};this.from=this.to=end;this.fraction=1;this.anchor=this.received=now;this.revision++;return;
  }
  if(end===previous.run.clock.tick){ // Previews and edits do not restart motion.
   for(const kind of ['armies','fleets'] as const){const living=new Set((kind==='armies'?next.run.world.armies.filter(a=>a.troops>0&&a.status!=='destroyed'):next.run.navy.fleets.filter(f=>f.status!=='lost')).map(a=>a.id));for(const id of this.tracks[kind].keys())if(!living.has(id))this.tracks[kind].delete(id);for(const [id,p]of next.frame[kind])if(living.has(id)&&(!this.tracks[kind].has(id)||!near(this.tracks[kind].get(id)!.at(-1)!,p)))this.tracks[kind].set(id,[{...p,tick:end}]);}this.revision++;return;
  }
  const trace=next.motion??legacyTrace(previous,next,graph),fresh:Paths={armies:new Map(),fleets:new Map()};
  const alive={armies:new Set(next.run.world.armies.filter(a=>a.troops>0&&a.status!=='destroyed').map(a=>a.id)),fleets:new Set(next.run.navy.fleets.filter(f=>f.status!=='lost').map(f=>f.id))};
  for(const kind of ['armies','fleets'] as const)for(const [id,point]of next.frame[kind]){
   if(!alive[kind].has(id))continue;const path=trace[kind][id],old=this.tracks[kind].get(id);
   if(path?.length&&near(path.at(-1)!,point)){
    const rest=old&&oldTick<previous.run.clock.tick&&near(old.at(-1)!,path[0])?tail(old,oldTick):[];
    fresh[kind].set(id,rest.length?[...rest,...path.filter(p=>p.tick>rest.at(-1)!.tick)]:path);
   }else fresh[kind].set(id,[{...point,tick:end}]);
  }
  const elapsed=Math.max(16,now-this.received);this.interval=this.interval?Math.max(elapsed,this.interval*.8+elapsed*.2):elapsed;
  this.duration=Math.max(160,Math.min(10000,this.interval*1.18));this.received=this.anchor=now;this.from=Math.min(oldTick,previous.run.clock.tick);this.to=end;this.fraction=0;this.tracks=fresh;this.revision++;
 }
}
