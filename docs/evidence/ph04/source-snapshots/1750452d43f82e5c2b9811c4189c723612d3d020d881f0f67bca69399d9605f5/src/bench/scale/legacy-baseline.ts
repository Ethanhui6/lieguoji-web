import { legacyEngine, resolveHistoryEngine } from '../../engine/registry';
import { createWorld } from '../../sim/demo';
import modernGoldenFile from '../../compat/fixtures/golden-0.4-modern.json';
import type { HistoryInput } from '../../history/types';
import type { World } from '../../sim/types';
import type { ScaleControl } from './types';

const CAMPAIGN_DAYS = 64;
const SEEK_TARGETS = [0, 1, 4, 31, 32, 33, 63, 64, 65, 69, 70] as const;

function distribution(raw: number[]) {
  const sorted = [...raw].sort((a, b) => a - b);
  return {
    count: raw.length, min: sorted[0] ?? null,
    p50: sorted[Math.max(0, Math.ceil(sorted.length * .5) - 1)] ?? null,
    p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? null,
    max: sorted.at(-1) ?? null, raw,
  };
}

function counts(world: World) {
  return {
    nations: world.nations.length, provinces: world.provinces.length,
    polygonVertices: world.provinces.reduce((sum, province) => sum + province.polygon.length, 0),
    cities: world.cities.length, armies: world.armies.length,
    economyRegions: world.statecraft?.provinces.length ?? 0,
    diplomaticRelations: world.statecraft?.relations.length ?? 0,
    retainedEvents: world.events.length,
  };
}

function tallyEvents(world: World, seen: Set<number>, tally: Record<string, number>) {
  for (const event of world.events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id); tally[event.kind] = (tally[event.kind] ?? 0) + 1;
  }
}

async function checkpoint(control: ScaleControl, stage: string, completed: number, total: number) {
  control.signal?.throwIfAborted();
  control.onProgress?.({ stage, completed, total });
  if (control.yieldTask) await control.yieldTask();
  else await new Promise<void>(resolve => setTimeout(resolve, 0));
  control.signal?.throwIfAborted();
}

function execute(world: World, input: HistoryInput): World {
  if (input.type === 'step') return legacyEngine.advanceWorld(world, input.days);
  if (input.type === 'order') return legacyEngine.issueOrder(world, input.order);
  return legacyEngine.applyStateAction(world, input.action, input.expected);
}

/**
 * Real frozen 0.4 rules, separate from PH03 synthetic structural transactions.
 * Pure in-memory work: no database, production worker, save or rule mutation.
 * Timings include the registered facade's validation; hashing is measured apart.
 */
export async function measureLegacyBaseline(control: ScaleControl = {}) {
  control.signal?.throwIfAborted();
  const started = performance.now();
  await checkpoint(control, '0.4 固定测试战役', 0, CAMPAIGN_DAYS);
  const campaignSource = createWorld();
  const validationStarted = performance.now();
  if (!legacyEngine.validateWorld(campaignSource)) throw new Error('旧版测试战役不符合冻结引擎，不能作为真实规则基线。');
  const campaignValidationMs = performance.now() - validationStarted;
  const campaignSourceHash = await legacyEngine.hashWorld(campaignSource);
  const order = { armyId: 'lie-main', targetId: 'ming-border', kind: 'march' as const };
  const previewStarted = performance.now(), preview = legacyEngine.previewOrder(campaignSource, order);
  const previewMs = performance.now() - previewStarted;
  if (!preview.valid) throw new Error('固定测试战役的基准行军令已无效，拒绝测量静止世界代替战争。');
  const orderStarted = performance.now();
  let campaign = legacyEngine.issueOrder(campaignSource, order);
  const issueOrderMs = performance.now() - orderStarted;
  const campaignCompute: number[] = [], campaignHashes: number[] = [];
  const campaignSeen = new Set(campaignSource.events.map(event => event.id));
  const campaignEvents: Record<string, number> = {};
  tallyEvents(campaign, campaignSeen, campaignEvents);
  let campaignFinalHash = '';
  for (let index = 0; index < CAMPAIGN_DAYS; index++) {
    control.signal?.throwIfAborted();
    const start = performance.now(), next = legacyEngine.advanceWorld(campaign, 1);
    campaignCompute.push(performance.now() - start);
    if (next.day !== campaign.day + 1) throw new Error('冻结战役未真实推进一日。');
    const hashStarted = performance.now();
    campaignFinalHash = await legacyEngine.hashWorld(next);
    campaignHashes.push(performance.now() - hashStarted);
    tallyEvents(next, campaignSeen, campaignEvents); campaign = next;
    if ((index + 1) % 8 === 0) await checkpoint(control, '0.4 测试战役真实逐日', index + 1, CAMPAIGN_DAYS);
  }
  const campaignSourceHashAfter = await legacyEngine.hashWorld(campaignSource);
  if (campaignSourceHashAfter !== campaignSourceHash) throw new Error('旧版测量修改了源测试战役，结果无效。');
  if (!(campaignEvents.march > 0) || !(campaignEvents.battle > 0)) throw new Error('固定战役没有产生实际行军与交战，不能作为预期负载。');

  const rawHistory: unknown = structuredClone(modernGoldenFile.history);
  const historyValidationStarted = performance.now();
  if (!legacyEngine.validateHistory(rawHistory) || resolveHistoryEngine(rawHistory) !== legacyEngine) throw new Error('0.4 固定经营历史未匹配真实冻结引擎。');
  const historyValidationMs = performance.now() - historyValidationStarted;
  const history = rawHistory, originalHistory = JSON.stringify(history);
  const source = history.initial.world, sourceHash = await legacyEngine.hashWorld(source);
  if (sourceHash !== history.initial.hash) throw new Error('0.4 固定历史的初态校验不符。');
  if (history.entries.length !== 70 || source.rulesVersion !== '0.2.0') throw new Error('基准历史范围发生变化，须重新定义测量而不是静默换样本。');
  const compute: Record<HistoryInput['type'], number[]> = { step: [], order: [], 'state-action': [] };
  const hashMs: number[] = [], eventTally: Record<string, number> = {};
  const seen = new Set(source.events.map(event => event.id));
  const executed: { seq: number; type: HistoryInput['type']; day: number; computeMs: number; hashMs: number; hash: string }[] = [];
  let world = structuredClone(source), finalHash = sourceHash;
  for (const entry of history.entries) {
    control.signal?.throwIfAborted();
    if (entry.before.hash !== finalHash || entry.before.day !== world.day || entry.before.nextEventId !== world.nextEventId) throw new Error('固定历史的输入起点不匹配。');
    const start = performance.now(), next = execute(world, entry.input), duration = performance.now() - start;
    compute[entry.input.type].push(duration);
    const hashStarted = performance.now();
    finalHash = await legacyEngine.hashWorld(next);
    const hashDuration = performance.now() - hashStarted; hashMs.push(hashDuration);
    if (entry.after.hash !== finalHash || entry.after.day !== next.day || entry.after.nextEventId !== next.nextEventId) throw new Error(`冻结引擎在固定历史第 ${entry.seq} 条出现不同结果，基线无效。`);
    tallyEvents(next, seen, eventTally); world = next;
    executed.push({ seq: entry.seq, type: entry.input.type, day: next.day, computeMs: duration, hashMs: hashDuration, hash: finalHash });
    if (entry.seq % 8 === 0 || entry.seq === history.entries.length) await checkpoint(control, '0.4 经营外交军事真实输入', entry.seq, history.entries.length);
  }

  const seeks: { seq: number; day: number; seekMs: number; hashCheckMs: number; hash: string }[] = [];
  for (const seq of SEEK_TARGETS) {
    await checkpoint(control, '0.4 真实历史定位', seeks.length, SEEK_TARGETS.length);
    const start = performance.now(), restored = await legacyEngine.seekHistory(history, seq), seekMs = performance.now() - start;
    const hashStarted = performance.now(), hash = await legacyEngine.hashWorld(restored), hashCheckMs = performance.now() - hashStarted;
    const expected = seq === 0 ? history.initial.hash : history.entries[seq - 1].after.hash;
    if (hash !== expected) throw new Error(`冻结引擎历史定位 ${seq} 校验失败。`);
    seeks.push({ seq, day: restored.day, seekMs, hashCheckMs, hash });
  }
  await checkpoint(control, '0.4 全历史完整重算', 0, history.entries.length);
  const verifyStarted = performance.now();
  await legacyEngine.verifyHistory(history);
  const completeReplayVerificationMs = performance.now() - verifyStarted;
  control.signal?.throwIfAborted();
  const reportsStarted = performance.now(), reports = legacyEngine.nationReports(world), nationReportsMs = performance.now() - reportsStarted;
  const sourceHashAfter = await legacyEngine.hashWorld(source);
  if (sourceHashAfter !== sourceHash || JSON.stringify(history) !== originalHistory) throw new Error('基线测量修改了源历史或源世界，结果无效。');
  await checkpoint(control, '0.4 真实规则基线完成', history.entries.length, history.entries.length);

  return {
    format: 'lieguoji-legacy-rule-baseline' as const, version: 1 as const,
    engine: { label: legacyEngine.label, fingerprint: legacyEngine.fingerprint, implementation: 'src/compat/v0_4', dispatch: 'registered frozen EngineFacade' },
    campaign: {
      fixture: 'src/sim/demo.ts#createWorld', scenario: campaignSource.scenario, seed: null,
      seedExplanation: '固定手工测试战役，无随机数或时钟输入；初态摘要记录实际数据。',
      schemaVersion: campaignSource.schemaVersion, rulesVersion: campaignSource.rulesVersion,
      startDay: campaignSource.day, endDay: campaign.day, measuredDays: CAMPAIGN_DAYS,
      initialCounts: counts(campaignSource), finalCounts: counts(campaign), initialHash: campaignSourceHash,
      sourceHashAfter: campaignSourceHashAfter, finalHash: campaignFinalHash, validationMs: campaignValidationMs,
      command: { order, route: preview.route, previewMs, issueOrderMs },
      dayComputeMs: distribution(campaignCompute), worldHashMs: distribution(campaignHashes), observedNewEvents: campaignEvents,
      history: null, historyReason: '测试大陆原局不支持自建世界历史包；没有伪造转换。',
    },
    managementHistory: {
      fixture: 'src/compat/fixtures/golden-0.4-modern.json', scenario: source.scenario, seed: source.custom?.seed ?? null,
      runId: history.runId, schemaVersion: source.schemaVersion, rulesVersion: source.rulesVersion,
      startDay: source.day, endDay: world.day, initialCounts: counts(source), finalCounts: counts(world),
      initialHash: sourceHash, sourceHashAfter, finalHash, expectedFinalHash: history.entries.at(-1)!.after.hash,
      historyLength: history.entries.length, checkpointEvery: history.checkpointEvery,
      checkpointPositions: history.checkpoints.map(point => point.seq), validationMs: historyValidationMs,
      dayComputeMs: distribution(compute.step), orderComputeMs: distribution(compute.order), stateActionComputeMs: distribution(compute['state-action']),
      worldHashMs: distribution(hashMs), executed, observedNewEvents: eventTally,
      seeks, seekMs: distribution(seeks.map(sample => sample.seekMs)), completeReplayVerificationMs,
      reports: { count: reports.length, nationReportsMs, population: reports.reduce((sum, report) => sum + report.population, 0), grain: reports.reduce((sum, report) => sum + report.grain, 0) },
      verifiedEveryInputHash: true, verifiedEverySeekHash: true, completeReplayVerified: true, sourceUnchanged: true,
    },
    elapsedMs: performance.now() - started,
    timingBoundary: '当前调用线程中的冻结EngineFacade实际调用；包含其版本/状态检查。SHA-256另测；不含消息传输、地图渲染、IndexedDB或文件IO。未预热、未剔除最慢样本。',
    limitations: [
      '这是既有0.4小规模真实规则基线，不是16,384/65,536/262,144大世界的完整推演成绩。',
      '固定输入有行军、交战、经营和外交；后期负载可能因战局结束变化，原始逐次数据全部保留。',
      '没有测量尚未实现的人物生命周期、家族继承、信仰传播或未来完整社会规则。',
      '取消在采样边界生效；单次同步日结或冻结seek/verify调用不承诺可中途抢占。',
    ],
  };
}
