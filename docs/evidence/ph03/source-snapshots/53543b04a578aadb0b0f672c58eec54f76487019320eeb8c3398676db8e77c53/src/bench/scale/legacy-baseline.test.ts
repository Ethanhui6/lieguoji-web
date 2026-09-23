import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureLegacyBaseline } from './legacy-baseline';
import { legacyEngine } from '../../engine/registry';
import modernGoldenFile from '../../compat/fixtures/golden-0.4-modern.json';

afterEach(() => vi.unstubAllGlobals());

describe('real frozen 0.4 performance baseline', () => {
  it('executes actual campaign and management rules with exact golden replay and no database access', async () => {
    const databaseOpen = vi.fn(() => { throw new Error('Baseline must never open IndexedDB'); });
    vi.stubGlobal('indexedDB', { open: databaseOpen });
    const source = JSON.stringify(modernGoldenFile);
    const result = await measureLegacyBaseline({ yieldTask: async () => {} });
    expect(result.engine.fingerprint).toBe(legacyEngine.fingerprint);
    expect(result.campaign).toMatchObject({ rulesVersion: '0.1.0', measuredDays: 64, startDay: 0, endDay: 64, initialCounts: { nations: 5, provinces: 12, cities: 7, armies: 8 } });
    expect(result.campaign.initialHash).toBe(result.campaign.sourceHashAfter);
    expect(result.campaign.finalHash).not.toBe(result.campaign.initialHash);
    expect(result.campaign.observedNewEvents.march).toBeGreaterThan(0);
    expect(result.campaign.observedNewEvents.battle).toBeGreaterThan(0);
    expect(result.campaign.history).toBeNull();
    const recorded = result.managementHistory;
    expect(recorded.rulesVersion).toBe('0.2.0');
    expect(recorded.finalHash).toBe(modernGoldenFile.history.entries.at(-1)!.after.hash);
    expect(recorded.initialHash).toBe(recorded.sourceHashAfter);
    expect(recorded.checkpointPositions).toEqual([32, 64]);
    expect(recorded.executed).toHaveLength(70);
    expect(recorded.executed.map(entry => entry.hash)).toEqual(modernGoldenFile.history.entries.map(entry => entry.after.hash));
    expect(recorded.dayComputeMs.count + recorded.orderComputeMs.count + recorded.stateActionComputeMs.count).toBe(70);
    expect(recorded.dayComputeMs.count).toBeGreaterThan(0);
    expect(recorded.stateActionComputeMs.count).toBeGreaterThan(0);
    expect(recorded.seeks.map(sample => sample.seq)).toEqual([0, 1, 4, 31, 32, 33, 63, 64, 65, 69, 70]);
    for (const sample of recorded.seeks) expect(sample.hash).toBe(sample.seq === 0 ? modernGoldenFile.history.initial.hash : modernGoldenFile.history.entries[sample.seq - 1].after.hash);
    for (const times of [result.campaign.dayComputeMs, result.campaign.worldHashMs, recorded.dayComputeMs, recorded.worldHashMs, recorded.seekMs]) {
      expect(times.raw).toHaveLength(times.count);
      expect(times.raw.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
      expect(times.p95).toBeLessThanOrEqual(times.max!);
    }
    expect(recorded.completeReplayVerified).toBe(true);
    expect(recorded.reports.count).toBe(recorded.finalCounts.nations);
    expect(JSON.stringify(modernGoldenFile)).toBe(source);
    expect(databaseOpen).not.toHaveBeenCalled();
  }, 60_000);

  it('rejects a pre-cancelled measurement without producing timings or progress', async () => {
    const controller = new AbortController(); controller.abort();
    const onProgress = vi.fn();
    await expect(measureLegacyBaseline({ signal: controller.signal, onProgress })).rejects.toMatchObject({ name: 'AbortError' });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('honours cancellation between real day samples and preserves the imported source', async () => {
    const controller = new AbortController(), stages: string[] = [], source = JSON.stringify(modernGoldenFile);
    await expect(measureLegacyBaseline({
      signal: controller.signal, yieldTask: async () => {},
      onProgress: progress => { stages.push(progress.stage); if (progress.stage === '0.4 测试战役真实逐日' && progress.completed === 8) controller.abort(); },
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(stages).toContain('0.4 测试战役真实逐日');
    expect(stages).not.toContain('0.4 经营外交军事真实输入');
    expect(JSON.stringify(modernGoldenFile)).toBe(source);
  });
});
