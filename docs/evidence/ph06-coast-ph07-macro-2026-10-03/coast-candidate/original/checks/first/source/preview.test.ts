import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { roundAndIndexNaturalOutline as baseline } from './baseline/detail-natural-outline';
import { roundAndIndexNaturalOutline as candidate } from './runtime/detail-natural-outline';
import { loadCapturedOutline, fast } from './input';
import { renderOutline } from './outline-image';

it('samples the same captured41-point input through old and new rounded outlines', async () => {
  const label = process.env.COAST_CURVE_RUN;
  if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Require a unique safe output label.');
  const { input, captureSha256 } = loadCapturedOutline();
  const old = await baseline(input, 128, fast, { outlineEdgeTests: 0 }), next = await candidate(input, 128, fast, { outlineEdgeTests: 0 });
  const minX = Math.min(...input.points.map(p => p.xQ / 256)), maxX = Math.max(...input.points.map(p => p.xQ / 256));
  const minY = Math.min(...input.points.map(p => p.yQ / 256)), maxY = Math.max(...input.points.map(p => p.yQ / 256));
  const span = Math.max(maxX - minX, maxY - minY) + 320, frame = { x: (minX + maxX - span) / 2, y: (minY + maxY - span) / 2, span };
  const directory = path.resolve('.autopilot/ph06/coast-curves-staging/output', label);
  mkdirSync(path.dirname(directory), { recursive: true }); mkdirSync(directory);
  const describe = (outline: typeof old) => ({ nodes: outline.edges.length, roundedCorners: outline.roundedCorners,
    areaWorld2: Math.abs(outline.area2) / (2 * 256 ** 2), perimeterWorld: outline.perimeter / 256,
    longestChordWorld: Math.max(...outline.edges.map(edge => edge.length)) / 256,
    chordsOver80World: outline.edges.filter(edge => edge.length > 80 * 256).map(edge => edge.length / 256),
    minimumRemainingCapWorld: Math.min(...outline.caps) / 256, maximumRemainingCapWorld: Math.max(...outline.caps) / 256 });
  for (const [name, outline] of [['baseline', old], ['candidate', next]] as const) {
    renderOutline(path.join(directory, `${name}.png`), outline, input.points, frame);
    writeFileSync(path.join(directory, `${name}.json`), JSON.stringify({ edges: outline.edges, caps: outline.caps }), { flag: 'wx' });
  }
  writeFileSync(path.join(directory, 'comparison.json'), JSON.stringify({ captureSha256, sourcePointCount: input.points.length, frame,
    source: input, baseline: describe(old), candidate: describe(next),
    scope: 'Rounded reference contour only; same actual captured input and unchanged facing/cap preparation. White dashes = original gesture. Before regional SDF, fine reconstruction, relief, product renderer or save. No natural visual acceptance.' }, null, 2), { flag: 'wx' });
  expect(next.edges).not.toEqual(old.edges); expect(Math.sign(next.area2)).toBe(Math.sign(old.area2));
});
