import { describe, expect, it, vi } from 'vitest';
import * as frozenSim from '../compat/v0_4/sim/core';
import * as frozenHistory from '../compat/v0_4/history/core';
import modernFile from '../compat/fixtures/golden-0.4-modern.json';
import legacyFile from '../compat/fixtures/golden-0.4-legacy.json';
import { adaptEngine, createEngineCatalog } from './adapter';
import { legacyEngine, registeredEngines, resolveEngine, resolveHistoryEngine, resolveWorldEngine } from './registry';
import { prepareManagementCopy } from './conversions';
import { requireCommandContext, V4_VERSIONS, validateCommandEnvelope, validateV4Versions, type CommandEnvelope } from './contracts';
const modernRaw = modernFile.history, legacyRaw = legacyFile.history;

describe('frozen rule dispatch', () => {
  it.each([modernRaw, legacyRaw])('keeps an old log bound to its complete fingerprint and version', async raw => {
    if (!legacyEngine.validateHistory(raw)) throw new Error('Bad fixed fixture');
    expect(resolveEngine(raw.engineFingerprint)).toBe(legacyEngine);
    expect(resolveHistoryEngine(raw)).toBe(legacyEngine);
    expect(resolveWorldEngine(raw.initial.world)).toBe(legacyEngine);
    const source = JSON.stringify(raw);
    const world = await legacyEngine.seekHistory(raw, 64);
    expect(await legacyEngine.hashWorld(world)).toBe(raw.checkpoints[1].hash);
    expect(legacyEngine.nationReports(world)).toEqual(frozenSim.nationReports(world));
    expect(JSON.stringify(raw)).toBe(source);
  });
  it('never resolves a partial/unknown fingerprint or unknown/mismatched versions', () => {
    expect(resolveEngine(legacyEngine.fingerprint.slice(0, 8))).toBeUndefined();
    expect(resolveEngine('https://example.invalid/engine.js')).toBeUndefined();
    expect(resolveHistoryEngine({ ...modernRaw, engineFingerprint: 'f'.repeat(64) })).toBeUndefined();
    expect(resolveHistoryEngine({ ...modernRaw, rulesVersion: '0.3.0' })).toBeUndefined();
    for (const pair of [{ schemaVersion: 3 }, { rulesVersion: '0.3.0' }, { schemaVersion: 1 }, { statecraft: { version: 2 } }]) {
      expect(resolveWorldEngine({ ...modernRaw.initial.world, ...pair })).toBeUndefined();
    }
    expect(new Set(registeredEngines.map(engine => engine.fingerprint)).size).toBe(registeredEngines.length);
  });
  it('routes two independently registered adapters without aliasing or replacing one', async () => {
    // A second adapter is a test fixture, not an enabled game ruleset or a fabricated release.
    const reports = vi.fn(frozenSim.nationReports), verify = vi.fn(frozenHistory.verifyHistory);
    const secondary = adaptEngine('b'.repeat(64), 'test adapter', { ...frozenSim, nationReports: reports }, { ...frozenHistory, verifyHistory: verify }, legacyEngine.supportedWorldVersions);
    const catalog = createEngineCatalog([legacyEngine, secondary]);
    expect(catalog.resolveEngine(legacyEngine.fingerprint)).toBe(legacyEngine);
    expect(catalog.resolveEngine(secondary.fingerprint)).toBe(secondary);
    const world = structuredClone(modernRaw.initial.world);
    if (!secondary.validateWorld(world)) throw new Error('Bad fixed world');
    const log = await secondary.createHistory(world, { runId: world.custom!.id });
    expect(log.engineFingerprint).toBe(secondary.fingerprint);
    expect(catalog.resolveHistoryEngine(log)).toBe(secondary);
    catalog.resolveHistoryEngine(log)!.nationReports(world);
    await catalog.resolveHistoryEngine(log)!.verifyHistory(log);
    expect(reports).toHaveBeenCalledOnce(); expect(verify).toHaveBeenCalledWith(log, secondary.fingerprint);
    await expect(legacyEngine.verifyHistory(log)).rejects.toThrow('指纹');
    expect(() => createEngineCatalog([legacyEngine, legacyEngine])).toThrow('重复');
    expect(Object.isFrozen(catalog.engines)).toBe(true);
  });
  it('creates a same-engine branch without editing the parent or caller options', async () => {
    if (!legacyEngine.validateHistory(modernRaw)) throw new Error('Bad fixture');
    const source = JSON.stringify(modernRaw), world = await legacyEngine.seekHistory(modernRaw, 64);
    const parent = { runId: modernRaw.runId, seq: 64, worldHash: await legacyEngine.hashWorld(world) };
    world.custom = { ...world.custom!, id: 'run-h-00000000-0000-4000-8000-000000000999' };
    const options = { runId: world.custom.id, parent, engineFingerprint: 'a'.repeat(64) };
    const log = await legacyEngine.createHistory(world, options);
    expect(log.parent).toEqual(parent); expect(log.engineFingerprint).toBe(legacyEngine.fingerprint);
    const next = await legacyEngine.appendHistory(log, world, { type: 'step', days: 1 });
    await legacyEngine.verifyHistory(next.history);
    expect(next.world.day).toBe(world.day + 1); expect(JSON.stringify(modernRaw)).toBe(source);
    expect(options.engineFingerprint).toBe('a'.repeat(64));
  });
  it('enforces each adapter version boundary on every executable and codec entry', async () => {
    const engine = adaptEngine('c'.repeat(64), 'schema2-only test adapter', frozenSim, frozenHistory, [{ schemaVersion: 2, rulesVersion: '0.2.0' }]);
    if (!legacyEngine.validateHistory(legacyRaw)) throw new Error('Bad fixture');
    const world = legacyRaw.initial.world;
    const order = { armyId: world.armies[0].id, targetId: world.provinces[0].id, kind: 'march' as const };
    const action = { type: 'policy' as const, nationId: world.nations[0].id, priority: 'balanced' as const };
    const expected = { day: world.day, nextEventId: world.nextEventId };
    for (const call of [() => engine.advanceWorld(world, 1), () => engine.issueOrder(world, order), () => engine.applyStateAction(world, action, expected),
      () => engine.previewOrder(world, order), () => engine.previewStateAction(world, action), () => engine.nationReports(world),
      () => engine.canCommandArmy(world, world.armies[0]), () => engine.isAtWar(world, world.nations[0].id, world.nations[1].id), () => engine.initializeStatecraft(world)]) expect(call).toThrow('版本');
    expect(engine.validateWorld(world)).toBe(false); expect(engine.validateHistory(legacyRaw)).toBe(false);
    await expect(engine.hashWorld(world)).rejects.toThrow('版本');
    await expect(engine.verifyHistoryIntegrity(legacyRaw)).rejects.toThrow('版本');
    await expect(engine.verifyHistory(legacyRaw)).rejects.toThrow('版本');
    await expect(engine.seekHistory(legacyRaw, 0)).rejects.toThrow('版本');
    await expect(engine.appendHistory(legacyRaw, world, { type: 'step', days: 1 })).rejects.toThrow('版本');
    const unknown = { ...legacyRaw, engineFingerprint: 'd'.repeat(64) };
    expect(legacyEngine.validateHistory(unknown)).toBe(true);
    await expect(legacyEngine.verifyHistoryIntegrity(unknown)).resolves.toBeUndefined();
    await expect(legacyEngine.verifyHistory(unknown)).rejects.toThrow('指纹');
  });
  it('only converts an explicit legacy custom copy, keeping its input untouched', () => {
    const world = structuredClone(legacyRaw.initial.world);
    if (!legacyEngine.validateWorld(world)) throw new Error('Bad fixture');
    const before = JSON.stringify(world), converted = prepareManagementCopy(world);
    expect(JSON.stringify(world)).toBe(before); expect(converted).not.toBe(world);
    expect(converted.rulesVersion).toBe('0.2.0'); expect(converted.statecraft?.version).toBe(1);
    expect(resolveWorldEngine(converted)).toBe(legacyEngine);
    expect(() => prepareManagementCopy(converted)).toThrow('只能');
    expect(() => prepareManagementCopy({ ...world, scenario: 'test-continent' })).toThrow('只能');
  });
});

describe('V4 reserved version and command boundary', () => {
  const expected = { world: 7, geography: 3, administration: 2, society: 5 };
  const command: CommandEnvelope = { format: 'lieguoji-command', version: 1, worldId: 'world-test', commandId: 'command-one', engineFingerprint: 'a'.repeat(64), expected, domain: 'administration', type: 'split', payload: { id: 'administration:test' } };
  const context = { worldId: command.worldId, engineFingerprint: command.engineFingerprint, revision: expected };
  it('defines every component version without admitting a future world into the old engine', () => {
    expect(validateV4Versions(V4_VERSIONS)).toBe(true);
    for (const key of Object.keys(V4_VERSIONS)) expect(validateV4Versions({ ...V4_VERSIONS, [key]: 999 })).toBe(false);
    expect(validateV4Versions({ ...V4_VERSIONS, extra: 1 })).toBe(false);
    expect(resolveWorldEngine({ format: 'lieguoji-world', versions: V4_VERSIONS })).toBeUndefined();
  });
  it('checks identity, complete fingerprint and every preview revision before execution', () => {
    expect(validateCommandEnvelope(command)).toBe(true);
    expect(() => requireCommandContext(command, context)).not.toThrow();
    for (const key of Object.keys(expected)) expect(() => requireCommandContext({ ...command, expected: { ...expected, [key]: 6 } }, context)).toThrow('过期');
    for (const change of [{ worldId: 'another-world' }, { engineFingerprint: 'b'.repeat(64) }]) expect(() => requireCommandContext({ ...command, ...change }, context)).toThrow('身份');
    for (const change of [{ version: 2 }, { expected: { ...expected, world: -1 } }, { expected: { ...expected, world: 0.1 } }, { expected: { ...expected, world: Number.MAX_SAFE_INTEGER } }, { arbitrary: true }, { payload: [] }, { domain: ['simulation'] }, { domain: {} }, { domain: 1 }]) expect(validateCommandEnvelope({ ...command, ...change })).toBe(false);
    expect(command.expected).toEqual(expected);
  });
});
