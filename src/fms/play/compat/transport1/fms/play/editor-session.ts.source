import { PlaySession, type PlayCommand, type PlayVersion } from './session';
import { customizeRun, type CustomizeCommand } from './customization';
import {assertFmsRun,assertRealtimeStep,type FmsRun} from './world';
import {applyTransport,recruitmentLimit,type TransportAction,type ExpeditionRun} from './transport';
import {withTransport,advanceTransportTick,occupationBase} from './transport-runtime';
import {graphFor} from './naval-rules';
import {reconcileCombat} from './battle';
import {reconcileOccupation} from './occupation';
import {isClash} from './observation';
import type {World,GameEvent} from '../../sim/types';

export type EditorCommand=PlayCommand|CustomizeCommand|{type:'transport';action:TransportAction;expected:PlayVersion};
export class EditorSession {
  private session=new PlaySession();
  private current?:FmsRun;
  execute(command:EditorCommand):{run?:FmsRun;world:World;halted?:GameEvent}{
    if(command.type==='create'){const base=this.session.execute(command).run!;if(base.version!==6)throw Error('创世版本错误。');return this.install(withTransport(base));}
    if(command.type==='load')return this.install(structuredClone(command.run));
    if(command.type==='copy'){
      assertFmsRun(command.run);if(command.run.version===7)throw Error('已经是运输版。');
      if(command.run.version===6)return this.install(withTransport(command.run,true));
      const base=this.session.execute(command).run!;if(base.version!==6)throw Error('转换版本错误。');return this.install(withTransport(base));
    }
    if(command.type==='customize'){
      if(!this.current)throw Error('请先创建或读取世界。');
      const candidate=customizeRun(this.current,command);
      return this.install(candidate);
    }
    if(command.type==='transport'){
      if(this.current?.version!==7)throw Error('请先创建运输版副本。');
      let run=applyTransport(this.current,graphFor(this.current),command.action,command.expected);
      run={...run,...reconcileCombat(run.world,run.battles,run.clock.tick)};
      return this.install({...run,...reconcileOccupation(run.world,run.occupation)});
    }
    if(this.current?.version===7){
      const r=this.current;
      if('expected'in command&&(command.expected.day!==r.world.day||command.expected.nextEventId!==r.world.nextEventId||command.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化，请重新预览。');
      if(command.type==='tick'||command.type==='step'){
        if(command.type==='step'&&!Number.isInteger(command.days))throw Error('推进参数无效。');
        const ticks=command.type==='tick'?command.ticks:command.days*120;
        if(!Number.isInteger(ticks)||ticks<1||ticks>(command.type==='tick'?120:840)||(command.pauseOnBattle!==undefined&&typeof command.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
        let n:ExpeditionRun=r,halted:GameEvent|undefined;const graph=graphFor(r);
        for(let i=0;i<ticks;i++){const first=n.world.nextEventId;n=advanceTransportTick(n,graph);if(command.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&isClash(n.world,e));if(halted)break;}}
        assertRealtimeStep(r,n,graph);this.current=n;return {run:n,world:n.world,...(halted?{halted}:{})};
      }
      if(command.type==='naval'&&command.action.type!=='build-fleet'&&r.transports.cargo.some(c=>c.fleetId===('fleetId'in command.action?command.action.fleetId:'')))throw Error('载军舰队请使用运输航线，不能被普通巡航覆盖。');
      if(command.type==='military'&&command.action.type==='recruit'){const reason=recruitmentLimit(r,command.action.nationId);if(reason)throw Error(reason);}
      this.session.execute({type:'load',run:occupationBase(r)});
      const result=this.session.execute(command),base=result.run!;
      if(base.version!==6)throw Error('基础推演版本错误。');
      return this.install({...base,version:7,rules:'fms-transport-1',transports:r.transports});
    }
    const result=this.session.execute(command);this.current=result.run??this.current;return result;
  }
  private install(run:FmsRun){assertFmsRun(run);this.session.execute({type:'load',run:run.version===7?occupationBase(run):run});this.current=run;return {run,world:run.world};}
}
