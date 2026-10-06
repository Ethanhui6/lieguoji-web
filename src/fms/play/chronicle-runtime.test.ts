import {describe,it,expect} from 'vitest';
import {ChronicleSession} from './chronicle-session';
import {campaignView,tacticsView,type ChronicleRun} from './chronicle-model';
import {maritimeView} from './tactics-model';
import {advanceCampaignTick} from './campaign-runtime';
import {advanceChronicleTick} from './chronicle-runtime';
import {graphFor} from './naval-rules';
import {grid} from './fixture.test-support';
describe('v11 optimized simulation matches frozen v10 every tick',()=>{
 it.each(['standing','encounter','occupation','monthly'] as const)('%s retains complete outcomes and does not mutate its input',mode=>{
  const s=new ChronicleSession(),r=s.execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,relations:'war'}).run as ChronicleRun;
  let old=campaignView(r);const w=old.world;
  const p=w.provinces.find(p=>p.neighbors.some(id=>w.provinces.find(q=>q.id===id)!.controller!==p.controller))!,q=w.provinces.find(q=>p.neighbors.includes(q.id)&&q.controller!==p.controller)!;
  if(mode==='encounter'||mode==='occupation'){
   const a=w.armies.find(a=>a.nationId===p.controller)!,b=w.armies.find(a=>a.nationId===q.controller)!;
   Object.assign(a,{provinceId:p.id,originId:p.id,route:[q.id],progress:mode==='encounter'?.49:0,status:'marching'});
   Object.assign(b,{provinceId:q.id,originId:q.id,route:[p.id],progress:mode==='encounter'?.49:0,status:'marching'});
   if(mode==='occupation'){a.provinceId=q.id;a.route=[];a.status='idle';b.status='destroyed';b.troops=0;b.route=[];}
  }
  if(mode==='monthly'){w.day=29;old.clock.tick=3590;}
  let next=structuredClone(old);const optimizedInput=next,before=structuredClone(old),g=graphFor(maritimeView(tacticsView(r)));
  for(const p of optimizedInput.world.provinces){p.polygon.forEach(Object.freeze);Object.freeze(p.polygon);Object.freeze(p.center);Object.freeze(p.label);Object.freeze(p.neighbors);}
  for(let i=0;i<120;i++){old=advanceCampaignTick(old,g);next=advanceChronicleTick(next,g);expect(next,`tick ${i}`).toEqual(old);}
  expect(r.world).toEqual(before.world);
  expect(optimizedInput).toEqual(before);
 });
});
