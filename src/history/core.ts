import { advanceWorld, applyStateAction, issueOrder, validateWorld } from '../sim/core';
import type { World } from '../sim/types';
import type { HistoryCheckpoint, HistoryEntry, HistoryInput, HistoryLog, HistoryParent, HistoryStateRef } from './types';

export const MAX_HISTORY_ENTRIES = 2048;
export const MAX_HISTORY_BYTES = 20 * 1024 * 1024;
const CHECKPOINT_EVERY = 32;
const MAX_DAY = 1_000_000_000;
const MAX_EVENT_ID = Number.MAX_SAFE_INTEGER - 100000;
const encoder = new TextEncoder();

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
const exact = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const runId = (value: unknown): value is string => typeof value === 'string' && /^run-[a-z0-9-]{1,55}$/.test(value);
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function list(value: unknown, maximum: number): value is unknown[] {
  return Array.isArray(value) && value.length <= maximum && Object.keys(value).length === value.length && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean);
}
const stateRef = (value: unknown): value is HistoryStateRef => record(value) && exact(value, ['day', 'nextEventId', 'hash']) && integer(value.day, 0, MAX_DAY) && integer(value.nextEventId, 1, MAX_EVENT_ID) && hash(value.hash);
const equalRef = (a: HistoryStateRef, b: HistoryStateRef) => a.day === b.day && a.nextEventId === b.nextEventId && a.hash === b.hash;
const reference = (world: World, worldHash: string): HistoryStateRef => ({ day: world.day, nextEventId: world.nextEventId, hash: worldHash });

/** Object keys are canonical; simulation-significant array order is preserved. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Snapshot before the first await so caller mutations cannot change a digest. */
export async function hashWorld(world: World): Promise<string> {
  const snapshot: unknown = structuredClone(world);
  if (!validateWorld(snapshot)) throw new Error('世界状态校验失败，无法计算历史校验和。');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonical(snapshot)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function validInput(value: unknown, world: World, before: HistoryStateRef): value is HistoryInput {
  if (!record(value)) return false;
  if (value.type === 'step') return exact(value, ['type', 'days']) && value.days === 1;
  if (value.type === 'order') {
    const order = value.order;
    return exact(value, ['type', 'order']) && record(order) && exact(order, ['armyId', 'targetId', 'kind']) && id(order.armyId) && id(order.targetId) && (order.kind === 'march' || order.kind === 'retreat') && world.armies.some(army => army.id === order.armyId) && world.provinces.some(province => province.id === order.targetId);
  }
  if (value.type !== 'state-action' || !exact(value, ['type', 'action', 'expected']) || !world.statecraft) return false;
  const action = value.action, expected = value.expected;
  if (!record(expected) || !exact(expected, ['day', 'nextEventId']) || expected.day !== before.day || expected.nextEventId !== before.nextEventId || !record(action) || !id(action.nationId) || !world.nations.some(nation => nation.id === action.nationId)) return false;
  if (action.type === 'policy') return exact(action, ['type', 'nationId', 'priority']) && ['civilian', 'balanced', 'military'].includes(action.priority as string);
  return (action.type === 'declare-war' || action.type === 'make-peace') && exact(action, ['type', 'nationId', 'targetNationId']) && id(action.targetNationId) && action.targetNationId !== action.nationId && world.nations.some(nation => nation.id === action.targetNationId);
}

function validCheckpoint(value: unknown, historyRunId: string, rulesVersion: World['rulesVersion']): value is HistoryCheckpoint {
  if (!record(value) || !exact(value, ['seq', 'world', 'hash']) || !integer(value.seq, 0, MAX_HISTORY_ENTRIES) || !hash(value.hash) || !validateWorld(value.world)) return false;
  return value.world.scenario === 'custom-world' && value.world.custom?.id === historyRunId && value.world.rulesVersion === rulesVersion;
}

/** Structural validation only. Use integrity verification for persisted hashes. */
export function validateHistory(raw: unknown): raw is HistoryLog {
  try {
    if (!record(raw) || !exact(raw, ['format', 'version', 'runId', 'engineFingerprint', 'rulesVersion', 'startDay', 'checkpointEvery', 'parent', 'initial', 'entries', 'checkpoints']) || raw.format !== 'lieguoji-history' || raw.version !== 1 || !runId(raw.runId) || !hash(raw.engineFingerprint) || (raw.rulesVersion !== '0.1.0' && raw.rulesVersion !== '0.2.0') || !integer(raw.startDay, 0, MAX_DAY) || raw.checkpointEvery !== CHECKPOINT_EVERY || !list(raw.entries, MAX_HISTORY_ENTRIES) || !list(raw.checkpoints, MAX_HISTORY_ENTRIES / CHECKPOINT_EVERY)) return false;
    if (raw.parent !== null && (!record(raw.parent) || !exact(raw.parent, ['runId', 'seq', 'worldHash']) || !runId(raw.parent.runId) || raw.parent.runId === raw.runId || !integer(raw.parent.seq, 0, MAX_HISTORY_ENTRIES) || !hash(raw.parent.worldHash))) return false;
    if (!validCheckpoint(raw.initial, raw.runId, raw.rulesVersion) || raw.initial.seq !== 0 || raw.initial.world.day !== raw.startDay) return false;
    let previous = reference(raw.initial.world, raw.initial.hash);
    for (let index = 0; index < raw.entries.length; index++) {
      const entry = raw.entries[index];
      if (!record(entry) || !exact(entry, ['seq', 'input', 'before', 'after']) || entry.seq !== index + 1 || !stateRef(entry.before) || !stateRef(entry.after) || !equalRef(entry.before, previous) || !validInput(entry.input, raw.initial.world, entry.before)) return false;
      if (entry.after.day !== entry.before.day + (entry.input.type === 'step' ? 1 : 0) || entry.after.nextEventId < entry.before.nextEventId) return false;
      previous = entry.after;
    }
    if (raw.checkpoints.length !== Math.floor(raw.entries.length / CHECKPOINT_EVERY)) return false;
    for (let index = 0; index < raw.checkpoints.length; index++) {
      const checkpoint = raw.checkpoints[index], seq = (index + 1) * CHECKPOINT_EVERY;
      if (!validCheckpoint(checkpoint, raw.runId, raw.rulesVersion) || checkpoint.seq !== seq || !equalRef(reference(checkpoint.world, checkpoint.hash), (raw.entries[seq - 1] as HistoryEntry).after)) return false;
    }
    // This is an application limit, not a promise about the browser's quota.
    return encoder.encode(JSON.stringify(raw)).byteLength <= MAX_HISTORY_BYTES;
  } catch { return false; }
}

function snapshotHistory(history: HistoryLog): HistoryLog {
  const snapshot: unknown = structuredClone(history);
  if (!validateHistory(snapshot)) throw new Error('历史记录结构、身份、序号、版本或大小无效；原记录未修改。');
  return snapshot;
}
function requireEngine(history: HistoryLog, expectedEngine: string) {
  if (!hash(expectedEngine) || history.engineFingerprint !== expectedEngine) throw new Error('历史引擎指纹不匹配，无法精确重算；原记录已保留。');
}
function requireWorldIdentity(history: HistoryLog, world: World) {
  if (!validateWorld(world) || world.scenario !== 'custom-world' || world.custom?.id !== history.runId || world.rulesVersion !== history.rulesVersion) throw new Error('当前世界与历史记录的运行身份或规则版本不一致。');
}
const headRef = (history: HistoryLog) => history.entries.at(-1)?.after ?? reference(history.initial.world, history.initial.hash);

export async function createHistory(world: World, options: { runId: string; engineFingerprint: string; parent?: HistoryParent }): Promise<HistoryLog> {
  const snapshot = structuredClone(world), settings = structuredClone(options);
  if (!record(settings) || !exact(settings, ['runId', 'engineFingerprint', ...(Object.hasOwn(settings, 'parent') ? ['parent'] : [])])) throw new Error('历史初始化选项无效。');
  if (!validateWorld(snapshot) || snapshot.scenario !== 'custom-world') throw new Error('历史记录仅支持自建世界；测试大陆原局保留。');
  const history: HistoryLog = { format: 'lieguoji-history', version: 1, runId: settings.runId, engineFingerprint: settings.engineFingerprint, rulesVersion: snapshot.rulesVersion, startDay: snapshot.day, checkpointEvery: CHECKPOINT_EVERY, parent: settings.parent ?? null, initial: { seq: 0, world: snapshot, hash: '0'.repeat(64) }, entries: [], checkpoints: [] };
  if (!validateHistory(history)) throw new Error('历史初始化身份、版本、父分支或大小无效。');
  history.initial.hash = await hashWorld(snapshot);
  return history;
}

function execute(world: World, input: HistoryInput): World {
  if (input.type === 'step') return advanceWorld(world, 1);
  if (input.type === 'order') return issueOrder(world, input.order);
  return applyStateAction(world, input.action, input.expected);
}

export async function appendHistory(history: HistoryLog, currentWorld: World, input: HistoryInput, expectedEngine: string): Promise<{ history: HistoryLog; world: World }> {
  // All caller-owned data is copied before hashing or executing anything.
  const next = snapshotHistory(history), current = structuredClone(currentWorld), command = structuredClone(input);
  requireEngine(next, expectedEngine); requireWorldIdentity(next, current);
  if (next.entries.length >= MAX_HISTORY_ENTRIES) throw new Error('历史已达 2048 条输入上限，请导出记录或创建新的独立记录副本；本次未推进。');
  const before = reference(current, await hashWorld(current));
  if (!equalRef(before, headRef(next))) throw new Error('历史末态与当前世界不一致，拒绝从陈旧或改动过的快照追加。');
  if (!validInput(command, current, before)) throw new Error('历史输入无效：只记录成功的逐日推进、军令和国家行动，不接受预览或零日快照。');
  const world = execute(current, command);
  const after = reference(world, await hashWorld(world)), seq = next.entries.length + 1;
  next.entries.push({ seq, input: command, before, after });
  if (seq % CHECKPOINT_EVERY === 0) next.checkpoints.push({ seq, world: structuredClone(world), hash: after.hash });
  if (!validateHistory(next)) throw new Error('历史包达到大小限制或新记录校验失败；本次未提交，原世界与记录保留。');
  return { history: next, world };
}

async function verifyCheckpoint(checkpoint: HistoryCheckpoint) {
  if (await hashWorld(checkpoint.world) !== checkpoint.hash) throw new Error(`历史检查点 ${checkpoint.seq} 的校验和不匹配，记录已保留。`);
}
async function integrity(history: HistoryLog) {
  await verifyCheckpoint(history.initial);
  for (const checkpoint of history.checkpoints) await verifyCheckpoint(checkpoint);
}

/** Integrity does not execute rules and intentionally accepts another engine. */
export async function verifyHistoryIntegrity(history: HistoryLog): Promise<void> {
  const snapshot = snapshotHistory(history);
  await integrity(snapshot);
}

async function replayEntry(world: World, currentHash: string, entry: HistoryEntry): Promise<{ world: World; hash: string }> {
  if (!equalRef(reference(world, currentHash), entry.before)) throw new Error(`历史输入 ${entry.seq} 的起始状态不一致，回放停止。`);
  let next: World;
  try { next = execute(world, entry.input); }
  catch (error) { throw new Error(`历史输入 ${entry.seq} 无法执行，回放停止：${error instanceof Error ? error.message : '模拟错误'}`, { cause: error }); }
  const nextHash = await hashWorld(next);
  if (!equalRef(reference(next, nextHash), entry.after)) throw new Error(`历史输入 ${entry.seq} 的重算结果与记录不同，回放停止。`);
  return { world: next, hash: nextHash };
}

export async function verifyHistory(history: HistoryLog, expectedEngine: string): Promise<void> {
  const snapshot = snapshotHistory(history);
  requireEngine(snapshot, expectedEngine); await integrity(snapshot);
  let world = snapshot.initial.world, currentHash = snapshot.initial.hash;
  for (const entry of snapshot.entries) { const result = await replayEntry(world, currentHash, entry); world = result.world; currentHash = result.hash; }
}

export async function seekHistory(history: HistoryLog, seq: number, expectedEngine: string): Promise<World> {
  const snapshot = snapshotHistory(history);
  requireEngine(snapshot, expectedEngine);
  if (!integer(seq, 0, snapshot.entries.length)) throw new Error('回放位置必须是记录范围内的整数输入序号。');
  const checkpoint = [...snapshot.checkpoints].reverse().find(item => item.seq <= seq) ?? snapshot.initial;
  await verifyCheckpoint(checkpoint);
  let world = checkpoint.world, currentHash = checkpoint.hash;
  for (let index = checkpoint.seq; index < seq; index++) { const result = await replayEntry(world, currentHash, snapshot.entries[index]); world = result.world; currentHash = result.hash; }
  return world;
}
