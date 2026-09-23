import { createFixture, digestFixture, byteSize } from './fixture';
import { ENTITY_BUDGET_CASES, ENTITY_BUDGET_OPTIONS, createEntityBudgetComponent, digestEntityBudgetComponent, measureEntityBudgetsForSource } from './entity-budget';
import type { EntityBudgetCaseId } from './entity-budget';
import type { EntityBudgetReply, EntityBudgetRequest, EntityBudgetWorkerTiming } from './entity-budget-bridge';
import type { ScaleControl, ScaleFixture } from './types';

// A dedicated temporary experiment. It never receives a production fixture,
// opens IndexedDB, or shares ownership of another simulation's buffers.
let source: ScaleFixture | undefined, sourceHash: string | undefined;
let active: AbortController | undefined, initialized = false, finished = false;
let caseHashes = new Map<EntityBudgetCaseId, string>();
const send = (reply: EntityBudgetReply, transfer: Transferable[] = []) => self.postMessage(reply, { transfer });
function transferBuffers(value: unknown) {
  const buffers = new Set<ArrayBuffer>(), visited = new Set<object>();
  const visit = (current: unknown) => {
    if (!current || typeof current !== 'object' || visited.has(current)) return;
    visited.add(current);
    if (current instanceof ArrayBuffer) buffers.add(current);
    else if (ArrayBuffer.isView(current) && current.buffer instanceof ArrayBuffer) buffers.add(current.buffer);
    else for (const nested of Object.values(current)) visit(nested);
  };
  visit(value); return [...buffers];
}
function failure(id: number, error: unknown, cancelled = false) {
  try { send({ id, kind: 'error', message: error instanceof Error ? error.message : String(error), cancelled }); }
  catch (cause) { setTimeout(() => { throw new Error('实体预算线程无法发送结果或错误。', { cause }); }, 0); }
}
function requireSource() {
  if (!source || !sourceHash || !initialized || finished) throw new Error('实体预算标准源尚未初始化或会话已结束。');
  return { source, sourceHash };
}

self.onmessage = ({ data }: MessageEvent<EntityBudgetRequest>) => {
  if (!data || typeof data !== 'object') return;
  if (data.operation === 'cancel') { active?.abort(); return; }
  if (!('id' in data) || !Number.isSafeInteger(data.id) || data.id < 1) return;
  if (active) { failure(data.id, new Error('实体预算线程正在处理上一项请求。')); return; }
  const controller = new AbortController(); active = controller;
  const control: ScaleControl = { signal: controller.signal, yieldTask: () => new Promise(resolve => setTimeout(resolve, 0)), onProgress: progress => send({ id: data.id, kind: 'progress', progress }) };
  void (async () => {
    if (data.operation === 'initialize') {
      if (initialized || finished) throw new Error('实体预算标准源只允许创建和测量一次。');
      const createStart = performance.now();
      const candidate = await createFixture({ ...ENTITY_BUDGET_OPTIONS }, control);
      const sourceCreateMs = performance.now() - createStart, digestStart = performance.now();
      const candidateHash = await digestFixture(candidate), sourceDigestMs = performance.now() - digestStart;
      controller.signal.throwIfAborted();
      const measureStart = performance.now(), report = await measureEntityBudgetsForSource(candidate, control), measureMs = performance.now() - measureStart;
      if (await digestFixture(candidate) !== candidateHash) throw new Error('实体预算核测量改变了标准源。');
      controller.signal.throwIfAborted();
      const hashes = new Map(report.cases.map(item => [item.caseId, item.completeHash]));
      if (hashes.size !== 9 || !ENTITY_BUDGET_CASES.every(id => hashes.has(id)) || report.sourceHashBefore !== candidateHash || report.sourceHashAfter !== candidateHash) throw new Error('实体预算核报告缺少标准源的九组完整摘要。');
      send({ id: data.id, kind: 'ready', cases: [...ENTITY_BUDGET_CASES], report, sourceHash: candidateHash, sourceOptions: candidate.options, sourceCreateMs, sourceDigestMs, measureMs });
      source = candidate; sourceHash = candidateHash; caseHashes = hashes; initialized = true;
    } else if (data.operation === 'sample') {
      const current = requireSource();
      if (!['clone', 'transfer'].includes(data.transport) || !Number.isSafeInteger(data.sample) || data.sample < 1 || data.sample > 3 || !ENTITY_BUDGET_CASES.includes(data.caseId)) throw new Error('实体预算传输 case、采样序号或方式无效。');
      const started = performance.now();
      const payload = createEntityBudgetComponent(current.source, data.caseId);
      const createMs = performance.now() - started, digestStart = performance.now();
      const workerHash = await digestEntityBudgetComponent(payload), digestMs = performance.now() - digestStart;
      if (workerHash !== caseHashes.get(data.caseId)) throw new Error('重新生成的实体预算组件与初次完整摘要不一致。');
      controller.signal.throwIfAborted();
      const workerMs = performance.now() - started, prepareStart = performance.now();
      const payloadBytes = byteSize(payload);
      // Never detach a typed array which may share storage with the fixed source.
      const outgoing = data.transport === 'transfer' ? structuredClone(payload) : payload;
      const transfer = data.transport === 'transfer' ? transferBuffers(outgoing) : [];
      const metrics: EntityBudgetWorkerTiming = { workerMs, createMs, digestMs, prepareMs: performance.now() - prepareStart, payloadBytes, transferredBuffers: transfer.length };
      controller.signal.throwIfAborted();
      send({ id: data.id, kind: 'sample', caseId: data.caseId, sample: data.sample, transport: data.transport, sourceHash: current.sourceHash, workerHash, payload: outgoing, metrics }, transfer);
    } else if (data.operation === 'finish') {
      const current = requireSource(), start = performance.now();
      const sourceHashAfter = await digestFixture(current.source);
      const sourceVerificationMs = performance.now() - start;
      if (sourceHashAfter !== current.sourceHash) throw new Error('实体预算组件生成或传输改变了标准源。');
      controller.signal.throwIfAborted();
      send({ id: data.id, kind: 'finished', sourceHash: current.sourceHash, sourceHashAfter, sourceVerificationMs });
      finished = true; source = undefined;
    } else throw new Error('实体预算请求操作未知。');
  })().catch(error => failure(data.id, error, controller.signal.aborted)).finally(() => { if (active === controller) active = undefined; });
};
