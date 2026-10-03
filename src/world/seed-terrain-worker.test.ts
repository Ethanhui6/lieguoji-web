import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneGenerationDocument, createGenerationDraft } from './generation-format';
import type { AtlasDetailCoastDocument } from './generation-contract';
import { parseTerrainImport, createImportedTerrain, type TerrainImportSummary } from './terrain-import';
import { generateTerrainResearch } from './seed-terrain';
import { type SeedTerrainRequest } from './recovered-terrain/contract';
import { SeedTerrainClient } from './seed-terrain-client';
import { SeedTerrainWorkerRuntime } from './seed-terrain.worker';
import { TerrainImportWorkerRuntime } from './terrain-import.worker';
import { seedTerrainRequestDigest } from './seed-terrain-wire';
import { ATLAS_FRAGMENT_BYTES, ATLAS_PACKET_LIMIT, decodeAtlasPacket, encodeAtlasPacket, type AtlasPacket } from './protocol';
import { getAtlasStorage } from './storage';
import { TERRAIN_IMPORT_MAX_BYTES, terrainInputDigest } from './terrain-import-wire';

// This suite exercises both real runtimes, both receivers, framing, validation,
// and durable IndexedDB. It substitutes only expensive generation/conversion;
// original algorithm equivalence belongs to recovered-terrain core tests.
vi.mock('./seed-terrain', () => ({ generateTerrainResearch: vi.fn() }));
vi.mock('./terrain-import', () => ({ parseTerrainImport: vi.fn(), createImportedTerrain: vi.fn() }));

type Packet = ReturnType<typeof decodeAtlasPacket>;
const fast = { yieldTask: async () => {} }, turn = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const request: SeedTerrainRequest = { seed: 'seed-transport-421730', template: 'archipelago', layout: 'square-v1' };
const generatedBytes = new TextEncoder().encode('{"fixture":"only generated transport bytes"}');
const clients: SeedTerrainClient[] = [], runtimes: SeedTerrainWorkerRuntime[] = [];
let fixture: AtlasDetailCoastDocument;

class LinkedWorker {
  static instances: LinkedWorker[] = [];
  static configure?: (worker: LinkedWorker) => void;
  readonly kind: 'generator' | 'importer';
  runtime: SeedTerrainWorkerRuntime | TerrainImportWorkerRuntime;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  closed = false;
  packets: { direction: 'in' | 'out'; bytes: number; header: AtlasPacket }[] = [];
  responseFault?: (packet: Packet) => Uint8Array | null;
  onOutput?: (packet: Packet) => void;
  constructor(url: URL) {
    this.kind = url.pathname.includes('seed-terrain.worker') ? 'generator' : 'importer';
    const send = (bytes: Uint8Array, transfer: Transferable[]) => {
      const packet = decodeAtlasPacket(bytes); this.packets.push({ direction: 'out', bytes: bytes.length, header: packet.header });
      const copy = structuredClone(bytes, { transfer }); this.onOutput?.(packet);
      const response = this.responseFault ? this.responseFault(packet) : copy;
      if (response) setTimeout(() => { if (!this.closed) this.onmessage?.({ data: response } as MessageEvent); }, 0);
    };
    this.runtime = this.kind === 'generator' ? new SeedTerrainWorkerRuntime(send) : new TerrainImportWorkerRuntime(send);
    LinkedWorker.instances.push(this); LinkedWorker.configure?.(this);
  }
  postMessage(bytes: Uint8Array, transfer: Transferable[]) {
    const packet = decodeAtlasPacket(bytes); this.packets.push({ direction: 'in', bytes: bytes.length, header: packet.header });
    const copy = structuredClone(bytes, { transfer });
    setTimeout(() => { if (!this.closed) this.runtime.receive(copy); }, 0);
  }
  terminate() { this.closed = true; this.runtime.close(); }
}
function client(options: ConstructorParameters<typeof SeedTerrainClient>[0] = {}) {
  const instance = new SeedTerrainClient(options); clients.push(instance); return instance;
}
const api = () => getAtlasStorage(4);
function rawRequest(body: object, payload?: Uint8Array): Promise<Packet> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test seed runtime response timeout')), 2000);
    const runtime = new SeedTerrainWorkerRuntime(bytes => {
      const packet = decodeAtlasPacket(bytes);
      if (packet.header.type === 'error') { clearTimeout(timer); resolve(packet); }
    }); runtimes.push(runtime);
    runtime.receive(encodeAtlasPacket({ version: 1, id: 1, type: 'request', body }, payload));
  });
}
async function saveExisting() {
  const prepared = await api().prepareAtlasCommit({ candidateId: crypto.randomUUID(), commandId: `edit-${crypto.randomUUID()}`, manifest: fixture.manifest, expectedRoot: null }, fast);
  const blocks = [...fixture.blocks.values()];
  for (let offset = 0; offset < blocks.length; offset += 8) await api().stageAtlasBlocks(prepared.preparationId, blocks.slice(offset, offset + 8), fast);
  return api().commitAtlasPreparation(prepared.preparationId, fast);
}
beforeAll(async () => {
  fixture = await createGenerationDraft({ size: 128, seed: 'seed-worker-storage-fixture', name: '种子线程持久化合成地图' }, fast, 4);
});
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory(); LinkedWorker.instances = []; LinkedWorker.configure = undefined;
  vi.stubGlobal('Worker', LinkedWorker); vi.stubGlobal('__SEED_TERRAIN_FINGERPRINT__', 'a'.repeat(64));
  vi.mocked(generateTerrainResearch).mockImplementation(async () => generatedBytes.slice());
  vi.mocked(parseTerrainImport).mockImplementation(async bytes => {
    const summary: TerrainImportSummary = {
      sourceSha256: await terrainInputDigest(bytes), sourceBytes: bytes.length, pointCount: 4, triangleCount: 2,
      width: 16, height: 16, seed: request.seed, template: request.template, sourceHeightHash: 'a'.repeat(64), sourceTopologyHash: 'b'.repeat(64), converter: 'research-to-atlas-v4-v1',
      mapping: { scale: 256, offsetX: 0, offsetY: 0, width: 4096, height: 4096, seaLevel: 20, metersPerUnit: 100, outerSeaMeters: -2000, note: 'Only transport fixture, not original-generator evidence.' },
    }; return { summary };
  });
  vi.mocked(createImportedTerrain).mockImplementation(async (parsed, options) => {
    const data = cloneGenerationDocument(fixture); data.manifest.draftId = `atlas-${crypto.randomUUID()}`; data.manifest.name = options.name;
    return { data, summary: parsed.summary };
  });
});
afterEach(async () => {
  clients.splice(0).forEach(instance => instance.close()); runtimes.splice(0).forEach(runtime => runtime.close());
  LinkedWorker.instances.forEach(worker => worker.terminate()); await turn();
  vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks();
});

describe('bounded seed generation and existing atomic terrain import', () => {
  it.each(['future-layout', 'unknown-template', 'empty-seed', 'long-seed', 'extra-script', 'request-payload'] as const)('Worker rejects %s without executing the generator', async fault => {
    let value: object = { ...request };
    if (fault === 'future-layout') value = { ...request, layout: 'square-v2' };
    if (fault === 'unknown-template') value = { ...request, template: 'user-script' };
    if (fault === 'empty-seed') value = { ...request, seed: '' };
    if (fault === 'long-seed') value = { ...request, seed: 'x'.repeat(81) };
    if (fault === 'extra-script') value = { ...request, script: 'throw Error()' };
    const reply = await rawRequest({ operation: 'generate', request: value }, fault === 'request-payload' ? new Uint8Array([1]) : undefined);
    expect(reply.header.type).toBe('error'); expect(generateTerrainResearch).not.toHaveBeenCalled();
    expect(await api().listAtlasDrafts()).toEqual([]);
  });
  it('closes the runtime on an oversized or future-version packet', async () => {
    for (const packet of [new Uint8Array(ATLAS_PACKET_LIMIT + 1), encodeAtlasPacket({ version: 2 as 1, id: 1, type: 'request', body: { operation: 'generate', request } })]) {
      const sent = vi.fn(), runtime = new SeedTerrainWorkerRuntime(sent); runtimes.push(runtime); runtime.receive(packet);
      runtime.receive(encodeAtlasPacket({ version: 1, id: 2, type: 'request', body: { operation: 'generate', request } }));
      await turn(); expect(sent).not.toHaveBeenCalled();
    }
    expect(generateTerrainResearch).not.toHaveBeenCalled();
  });
  it('owns the request, streams bounded bytes, terminates generation before import, and only previews', async () => {
    const bytes = new Uint8Array(ATLAS_FRAGMENT_BYTES + 137); vi.mocked(generateTerrainResearch).mockResolvedValueOnce(bytes);
    let importStartedAfterGeneratorClosed = false;
    LinkedWorker.configure = worker => { if (worker.kind === 'importer') importStartedAfterGeneratorClosed = LinkedWorker.instances.filter(item => item.kind === 'generator').every(item => item.closed); };
    const owned = { ...request }, instance = client(), pending = instance.preview(owned, { name: '种子预览' }); owned.seed = 'mutated-after-call';
    const preview = await pending;
    expect(preview.generation.request).toEqual(request); expect(preview.generation.requestDigest).toBe(await seedTerrainRequestDigest(request));
    expect(preview.generation.sourceSha256).toBe(await terrainInputDigest(bytes)); expect(preview.terrain.identity.sourceSha256).toBe(preview.generation.sourceSha256);
    expect(generateTerrainResearch).toHaveBeenCalledOnce(); expect(vi.mocked(generateTerrainResearch).mock.calls[0][0]).toEqual(request);
    expect(importStartedAfterGeneratorClosed).toBe(true); expect(LinkedWorker.instances.map(worker => worker.kind)).toEqual(['generator', 'importer']);
    expect(LinkedWorker.instances.flatMap(worker => worker.packets).every(packet => packet.bytes <= ATLAS_PACKET_LIMIT)).toBe(true);
    expect(LinkedWorker.instances[0].packets.filter(packet => packet.direction === 'out' && packet.header.type === 'delta')).toHaveLength(2);
    expect(await api().listAtlasDrafts()).toEqual([]); instance.cancel(); expect(await api().listAtlasDrafts()).toEqual([]);
    await expect(instance.confirm()).rejects.toThrow('没有');
  });
  it('confirms exactly one new root and preserves an existing draft byte for byte', async () => {
    await saveExisting(); const before = await api().exportAtlasRawBackup(fixture.manifest.draftId);
    const instance = client(), preview = await instance.preview(request, { name: '生成并保存' }), prepare = vi.spyOn(api(), 'prepareAtlasCommit');
    const receipt = await instance.confirm(); expect(prepare).toHaveBeenCalledOnce(); expect(prepare.mock.calls[0][0].expectedRoot).toBeNull();
    expect(receipt).toMatchObject({ committed: true, baseRoot: null, draftId: preview.terrain.identity.draftId, commandId: preview.terrain.identity.commandId, manifestDigest: preview.terrain.identity.manifestDigest });
    expect(await api().exportAtlasRawBackup(fixture.manifest.draftId)).toEqual(before); expect(await api().listAtlasDrafts()).toHaveLength(2);
    await expect(instance.confirm()).rejects.toThrow('没有'); expect(prepare).toHaveBeenCalledOnce();
  });
  it.each(['generator', 'importer'] as const)('cancels during %s preview and never writes a root', async kind => {
    const instance = client(); let cancelled = false;
    LinkedWorker.configure = worker => { if (worker.kind === kind) worker.onOutput = packet => { if (packet.header.type === 'begin') { cancelled = true; instance.cancel(); } }; };
    await expect(instance.preview(request, { name: '取消生成' })).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(true); expect(LinkedWorker.instances.every(worker => worker.closed)).toBe(true); expect(await api().listAtlasDrafts()).toEqual([]);
    if (kind === 'generator') expect(parseTerrainImport).not.toHaveBeenCalled();
    await expect(instance.preview(request, { name: '不能复用已取消实例' })).rejects.toThrow();
  });
  it('rejects generated data above 12 MiB before importing', async () => {
    vi.mocked(generateTerrainResearch).mockResolvedValueOnce(new Uint8Array(TERRAIN_IMPORT_MAX_BYTES + 1));
    await expect(client().preview(request, { name: '输出容量边界' })).rejects.toThrow('容量');
    expect(parseTerrainImport).not.toHaveBeenCalled(); expect(LinkedWorker.instances).toHaveLength(1); expect(await api().listAtlasDrafts()).toEqual([]);
  });
  it.each(['packet-cap', 'future-version', 'identity', 'fingerprint', 'request-digest', 'content-digest', 'length-cap', 'sequence', 'delta-offset', 'delta-bytes', 'missing-delta', 'premature-complete', 'complete-digest'] as const)('fails closed on %s generation response', async fault => {
    const instance = client({ timeoutMs: 200 }); let changed = false;
    LinkedWorker.configure = worker => {
      if (worker.kind !== 'generator') return;
      worker.responseFault = packet => {
        const header = packet.header, body = header.body as Record<string, unknown>;
        if (!changed && header.type === 'begin' && !['delta-offset', 'delta-bytes', 'missing-delta', 'complete-digest'].includes(fault)) {
          changed = true;
          if (fault === 'packet-cap') return new Uint8Array(ATLAS_PACKET_LIMIT + 1);
          if (fault === 'future-version') return encodeAtlasPacket({ ...header, version: 2 as 1 });
          if (fault === 'identity') return encodeAtlasPacket({ ...header, id: header.id + 1 });
          if (fault === 'sequence') return encodeAtlasPacket({ ...header, sequence: 9 });
          if (fault === 'premature-complete') return encodeAtlasPacket({ ...header, type: 'complete' });
          const field = fault === 'fingerprint' ? 'fingerprint' : fault === 'request-digest' ? 'requestDigest' : fault === 'length-cap' ? 'byteLength' : 'sourceSha256';
          return encodeAtlasPacket({ ...header, body: { ...body, [field]: field === 'byteLength' ? TERRAIN_IMPORT_MAX_BYTES + 1 : '0'.repeat(64) } });
        }
        if (!changed && header.type === 'delta' && ['delta-offset', 'delta-bytes', 'missing-delta'].includes(fault)) {
          changed = true; if (fault === 'missing-delta') return null;
          if (fault === 'delta-offset') return encodeAtlasPacket({ ...header, body: { offset: 1 } }, packet.payload);
          const bytes = packet.payload.slice(); bytes[0] ^= 255; return encodeAtlasPacket(header, bytes);
        }
        if (!changed && header.type === 'complete' && fault === 'complete-digest') {
          changed = true; return encodeAtlasPacket({ ...header, body: { ...body, sourceSha256: '0'.repeat(64) } });
        }
        return encodeAtlasPacket(header, packet.payload);
      };
    };
    expect(await instance.preview(request, { name: '损坏生成传输' }).then(() => true, () => false)).toBe(false);
    expect(changed).toBe(true); expect(parseTerrainImport).not.toHaveBeenCalled(); expect(LinkedWorker.instances).toHaveLength(1);
    expect(LinkedWorker.instances[0].closed).toBe(true); expect(await api().listAtlasDrafts()).toEqual([]);
  });
  it.each(['cancel', 'lost-reply'] as const)('recovers an already committed import through %s without a second root', async fault => {
    const instance = client(), preview = await instance.preview(request, { name: '保存后中断' });
    const importer = LinkedWorker.instances.find(worker => worker.kind === 'importer')!, commit = vi.spyOn(api(), 'commitAtlasPreparation');
    importer.responseFault = packet => {
      if (packet.header.type === 'complete' && (packet.header.body as { operation?: string })?.operation === 'confirm') {
        if (fault === 'cancel') instance.cancel(); else setTimeout(() => importer.onerror?.(), 0);
        return null;
      }
      return encodeAtlasPacket(packet.header, packet.payload);
    };
    const receipt = await instance.confirm(); expect(receipt.committed).toBe(true); expect(receipt.draftId).toBe(preview.terrain.identity.draftId);
    expect(commit).toHaveBeenCalledOnce(); expect(await api().listAtlasDrafts()).toHaveLength(1);
    await expect(instance.confirm()).rejects.toThrow('没有'); expect(commit).toHaveBeenCalledOnce();
  });
});
