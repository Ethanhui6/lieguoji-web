import { describe, expect, it } from 'vitest';
import { createImportedTerrain, parseTerrainImport, TERRAIN_IMPORT_LIMITS } from './terrain-import';
import { rehashTerrainImportFixture, terrainImportFixture } from './terrain-import.fixture';
import { sampleDetailCoastNode } from './detail-coast-field';
import { hashGenerationManifest, verifyGenerationDocument } from './generation-format';
import { UNASSIGNED } from './model';

const fast = { yieldTask: async () => {} }, encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(value => value.toString(16).padStart(2, '0')).join('');

describe('verified research terrain imports create private editable Atlas-v4 geography', () => {
  it('binds original bytes and actual numeric hashes, independently of triangle order and winding', async () => {
    const { data, bytes } = await terrainImportFixture(), before = bytes.slice(), parsed = await parseTerrainImport(bytes, fast);
    expect(parsed.summary).toMatchObject({ sourceSha256: await digest(bytes), sourceBytes: bytes.length, pointCount: 9, triangleCount: 8, width: 4, height: 2,
      sourceHeightHash: data.hash, sourceTopologyHash: data.topologyHash, converter: 'research-to-atlas-v4-v1',
      mapping: { scale: 1024, offsetX: 0, offsetY: 1024, width: 4096, height: 2048, seaLevel: 20, metersPerUnit: 100, outerSeaMeters: -2000 } });
    expect(bytes).toEqual(before); expect(Object.isFrozen(parsed.summary.mapping)).toBe(true); expect(Object.isFrozen(parsed.summary)).toBe(true);
    const reversed = structuredClone(data); reversed.triangles.reverse(); await rehashTerrainImportFixture(reversed);
    const other = await parseTerrainImport(encode(reversed), fast); expect(other.summary.triangleCount).toBe(parsed.summary.triangleCount);
    expect(other.summary.sourceTopologyHash).not.toBe(parsed.summary.sourceTopologyHash);
  });

  it('rejects unknown versions/fields, dimensions, malformed coordinates, height ranges, indices and metadata', async () => {
    const { data } = await terrainImportFixture();
    const bad = [{ ...data, version: 1 }, { ...data, extra: true }, { ...data, width: 0 }, { ...data, width: Number.POSITIVE_INFINITY },
      { ...data, points: data.points.map((point, index) => index === 4 ? [-1, 1] : point) }, { ...data, heights: [...data.heights.slice(0, 8), 101] },
      { ...data, heights: [...data.heights.slice(0, 8), 1.5] }, { ...data, triangles: [...data.triangles.slice(0, -1), 9] },
      { ...data, seaLevel: 19 }, { ...data, count: 10 }, { ...data, topology: { ...data.topology, pointCount: 8 } },
      { ...data, topology: { ...data.topology, originalUnityTopologyRecovered: true } }, { ...data, topology: { ...data.topology, extra: true } }];
    for (const value of bad) await expect(parseTerrainImport(encode(value), fast)).rejects.toThrow();
    await expect(parseTerrainImport(new Uint8Array(TERRAIN_IMPORT_LIMITS.bytes + 1), fast)).rejects.toThrow('12 MiB');
    await expect(parseTerrainImport(new Uint8Array([0xff, 0xfe]), fast)).rejects.toThrow();
    await expect(parseTerrainImport(encode({ ...data, count: TERRAIN_IMPORT_LIMITS.points + 1 }), fast)).rejects.toThrow();
  });

  it('rejects tampered summaries and full-hash-valid duplicate, degenerate, disconnected or incomplete meshes', async () => {
    const { data } = await terrainImportFixture();
    await expect(parseTerrainImport(encode({ ...data, hash: '0'.repeat(64) }), fast)).rejects.toThrow('摘要');
    await expect(parseTerrainImport(encode({ ...data, topologyHash: '0'.repeat(64) }), fast)).rejects.toThrow('摘要');
    const duplicate = structuredClone(data); duplicate.points[4] = [...duplicate.points[0]]; await rehashTerrainImportFixture(duplicate);
    await expect(parseTerrainImport(encode(duplicate), fast)).rejects.toThrow('重复');
    const missingCorner = structuredClone(data); missingCorner.points[0] = [0.1, 0.1]; await rehashTerrainImportFixture(missingCorner);
    await expect(parseTerrainImport(encode(missingCorner), fast)).rejects.toThrow('四角');
    const missingTriangle = structuredClone(data); missingTriangle.triangles.splice(0, 3); missingTriangle.topology.triangleCount--; await rehashTerrainImportFixture(missingTriangle);
    await expect(parseTerrainImport(encode(missingTriangle), fast)).rejects.toThrow('完整覆盖');
    const repeated = structuredClone(data); repeated.triangles.splice(0, 3, ...repeated.triangles.slice(3, 6)); await rehashTerrainImportFixture(repeated);
    await expect(parseTerrainImport(encode(repeated), fast)).rejects.toThrow(/重叠|重复/);
    const degenerate = structuredClone(data); degenerate.triangles.splice(0, 3, 0, 1, 2); await rehashTerrainImportFixture(degenerate);
    await expect(parseTerrainImport(encode(degenerate), fast)).rejects.toThrow(/重叠|拓扑/);
    const crossed = structuredClone(data); crossed.triangles.splice(0, 3, 0, 2, 8); await rehashTerrainImportFixture(crossed);
    await expect(parseTerrainImport(encode(crossed), fast)).rejects.toThrow(/重叠|拓扑/);
  });

  it('creates complete real coarse and fine elevations, letterboxes without stretching, and retains no invented generation history', async () => {
    const { bytes } = await terrainImportFixture(), original = bytes.slice(), parsed = await parseTerrainImport(bytes, fast);
    const options = { name: '真实导入夹具', size: 128 as const, draftId: `atlas-${crypto.randomUUID()}`, atlasId: `geo-${crypto.randomUUID()}` };
    const { data, summary } = await createImportedTerrain(parsed, options, fast);
    expect(data.manifest).toMatchObject({ version: 4, revision: 0, draftId: options.draftId, atlasId: options.atlasId, origin: null, generation: { lastApplied: null } });
    expect(data.manifest.catalogs).toEqual({ simRegions: [], administration: [] }); expect(data.locks.size).toBe(0);
    expect(data.detailCoast.size).toBe(4096); expect(data.manifest.detailCoast.refs).toHaveLength(4096); expect([...data.detailCoast.values()].every(tile => tile.mode === 'samples')).toBe(true);
    const field = { tiles: data.detailCoast, sampleBaseElevation: () => { throw new Error('Full samples must not fall back to coarse heights'); } };
    expect(sampleDetailCoastNode(field, 1024, 1024)).toMatchObject({ coverageQ: 32767, heightMeters: 6000 });
    expect(sampleDetailCoastNode(field, 512, 1024)).toMatchObject({ coverageQ: 32767, heightMeters: 2000 });
    expect(sampleDetailCoastNode(field, 256, 1024)).toMatchObject({ coverageQ: 0, heightMeters: 0 });
    expect(sampleDetailCoastNode(field, 1024, 256)).toMatchObject({ coverageQ: -32767, heightMeters: -2000 });
    expect(sampleDetailCoastNode(field, 1024, 768)).toMatchObject({ coverageQ: 32767, heightMeters: 2000 });
    const peakBlock = data.blocks.get('elevation:2:2')!; expect(peakBlock.layer).toBe('elevation');
    // Cell centre is source (2.015625, 1.015625); the sloping triangle
    // loses 0.625 + 1.25 height units from the central peak of 80.
    if (peakBlock.layer === 'elevation') expect(peakBlock.values[0]).toBe(5813);
    for (const block of data.blocks.values()) if (block.layer === 'sim-membership' || block.layer === 'admin-membership') expect(block.values.every(value => value === UNASSIGNED)).toBe(true);
    let inconsistent = 0;
    for (const tile of data.detailCoast.values()) if (tile.mode === 'samples') for (let index = 0; index < tile.coverageQ.length; index++) if (Math.sign(tile.coverageQ[index]) !== Math.sign(tile.elevationMeters[index])) inconsistent++;
    expect(inconsistent).toBe(0);
    await verifyGenerationDocument(data, fast); expect(summary).toEqual(parsed.summary); expect(bytes).toEqual(original);
  }, 60000);

  it('writes Q8 world distance to the real coastline independently of its elevation scale', async () => {
    const { bytes } = await terrainImportFixture({ width: 2, height: 2, heights: [0, 20, 40, 0, 20, 40, 0, 20, 40] });
    const parsed = await parseTerrainImport(bytes, fast), { data } = await createImportedTerrain(parsed, { name: '垂直等高岸线' }, fast);
    const field = { tiles: data.detailCoast, sampleBaseElevation: () => { throw new Error('Unexpected coarse fallback'); } };
    // Height spans 4000 metres across a 4096-unit map; coverage is instead
    // Euclidean world distance to x=2048, encoded at 256 per world unit.
    for (const [x, coverageQ, heightMeters] of [[1023, -512, -2], [1024, 0, 0], [1025, 512, 2], [1000, -12288, -47], [1048, 12288, 47], [0, -32767, -2000]])
      expect(sampleDetailCoastNode(field, x, 1024)).toMatchObject({ coverageQ, heightMeters });
  }, 60000);

  it('supports shore-free all-sea/all-land squares and adds a real coast where letterboxed land meets outer sea', async () => {
    for (const [height, expectedCoverage, expectedMeters] of [[0, -32767, -2000], [80, 32767, 6000]]) {
      const { bytes } = await terrainImportFixture({ width: 2, height: 2, heights: Array(9).fill(height) });
      const parsed = await parseTerrainImport(bytes, fast), { data } = await createImportedTerrain(parsed, { name: `无岸线-${height}` }, fast);
      const field = { tiles: data.detailCoast, sampleBaseElevation: () => 999 };
      for (const [x, y] of [[0, 0], [1024, 1024], [2048, 2048]])
        expect(sampleDetailCoastNode(field, x, y)).toMatchObject({ coverageQ: expectedCoverage, heightMeters: expectedMeters });
    }
    const { bytes } = await terrainImportFixture({ heights: Array(9).fill(80) });
    const parsed = await parseTerrainImport(bytes, fast), { data } = await createImportedTerrain(parsed, { name: '矩形陆地与外海' }, fast);
    const field = { tiles: data.detailCoast, sampleBaseElevation: () => 999 };
    for (const [y, coverageQ, heightMeters] of [[511, -512, -2000], [512, 0, 0], [513, 512, 6000], [1535, 512, 6000], [1536, 0, 0], [1537, -512, -2000]])
      expect(sampleDetailCoastNode(field, 1024, y)).toMatchObject({ coverageQ, heightMeters });
  }, 60000);

  it('keeps parsed data private, owns bytes before yielding and cancels parsing/conversion without returning a partial world', async () => {
    const { bytes } = await terrainImportFixture(), expectedHash = await digest(bytes);
    let changed = false;
    const parsed = await parseTerrainImport(bytes, { yieldTask: async () => { if (!changed) { bytes.fill(0); changed = true; } } });
    expect(parsed.summary.sourceSha256).toBe(expectedHash);
    await expect(createImportedTerrain(structuredClone(parsed), { name: '伪造解析对象' }, fast)).rejects.toThrow('完整核验');
    const parseAbort = new AbortController(); parseAbort.abort();
    await expect(parseTerrainImport(new Uint8Array([123, 125]), { ...fast, signal: parseAbort.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const convertAbort = new AbortController(), stages: string[] = [];
    await expect(createImportedTerrain(parsed, { name: '取消转换' }, { ...fast, signal: convertAbort.signal, onProgress: progress => {
      stages.push(progress.stage); if (progress.stage === '转换导入地形连续细场') convertAbort.abort();
    } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(stages).toContain('转换导入地形连续细场'); expect(parsed.summary.sourceSha256).toBe(expectedHash);
    await expect(createImportedTerrain(parsed, { name: '不合法规模', size: 64 as 128 }, fast)).rejects.toThrow('参数');
  }, 60000);

  it('preserves exact sea-level nodes and deterministic content for identical imported data and IDs', async () => {
    const { bytes } = await terrainImportFixture({ heights: Array(9).fill(20) }), parsed = await parseTerrainImport(bytes, fast);
    const options = { name: '海平面夹具', size: 128 as const, draftId: `atlas-${crypto.randomUUID()}`, atlasId: `geo-${crypto.randomUUID()}` };
    const { data } = await createImportedTerrain(parsed, options, fast), before = await hashGenerationManifest(data.manifest);
    const field = { tiles: data.detailCoast, sampleBaseElevation: () => 999 };
    for (const [x, y] of [[0, 512], [511, 511], [511, 512], [777, 888], [2048, 1536]]) {
      const expected = y < 512 ? -2000 : 0; expect(sampleDetailCoastNode(field, x, y).heightMeters).toBe(expected);
    }
    const repeated = await createImportedTerrain(parsed, options, fast); expect(await hashGenerationManifest(repeated.data.manifest)).toBe(before);
  }, 60000);
});
