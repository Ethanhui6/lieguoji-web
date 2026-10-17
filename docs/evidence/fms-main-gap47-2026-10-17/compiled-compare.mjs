import {Worker} from 'node:worker_threads';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const dir='.autopilot/fms-main-gap47-checked',metadata=JSON.parse(readFileSync(dir+'/build.json'));
const revive=(_k,v)=>v?.$typed?new ({Uint32Array,Int32Array,Uint8Array}[v.$typed])(v.values):v;
const fixture=JSON.parse(readFileSync('.autopilot/fms-map-typography47-browser/desktop/fixture.json','utf8'),revive);
const opening=fixture.find(d=>d.name==='lieguoji-fms-culture47-generations-v1').rows.find(r=>r[0]==='current')[1].journal.opening;opening.relations='war';
function client(file){
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;let at=0;self.postMessage=v=>parentPort.postMessage({...v,coreMs:performance.now()-at});import(${JSON.stringify(pathToFileURL(resolve(file)).href)}).then(()=>parentPort.on('message',data=>{at=performance.now();self.onmessage({data})}));`,{eval:true});let id=0,snapshot;
 const send=command=>new Promise((ok,no)=>{const error=e=>{worker.off('message',reply);no(e);},reply=r=>{if(r.progress)return;worker.off('message',reply);worker.off('error',error);if(r.error)return no(Error(r.error));const p=r.display;if(p.kind==='full')snapshot=p.snapshot;else snapshot={run:{...p.run,terrain:snapshot.run.terrain,diplomaticGeography:snapshot.run.diplomaticGeography},journal:{...p.journal,opening:snapshot.journal.opening},frame:p.frame,...(p.motion?{motion:p.motion}:{})};ok({s:snapshot,ms:r.coreMs});};worker.on('message',reply);worker.once('error',error);worker.postMessage({id:++id,command});});return {worker,send};
}
const old=client('compat/culture47/engine-02c7.js'),current=client(dir+'/assets/'+readdirSync(dir+'/assets').find(n=>/^culture47\.worker-.*\.js$/.test(n)));
const stamp=r=>({id:r.id,day:r.world.day,tick:r.clock.tick,nextEventId:r.world.nextEventId,civilization:r.civilization.revision,kin:r.kin.revision,people:r.people.revision,sovereignty:r.sovereignty.revision,nextEntryId:r.chronicle.nextEntryId});
try{
 let a=(await old.send({type:'create',opening})).s,b=(await current.send({type:'load',journal:{...a.journal,engine:metadata.culture47Fingerprint}})).s;
 assert.deepEqual(b.run,a.run);assert.deepEqual(b.frame,a.frame);
 for(const [kind,rule]of [['enable-retirement','retired-roster-web-v1'],['enable-recovery','wounded-army-recovery-web-v1'],['enable-generations','known-couples-birth-household-web-v1']]){
  const action={kind,rule,expected:stamp(a.run)},sequence=a.journal.actions.length;
  a=(await old.send({type:'action',sequence,action})).s;b=(await current.send({type:'action',sequence,action})).s;assert.deepEqual(b.run,a.run);assert.deepEqual(b.frame,a.frame);
 }
 const timings=[];for(let day=0;day<56;day+=4){const sequence=a.journal.actions.length,prior=await old.send({type:'advance-batch',sequence,ticks:480}),next=await current.send({type:'advance-batch',sequence,ticks:480});a=prior.s;b=next.s;assert.deepEqual(b.run,a.run);assert.deepEqual(b.frame,a.frame);assert.deepEqual(b.motion,a.motion);assert.deepEqual(b.journal.actions,a.journal.actions);timings.push({day:day+4,priorCoreMs:prior.ms,currentCoreMs:next.ms});console.log(JSON.stringify(timings.at(-1)));}
 const result={date:'2026-10-17',sourceCommit:metadata.commit,priorEngine:a.journal.engine,currentEngine:b.journal.engine,points:opening.terrain.points.length,days:56,tick:b.run.clock.tick,relations:'war',features:3,exactRunFrameMotionAndActions:true,timings,scope:'Sequential original and current production-compiled Node Workers, same synthetic opening/world id/three current feature flags; exact every4days. No browser paint, physical device or original equivalence claim.'};writeFileSync('.autopilot/fms-main-gap47-compiled-comparison.json',JSON.stringify(result,null,2)+'\n');
}finally{await old.worker.terminate();await current.worker.terminate();}
