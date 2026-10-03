import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneGenerationDocument, createGenerationDraft } from './generation-format';
import type { AtlasDetailCoastDocument } from './generation-contract';
import { parseTerrainImport, createImportedTerrain, type TerrainImportSummary } from './terrain-import';
import { TerrainImportClient } from './terrain-import-bridge';
import { TerrainImportWorkerRuntime } from './terrain-import.worker';
import { ATLAS_FRAGMENT_BYTES, ATLAS_PACKET_LIMIT, decodeAtlasPacket, encodeAtlasPacket, type AtlasPacket } from './protocol';
import { getAtlasStorage } from './storage';
import { TERRAIN_IMPORT_MAX_BYTES, terrainInputDigest } from './terrain-import-wire';

// Only expensive terrain conversion is replaced. The runtime, framing, bridge,
// codecs, document verification and IndexedDB commit/receipt code are real.
// This suite is transport/storage evidence, not original-generator evidence.
vi.mock('./terrain-import', () => ({ parseTerrainImport: vi.fn(), createImportedTerrain: vi.fn() }));

type Packet = ReturnType<typeof decodeAtlasPacket>;
const fast = { yieldTask: async () => {} }, turn = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const input = new TextEncoder().encode('{"fixture":"transport-only"}');
let fixture: AtlasDetailCoastDocument;
const clients: TerrainImportClient[] = [], runtimes: TerrainImportWorkerRuntime[] = [];

class ImportWorker {
  static instances: ImportWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  closed = false;
  packets: { direction: 'in' | 'out'; bytes: number; header: AtlasPacket }[] = [];
  requestFault?: (packet: Packet) => Uint8Array | null;
  responseFault?: (packet: Packet) => Uint8Array | null;
  onOutput?: (packet: Packet) => void;
  runtime = new TerrainImportWorkerRuntime((bytes, transfer) => {
    const packet = decodeAtlasPacket(bytes);
    this.packets.push({ direction: 'out', bytes: bytes.length, header: packet.header });
    const copy = structuredClone(bytes, { transfer });
    this.onOutput?.(packet);
    const response = this.responseFault ? this.responseFault(packet) : copy;
    if (response) setTimeout(() => { if (!this.closed) this.onmessage?.({ data: response } as MessageEvent); }, 0);
  });
  constructor() { ImportWorker.instances.push(this); }
  postMessage(bytes: Uint8Array, transfer: Transferable[]) {
    const packet = decodeAtlasPacket(bytes);
    this.packets.push({ direction: 'in', bytes: bytes.length, header: packet.header });
    const copy = structuredClone(bytes, { transfer });
    const request = this.requestFault ? this.requestFault(packet) : copy;
    if (request) setTimeout(() => { if (!this.closed) this.runtime.receive(request); }, 0);
  }
  terminate() { this.closed = true; this.runtime.close(); }
}
function client(options: ConstructorParameters<typeof TerrainImportClient>[0] = {}) {
  const instance = new TerrainImportClient(options); clients.push(instance); return instance;
}
function directRuntime() {
  let id = 0;
  const replies = new Map<number, (packet: Packet) => void>();
  const runtime = new TerrainImportWorkerRuntime(bytes => {
    const packet = decodeAtlasPacket(bytes);
    if (packet.header.type === 'complete' || packet.header.type === 'error') setTimeout(() => replies.get(packet.header.id)?.(packet), 0);
  });
  runtimes.push(runtime);
  return {
    runtime,
    request(body: object, payload?: Uint8Array) {
      const requestId = ++id;
      return new Promise<Packet>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('test runtime response timeout')), 2000);
        replies.set(requestId, packet => { clearTimeout(timer); replies.delete(requestId); resolve(packet); });
        runtime.receive(encodeAtlasPacket({ version: 1, id: requestId, type: 'request', body }, payload));
      });
    },
  };
}
const api = () => getAtlasStorage(4);
async function saveExisting() {
  const prepared = await api().prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: fixture.manifest, expectedRoot: null }, fast);
  const blocks = [...fixture.blocks.values()];
  for (let offset = 0; offset < blocks.length; offset += 8) await api().stageAtlasBlocks(prepared.preparationId, blocks.slice(offset, offset + 8), fast);
  return api().commitAtlasPreparation(prepared.preparationId, fast);
}

beforeAll(async () => {
  fixture = await createGenerationDraft({ size: 128, seed: 'terrain-import-transport', name: '导入通信独立合成地图' }, fast, 4);
});
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory(); ImportWorker.instances = []; vi.stubGlobal('Worker', ImportWorker);
  vi.mocked(parseTerrainImport).mockImplementation(async bytes => {
    const summary: TerrainImportSummary = {
      sourceSha256: await terrainInputDigest(bytes), sourceBytes: bytes.length, pointCount: 4, triangleCount: 2,
      width: 16, height: 8, seed: 'transport-fixture', template: 'synthetic', sourceHeightHash: 'a'.repeat(64), sourceTopologyHash: 'b'.repeat(64), converter: 'research-to-atlas-v4-v1',
      mapping: { scale: 256, offsetX: 0, offsetY: 1024, width: 4096, height: 2048, seaLevel: 20, metersPerUnit: 100, outerSeaMeters: -2000, note: 'Only transport fixture; no recovered terrain is claimed.' },
    };
    return { summary };
  });
  vi.mocked(createImportedTerrain).mockImplementation(async (parsed, options) => {
    const data = cloneGenerationDocument(fixture); data.manifest.draftId = `atlas-${crypto.randomUUID()}`; data.manifest.name = options.name;
    return { data, summary: parsed.summary };
  });
});
afterEach(async () => {
  clients.splice(0).forEach(instance => instance.close()); runtimes.splice(0).forEach(runtime => runtime.close());
  await turn(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks();
});

describe('terrain import real bounded runtime and durable storage', () => {
  it('rejects an input above 12 MiB and oversized packets before parsing or saving', async () => {
    const driver = directRuntime();
    expect((await driver.request({ operation: 'begin', bytes: TERRAIN_IMPORT_MAX_BYTES + 1, name: '容量边界', size: 128 })).header.type).toBe('error');
    expect((await driver.request({ operation: 'begin', bytes: 2, name: '容量边界', size: 128 })).header.type).toBe('complete');
    driver.runtime.receive(new Uint8Array(ATLAS_PACKET_LIMIT + 1));
    expect((await driver.request({ operation: 'end' })).header.type).toBe('error');
    expect(parseTerrainImport).not.toHaveBeenCalled(); expect(await api().listAtlasDrafts()).toEqual([]);
  });
  it.each(['missing', 'offset', 'duplicate', 'fragment-limit'] as const)('rejects %s upload without forming a candidate', async fault => {
    const driver = directRuntime();
    await driver.request({ operation: 'begin', bytes: ATLAS_FRAGMENT_BYTES + 1, name: '缺片检测', size: 128 });
    if (fault === 'duplicate') await driver.request({ operation: 'chunk', offset: 0 }, new Uint8Array([1]));
    const response = fault === 'missing' ? await driver.request({ operation: 'end' })
      : await driver.request({ operation: 'chunk', offset: fault === 'offset' ? 1 : 0 }, new Uint8Array(fault === 'fragment-limit' ? ATLAS_FRAGMENT_BYTES + 1 : 1));
    expect(response.header.type).toBe('error'); expect(parseTerrainImport).not.toHaveBeenCalled(); expect(await api().listAtlasDrafts()).toEqual([]);
  });
  it('streams a multi-packet input and real preview, discards without root writes, and keeps an existing draft byte-identical', async () => {
    await saveExisting(); const before = await api().exportAtlasRawBackup(fixture.manifest.draftId);
    const instance = client(), bytes = new Uint8Array(ATLAS_FRAGMENT_BYTES + 123), preview = await instance.preview(bytes, { name: '只看不保存' });
    expect(preview.identity.draftId).not.toBe(fixture.manifest.draftId);
    expect(preview.summary.sourceSha256).toBe(await terrainInputDigest(bytes));
    expect(await api().openAtlasDraft(preview.identity.draftId)).toBeNull();
    await instance.discard(); await expect(instance.confirm()).rejects.toThrow('没有');
    expect(await api().exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
    expect(await api().listAtlasDrafts()).toHaveLength(1);
    const packets = ImportWorker.instances[0].packets;
    expect(packets.every(packet => packet.bytes <= ATLAS_PACKET_LIMIT)).toBe(true);
    expect(packets.filter(packet => packet.direction === 'in' && (packet.header.body as { operation?: string })?.operation === 'chunk')).toHaveLength(2);
  });
  it.each(['candidateId', 'commandId', 'draftId', 'manifestDigest', 'sourceSha256'] as const)('checks confirmation %s in the Worker before storage access', async field => {
    const instance = client(), preview = await instance.preview(input, { name: '身份拒绝' }), worker = ImportWorker.instances[0];
    const prepare = vi.spyOn(api(), 'prepareAtlasCommit');
    worker.requestFault = packet => {
      const body = packet.header.body as Record<string, unknown>;
      return encodeAtlasPacket({ ...packet.header, body: body?.operation === 'confirm' ? { ...body, [field]: field.endsWith('Id') ? `changed-${String(body[field])}` : 'f'.repeat(64) } : body }, packet.payload);
    };
    await expect(instance.confirm()).rejects.toThrow('不一致');
    expect(prepare).not.toHaveBeenCalled(); expect(await api().findAtlasReceipt(preview.identity.draftId, preview.identity.commandId)).toBeNull();
    expect(await api().listAtlasDrafts()).toEqual([]);
  });
  it('saves exactly one independently identified v4 root using expectedRoot null and a verified receipt', async () => {
    await saveExisting(); const before = await api().exportAtlasRawBackup(fixture.manifest.draftId);
    const instance = client(), preview = await instance.preview(input, { name: '真实提交' });
    const prepare = vi.spyOn(api(), 'prepareAtlasCommit'), receipt = await instance.confirm();
    expect(prepare).toHaveBeenCalledOnce(); expect(prepare.mock.calls[0][0].expectedRoot).toBeNull();
    expect(receipt).toMatchObject({ committed: true, baseRoot: null, draftId: preview.identity.draftId, candidateId: preview.identity.candidateId, commandId: preview.identity.commandId, manifestDigest: preview.identity.manifestDigest, revision: 0, root: { domain: 'atlas-draft-v4', backupManifest: null } });
    expect(await api().findAtlasReceipt(receipt.draftId, receipt.commandId)).toMatchObject({ rootDigest: receipt.rootDigest, replayed: true });
    await expect(instance.confirm()).rejects.toThrow('没有');
    expect(await api().listAtlasDrafts()).toHaveLength(2); expect(await api().exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before);
  });
  it('closing a preview during its first streamed packet cannot write a root', async () => {
    const instance = client(), worker = ImportWorker.instances[0];
    worker.onOutput = packet => { if (packet.header.type === 'begin') instance.close(); };
    await expect(instance.preview(input, { name: '取消预览' })).rejects.toMatchObject({ name: 'AbortError' });
    expect(await api().listAtlasDrafts()).toEqual([]);
  });
  it('cancellation before the durable commit leaves no new root or receipt', async () => {
    const instance = client(), preview = await instance.preview(input, { name: '提交前取消' });
    const original = api().commitAtlasPreparation;
    vi.spyOn(api(), 'commitAtlasPreparation').mockImplementationOnce(async (id, control) => {
      instance.cancel(); await turn(); await turn(); return original(id, control);
    });
    await expect(instance.confirm()).rejects.toMatchObject({ name: 'AbortError' });
    expect(await api().findAtlasReceipt(preview.identity.draftId, preview.identity.commandId)).toBeNull(); expect(await api().listAtlasDrafts()).toEqual([]);
  });
  it('recovers the same receipt after a storage error thrown after the durable commit', async () => {
    const instance = client(), preview = await instance.preview(input, { name: '提交后异常' });
    const original = api().commitAtlasPreparation;
    const commit = vi.spyOn(api(), 'commitAtlasPreparation').mockImplementationOnce(async (id, control) => {
      await original(id, control); throw new DOMException('simulated late cancellation', 'AbortError');
    });
    const receipt = await instance.confirm(); expect(receipt.draftId).toBe(preview.identity.draftId); expect(receipt.committed).toBe(true);
    expect(commit).toHaveBeenCalledOnce(); expect(await api().listAtlasDrafts()).toHaveLength(1);
    await expect(instance.confirm()).rejects.toThrow('没有'); expect(commit).toHaveBeenCalledOnce();
  });
  it('treats cancellation after the durable commit as a saved result', async () => {
    const instance = client(), preview = await instance.preview(input, { name: '提交后取消' }), worker = ImportWorker.instances[0]; let cancelled = false;
    worker.onOutput = packet => {
      if (packet.header.type === 'complete' && (packet.header.body as { operation?: string }).operation === 'confirm') { cancelled = true; instance.cancel(); }
    };
    const receipt = await instance.confirm(); expect(cancelled).toBe(true); expect(receipt.draftId).toBe(preview.identity.draftId);
    expect(receipt.committed).toBe(true); expect(await api().listAtlasDrafts()).toHaveLength(1);
    await expect(instance.confirm()).rejects.toThrow('没有');
  });
  it.each(['worker-error', 'timeout'] as const)('recovers a committed root when the confirmation reply is lost through %s', async fault => {
    const instance = client({ timeoutMs: 500 }), preview = await instance.preview(input, { name: '确认回执丢失' }), worker = ImportWorker.instances[0];
    const commit = vi.spyOn(api(), 'commitAtlasPreparation');
    worker.responseFault = packet => {
      if (packet.header.type === 'complete' && (packet.header.body as { operation?: string }).operation === 'confirm') {
        if (fault === 'worker-error') setTimeout(() => worker.onerror?.(), 0);
        return null;
      }
      return encodeAtlasPacket(packet.header, packet.payload);
    };
    const receipt = await instance.confirm(); expect(receipt.committed).toBe(true); expect(receipt.draftId).toBe(preview.identity.draftId);
    expect(commit).toHaveBeenCalledOnce(); expect(await api().listAtlasDrafts()).toHaveLength(1); expect(worker.closed).toBe(true);
    await expect(instance.confirm()).rejects.toThrow('没有'); expect(commit).toHaveBeenCalledOnce();
  });
  it.each(['future-version', 'sequence', 'source-digest', 'summary-mapping', 'missing-block'] as const)('fails closed on %s preview response without a root', async fault => {
    const instance = client({ timeoutMs: 500 }), worker = ImportWorker.instances[0]; let changed = false;
    worker.responseFault = packet => {
      if (!changed && packet.header.type === 'begin' && fault !== 'missing-block') {
        changed = true;
        if (fault === 'future-version') return encodeAtlasPacket({ ...packet.header, version: 2 as 1 }, packet.payload);
        if (fault === 'sequence') return encodeAtlasPacket({ ...packet.header, sequence: 1 }, packet.payload);
        if (fault === 'summary-mapping') {
          const body = packet.header.body as { summary: object };
          return encodeAtlasPacket({ ...packet.header, body: { ...body, summary: { ...body.summary, mapping: null } } }, packet.payload);
        }
        return encodeAtlasPacket({ ...packet.header, body: { ...(packet.header.body as object), sourceSha256: 'f'.repeat(64) } }, packet.payload);
      }
      if (!changed && packet.header.type === 'block' && fault === 'missing-block') { changed = true; return null; }
      return encodeAtlasPacket(packet.header, packet.payload);
    };
    // A compact boolean assertion avoids dumping every valid geographic block
    // if a corrupted response unexpectedly reaches the public preview API.
    expect(await instance.preview(input, { name: '损坏传输' }).then(() => true, () => false)).toBe(false);
    expect(changed).toBe(true); expect(worker.closed).toBe(true);
    await expect(instance.confirm()).rejects.toThrow('没有'); expect(await api().listAtlasDrafts()).toEqual([]);
  });
});
