import type { Point } from '../../sim/types';
import type { FmsRun } from './world';
import { armyPosition } from './navigation';
import { fleetPosition } from './navy';
import {graphFor} from './naval-rules';
import { seaRoute, seaRoutePoints } from './sea-path';

export type Tracks={armies:Map<string,Point[]>;fleets:Map<string,Point[]>};
export type DisplayFrame={armies:Map<string,Point>;fleets:Map<string,Point>;alpha:number};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const length=(points:Point[])=>points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
export function pointAlong(points:Point[],distanceAlong:number):Point {
  for(let i=1;i<points.length;i++){const d=distance(points[i-1],points[i]);if(d>0&&distanceAlong<d){const t=Math.max(0,distanceAlong/d);return {x:points[i-1].x+(points[i].x-points[i-1].x)*t,y:points[i-1].y+(points[i].y-points[i-1].y)*t};}distanceAlong-=d;}
  return points.at(-1)!;
}
export function sliceTrack(points:Point[],from:number,to:number):Point[]{
  const result=[pointAlong(points,from)];let at=0;
  for(let i=1;i<points.length;i++){at+=distance(points[i-1],points[i]);if(at>from&&at<to)result.push(points[i]);}
  result.push(pointAlong(points,to));return result;
}
/** Presentation only. Paths are proved from consecutive authoritative snapshots;
 * unknown resets hold their new position, never invent a straight-line journey. */
export function dayTracks(previous:FmsRun,next:FmsRun):Tracks {
  const tracks:Tracks={armies:new Map(),fleets:new Map()},consecutive=previous.id===next.id&&next.world.day===previous.world.day+1;
  const provinces=new Map(next.world.provinces.map(p=>[p.id,p])),oldArmies=new Map(previous.world.armies.map(a=>[a.id,a]));
  for(const a of next.world.armies){
    if(a.status==='destroyed'||a.troops<=0)continue;
    const end=armyPosition(next.world,a),old=oldArmies.get(a.id);let points=[end];
    if(consecutive&&old&&old.status!=='destroyed'&&old.troops>0){
      const start=armyPosition(previous.world,old),chain=[old.provinceId,...old.route],index=chain.indexOf(a.provinceId);
      if(old.route.length&&index>=0&&(index>0||a.progress>=old.progress)&&(a.progress===0||chain[index+1]===a.route[0]))points=[start,...chain.slice(1,index+1).map(id=>provinces.get(id)!.center),end];
      else if(!old.route.length&&((a.provinceId===old.provinceId)||(a.progress===0&&provinces.get(old.provinceId)?.neighbors.includes(a.provinceId))))points=[start,end];
    }
    tracks.armies.set(a.id,points);
  }
  if(next.version===3||(next.version===4||next.version===5)){
    const graph=graphFor(next),oldFleets=new Map(previous.version===3||(previous.version===4||previous.version===5)?previous.navy.fleets.map(f=>[f.id,f]):[]);
    for(const f of next.navy.fleets){
      if(f.status==='lost')continue;
      const end=fleetPosition(graph,f),old=oldFleets.get(f.id);let points=[end];
      if(consecutive&&old&&old.status!=='lost'){
        const target=graph.ports.find(p=>p.id===(f.targetId??f.dockId));
        const chain=old.route.length?[old.node,...old.route]:target?seaRoute(graph,old.node,target.node):null;
        if(chain){const index=chain.indexOf(f.node),suffix=chain.slice(index+1);
          if(index>=0&&suffix.length===f.route.length&&suffix.every((id,i)=>id===f.route[i])){
            const route=seaRoutePoints(graph,chain),to=length(seaRoutePoints(graph,chain.slice(0,index+1)))+f.progress;
            if(to>=old.progress)points=sliceTrack(route,old.progress,to);
          }
        }
      }
      tracks.fleets.set(f.id,points);
    }
  }
  return tracks;
}
export function sampleTracks(tracks:Tracks,alpha:number):DisplayFrame {
  const sample=(items:Map<string,Point[]>)=>new Map([...items].map(([id,points])=>[id,pointAlong(points,length(points)*Math.max(0,Math.min(1,alpha)))]));
  return {armies:sample(tracks.armies),fleets:sample(tracks.fleets),alpha};
}
/** Freeze/resume and rate changes keep the same display pose. No display state
 * is written into the World, Worker command or IndexedDB save. */
export class MovementClock {
  private tracks:Tracks={armies:new Map(),fleets:new Map()};
  private anchor=0;private fraction=1;private duration=3000;private running=false;
  alpha(now:number){return Math.min(1,this.fraction+(this.running?Math.max(0,now-this.anchor)/this.duration:0));}
  frame(now:number){return sampleTracks(this.tracks,this.alpha(now));}
  remaining(now:number){return (1-this.alpha(now))*this.duration;}
  active(now:number){return this.running&&this.alpha(now)<1;}
  setRunning(running:boolean,now:number){this.fraction=this.alpha(now);this.anchor=now;this.running=running;}
  setDuration(duration:number,now:number){this.fraction=this.alpha(now);this.anchor=now;this.duration=duration;}
  reset(run:FmsRun,now:number){this.tracks=dayTracks(run,run);this.fraction=1;this.anchor=now;this.running=false;}
  reconcile(run:FmsRun,now:number){
    const fresh=dayTracks(run,run);
    for(const kind of ['armies','fleets'] as const)for(const [id,path] of fresh[kind]){const old=this.tracks[kind].get(id);if(old&&distance(old.at(-1)!,path[0])<1e-7)fresh[kind].set(id,old);}
    this.fraction=this.alpha(now);this.anchor=now;this.tracks=fresh;
  }
  start(previous:FmsRun,next:FmsRun,now:number,duration:number){
    const fresh=dayTracks(previous,next),alpha=this.alpha(now);
    // Small Worker scheduling delays cannot drop an unfinished final corner.
    if(alpha<1)for(const kind of ['armies','fleets'] as const)for(const [id,path] of fresh[kind]){const old=this.tracks[kind].get(id);if(old&&distance(old.at(-1)!,path[0])<1e-7)fresh[kind].set(id,[...sliceTrack(old,length(old)*alpha,length(old)),...path.slice(1)]);}
    this.tracks=fresh;this.fraction=0;this.anchor=now;this.duration=duration;this.running=true;
  }
}
