import {describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {createFmsRun} from './world';
import {withMilitary,withNavy,withRealtime,stepRunDay} from './runtime';
import {dayTracks,MovementClock,pointAlong,sampleTracks} from './motion';
import {armyPosition,armyMarkers} from './navigation';
import {seaGraph,seaRoute,seaRoutePoints} from './sea-path';
import {fleetPosition} from './navy';
const make=()=>withMilitary(createFmsRun(grid(),4,'peace'));
describe('continuous display follows the completed simulation path',()=>{
 it('interpolates sub-day snapshots across frames, retaining pose when the next reply arrives',()=>{
  const old=withRealtime(withNavy(createFmsRun(grid(),4,'peace'))),a=old.world.armies[0],p=old.world.provinces.find(p=>p.id===a.provinceId)!;Object.assign(a,{route:[p.neighbors[0]],progress:.1,status:'marching'});
  const next=structuredClone(old);next.clock.tick=4;next.world.armies[0].progress=.3;const last=structuredClone(next);last.clock.tick=8;last.world.armies[0].progress=.5;
  const clock=new MovementClock();clock.reset(old,0);clock.start(old,next,0,100,true);const start=clock.frame(0).armies.get(a.id)!,middle=clock.frame(50).armies.get(a.id)!,end=armyPosition(next.world,next.world.armies[0]);expect(middle).not.toEqual(start);expect(middle).not.toEqual(end);expect(middle.x).toBeCloseTo((start.x+end.x)/2,8);expect(middle.y).toBeCloseTo((start.y+end.y)/2,8);
  clock.start(next,last,50,100,true);expect(clock.frame(50).armies.get(a.id)).toEqual(middle);expect(clock.frame(150).armies.get(a.id)).toEqual(armyPosition(last.world,last.world.armies[0]));expect(old.clock.tick).toBe(0);
 });
 it('does not infer realtime travel across a restored clock or a different run',()=>{
  const old=withRealtime(withNavy(createFmsRun(grid(),4,'peace'))),next=structuredClone(old);next.clock.tick=4;next.id+='-different';expect([...dayTracks(old,next,true).armies.values()].every(p=>p.length===1)).toBe(true);next.id=old.id;next.clock.tick=-1;expect([...dayTracks(old,next,true).armies.values()].every(p=>p.length===1)).toBe(true);
 });
 it('keeps the corner when an army crosses a province boundary in one day',()=>{
  const old=make(),p=old.world.provinces[0],q=old.world.provinces.find(q=>p.neighbors.includes(q.id))!,r=old.world.provinces.find(r=>q.neighbors.includes(r.id)&&r.id!==p.id)!;
  const a=old.world.armies[0];Object.assign(a,{provinceId:p.id,route:[q.id,r.id],progress:.8,status:'marching'});
  const next=structuredClone(old);next.world.day++;Object.assign(next.world.armies[0],{provinceId:q.id,route:[r.id],progress:.2});
  const tracks=dayTracks(old,next),path=tracks.armies.get(a.id)!;expect(path).toContainEqual(q.center);expect(sampleTracks(tracks,0).armies.get(a.id)).toEqual(armyPosition(old.world,a));expect(sampleTracks(tracks,1).armies.get(a.id)).toEqual(armyPosition(next.world,next.world.armies[0]));
 });
 it('does not animate a false return when combat clears a half-completed march; newborn/removed units do not borrow a path',()=>{
  const old=make(),a=old.world.armies[0],p=old.world.provinces.find(p=>p.id===a.provinceId)!;a.route=[p.neighbors[0]];a.progress=.6;a.status='marching';
  const next=structuredClone(old);next.world.day++;Object.assign(next.world.armies[0],{route:[],progress:0,status:'fighting'});
  expect(dayTracks(old,next).armies.get(a.id)).toEqual([p.center]);next.world.armies[0].status='destroyed';next.world.armies[0].troops=0;expect(dayTracks(old,next).armies.has(a.id)).toBe(false);
  next.world.armies.push({...old.world.armies[1],id:'new-unit'});expect(dayTracks(old,next).armies.get('new-unit')).toHaveLength(1);
 });
 it('keeps sea gates through multiple faces and across the middle of a single leg',()=>{
  const old=withNavy(createFmsRun(grid((x,y)=>x>=30&&x<=210&&y>=30&&y<=200?45:0),4,'peace')),g=seaGraph(old.terrain,old.world),f=old.navy.fleets[0];
  const target=g.ports.find(p=>seaRoute(g,f.node,p.node)!.length>8)!,chain=seaRoute(g,f.node,target.node)!;Object.assign(f,{route:chain.slice(1),targetId:target.id,dockId:null,status:'sailing',progress:g.nodes.get(f.node)!.links.find(e=>e.to===chain[1])!.distance*.1});
  const next=structuredClone(old);next.world.day++;const nf=next.navy.fleets[0];Object.assign(nf,{node:chain[3],route:chain.slice(4),progress:g.nodes.get(chain[3])!.links.find(e=>e.to===chain[4])!.distance*.2});
  const tracks=dayTracks(old,next),points=tracks.fleets.get(f.id)!;expect(points).toContainEqual(g.nodes.get(chain[1])!.links.find(e=>e.to===chain[2])!.gate);expect(points[0]).toEqual(fleetPosition(g,f));expect(points.at(-1)).toEqual(fleetPosition(g,nf));
  // The route does not collapse to the chord between endpoints.
  expect(points.length).toBeGreaterThan(5);const full=seaRoutePoints(g,chain);expect(points.slice(1,-1).every(p=>full.some(q=>q.x===p.x&&q.y===p.y))).toBe(true);
  nf.node=f.node;nf.route=[...f.route];nf.progress=g.nodes.get(f.node)!.links.find(e=>e.to===chain[1])!.distance*.9;
  expect(dayTracks(old,next).fleets.get(f.id)).toContainEqual(g.nodes.get(f.node)!.links.find(e=>e.to===chain[1])!.gate);
 });
 it('can reconstruct an automatic patrol start without inventing an over-land chord',()=>{
  const old=withNavy(createFmsRun(grid((x,y)=>x>=30&&x<=210&&y>=30&&y<=200?45:0),4,'peace'));old.world.day=14;const next=stepRunDay(old);if(next.version!==3)throw Error('expected navy');
  const tracks=dayTracks(old,next),moving=next.navy.fleets.filter((f,i)=>f.node!==old.navy.fleets[i].node||f.progress>0);expect(moving.length).toBeGreaterThan(0);
  const graph=seaGraph(next.terrain,next.world);for(const f of moving){expect(tracks.fleets.get(f.id)!.length).toBeGreaterThan(1);expect(tracks.fleets.get(f.id)!.at(-1)).toEqual(fleetPosition(graph,f));}
 });
 it('freezes at pause, resumes without a jump and changes speed without changing the pose',()=>{
  const old=make(),a=old.world.armies[0],p=old.world.provinces.find(p=>p.id===a.provinceId)!;a.route=[p.neighbors[0]];a.progress=.1;a.status='marching';const next=structuredClone(old);next.world.day++;next.world.armies[0].progress=.7;
  const clock=new MovementClock();clock.reset(old,0);clock.start(old,next,0,3000);clock.setRunning(false,1200);const paused=clock.frame(1200);expect(clock.frame(100000)).toEqual(paused);
  clock.setRunning(true,100000);expect(clock.frame(100000)).toEqual(paused);clock.setDuration(1500,100000);expect(clock.frame(100000)).toEqual(paused);expect(clock.frame(100450).alpha).toBeCloseTo(.7);
  clock.reconcile(next,100450);expect(clock.frame(100450).alpha).toBeCloseTo(.7);expect(clock.frame(101000).armies.get(a.id)).toEqual(armyPosition(next.world,next.world.armies[0]));
 });
 it('retains an unfinished historical corner when the next Worker snapshot arrives and never mutates saves',()=>{
  const old=make(),before=structuredClone(old),next=stepRunDay(old),last=structuredClone(next);last.world.day++;
  const clock=new MovementClock();clock.reset(old,0);clock.start(old,next,0,3000);const previousFrame=clock.frame(2500);clock.start(next,last,2500,3000);expect(clock.frame(2500).armies).toEqual(previousFrame.armies);expect(old).toEqual(before);
  clock.reset(last,9000);expect(clock.frame(9000).alpha).toBe(1);expect(clock.active(9000)).toBe(false);
 });
 it('uses arc length rather than equal waypoint time, including zero-length vertices',()=>{
  expect(pointAlong([{x:0,y:0},{x:0,y:0},{x:10,y:0},{x:10,y:30}],20)).toEqual({x:10,y:10});
 });
 it('does not pin diverging marching armies inside a stationary far-view group',()=>{
  const r=make(),a=r.world.armies[0],b=r.world.armies[1];b.nationId=a.nationId;b.provinceId=a.provinceId;a.status='marching';b.status='marching';
  const positions=new Map([[a.id,{x:0,y:0}],[b.id,{x:0,y:0}]]),markers=armyMarkers(r.world,r.scale,{x:0,y:0,scale:.01},null,positions);
  expect(markers.find(m=>m.ids.includes(a.id))!.ids).toEqual([a.id]);expect(markers.find(m=>m.ids.includes(b.id))!.ids).toEqual([b.id]);
 });
});
