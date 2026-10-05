import { advanceWorld, applyStateAction, issueOrder, previewOrder, previewStateAction, validateWorld } from '../../sim/core';
import type { GameEvent, Order, StateAction, StateVersion, World } from '../../sim/types';
import { assertFmsRun, createFmsRun, type FmsRun } from './world';
import type { FmsDocument } from '../model';
import { isClash } from './observation';
export type PlayCommand = { type: 'create'; terrain: FmsDocument; count: number; relations: 'peace' | 'war' } | { type: 'load'; run: FmsRun } | { type: 'step'; days: number; pauseOnBattle?: boolean } | { type: 'order'; order: Order; expected: StateVersion } | { type: 'action'; action: StateAction; expected: StateVersion };
export class PlaySession {
  private run?: FmsRun;
  execute(command: PlayCommand): { world: World; run?: FmsRun; halted?: GameEvent } {
    if (command.type === 'create') { const run = createFmsRun(command.terrain, command.count, command.relations); this.run = run; return { run, world: run.world }; }
    if (command.type === 'load') { assertFmsRun(command.run); this.run = structuredClone(command.run); return { run: this.run, world: this.run.world }; }
    if (!this.run) throw new Error('请先创建或读取一个世界。');
    const current = this.run.world; let next: World, halted: GameEvent | undefined;
    if (command.type === 'step') {
      if (!Number.isInteger(command.days) || command.days < 1 || command.days > 7) throw new Error('推进天数无效。');
      if (command.pauseOnBattle !== undefined && typeof command.pauseOnBattle !== 'boolean') throw new Error('交战暂停选项无效。');
      next = current;
      for (let day = 0; day < command.days; day++) {
        const firstEvent = next.nextEventId; next = advanceWorld(next, 1);
        if (command.pauseOnBattle) halted = next.events.find(e => e.id >= firstEvent && isClash(next,e));
        if (halted) break; // Complete this day, but never consume the next day of a speed batch.
      }
    } else {
      if (command.expected.day !== current.day || command.expected.nextEventId !== current.nextEventId) throw new Error('世界已变化，请重新预览这条命令。');
      if (command.type === 'order') { const preview = previewOrder(current, command.order); if (!preview.valid) throw new Error(preview.reason); next = issueOrder(current, command.order); }
      else { const preview = previewStateAction(current, command.action); if (!preview.valid) throw new Error(preview.reason); next = applyStateAction(current, command.action, command.expected); }
    }
    if (!validateWorld(next)) throw new Error('推演状态校验失败，保留上一状态。');
    this.run = { ...this.run, world: next }; return { world: next, ...(halted ? { halted } : {}) };
  }
}
