import {Terrain13Session,type GameCommand as OldCommand} from './terrain13-session';
import {assertGameRun,terrain13View,chronicleView,upper14Wrap,campaignView,type GameRun} from './upper14-model';
import {terrain13Wrap,type Terrain13Run} from './terrain13-model';
import {chronicle2Wrap} from './chronicle2-model';
import {chronicleWrap} from './chronicle-model';
import {tacticsView} from './campaign-model';
import {maritimeView} from './tactics-model';
import {graphFor} from './naval-rules';
import {advanceUpper14Tick} from './upper14-runtime';
import {buildProvinceCombat} from './upper14-geography';
import {reconcileUpper,type UpperCombat} from './upper14-state';
import {applyCombatEdit,type CombatEdit,type CombatStamp} from './upper14-edit';
import {captureTransitions} from './chronicle-records';
import {advancePolitics} from './chronicle-politics';
import {isClash} from './observation';
import type {GameEvent,World} from '../../sim/types';
export type GameCommand=Exclude<OldCommand,{type:'load'|'copy'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun}|{type:'combat-edit';edit:CombatEdit;expected:CombatStamp;runId:string};
function initialize(run:Terrain13Run){const upper:UpperCombat={version:1,initialization:'native-combat-web-inputs-v1',nations:{},armies:{},provinces:buildProvinceCombat(run.terrain,run.world,run.scale,run.terrainContext)};reconcileUpper(run,upper);return upper14Wrap(run,upper);}
export class Upper14Session{
 private old=new Terrain13Session();private current?:GameRun;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==14)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run));}
  if(c.type==='create'){const run=new Terrain13Session().execute(c).run;if(run.version!==13)throw Error('创建基础版本失败。');return this.install(initialize(run));}
  if(c.type==='copy'){assertGameRun(c.run);if(c.run.version===14)throw Error('已经是当前新版，无需复制。');const run=c.run.version===13?structuredClone(c.run):new Terrain13Session().execute({type:'copy',run:c.run}).run;if(run.version!==13)throw Error('复制基础版本失败。');run.id='fms-'+crypto.randomUUID();run.world.custom!.id=run.id;return this.install(initialize(run));}
  const r=this.current;if(!r)throw Error('请先创建或读取世界。');if(r.version!==14){if(c.type==='combat-edit')throw Error('原版世界保留原规则，请先明确创建新版副本。');const out=this.old.execute(c);return {...this.install(out.run),...(out.halted?{halted:out.halted}:{})};}
  if(c.type!=='step'&&(!('expected'in c)||!c.expected||![c.expected.day,c.expected.nextEventId,c.expected.tick].every(Number.isSafeInteger)||c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化或缺少有效预览，请重新预览。');
  if(c.type==='combat-edit')return this.install(applyCombatEdit(r,c.edit,c.expected,c.runId));
  if(c.type==='tick'||c.type==='step'){
   const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
   let n={...chronicleView(r),chronicle:structuredClone(r.chronicle)},halted:GameEvent|undefined;const g=graphFor(maritimeView(tacticsView(campaignView(r)))),upper=structuredClone(r.upperCombat),context={...r.terrainContext,upper};
   for(let i=0;i<ticks;i++){const before=n.world,first=before.nextEventId;n=chronicleWrap(advanceUpper14Tick(campaignView(n),g,context),n.chronicle);captureTransitions(n.chronicle,before,n.world,n.clock.tick);advancePolitics(n,n.world.day!==before.day);reconcileUpper(n,upper);if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}}
   return {...this.install(upper14Wrap(terrain13Wrap(chronicle2Wrap(n),r.terrainContext),upper)),...(halted?{halted}:{})};
  }
  const temporary=new Terrain13Session();temporary.execute({type:'load',run:terrain13View(r)});const out=temporary.execute(c);if(out.run.version!==13)throw Error('内部版本无效。');const upper=structuredClone(r.upperCombat);reconcileUpper(out.run,upper);return this.install(upper14Wrap(out.run,upper));
 }
 private install(run:GameRun){assertGameRun(run);this.current=run;return {run,world:run.world};}
}
