import type {Point} from '../../sim/types';
import type {FoundingForces47} from './civilization47-forces';
import {armySpatialFor47} from './army-geography47';
import {readArmySpace47} from './army-space47';
import {activeSiegesFromSpace47} from './siege-display47';
import {warDetail} from './war-view';

export type CombatMarker47={id:string;kind:'contact'|'siege';point:Point;participants:number;progress:number|null;pairs?:[string,string][]};
/** Read the actual 47 contact ledger. Legacy battle/sea-contact collections
 * intentionally stay empty; neither old province anchors nor clock pulses
 * imply a hit. Separate actual cell pairs within the same administrative area. */
export function activeSiegeProvinces47(r:FoundingForces47):Set<string>{
 if(!r.occupation.sieges.length)return new Set();
 const space=readArmySpace47(r.world,armySpatialFor47(r));
 return new Set(activeSiegesFromSpace47(r,space));
}
export function combatMarkers47(r:Pick<FoundingForces47,'forceContacts'|'occupation'|'world'>,activeSieges:ReadonlySet<string>):CombatMarker47[]{
 const sites=new Map<string,{x:number;y:number;count:number;forces:Set<string>;pairs:[string,string][]}>();
 for(const p of r.forceContacts.pairs){const id=`${p.area}/${Math.min(p.cellA,p.cellB)}:${Math.max(p.cellA,p.cellB)}`,row=sites.get(id)??{x:0,y:0,count:0,forces:new Set<string>(),pairs:[]};row.x+=(p.pointA.x+p.pointB.x)/2;row.y+=(p.pointA.y+p.pointB.y)/2;row.count++;row.forces.add(p.a);row.forces.add(p.b);row.pairs.push([p.a,p.b]);sites.set(id,row);}
 const markers:CombatMarker47[]=[...sites].map(([id,v])=>({id,kind:'contact',point:{x:v.x/v.count,y:v.y/v.count},participants:v.forces.size,progress:null,pairs:v.pairs}));
 for(const s of r.occupation.sieges){const p=r.world.provinces.find(p=>p.id===s.provinceId);if(p&&activeSieges.has(p.id))markers.push({id:'siege/'+p.id,kind:'siege',point:p.center,participants:0,progress:Math.max(0,Math.min(1,1-s.resistance/s.maximum))});}
 return markers;
}
/** Follow the icon centers of the very frame being drawn, including buffered
 * motion and marker layout offsets. Missing/dead participants leave no ghost.
 * This projects accepted contacts only; it never creates combat or damage. */
export function displayCombatMarkers47(markers:readonly CombatMarker47[],points:ReadonlyMap<string,Point>):CombatMarker47[]{
 return markers.flatMap(m=>{if(m.kind==='siege')return[m];let x=0,y=0,count=0;const forces=new Set<string>();for(const [a,b]of m.pairs??[]){const left=points.get(a),right=points.get(b);if(!left||!right)continue;x+=(left.x+right.x)/2;y+=(left.y+right.y)/2;count++;forces.add(a);forces.add(b);}return count?[{...m,point:{x:x/count,y:y/count},participants:forces.size}]:[];});
}
/** Screen detail is presentation only. Keep the complete ledger, hide small
 * far-away skirmishes and combine nearby marks of the same actual site. Use a
 * representative real contact point, never an average across distant battles. */
export function visibleCombatMarkers47(markers:readonly CombatMarker47[],r:Pick<FoundingForces47,'world'|'navy'>,mapScale:number,camera:{x:number;y:number;scale:number},viewport:{width:number;height:number}):CombatMarker47[]{
 const detail=warDetail(r.world,mapScale,camera.scale),strength=new Map<string,number>(),ships=new Map<string,number>(),armies=new Set<string>();
 for(const a of r.world.armies){const key=JSON.stringify(['army',a.id]);strength.set(key,a.status==='destroyed'?0:a.troops);if(a.troops>0&&a.status!=='destroyed')armies.add(key);}
 for(const f of r.navy.fleets){const key=JSON.stringify(['fleet',f.id]),count=f.status==='lost'?0:f.ships;ships.set(key,count);strength.set(key,count*5000);}
 const forces=(m:CombatMarker47)=>new Set((m.pairs??[]).flat()),weight=(m:CombatMarker47)=>[...forces(m)].reduce((n,id)=>n+(strength.get(id)??0),0);
 const ranked=[...markers].sort((a,b)=>weight(b)-weight(a)||a.id.localeCompare(b.id)),result:CombatMarker47[]=[];
 for(const m of ranked){
  const x=m.point.x/mapScale*camera.scale+camera.x,y=m.point.y/mapScale*camera.scale+camera.y;
  if(x<-30||y<-30||x>viewport.width+30||y>viewport.height+30)continue;
  const radius=detail==='overview'?48:detail==='regional'?28:14;
  const group=result.find(g=>g.kind===m.kind&&g.id.split('/').slice(0,2).join('/')===m.id.split('/').slice(0,2).join('/')&&Math.hypot(g.point.x-m.point.x,g.point.y-m.point.y)/mapScale*camera.scale<radius);
  if(group&&m.kind==='contact'){group.pairs=[...(group.pairs??[]),...(m.pairs??[])];group.participants=forces(group).size;}
  else if(m.kind==='contact'||detail!=='overview')result.push({...m,pairs:m.pairs?.slice()});
 }
 return result.filter(m=>{if(detail!=='overview')return true;if(m.kind!=='contact')return false;const ids=[...forces(m)],land=ids.filter(id=>armies.has(id));return land.length>=4||land.reduce((n,id)=>n+(strength.get(id)??0),0)>=5000||ids.reduce((n,id)=>n+(ships.get(id)??0),0)>=5;}).slice(0,detail==='overview'?8:detail==='regional'?20:64);
}
