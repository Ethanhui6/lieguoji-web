import {it,expect} from 'vitest';
import {Session} from 'node:inspector';
import {readFileSync,writeFileSync} from 'node:fs';
import {Culture47Session} from '../src/fms/play/culture47-session';
import {ARMY_RETIREMENT_RULE47} from '../src/fms/play/army-retirement47';
import {ARMY_RECOVERY_RULE47} from '../src/fms/play/army-recovery47';
import {GENERATIONS_RULE47} from '../src/fms/play/civilization47-generations-ledger';
import {populationStamp47} from '../src/fms/play/civilization47-population-types';
it('measures current full continents owner without UI or personal saves',async()=>{
 const revive=(_key:string,v:any)=>v?.$typed?new ({Uint32Array,Int32Array,Uint8Array} as any)[v.$typed](v.values):v;
 const fixture=JSON.parse(readFileSync('.autopilot/fms-map-typography47-browser/desktop/fixture.json','utf8'),revive);
 const opening=fixture.find((db:any)=>db.name==='lieguoji-fms-culture47-generations-v1').rows.find((row:any)=>row[0]==='current')[1].journal.opening;
 opening.relations='war';const session=new Culture47Session(),start=performance.now();let s=session.create(opening);
 for(const [kind,rule]of [['enable-retirement',ARMY_RETIREMENT_RULE47],['enable-recovery',ARMY_RECOVERY_RULE47],['enable-generations',GENERATIONS_RULE47]] as const)s=session.execute({kind,rule,expected:populationStamp47(s.run)} as any,s.journal.actions.length);
 session.displaySnapshot();const createMs=performance.now()-start;
 const actions=Array.from({length:4},()=>({kind:'advance' as const,ticks:120}));
 const inspector=new Session();inspector.connect();const post=(method:string)=>new Promise<any>((ok,no)=>inspector.post(method as any,(e,r)=>e?no(e):ok(r)));
 const label=process.env.PACE_PROFILE_STAGE??'active-before',times=[];try{await post('Profiler.enable');await post('Profiler.start');for(let day=0;day<24;day+=4){const at=performance.now();session.executeDisplay(actions,day+3);times.push({day:day+4,coreMs:performance.now()-at});}const {profile}=await post('Profiler.stop');writeFileSync(`.autopilot/fms-pacing-titles47-${label}.cpuprofile`,JSON.stringify(profile));}finally{inspector.disconnect();}
 expect(session.snapshot().run.clock.tick).toBe(2880);writeFileSync(`.autopilot/fms-pacing-titles47-${label}-profile.json`,JSON.stringify({createMs,times,points:opening.terrain.points.length,relations:'war',allCurrentUiFeatures:true},null,2));
},180000);
