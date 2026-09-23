import { byteSize, createFixture, digestFixture } from './fixture';
import { appendScaleHistory, branchScaleHistory, createScaleHistory, seekScaleHistory, verifyScaleHistory } from './history';
import { measureFixture } from './measure';
import type { ScaleControl, ScaleFixture, ScaleHistory, ScaleState } from './types';
import type { ScaleReply, ScaleRequest, ScaleResult, ScaleSnapshot } from './protocol';

type Session = { live: ScaleFixture; viewed: ScaleFixture; history: ScaleHistory; sequence: number; readOnly: boolean; undoStates: ScaleState[] };
let committed: Session | undefined, controller: AbortController | undefined;
const send = (message: ScaleReply, transfer: Transferable[] = []) => self.postMessage(message, { transfer });
function buffers(value: unknown): ArrayBuffer[] {
  const found = new Set<ArrayBuffer>(), seen = new Set<object>();
  function visit(nested: unknown): void {
    if (!nested || typeof nested !== 'object' || seen.has(nested)) return;
    seen.add(nested);
    if (nested instanceof ArrayBuffer) found.add(nested);
    else if (ArrayBuffer.isView(nested) && nested.buffer instanceof ArrayBuffer) found.add(nested.buffer);
    else for (const child of Object.values(nested)) visit(child);
  }
  visit(value);
  return [...found];
}
const runId = () => `scale-${crypto.randomUUID()}`;
function requireCurrent(session = committed): Session {
  if (!session) throw new Error('请先生成或恢复独立规模原型。');
  return session;
}
function reportFailure(id: number, error: unknown, cancelled = false) {
  try { send({ id, kind: 'error', message: error instanceof Error ? error.message : String(error), cancelled }); }
  catch (sendError) {
    // If even the plain error reply cannot be sent, surface a worker error so
    // ScaleBridge terminates and rejects pending/future requests instead of hanging.
    setTimeout(() => { throw new Error('规模实验线程无法发送结果或错误。', { cause: sendError }); }, 0);
  }
}

self.onmessage = ({ data }: MessageEvent<ScaleRequest>) => {
  if (!data || typeof data !== 'object') return;
  if ('type' in data && data.type === 'cancel') { controller?.abort(); return; }
  if (!('id' in data) || !Number.isSafeInteger(data.id) || data.id < 1) return;
  if (!data.operation || typeof data.operation !== 'object' || !['clone', 'transfer'].includes(data.transport)) {
    reportFailure(data.id, new Error('实验请求结构或传输方式无效。')); return;
  }
  if (controller) { reportFailure(data.id, new Error('实验线程正在处理上一项操作。')); return; }
  const active = new AbortController(); controller = active;
  const control: ScaleControl = { signal: active.signal, yieldTask: () => new Promise(resolve => setTimeout(resolve, 0)), onProgress: progress => send({ id: data.id, kind: 'progress', progress }) };
  void (async () => {
    const start = performance.now(), operation = data.operation;
    let candidate = committed;
    let summary: string, snapshot: ScaleSnapshot | undefined, measurements: unknown;
    if (operation.type === 'generate') {
      const candidateFixture = await createFixture(operation.options, control), log = await createScaleHistory(candidateFixture, runId());
      active.signal.throwIfAborted();
      candidate = { live: candidateFixture, viewed: candidateFixture, history: log, sequence: 0, readOnly: false, undoStates: [] };
      summary = '联合结构原型已生成；后继社会规则尚未实现。';
    } else if (operation.type === 'load') {
      const raw = operation.snapshot;
      if (!raw || raw.format !== 'lieguoji-scale-experiment' || raw.version !== 1 || Object.keys(raw).some(key => !['format', 'version', 'history'].includes(key))) throw new Error('不支持的实验快照；当前原型保留。');
      if (operation.expectedHash !== undefined && !/^[a-f0-9]{64}$/.test(operation.expectedHash)) throw new Error('实验快照的预期hash无效。');
      const verified = await verifyScaleHistory(raw.history, control);
      if (operation.expectedHash !== undefined && verified.hash !== operation.expectedHash) throw new Error('实验快照与保存时摘要不符；当前原型保留。');
      active.signal.throwIfAborted(); candidate = { live: verified.fixture, viewed: verified.fixture, history: raw.history, sequence: raw.history.entries.length, readOnly: false, undoStates: [] };
      summary = '实验记录完整核验后恢复；未访问游戏存档。';
    } else {
      const current = requireCurrent(candidate);
      if (operation.type === 'edit' || operation.type === 'undo') {
        if (current.readOnly) throw new Error('结构回放只读；返回末态或创建独立实验分支。');
        if (operation.type === 'undo' && !current.undoStates.length) throw new Error('没有可撤销的结构事务。');
        const input = operation.type === 'edit' ? operation.input : { type: 'restore-state' as const, state: current.undoStates.at(-1)! };
        const result = await appendScaleHistory(current.history, current.live, input);
        active.signal.throwIfAborted();
        const undoStates = operation.type === 'edit' ? [...current.undoStates.slice(-63), result.undo.before] : current.undoStates.slice(0, -1);
        candidate = { live: result.fixture, viewed: result.fixture, history: result.history, sequence: result.history.entries.length, readOnly: false, undoStates }; summary = result.summary;
      } else if (operation.type === 'seek') {
        const viewed = await seekScaleHistory(current.history, operation.sequence, control);
        active.signal.throwIfAborted(); candidate = { ...current, viewed, sequence: operation.sequence, readOnly: true }; summary = '只读结构回放；原型末态保留。';
      } else if (operation.type === 'live') {
        candidate = { ...current, viewed: current.live, sequence: current.history.entries.length, readOnly: false }; summary = '已返回结构原型末态。';
      } else if (operation.type === 'branch') {
        const result = await branchScaleHistory(current.history, operation.sequence, runId(), control);
        active.signal.throwIfAborted(); candidate = { live: result.fixture, viewed: result.fixture, history: result.history, sequence: 0, readOnly: false, undoStates: [] }; summary = '已创建独立实验分支；源记录未改。';
      } else if (operation.type === 'snapshot') {
        if (operation.includeHistory) {
          if (current.readOnly) throw new Error('只读定位不能覆盖实验存档；先返回末态或分支。');
          snapshot = { format: 'lieguoji-scale-experiment', version: 1, history: current.history };
        }
        summary = '只读实验快照。';
      } else if (operation.type === 'measure') {
        measurements = await measureFixture(current.viewed, operation, control); summary = '联合结构测量完成；未推进完整游戏规则。';
      } else throw new Error('不支持的规模实验操作，当前原型保留。');
    }
    const current = requireCurrent(candidate), hash = await digestFixture(current.viewed);
    const result: Omit<ScaleResult, 'metrics'> = { fixture: current.viewed, runId: current.history.runId, sequence: current.sequence, historyLength: current.history.entries.length, readOnly: current.readOnly, hash, summary, ...(snapshot ? { snapshot } : {}), ...(measurements ? { measurements } : {}) };
    const workerMs = performance.now() - start, prepare = performance.now(), payloadBytes = byteSize(result);
    // Transfer a clone, never detach authoritative atlas/state buffers.
    const outgoing = data.transport === 'transfer' ? structuredClone(result) : result;
    const transfer = data.transport === 'transfer' ? buffers(outgoing) : [];
    const prepareMs = performance.now() - prepare;
    // The only commit point: all async/fallible preparation is finished. Both
    // clone and transfer postMessage serialize synchronously; a throw leaves the
    // old session intact. No message/cancellation can interleave this sync block.
    active.signal.throwIfAborted();
    send({ id: data.id, kind: 'result', result: outgoing, metrics: { workerMs, prepareMs, payloadBytes, transport: data.transport } }, transfer);
    committed = current;
  })().catch(error => reportFailure(data.id, error, active.signal.aborted)).finally(() => { if (controller === active) controller = undefined; });
};
