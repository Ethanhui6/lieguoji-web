import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {Culture47Session} from '../src/fms/play/culture47-session';
import {Culture47DisplayDecoder} from '../src/fms/play/culture47-display';
import {ARMY_RETIREMENT_RULE47} from '../src/fms/play/army-retirement47';
import {ARMY_RECOVERY_RULE47} from '../src/fms/play/army-recovery47';
import {GENERATIONS_RULE47} from '../src/fms/play/civilization47-generations-ledger';
import {populationStamp47} from '../src/fms/play/civilization47-population-types';
it('full continents war: compare current and previous authoritative run frame and motion',async()=>{
 const revive=(_key:string,v:any)=>v?.$typed?new ({Uint32Array,Int32Array,Uint8Array} as any)[v.$typed](v.values):v;
 const fixture=JSON.parse(readFileSync('.autopilot/fms-map-typography47-browser/desktop/fixture.json','utf8'),revive);
 const opening=fixture.find((db:any)=>db.name==='lieguoji-fms-culture47-generations-v1').rows.find((row:any)=>row[0]==='current')[1].journal.opening;
 opening.relations='war';const session=new Culture47Session();let s=session.create(opening);
 const oldEngine='22db1a6db6b530c2f9bf20e875cec7c2cda6d7d47af2292770dd93f1f123c2ad';
 const decoder=new Culture47DisplayDecoder(),prior=new Culture47DisplayDecoder();decoder.decode(session.displaySnapshot(),{engine:s.journal.engine});
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;let start=0;self.postMessage=v=>parentPort.postMessage({...v,coreMs:performance.now()-start});import(${JSON.stringify(pathToFileURL(resolve('compat/culture47/engine-22db.js')).href)}).then(()=>parentPort.on('message',data=>{start=performance.now();self.onmessage({data})}));`,{eval:true});
 let id=0;const send=(command:unknown)=>new Promise<any>((ok,no)=>{const reply=(r:any)=>{if(r.progress)return;worker.off('message',reply);r.error?no(Error(r.error)):ok(r);};worker.on('message',reply);worker.once('error',no);worker.postMessage({id:++id,command});});
 try{
  const loaded=await send({type:'load',journal:{...s.journal,engine:oldEngine}});prior.decode(loaded.display,{engine:oldEngine});
  for(const [kind,rule]of [['enable-retirement',ARMY_RETIREMENT_RULE47],['enable-recovery',ARMY_RECOVERY_RULE47],['enable-generations',GENERATIONS_RULE47]] as const){
   const sequence=s.journal.actions.length,action={kind,rule,expected:populationStamp47(s.run)};
   const old=await send({type:'action',sequence,action});s=decoder.decode(session.executeDisplay([action as any],sequence),{engine:s.journal.engine,sequence});const prev=prior.decode(old.display,{engine:oldEngine,sequence});expect(s.run).toEqual(prev.run);
  }
  const timings=[];let last=s;
  for(let day=0;day<24;day+=4){
   const sequence=day+3,actions=Array.from({length:4},()=>({kind:'advance' as const,ticks:120}));
   const oldReply=await send({type:'advance-batch',sequence,ticks:480}),old=prior.decode(oldReply.display,{engine:oldEngine,sequence,actions:4});
   const at=performance.now(),packet=session.executeDisplay(actions,sequence),currentCoreMs=performance.now()-at;last=decoder.decode(structuredClone(packet),{engine:s.journal.engine,sequence,actions:4});
   expect(last.run).toEqual(old.run);expect(last.frame).toEqual(old.frame);expect(last.motion).toEqual(old.motion);
   timings.push({day:day+4,priorCoreMs:oldReply.coreMs,currentCoreMs});
  }
  writeFileSync('.autopilot/fms-pacing-titles47-exact-compare.json',JSON.stringify({points:opening.terrain.points.length,relations:'war',features:3,days:24,tick:last.run.clock.tick,exactPriorRunFrameMotion:true,timings,note:'Sequential prior built Node Worker versus current transformed source core; includes no browser paint/transport equality or subjective equivalence claim.'},null,2));
 }finally{await worker.terminate();}
},180000);
