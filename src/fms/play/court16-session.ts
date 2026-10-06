import {Fiscal15Session,type GameCommand as OldCommand} from './fiscal15-session';
import {Upper14Session} from './upper14-session';
import {assertGameRun,fiscal15View,chronicleView,court16Wrap,campaignView,type GameRun} from './court16-model';
import {fiscal15Wrap,type Fiscal15Run} from './fiscal15-model';
import {upper14Wrap,type Upper14Run} from './upper14-model';
import {terrain13Wrap} from './terrain13-model';
import {chronicle2Wrap} from './chronicle2-model';
import {chronicleWrap} from './chronicle-model';
import {tacticsView} from './campaign-model';
import {maritimeView} from './tactics-model';
import {graphFor} from './naval-rules';
import {advanceCourt16Tick} from './court16-runtime';
import {reconcileUpper} from './upper14-state';
import {initializeFiscal,reconcileFiscal} from './court16-state';
import {initialPeople,reconcilePeople,applyAppointment,type Appointment} from './court16-people';
import {captureTransitions} from './chronicle-records';
import {advancePolitics} from './chronicle-politics';
import {isClash} from './observation';
import type {GameEvent,World} from '../../sim/types';
export type GameCommand=Exclude<OldCommand,{type:'load'|'copy'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun}|{type:'appointment';action:Appointment;expected:{day:number;nextEventId:number;tick:number}};
export class Court16Session{
 private old=new Fiscal15Session();private current?:GameRun;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==16)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run));}
  if(c.type==='create'){const run=new Upper14Session().execute(c).run as Upper14Run,people=initialPeople(run);return this.install(court16Wrap(fiscal15Wrap(run,initializeFiscal({...run,people},false)),people));}
  if(c.type==='copy'){assertGameRun(c.run);if(c.run.version===16)throw Error('已经是当前新版，无需复制。');const run=c.run.version===15?structuredClone(c.run):new Fiscal15Session().execute({type:'copy',run:c.run}).run as Fiscal15Run;run.id='fms-'+crypto.randomUUID();run.world.custom!.id=run.id;return this.install(court16Wrap(run,initialPeople(run)));}
  const r=this.current;if(!r)throw Error('请先创建或读取世界。');if(r.version!==16){if(c.type==='appointment')throw Error('旧版继续使用原规则，请先建立人物版副本。');const out=this.old.execute(c);return {...this.install(out.run),...(out.halted?{halted:out.halted}:{})};}
  if(c.type!=='step'&&(!('expected'in c)||!c.expected||![c.expected.day,c.expected.nextEventId,c.expected.tick].every(Number.isSafeInteger)||c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化或缺少有效预览，请重新预览。');
  if(c.type==='appointment'){const n=structuredClone(r);applyAppointment(n,c.action);return this.install(n);}
  if(c.type==='tick'||c.type==='step'){
   const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
   let n={...chronicleView(r),chronicle:structuredClone(r.chronicle)},halted:GameEvent|undefined;const g=graphFor(maritimeView(tacticsView(campaignView(r)))),upper=structuredClone(r.upperCombat),finance=structuredClone(r.finance),people=structuredClone(r.people),context={...r.terrainContext,upper,finance,people};
   for(let i=0;i<ticks;i++){const before=n.world,first=before.nextEventId;n=chronicleWrap(advanceCourt16Tick(campaignView(n),g,context),n.chronicle);captureTransitions(n.chronicle,before,n.world,n.clock.tick);advancePolitics(n,n.world.day!==before.day);reconcilePeople(n,people);reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people},finance);if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}}
   return {...this.install(court16Wrap(fiscal15Wrap(upper14Wrap(terrain13Wrap(chronicle2Wrap(n),r.terrainContext),upper),finance),people)),...(halted?{halted}:{})};
  }
  // Delegate ordinary commands to the pre-finance layer: new states must receive
  // their first credit only after their actual current ruler is available.
  const temporary=new Upper14Session();const {upper14View}=fiscalProjection;temporary.execute({type:'load',run:upper14View(fiscal15View(r))});const out=temporary.execute(c);if(out.run.version!==14)throw Error('内部版本无效。');const people=structuredClone(r.people),finance=structuredClone(r.finance);reconcilePeople(out.run,people);reconcileFiscal({...out.run,people},finance);return this.install(court16Wrap(fiscal15Wrap(out.run,finance),people));
 }
 private install(run:GameRun){assertGameRun(run);this.current=run;return {run,world:run.world};}
}
import * as fiscalProjection from './fiscal15-model';
