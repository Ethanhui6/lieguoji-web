import { digestFixture, scaleYield, validateFixture, validateState } from './fixture';
import { applyTransaction } from './kernels';
import type { ScaleControl, ScaleFixture, ScaleHistory, ScaleTransaction, ScaleTransactionResult } from './types';

export const SCALE_HISTORY_LIMIT = 2048;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const runId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,95}$/.test(value);

/** Structural validation only; verifyScaleHistory also replays and checks every hash. */
export function validateScaleHistory(raw: unknown): raw is ScaleHistory {
  try {
    if (!raw || typeof raw !== 'object') return false;
    const h = raw as ScaleHistory;
    if (h.format !== 'lieguoji-scale-history' || h.version !== 1 || !runId(h.runId) || h.checkpointEvery !== 32 || !hash(h.initialHash) || !validateFixture(h.initial) || !Array.isArray(h.entries) || h.entries.length > SCALE_HISTORY_LIMIT || !Array.isArray(h.checkpoints) || h.checkpoints.length !== Math.floor(h.entries.length / 32)) return false;
    if (h.parent !== null && (!h.parent || !runId(h.parent.runId) || h.parent.runId === h.runId || !Number.isSafeInteger(h.parent.seq) || h.parent.seq < 0 || h.parent.seq > SCALE_HISTORY_LIMIT || !hash(h.parent.hash) || h.parent.hash !== h.initialHash)) return false;
    let previousHash = h.initialHash;
    for (let index = 0; index < h.entries.length; index++) { const entry = h.entries[index]; if (!entry || entry.seq !== index + 1 || !hash(entry.beforeHash) || !hash(entry.afterHash) || entry.beforeHash !== previousHash || !entry.input || typeof entry.input !== 'object') return false; previousHash = entry.afterHash; }
    for (let index = 0; index < h.checkpoints.length; index++) { const checkpoint = h.checkpoints[index]; if (!checkpoint || checkpoint.seq !== (index + 1) * 32 || checkpoint.hash !== h.entries[checkpoint.seq - 1].afterHash || !validateState(checkpoint.state, h.initial) || checkpoint.state.revision !== h.initial.state.revision + checkpoint.seq) return false; }
    return true;
  } catch { return false; }
}
function assertHistory(history: ScaleHistory) { if (!validateScaleHistory(history)) throw new Error('结构记录格式、引用或链条无效，原记录保持不变。'); }

export async function createScaleHistory(fixture: ScaleFixture, id: string, parent: ScaleHistory['parent'] = null): Promise<ScaleHistory> {
  if (!runId(id)) throw new Error('实验记录标识无效。');
  const initial = structuredClone(fixture), initialHash = await digestFixture(initial);
  const history: ScaleHistory = { format: 'lieguoji-scale-history', version: 1, runId: id, parent: structuredClone(parent), initial, initialHash, checkpointEvery: 32, entries: [], checkpoints: [] };
  assertHistory(history); return history;
}

export async function appendScaleHistory(history: ScaleHistory, current: ScaleFixture, input: ScaleTransaction): Promise<ScaleTransactionResult & { history: ScaleHistory }> {
  assertHistory(history);
  if (history.entries.length >= SCALE_HISTORY_LIMIT) throw new Error('结构实验记录已达 2048 条上限，原记录保持不变。');
  const beforeHash = await digestFixture(current), expected = history.entries.at(-1)?.afterHash ?? history.initialHash;
  if (beforeHash !== expected) throw new Error('当前结构状态与记录末尾不一致，拒绝覆盖源记录。');
  const command = structuredClone(input), result = applyTransaction(current, command), afterHash = await digestFixture(result.fixture), seq = history.entries.length + 1;
  const next: ScaleHistory = { ...history, entries: [...history.entries, { seq, input: command, beforeHash, afterHash }], checkpoints: seq % 32 === 0 ? [...history.checkpoints, { seq, state: structuredClone(result.fixture.state), hash: afterHash }] : history.checkpoints };
  return { ...result, history: next };
}

async function initialVerified(history: ScaleHistory) {
  assertHistory(history);
  if (await digestFixture(history.initial) !== history.initialHash) throw new Error('结构记录初态校验失败，原记录保持不变。');
}
async function replayRange(history: ScaleHistory, initial: ScaleFixture, from: number, to: number, control?: ScaleControl) {
  let fixture = initial;
  for (let index = from; index < to; index++) {
    const entry = history.entries[index];
    if (await digestFixture(fixture) !== entry.beforeHash) throw new Error(`结构记录 ${entry.seq} 的前态不一致。`);
    fixture = applyTransaction(fixture, entry.input).fixture;
    if (await digestFixture(fixture) !== entry.afterHash) throw new Error(`结构记录 ${entry.seq} 的重算结果不一致。`);
    if ((index - from) % 8 === 0) await scaleYield(control, '结构记录重算', index + 1, to);
  }
  return fixture;
}

/** Validates initial + selected checkpoint + the selected suffix; full audit uses verify. */
export async function seekScaleHistory(history: ScaleHistory, seq: number, control?: ScaleControl): Promise<ScaleFixture> {
  await initialVerified(history);
  if (!Number.isSafeInteger(seq) || seq < 0 || seq > history.entries.length) throw new Error('结构记录定位序号无效。');
  await scaleYield(control, '定位结构记录', 0, seq);
  const checkpoint = [...history.checkpoints].reverse().find(item => item.seq <= seq);
  const fixture = checkpoint ? { ...history.initial, state: structuredClone(checkpoint.state) } : structuredClone(history.initial);
  if (checkpoint && await digestFixture(fixture) !== checkpoint.hash) throw new Error(`结构检查点 ${checkpoint.seq} 校验失败。`);
  return replayRange(history, fixture, checkpoint?.seq ?? 0, seq, control);
}

export async function verifyScaleHistory(history: ScaleHistory, control?: ScaleControl): Promise<{ fixture: ScaleFixture; hash: string; entries: number }> {
  await initialVerified(history);
  // Checkpoint tampering cannot hide behind a valid final replay.
  for (const checkpoint of history.checkpoints) {
    if (await digestFixture({ ...history.initial, state: checkpoint.state }) !== checkpoint.hash) throw new Error(`结构检查点 ${checkpoint.seq} 校验失败。`);
    await scaleYield(control, '核验结构检查点', checkpoint.seq, history.entries.length);
  }
  const fixture = await replayRange(history, structuredClone(history.initial), 0, history.entries.length, control);
  return { fixture, hash: await digestFixture(fixture), entries: history.entries.length };
}

export async function branchScaleHistory(history: ScaleHistory, seq: number, id: string, control?: ScaleControl): Promise<{ history: ScaleHistory; fixture: ScaleFixture }> {
  // Branching does a complete source audit, then selects the requested point.
  await verifyScaleHistory(history, control);
  const fixture = await seekScaleHistory(history, seq, control), parent = { runId: history.runId, seq, hash: await digestFixture(fixture) };
  return { fixture, history: await createScaleHistory(fixture, id, parent) };
}
