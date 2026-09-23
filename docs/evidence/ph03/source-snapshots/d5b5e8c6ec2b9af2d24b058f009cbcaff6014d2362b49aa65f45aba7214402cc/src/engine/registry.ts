import * as legacySim from '../compat/v0_4/sim/core';
import * as legacyHistory from '../compat/v0_4/history/core';
import manifest from '../compat/v0_4/manifest.json' with { type: 'json' };
import * as currentSim from '../sim/core';
import * as currentHistory from '../history/core';
import { adaptEngine, createEngineCatalog } from './adapter';
export type { EngineFacade, WorldVersion } from './adapter';

const legacyVersions = [{ schemaVersion: 1, rulesVersion: '0.1.0' }, { schemaVersion: 2, rulesVersion: '0.2.0' }] as const;
export const legacyEngine = adaptEngine(manifest.engineFingerprint, '0.4 兼容引擎', legacySim, legacyHistory, legacyVersions);
// Identical source content is one engine. Do not invent a new fingerprint for a UI change.
// Non-bundled tooling can inspect frozen archives but cannot invent a current build fingerprint.
const currentFingerprint = typeof __SIM_ENGINE__ === 'string' ? __SIM_ENGINE__ : undefined;
const currentEngine = !currentFingerprint || currentFingerprint === legacyEngine.fingerprint ? legacyEngine
  : adaptEngine(currentFingerprint, '开发规则引擎', currentSim, currentHistory, legacyVersions);
const catalog = createEngineCatalog(currentEngine === legacyEngine ? [legacyEngine] : [legacyEngine, currentEngine]);
export const resolveEngine = catalog.resolveEngine;
export const resolveHistoryEngine = catalog.resolveHistoryEngine;
export const registeredEngines = catalog.engines;

/** Ordinary old saves have no fingerprint: their exact version pair is permanently pinned. */
export function resolveWorldEngine(raw: unknown) {
  return legacyEngine.validateWorld(raw) ? legacyEngine : undefined;
}
