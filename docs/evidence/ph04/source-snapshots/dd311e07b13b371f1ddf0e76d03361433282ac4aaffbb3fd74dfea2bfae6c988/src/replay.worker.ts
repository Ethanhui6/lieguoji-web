import { resolveHistoryEngine, type EngineFacade } from './engine/registry';
import type { HistoryLog } from './history/types';
import type { ReplayRequest, ReplayResponse } from './history/replay';

let history: HistoryLog | null = null;
let engine: EngineFacade | undefined;
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<ReplayRequest>) => {
  const request = event.data;
  queue = queue.then(async () => {
    try {
      if (request.type === 'init') {
        history = null;
        engine = undefined;
        const selected = resolveHistoryEngine(request.history);
        if (!selected) throw new Error('当前版本无法验证此历史的规则，原记录保留，可导出但不能回放。');
        await selected.verifyHistory(request.history);
        history = structuredClone(request.history);
        engine = selected;
      }
      if (!history || !engine) throw new Error('历史尚未核验，不能回放。');
      const world = await engine.seekHistory(history, request.seq);
      self.postMessage({id: request.id, world, seq: request.seq} satisfies ReplayResponse);
    } catch (error) {
      self.postMessage({id: request.id, error: error instanceof Error ? error.message : '历史回放失败，原局保留。'} satisfies ReplayResponse);
    }
  });
};
