import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import ts from 'typescript';
import { chromium } from '@playwright/test';
const stage=path.resolve('.autopilot/ph06/v4-worker-scheduling-staging'),label=process.argv[2]??'browser-mechanism-first';
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid probe label');
const out=path.join(stage,'checks',label);
if(fs.existsSync(out))throw new Error('Probe evidence exists; preserve it');fs.mkdirSync(out,{recursive:true});
const hash=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const watched=['src/world/atlas.worker.ts','src/world/model.ts','src/world/generation/fingerprint.ts','dist/build.json',...['worker-yield.ts','worker-yield.test.ts','atlas.worker.ts'].map(n=>path.join(stage,'src/world',n))];
const snapshot=()=>watched.map(file=>({path:path.relative(process.cwd(),file).replaceAll('\\','/'),sha256:hash(file)}));
const before=snapshot();fs.writeFileSync(path.join(out,'source-before.json'),JSON.stringify(before,null,2));
const helperPath=path.join(stage,'src/world/worker-yield.ts'),helper=ts.transpileModule(fs.readFileSync(helperPath,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const workerSource=helper+`
let cancelled=false,cancelReceivedAt=null,startedAt=0;
self.onmessage=event=>{
  if(event.data.type==='cancel'){cancelled=true;cancelReceivedAt=performance.now()-startedAt;return;}
  if(event.data.type==='start')void run(event.data).catch(error=>self.postMessage({type:'error',message:String(error),stack:error?.stack}));
};
async function run({mode,cancelAt}){
  const support=typeof globalThis.scheduler?.postTask==='function',spans=[];let completed=0;
  startedAt=performance.now();
  for(let index=0;index<256;index++){
    if(cancelled)break;
    if(cancelAt!==null&&completed===cancelAt)self.postMessage({type:'checkpoint',completed});
    const begin=performance.now();
    if(mode==='timer')await new Promise(resolve=>setTimeout(resolve,0));else await yieldAtlasWorkerTask();
    spans.push(performance.now()-begin);completed++;
    if(cancelled)break;
  }
  self.postMessage({type:'complete',mode,actualMechanism:mode==='timer'||!support?'setTimeout(0)':'scheduler.postTask(background)',support,completed,cancelled,cancelReceivedAt,elapsedMs:performance.now()-startedAt,spans});
}
`;
fs.writeFileSync(path.join(out,'worker.mjs'),workerSource);
let browser,server;const logs=[];const report={scope:'real Chromium dedicated Worker mechanism probe only; not game performance, GPU or physical-device acceptance',helperSha256:hash(helperPath),count:256,cases:[],browserErrors:[]};
try{
 server=http.createServer((request,response)=>{if(request.url==='/worker.mjs'){response.writeHead(200,{'Content-Type':'text/javascript'});response.end(workerSource);}else{response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><title>Worker scheduling mechanism probe</title>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));report.origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true});report.browserVersion=browser.version();const page=await browser.newPage();
 page.on('pageerror',error=>report.browserErrors.push(String(error)));page.on('console',message=>{if(message.type()==='error')report.browserErrors.push(message.text());});page.on('requestfailed',request=>report.browserErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
 await page.goto(report.origin);report.userAgent=await page.evaluate(()=>navigator.userAgent);
 for(const mode of ['timer','helper'])for(const cancelAt of [null,64]){
  const result=await page.evaluate(async({workerUrl,mode,cancelAt})=>await new Promise((resolve,reject)=>{
   const worker=new Worker(workerUrl,{type:'module'});let cancelSentAt=null;
   const cleanup=()=>{clearTimeout(timer);worker.terminate();};
   const timer=setTimeout(()=>{cleanup();reject(new Error('15-second mechanism probe deadline'));},15000);
   worker.onerror=event=>{cleanup();reject(new Error(JSON.stringify({message:event.message,filename:event.filename,line:event.lineno,column:event.colno})));};
   worker.onmessage=event=>{
    if(event.data.type==='checkpoint'){cancelSentAt=performance.now();worker.postMessage({type:'cancel'});return;}
    if(event.data.type==='error'){cleanup();reject(new Error(event.data.message));return;}
    if(event.data.type==='complete'){const result={...event.data,cancelAt,cancelReplyWallMs:cancelSentAt===null?null:performance.now()-cancelSentAt};cleanup();resolve(result);}
   };
   worker.postMessage({type:'start',mode,cancelAt});
  }),{workerUrl:report.origin+'/worker.mjs',mode,cancelAt});
  result.passed=Number.isFinite(result.elapsedMs)&&result.elapsedMs>=0&&result.spans.length===result.completed&&(cancelAt===null?result.completed===256&&!result.cancelled:result.cancelled&&result.completed>=64&&result.completed<256&&Number.isFinite(result.cancelReceivedAt));
  report.cases.push(result);logs.push(JSON.stringify({mode,cancelAt,actualMechanism:result.actualMechanism,support:result.support,completed:result.completed,elapsedMs:result.elapsedMs,cancelReplyWallMs:result.cancelReplyWallMs,passed:result.passed}));
  fs.writeFileSync(path.join(out,'partial.json'),JSON.stringify(report,null,2));
  if(!result.passed)throw new Error('Worker mechanism assertion failed');
 }
 report.passed=true;
}catch(error){report.passed=false;report.error={message:String(error),stack:error?.stack};logs.push(String(error));}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));const after=snapshot();fs.writeFileSync(path.join(out,'source-after.json'),JSON.stringify(after,null,2));report.sourceStable=JSON.stringify(before)===JSON.stringify(after);report.passed=report.passed&&report.sourceStable;report.exitCode=report.passed?0:1;fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'run.log'),logs.join('\n')+'\n');console.log(logs.join('\n'));console.log(JSON.stringify({passed:report.passed,sourceStable:report.sourceStable,exitCode:report.exitCode}));process.exitCode=report.exitCode;}
