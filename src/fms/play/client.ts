import type { World } from '../../sim/types';
import type { FmsRun } from './world';
import type { PlayCommand } from './session';
type Result = { world: World; run?: FmsRun };
export class PlayClient {
  private worker = new Worker(new URL('./play.worker.ts', import.meta.url), { type: 'module' });
  private id = 0;
  private pending = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private closed = false;
  constructor() {
    this.worker.onmessage = (e: MessageEvent<Result & { id: number; error?: string }>) => { const p = this.pending.get(e.data.id); if (!p) return; this.pending.delete(e.data.id); clearTimeout(p.timer); if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data); };
    this.worker.onerror = () => this.close('模拟线程无法继续，已暂停。');
  }
  send(command: PlayCommand): Promise<Result> {
    if (this.closed) return Promise.reject(new Error('模拟线程已关闭，请退出后重新进入。'));
    return new Promise((resolve, reject) => { const id = ++this.id, timer = setTimeout(() => this.close('模拟线程超时，已停止，未继续推进。'), 30000); this.pending.set(id, { resolve, reject, timer }); this.worker.postMessage({ id, command }); });
  }
  close(message = '已退出当前推演。') { this.closed = true; this.worker.terminate(); for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); } this.pending.clear(); }
}
