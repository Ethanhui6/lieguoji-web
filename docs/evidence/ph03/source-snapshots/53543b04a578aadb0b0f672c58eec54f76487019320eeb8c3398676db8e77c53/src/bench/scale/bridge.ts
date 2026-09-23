import type { ScaleOptions, ScaleProgress, ScaleTransaction } from './types';
import type { ScaleOperation, ScaleReply, ScaleRequest, ScaleResult, ScaleSnapshot } from './protocol';

/** Dedicated experimental worker. No game database, worker or save is reachable. */
export class ScaleBridge {
  private worker: Worker;
  private serial = 0;
  private fatal: Error | undefined;
  private pending = new Map<number, { start: number; resolve: (result: ScaleResult) => void; reject: (error: Error) => void }>();
  onProgress?: (progress: ScaleProgress) => void;
  constructor() {
    this.worker = new Worker(new URL('./scale.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }: MessageEvent<ScaleReply>) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      if (data.kind === 'progress') { this.onProgress?.(data.progress); return; }
      this.pending.delete(data.id);
      if (data.kind === 'error') { const error = new Error(data.message); if (data.cancelled) error.name = 'AbortError'; pending.reject(error); }
      else pending.resolve({ ...data.result, metrics: { ...data.metrics, roundTripMs: performance.now() - pending.start } });
    };
    this.worker.onerror = event => { this.fail(new Error(event.message || '规模实验线程失败，请刷新实验页后恢复。')); };
    this.worker.onmessageerror = () => this.fail(new Error('规模实验消息无法解码，请刷新实验页后恢复。'));
  }
  private rejectAll(error: Error) { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear(); }
  private fail(error: Error) {
    this.fatal ??= error;
    this.worker.terminate();
    this.rejectAll(this.fatal);
  }
  request(operation: ScaleOperation, transport: 'clone' | 'transfer' = 'transfer') {
    if (this.fatal) return Promise.reject(this.fatal);
    const id = ++this.serial;
    return new Promise<ScaleResult>((resolve, reject) => {
      this.pending.set(id, { start: performance.now(), resolve, reject });
      try { this.worker.postMessage({ id, operation, transport } satisfies ScaleRequest); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  generate(options: ScaleOptions) { return this.request({ type: 'generate', options }); }
  edit(input: ScaleTransaction) { return this.request({ type: 'edit', input }); }
  undo() { return this.request({ type: 'undo' }); }
  seek(sequence: number) { return this.request({ type: 'seek', sequence }); }
  live() { return this.request({ type: 'live' }); }
  branch(sequence: number) { return this.request({ type: 'branch', sequence }); }
  snapshot(includeHistory = false, transport: 'clone' | 'transfer' = 'transfer') { return this.request({ type: 'snapshot', includeHistory }, transport); }
  load(snapshot: ScaleSnapshot, expectedHash?: string) { return this.request({ type: 'load', snapshot, expectedHash }); }
  measure(options: { historyLengths?: number[]; querySamples?: number; transactionSamples?: number } = {}) { return this.request({ type: 'measure', ...options }); }
  cancel() {
    if (this.fatal) throw this.fatal;
    this.worker.postMessage({ type: 'cancel' } satisfies ScaleRequest);
  }
  close() { this.fail(new Error('规模实验线程已关闭。')); }
}
