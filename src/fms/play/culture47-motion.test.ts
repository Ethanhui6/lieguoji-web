import {describe,it,expect} from 'vitest';
import {CultureMotion47,provedTravelTrack47} from './CultureMotion47';
import {ForceDisplayTraceCollector47,type ForceTracePoint47} from './force-display-trace47';
import type {Culture47Snapshot} from './culture47.worker';
import {armyMarkers} from './navigation';
import type {World} from '../../sim/types';
import type {TravelGraph47} from './army-travel47-graph';
import {beginArmyTravel47,beginArmyTravelToPoint47,advanceArmyTravel47} from './army-travel47-state';
const p=(tick:number,x:number,y=0):ForceTracePoint47=>({tick,x,y});
function snapshot(tick:number,sequence:number,point={x:0,y:0},path?:ForceTracePoint47[],from=0):Culture47Snapshot{return {run:{id:'world',clock:{tick},world:{armies:[{id:'a',troops:10,status:'idle'}]},navy:{fleets:[]}},journal:{id:'world',engine:'engine',actions:Array(sequence).fill({kind:'advance',ticks:10})},frame:{alpha:1,armies:new Map([['a',point]]),fleets:new Map()},...(path?{motion:{runId:'world',fromSequence:sequence-1,toSequence:sequence,fromTick:from,toTick:tick,armies:{a:path},fleets:{}}}:{})} as unknown as Culture47Snapshot;}
const noGeometry=()=>{throw Error('Trace playback must not rebuild geography');};
function graph():TravelGraph47{return{scale:1,polygonWork:0,byProvince:new Map(),cells:new Map([0,1,2].map(id=>[id,{id,face:id,surface:'sea',provinceId:null,center:{x:5+id*10,y:5},polygon:[{x:id*10,y:0},{x:id*10+10,y:0},{x:id*10+10,y:10},{x:id*10,y:10}],links:[...(id?[{to:id-1,gate:{x:id*10,y:5},distance:10,toGate:5}]:[]),...(id<2?[{to:id+1,gate:{x:id*10+10,y:5},distance:10,toGate:5}]:[])]}]))};}
describe('actual47 completed-path presentation',()=>{
 it('retains every turn when multiple accepted replies install before the next display frame',()=>{
  const clock=new CultureMotion47();clock.setPresentationTickMillis(10,0);clock.install(snapshot(0,0),0,noGeometry);clock.setRunning(true,0);
  clock.install(snapshot(10,1,{x:10,y:0},[p(0,0),p(10,10)]),100,noGeometry);
  clock.install(snapshot(20,2,{x:10,y:10},[p(10,10),p(20,10,10)],10),100,noGeometry);
  clock.install(snapshot(30,3,{x:0,y:10},[p(20,10,10),p(30,0,10)],20),100,noGeometry);
  expect(clock.revision).toBe(4);
  expect(clock.frame(100).armies.get('a')).toMatchObject({x:0,y:0});
  expect(clock.frame(420).armies.get('a')).toMatchObject({x:10,y:0});
  expect(clock.frame(740).armies.get('a')).toMatchObject({x:10,y:10});
  expect(clock.frame(1060).armies.get('a')).toMatchObject({x:0,y:10});
 });
 it('stretches only the accepted tail before a larger next request without predicting new positions',()=>{
  const clock=new CultureMotion47();clock.install(snapshot(0,0),0,noGeometry);clock.setRunning(true,0);clock.recordAdvance(10,2000);
  clock.install(snapshot(10,1,{x:10,y:0},[p(0,0),p(10,10)]),2000,noGeometry);
  const pose=clock.frame(2100).armies.get('a');clock.beginAdvance(40,2100);expect(clock.frame(2100).armies.get('a')).toEqual(pose);
  expect(clock.frame(6000).armies.get('a')!.x).toBeGreaterThan(clock.frame(5000).armies.get('a')!.x);expect(clock.frame(10000).armies.get('a')!.x).toBeLessThan(10);
  expect(clock.frame(100000).armies.get('a')).toMatchObject({x:10,y:0});
 });
 it('does not compress the tail to 160ms when a late reply arrives just after resume',()=>{
  const clock=new CultureMotion47();clock.install(snapshot(0,0),0,noGeometry);clock.setRunning(true,0);
  clock.install(snapshot(10,1,{x:10,y:0},[p(0,0),p(10,10)]),1000,noGeometry);clock.setRunning(false,1300);
  const paused=clock.frame(1300).armies.get('a');clock.setRunning(true,5000);expect(clock.frame(5000).armies.get('a')).toEqual(paused);
  clock.install(snapshot(20,2,{x:20,y:0},[p(10,10),p(20,20)],10),5050,noGeometry);
  expect(clock.frame(5250).armies.get('a')!.x).toBeLessThan(12);expect(clock.frame(5300).armies.get('a')!.x).toBeGreaterThan(clock.frame(5250).armies.get('a')!.x);
 });
 it('plays an acknowledged route at the selected display rate without ever showing a future tick',()=>{
  const clock=new CultureMotion47();clock.setPresentationTickMillis(.05,0);clock.install(snapshot(0,0),0,noGeometry);clock.setRunning(true,0);
  clock.install(snapshot(480,1,{x:48,y:0},[p(0,0),p(480,48)]),1000,noGeometry);
  const samples=[1000,1120,1959,1960].map(now=>clock.tick(now));expect(samples.every(tick=>tick>=0&&tick<=480)).toBe(true);
  expect(clock.frame(1120).armies.get('a')!.x).toBeGreaterThan(0);expect(clock.frame(1120).armies.get('a')!.x).toBeLessThan(48);expect(clock.tick(1960)).toBe(480);
 });
 it('rebases an in-flight acknowledged route when the selected display rate changes',()=>{
  const clock=new CultureMotion47();clock.setPresentationTickMillis(20,0);clock.install(snapshot(0,0),0,noGeometry);clock.setRunning(true,0);
  clock.install(snapshot(100,1,{x:100,y:0},[p(0,0),p(100,100)]),1000,noGeometry);const before=clock.frame(1050).armies.get('a')!;
  clock.setPresentationTickMillis(10,1050);expect(clock.frame(1050).armies.get('a')).toEqual(before);expect(clock.frame(1070).armies.get('a')!.x).toBeGreaterThan(before.x);expect(clock.tick(2050)).toBe(100);
 });
 it('reconstructs old routes through both real gates and exact V2 endpoints, rejecting route resets',()=>{
  const g=graph(),a=beginArmyTravel47('a',[0,1,2],g),b=advanceArmyTravel47(a,g,100,()=>1,()=>true).travel;
  expect(provedTravelTrack47(a,b,g)).toEqual([{x:5,y:5},{x:10,y:5},{x:15,y:5},{x:20,y:5},{x:25,y:5}]);
  const local=beginArmyTravelToPoint47('a',[0],g,{x:1,y:2},{x:9,y:2}),half=advanceArmyTravel47(local,g,4,()=>1,()=>true).travel;
  expect(provedTravelTrack47(local,half,g)).toEqual([{x:1,y:2},{x:5,y:2}]);expect(provedTravelTrack47(half,local,g)).toBeNull();
  const exact=beginArmyTravelToPoint47('a',[0,1],g,{x:5,y:5},{x:12,y:3}),end=advanceArmyTravel47(exact,g,100,()=>1,()=>true).travel;
  expect(provedTravelTrack47(exact,end,g)).toEqual([{x:5,y:5},{x:10,y:5},{x:12,y:3}]);expect(provedTravelTrack47(exact,{...end,origin:{x:6,y:5}},g)).toBeNull();
 });
 it('keeps a rejected sea gate and does not invent motion when admission changes at the same point',()=>{
  const g=graph(),a=beginArmyTravel47('a',[0,1],g),mid=advanceArmyTravel47(a,g,2,()=>1,()=>true).travel,blocked=advanceArmyTravel47(mid,g,3,()=>1,()=>false).travel;
  expect(provedTravelTrack47(a,blocked,g)).toEqual([{x:5,y:5},{x:10,y:5}]);expect(provedTravelTrack47(blocked,{...blocked,crossed:true,status:'moving'},g)).toEqual([{x:10,y:5},{x:10,y:5}]);
 });
 it('does not infer an old-worker round trip when a new AI order reused the same route geometry',()=>{
  const g=graph(),a=beginArmyTravel47('a',[0,1],g),b=advanceArmyTravel47(a,g,4,()=>1,()=>true).travel;
  const before=snapshot(0,0,{x:5,y:5}),after=snapshot(10,1,{x:9,y:5});for(const s of [before,after])Object.assign(s.run,{armyPositions:{records:{a:s===before?a:b}},fleetPositions:{records:{}},armyAutonomy:{armies:{a:{issuedTick:s===before?0:5}}},navalAutonomy:{fleets:{}}});
  const clock=new CultureMotion47();clock.install(before,0,()=>g);clock.setRunning(true,0);clock.install(after,1000,()=>g);expect(clock.frame(1000).armies.get('a')).toMatchObject({x:9,y:5});
 });
 it('keeps a true corner, stationary contact interval and reversal within one ACK',()=>{
  const clock=new CultureMotion47();clock.install(snapshot(0,0),0,noGeometry);clock.setRunning(true,0);
  clock.install(snapshot(30,1,{x:0,y:10},[p(0,0),p(5,10),p(10,10,10),p(20,10,10),p(30,0,10)]),1000,noGeometry);
  expect(clock.frame(1000+1180*5/30).armies.get('a')!.x).toBeCloseTo(10);expect(clock.frame(1000+1180*5/30).armies.get('a')!.y).toBeCloseTo(0);
  expect(clock.frame(1590).armies.get('a')).toMatchObject({x:10,y:10});expect(clock.frame(1800).armies.get('a')!.y).toBeCloseTo(10);
  expect(clock.frame(2200).armies.get('a')).toMatchObject({x:0,y:10});
 });
 it('continues moving beyond the old 750ms cutoff and joins an unfinished tail without a pose reset',()=>{
  const clock=new CultureMotion47();clock.install(snapshot(0,0),0,noGeometry);clock.setRunning(true,0);clock.install(snapshot(10,1,{x:10,y:0},[p(0,0),p(10,10)]),2000,noGeometry);
  expect(clock.frame(2850).armies.get('a')!.x).toBeGreaterThan(clock.frame(2800).armies.get('a')!.x);
  const before=clock.frame(3000).armies.get('a')!;clock.install(snapshot(20,2,{x:10,y:10},[p(10,10),p(20,10,10)],10),3000,noGeometry);
  expect(clock.frame(3000).armies.get('a')!.x).toBeCloseTo(before.x);expect(clock.frame(3000).armies.get('a')!.y).toBeCloseTo(before.y);
  expect(clock.frame(3200).armies.get('a')!.y).toBe(0);expect(clock.frame(6000).armies.get('a')).toMatchObject({x:10,y:10});
 });
 it('holds a paused pose even when a late ACK arrives, resumes its tail and never predicts past evidence',()=>{
  const clock=new CultureMotion47();clock.install(snapshot(0,0),0,noGeometry);clock.setRunning(true,0);clock.install(snapshot(10,1,{x:10,y:0},[p(0,0),p(10,10)]),1000,noGeometry);
  clock.setRunning(false,1300);const old=clock.frame(1300).armies.get('a')!;clock.install(snapshot(20,2,{x:20,y:0},[p(10,10),p(20,20)],10),1800,noGeometry);
  expect(clock.frame(5000).armies.get('a')!.x).toBeCloseTo(old.x);clock.setRunning(true,5000);expect(clock.frame(5000).armies.get('a')!.x).toBeCloseTo(old.x);
  expect(clock.frame(10000).armies.get('a')).toMatchObject({x:20,y:0});expect(clock.frame(20000).armies.get('a')).toMatchObject({x:20,y:0});
 });
 it('same-tick previews preserve cadence; removed units disappear and a restored world resets explicitly',()=>{
  const clock=new CultureMotion47(),s=snapshot(10,1,{x:10,y:0},[p(0,0),p(10,10)]);clock.install(snapshot(0,0),0,noGeometry);clock.setRunning(true,0);clock.install(s,1000,noGeometry);
  const before=clock.frame(1400).armies.get('a');clock.install({...s,motion:undefined},1400,noGeometry);expect(clock.frame(1400).armies.get('a')).toEqual(before);expect(clock.frame(1500).armies.get('a')!.x).toBeGreaterThan(before!.x);
  const dead=structuredClone(s);dead.run.world.armies[0].troops=0;clock.install(dead,1550,noGeometry);expect(clock.frame(1550).armies.has('a')).toBe(false);
  clock.install(snapshot(0,0,{x:100,y:50}),1600,noGeometry,true);expect(clock.frame(1600).armies.get('a')).toMatchObject({x:100,y:50});
 });
 it('separates real diverging idle-ledger units at their common starting point',()=>{
  const world={provinces:[{id:'p',center:{x:0,y:0},polygon:[{x:0,y:0},{x:100,y:0},{x:0,y:100}]}],armies:['a','b'].map(id=>({id,nationId:'n',provinceId:'p',troops:10,status:'idle',route:[],progress:0}))} as unknown as World;
  const marks=armyMarkers(world,1,{x:0,y:0,scale:.01},null,new Map([['a',{x:0,y:0}],['b',{x:0,y:0}]]),new Set(['a','b']));expect(marks.map(m=>m.ids)).toEqual([['a'],['b']]);
 });
 it('compresses constant velocity without erasing turns, pauses or reversals',()=>{
  const collector=new ForceDisplayTraceCollector47('world',0,0);for(const v of [p(0,0),p(1,1),p(2,2),p(3,2),p(4,2),p(5,1),p(6,0)])collector.record('army','a',v.tick,v);
  expect(collector.finish(1,6)!.armies.a).toEqual([p(0,0),p(2,2),p(4,2),p(6,0)]);
  const before=JSON.stringify(collector.value);expect(before).not.toContain('journal');
 });
});

it('finishes the already accepted route and date together after an explicit UI pause, including a late reply',()=>{
 const clock=new CultureMotion47();clock.install(snapshot(0,0),0,noGeometry);clock.setRunning(true,0);clock.install(snapshot(10,1,{x:10,y:0},[p(0,0),p(10,10)]),1000,noGeometry);
 clock.setRunning(false,1300);const pose=clock.frame(1300).armies.get('a')!;clock.finishAccepted(1300);expect(clock.frame(1300).armies.get('a')).toEqual(pose);expect(clock.frame(1400).armies.get('a')!.x).toBeGreaterThan(pose.x);expect(clock.tick(1550)).toBe(10);expect(clock.frame(1550).armies.get('a')).toMatchObject({x:10,y:0});
 clock.install(snapshot(20,2,{x:10,y:10},[p(10,10),p(20,10,10)],10),1800,noGeometry);clock.finishAccepted(1800);expect(clock.frame(1800).armies.get('a')).toMatchObject({x:10,y:0});expect(clock.frame(1900).armies.get('a')!.y).toBeGreaterThan(0);expect(clock.tick(2050)).toBe(20);expect(clock.frame(2050).armies.get('a')).toMatchObject({x:10,y:10});expect(clock.tick(10000)).toBe(20);
});
