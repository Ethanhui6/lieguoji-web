import {Chronicle2Session,type GameCommand as OldCommand} from './chronicle2-session';
import {assertGameRun,chronicle2View,chronicleView,terrain13Wrap,campaignView,type GameRun} from './terrain13-model';
import {chronicle2Wrap} from './chronicle2-model';
import {chronicleWrap} from './chronicle-model';
import {tacticsView} from './campaign-model';
import {maritimeView} from './tactics-model';
import {graphFor} from './naval-rules';
import {advanceTerrain13Tick} from './terrain13-runtime';
import {buildTerrainContext} from './terrain13-context';
import {captureTransitions} from './chronicle-records';
import {advancePolitics} from './chronicle-politics';
import {isClash} from './observation';
import type {GameEvent,World} from '../../sim/types';
export type GameCommand=Exclude<OldCommand,{type:'load'|'copy'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun};
export class Terrain13Session{
 private old=new Chronicle2Session();private current?:GameRun;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==13)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run));}
  if(c.type==='create'){const run=new Chronicle2Session().execute(c).run;if(run.version!==12)throw Error('创建基础版本失败。');return this.install(terrain13Wrap(run,buildTerrainContext(run.terrain,run.world,run.scale)));}
  if(c.type==='copy'){assertGameRun(c.run);if(c.run.version===13)throw Error('已经是当前新版，无需复制。');const run=c.run.version===12?structuredClone(c.run):new Chronicle2Session().execute({type:'copy',run:c.run}).run;if(run.version!==12)throw Error('复制基础版本失败。');run.id='fms-'+crypto.randomUUID();run.world.custom!.id=run.id;return this.install(terrain13Wrap(run,buildTerrainContext(run.terrain,run.world,run.scale)));}
  const r=this.current;if(!r)throw Error('请先创建或读取世界。');if(r.version!==13){const out=this.old.execute(c);return {...this.install(out.run),...(out.halted?{halted:out.halted}:{})};}
  if(c.type!=='step'&&(!('expected'in c)||!c.expected||![c.expected.day,c.expected.nextEventId,c.expected.tick].every(Number.isSafeInteger)||c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化或缺少有效预览，请重新预览。');
  if(c.type==='tick'||c.type==='step'){
   const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
   let n={...chronicleView(r),chronicle:structuredClone(r.chronicle)},halted:GameEvent|undefined;const g=graphFor(maritimeView(tacticsView(campaignView(r))));
   for(let i=0;i<ticks;i++){const before=n.world,first=before.nextEventId;n=chronicleWrap(advanceTerrain13Tick(campaignView(n),g,r.terrainContext),n.chronicle);captureTransitions(n.chronicle,before,n.world,n.clock.tick);advancePolitics(n,n.world.day!==before.day);if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}}
   return {...this.install(terrain13Wrap(chronicle2Wrap(n),r.terrainContext)),...(halted?{halted}:{})};
  }
  // Unchanged orders and political commands keep frozen validation. No elapsed
  // time or combat is delegated through this path.
  const temporary=new Chronicle2Session();temporary.execute({type:'load',run:chronicle2View(r)});const out=temporary.execute(c);if(out.run.version!==12)throw Error('内部版本无效。');return this.install(terrain13Wrap(out.run,r.terrainContext));
 }
 private install(run:GameRun){assertGameRun(run);this.current=run;return {run,world:run.world};}
}
