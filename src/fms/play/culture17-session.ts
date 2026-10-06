import {Court16Session,type GameCommand as OldCommand} from './court16-session';
import {fiscal15View,court16Wrap,type Court16Run} from './court16-model';
import {initialCultures,reconcileCultures,applyCultureEdit,type CultureEdit} from './culture17-culture';
import {Upper14Session} from './upper14-session';
import {assertGameRun,court16View,chronicleView,culture17Wrap,campaignView,type GameRun} from './culture17-model';
import {fiscal15Wrap} from './fiscal15-model';
import {upper14Wrap,type Upper14Run} from './upper14-model';
import {terrain13Wrap} from './terrain13-model';
import {chronicle2Wrap} from './chronicle2-model';
import {chronicleWrap} from './chronicle-model';
import {tacticsView} from './campaign-model';
import {maritimeView} from './tactics-model';
import {graphFor} from './naval-rules';
import {advanceCulture17Tick} from './culture17-runtime';
import {reconcileUpper} from './upper14-state';
import {initializeFiscal,reconcileFiscal} from './culture17-state';
import {initialPeople,reconcilePeople,applyAppointment} from './court16-people';
import {captureTransitions} from './chronicle-records';
import {advancePolitics} from './chronicle-politics';
import {isClash} from './observation';
import type {GameEvent,World} from '../../sim/types';
export type GameCommand=Exclude<OldCommand,{type:'load'|'copy'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun}|{type:'culture-edit';edit:CultureEdit;expected:{day:number;nextEventId:number;tick:number}};
export class Culture17Session{
 private old=new Court16Session();private current?:GameRun;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==17)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run));}
  if(c.type==='create'){const run=new Upper14Session().execute(c).run as Upper14Run,people=initialPeople(run),culture=initialCultures(run);return this.install(culture17Wrap(court16Wrap(fiscal15Wrap(run,initializeFiscal({...run,people,culture},false)),people),culture));}
  if(c.type==='copy'){assertGameRun(c.run);if(c.run.version===17)throw Error('已经是当前新版，无需复制。');const run=c.run.version===16?structuredClone(c.run):new Court16Session().execute({type:'copy',run:c.run}).run as Court16Run;run.id='fms-'+crypto.randomUUID();run.world.custom!.id=run.id;return this.install(culture17Wrap(run,initialCultures(run,true)));}
  const r=this.current;if(!r)throw Error('请先创建或读取世界。');if(r.version!==17){if(c.type==='culture-edit')throw Error('旧版继续使用原规则，请先建立文化版副本。');const out=this.old.execute(c);return {...this.install(out.run),...(out.halted?{halted:out.halted}:{})};}
  if(c.type!=='step'&&(!('expected'in c)||!c.expected||![c.expected.day,c.expected.nextEventId,c.expected.tick].every(Number.isSafeInteger)||c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化或缺少有效预览，请重新预览。');
  if(c.type==='culture-edit'){const n=structuredClone(r);applyCultureEdit(n,c.edit);return this.install(n);}
  if(c.type==='appointment'){const n=structuredClone(r);applyAppointment(n,c.action);return this.install(n);}
  if(c.type==='tick'||c.type==='step'){
   const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
   let n={...chronicleView(r),chronicle:structuredClone(r.chronicle)},halted:GameEvent|undefined;const g=graphFor(maritimeView(tacticsView(campaignView(r)))),upper=structuredClone(r.upperCombat),finance=structuredClone(r.finance),people=structuredClone(r.people),culture=structuredClone(r.culture),context={...r.terrainContext,upper,finance,people,culture};
   for(let i=0;i<ticks;i++){const before=n.world,first=before.nextEventId;n=chronicleWrap(advanceCulture17Tick(campaignView(n),g,context),n.chronicle);captureTransitions(n.chronicle,before,n.world,n.clock.tick);advancePolitics(n,n.world.day!==before.day);reconcileCultures(n,culture);reconcilePeople(n,people);reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people,culture},finance);if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}}
   return {...this.install(culture17Wrap(court16Wrap(fiscal15Wrap(upper14Wrap(terrain13Wrap(chronicle2Wrap(n),r.terrainContext),upper),finance),people),culture)),...(halted?{halted}:{})};
  }
  // Delegate ordinary commands to the pre-finance layer: new states must receive
  // their first credit only after their actual current ruler is available.
  const temporary=new Upper14Session();const {upper14View}=fiscalProjection;temporary.execute({type:'load',run:upper14View(fiscal15View(court16View(r)))});const out=temporary.execute(c);if(out.run.version!==14)throw Error('内部版本无效。');const people=structuredClone(r.people),finance=structuredClone(r.finance),culture=structuredClone(r.culture);reconcileCultures(out.run,culture);reconcilePeople(out.run,people);reconcileFiscal({...out.run,people,culture},finance);return this.install(culture17Wrap(court16Wrap(fiscal15Wrap(out.run,finance),people),culture));
 }
 private install(run:GameRun){assertGameRun(run);this.current=run;return {run,world:run.world};}
}
import * as fiscalProjection from './fiscal15-model';
