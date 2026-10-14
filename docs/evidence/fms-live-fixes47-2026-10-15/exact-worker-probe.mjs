import {createFmsDocument,generateFmsFullMap,populationStamp47} from './fms-worker47-tools-built.mjs';
import {fingerprintCulture47} from '../scripts/fms-culture47-fingerprint.ts';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {serialize,deserialize} from 'node:v8';
import {createHash} from 'node:crypto';
import {Session} from 'node:inspector';
const variant=process.argv[2];if(!['original','candidate'].includes(variant))throw Error('variant');
globalThis.__CULTURE47_ENGINE__=fingerprintCulture47();
let terrain;try{terrain=deserialize(await readFile('.autopilot/fms-live-fixes47-2026-10-15/terrain.v8'));}catch{terrain=await createFmsDocument({yieldTask:async()=>{}});terrain.elevations=(await generateFmsFullMap(terrain,{seed:'1337',template:'continents'},{yieldTask:async()=>{}})).elevations;await writeFile('.autopilot/fms-live-fixes47-2026-10-15/terrain.v8',serialize(terrain));}
let response,id=0,current;globalThis.self={postMessage:r=>{response=r;}};
const candidateFile=(await readdir('.autopilot/fms-live-fixes47-checked/assets')).find(f=>f.startsWith('culture47.worker-')&&f.endsWith('.js'));
await import(variant==='original'?'./fms-full-map47-checked/assets/culture47.worker-dNoyefgq.js':'./fms-live-fixes47-checked/assets/'+candidateFile);
const samples=[];
function send(command){const at=performance.now();self.onmessage({data:{id:++id,command}});if(response.error)throw Error(response.error);if(response.display){const p=response.display;current=p.kind==='full'?p.snapshot:{run:{...current.run,...p.run},journal:{...current.journal,...p.journal},frame:p.frame};}const json=JSON.stringify(current.run).replaceAll(current.run.id,'fms-normalized');samples.push({command:command.type,action:command.action?.kind,ticks:command.ticks,ms:performance.now()-at,tick:current.run.clock.tick,runSha256:createHash('sha256').update(json).digest('hex')});return current;}
const inspector=new Session();inspector.connect();const post=(method,args={})=>new Promise((ok,no)=>inspector.post(method,args,(error,value)=>error?no(error):ok(value)));if(process.env.PROFILE_CREATE){await post('Profiler.enable');await post('Profiler.start');}
send({type:'create',opening:{terrain,count:6,cityCount:60,relations:'war',setup:{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman','german']},settlementAlgorithm:'terrain-connected-unions-perimeter-v1'}});
if(process.env.PROFILE_CREATE){const {profile}=await post('Profiler.stop');await writeFile('.autopilot/fms-live-fixes47-2026-10-15/create.cpuprofile',JSON.stringify(profile));}inspector.disconnect();
for(const [kind,rule] of [['enable-retirement','retired-roster-web-v1'],['enable-recovery','wounded-army-recovery-web-v1'],['enable-generations','known-couples-birth-household-web-v1']])send({type:'action',sequence:current.journal.actions.length,action:{kind,rule,expected:populationStamp47(current.run)}});
for(let i=0;i<3;i++)send({type:'advance-batch',ticks:480,sequence:current.journal.actions.length});
const root='.autopilot/fms-live-fixes47-2026-10-15';await mkdir(root,{recursive:true});await writeFile(root+'/'+variant+'.json',JSON.stringify({variant,samples,engine:current.journal.engine,scope:'Same real 1337 terrain,6 nations60 cities,war; retirement,recovery,generations enabled; current Node and immutable original Worker bytes; entire run digest normalizes only generated run id.'},null,2));console.log(JSON.stringify({variant,samples}));
