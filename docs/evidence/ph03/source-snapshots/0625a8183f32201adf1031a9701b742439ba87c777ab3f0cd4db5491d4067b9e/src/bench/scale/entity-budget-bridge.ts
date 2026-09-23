import { ENTITY_BUDGET_CASES, ENTITY_BUDGET_OPTIONS, digestEntityBudgetComponent, validateEntityBudgetComponent } from './entity-budget';
import type { EntityBudgetCaseId, EntityBudgetComponent, EntityBudgetReport } from './entity-budget';
import type { ScaleControl, ScaleOptions, ScaleProgress } from './types';

type Transport = 'clone' | 'transfer';
export type EntityBudgetRequest =
  | { id: number; operation: 'initialize' }
  | { id: number; operation: 'sample'; caseId: EntityBudgetCaseId; sample: number; transport: Transport }
  | { id: number; operation: 'finish' }
  | { operation: 'cancel' };
export type EntityBudgetWorkerTiming = { workerMs: number; createMs: number; digestMs: number; prepareMs: number; payloadBytes: number; transferredBuffers: number };
export type EntityBudgetReply =
  | { id: number; kind: 'progress'; progress: ScaleProgress }
  | { id: number; kind: 'error'; message: string; cancelled: boolean }
  | { id: number; kind: 'ready'; cases: EntityBudgetCaseId[]; report: EntityBudgetReport; sourceHash: string; sourceOptions: ScaleOptions; sourceCreateMs: number; sourceDigestMs: number; measureMs: number }
  | { id: number; kind: 'sample'; caseId: EntityBudgetCaseId; sample: number; transport: Transport; sourceHash: string; workerHash: string; payload: EntityBudgetComponent; metrics: EntityBudgetWorkerTiming }
  | { id: number; kind: 'finished'; sourceHash: string; sourceHashAfter: string; sourceVerificationMs: number };

export type EntityBudgetTransportMeasurement = EntityBudgetWorkerTiming & {
  caseId: EntityBudgetCaseId; sample: number; transport: Transport; roundTripMs: number;
  validationMs: number; receiverDigestMs: number; workerHash: string; mainHash: string;
};
type Ready = Extract<EntityBudgetReply, { kind: 'ready' }> & { roundTripMs: number };
type Finished = Extract<EntityBudgetReply, { kind: 'finished' }> & { roundTripMs: number };
type VerifiedReply = Ready | Finished | { kind: 'sample'; measurement: EntityBudgetTransportMeasurement };
type Pending = {
  request: Exclude<EntityBudgetRequest, { operation: 'cancel' }>; start: number; timer: ReturnType<typeof setTimeout>;
  resolving: boolean; resolve: (value: VerifiedReply) => void; reject: (error: Error) => void;
};
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const asError = (error: unknown) => error instanceof Error ? error : new Error(String(error));
const abortError = () => new DOMException('实体预算测量已取消；专用线程已释放。', 'AbortError');

/** One independent measurement session. No ScaleResult, game Worker or database. */
export class EntityBudgetBridge {
  private worker: Worker;
  private fatal?: Error;
  private pending?: Pending;
  private serial = 0;
  private running = false;
  private used = false;
  private sourceHash?: string;
  private caseHashes = new Map<EntityBudgetCaseId, string>();
  private onProgress?: ScaleControl['onProgress'];
  private requestTimeoutMs: number;
  private totalTimeoutMs: number;
  private terminated: Promise<never>;
  private rejectTermination!: (error: Error) => void;
  constructor(options: { requestTimeoutMs?: number; totalTimeoutMs?: number } = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 180_000;
    this.totalTimeoutMs = options.totalTimeoutMs ?? 900_000;
    if (![this.requestTimeoutMs, this.totalTimeoutMs].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 900_000)) throw new Error('实体预算测量超时必须在 1–900000 ms 内。');
    this.terminated = new Promise((_resolve, reject) => { this.rejectTermination = reject; });
    void this.terminated.catch(() => { /* Handled again by any active yield race. */ });
    this.worker = new Worker(new URL('./entity-budget.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = event => {
      // Capture transport arrival before any payload validation or hashing.
      const arrival = performance.now();
      void this.receive(event.data as EntityBudgetReply, arrival).catch(error => this.fail(asError(error)));
    };
    this.worker.onerror = event => this.fail(new Error(event.message || '实体预算线程执行失败。'));
    this.worker.onmessageerror = () => this.fail(new Error('实体预算线程消息无法解码。'));
  }
  private fail(error: Error) {
    if (this.fatal) return;
    this.fatal = error;
    this.worker.terminate();
    this.rejectTermination(error);
    const pending = this.pending;
    this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.reject(error); }
  }
  close() { this.fail(new Error('实体预算专用线程已关闭。')); }
  cancel() {
    if (this.fatal) return;
    try { this.worker.postMessage({ operation: 'cancel' } satisfies EntityBudgetRequest); }
    catch { /* Termination below also handles a broken message channel. */ }
    finally { this.fail(abortError()); }
  }
  private assertOpen() { if (this.fatal) throw this.fatal; }
  private request(operation: Omit<Extract<EntityBudgetRequest, { operation: 'initialize' }>, 'id'> | Omit<Extract<EntityBudgetRequest, { operation: 'sample' }>, 'id'> | Omit<Extract<EntityBudgetRequest, { operation: 'finish' }>, 'id'>): Promise<VerifiedReply> {
    this.assertOpen();
    if (this.pending) return Promise.reject(new Error('实体预算线程已有请求执行中。'));
    const request = { ...operation, id: ++this.serial } as Exclude<EntityBudgetRequest, { operation: 'cancel' }>;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`实体预算请求超时（${this.requestTimeoutMs} ms）：${operation.operation}。`)), this.requestTimeoutMs);
      this.pending = { request, start: performance.now(), timer, resolving: false, resolve, reject };
      try { this.worker.postMessage(request); }
      catch (error) { this.fail(asError(error)); }
    });
  }
  private async receive(reply: EntityBudgetReply, arrival: number) {
    if (this.fatal) return;
    const pending = this.pending;
    if (!pending || reply?.id !== pending.request.id) return;
    if (reply.kind === 'progress') { this.onProgress?.(reply.progress); return; }
    if (pending.resolving) throw new Error('实体预算线程重复回复同一请求。');
    pending.resolving = true;
    const roundTripMs = arrival - pending.start;
    if (reply.kind === 'error') {
      const error = new Error(reply.message); if (reply.cancelled) error.name = 'AbortError';
      throw error;
    }
    let value: VerifiedReply;
    if (pending.request.operation === 'initialize' && reply.kind === 'ready') {
      if (!hash(reply.sourceHash) || !Array.isArray(reply.cases) || reply.cases.length !== 9 || new Set(reply.cases).size !== 9 || !reply.cases.every(item => ENTITY_BUDGET_CASES.includes(item))) throw new Error('实体预算初始摘要或九组对照不完整。');
      if (!reply.sourceOptions || !Object.entries(ENTITY_BUDGET_OPTIONS).every(([key, expected]) => reply.sourceOptions[key as keyof ScaleOptions] === expected) || reply.report?.format !== 'lieguoji-entity-budget-measurement' || reply.report.version !== 1 || reply.report.sourceHashBefore !== reply.sourceHash || reply.report.sourceHashAfter !== reply.sourceHash || !Array.isArray(reply.report.cases) || reply.report.cases.length !== 9) throw new Error('实体预算核报告没有绑定实际标准源。');
      this.caseHashes = new Map(reply.report.cases.map(item => [item.caseId, item.completeHash]));
      if (this.caseHashes.size !== 9 || !reply.cases.every(id => hash(this.caseHashes.get(id)))) throw new Error('实体预算核报告缺少完整组件摘要。');
      this.sourceHash = reply.sourceHash;
      value = { ...reply, roundTripMs };
    } else if (pending.request.operation === 'sample' && reply.kind === 'sample') {
      if (reply.caseId !== pending.request.caseId || reply.sample !== pending.request.sample || reply.transport !== pending.request.transport || reply.sourceHash !== this.sourceHash || !hash(reply.workerHash)) throw new Error('实体预算回复与请求或源摘要不匹配。');
      const validationStart = performance.now();
      if (!validateEntityBudgetComponent(reply.payload)) throw new Error('收到无效实体预算组件，拒绝测量结果。');
      if (reply.payload.caseId !== reply.caseId || !Object.entries(ENTITY_BUDGET_OPTIONS).every(([key, expected]) => reply.payload.source[key as keyof ScaleOptions] === expected)) throw new Error('实体预算组件内容与请求对照不匹配。');
      const validationMs = performance.now() - validationStart, digestStart = performance.now();
      const mainHash = await digestEntityBudgetComponent(reply.payload);
      const receiverDigestMs = performance.now() - digestStart;
      this.assertOpen();
      if (mainHash !== reply.workerHash || mainHash !== this.caseHashes.get(reply.caseId)) throw new Error('实体预算主线程、Worker 与初始组件完整摘要不一致。');
      if (!reply.metrics || !['workerMs', 'createMs', 'digestMs', 'prepareMs', 'payloadBytes', 'transferredBuffers'].every(key => { const value = reply.metrics[key as keyof EntityBudgetWorkerTiming]; return Number.isFinite(value) && value >= 0; }) || (reply.transport === 'clone' ? reply.metrics.transferredBuffers !== 0 : reply.metrics.transferredBuffers < 1)) throw new Error('实体预算传输计时或载荷统计无效。');
      value = { kind: 'sample', measurement: { ...reply.metrics, caseId: reply.caseId, sample: reply.sample, transport: reply.transport, roundTripMs, validationMs, receiverDigestMs, workerHash: reply.workerHash, mainHash } };
      // Deliberately do not retain or return the component payload.
    } else if (pending.request.operation === 'finish' && reply.kind === 'finished') {
      if (reply.sourceHash !== this.sourceHash || reply.sourceHashAfter !== this.sourceHash) throw new Error('实体预算传输改变了标准源数据。');
      value = { ...reply, roundTripMs };
    } else throw new Error('实体预算回复类型与当前请求不一致。');
    this.assertOpen();
    clearTimeout(pending.timer); this.pending = undefined; pending.resolve(value);
  }
  async measure(control: ScaleControl = {}) {
    this.assertOpen();
    if (this.running || this.used) throw new Error('此实体预算线程只运行一次；下一次测量需创建新实例。');
    this.running = true; this.used = true; this.onProgress = control.onProgress;
    const abort = () => this.cancel(), started = performance.now();
    const totalTimer = setTimeout(() => this.fail(new Error(`实体预算测量总时限 ${this.totalTimeoutMs} ms 已到；线程已释放。`)), this.totalTimeoutMs);
    control.signal?.addEventListener('abort', abort, { once: true });
    try {
      if (control.signal?.aborted) this.cancel();
      this.assertOpen();
      const ready = await this.request({ operation: 'initialize' });
      if (ready.kind !== 'ready') throw new Error('实体预算线程没有完成初始化。');
      const samples: EntityBudgetTransportMeasurement[] = [];
      for (const caseId of ready.cases) for (let sample = 1; sample <= 3; sample++) for (const transport of ['clone', 'transfer'] as const) {
        this.assertOpen(); control.signal?.throwIfAborted();
        this.onProgress?.({ stage: `实体预算传输 ${caseId} / ${transport}`, completed: samples.length, total: 54 });
        const received = await this.request({ operation: 'sample', caseId, sample, transport });
        if (received.kind !== 'sample') throw new Error('实体预算传输未返回独立测量。');
        samples.push(received.measurement);
        if (control.yieldTask) await Promise.race([control.yieldTask(), this.terminated]);
      }
      const final = await this.request({ operation: 'finish' });
      if (final.kind !== 'finished') throw new Error('实体预算源数据末次验证未完成。');
      this.onProgress?.({ stage: '实体预算传输完成', completed: samples.length, total: 54 });
      this.assertOpen();
      return {
        format: 'lieguoji-entity-budget-worker-measurement' as const, version: 1 as const,
        sourceOptions: ready.sourceOptions, sourceHash: ready.sourceHash, sourceHashAfter: final.sourceHashAfter,
        cases: ready.cases, measurements: ready.report, transportSamples: samples,
        initialization: { sourceCreateMs: ready.sourceCreateMs, sourceDigestMs: ready.sourceDigestMs, measureMs: ready.measureMs, roundTripMs: ready.roundTripMs },
        finalVerification: { sourceVerificationMs: final.sourceVerificationMs, roundTripMs: final.roundTripMs },
        elapsedMs: performance.now() - started,
        timingBoundary: 'roundTripMs ends at main-thread message arrival, before receiver validation/digest; prepareMs excludes synchronous postMessage serialization, which is included in roundTripMs.',
        limitations: ['独立结构组件单变量对照，不是未来完整社会推演。', 'transfer 先复制组件再转移去重缓冲区，不是源数据零拷贝。', 'payloadBytes 是逻辑序列化量，不是 Worker/GPU 峰值或物理磁盘占用。', '没有剔除预热、慢样本或失败；任何摘要/线程/超时错误都拒绝整次测量。'],
      };
    } catch (error) { this.fail(asError(error)); throw this.fatal ?? error; }
    finally { clearTimeout(totalTimer); control.signal?.removeEventListener('abort', abort); this.running = false; this.onProgress = undefined; this.close(); }
  }
}

export async function runEntityBudgetMeasurement(control: ScaleControl = {}) {
  control.signal?.throwIfAborted();
  const bridge = new EntityBudgetBridge();
  return bridge.measure(control);
}
