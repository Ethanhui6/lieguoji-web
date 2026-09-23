import { elevationAt, validateFixture, validateState } from './fixture';
import type { ScaleFixture, ScaleState, ScaleTransaction, ScaleTransactionResult, ScaleUndo } from './types';

function assertFixture(fixture: ScaleFixture) { if (!validateFixture(fixture)) throw new Error('联合结构数据未通过校验，原数据保持不变。'); }
function id(value: number, length: number) { return Number.isSafeInteger(value) && value >= 0 && value < length; }

/** Pure transactions: unchanged atlas/entities are shared; changed state arrays are copied. */
export function applyTransaction(fixture: ScaleFixture, input: ScaleTransaction): ScaleTransactionResult {
  assertFixture(fixture);
  if (!input || typeof input !== 'object' || fixture.state.revision >= 1_000_000) throw new Error('结构事务或修订号无效，原数据保持不变。');
  const before = fixture.state;
  let state: ScaleState = { ...before, revision: before.revision + 1 }, summary: string;
  if (input.type === 'elevation') {
    if (!Array.isArray(input.cellIds) || input.cellIds.length < 1 || input.cellIds.length > 4096 || new Set(input.cellIds).size !== input.cellIds.length || !input.cellIds.every(value => id(value, fixture.atlas.land.length)) || !Number.isFinite(input.delta) || input.delta === 0 || Math.abs(input.delta) > 0.5) throw new Error('局部高程编辑参数无效，原数据保持不变。');
    const changes = new Map(before.elevationOverrides.map(item => [item.cellId, item.elevation]));
    for (const cell of input.cellIds) { const elevation = Math.min(1, Math.max(0, elevationAt(fixture, cell) + input.delta)); if (elevation === fixture.atlas.elevation[cell]) changes.delete(cell); else changes.set(cell, elevation); }
    state.elevationOverrides = [...changes].sort(([a], [b]) => a - b).map(([cellId, elevation]) => ({ cellId, elevation }));
    summary = `已调整 ${input.cellIds.length} 个地理样本的高程；海陆拓扑保持不变。`;
  } else if (input.type === 'administration') {
    if (!id(input.regionId, fixture.entities.regions.length) || !id(input.adminId, fixture.entities.administration.length) || !fixture.entities.administration[input.adminId].leaf || before.regionAdmin[input.regionId] === input.adminId) throw new Error('行政改隶需要一个有效且不同的行政叶单位，原数据保持不变。');
    state.regionAdmin = before.regionAdmin.slice(); state.regionAdmin[input.regionId] = input.adminId;
    summary = `模拟区 ${input.regionId} 已改隶至 ${fixture.entities.administration[input.adminId].name}；城市和群体继续引用同一区域。`;
  } else if (input.type === 'structure-batch') {
    if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > 32 || before.batch + input.count > 1_000_000) throw new Error('结构批次必须为 1—32，原数据保持不变。');
    state.grain = before.grain.slice(); state.batch += input.count;
    let produced = 0, consumed = 0;
    // A deliberately narrow, deterministic aggregate kernel. No migration,
    // faith, family lifecycle, economy AI, combat or complete social-day claim.
    for (const group of fixture.entities.groups) {
      const cell = fixture.entities.cities[group.cityId].cellId, people = before.population[group.id];
      const fertility = 0.7 + fixture.atlas.moisture[cell] * 0.6 - elevationAt(fixture, cell) * 0.25;
      const production = Math.floor(people * fertility), need = people;
      let grain = state.grain[group.id];
      for (let batch = 0; batch < input.count; batch++) { const actualProduction = Math.min(1e12 - grain, production); grain += actualProduction; const actualConsumption = Math.min(grain, need); grain -= actualConsumption; produced += actualProduction; consumed += actualConsumption; }
      state.grain[group.id] = grain;
    }
    summary = `完成 ${input.count} 个合成结构批次：产出 ${produced}，消耗 ${consumed}；人口不变，尚未测量完整社会规则。`;
  } else if (input.type === 'restore-state') {
    if (!validateState(input.state, fixture)) throw new Error('撤销状态未通过引用和数值校验，原数据保持不变。');
    state = { ...structuredClone(input.state), revision: before.revision + 1 };
    summary = '已恢复结构状态并建立新修订；原历史仍保留。';
  } else throw new Error('不支持的结构事务，原数据保持不变。');
  const next = { ...fixture, state };
  if (!validateState(state, next)) throw new Error('结构事务结果未通过校验，原数据保持不变。');
  return { fixture: next, undo: { expectedRevision: state.revision, before }, summary };
}

export function undoTransaction(fixture: ScaleFixture, token: ScaleUndo): ScaleTransactionResult {
  if (!token || token.expectedRevision !== fixture.state.revision) throw new Error('撤销目标已经过期，请保留当前状态。');
  return applyTransaction(fixture, { type: 'restore-state', state: token.before });
}

/** Territorial links derive through the current administration, without copied nation fields. */
export function groupNation(fixture: ScaleFixture, groupId: number): number {
  if (!id(groupId, fixture.entities.groups.length)) throw new Error('人口群体编号无效。');
  const group = fixture.entities.groups[groupId], regionId = fixture.entities.cities[group.cityId].regionId;
  return fixture.entities.administration[fixture.state.regionAdmin[regionId]].nationId;
}
