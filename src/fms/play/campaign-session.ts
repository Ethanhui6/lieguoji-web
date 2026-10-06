import {TacticsSession,type GameCommand as OldCommand} from './tactics-session';
import {tacticsView,campaignWrap,withCampaign,assertCampaign,assertGameRun,type GameRun,type CampaignRun} from './campaign-model';
import {maritimeView} from './tactics-model';
import {advanceCampaignTick} from './campaign-runtime';
import {graphFor} from './naval-rules';
import {isClash} from './observation';
import type {GameEvent,World} from '../../sim/types';
export type GameCommand=Exclude<OldCommand,{type:'load'|'copy'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun};
export class CampaignSession{
 private old=new TacticsSession();private current?:GameRun;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==10)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run));}
  if(c.type==='create'){const r=this.old.execute(c).run!;if(r.version!==9)throw Error('创建基础世界失败。');return this.install(withCampaign(r));}
  if(c.type==='copy'){
   assertGameRun(c.run);if(c.run.version===10)throw Error('已经是重编新版，无需复制。');
   const base=c.run.version===9?structuredClone(c.run):this.old.execute({type:'copy',run:c.run}).run!;if(base.version!==9)throw Error('升级基础版本无效。');
   base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;return this.install(withCampaign(base));
  }
  const r=this.current;if(!r)throw Error('请先创建或读取世界。');
  if(r.version!==10){const out=this.old.execute(c);return {...this.install(out.run!),...(out.halted?{halted:out.halted}:{})};}
  if('expected'in c&&(c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化，请重新预览。');
  if(c.type==='tick'||c.type==='step'){
   const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
   let n:CampaignRun=r,halted:GameEvent|undefined;const g=graphFor(maritimeView(tacticsView(r)));
   for(let i=0;i<ticks;i++){const first=n.world.nextEventId;n=advanceCampaignTick(n,g);if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}}
   assertCampaign(n);this.current=n;return {run:n,world:n.world,...(halted?{halted}:{})};
  }
  if(c.type==='transport'&&'armyId'in c.action&&r.reorganization.active[c.action.armyId])throw Error('这支军团正在重编，补员完成后才能登船。');
  this.old.execute({type:'load',run:tacticsView(r)});const out=this.old.execute(c),base=out.run!;if(base.version!==9)throw Error('内部规则版本无效。');
  return this.install(campaignWrap(base,structuredClone(r.reorganization)));
 }
 private install(r:GameRun){assertGameRun(r);this.current=r;return {run:r,world:r.world};}
}
