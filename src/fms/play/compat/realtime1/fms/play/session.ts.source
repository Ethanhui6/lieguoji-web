import { playRules, withRealtime, executeMilitary, stepRunDay,advanceRunTick } from './runtime';
import { type NavalAction } from './navy';
import {navalRules,graphFor} from './naval-rules';
import type { MilitaryAction } from './military-actions';
import type { GameEvent, Order, StateAction, StateVersion, World } from '../../sim/types';
import { assertFmsRun,assertRealtimeStep, createFmsRun, type FmsRun } from './world';
import type { FmsDocument } from '../model';
import { isClash } from './observation';
export type PlayVersion=StateVersion & {tick?:number};
export type PlayCommand = {type:'tick';ticks:number;expected:PlayVersion;pauseOnBattle?:boolean}|{type:'naval';action:NavalAction;expected:PlayVersion} | {type:'copy';run:FmsRun} | {type:'military';action:MilitaryAction;expected:PlayVersion} | { type: 'create'; terrain: FmsDocument; count: number; relations: 'peace' | 'war' } | { type: 'load'; run: FmsRun } | { type: 'step'; days: number; pauseOnBattle?: boolean } | { type: 'order'; order: Order; expected: PlayVersion } | { type: 'action'; action: StateAction; expected: PlayVersion };
export class PlaySession {
  private run?: FmsRun;
  execute(command: PlayCommand): { world: World; run?: FmsRun; halted?: GameEvent } {
    if (command.type === 'create') { const run = withRealtime(createFmsRun(command.terrain, command.count, command.relations)); assertFmsRun(run); this.run = run; return { run, world: run.world }; }
    if (command.type === 'load') { assertFmsRun(command.run); this.run = structuredClone(command.run); return { run: this.run, world: this.run.world }; }
    if(command.type==='copy'){assertFmsRun(command.run);if(command.run.version===4)throw Error('本世界已是日内版，无需再次转换。');const run=withRealtime(command.run,true);assertFmsRun(run);this.run=run;return {run,world:run.world};}
    if (!this.run) throw new Error('请先创建或读取一个世界。');
    if(command.type==='military'&&this.run.version===1)throw Error('旧世界保留旧规则；请先创建新版推演副本。');
    if('expected' in command&&(command.expected.day!==this.run.world.day||command.expected.nextEventId!==this.run.world.nextEventId||(this.run.version===4&&command.expected.tick!==this.run.clock.tick)))throw Error('模拟时刻已变化，请重新预览命令。');
    // Frozen management actions accept exactly the original two fields.
    const expected={day:this.run.world.day,nextEventId:this.run.world.nextEventId};
    if(command.type==='tick'){
      if(this.run.version!==4||!Number.isInteger(command.ticks)||command.ticks<1||command.ticks>120||(command.pauseOnBattle!==undefined&&typeof command.pauseOnBattle!=='boolean'))throw Error('日内推进参数无效。');
      let candidate=this.run,halted:GameEvent|undefined;const graph=graphFor(candidate);
      for(let i=0;i<command.ticks;i++){const first=candidate.world.nextEventId;candidate=advanceRunTick(candidate,graph);if(command.pauseOnBattle){halted=candidate.world.events.find(e=>e.id>=first&&isClash(candidate.world,e));if(halted)break;}}
      assertRealtimeStep(this.run,candidate,graph);this.run=candidate;return {run:candidate,world:candidate.world,...(halted?{halted}:{})};
    }
    if(command.type==='naval'){if(this.run.version!==3&&this.run.version!==4)throw Error('请先创建日内版副本，原档保持原规则。');const run={...this.run,...navalRules(this.run).applyNaval(this.run.world,this.run.navy,graphFor(this.run),command.action,expected)};assertFmsRun(run);this.run=run;return {run,world:run.world};}
    if(command.type==='military'){const run=executeMilitary(this.run,command.action,expected);assertFmsRun(run);this.run=run;return {run,world:run.world};}
    const {applyStateAction,issueOrder,previewOrder,previewStateAction,validateWorld}=playRules(this.run);
    const current = this.run.world; let next: World, halted: GameEvent | undefined;
    if (command.type === 'step') {
      if (!Number.isInteger(command.days) || command.days < 1 || command.days > 7) throw new Error('推进天数无效。');
      if (command.pauseOnBattle !== undefined && typeof command.pauseOnBattle !== 'boolean') throw new Error('交战暂停选项无效。');
      let candidate=this.run;
      if(candidate.version===4){
        const graph=graphFor(candidate);
        for(let tick=0;tick<command.days*120;tick++){
          const first=candidate.world.nextEventId;candidate=advanceRunTick(candidate,graph);
          if(command.pauseOnBattle)halted=candidate.world.events.find(e=>e.id>=first&&isClash(candidate.world,e));
          if(halted)break;
        }
        assertFmsRun(candidate);this.run=candidate;return {run:candidate,world:candidate.world,...(halted?{halted}:{})};
      }
      for (let day = 0; day < command.days; day++) {
        const firstEvent = candidate.world.nextEventId; candidate=stepRunDay(candidate);assertFmsRun(candidate);
        if (command.pauseOnBattle) halted = candidate.world.events.find(e => e.id >= firstEvent && isClash(candidate.world,e));
        if (halted) break; // Complete this day, but never consume the next day of a speed batch.
      }
      this.run=candidate;return {run:candidate,world:candidate.world,...(halted?{halted}:{})};
    } else {
      if (command.expected.day !== current.day || command.expected.nextEventId !== current.nextEventId) throw new Error('世界已变化，请重新预览这条命令。');
      if (command.type === 'order') { const preview = previewOrder(current, command.order); if (!preview.valid) throw new Error(preview.reason); next = issueOrder(current, command.order); }
      else { const preview = previewStateAction(current, command.action); if (!preview.valid) throw new Error(preview.reason); next = applyStateAction(current, command.action, expected); }
    }
    if (!validateWorld(next)) throw new Error('推演状态校验失败，保留上一状态。');
    const run={ ...this.run, world: next };assertFmsRun(run);this.run = run; return { run:this.run, world: next, ...(halted ? { halted } : {}) };
  }
}
