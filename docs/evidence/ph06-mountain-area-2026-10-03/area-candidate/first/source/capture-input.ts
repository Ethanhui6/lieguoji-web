import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { decodeAtlasManifest, verifyAtlasDocument, type AtlasDetailCoastDocument } from '../../../../src/world/atlas-format';
import { decodeBlock, type BlockKey } from '../../../../src/world/model';
import { extractDetailCoastBase } from '../../../../src/world/detail-coast-base';
import { createNaturalOceanBase } from '../../../../src/world/generation/natural-ocean-base';
import type { NaturalDetailRecipe } from '../../../../src/world/generation-contract';
import type { NaturalDetailShapeRecipe } from '../../../../src/world/generation/detail-shape-natural';
import type { PhysicalView } from './physical-image';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
/** Read only the explicitly named independent replay's own blank v4 blocks.
 * Reuse actual decode/verification/centroid/ocean-base paths. No screen-point
 * conversion, invented grid centroids, IAB reads or storage writes. */
export async function loadReplayInput(capturePath: string, viewsPath: string) {
  const raw = readFileSync(capturePath), capture = JSON.parse(raw.toString()) as {
    format: string; version: number; buildVersion: string; ownDraftId: string; recipe: NaturalDetailRecipe;
    originalIabSaveRead: boolean; independentPrivateContext: boolean; normalCancellation: boolean; base: { index: string };
  };
  if (capture.format !== 'lieguoji-independent-demo22-ui-replay' || capture.version !== 1 || capture.buildVersion !== '0.5.0-preview.22'
    || capture.originalIabSaveRead !== false || !capture.independentPrivateContext || !capture.normalCancellation) throw new Error('Require actual independent22 UI/Worker capture.');
  const directory = path.dirname(path.resolve(capturePath));
  const inside = (relative: string) => {
    const resolved = path.resolve(directory, relative);
    if (!resolved.startsWith(directory + path.sep)) throw new Error('Captured block path escaped this replay directory.');
    return resolved;
  };
  const index = JSON.parse(readFileSync(inside(capture.base.index), 'utf8')) as {
    manifest: unknown; blocks: { key: BlockKey; file: string; sha256: string }[];
  };
  const manifestBytes = Uint8Array.from(readFileSync(inside('base/manifest.bin'))), manifest = decodeAtlasManifest(manifestBytes);
  if (manifest.version !== 4 || manifest.revision !== 0 || manifest.draftId !== capture.ownDraftId || manifest.generation.lastApplied !== null
    || manifest.detailCoast.refs.length || manifest.constraints.lockRefs.length || JSON.stringify(index.manifest) !== JSON.stringify(manifest)) throw new Error('Actual replay base is not its own unchanged empty v4 world.');
  if (index.blocks.length !== manifest.blockRefs.length || new Set(index.blocks.map(b => b.key)).size !== index.blocks.length) throw new Error('Missing or duplicated replay blocks.');
  const data: AtlasDetailCoastDocument = { manifest, blocks: new Map(), locks: new Map(), detailCoast: new Map() };
  for (const entry of index.blocks) {
    const bytes = Uint8Array.from(readFileSync(inside(entry.file))), reference = manifest.blockRefs.find(ref => ref.key === entry.key);
    if (!reference || sha(bytes) !== entry.sha256 || reference.hash !== entry.sha256) throw new Error('Replay block identity differs.');
    data.blocks.set(entry.key, decodeBlock(bytes, manifest.spec));
  }
  const control = { yieldTask: async () => {} };
  await verifyAtlasDocument(data, control);
  const measured = await extractDetailCoastBase(data, control);
  // This is the same first-continent transform as the actual22 adapter. The
  // captured initial -100 elevations are preserved in source files, not used
  // as a substitute for the real naturally generated ocean input.
  const ocean = await createNaturalOceanBase({ size: measured.size, centersQ: measured.centersQ, seed: capture.recipe.seed }, control);
  const recipe: NaturalDetailShapeRecipe = { format: 'lieguoji-natural-shape-recipe', version: 2, seed: capture.recipe.seed, ...capture.recipe.parameters };
  const views = JSON.parse(readFileSync(viewsPath, 'utf8')) as PhysicalView[];
  return { raw, input: { sourceVersion: capture.buildVersion, sourceAtlasId: capture.ownDraftId, recipe,
    base: { size: measured.size, centersQ: [...new Int32Array(measured.centersQ)], elevationsMeters: [...ocean] }, views },
    provenance: { originalIabSaveRead: false, independentReplay: true, captureSha256: sha(raw), manifestSha256: sha(manifestBytes),
      blockHashes: index.blocks.map(({ key, sha256 }) => ({ key, sha256 })), centersSha256: sha(new Uint8Array(measured.centersQ)),
      actualNaturalOceanSha256: sha(new Uint8Array(ocean.buffer)), viewsSha256: sha(readFileSync(viewsPath)) } };
}
