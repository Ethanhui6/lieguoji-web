import { describe, expect, it } from 'vitest';
import {
  decodeAtlasEditMessage, encodeAtlasEditMessage, MAX_EDIT_CELLS, MAX_EDIT_MESSAGE_BYTES,
  MAX_EDIT_VERTICES, validateAtlasDelta, validateAtlasEdit, validateAtlasPatch,
  type AtlasEditCommand, type AtlasEditDelta, type AtlasPatch,
} from './transactions';

const DRAFT = 'atlas-11111111-2222-3333-4444-555555555555';
const COMMAND = 'edit-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ROOT = '1'.repeat(64), NEXT_ROOT = '2'.repeat(64), MANIFEST = '3'.repeat(64);
const textEncoder = new TextEncoder();

function patch(): AtlasPatch {
  return {
    vertices: { ids: new Uint32Array([0, 17]), xyQ: new Int32Array([0, -256, 2_147_483_647, -2_147_483_648]) },
    elevation: { ids: new Uint32Array([0, 31]), values: new Int32Array([-1_024, 257]) },
    simMembership: { ids: new Uint32Array([0, 31]), values: new Uint32Array([0xffffffff, 0]) },
    adminMembership: { ids: new Uint32Array([31]), values: new Uint32Array([42]) },
  };
}
function command(value = patch()): AtlasEditCommand {
  return { format: 'lieguoji-atlas-edit', version: 1, draftId: DRAFT, commandId: COMMAND, expectedRevision: 17, expectedRootDigest: ROOT, reason: '共享边界：山川与州县 🌊', patch: value };
}
function delta(): AtlasEditDelta {
  return {
    format: 'lieguoji-atlas-delta', version: 1, draftId: DRAFT, commandId: COMMAND,
    baseRevision: 17, baseRootDigest: ROOT, revision: 18, rootDigest: NEXT_ROOT,
    manifestDigest: MANIFEST, reason: '持久化完成后的实际根', patch: patch(),
    blockRefs: [{ key: 'geometry:0:0', hash: 'a'.repeat(64) }, { key: 'admin-membership:0:0', hash: 'b'.repeat(64) }],
  };
}
function reorderedPatch(value: AtlasPatch): AtlasPatch {
  return { adminMembership: value.adminMembership, simMembership: value.simMembership, elevation: value.elevation, vertices: value.vertices };
}
function binaryView(bytes: Uint8Array): DataView { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
function firstFieldOffset(bytes: Uint8Array): number { return 8 + binaryView(bytes).getUint32(0, true); }

/** Replace only the transport header; the production encoder supplies the array payload. */
function rewriteHeader(bytes: Uint8Array, replace: (header: Record<string, unknown>) => unknown): Uint8Array {
  const end = firstFieldOffset(bytes), original: Record<string, unknown> = JSON.parse(new TextDecoder().decode(bytes.subarray(8, end)));
  const next = textEncoder.encode(JSON.stringify(replace(original))), payload = bytes.subarray(end);
  const changed = new Uint8Array(8 + next.byteLength + payload.byteLength);
  binaryView(changed).setUint32(0, next.byteLength, true);
  binaryView(changed).setUint32(4, binaryView(bytes).getUint32(4, true), true);
  changed.set(next, 8); changed.set(payload, 8 + next.byteLength); return changed;
}
function rejectWireMutation(mutate: (bytes: Uint8Array) => void) {
  const bytes = encodeAtlasEditMessage(command()); mutate(bytes);
  expect(() => decodeAtlasEditMessage(bytes)).toThrow();
}

describe('production atlas edit binary codec', () => {
  it('canonicalizes command and nested patch field insertion order', () => {
    const original = command();
    const reverse: AtlasEditCommand = {
      patch: reorderedPatch(original.patch), reason: original.reason, expectedRootDigest: ROOT,
      expectedRevision: 17, commandId: COMMAND, draftId: DRAFT, version: 1, format: 'lieguoji-atlas-edit',
    };
    expect(validateAtlasEdit(reverse)).toBe(true);
    expect(encodeAtlasEditMessage(reverse)).toEqual(encodeAtlasEditMessage(original));
  });

  it('canonicalizes delta field and block reference order without mutating the caller', () => {
    const original = delta(), refsBefore = structuredClone(original.blockRefs);
    const reverse: AtlasEditDelta = {
      blockRefs: [...original.blockRefs].reverse().map(ref => ({ hash: ref.hash, key: ref.key })),
      patch: reorderedPatch(original.patch), reason: original.reason, manifestDigest: MANIFEST,
      rootDigest: NEXT_ROOT, revision: 18, baseRootDigest: ROOT, baseRevision: 17,
      commandId: COMMAND, draftId: DRAFT, version: 1, format: 'lieguoji-atlas-delta',
    };
    expect(encodeAtlasEditMessage(reverse)).toEqual(encodeAtlasEditMessage(original));
    expect(original.blockRefs).toEqual(refsBefore);
  });

  it('round-trips a command with signed limits, unsigned unassigned IDs, zero IDs and Unicode', () => {
    const original = command(), bytes = encodeAtlasEditMessage(original), decoded = decodeAtlasEditMessage(bytes);
    expect(decoded).toEqual(original);
    expect(validateAtlasEdit(decoded)).toBe(true);
    expect(decoded.patch.vertices?.xyQ).toBeInstanceOf(Int32Array);
    expect(decoded.patch.simMembership?.values).toBeInstanceOf(Uint32Array);
    expect(encodeAtlasEditMessage(decoded)).toEqual(bytes);
    bytes.fill(0);
    expect(decoded).toEqual(original);
    decoded.patch.vertices!.xyQ[0] = 99;
    expect(original.patch.vertices!.xyQ[0]).toBe(0);
  });

  it('round-trips a successful delta preserving durable root, manifest and exact base', () => {
    const original = delta(), bytes = encodeAtlasEditMessage(original), decoded = decodeAtlasEditMessage(bytes);
    expect(decoded).toEqual({ ...original, blockRefs: [...original.blockRefs].reverse() });
    expect(validateAtlasDelta(decoded)).toBe(true);
    expect(decoded).toMatchObject({ baseRevision: 17, baseRootDigest: ROOT, revision: 18, rootDigest: NEXT_ROOT, manifestDigest: MANIFEST });
    expect(encodeAtlasEditMessage(decoded)).toEqual(bytes);
  });

  it('decodes an exact subarray independently of bytes outside the message', () => {
    const bytes = encodeAtlasEditMessage(command()), padded = new Uint8Array(bytes.length + 11).fill(255);
    padded.set(bytes, 7);
    expect(decodeAtlasEditMessage(padded.subarray(7, 7 + bytes.length))).toEqual(command());
  });

  it.each([0, 1, 7])('rejects a truncated %i-byte preamble', length => {
    expect(() => decodeAtlasEditMessage(new Uint8Array(length))).toThrow();
  });

  it('rejects oversized messages before attempting to decode their contents', () => {
    expect(() => decodeAtlasEditMessage(new Uint8Array(MAX_EDIT_MESSAGE_BYTES + 1))).toThrow();
  });

  it.each([0, 1, 3, 9, 0xffffffff])('rejects impossible array count %i', count => {
    rejectWireMutation(bytes => binaryView(bytes).setUint32(4, count, true));
  });

  it('rejects a declared header extending beyond the message', () => {
    rejectWireMutation(bytes => binaryView(bytes).setUint32(0, 0xffffffff, true));
  });

  it('rejects malformed UTF-8 and malformed JSON instead of replacing bytes', () => {
    rejectWireMutation(bytes => { bytes[8] = 0xff; });
    rejectWireMutation(bytes => { bytes[8] = '!'.charCodeAt(0); });
  });

  it.each([
    ['unknown header field', (header: Record<string, unknown>) => ({ ...header, authorization: 'not-a-protocol-field' })],
    ['future version', (header: Record<string, unknown>) => ({ ...header, version: 2 })],
    ['future format', (header: Record<string, unknown>) => ({ ...header, format: 'lieguoji-atlas-edit-future' })],
    ['patch in header', (header: Record<string, unknown>) => ({ ...header, patch: {} })],
    ['non-object header', () => []],
  ])('rejects %s', (_label, transform) => {
    const bytes = rewriteHeader(encodeAtlasEditMessage(command()), transform);
    expect(() => decodeAtlasEditMessage(bytes)).toThrow();
  });

  it('rejects valid JSON with a noncanonical property order or whitespace', () => {
    const bytes = encodeAtlasEditMessage(command());
    const reordered = rewriteHeader(bytes, header => Object.fromEntries(Object.entries(header).reverse()));
    expect(() => decodeAtlasEditMessage(reordered)).toThrow(/规范/);
    const end = firstFieldOffset(bytes), spaced = new Uint8Array(bytes.length + 1);
    spaced.set(bytes.subarray(0, end), 0); spaced[end] = 32; spaced.set(bytes.subarray(end), end + 1);
    binaryView(spaced).setUint32(0, end - 8 + 1, true);
    expect(() => decodeAtlasEditMessage(spaced)).toThrow(/规范/);
  });

  it('rejects duplicate or unknown field tags and unpaired ID/value fields', () => {
    rejectWireMutation(bytes => {
      const first = firstFieldOffset(bytes), second = first + 6 + binaryView(bytes).getUint32(first + 2, true) * 4;
      bytes[second] = bytes[first];
    });
    rejectWireMutation(bytes => { bytes[firstFieldOffset(bytes)] = 9; });
    const single = encodeAtlasEditMessage(command({ elevation: { ids: new Uint32Array([0]), values: new Int32Array([-1]) } }));
    single[firstFieldOffset(single)] = 5;
    expect(() => decodeAtlasEditMessage(single)).toThrow();
  });

  it('rejects the wrong signedness even when the raw bits fit either array', () => {
    rejectWireMutation(bytes => { bytes[firstFieldOffset(bytes) + 1] = 1; });
    rejectWireMutation(bytes => {
      const first = firstFieldOffset(bytes), second = first + 6 + binaryView(bytes).getUint32(first + 2, true) * 4;
      bytes[second + 1] = 2;
    });
  });

  it.each([0, 0xffffffff])('rejects invalid declared field length %i', length => {
    rejectWireMutation(bytes => binaryView(bytes).setUint32(firstFieldOffset(bytes) + 2, length, true));
  });

  it('rejects truncated field headers, truncated values and trailing bytes', () => {
    const bytes = encodeAtlasEditMessage(command());
    expect(() => decodeAtlasEditMessage(bytes.subarray(0, firstFieldOffset(bytes) + 5))).toThrow();
    expect(() => decodeAtlasEditMessage(bytes.subarray(0, bytes.length - 1))).toThrow();
    const extra = new Uint8Array(bytes.length + 1); extra.set(bytes);
    expect(() => decodeAtlasEditMessage(extra)).toThrow();
  });

  it('rejects a semantically invalid delta even if its transport header is valid JSON', () => {
    for (const change of [{ revision: 19 }, { baseRevision: -1 }, { rootDigest: 'invalid' }, { baseRootDigest: 'f'.repeat(63) }, { manifestDigest: 'F'.repeat(64) }]) {
      const bytes = rewriteHeader(encodeAtlasEditMessage(delta()), header => ({ ...header, ...change }));
      expect(() => decodeAtlasEditMessage(bytes)).toThrow();
    }
    const duplicate = delta(); duplicate.blockRefs.push({ ...duplicate.blockRefs[0] });
    expect(validateAtlasDelta(duplicate)).toBe(false);
    expect(() => encodeAtlasEditMessage(duplicate)).toThrow();
  });

  it('rejects SharedArrayBuffer input and patch arrays instead of sharing authority', () => {
    const shared = new Uint32Array(new SharedArrayBuffer(4)); shared[0] = 0;
    const bad = command({ elevation: { ids: shared, values: new Int32Array([-1]) } });
    expect(validateAtlasEdit(bad)).toBe(false);
    expect(() => encodeAtlasEditMessage(bad)).toThrow();
    const badValues = command({ elevation: { ids: new Uint32Array([0]), values: new Int32Array(new SharedArrayBuffer(4)) } });
    expect(validateAtlasEdit(badValues)).toBe(false);
    const bytes = encodeAtlasEditMessage(command()), sharedWire = new Uint8Array(new SharedArrayBuffer(bytes.length)); sharedWire.set(bytes);
    expect(() => decodeAtlasEditMessage(sharedWire)).toThrow();
  });

  it('rejects typed subclasses, unknown properties and symbols at every editable boundary', () => {
    class SpecialIds extends Uint32Array {}
    const extraIds = Object.assign(new Uint32Array([0]), { extra: 1 });
    for (const ids of [new SpecialIds([0]), extraIds]) expect(validateAtlasPatch({ elevation: { ids, values: new Int32Array([1]) } })).toBe(false);
    expect(validateAtlasPatch({ ...patch(), nextVersion: 1 })).toBe(false);
    expect(validateAtlasPatch({ elevation: { ids: new Uint32Array([0]), values: new Int32Array([1]), [Symbol('extra')]: true } })).toBe(false);
    const extra = { ...command(), [Symbol('extra')]: true };
    expect(validateAtlasEdit(extra)).toBe(false);
    expect(() => encodeAtlasEditMessage(extra)).toThrow();
  });

  it('requires a nonempty, losslessly representable patch with correctly paired arrays', () => {
    for (const invalid of [{}, { elevation: undefined }, { ...patch(), simMembership: undefined }, { elevation: { ids: new Uint32Array(), values: new Int32Array() } }, { elevation: { ids: new Uint32Array([0, 0]), values: new Int32Array([1, 2]) } }, { vertices: { ids: new Uint32Array([0]), xyQ: new Int32Array([1]) } }]) {
      expect(validateAtlasPatch(invalid)).toBe(false);
    }
  });

  it('enforces the union of cell IDs across layers and the independent vertex count', () => {
    const ids = Uint32Array.from({ length: MAX_EDIT_CELLS }, (_, id) => id);
    const accepted: AtlasPatch = { elevation: { ids, values: new Int32Array(ids.length) }, simMembership: { ids: ids.slice(), values: new Uint32Array(ids.length) } };
    expect(validateAtlasPatch(accepted)).toBe(true);
    expect(validateAtlasPatch({ ...accepted, adminMembership: { ids: new Uint32Array([MAX_EDIT_CELLS]), values: new Uint32Array([0]) } })).toBe(false);
    expect(validateAtlasPatch({ vertices: { ids: Uint32Array.from({ length: MAX_EDIT_VERTICES + 1 }, (_, id) => id), xyQ: new Int32Array((MAX_EDIT_VERTICES + 1) * 2) } })).toBe(false);
  });

  it('counts large block-reference metadata in the response budget', () => {
    const value = delta();
    value.patch = {
      vertices: { ids: Uint32Array.from({ length: MAX_EDIT_VERTICES }, (_, id) => id), xyQ: new Int32Array(MAX_EDIT_VERTICES * 2) },
      elevation: { ids: Uint32Array.from({ length: MAX_EDIT_CELLS }, (_, id) => id), values: new Int32Array(MAX_EDIT_CELLS) },
      simMembership: { ids: Uint32Array.from({ length: MAX_EDIT_CELLS }, (_, id) => id), values: new Uint32Array(MAX_EDIT_CELLS) },
      adminMembership: { ids: Uint32Array.from({ length: MAX_EDIT_CELLS }, (_, id) => id), values: new Uint32Array(MAX_EDIT_CELLS) },
    };
    value.blockRefs = [];
    for (const layer of ['geometry', 'elevation', 'sim-membership', 'admin-membership'] as const) for (let by = 0; by < 16; by++) for (let bx = 0; bx < 16; bx++) value.blockRefs.push({ key: `${layer}:${bx}:${by}`, hash: MANIFEST });
    expect(validateAtlasDelta(value)).toBe(true);
    expect(() => encodeAtlasEditMessage(value)).toThrow(/预算/);
  });
});
