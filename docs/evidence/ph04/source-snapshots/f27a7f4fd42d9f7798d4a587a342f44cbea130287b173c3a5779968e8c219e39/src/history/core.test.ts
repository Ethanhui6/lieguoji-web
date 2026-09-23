import { afterEach, describe, expect, it, vi } from 'vitest';
import * as simulation from '../sim/core';
import { createWorld } from '../sim/demo';
import type { World } from '../sim/types';
import { appendHistory, createHistory, hashWorld, MAX_HISTORY_BYTES, MAX_HISTORY_ENTRIES, seekHistory, validateHistory, verifyHistory, verifyHistoryIntegrity } from './core';
import type { HistoryInput, HistoryLog, HistoryParent, HistoryStateRef } from './types';

const ENGINE = 'a'.repeat(64), OTHER_ENGINE = 'b'.repeat(64);
const RUN = 'run-history-fixture';
const STEP: HistoryInput = { type: 'step', days: 1 };
const ORDER: HistoryInput = { type: 'order', order: { armyId: 'lie-main', targetId: 'ming-border', kind: 'march' } };

function fixture(modern = false): World {
  // Synthetic core fixture, never promoted to the formal map or published lore.
  const world = createWorld();
  world.scenario = 'custom-world';
  world.custom = { id: RUN, name: '历史核心合成测试', seed: 'history-fixture', rivers: [] };
  return modern ? simulation.initializeStatecraft(world) : world;
}
const start = (world = fixture()) => createHistory(world, { runId: RUN, engineFingerprint: ENGINE });

async function timeline(count: number, world = fixture()) {
  let history = await start(world);
  const states = [structuredClone(world)];
  for (let index = 0; index < count; index++) {
    const result = await appendHistory(history, world, STEP, ENGINE);
    history = result.history; world = result.world; states.push(structuredClone(world));
  }
  return { history, world, states };
}

/** Structurally valid no-change records exercise limits without 2048 sim days. */
function fillReferences(history: HistoryLog, count: number): HistoryLog {
  const next = structuredClone(history);
  const ref: HistoryStateRef = { day: next.initial.world.day, nextEventId: next.initial.world.nextEventId, hash: next.initial.hash };
  next.entries = Array.from({ length: count }, (_, index) => ({ seq: index + 1, input: structuredClone(ORDER), before: { ...ref }, after: { ...ref } }));
  next.checkpoints = Array.from({ length: Math.floor(count / 32) }, (_, index) => ({ seq: (index + 1) * 32, world: structuredClone(next.initial.world), hash: next.initial.hash }));
  return next;
}

afterEach(() => vi.restoreAllMocks());

describe('history creation and deterministic world hashes', () => {
  it('starts at the actual saved day and does not alter or upgrade a legacy world', async () => {
    const world = simulation.advanceWorld(fixture(), 7), before = JSON.stringify(world);
    const history = await start(world);
    expect(history).toMatchObject({ format: 'lieguoji-history', version: 1, runId: RUN, rulesVersion: '0.1.0', startDay: 7, checkpointEvery: 32, parent: null, entries: [], checkpoints: [] });
    expect(history.initial).toMatchObject({ seq: 0, world });
    expect(validateHistory(history)).toBe(true);
    expect(JSON.stringify(world)).toBe(before);
    await expect(verifyHistory(history, ENGINE)).resolves.toBeUndefined();
    expect(await seekHistory(history, 0, ENGINE)).toEqual(world);
  });

  it('uses stable object-key serialization but preserves array order', async () => {
    const world = fixture();
    const reordered = Object.fromEntries(Object.entries(world).reverse()) as World;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(world));
    expect(await hashWorld(reordered)).toBe(await hashWorld(world));
    reordered.nations = [...world.nations].reverse();
    expect(await hashWorld(reordered)).not.toBe(await hashWorld(world));
  });

  it('copies world and parent options before asynchronous hashing', async () => {
    const world = fixture(), before = structuredClone(world);
    const parent: HistoryParent = { runId: 'run-parent', seq: 12, worldHash: 'c'.repeat(64) };
    const pending = createHistory(world, { runId: RUN, engineFingerprint: ENGINE, parent });
    world.armies[0].troops = 999; parent.seq = 100;
    const history = await pending;
    expect(history.initial.world).toEqual(before);
    expect(history.parent?.seq).toBe(12);
    const pendingHash = hashWorld(before), expected = structuredClone(before);
    before.armies[0].troops = 1;
    expect(await pendingHash).toBe(await hashWorld(expected));
  });

  it('rejects demo recording, mismatched run identity, malformed parent and engine identifiers', async () => {
    await expect(createHistory(createWorld(), { runId: RUN, engineFingerprint: ENGINE })).rejects.toThrow('自建世界');
    await expect(createHistory(fixture(), { runId: 'run-other', engineFingerprint: ENGINE })).rejects.toThrow('身份');
    await expect(createHistory(fixture(), { runId: RUN, engineFingerprint: 'git-sha' })).rejects.toThrow();
    await expect(createHistory(fixture(), { runId: RUN, engineFingerprint: ENGINE, parent: { runId: RUN, seq: 0, worldHash: ENGINE } })).rejects.toThrow('父分支');
    const broken = fixture(); broken.armies[0].troops = NaN;
    await expect(hashWorld(broken)).rejects.toThrow('校验');
  });
});

describe('authoritative successful inputs', () => {
  it('records actual army commands and then deterministic daily progress', async () => {
    const world = fixture(), history = await start(world), before = structuredClone(history);
    const ordered = await appendHistory(history, world, ORDER, ENGINE);
    expect(ordered.world).toEqual(simulation.issueOrder(world, ORDER.type === 'order' ? ORDER.order : neverOrder()));
    expect(ordered.history.entries[0]).toMatchObject({ seq: 1, input: ORDER, before: { day: 0 }, after: { day: 0 } });
    const advanced = await appendHistory(ordered.history, ordered.world, STEP, ENGINE);
    expect(advanced.world).toEqual(simulation.advanceWorld(ordered.world, 1));
    expect(advanced.history.entries[1].before).toEqual(ordered.history.entries[0].after);
    expect(history).toEqual(before);
    await expect(verifyHistory(advanced.history, ENGINE)).resolves.toBeUndefined();
    expect(await seekHistory(advanced.history, 2, ENGINE)).toEqual(advanced.world);
  });

  it('preserves multiple same-day state actions and their expected version order', async () => {
    const world = fixture(true), history = await start(world);
    const first: HistoryInput = { type: 'state-action', action: { type: 'policy', nationId: 'lie', priority: 'civilian' }, expected: { day: world.day, nextEventId: world.nextEventId } };
    const result = await appendHistory(history, world, first, ENGINE);
    const second: HistoryInput = { type: 'state-action', action: { type: 'declare-war', nationId: 'lie', targetNationId: 'ming' }, expected: { day: result.world.day, nextEventId: result.world.nextEventId } };
    const declared = await appendHistory(result.history, result.world, second, ENGINE);
    expect(declared.history.entries.map(entry => entry.after.day)).toEqual([0, 0]);
    expect(declared.history.entries.map(entry => entry.seq)).toEqual([1, 2]);
    expect(simulation.isAtWar(await seekHistory(declared.history, 1, ENGINE), 'lie', 'ming')).toBe(false);
    expect(simulation.isAtWar(await seekHistory(declared.history, 2, ENGINE), 'lie', 'ming')).toBe(true);
    await expect(verifyHistory(declared.history, ENGINE)).resolves.toBeUndefined();
  });

  it('does not append rejected commands, zero-day snapshots, previews or stale actions', async () => {
    const world = fixture(true), history = await start(world), before = structuredClone(history);
    const invalid: unknown[] = [
      { type: 'step', days: 0 }, { type: 'step', days: 2 }, { type: 'preview', order: ORDER },
      ORDER, // A new statecraft world is at peace, so this invasion fails.
      { type: 'state-action', action: { type: 'policy', nationId: 'lie', priority: 'military' }, expected: { day: 1, nextEventId: world.nextEventId } },
      { type: 'order', order: { armyId: 'missing', targetId: 'ming-border', kind: 'march' } },
    ];
    for (const input of invalid) await expect(appendHistory(history, world, input as HistoryInput, ENGINE)).rejects.toThrow();
    expect(history).toEqual(before);
    expect(history.entries).toHaveLength(0);
  });

  it('rejects stale or externally changed head worlds even when the day is unchanged', async () => {
    const world = fixture(), history = await start(world);
    const changed = structuredClone(world); changed.armies[0].supplies--;
    await expect(appendHistory(history, changed, STEP, ENGINE)).rejects.toThrow('末态');
    const advanced = await appendHistory(history, world, STEP, ENGINE);
    await expect(appendHistory(advanced.history, world, STEP, ENGINE)).rejects.toThrow('末态');
    const otherRun = structuredClone(world); otherRun.custom!.id = 'run-other';
    await expect(appendHistory(history, otherRun, STEP, ENGINE)).rejects.toThrow('身份');
    await expect(appendHistory(history, world, STEP, OTHER_ENGINE)).rejects.toThrow('指纹');
  });

  it('snapshots all inputs before await and avoids aliases between output world and history', async () => {
    const world = fixture(), expectedWorld = structuredClone(world), history = await start(world), input = structuredClone(ORDER);
    const pending = appendHistory(history, world, input, ENGINE);
    world.armies[0].supplies = 0; history.initial.world.armies[0].supplies = 1;
    if (input.type === 'order') input.order.targetId = 'unknown';
    const result = await pending;
    expect(result.history.entries[0].input).toEqual(ORDER);
    expect(result.history.initial.world).toEqual(expectedWorld);
    result.world.armies[0].troops = 1;
    expect(result.history.initial.world.armies[0].troops).toBe(expectedWorld.armies[0].troops);
  });

  it('records a successful no-change core command instead of silently discarding it', async () => {
    const world = fixture(), history = await start(world);
    vi.spyOn(simulation, 'issueOrder').mockImplementation(snapshot => structuredClone(snapshot));
    const result = await appendHistory(history, world, ORDER, ENGINE);
    expect(result.world).toEqual(world);
    expect(result.history.entries).toHaveLength(1);
    expect(result.history.entries[0].after).toEqual(result.history.entries[0].before);
  });
});

describe('checkpoints, integrity and seeking', () => {
  it('seeks correctly on both sides of a 32-input checkpoint, independently of the 160-event ring', async () => {
    const { history, world, states } = await timeline(34);
    expect(history.checkpoints.map(checkpoint => checkpoint.seq)).toEqual([32]);
    for (const seq of [0, 1, 31, 32, 33, 34]) expect(await seekHistory(history, seq, ENGINE)).toEqual(states[seq]);
    expect(history.entries).toHaveLength(34);
    expect(world.events.length).toBeLessThanOrEqual(160);
    await expect(verifyHistoryIntegrity(history)).resolves.toBeUndefined();
    await expect(verifyHistory(history, ENGINE)).resolves.toBeUndefined();
    const returned = await seekHistory(history, 32, ENGINE); returned.armies[0].troops = 1;
    expect(history.checkpoints[0].world).toEqual(states[32]);
  });

  it('detects valid-looking checkpoint content changes by hashing the actual world', async () => {
    const { history } = await timeline(32);
    history.checkpoints[0].world.armies[0].name = '被改动的名称';
    expect(validateHistory(history)).toBe(true);
    await expect(verifyHistoryIntegrity(history)).rejects.toThrow('检查点 32');
    await expect(seekHistory(history, 32, ENGINE)).rejects.toThrow('检查点 32');
    history.initial.world.armies[0].name = '被改动的起点';
    await expect(seekHistory(history, 1, ENGINE)).rejects.toThrow('检查点 0');
  });

  it('distinguishes hash integrity from actual deterministic execution verification', async () => {
    const world = fixture(), first = await appendHistory(await start(world), world, ORDER, ENGINE);
    if (first.history.entries[0].input.type === 'order') first.history.entries[0].input.order.targetId = 'lie-south';
    expect(validateHistory(first.history)).toBe(true);
    await expect(verifyHistoryIntegrity(first.history)).resolves.toBeUndefined();
    await expect(verifyHistory(first.history, ENGINE)).rejects.toThrow('重算结果');
    await expect(seekHistory(first.history, 1, ENGINE)).rejects.toThrow('重算结果');
  });

  it('halts if a previously recorded input can no longer be executed', async () => {
    const world = fixture(), first = await appendHistory(await start(world), world, ORDER, ENGINE);
    if (first.history.entries[0].input.type === 'order') first.history.entries[0].input.order.kind = 'retreat';
    await expect(verifyHistory(first.history, ENGINE)).rejects.toThrow('无法执行');
  });

  it('allows engine-independent integrity inspection but refuses an incompatible replay engine', async () => {
    const history = await start(); history.engineFingerprint = OTHER_ENGINE;
    await expect(verifyHistoryIntegrity(history)).resolves.toBeUndefined();
    await expect(verifyHistory(history, ENGINE)).rejects.toThrow('指纹');
    await expect(seekHistory(history, 0, ENGINE)).rejects.toThrow('指纹');
  });

  it.each([-1, 0.5, 2, NaN, Infinity])('rejects an invalid seek sequence %s', async seq => {
    const { history } = await timeline(1);
    await expect(seekHistory(history, seq, ENGINE)).rejects.toThrow('序号');
  });
});

describe('strict history format and bounded growth', () => {
  it.each([
    (value: HistoryLog) => { (value as unknown as { version: number }).version = 2; },
    (value: HistoryLog) => { value.runId = 'run-other'; },
    (value: HistoryLog) => { value.rulesVersion = '0.2.0'; },
    (value: HistoryLog) => { value.startDay++; },
    (value: HistoryLog) => { value.initial.seq = 1; },
    (value: HistoryLog) => { value.initial.hash = 'bad'; },
    (value: HistoryLog) => { value.entries[0].seq = 2; },
    (value: HistoryLog) => { value.entries[0].before.nextEventId++; },
    (value: HistoryLog) => { value.entries[0].after.day = 0; },
    (value: HistoryLog) => { value.entries[0].after.nextEventId = 0; },
    (value: HistoryLog) => { value.entries[0].input = { type: 'step', days: 0 } as unknown as HistoryInput; },
    (value: HistoryLog) => { value.entries[0].input = { type: 'step', days: 1, hidden: true } as HistoryInput; },
    (value: HistoryLog) => { Object.assign(value.initial.world, { history: [] }); },
    (value: HistoryLog) => { value.parent = { runId: 'run-parent', seq: -1, worldHash: ENGINE }; },
    (value: HistoryLog) => { delete value.entries[0]; },
    (value: HistoryLog) => { Object.assign(value, { ignoredFutureField: true }); },
  ])('rejects malformed structure and broken state chains %#', async mutate => {
    const { history } = await timeline(1); mutate(history);
    expect(validateHistory(history)).toBe(false);
    await expect(verifyHistoryIntegrity(history)).rejects.toThrow();
  });

  it('requires all periodic checkpoints with matching sequence, identity and entry references', async () => {
    const { history } = await timeline(32);
    const missing = structuredClone(history); missing.checkpoints = [];
    expect(validateHistory(missing)).toBe(false);
    const misplaced = structuredClone(history); misplaced.checkpoints[0].seq = 31;
    expect(validateHistory(misplaced)).toBe(false);
    const wrongRun = structuredClone(history); wrongRun.checkpoints[0].world.custom!.id = 'run-wrong';
    expect(validateHistory(wrongRun)).toBe(false);
    const wrongRef = structuredClone(history); wrongRef.checkpoints[0].hash = OTHER_ENGINE;
    expect(validateHistory(wrongRef)).toBe(false);
  });

  it('refuses the 2049th entry before executing and never truncates old inputs', async () => {
    const history = fillReferences(await start(), MAX_HISTORY_ENTRIES), before = structuredClone(history);
    expect(validateHistory(history)).toBe(true);
    const execute = vi.spyOn(simulation, 'advanceWorld');
    await expect(appendHistory(history, history.initial.world, STEP, ENGINE)).rejects.toThrow('2048');
    expect(execute).not.toHaveBeenCalled();
    expect(history).toEqual(before);
    const overflow = fillReferences(await start(), MAX_HISTORY_ENTRIES + 1);
    expect(validateHistory(overflow)).toBe(false);
  });

  it('measures the entire package in UTF-8 bytes instead of JavaScript character length', async () => {
    const world = fixture();
    world.events = Array.from({ length: 160 }, (_, index) => ({ id: index + 1, day: 0, kind: 'system', text: '粮'.repeat(5000), reason: '民'.repeat(10000) }));
    world.nextEventId = 161;
    const history = fillReferences(await start(world), 64), json = JSON.stringify(history);
    expect(json.length).toBeLessThan(MAX_HISTORY_BYTES);
    expect(new TextEncoder().encode(json).byteLength).toBeGreaterThan(MAX_HISTORY_BYTES);
    expect(validateHistory(history)).toBe(false);
    await expect(verifyHistoryIntegrity(history)).rejects.toThrow('大小');
  });

  it('returns false for cyclic unknown input instead of throwing', async () => {
    const history = await start(); (history as unknown as Record<string, unknown>).self = history;
    expect(validateHistory(history)).toBe(false);
  });
});

function neverOrder(): never { throw new Error('Test order fixture has the wrong type'); }
