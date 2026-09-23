import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import manifest from './v0_4/manifest.json';
import { hashWorld, seekHistory, validateHistory, verifyHistory } from './v0_4/history/core';
import type { HistoryLog } from './v0_4/history/types';
import type { World } from './v0_4/sim/types';

const COMMIT = '8d716dda2c92373c62f87aef700c3d93984c4472';
const ENGINE = '65333e9ed3fccd77c6e5bf32a9a3d0396df2990f2ad1ede7f952aec1217851c5';
const GOLDEN_HASHES = {
  modern: '4d16f2dde357f88b2184aaa5231764ac80471d247a477aa71ab6af262d6136fe',
  legacy: '0348153dbe9b0221374b8d5fb764bd03f13bec910adc47a372e74ef04266466d',
};
const SOURCE_PATHS = ['src/sim/core.ts', 'src/sim/statecraft.ts', 'src/sim/types.ts', 'src/history/core.ts', 'src/history/types.ts'];
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url));
const normalized = (relative: string) => read(relative).toString('utf8').replace(/\r\n/g, '\n');
const parse = <T>(relative: string): T => JSON.parse(normalized(relative)) as T;
const fixturePath = (name: string) => `./fixtures/${name}`;

type ExportedHistory = { format: string; version: number; checksum: string; history: HistoryLog };
type Expected = {
  sourceCommit: string;
  engineFingerprint: string;
  initialHash: string;
  finalHash: string;
  entryHashes: { seq: number; day: number; hash: string }[];
  checkpoints: { seq: number; day: number; hash: string }[];
  inputs: Record<string, number>;
  observedEvents: Record<string, number>;
};

// Snapshot the checked-in bytes, not rewritten JSON. Line endings are normalized
// only for fixed content digests so a CRLF Git checkout keeps the same evidence.
const evidencePaths = [
  './v0_4/manifest.json',
  ...manifest.files.map(file => `./v0_4/${file.frozenPath}`),
  ...manifest.fixtures.files.map(file => fixturePath(file.path)),
];
const evidenceBytes = evidencePaths.map(path => ({ path, bytes: read(path) }));
afterAll(() => {
  for (const { path, bytes } of evidenceBytes) expect(read(path).equals(bytes), `${path} was rewritten`).toBe(true);
});

describe('0.4 frozen provenance and source closure', () => {
  it('retains all five original logical paths, source hashes and the fixed aggregate fingerprint', () => {
    expect(manifest.sourceCommit).toBe(COMMIT);
    expect(manifest.engineFingerprint).toBe(ENGINE);
    expect(manifest.files.map(file => file.path)).toEqual(SOURCE_PATHS);
    const aggregate = createHash('sha256');
    for (const file of manifest.files) {
      const source = normalized(`./v0_4/${file.frozenPath}`);
      expect(file.frozenPath).toBe(file.path.replace(/^src\//, ''));
      expect(sha(source), file.path).toBe(file.normalizedSha256);
      expect(Buffer.byteLength(source), file.path).toBe(file.bytes);
      aggregate.update(`${file.path}\n${source}\n`);
      const imports = [...source.matchAll(/(?:import|export)[^\n]*?from\s+['"]([^'"]+)['"]/g)];
      for (const [, target] of imports) {
        expect(target.startsWith('.'), `${file.path} imports an external module`).toBe(true);
        const logicalTarget = `${posix.normalize(posix.join(posix.dirname(file.path), target))}.ts`;
        expect(SOURCE_PATHS, `${file.path} escapes the frozen closure`).toContain(logicalTarget);
      }
    }
    expect(aggregate.digest('hex')).toBe(ENGINE);
  });

  it('retains fixed synthetic fixture bytes and excludes temporary compilation or machine paths', () => {
    expect(manifest.fixtures.synthetic).toBe(true);
    expect(manifest.fixtures.files).toHaveLength(8);
    for (const file of manifest.fixtures.files) {
      const bytes = normalized(fixturePath(file.path));
      expect(sha(bytes), file.path).toBe(file.normalizedSha256);
      expect(Buffer.byteLength(bytes), file.path).toBe(file.bytes);
      expect(file.path).not.toMatch(/(?:^|[/\\])\.\.|^[a-z]:|\.history\.json$/i);
    }
    expect(normalized('./v0_4/manifest.json')).not.toMatch(/compiledSha256|transpiler|[a-z]:\\|Users\\/i);
    for (const kind of ['modern', 'legacy'] as const) {
      expect(sha(normalized(fixturePath(`golden-0.4-${kind}.json`)))).toBe(GOLDEN_HASHES[kind]);
    }
  });
});

for (const kind of ['modern', 'legacy'] as const) {
  describe(`0.4 ${kind} fixed 70-input history`, () => {
    const exported = parse<ExportedHistory>(fixturePath(`golden-0.4-${kind}.json`));
    const expected = parse<Expected>(fixturePath(`golden-0.4-${kind}.expected.json`));
    const finalWorld = parse<World>(fixturePath(`golden-0.4-${kind}.final-world.json`));
    const history = exported.history;
    const originalHistory = JSON.stringify(history);
    const observedEvents: Record<string, number> = {};
    const visited = new Set<number>();
    const schemaVersion = kind === 'modern' ? 2 : 1;
    const rulesVersion = kind === 'modern' ? '0.2.0' : '0.1.0';

    afterAll(() => {
      expect(JSON.stringify(history), `${kind}: caller-owned history changed`).toBe(originalHistory);
      expect([...visited].sort((a, b) => a - b)).toEqual(Array.from({ length: 71 }, (_, seq) => seq));
      expect(observedEvents).toEqual(expected.observedEvents);
    });

    it('preserves the source world, envelope checksum, input order and fixed checkpoints', async () => {
      expect(exported).toMatchObject({ format: 'lieguoji-history-export', version: 1 });
      expect(sha(JSON.stringify(history))).toBe(exported.checksum);
      expect(expected).toMatchObject({ sourceCommit: COMMIT, engineFingerprint: ENGINE });
      expect(validateHistory(history)).toBe(true);
      expect(history).toMatchObject({ engineFingerprint: ENGINE, rulesVersion, checkpointEvery: 32 });
      expect(history.entries).toHaveLength(70);
      expect(expected.entryHashes.map(state => state.seq)).toEqual(Array.from({ length: 71 }, (_, seq) => seq));
      expect(history.checkpoints.map(checkpoint => checkpoint.seq)).toEqual([32, 64]);
      expect(history.initial.hash).toBe(expected.initialHash);
      expect(history.entries.at(-1)?.after.hash).toBe(expected.finalHash);
      const inputs: Record<string, number> = {};
      for (const { input } of history.entries) {
        const key = input.type === 'step' ? 'step' : input.type === 'order' ? `order:${input.order.kind}` : `state-action:${input.action.type}`;
        inputs[key] = (inputs[key] ?? 0) + 1;
      }
      expect(inputs).toEqual(expected.inputs);
      if (kind === 'modern') {
        const source = parse<ExportedHistory>(fixturePath('modern-source.json'));
        const before = JSON.stringify(source);
        expect(sha(JSON.stringify(source.history))).toBe(source.checksum);
        expect(history.initial.world).toEqual(source.history.initial.world);
        await verifyHistory(source.history, ENGINE);
        expect(JSON.stringify(source)).toBe(before);
      } else {
        const source = parse<{ world: World; checksum: string }>(fixturePath('legacy-source.json'));
        expect(sha(JSON.stringify(source.world))).toBe(source.checksum);
        expect(source.checksum).toBe(manifest.fixtures.legacySource.saveChecksum);
        expect(history.initial.world).toEqual(source.world);
        expect(history.initial.world.day).toBe(7);
        expect(history.initial.world.armies.some(army => army.status === 'marching')).toBe(true);
      }
    });

    it('verifies all 70 transitions from the initial state with the frozen engine', async () => {
      await expect(verifyHistory(history, ENGINE)).resolves.toBeUndefined();
      expect(JSON.stringify(history)).toBe(originalHistory);
    });

    it.each(expected.entryHashes)('seeks fixed seq $seq / day $day without migration', async state => {
      const world = await seekHistory(history, state.seq, ENGINE);
      expect(world.day).toBe(state.day);
      expect(await hashWorld(world)).toBe(state.hash);
      expect(world).toMatchObject({ schemaVersion, rulesVersion });
      expect(Object.hasOwn(world, 'statecraft')).toBe(kind === 'modern');
      expect(world.custom?.id).toBe(history.runId);
      if (state.seq > 0) {
        const beforeEventId = history.entries[state.seq - 1].before.nextEventId;
        for (const event of world.events.filter(event => event.id >= beforeEventId)) {
          observedEvents[event.kind] = (observedEvents[event.kind] ?? 0) + 1;
        }
      }
      if (state.seq === 70) {
        expect(world).toEqual(finalWorld);
        expect(await hashWorld(finalWorld)).toBe(expected.finalHash);
      }
      visited.add(state.seq);
    });

    it.each(expected.checkpoints)('retains fixed checkpoint $seq and its world digest', async point => {
      const actual = history.checkpoints.find(checkpoint => checkpoint.seq === point.seq);
      expect(actual).toBeDefined();
      expect(actual?.hash).toBe(point.hash);
      expect(actual?.world.day).toBe(point.day);
      expect(await hashWorld(actual!.world)).toBe(point.hash);
    });

    it('rejects a changed initial snapshot and leaves both source and rejected input untouched', async () => {
      const tampered = structuredClone(history);
      tampered.initial.world.armies[0].troops++;
      const before = JSON.stringify(tampered);
      expect(validateHistory(tampered)).toBe(true);
      await expect(verifyHistory(tampered, ENGINE)).rejects.toThrow('检查点 0 的校验和不匹配');
      await expect(seekHistory(tampered, 0, ENGINE)).rejects.toThrow('检查点 0 的校验和不匹配');
      expect(JSON.stringify(tampered)).toBe(before);
      expect(JSON.stringify(history)).toBe(originalHistory);
    });

    it('rejects changed checkpoint content when verifying and seeking through it', async () => {
      const tampered = structuredClone(history);
      tampered.checkpoints[1].world.armies[0].troops++;
      const before = JSON.stringify(tampered);
      expect(validateHistory(tampered)).toBe(true);
      await expect(verifyHistory(tampered, ENGINE)).rejects.toThrow('检查点 64 的校验和不匹配');
      await expect(seekHistory(tampered, 70, ENGINE)).rejects.toThrow('检查点 64 的校验和不匹配');
      expect(JSON.stringify(tampered)).toBe(before);
    });

    it('rejects changed accepted input instead of replaying a different history', async () => {
      const tampered = structuredClone(history);
      const command = tampered.entries.find(entry => entry.input.type === 'order')!.input;
      if (command.type !== 'order') throw new Error('The fixed fixture must include a real army order');
      command.order.kind = 'retreat';
      const before = JSON.stringify(tampered);
      expect(validateHistory(tampered)).toBe(true);
      await expect(verifyHistory(tampered, ENGINE)).rejects.toThrow(/重算结果与记录不同|无法执行/);
      expect(JSON.stringify(tampered)).toBe(before);
    });

    it('rejects a forged final transition after the last checkpoint', async () => {
      const tampered = structuredClone(history);
      tampered.entries[69].after.hash = '0'.repeat(64);
      const before = JSON.stringify(tampered);
      expect(validateHistory(tampered)).toBe(true);
      await expect(verifyHistory(tampered, ENGINE)).rejects.toThrow('历史输入 70 的重算结果与记录不同');
      await expect(seekHistory(tampered, 70, ENGINE)).rejects.toThrow('历史输入 70 的重算结果与记录不同');
      expect(JSON.stringify(tampered)).toBe(before);
    });

    it('rejects a different engine fingerprint and keeps seek results independent of the source', async () => {
      await expect(verifyHistory(history, 'f'.repeat(64))).rejects.toThrow('引擎指纹不匹配');
      await expect(seekHistory(history, 32, 'f'.repeat(64))).rejects.toThrow('引擎指纹不匹配');
      const snapshot = await seekHistory(history, 32, ENGINE);
      snapshot.armies[0].troops++;
      expect(JSON.stringify(history)).toBe(originalHistory);
      expect(await hashWorld(history.checkpoints[0].world)).toBe(expected.checkpoints[0].hash);
    });
  });
}
