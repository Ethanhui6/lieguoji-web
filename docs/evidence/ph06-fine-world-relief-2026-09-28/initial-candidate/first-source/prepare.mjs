import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const base = path.resolve('.autopilot/ph06/fine-world-relief-staging');
const source = path.join(base, 'src/world/generation');
fs.mkdirSync(source, { recursive: true });
const names = ['detail-natural-relief.ts', 'detail-orography.ts'];
const originals = Object.fromEntries(names.map(name => [name, fs.readFileSync(`src/world/generation/${name}`, 'utf8')]));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
fs.writeFileSync(path.join(base, 'baseline.json'), JSON.stringify(Object.fromEntries(names.map(name => [name, sha(originals[name])])), null, 2));
for (const name of names) {
  let text = originals[name].replaceAll('\r\n', '\n');
  const replace = (oldValue, next) => {
    oldValue = oldValue.replaceAll('\r\n', '\n');
    if (!text.includes(oldValue)) throw new Error(`Missing replacement: ${name}: ${oldValue}`);
    text = text.replace(oldValue, next);
  };
  if (name === 'detail-natural-relief.ts') {
    replace("type Point = { xQ: number; yQ: number };", `type Point = { xQ: number; yQ: number };
/** New world relief is written to actual 2-world fine elevations. These are
 * physical planning scales, independent of the coarse simulation cell count.
 * Local editing and legacy coarse-only samplers keep their existing contract. */
export const FINE_WORLD_RELIEF_SCALE = { sampleStepWorld: 2, minimumTrunkWidthWorld: 24, minimumBranchWidthWorld: 16,
  maximumShoulderWidthWorld: 160, rollingFeatureWorld: 32, minimumInteriorWorld: 48, branchSpanWorld: 192 } as const;`);
    replace('coastDistance[id] >= Math.min(48 * 256, stepQ * 2)', "coastDistance[id] >= (scaleMode === 'world' ? FINE_WORLD_RELIEF_SCALE.minimumInteriorWorld * 256 : Math.min(48 * 256, stepQ * 2))");
    replace('const minimumWidth = local ? 12 * 256 : 4 * stepQ;', 'const minimumWidth = (local ? 12 : FINE_WORLD_RELIEF_SCALE.minimumTrunkWidthWorld) * 256;');
    replace('Math.min(shortSpan * .45, 256 * 256)', 'Math.min(shortSpan * .25, longSpan / (count - 1) * .65, FINE_WORLD_RELIEF_SCALE.maximumShoulderWidthWorld * 256)');
    replace('const sampleStepQ = local ? 512 : stepQ, leeQ', 'const sampleStepQ = (local ? 2 : FINE_WORLD_RELIEF_SCALE.sampleStepWorld) * 256, leeQ');
    replace('chains.push({ group: 0, leeQ, seed, sampleStepQ, anchors: trunk })', "chains.push({ group: 0, leeQ, seed, sampleStepQ, ...(local ? {} : { crossSection: 'fine-world' as const }), anchors: trunk })");
    replace('shortSpan >= 8 * stepQ', 'shortSpan >= FINE_WORLD_RELIEF_SCALE.branchSpanWorld * 256');
    replace('const branchMinimum = local ? 12 * 256 : 2 * stepQ;', 'const branchMinimum = (local ? 12 : FINE_WORLD_RELIEF_SCALE.minimumBranchWidthWorld) * 256;');
    replace('chains.push({ group: chains.length, leeQ: side, seed, sampleStepQ, anchors: selected })', "chains.push({ group: chains.length, leeQ: side, seed, sampleStepQ, ...(local ? {} : { crossSection: 'fine-world' as const }), anchors: selected })");
    replace('// World variations span >= four real coarse sample spacings. Local detail\r\n    // instead uses the existing 2-world fine elevation nodes and does not\r\n    // reinterpret the immutable coarse Hbase of an existing world.', '// New world elevations and local detail both reach actual 2-world nodes.\n    // Their height scales no longer depend on the coarse simulation grid.\n    // Existing immutable Hbase sampling is not reinterpreted.');
    replace("scaleMode === 'local' ? 32 * 256 : Math.max(64 * 256, 4 * stepQ)", "(scaleMode === 'local' ? 32 : FINE_WORLD_RELIEF_SCALE.rollingFeatureWorld) * 256");
  } else {
    replace("import { FIELD_Q, hashAt, integerSqrt }", "import { FIELD_Q, hashAt, integerSqrt, noiseQ12 }");
    replace('group: number; leeQ: number; seed: number; sampleStepQ: number;\r\n  /** Group', "group: number; leeQ: number; seed: number; sampleStepQ: number;\n  /** Omitted retains existing coarse-compatible/local cross sections. */\n  crossSection?: 'fine-world';\n  /** Group");
    replace('type Run = { group: number; leeQ: number; seed: number; sampleStepQ: number;', "type Run = { group: number; leeQ: number; seed: number; sampleStepQ: number; crossSection?: 'fine-world';");
    replace('sampleStepQ: c.sampleStepQ, anchors:', 'sampleStepQ: c.sampleStepQ, crossSection: c.crossSection, anchors:');
    replace("if (![-1, 1].includes(chain.leeQ)", "if (chain.crossSection !== undefined && chain.crossSection !== 'fine-world') throw new Error('山系细高程规划模式无效。');\n    if (![-1, 1].includes(chain.leeQ)");
    replace('sampleStepQ: chain.sampleStepQ, points:', 'sampleStepQ: chain.sampleStepQ, crossSection: chain.crossSection, points:');
    replace('const landformScale = smooth((widthQ - 128 * 256) / (128 * 256));', `const landformScale = smooth((widthQ - 128 * 256) / (128 * 256));
      // Fine world ranges keep broad low foothills but a narrower, physically
      // sampled crest. Smooth seeded width variation changes actual heights;
      // the land-probed centreline and support budget remain unchanged.
      const fine = run.crossSection === 'fine-world';
      const variation = fine ? noiseQ12(run.seed, 7300, Math.round(arc), 0, 64 * 256) / FIELD_Q : 0;
      const crestQ = fine ? Math.max(3 * run.sampleStepQ, Math.min(40 * 256, widthQ * (.17 + .025 * variation)))
        : Math.min(widthQ * .62, Math.max(1.5 * run.sampleStepQ, widthQ * (.24 + .22 * landformScale)));`);
    replace('crestQ: Math.min(widthQ * .62, Math.max(1.5 * run.sampleStepQ, widthQ * (.24 + .22 * landformScale))), alongQ,', 'crestQ: Math.min(widthQ * .62, crestQ), alongQ,');
    replace('foothillShare: .24 + .18 * landformScale, valleyOffset: .48 + .16 * landformScale,', 'foothillShare: fine ? .18 : .24 + .18 * landformScale, valleyOffset: fine ? .46 : .48 + .16 * landformScale,');
  }
  fs.writeFileSync(path.join(source, name), text.replaceAll('\r\n', '\n'));
}
console.log('Prepared two staged candidate modules; production unchanged.');
