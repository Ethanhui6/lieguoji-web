import type {Point,World} from '../../sim/types';
import {engagementPoint,type BattleState} from './battle';
import {holdsNode,type OccupationState} from './occupation';
import {fleetPosition,type Navy} from './navy';
import type {MaritimeState} from './maritime';
import type {SeaGraph} from './sea-path';

export type WarNavy={navy:Navy;graph:SeaGraph;maritime?:MaritimeState};
export interface WarSite{
  id:string;kind:'field'|'siege'|'sea';name:string;point:Point;started:number;
  armyIds:string[];fleetIds:string[];nationIds:string[];losses:Record<string,number>;
  resistance?:{remaining:number;maximum:number};
}
export type WarDetail='overview'|'regional'|'local';
/** Detail depends on the actual size of provinces on screen, not device pixels. */
export function warDetail(world:World,scale:number,zoom:number):WarDetail{
  const area=world.provinces.reduce((sum,p)=>sum+Math.abs(p.polygon.reduce((s,a,i)=>{const b=p.polygon[(i+1)%p.polygon.length];return s+a.x*b.y-b.x*a.y;},0))/2,0);
  const diameter=Math.sqrt(area/Math.max(1,world.provinces.length))*zoom/scale;
  return diameter<32?'overview':diameter<70?'regional':'local';
}
/** A site is an existing contact or siege, never a decorative war simulation. */
export function warSites(world:World,battles?:BattleState,occupation?:OccupationState,naval?:WarNavy):WarSite[]{
  const sites:WarSite[]=[];
  for(const e of battles?.engagements??[])sites.push({id:`field:${e.id}`,kind:'field',name:`${world.provinces.find(p=>p.id===e.a)?.name??''}${e.b?'道路交锋':'交锋'}`,point:engagementPoint(world,e),started:e.started,armyIds:e.armies,fleetIds:[],nationIds:world.armies.filter(a=>e.armies.includes(a.id)).map(a=>a.nationId),losses:e.losses});
  for(const s of occupation?.sieges??[]){const p=world.provinces.find(p=>p.id===s.provinceId);if(!p)continue;
    const armies=world.armies.filter(a=>holdsNode(a)&&a.provinceId===p.id&&(a.nationId===s.attacker||a.nationId===s.controller));
    if(!armies.some(a=>a.nationId===s.attacker))continue;
    sites.push({id:`siege:${p.id}`,kind:'siege',name:`${p.name}围攻`,point:p.center,started:s.started,armyIds:armies.map(a=>a.id),fleetIds:[],nationIds:[s.controller,s.attacker],losses:{},resistance:{remaining:s.resistance,maximum:s.maximum}});
  }
  for(const c of naval?.maritime?.contacts??[]){const a=naval!.navy.fleets.find(f=>f.id===c.a),b=naval!.navy.fleets.find(f=>f.id===c.b);if(!a||!b)continue;const p=fleetPosition(naval!.graph,a),q=fleetPosition(naval!.graph,b);
    sites.push({id:`sea:${[a.id,b.id].sort().join('/')}`,kind:'sea',name:'海上交锋',point:{x:(p.x+q.x)/2,y:(p.y+q.y)/2},started:c.started,armyIds:[],fleetIds:[a.id,b.id],nationIds:[a.nationId,b.nationId],losses:{}});
  }
  return sites;
}
export function warSummary(world:World,sites:readonly WarSite[],naval?:WarNavy){
  const armyIds=new Set(sites.flatMap(s=>s.armyIds)),fleetIds=new Set(sites.flatMap(s=>s.fleetIds));
  const armies=world.armies.filter(a=>armyIds.has(a.id)&&a.troops>0&&a.status!=='destroyed');
  const fleets=naval?.navy.fleets.filter(f=>fleetIds.has(f.id)&&f.status!=='lost')??[];
  const losses=new Map<string,number>();for(const s of sites)for(const [id,value] of Object.entries(s.losses))losses.set(id,Math.max(losses.get(id)??0,value));
  const sides=[...new Set([...sites.flatMap(s=>s.nationIds),...armies.map(a=>a.nationId),...fleets.map(f=>f.nationId)])].sort().map(nationId=>{
    const own=armies.filter(a=>a.nationId===nationId),ships=fleets.filter(f=>f.nationId===nationId),troops=own.reduce((n,a)=>n+a.troops,0);
    return {nationId,armyIds:own.map(a=>a.id),fleetIds:ships.map(f=>f.id),troops,losses:own.reduce((n,a)=>n+(losses.get(a.id)??0),0),lossRecorded:own.some(a=>losses.has(a.id)),
      morale:troops?own.reduce((n,a)=>n+a.morale*a.troops,0)/troops:0,supplies:troops?own.reduce((n,a)=>n+a.supplies*a.troops,0)/troops:0,
      ships:ships.reduce((n,f)=>n+f.ships,0),crew:ships.reduce((n,f)=>n+f.crew,0),hull:ships.reduce((n,f)=>n+(naval?.maritime?.hulls[f.id]??f.ships*100),0)};
  });
  return {sides,armyCount:armies.length,fleetCount:fleets.length,troops:armies.reduce((n,a)=>n+a.troops,0),ships:fleets.reduce((n,f)=>n+f.ships,0)};
}
export interface WarMarker extends Point {ids:string[];troops:number;ships:number;sites:number;detail:WarDetail;selected:boolean}
/** Stable, bounded display aggregation; it does not merge the underlying battles. */
export function warMarkers(world:World,sites:WarSite[],naval:WarNavy|undefined,scale:number,camera:{x:number;y:number;scale:number},viewport:{width:number;height:number},selected:readonly string[]=[]):WarMarker[]{
  const detail=warDetail(world,scale,camera.scale),groups:{sites:WarSite[];x:number;y:number;nations:string;weight:number;selected:boolean}[]=[];
  const ranked=sites.map(site=>{const s=warSummary(world,[site],naval);return {site,s,priority:s.troops+s.ships*5000};}).sort((a,b)=>b.priority-a.priority||a.site.id.localeCompare(b.site.id));
  for(const {site,s,priority} of ranked){
    const x=site.point.x/scale*camera.scale+camera.x,y=site.point.y/scale*camera.scale+camera.y,chosen=selected.includes(site.id);
    if(x<-30||y<-30||x>viewport.width+30||y>viewport.height+30)continue;
    const nations=s.sides.map(s=>s.nationId).join('/'),radius=detail==='overview'?58:detail==='regional'?40:1;
    const group=groups.find(g=>(g.nations===nations||detail==='local')&&Math.hypot(g.x-x,g.y-y)<radius);
    if(group){const weight=Math.max(1,priority),total=group.weight+weight;group.x=(group.x*group.weight+x*weight)/total;group.y=(group.y*group.weight+y*weight)/total;group.weight=total;group.sites.push(site);group.selected||=chosen;}
    else groups.push({sites:[site],x,y,nations,weight:Math.max(1,priority),selected:chosen});
  }
  return groups.map(g=>{const s=warSummary(world,g.sites,naval);return {ids:g.sites.map(s=>s.id).sort(),x:g.x,y:g.y,troops:s.troops,ships:s.ships,sites:g.sites.length,detail,selected:g.selected,armyCount:s.armyCount};})
    .filter(g=>detail!=='overview'||g.selected||g.troops>=5000||g.armyCount>=4||g.ships>=5)
    .sort((a,b)=>Number(b.selected)-Number(a.selected)||(b.troops+b.ships*5000)-(a.troops+a.ships*5000)||a.ids[0].localeCompare(b.ids[0]))
    .slice(0,detail==='overview'?8:detail==='regional'?20:64);
}
