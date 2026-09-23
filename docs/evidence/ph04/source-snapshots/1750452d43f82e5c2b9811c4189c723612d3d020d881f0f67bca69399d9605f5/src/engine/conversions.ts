import { legacyEngine, resolveWorldEngine } from './registry';
import type { World } from '../sim/types';

/** The only currently implemented rule conversion; never called by read/load/seek. */
export function prepareManagementCopy(world: World): World {
  const source = structuredClone(world);
  const engine = resolveWorldEngine(source);
  if (engine !== legacyEngine || source.schemaVersion !== 1 || source.rulesVersion !== '0.1.0' || source.scenario !== 'custom-world') {
    throw new Error('只能为已核验的旧版自建世界创建经营规则副本，原世界保留。');
  }
  const copy = engine.initializeStatecraft(source, 'war');
  if (!engine.validateWorld(copy) || copy.schemaVersion !== 2 || copy.rulesVersion !== '0.2.0') throw new Error('经营副本未通过目标规则校验，原世界保留。');
  // The caller allocates a fresh run and database; this function never accesses storage.
  return copy;
}
