import {Container,Graphics} from 'pixi.js';
import type {Point,World} from '../../sim/types';
import type {TravelGraph47} from './army-travel47-graph';
import {fmsAdjustColor} from '../state-line';

/** Original province battle arrows (Province.UpdateAttackArrow 0x45E030 /
 * EnableBattleArrow 0x452120, called from Province.Update):
 * - a province (at least 6 cells, held by a real state) keeps its arrows while any army
 *   targets it; with none they are destroyed and its arrow-start set is cleared;
 * - an arrow is dropped once its source province no longer belongs to the attacker;
 * - new arrows are only drawn when the province has none: the enemy armies targeting it
 *   are grouped by state, the two largest groups each get 1 (more than 1 army),
 *   2 (more than 5) or 3 (more than 7) arrows from their own neighbouring provinces,
 *   the largest first, skipping a neighbour this province already attacks;
 * - each arrow runs neighbour centre → this centre, bent through the border crossing of
 *   the cell path (GetPathMidPointToProvince), pushed outwards by 0.3 × the shorter half;
 *   a path shorter than 2.4 units stops the province's arrows for that update.
 * AttackArrowRenderer draws 30 points on t ∈ [0.1, 0.75] growing in over 1 s, width
 * curve 8 → 3 (keys with flat tangents), ShallowColor → DeepColor, outline +0.3.
 * CheckVisibility: shown only for the wars of the selected state unless "display attack
 * arrows" is on (off by default) and the camera half-height is at most 80 units. On the
 * original's 16:9 view that is a visible width of 80 × 2 × 16/9 units; the web compares the
 * visible width so a portrait phone showing the whole map behaves like the desktop. */
const UNITS_PER_MAP=240/1600,MIN_CELLS=6,MIN_LENGTH=2.4,SHOW_WIDTH=80*2*16/9;
export type BattleArrow47={source:string;target:string;attacker:string;defender:string;start:Point;control:Point;end:Point;born:number};
type Province={id:string;center:Point;controller:string};

/** Province.neighbors: provinces whose land cells touch, in cell order (the web's
 * Province.neighbors list is incomplete, the travel cells are the real adjacency). */
export function provinceNeighbors47(graph:TravelGraph47){
  const out=new Map<string,string[]>();
  for(const [province,ids] of graph.byProvince){const list:string[]=[];for(const id of ids)for(const link of graph.cells.get(id)!.links){const other=graph.cells.get(link.to);if(other?.surface==='land'&&other.provinceId&&other.provinceId!==province&&!list.includes(other.provinceId))list.push(other.provinceId);}out.set(province,list);}
  return out;
}
export function arrowCount47(armies:number){return armies>7?3:armies>5?2:armies>1?1:0;}
/** First border crossing of the cheapest cell path between two province centres,
 * restricted to the cells of the two provinces; null when they are not connected. */
export function pathMidPoint47(graph:TravelGraph47,from:Province,to:Province):Point|null{
  const allowed=new Set([...graph.byProvince.get(from.id)??[],...graph.byProvince.get(to.id)??[]]);
  const nearest=(p:Province)=>{let best=-1,d=Infinity;for(const id of graph.byProvince.get(p.id)??[]){const c=graph.cells.get(id)!.center,e=Math.hypot(c.x-p.center.x,c.y-p.center.y);if(e<d){d=e;best=id;}}return best;};
  const start=nearest(from),goal=nearest(to);if(start<0||goal<0)return null;
  const dist=new Map([[start,0]]),prev=new Map<number,number>(),open=new Set([start]);
  while(open.size){
    let at=-1,low=Infinity;for(const id of open){const d=dist.get(id)!;if(d<low){low=d;at=id;}}
    open.delete(at);if(at===goal)break;
    for(const link of graph.cells.get(at)!.links){if(!allowed.has(link.to))continue;const d=low+link.distance;if(d<(dist.get(link.to)??Infinity)){dist.set(link.to,d);prev.set(link.to,at);open.add(link.to);}}
  }
  if(!dist.has(goal))return null;
  const path=[goal];while(path[0]!==start)path.unshift(prev.get(path[0])!);
  for(let i=0;i+1<path.length;i++){const a=graph.cells.get(path[i])!,b=graph.cells.get(path[i+1])!;if(a.provinceId!==b.provinceId)return {x:(a.center.x+b.center.x)/2,y:(a.center.y+b.center.y)/2};}
  return null;
}
export class BattleArrowState47{
  private arrows=new Map<string,BattleArrow47[]>();private starts=new Map<string,Set<string>>();private mids=new Map<string,Point|null>();private neighbors:Map<string,string[]>;
  constructor(private graph:TravelGraph47,private scale:number){this.neighbors=provinceNeighbors47(graph);}
  get all(){return [...this.arrows.values()].flat();}
  /** One Province.Update pass in province order. `targeting` lists, per province, the
   * states of the living armies that target it in army order. */
  update(world:Pick<World,'provinces'|'nations'>,targeting:ReadonlyMap<string,readonly string[]>,now:number){
    const places=new Map(world.provinces.map(p=>[p.id,p])),states=new Set(world.nations.map(n=>n.id));
    for(const p of world.provinces){
      if((this.graph.byProvince.get(p.id)?.length??0)<MIN_CELLS||!states.has(p.controller))continue;
      const armies=targeting.get(p.id)??[];
      if(!armies.length){this.arrows.delete(p.id);this.starts.get(p.id)?.clear();continue;}
      const kept=(this.arrows.get(p.id)??[]).filter(a=>places.get(a.source)?.controller===a.attacker);
      if(kept.length){this.arrows.set(p.id,kept);continue;}
      this.arrows.delete(p.id);this.enable(p,armies,places,now);
    }
  }
  private enable(p:Province,armies:readonly string[],places:Map<string,Province>,now:number){
    const counts=new Map<string,number>();for(const s of armies)if(s!==p.controller)counts.set(s,(counts.get(s)??0)+1);
    const groups=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,2);if(!groups.length)return;
    const byState=new Map<string,string[]>();for(const id of this.neighbors.get(p.id)??[]){const n=places.get(id);if(!n)continue;const list=byState.get(n.controller)??[];list.push(id);byState.set(n.controller,list);}
    const cells=(id:string)=>this.graph.byProvince.get(id)?.length??0,made:BattleArrow47[]=[],starts=this.starts.get(p.id)??new Set<string>();this.starts.set(p.id,starts);
    for(const [state,count] of groups){
      const picks=[...byState.get(state)??[]].sort((a,b)=>cells(b)-cells(a)).slice(0,arrowCount47(count));
      for(const id of picks){
        if(this.starts.get(id)?.has(p.id))continue;
        const n=places.get(id)!,key=id+'>'+p.id;
        if(!this.mids.has(key))this.mids.set(key,pathMidPoint47(this.graph,n,p));
        const mid=this.mids.get(key);if(!mid){this.commit(p.id,made);return;}
        const units=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)/this.scale*UNITS_PER_MAP,d1=units(n.center,mid),d2=units(mid,p.center);
        if(d1+d2<MIN_LENGTH){this.commit(p.id,made);return;}
        const vx=mid.x-(n.center.x+p.center.x)/2,vy=mid.y-(n.center.y+p.center.y)/2,len=Math.hypot(vx,vy),push=Math.min(d1,d2)*.3/UNITS_PER_MAP*this.scale;
        const control=len>1e-9?{x:mid.x+vx/len*push,y:mid.y+vy/len*push}:mid;
        made.push({source:id,target:p.id,attacker:n.controller,defender:p.controller,start:n.center,control,end:p.center,born:now});starts.add(id);
      }
    }
    this.commit(p.id,made);
  }
  private commit(target:string,made:BattleArrow47[]){if(made.length)this.arrows.set(target,made);}
}
const rgb=(hex:string):[number,number,number]=>{const v=Number.parseInt(hex.replace('#',''),16);return [(v>>16&255)/255,(v>>8&255)/255,(v&255)/255];};
const pack=([r,g,b]:[number,number,number])=>Math.round(r*255)<<16|Math.round(g*255)<<8|Math.round(b*255);
/** MaterialManager.UpdateStateColor: ShallowColor = AdjustColor(c, -0.05, -0.05), DeepColor = AdjustColor(c, +0.1, 0.05) (value lowered). */
export function arrowColors47(color:string){const c=rgb(color);return {shallow:fmsAdjustColor(c,-.05,-.05),deep:fmsAdjustColor(c,.1,.05)};}
const lerp=(a:[number,number,number],b:[number,number,number],t:number)=>pack([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);
const bezier=(a:Point,b:Point,c:Point,t:number)=>({x:(1-t)**2*a.x+2*(1-t)*t*b.x+t*t*c.x,y:(1-t)**2*a.y+2*(1-t)*t*b.y+t*t*c.y});
/** AnimationCurve(Keyframe(0, 8), Keyframe(1, 3)): flat tangents, i.e. a cubic Hermite ease. */
const width=(s:number)=>8-5*s*s*(3-2*s);
export class BattleArrows47{
  readonly layer=new Container();
  constructor(){this.layer.eventMode='none';}
  /** Redraws every visible arrow; returns true while one is still growing. */
  draw(arrows:readonly BattleArrow47[],colors:ReadonlyMap<string,string>,toMap:(p:Point)=>Point,cameraScale:number,visibleWidthUnits:number,showAll:boolean,selected:string|null,now:number){
    this.layer.removeChildren().forEach(c=>c.destroy());
    const px=1/cameraScale,all=showAll&&visibleWidthUnits<=SHOW_WIDTH;let growing=false;
    for(const a of arrows){
      if(!all&&selected!==a.attacker&&selected!==a.defender)continue;
      const growth=Math.min(1,.1+(now-a.born)/1000);if(growth<1)growing=true;
      const {shallow,deep}=arrowColors47(colors.get(a.attacker)??'#888888'),g=new Graphics();this.layer.addChild(g);
      const s=toMap(a.start),c=toMap(a.control),e=toMap(a.end),points=Array.from({length:30},(_,i)=>bezier(s,c,e,.1+.65*growth*i/29));
      for(const outline of [true,false])for(let i=1;i<30;i++){
        const k=i/29,w=(width(k)+(outline?.3*2:0))*px;
        g.moveTo(points[i-1].x,points[i-1].y).lineTo(points[i].x,points[i].y).stroke({width:w,color:outline?0x1d1a16:lerp(shallow,deep,k),alpha:outline?.55:1,cap:'round'});
      }
      const tip=points[29],before=points[28],dx=tip.x-before.x,dy=tip.y-before.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,h=6*px,l=9*px;
      g.poly([tip.x-uy*h,tip.y+ux*h,tip.x+ux*l,tip.y+uy*l,tip.x+uy*h,tip.y-ux*h]).fill({color:pack(deep)}).stroke({color:0x1d1a16,width:.6*px,alpha:.55});
    }
    return growing;
  }
  dispose(){this.layer.destroy({children:true});}
}
