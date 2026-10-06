import {MaritimeSession,type MaritimeCommand} from './maritime-session';
import {assertGameRun,assertTactics,initialTactics,maritimeView,tacticsWrap,type GameRun,type TacticsRun} from './tactics-model';
import {advanceTacticsTick} from './tactics-runtime';
import {applyMuster,regularMuster,type MusterAction} from './tactics-muster';
import {graphFor} from './naval-rules';
import {isClash} from './observation';
import type {GameEvent,World} from '../../sim/types';
import type {PlayVersion} from './session';
import {createFmsRun,assertRealtimeStep} from './world';
import {withOccupation} from './runtime';
import {withTransport} from './transport-runtime';
import {withMaritime,reconcileMaritime} from './maritime';
import {initialNavy} from './navy';
import {seaGraph} from './sea-path';
import {applyBattle,reconcileCombat} from './tactics-battle';
export type GameCommand=Exclude<MaritimeCommand,{type:'load'|'copy'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun}|{type:'muster';action:MusterAction;expected:PlayVersion};
export class TacticsSession{
  private old=new MaritimeSession();private current?:GameRun;
  execute(c:GameCommand):{run?:GameRun;world:World;halted?:GameEvent}{
    if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==9)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run));}
    if(c.type==='create'){
      const base=createFmsRun(c.terrain,c.count,c.relations);
      // The map initializer's fixture armies were not debited from population.
      // Remove them; only actual v9 recruitment charges the province.
      base.world.armies=[];
      let maritime=withMaritime(withTransport(withOccupation(base,true)));
      const g=seaGraph(maritime.terrain,maritime.world),naval=initialNavy(maritime.world,g);maritime=reconcileMaritime({...maritime,...naval});
      return this.install(regularMuster(tacticsWrap(maritime,initialTactics(maritime)),true));
    }
    if(c.type==='copy'){
      assertGameRun(c.run);if(c.run.version===9)throw Error('已经是新版战争世界，无需升级。');
      const old=c.run.version===8?structuredClone(c.run):this.old.execute({type:'copy',run:c.run}).run!;
      if(old.version!==8)throw Error('转换基础版本无效。');old.id='fms-'+crypto.randomUUID();old.world.custom!.id=old.id;
      return this.install(tacticsWrap(old,initialTactics(old)));
    }
    const r=this.current;if(!r)throw Error('请先创建或读取世界。');
    if(r.version!==9){if(c.type==='muster')throw Error('请创建新版战争副本再使用布兵与动员。');const result=this.old.execute(c);return {...this.install(result.run!),...(result.halted?{halted:result.halted}:{})};}
    if('expected'in c&&(c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化，请重新预览。');
    if(c.type==='muster')return this.install(applyMuster(r,c.action));
    if(c.type==='tick'||c.type==='step'){
      const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
      let n:TacticsRun=r,halted:GameEvent|undefined;const g=graphFor(maritimeView(r));
      for(let i=0;i<ticks;i++){const first=n.world.nextEventId;n=advanceTacticsTick(n,g);if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}}
      // Same structural movement/sea contracts; the new engine identity and all
      // army-source/timer fields receive independent validation below.
      assertRealtimeStep(maritimeView(r),maritimeView(n),g);assertTactics(n);this.current=n;return {run:n,world:n.world,...(halted?{halted}:{})};
    }
    if(c.type==='battle')return this.install({...r,...applyBattle(r.world,r.battles,r.units,c.action)});
    this.old.execute({type:'load',run:maritimeView(r)});const result=this.old.execute(c),base=result.run!;if(base.version!==8)throw Error('内部命令版本无效。');
    const metadata=structuredClone(r.tactics);
    for(const a of [...base.world.armies,...base.transports.cargo.map(c=>c.army)])if(!metadata.forces[a.id])metadata.forces[a.id]={homeId:a.originId,kind:'manual',fullStrength:a.troops};
    return this.install(tacticsWrap({...base,...reconcileCombat(base.world,base.battles,base.clock.tick)},metadata));
  }
  private install(r:GameRun){assertGameRun(r);this.current=r;return {run:r,world:r.world};}
}
