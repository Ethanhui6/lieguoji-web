import {EditorSession,type EditorCommand} from './editor-session';
import {assertFmsRun,assertRealtimeStep,type FmsRun} from './world';
import {withMaritime,transportBase,advanceMaritimeTick,reconcileMaritime,applyMaritime,type MaritimeAction,type MaritimeRun} from './maritime';
import {graphFor} from './naval-rules';
import type {PlayVersion} from './session';
import {isClash} from './observation';
import type {GameEvent,World} from '../../sim/types';
export type MaritimeCommand=EditorCommand|{type:'maritime';action:MaritimeAction;expected:PlayVersion};
export class MaritimeSession{
  private inner=new EditorSession();private current?:FmsRun;
  execute(c:MaritimeCommand):{run?:FmsRun;world:World;halted?:GameEvent}{
    if(c.type==='load')return this.install(structuredClone(c.run));
    if(c.type==='create'||c.type==='copy'){
      if(c.type==='copy'&&c.run.version===8)throw Error('已经是海战版。');
      const base=c.type==='copy'&&c.run.version===7?c.run:this.inner.execute(c as EditorCommand).run!;
      assertFmsRun(base);if(base.version!==7)throw Error('转换版本错误。');return this.install(withMaritime(base,c.type==='copy'));
    }
    const r=this.current;
    if(r?.version!==8){if(c.type==='maritime')throw Error('请先创建海战版副本。');const result=this.inner.execute(c);this.current=result.run??this.current;return result;}
    const g=graphFor(r);
    if(c.type==='maritime')return this.install(applyMaritime(r,g,c.action,c.expected));
    if('expected'in c&&(c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化，请重新预览。');
    if(c.type==='tick'||c.type==='step'){
      if(c.type==='step'&&!Number.isInteger(c.days))throw Error('推进参数无效。');const ticks=c.type==='tick'?c.ticks:c.days*120;
      if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
      let n:MaritimeRun=r,halted:GameEvent|undefined;for(let i=0;i<ticks;i++){const first=n.world.nextEventId;n=advanceMaritimeTick(n,g);if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}}
      assertRealtimeStep(r,n,g);this.current=n;return {run:n,world:n.world,...(halted?{halted}:{})};
    }
    if(c.type==='transport'&&r.maritime.contacts.some(p=>p.a===c.action.fleetId||p.b===c.action.fleetId))throw Error('舰队正在交战，请先用撤离航线脱离，再登船或登陆。');
    this.inner.execute({type:'load',run:transportBase(r)});const result=this.inner.execute(c),base=result.run!;
    if(base.version!==7)throw Error('运输基础版本错误。');const maritime=structuredClone(r.maritime);
    if((c.type==='naval'||c.type==='transport')&&'fleetId'in c.action)delete maritime.retreating[c.action.fleetId];
    return this.install(reconcileMaritime({...base,version:8,rules:'fms-maritime-1',engine:__FMS_PLAY_ENGINE__,maritime}));
  }
  private install(r:FmsRun){assertFmsRun(r);this.inner.execute({type:'load',run:r.version===8?transportBase(r):r});this.current=r;return {run:r,world:r.world};}
}
