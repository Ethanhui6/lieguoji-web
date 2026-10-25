import type {Point} from '../../sim/types';

/** Presentation only. Existing routes open fully; new orders grow from 10%.
 * Keep an order through suffix consumption and LOD hiding, not through a reroute. */
export class OrderMotion {
  private initialized=false;
  private last:number|null=null;
  private orders=new Map<string,{route:string[];growth:number}>();
  sync(items:readonly {id:string;route:string[]}[]){
    const live=new Set(items.map(o=>o.id));
    for(const id of this.orders.keys())if(!live.has(id))this.orders.delete(id);
    for(const item of items){
      const old=this.orders.get(item.id),offset=(old?.route.length??0)-item.route.length;
      const suffix=old&&offset>=0&&item.route.every((id,i)=>old.route[offset+i]===id);
      this.orders.set(item.id,{route:[...item.route],growth:suffix?old.growth:this.initialized?.1:1});
    }
    this.initialized=true;
  }
  growth(id:string){return this.orders.get(id)?.growth??1;}
  step(now:number,running:boolean,reduced:boolean){
    const delta=this.last===null?0:Math.min(100,Math.max(0,now-this.last));this.last=now;let changed=false;
    for(const o of this.orders.values()){const before=o.growth;o.growth=reduced?1:running?Math.min(1,o.growth+delta/1000):o.growth;changed||=before!==o.growth;}
    return changed;
  }
}

export interface ShipPose {id:string;point:Point;color:string|number;radius:number}
/** Observes a live-to-lost transition only. The tombstone has no game interaction. */
export class SinkMotion {
  private created=0;private removed=0;private delta=0;private reduced=false;
  diagnostics(){return {created:this.created,removed:this.removed,active:this.ghosts.size,known:this.known.size,delta:this.delta,reduced:this.reduced};}
  private known=new Map<string,ShipPose>();
  private ghosts=new Map<string,{pose:ShipPose;elapsed:number;born:number}>();
  private last:number|null=null;
  sync(live:readonly ShipPose[],lost:readonly ShipPose[],now=performance.now()){
    for(const pose of lost)if(this.known.has(pose.id)&&!this.ghosts.has(pose.id)){this.created++;this.ghosts.set(pose.id,{pose:{...pose,point:{...pose.point}},elapsed:0,born:now});}
    this.known=new Map(live.map(p=>[p.id,{...p,point:{...p.point}}]));
  }
  move(points:ReadonlyMap<string,Point>){for(const [id,point]of points){const pose=this.known.get(id);if(pose)pose.point={...point};}}
  step(now:number,reduced:boolean){
    const delta=this.last===null?0:Math.max(0,now-this.last);this.last=now;
    const changed=this.ghosts.size>0;this.delta=delta;this.reduced=reduced;
    for(const [id,g]of this.ghosts){g.elapsed=Math.max(0,now-g.born);if(reduced||g.elapsed>=800){this.ghosts.delete(id);this.removed++;}}
    return changed;
  }
  frames(){return [...this.ghosts.values()].map(({pose,elapsed})=>{const u=Math.min(1,elapsed/800),s=u*u*(3-2*u);return {...pose,scale:1-.72*s,rotation:14*Math.PI/180*s,alpha:.95*(1-s),drop:s*pose.radius*.7};});}
}

export interface FallenPose {id:string;x:number;y:number;texture:string;tint:number;size:number}
/** Web addition (the original destroys the army object at once): an army icon that leaves the
 * map — troops gone, destroyed or disbanded — topples, sinks and fades over 900 ms, with a
 * dust ring spreading under it. Display only; the ghost has no interaction. */
export const FALL_MS=900;
export class FallMotion {
  private known=new Map<string,FallenPose>();
  private ghosts=new Map<string,{pose:FallenPose;born:number}>();
  sync(live:readonly FallenPose[],now=performance.now()){
    const ids=new Set(live.map(p=>p.id));
    for(const [id,pose]of this.known)if(!ids.has(id)&&!this.ghosts.has(id))this.ghosts.set(id,{pose,born:now});
    this.known=new Map(live.map(p=>[p.id,{...p}]));
  }
  step(now:number,reduced:boolean){const changed=this.ghosts.size>0;for(const [id,g]of this.ghosts)if(reduced||now-g.born>=FALL_MS)this.ghosts.delete(id);return changed;}
  frames(now=performance.now()){
    return [...this.ghosts.values()].map(({pose,born})=>{
      const u=Math.min(1,Math.max(0,(now-born)/FALL_MS)),ease=1-(1-u)**3;
      return {...pose,u,rotation:ease*75*Math.PI/180,drop:ease*pose.size*.3,scale:1-.18*ease,alpha:u<.35?1:1-((u-.35)/.65)**1.4,dust:ease};
    });
  }
}
