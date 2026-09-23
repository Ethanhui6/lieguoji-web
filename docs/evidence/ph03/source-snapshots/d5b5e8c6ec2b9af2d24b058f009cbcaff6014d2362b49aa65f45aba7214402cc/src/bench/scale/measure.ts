import { byteSize, cellAt, digestFixture, digestScaleValue } from './fixture';
import { applyTransaction } from './kernels';
import { appendScaleHistory, branchScaleHistory, createScaleHistory, seekScaleHistory, verifyScaleHistory } from './history';
import type { ScaleControl, ScaleFixture } from './types';
import { measureLegacyBaseline } from './legacy-baseline';
import { measureHistoryStorage } from './history-storage-measure';

export function distribution(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { count: samples.length, min: sorted[0] ?? null, p50: sorted[Math.ceil(sorted.length * .5) - 1] ?? null, p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? null, max: sorted.at(-1) ?? null, raw: samples };
}
function bounded(value: number, maximum: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error('实验采样数量超出明确边界。');
  return value;
}
async function yieldMeasurement(control: ScaleControl, stage: string, completed: number, total: number) {
  control.signal?.throwIfAborted(); control.onProgress?.({ stage, completed, total });
  await control.yieldTask?.(); control.signal?.throwIfAborted();
}

/** These are structural kernels, not measurements of unimplemented social rules. */
export async function measureFixture(source: ScaleFixture, options: { historyLengths?: number[]; querySamples?: number; transactionSamples?: number; persistHistory?: boolean }, control: ScaleControl) {
  const querySamples = bounded(options.querySamples ?? 256, 10_000);
  const transactionSamples = bounded(options.transactionSamples ?? 24, 256);
  const lengths = [...new Set((options.historyLengths ?? [64, 512, 2048]).map(value => bounded(value, 2048)))].sort((a, b) => a - b);
  if (!lengths.length) throw new Error('必须指定至少一个历史长度。');
  const before = await digestFixture(source), started = performance.now();
  const pickMs: number[] = [];
  let hitCount = 0;
  for (let i = 0; i < querySamples; i++) {
    const point = { x: source.atlas.width * ((i * .6180339887498949) % 1), y: source.atlas.height * ((i * .4142135623730951) % 1) };
    const start = performance.now(), hit = cellAt(source, point);
    pickMs.push(performance.now() - start); if (hit !== null && hit !== undefined) hitCount++;
  }
  await yieldMeasurement(control, '关系索引与查询', 0, querySamples);
  const indexStart = performance.now();
  const cities = new Map(source.entities.cities.map(city => [city.id, city]));
  const groupsByCity = new Map<number, number[]>(), peopleByGroup = new Map<number, number[]>(), childrenByAdmin = new Map<number, number[]>();
  for (const group of source.entities.groups) { const list = groupsByCity.get(group.cityId) ?? []; list.push(group.id); groupsByCity.set(group.cityId, list); }
  for (const person of source.entities.people) { const list = peopleByGroup.get(person.groupId) ?? []; list.push(person.id); peopleByGroup.set(person.groupId, list); }
  for (const admin of source.entities.administration) if (admin.parentId !== null) { const list = childrenByAdmin.get(admin.parentId) ?? []; list.push(admin.id); childrenByAdmin.set(admin.parentId, list); }
  const indexMs = performance.now() - indexStart, relationMs: number[] = [];
  let relationChecksum = 0;
  for (let i = 0; i < querySamples; i++) {
    const start = performance.now(), selected = source.entities.cities[i % source.entities.cities.length];
    const city = cities.get(selected.id)!;
    for (const group of groupsByCity.get(city.id) ?? []) relationChecksum += peopleByGroup.get(group)?.length ?? 0;
    relationChecksum += childrenByAdmin.get(source.entities.administration[i % source.entities.administration.length].id)?.length ?? 0;
    relationMs.push(performance.now() - start);
  }
  const editMs: number[] = [], editWithHashMs: number[] = [];
  let working = source;
  for (let i = 0; i < transactionSamples; i++) {
    const start = performance.now();
    const result = applyTransaction(working, { type: 'structure-batch', count: 1 });
    editMs.push(performance.now() - start);
    await digestFixture(result.fixture); editWithHashMs.push(performance.now() - start);
    working = result.fixture;
    await yieldMeasurement(control, '结构事务核（非游戏日结）', i + 1, transactionSamples);
  }

  let history = await createScaleHistory(source, 'scale-measure-history'); working = source;
  const appendMs: number[] = [], historyMeasurements: unknown[] = [];
  for (let seq = 1; seq <= lengths.at(-1)!; seq++) {
    const start = performance.now();
    const result = await appendScaleHistory(history, working, { type: 'structure-batch', count: 1 });
    appendMs.push(performance.now() - start); history = result.history; working = result.fixture;
    if (seq % 8 === 0 || lengths.includes(seq)) await yieldMeasurement(control, '结构记录追加', seq, lengths.at(-1)!);
    if (!lengths.includes(seq)) continue;
    const seekTargets = [...new Set([0, Math.min(31, seq), Math.min(32, seq), Math.floor(seq / 2), seq - 1, seq])];
    const seeks: { seq: number; ms: number; hash: string }[] = [];
    for (const target of seekTargets) {
      const seekStart = performance.now(), state = await seekScaleHistory(history, target, control), hash = await digestFixture(state);
      const expectedHash = target === 0 ? history.initialHash : history.entries[target - 1].afterHash;
      if (hash !== expectedHash) throw new Error('结构seek与记录权威hash不一致。');
      seeks.push({ seq: target, ms: performance.now() - seekStart, hash });
    }
    const verifyStart = performance.now(), verified = await verifyScaleHistory(history, control), verifyMs = performance.now() - verifyStart;
    if (verified.hash !== await digestFixture(working)) throw new Error('结构完整重放与逐步末态不一致。');
    const sourceHistoryHashBefore = await digestScaleValue(history);
    const branchStart = performance.now(), branch = await branchScaleHistory(history, Math.floor(seq / 2), `scale-measure-branch-${seq}`, control);
    const branched = await appendScaleHistory(branch.history, branch.fixture, { type: 'structure-batch', count: 1 });
    const branchMs = performance.now() - branchStart;
    const sourceHistoryHashAfter = await digestScaleValue(history);
    if (branched.history.runId === history.runId || history.entries.length !== seq || await digestFixture(working) !== verified.hash || sourceHistoryHashBefore !== sourceHistoryHashAfter) throw new Error('结构分支改动了源记录。');
    const storage = options.persistHistory ? await measureHistoryStorage(history, control) : null;
    historyMeasurements.push({ length: seq, checkpointCount: history.checkpoints.length, logicalPayloadBytes: byteSize(history), appendMs: distribution(appendMs.slice()), seekMs: distribution(seeks.map(item => item.ms)), seeks, verifyMs, branchMs, branchParent: branch.history.parent, sourceHistoryHashBefore, sourceHistoryHashAfter, tailHash: verified.hash, ...(storage ? { storage } : {}) });
  }
  const after = await digestFixture(source);
  if (after !== before) throw new Error('测量修改了传入原型；原型源不再可信。');
  const elapsedMs = performance.now() - started;
  const legacy = source.options.geoProfile === 'basic' && source.options.entityProfile === 'basic' && source.options.scenario === 'continent' ? await measureLegacyBaseline(control) : null;
  return {
    format: 'lieguoji-scale-worker-measurement', version: 1,
    fixture: { options: source.options, counts: source.counts, sourceHash: before, sourceHashAfter: after, logicalPayloadBytes: byteSize(source) },
    spatialQuery: { hitCount, ms: distribution(pickMs) },
    relationIndex: { buildMs: indexMs, cities: cities.size, populatedCityBuckets: groupsByCity.size, groupPeopleBuckets: peopleByGroup.size, adminParentBuckets: childrenByAdmin.size, checksum: relationChecksum, queryMs: distribution(relationMs) },
    structureTransactions: { count: transactionSamples, computeMs: distribution(editMs), computeAndHashMs: distribution(editWithHashMs) },
    history: historyMeasurements, elapsedMs,
    ...(legacy ? { legacyRuleBaseline: legacy } : {}),
    unmeasuredRules: ['人口迁徙与真实财政物流', '人物/家族生命周期与继承', '信仰传播', '完整外交、战争及自主决策'],
    memory: { logicalPayloadIsNotHeap: true, workerPeakHeapBytes: null, reason: '标准Worker API未提供完整峰值堆内存。' },
  };
}
