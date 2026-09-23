import type { World } from '../sim/types';
import type { HistoryLog } from './types';

export type ReplayRequest = { id: number; type: 'init'; history: HistoryLog; seq: number } | { id: number; type: 'seek'; seq: number };
export type ReplayResponse = { id: number; seq?: number; world?: World; error?: string };

/** A dedicated worker owns each replay session; it never receives a persistence API. */
export class ReplaySession {
  private worker: Worker;
  private next = 0;
  private closed = false;
  private pending = new Map<number, { resolve: (value: { world: World; seq: number }) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor() {
    this.worker = new Worker(new URL('../replay.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<ReplayResponse>) => {
      const item = this.pending.get(event.data.id);
      if (!item) return;
      clearTimeout(item.timer); this.pending.delete(event.data.id);
      if (event.data.error || !event.data.world || event.data.seq === undefined) item.reject(new Error(event.data.error ?? '历史线程返回无效状态'));
      else item.resolve({ world: event.data.world, seq: event.data.seq });
    };
    this.worker.onerror = () => this.close('历史线程启动失败，原局已保留。');
  }
  private request(message: Omit<Extract<ReplayRequest, {type: 'init'}>, 'id'> | Omit<Extract<ReplayRequest, {type: 'seek'}>, 'id'>) {
    return new Promise<{world: World; seq: number}>((resolve, reject) => {
      if(this.closed){reject(new Error('历史线程已关闭，请退出后重新打开回放。'));return;}
      const id = ++this.next;
      const timer = setTimeout(() => this.close('历史核验超时，原局未修改。'), 60000);
      this.pending.set(id, {resolve, reject, timer}); this.worker.postMessage({...message, id});
    });
  }
  init(history: HistoryLog, seq = history.entries.length) { return this.request({type: 'init', history, seq}); }
  seek(seq: number) { return this.request({type: 'seek', seq}); }
  close(message = '历史查看已关闭') {
    this.closed = true;
    this.worker.terminate();
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error(message)); }
    this.pending.clear();
  }
}
