import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createAtlasDraft } from '../model';
import { measureGeography } from './quality';
import { createNaturalOceanBase } from './natural-ocean-base';
import { generateDetailShapeNatural, type EmptyDetailShapeBase, type NaturalDetailShapeOutput, type NaturalDetailShapeRecipe } from './detail-shape-natural';
import { naturalFacingSeparation, simplifyNaturalSampling } from './detail-natural-outline';
import { createNaturalRelief, naturalRidgeContribution, type NaturalRidge } from './detail-natural-relief';
import { pickDetailCoastSurface } from '../detail-coast-geometry';
import { encodeDetailCoastTile } from '../detail-coast-codec';

const fast = { yieldTask: async () => {} }, control = { batchWork: 512, yieldControl: async () => {} };
const points = [[650, 1300], [950, 1120], [1200, 1260], [1440, 1590], [1310, 1850], [1010, 1980], [760, 1790], [580, 1580]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 }));
const recipe = (): NaturalDetailShapeRecipe => ({ format: 'lieguoji-natural-shape-recipe', version: 2, seed: 'fine-native-additive', pointsQ: points.map(p => ({ ...p })), coastStructureWorld: 96, coastRoughnessWorld: 16, reliefMeters: 2400, shelfWidthWorld: 72, islandChainCount: 0, islandsPerChain: 3 });
let base: EmptyDetailShapeBase, result: NaturalDetailShapeOutput;
function distance(x: number, y: number) {
  let nearest = Infinity, inside = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], dx = b.xQ - a.xQ, dy = b.yQ - a.yQ;
    const t = Math.max(0, Math.min(1, ((x - a.xQ) * dx + (y - a.yQ) * dy) / (dx * dx + dy * dy)));
    nearest = Math.min(nearest, Math.hypot(x - a.xQ - dx * t, y - a.yQ - dy * t) / 256);
    if ((a.yQ > y) !== (b.yQ > y) && x < a.xQ + (y - a.yQ) * dx / dy) inside = !inside;
  }
  return inside ? -nearest : nearest;
}
const evidenceLabel = process.env.NATURAL_VISUAL_EVIDENCE_LABEL;
if (evidenceLabel !== undefined && !/^[a-z0-9-]+$/.test(evidenceLabel)) throw new Error('Invalid local evidence label');
const outputDirectory = `.autopilot/ph06/v4-natural-visual-repair-staging/checks/${evidenceLabel}`;
function numericalEvidence() {
  const field = { tiles: result.detailCoast, sampleBaseElevation: result.sampleBaseElevation }, n = 280, startX = 440, startY = 1000, step = 4;
  const samples: number[] = [], rgba = Buffer.alloc(n * (n * 4 + 1)), rects: string[] = [];
  const color = (h: number, land: boolean) => {
    if (!land) return [22, 64, 86];
    const stops = [[0, 178, 199, 129], [600, 121, 151, 97], [1200, 128, 124, 98], [1800, 187, 177, 150], [2400, 244, 239, 219]];
    const k = Math.min(stops.length - 2, Math.floor(Math.max(0, h) / 600)), a = stops[k], b = stops[k + 1], t = Math.min(1, Math.max(0, (h - a[0]) / 600));
    return a.slice(1).map((v, c) => Math.round(v + (b[c + 1] - v) * t));
  };
  for (let row = 0; row < n; row++) for (let column = 0; column < n; column++) {
    const x = startX + (column + .5) * step, y = startY + (row + .5) * step, pick = pickDetailCoastSurface(field, { x, y })!;
    samples.push(pick.height); const rgb = color(pick.height, pick.land), offset = row * (n * 4 + 1) + 1 + column * 4;
    rgba.set([...rgb, 255], offset); rects.push(`<rect x="${column * 2}" y="${row * 2}" width="2" height="2" fill="rgb(${rgb})"/>`);
  }
  const crc32 = (buffer: Buffer) => { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
  const chunk = (name: string, bytes: Buffer) => { const content = Buffer.concat([Buffer.from(name), bytes]), header = Buffer.alloc(4), end = Buffer.alloc(4); header.writeUInt32BE(bytes.length); end.writeUInt32BE(crc32(content)); return Buffer.concat([header, content, end]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(n); header.writeUInt32BE(n, 4); header[8] = 8; header[9] = 6;
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(`${outputDirectory}/actual-256-height-field.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rgba)), chunk('IEND', Buffer.alloc(0))]), { flag: 'wx' });
  const outline = points.map(p => `${(p.xQ / 256 - startX) / 2},${(p.yQ / 256 - startY) / 2}`).join(' ');
  writeFileSync(`${outputDirectory}/actual-256-height-field.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="660" viewBox="0 0 640 660"><rect width="640" height="660" fill="#f4f6f8"/><text x="32" y="28" font-size="17">Authoritative 256-sample terrain / 16-world coarse spacing</text><g transform="translate(32 48)">${rects.join('')}<polygon points="${outline}" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="4 5"/></g><text x="32" y="633" font-size="13">White: input outline. Height samples at 4 world; persisted fine coast + Hbase.</text><text x="32" y="651" font-size="13">Green: 0–600 m; brown: 1200 m; light: 1800–2400 m. No renderer/texture effects.</text></svg>`, { flag: 'wx' });
  writeFileSync(`${outputDirectory}/actual-256-height-field.json`, JSON.stringify({ seed: recipe().seed, size: base.size, coarseSpacingWorld: 16, region: { startX, startY, step, columns: n, rows: n }, diagnosticSamplingWorld: 4, fineStepWorld: 2, interpretation: 'Actual persisted fine-height/coverage + Hbase; a numeric slice, not product-renderer or visual acceptance. Inland resolution remains 16-world coarse samples.', recipe: recipe(), coarseElevations: Array.from(result.coarseElevations), samples, targetCoast: Array.from(new Uint32Array(result.targetCoast)), summary: result.summary }), { flag: 'wx' });
}
beforeAll(async () => {
  const draft = await createAtlasDraft({ size: 256, name: '实际256重心数值修复图', seed: 'fine-native-additive' }, fast), geography = await measureGeography(draft, fast);
  const ocean = await createNaturalOceanBase({ size: 256, centersQ: geography.xyQ.buffer as ArrayBuffer, seed: recipe().seed }, fast);
  base = { format: 'lieguoji-empty-detail-shape-base', version: 1, size: 256, centersQ: geography.xyQ.buffer as ArrayBuffer, elevationsMeters: ocean.buffer as ArrayBuffer, detailCoast: new Map(), locksPresent: false, entitiesPresent: false, generationPresent: false };
  result = await generateDetailShapeNatural({ base, recipe: recipe() }, control);
  if (evidenceLabel !== undefined) numericalEvidence();
}, 60000);

describe('actual geography visual repair contracts', () => {
  it('keeps asymmetric slopes continuous across a finite ridge endpoint extension', () => {
    const ridge: NaturalRidge = { a: { xQ: 0, yQ: 0 }, b: { xQ: 1000 * 256, yQ: 0 }, widthQ: 128 * 256, widthAQ: 128 * 256, widthBQ: 128 * 256, peakQ: 4096, peakAQ: 4096, peakBQ: 4096, group: 0, leeQ: 1 };
    for (const xQ of [-40 * 256, 1040 * 256]) {
      const before = naturalRidgeContribution(ridge, xQ, -1, 16 * 256), after = naturalRidgeContribution(ridge, xQ, 1, 16 * 256);
      expect(Math.abs(before - after)).toBeLessThanOrEqual(2);
    }
    expect(Math.abs(naturalRidgeContribution(ridge, 500 * 256, -64 * 256, 16 * 256) - naturalRidgeContribution(ridge, 500 * 256, 64 * 256, 16 * 256))).toBeGreaterThan(100);
  });
  it('makes both bays and capes exceed small roughness on the native eight-corner contour', () => {
    const target = new Uint32Array(result.targetCoast), offsets: number[] = [];
    for (let i = 0; i < target.length; i += 2) offsets.push(distance(target[i], target[i + 1]));
    expect(Math.max(...offsets)).toBeGreaterThan(24); expect(Math.min(...offsets)).toBeLessThan(-24);
    expect(Math.max(...offsets.map(Math.abs))).toBeLessThanOrEqual(114);
    expect(result.summary.landAreaTwiceQ2 + result.summary.seaAreaTwiceQ2).toBe(2 * (4096 * 256) ** 2);
  });

  it('does not change actual coastline/height bytes merely because straight gesture edges contain more input samples', async () => {
    const dense = recipe(); dense.pointsQ = points.flatMap((a, i) => {
      const b = points[(i + 1) % points.length]; return Array.from({ length: 4 }, (_, j) => ({ xQ: a.xQ + (b.xQ - a.xQ) * j / 4, yQ: a.yQ + (b.yQ - a.yQ) * j / 4 }));
    });
    const next = await generateDetailShapeNatural({ base, recipe: dense }, { ...control, batchWork: 128 });
    expect(next.targetCoast).toEqual(result.targetCoast); expect(next.coarseElevations).toEqual(result.coarseElevations);
    expect([...next.detailCoast].map(([key, tile]) => [key, encodeDetailCoastTile(tile)])).toEqual([...result.detailCoast].map(([key, tile]) => [key, encodeDetailCoastTile(tile)]));
  }, 60000);

  it('keeps opposing 12-world channel banks protected while eliminating only bounded source jitter', async () => {
    const channel = [[1200, 1200], [1268, 1200], [1268, 1248], [1280, 1248], [1280, 1200], [1380, 1200], [1380, 1360], [1200, 1360]].map(([x, y]) => ({ xQ: x * 256, yQ: y * 256 }));
    expect(naturalFacingSeparation(channel, 1, 3)).toBe(12 * 256);
    expect(await simplifyNaturalSampling(points, 128)).toEqual(points);
    const source = channel.map(p => ({ ...p })), controller = new AbortController();
    await expect(simplifyNaturalSampling(source, 64, { signal: controller.signal, onProgress: () => controller.abort(), yieldControl: async () => {} })).rejects.toMatchObject({ name: 'AbortError' });
    expect(source).toEqual(channel);
  });

  it('has multiple mountain peaks and real saddles with foothill ends instead of a uniform capsule crest', async () => {
    const size = 128, centers = new Int32Array(size * size * 2), land = new Uint8Array(size * size), coast = new Uint16Array(size * size);
    for (let id = 0; id < land.length; id++) {
      const x = (id % size * 32 + 16) * 256, y = (Math.floor(id / size) * 32 + 16) * 256; centers.set([x, y], id * 2);
      if (x > 1000 * 256 && x < 2200 * 256 && y > 1000 * 256 && y < 1900 * 256) { land[id] = 1; coast[id] = 32767; }
    }
    const relief = await createNaturalRelief({ seed: 9811, size, centersQ: centers, land, coastDistanceQ: coast, reliefMeters: 2400, shelfWidthWorld: 112, isLand: () => true }, 512, control);
    const main = relief.ridges.filter(r => r.group === 0), anchors = [...main.map(r => r.a), main.at(-1)!.b];
    const heights = anchors.map(p => relief.physicalHeight(p.xQ, p.yQ, true, 32767, -3800));
    expect(heights[0]).toBeLessThan(2400 * .2); expect(heights.at(-1)!).toBeLessThan(2400 * .2);
    const peaks = heights.slice(1, -1).filter((height, i) => height > heights[i] + 200 && height > heights[i + 2] + 200);
    expect(peaks.length).toBeGreaterThanOrEqual(2); expect(Math.max(...heights) - Math.min(...heights.slice(1, -1))).toBeGreaterThan(800);
    const actualWidths = main.map(r => {
      const x = (r.a.xQ + r.b.xQ) / 2, y = (r.a.yQ + r.b.yQ) / 2, dx = r.b.xQ - r.a.xQ, dy = r.b.yQ - r.a.yQ, length = Math.hypot(dx, dy);
      let width = 0; for (let d = -256; d <= 256; d += 8) if (relief.physicalHeight(Math.round(x - dy / length * d * 256), Math.round(y + dx / length * d * 256), true, 32767, -3800) > 400) width += 8;
      return width;
    });
    expect(Math.max(...actualWidths) - Math.min(...actualWidths)).toBeGreaterThanOrEqual(32);
    expect(relief.summary.ridgeSegments).toBeLessThanOrEqual(16);
  });
});
