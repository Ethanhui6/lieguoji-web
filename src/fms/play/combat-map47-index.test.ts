import {describe,expect,it} from 'vitest';
import type {FoundingForces47} from './civilization47-forces';
import {createCombatStrengthIndex47,visibleCombatMarkers47,type CombatMarker47} from './combat-map47';
import {warDetail} from './war-view';

type Run=Pick<FoundingForces47,'world'|'navy'>;
const key=(kind:'army'|'fleet',id:string)=>JSON.stringify([kind,id]);
const camera={x:0,y:0,scale:.1},viewport={width:300,height:300};
const makeRun=()=>({
 world:{provinces:[{polygon:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]}],
  armies:[{id:'a',troops:3000,status:'fighting'},{id:'b',troops:2000,status:'fighting'},{id:'c',troops:400,status:'idle'},{id:'d',troops:300,status:'idle'}]},
 navy:{fleets:[{id:'f',ships:3,status:'sailing'},{id:'g',ships:2,status:'sailing'}]}
}) as unknown as Run;
const contact=(id:string,a:string,b:string,x=10,y=10):CombatMarker47=>({id,kind:'contact',point:{x,y},participants:2,progress:null,pairs:[[a,b]]});

/** Before-index presentation contract. Keep this independent of the new
 * implementation to compare ranking, aggregation and limits across cameras. */
function previousVisible(markers:readonly CombatMarker47[],r:Run,mapScale:number,view:typeof camera,size:typeof viewport):CombatMarker47[]{
 const detail=warDetail(r.world,mapScale,view.scale),strength=new Map<string,number>(),ships=new Map<string,number>(),armies=new Set<string>();
 for(const a of r.world.armies){const id=key('army',a.id);strength.set(id,a.status==='destroyed'?0:a.troops);if(a.troops>0&&a.status!=='destroyed')armies.add(id);}
 for(const f of r.navy.fleets){const id=key('fleet',f.id),count=f.status==='lost'?0:f.ships;ships.set(id,count);strength.set(id,count*5000);}
 const forces=(m:CombatMarker47)=>new Set((m.pairs??[]).flat()),weight=(m:CombatMarker47)=>[...forces(m)].reduce((n,id)=>n+(strength.get(id)??0),0);
 const ranked=[...markers].sort((a,b)=>weight(b)-weight(a)||a.id.localeCompare(b.id)),result:CombatMarker47[]=[];
 for(const m of ranked){
  const x=m.point.x/mapScale*view.scale+view.x,y=m.point.y/mapScale*view.scale+view.y;
  if(x<-30||y<-30||x>size.width+30||y>size.height+30)continue;
  const radius=detail==='overview'?48:detail==='regional'?28:14;
  const group=result.find(g=>g.kind===m.kind&&g.id.split('/').slice(0,2).join('/')===m.id.split('/').slice(0,2).join('/')&&Math.hypot(g.point.x-m.point.x,g.point.y-m.point.y)/mapScale*view.scale<radius);
  if(group&&m.kind==='contact'){group.pairs=[...(group.pairs??[]),...(m.pairs??[])];group.participants=forces(group).size;}
  else if(m.kind==='contact'||detail!=='overview')result.push({...m,pairs:m.pairs?.slice()});
 }
 return result.filter(m=>{if(detail!=='overview')return true;if(m.kind!=='contact')return false;const ids=[...forces(m)],land=ids.filter(id=>armies.has(id));return land.length>=4||land.reduce((n,id)=>n+(strength.get(id)??0),0)>=5000||ids.reduce((n,id)=>n+(ships.get(id)??0),0)>=5;}).slice(0,detail==='overview'?8:detail==='regional'?20:64);
}

describe('explicit combat strength display snapshot',()=>{
 it('reuses indexed strengths without reading every army or fleet again',()=>{
  const run=makeRun();let troopReads=0,shipReads=0;
  Object.defineProperty(run.world.armies[0],'troops',{get:()=>{troopReads++;return 3000;}});
  Object.defineProperty(run.navy.fleets[0],'ships',{get:()=>{shipReads++;return 3;}});
  const index=createCombatStrengthIndex47(run);troopReads=0;shipReads=0;
  const markers=[contact('land/a/1',key('army','a'),key('army','b'))];
  for(let i=0;i<5;i++)expect(visibleCombatMarkers47(markers,run,1,camera,viewport,index)).toHaveLength(1);
  expect({troopReads,shipReads}).toEqual({troopReads:0,shipReads:0});
  visibleCombatMarkers47(markers,run,1,camera,viewport);
  expect(troopReads).toBeGreaterThan(0);expect(shipReads).toBeGreaterThan(0);
 });
 it('reads new snapshot troop loss, destruction and lost fleets even if given an old index',()=>{
  const original=makeRun(),oldIndex=createCombatStrengthIndex47(original);
  const army=[contact('land/a/1',key('army','a'),key('army','b'))],naval=[contact('sea/1/1',key('fleet','f'),key('fleet','g'))];
  expect(visibleCombatMarkers47(army,original,1,camera,viewport,oldIndex)).toHaveLength(1);
  const fewer=structuredClone(original);fewer.world.armies[0].troops=2999;
  expect(visibleCombatMarkers47(army,fewer,1,camera,viewport,oldIndex)).toEqual([]);
  const dead=structuredClone(original);dead.world.armies[0].status='destroyed';
  expect(visibleCombatMarkers47(army,dead,1,camera,viewport,createCombatStrengthIndex47(dead))).toEqual([]);
  expect(visibleCombatMarkers47(army,dead,1,camera,viewport,oldIndex)).toEqual([]);
  const lost=structuredClone(original);lost.navy.fleets[0].status='lost';
  expect(visibleCombatMarkers47(naval,lost,1,camera,viewport,oldIndex)).toEqual([]);
  const changedShips={world:original.world,navy:structuredClone(original.navy)};changedShips.navy.fleets[0].ships=2;
  expect(visibleCombatMarkers47(naval,changedShips,1,camera,viewport,oldIndex)).toEqual([]);
 });
 it('keeps ordinary unindexed calls live for explicitly mutable callers',()=>{
  const run=makeRun(),markers=[contact('land/a/1',key('army','a'),key('army','b'))];
  expect(visibleCombatMarkers47(markers,run,1,camera,viewport)).toHaveLength(1);
  run.world.armies[0].troops=1;
  expect(visibleCombatMarkers47(markers,run,1,camera,viewport)).toEqual([]);
  run.navy.fleets[0].ships=2;
  expect(visibleCombatMarkers47([contact('sea/1/1',key('fleet','f'),key('fleet','g'))],run,1,camera,viewport)).toEqual([]);
 });
 it('recomputes participants for reused marker IDs and uses the current interpolated position',()=>{
  const run=makeRun(),index=createCombatStrengthIndex47(run),id='land/a/1';
  expect(visibleCombatMarkers47([contact(id,key('army','a'),key('army','b'))],run,1,camera,viewport,index)).toHaveLength(1);
  expect(visibleCombatMarkers47([contact(id,key('army','c'),key('army','d'))],run,1,camera,viewport,index)).toEqual([]);
  const local={...camera,scale:1};
  expect(visibleCombatMarkers47([contact(id,key('army','a'),key('army','b'),500)],run,1,local,viewport,index)).toEqual([]);
  expect(visibleCombatMarkers47([contact(id,key('army','a'),key('army','b'),500)],run,1,{...local,x:-400},viewport,index)[0].point.x).toBe(500);
  const grouped=visibleCombatMarkers47([contact(id,key('army','a'),key('army','b')),contact('land/a/2',key('army','b'),key('army','c'),15)],run,1,local,viewport,index);
  expect(grouped).toHaveLength(1);expect(grouped[0].participants).toBe(3);
  const changed=visibleCombatMarkers47([contact(id,key('army','a'),key('army','b')),contact('land/a/2',key('army','b'),key('army','d'),15)],run,1,local,viewport,index);
  expect(changed[0].pairs).toEqual([[key('army','a'),key('army','b')],[key('army','b'),key('army','d')]]);
 });
 it('keeps naval overview filtering based on ships rather than ranking weight',()=>{
  const run=makeRun(),markers=[contact('sea/1/1',key('fleet','f'),key('fleet','g'))];
  expect(visibleCombatMarkers47(markers,run,1,camera,viewport,createCombatStrengthIndex47(run))).toHaveLength(1);
  const next=structuredClone(run);next.navy.fleets[0].ships=2;
  const index=createCombatStrengthIndex47(next);
  expect(visibleCombatMarkers47(markers,next,1,camera,viewport,index)).toEqual([]);
  expect(visibleCombatMarkers47(markers,next,1,{...camera,scale:.4},viewport,index)).toHaveLength(1);
 });
 it('preserves equal-weight ID order and stable duplicate siege order at one position',()=>{
  const run=makeRun(),index=createCombatStrengthIndex47(run),local={...camera,scale:1};
  const markers=[contact('land/z/1',key('army','a'),key('army','b')),contact('land/a/1',key('army','a'),key('army','b'))];
  expect(visibleCombatMarkers47(markers,run,1,local,viewport,index).map(m=>m.id)).toEqual(['land/a/1','land/z/1']);
  const siege:CombatMarker47={id:'siege/same',kind:'siege',point:{x:10,y:10},participants:0,progress:.3};
  expect(visibleCombatMarkers47([siege,{...siege,progress:.7}],run,1,local,viewport,index).map(m=>m.progress)).toEqual([.3,.7]);
 });
 it('matches the previous complete marker output across zoom, viewport, aggregation and caps',()=>{
  const run=makeRun(),index=createCombatStrengthIndex47(run),markers:CombatMarker47[]=[];
  for(let i=0;i<90;i++)markers.push(contact(`land/${i%13}/${i}`,key('army',i%2?'a':'c'),key('army','b'),i%10*40-60,Math.floor(i/10)*36));
  markers.push(contact('sea/1/1',key('fleet','f'),key('fleet','g')),contact('land/0/extra',key('army','a'),key('army','b'),-55,0));
  for(let i=0;i<5;i++)markers.push({id:`siege/${i}`,kind:'siege',point:{x:i*70,y:20},participants:0,progress:i/5});
  const original=structuredClone(markers);
  for(const zoom of [.1,.31,.32,.69,.7,1,4])for(const x of [-300,0,150]){
   const view={x,y:-10,scale:zoom},expected=previousVisible(markers,run,1,view,viewport);
   expect(visibleCombatMarkers47(markers,run,1,view,viewport,index)).toEqual(expected);
   expect(visibleCombatMarkers47(markers,run,1,view,viewport)).toEqual(expected);
  }
  expect(markers).toEqual(original);
 });
});
