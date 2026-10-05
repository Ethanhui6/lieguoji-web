import { playRules, withNavy, executeMilitary, stepRunDay } from './runtime';
import { applyNaval, type NavalAction } from './navy';
import { seaGraph } from './sea-path';
import type { MilitaryAction } from './military-actions';
import type { GameEvent, Order, StateAction, StateVersion, World } from '../../sim/types';
import { assertFmsRun, createFmsRun, type FmsRun } from './world';
import type { FmsDocument } from '../model';
import { isClash } from './observation';
export type PlayCommand = {type:'naval';action:NavalAction;expected:StateVersion} | {type:'copy';run:FmsRun} | {type:'military';action:MilitaryAction;expected:StateVersion} | { type: 'create'; terrain: FmsDocument; count: number; relations: 'peace' | 'war' } | { type: 'load'; run: FmsRun } | { type: 'step'; days: number; pauseOnBattle?: boolean } | { type: 'order'; order: Order; expected: StateVersion } | { type: 'action'; action: StateAction; expected: StateVersion };
export class PlaySession {
  private run?: FmsRun;
  execute(command: PlayCommand): { world: World; run?: FmsRun; halted?: GameEvent } {
    if (command.type === 'create') { const run = withNavy(createFmsRun(command.terrain, command.count, command.relations)); assertFmsRun(run); this.run = run; return { run, world: run.world }; }
    if (command.type === 'load') { assertFmsRun(command.run); this.run = structuredClone(command.run); return { run: this.run, world: this.run.world }; }
    if(command.type==='copy'){assertFmsRun(command.run);if(command.run.version===3)throw Error('本世界已是海军版，无需再次转换。');const run=withNavy(command.run,true);assertFmsRun(run);this.run=run;return {run,world:run.world};}
    if (!this.run) throw new Error('请先创建或读取一个世界。');
    if(command.type==='naval'){if(this.run.version!==3)throw Error('请先创建海军版副本，原档保持原规则。');const run={...this.run,...applyNaval(this.run.world,this.run.navy,seaGraph(this.run.terrain,this.run.world),command.action,command.expected)};assertFmsRun(run);this.run=run;return {run,world:run.world};}
    if(command.type==='military'){const run=executeMilitary(this.run,command.action,command.expected);assertFmsRun(run);this.run=run;return {run,world:run.world};}
    const {applyStateAction,issueOrder,previewOrder,previewStateAction,validateWorld}=playRules(this.run);
    const current = this.run.world; let next: World, halted: GameEvent | undefined;
    if (command.type === 'step') {
      if (!Number.isInteger(command.days) || command.days < 1 || command.days > 7) throw new Error('推进天数无效。');
      if (command.pauseOnBattle !== undefined && typeof command.pauseOnBattle !== 'boolean') throw new Error('交战暂停选项无效。');
      let candidate=this.run;
      for (let day = 0; day < command.days; day++) {
        const firstEvent = candidate.world.nextEventId; candidate=stepRunDay(candidate);assertFmsRun(candidate);
        if (command.pauseOnBattle) halted = candidate.world.events.find(e => e.id >= firstEvent && isClash(candidate.world,e));
        if (halted) break; // Complete this day, but never consume the next day of a speed batch.
      }
      this.run=candidate;return {run:candidate,world:candidate.world,...(halted?{halted}:{})};
    } else {
      if (command.expected.day !== current.day || command.expected.nextEventId !== current.nextEventId) throw new Error('世界已变化，请重新预览这条命令。');
      if (command.type === 'order') { const preview = previewOrder(current, command.order); if (!preview.valid) throw new Error(preview.reason); next = issueOrder(current, command.order); }
      else { const preview = previewStateAction(current, command.action); if (!preview.valid) throw new Error(preview.reason); next = applyStateAction(current, command.action, command.expected); }
    }
    if (!validateWorld(next)) throw new Error('推演状态校验失败，保留上一状态。');
    const run={ ...this.run, world: next };assertFmsRun(run);this.run = run; return { run:this.run, world: next, ...(halted ? { halted } : {}) };
  }
}
