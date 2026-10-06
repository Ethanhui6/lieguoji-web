import {Upper14Session,type GameCommand as OldCommand} from './upper14-session';
import {assertGameRun,upper14View,chronicleView,fiscal15Wrap,campaignView,type GameRun} from './fiscal15-model';
import {upper14Wrap,type Upper14Run} from './upper14-model';
import {terrain13Wrap} from './terrain13-model';
import {chronicle2Wrap} from './chronicle2-model';
import {chronicleWrap} from './chronicle-model';
import {tacticsView} from './campaign-model';
import {maritimeView} from './tactics-model';
import {graphFor} from './naval-rules';
import {advanceFiscal15Tick} from './fiscal15-runtime';
import {reconcileUpper} from './upper14-state';
import {initializeFiscal,reconcileFiscal} from './fiscal15-state';
import {captureTransitions} from './chronicle-records';
import {advancePolitics} from './chronicle-politics';
import {isClash} from './observation';
import type {GameEvent,World} from '../../sim/types';
export type GameCommand=Exclude<OldCommand,{type:'load'|'copy'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun};
export class Fiscal15Session{
 private old=new Upper14Session();private current?:GameRun;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==15)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run));}
  if(c.type==='create'){const run=new Upper14Session().execute(c).run as Upper14Run;return this.install(fiscal15Wrap(run,initializeFiscal(run,false)));}
  if(c.type==='copy'){assertGameRun(c.run);if(c.run.version===15)throw Error('已经是当前新版，无需复制。');const run=c.run.version===14?structuredClone(c.run):new Upper14Session().execute({type:'copy',run:c.run}).run as Upper14Run;run.id='fms-'+crypto.randomUUID();run.world.custom!.id=run.id;return this.install(fiscal15Wrap(run,initializeFiscal(run,true)));}
  const r=this.current;if(!r)throw Error('请先创建或读取世界。');if(r.version!==15){const out=this.old.execute(c);return {...this.install(out.run),...(out.halted?{halted:out.halted}:{})};}
  if(c.type!=='step'&&(!('expected'in c)||!c.expected||![c.expected.day,c.expected.nextEventId,c.expected.tick].every(Number.isSafeInteger)||c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化或缺少有效预览，请重新预览。');
  if(c.type==='tick'||c.type==='step'){
   const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
   let n={...chronicleView(r),chronicle:structuredClone(r.chronicle)},halted:GameEvent|undefined;const g=graphFor(maritimeView(tacticsView(campaignView(r)))),upper=structuredClone(r.upperCombat),finance=structuredClone(r.finance),context={...r.terrainContext,upper,finance};
   for(let i=0;i<ticks;i++){const before=n.world,first=before.nextEventId;n=chronicleWrap(advanceFiscal15Tick(campaignView(n),g,context),n.chronicle);captureTransitions(n.chronicle,before,n.world,n.clock.tick);advancePolitics(n,n.world.day!==before.day);reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper},finance);if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}}
   return {...this.install(fiscal15Wrap(upper14Wrap(terrain13Wrap(chronicle2Wrap(n),r.terrainContext),upper),finance)),...(halted?{halted}:{})};
  }
  const temporary=new Upper14Session();temporary.execute({type:'load',run:upper14View(r)});const out=temporary.execute(c);if(out.run.version!==14)throw Error('内部版本无效。');const finance=structuredClone(r.finance);reconcileFiscal(out.run,finance);return this.install(fiscal15Wrap(out.run,finance));
 }
 private install(run:GameRun){assertGameRun(run);this.current=run;return {run,world:run.world};}
}
