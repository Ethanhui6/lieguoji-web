import type * as Sim from '../sim/core';
import type * as History from '../history/core';
import type { World } from '../sim/types';
import type { HistoryLog, HistoryParent } from '../history/types';

export type WorldVersion = Readonly<{ schemaVersion: number; rulesVersion: string }>;
export type EngineFacade = Readonly<Pick<typeof Sim,
  'validateWorld' | 'advanceWorld' | 'issueOrder' | 'applyStateAction' | 'previewOrder' |
  'previewStateAction' | 'canCommandArmy' | 'isAtWar' | 'nationReports' | 'policyOptions' | 'initializeStatecraft'> & {
  fingerprint: string;
  label: string;
  supportedWorldVersions: readonly WorldVersion[];
  hashWorld: typeof History.hashWorld;
  validateHistory: typeof History.validateHistory;
  verifyHistoryIntegrity: typeof History.verifyHistoryIntegrity;
  createHistory(world: World, options: { runId: string; parent?: HistoryParent }): Promise<HistoryLog>;
  appendHistory(history: HistoryLog, world: World, input: Parameters<typeof History.appendHistory>[2]): ReturnType<typeof History.appendHistory>;
  verifyHistory(history: HistoryLog): Promise<void>;
  seekHistory(history: HistoryLog, seq: number): Promise<World>;
}>;

/** A static adapter binds all execution paths to one compiled rule implementation. */
export function adaptEngine(fingerprint: string, label: string, sim: typeof Sim, history: typeof History,
  versions: readonly WorldVersion[]): EngineFacade {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('引擎指纹必须为完整 SHA-256。');
  const supportedWorldVersions = Object.freeze(versions.map(version => Object.freeze({ ...version })));
  const supports = (world: World) => supportedWorldVersions.some(version => version.schemaVersion === world.schemaVersion && version.rulesVersion === world.rulesVersion);
  const validateWorld = (raw: unknown): raw is World => sim.validateWorld(raw) && supports(raw);
  const checkedWorld = (world: World): World => {
    if (!validateWorld(world)) throw new Error('此引擎不支持该世界版本或世界状态无效。');
    return world;
  };
  const validateHistory = (raw: unknown): raw is HistoryLog => history.validateHistory(raw) &&
    validateWorld(raw.initial.world) && raw.checkpoints.every(point => validateWorld(point.world));
  const checkedHistory = (log: HistoryLog) => {
    if (!validateHistory(log)) throw new Error('此引擎不支持该历史版本或记录结构无效。');
    return log;
  };
  return Object.freeze({
    fingerprint, label, supportedWorldVersions,
    validateWorld,
    advanceWorld: (world, days) => checkedWorld(sim.advanceWorld(checkedWorld(world), days)),
    issueOrder: (world, order) => checkedWorld(sim.issueOrder(checkedWorld(world), order)),
    applyStateAction: (world, action, expected) => checkedWorld(sim.applyStateAction(checkedWorld(world), action, expected)),
    previewOrder: (world, order) => sim.previewOrder(checkedWorld(world), order),
    previewStateAction: (world, action) => sim.previewStateAction(checkedWorld(world), action),
    canCommandArmy: (world, army) => sim.canCommandArmy(checkedWorld(world), army),
    isAtWar: (world, a, b) => sim.isAtWar(checkedWorld(world), a, b),
    nationReports: world => sim.nationReports(checkedWorld(world)), policyOptions: sim.policyOptions,
    initializeStatecraft: (world, relations) => checkedWorld(sim.initializeStatecraft(checkedWorld(world), relations)),
    hashWorld: async world => history.hashWorld(checkedWorld(world)), validateHistory,
    verifyHistoryIntegrity: async log => history.verifyHistoryIntegrity(checkedHistory(log)),
    createHistory: (world: World, options: { runId: string; parent?: HistoryParent }) => {
      if (!validateWorld(world)) return Promise.reject(new Error('此引擎不支持该世界版本。'));
      // The fixed fingerprint comes last; a JavaScript caller cannot inject another one.
      return history.createHistory(world, { ...options, engineFingerprint: fingerprint });
    },
    appendHistory: async (log, world, input) => {
      const result = await history.appendHistory(checkedHistory(log), checkedWorld(world), input, fingerprint);
      checkedWorld(result.world); checkedHistory(result.history); return result;
    },
    verifyHistory: async log => history.verifyHistory(checkedHistory(log), fingerprint),
    seekHistory: async (log, seq) => checkedWorld(await history.seekHistory(checkedHistory(log), seq, fingerprint)),
  });
}

/** An immutable, explicit catalog; a save can never name a URL or load code. */
export function createEngineCatalog(engines: readonly EngineFacade[]) {
  const table = new Map<string, EngineFacade>();
  for (const engine of engines) {
    if (!/^[a-f0-9]{64}$/.test(engine.fingerprint) || table.has(engine.fingerprint)) throw new Error('引擎注册指纹无效或重复。');
    table.set(engine.fingerprint, engine);
  }
  const resolveEngine = (fingerprint: string) => table.get(fingerprint);
  const resolveHistoryEngine = (raw: unknown): EngineFacade | undefined => {
    if (!raw || typeof raw !== 'object' || !('engineFingerprint' in raw) || typeof raw.engineFingerprint !== 'string') return;
    const engine = resolveEngine(raw.engineFingerprint);
    return engine?.validateHistory(raw) && engine.validateWorld(raw.initial.world) ? engine : undefined;
  };
  return Object.freeze({ resolveEngine, resolveHistoryEngine, engines: Object.freeze([...table.values()]) });
}
