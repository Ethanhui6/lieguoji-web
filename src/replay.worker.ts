import { verifyHistory, seekHistory } from './history/core';
import { ENGINE_FINGERPRINT } from './history/engine';
import type { HistoryLog } from './history/types';
import type { ReplayRequest, ReplayResponse } from './history/replay';

let history: HistoryLog | null = null;
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<ReplayRequest>) => {
  const request = event.data;
  queue = queue.then(async () => {
    try {
      if (request.type === 'init') {
        history = null;
        await verifyHistory(request.history, ENGINE_FINGERPRINT);
        history = structuredClone(request.history);
      }
      if (!history) throw new Error('历史尚未核验，不能回放。');
      const world = await seekHistory(history, request.seq, ENGINE_FINGERPRINT);
      self.postMessage({id: request.id, world, seq: request.seq} satisfies ReplayResponse);
    } catch (error) {
      self.postMessage({id: request.id, error: error instanceof Error ? error.message : '历史回放失败，原局保留。'} satisfies ReplayResponse);
    }
  });
};
