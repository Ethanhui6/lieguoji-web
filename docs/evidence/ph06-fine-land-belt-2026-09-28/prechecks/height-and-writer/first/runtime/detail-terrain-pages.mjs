import { sampleDetailCoastNode } from './detail-coast-field.mjs';
/** Derived, disposable GPU input. This is not another persisted geography
 * format. All five sources must be reserved in the existing texture ledger. */
export const DETAIL_TERRAIN_NODE_SIDE = 2049;
export const DETAIL_TERRAIN_NODE_COUNT = DETAIL_TERRAIN_NODE_SIDE ** 2;
export const DETAIL_TERRAIN_PAGE_WIDTH = 1024;
export const DETAIL_TERRAIN_PAGE_CAPACITY = 1024 * 1024;
export const DETAIL_TERRAIN_PAGE_COUNT = 5;
export const DETAIL_TERRAIN_NODE_BYTES = 4;
/** A bounded synchronous piece; the owning Worker must yield between pieces. */
export const DETAIL_TERRAIN_PACK_NODE_LIMIT = 4096;
function integer(value, min, max, label) {
    if (!Number.isSafeInteger(value) || value < min || value > max)
        throw new Error(`细地形${label}超出范围。`);
}
function byteRange(bytes, offset) {
    if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer))
        throw new Error('细地形字节必须是独立的 Uint8Array。');
    integer(offset, 0, bytes.length - 4, '字节地址');
}
function validateSample(coverageQ, heightMeters) {
    integer(coverageQ, -32767, 32767, '覆盖值');
    integer(heightMeters, -12000, 12000, '节点高度');
    if (coverageQ > 0 && heightMeters < 0 || coverageQ < 0 && heightMeters > -1 || coverageQ === 0 && heightMeters !== 0)
        throw new Error('细地形节点海陆与高度不一致。');
}
export function detailTerrainPageLayout(page) {
    integer(page, 0, DETAIL_TERRAIN_PAGE_COUNT - 1, '页号');
    const startNode = page * DETAIL_TERRAIN_PAGE_CAPACITY, nodeCount = Math.min(DETAIL_TERRAIN_PAGE_CAPACITY, DETAIL_TERRAIN_NODE_COUNT - startNode);
    const width = DETAIL_TERRAIN_PAGE_WIDTH, height = Math.ceil(nodeCount / width), pixels = width * height;
    return { page, startNode, nodeCount, width, height, pixels, byteLength: pixels * DETAIL_TERRAIN_NODE_BYTES, paddingPixels: pixels - nodeCount };
}
export function detailTerrainSourceLedger() {
    const pages = Array.from({ length: DETAIL_TERRAIN_PAGE_COUNT }, (_, page) => detailTerrainPageLayout(page));
    return { pages, nodeCount: DETAIL_TERRAIN_NODE_COUNT, nodeBytes: DETAIL_TERRAIN_NODE_COUNT * DETAIL_TERRAIN_NODE_BYTES,
        pixels: pages.reduce((sum, page) => sum + page.pixels, 0), byteLength: pages.reduce((sum, page) => sum + page.byteLength, 0), paddingPixels: pages.reduce((sum, page) => sum + page.paddingPixels, 0) };
}
export function detailTerrainIndexAddress(nodeIndex) {
    integer(nodeIndex, 0, DETAIL_TERRAIN_NODE_COUNT - 1, '节点索引');
    const page = Math.floor(nodeIndex / DETAIL_TERRAIN_PAGE_CAPACITY), texel = nodeIndex % DETAIL_TERRAIN_PAGE_CAPACITY;
    return { nodeIndex, page, texel, x: texel % DETAIL_TERRAIN_PAGE_WIDTH, y: Math.floor(texel / DETAIL_TERRAIN_PAGE_WIDTH), byteOffset: texel * DETAIL_TERRAIN_NODE_BYTES };
}
export function detailTerrainNodeAddress(nodeX, nodeY) {
    integer(nodeX, 0, 2048, '节点横坐标');
    integer(nodeY, 0, 2048, '节点纵坐标');
    return detailTerrainIndexAddress(nodeY * DETAIL_TERRAIN_NODE_SIDE + nodeX);
}
/** Little-endian signed 16 bits in RG (coverage), BA (metres). Alpha is data,
 * never opacity: upload as rgba8unorm, no premultiplication or colour transform. */
export function writeDetailTerrainSample(bytes, byteOffset, sample) {
    byteRange(bytes, byteOffset);
    validateSample(sample.coverageQ, sample.heightMeters);
    const coverage = sample.coverageQ & 65535, height = sample.heightMeters & 65535;
    bytes[byteOffset] = coverage & 255;
    bytes[byteOffset + 1] = coverage >>> 8;
    bytes[byteOffset + 2] = height & 255;
    bytes[byteOffset + 3] = height >>> 8;
}
export function readDetailTerrainSample(bytes, byteOffset = 0) {
    byteRange(bytes, byteOffset);
    const coverage = bytes[byteOffset] | bytes[byteOffset + 1] << 8, height = bytes[byteOffset + 2] | bytes[byteOffset + 3] << 8;
    const sample = { coverageQ: coverage >= 32768 ? coverage - 65536 : coverage, heightMeters: height >= 32768 ? height - 65536 : height };
    validateSample(sample.coverageQ, sample.heightMeters);
    return sample;
}
/** Call only on the owning, already validated snapshot. This function does not
 * replace ingress ownership/hash verification and does not retain the field.
 * It copies at most 16 KiB; the caller supplies cancellation/progress/yields. */
export function packDetailTerrainNodeRange(field, startNode, nodeCount) {
    integer(startNode, 0, DETAIL_TERRAIN_NODE_COUNT - 1, '开始节点');
    integer(nodeCount, 1, Math.min(DETAIL_TERRAIN_PACK_NODE_LIMIT, DETAIL_TERRAIN_NODE_COUNT - startNode), '分片节点数');
    const bytes = new Uint8Array(nodeCount * DETAIL_TERRAIN_NODE_BYTES);
    for (let index = 0; index < nodeCount; index++) {
        const node = startNode + index, sample = sampleDetailCoastNode(field, node % DETAIL_TERRAIN_NODE_SIDE, Math.floor(node / DETAIL_TERRAIN_NODE_SIDE));
        writeDetailTerrainSample(bytes, index * DETAIL_TERRAIN_NODE_BYTES, sample);
    }
    return { startNode, nodeCount, bytes };
}
/** Assemble a privately owned page; a chunk may intersect two pages. Returns
 * copied nodes, not page-complete status. The caller must track complete page
 * coverage and snapshot identity before exposing any source to the renderer. */
export function copyDetailTerrainChunkToPage(page, target, chunk) {
    const layout = detailTerrainPageLayout(page);
    if (!(target instanceof Uint8Array) || !(target.buffer instanceof ArrayBuffer) || target.length !== layout.byteLength)
        throw new Error('细地形页缓冲长度错误。');
    integer(chunk.startNode, 0, DETAIL_TERRAIN_NODE_COUNT - 1, '分片开始节点');
    integer(chunk.nodeCount, 1, Math.min(DETAIL_TERRAIN_PACK_NODE_LIMIT, DETAIL_TERRAIN_NODE_COUNT - chunk.startNode), '分片节点数');
    if (!(chunk.bytes instanceof Uint8Array) || !(chunk.bytes.buffer instanceof ArrayBuffer) || chunk.bytes.length !== chunk.nodeCount * DETAIL_TERRAIN_NODE_BYTES)
        throw new Error('细地形分片字节长度错误。');
    const start = Math.max(layout.startNode, chunk.startNode), end = Math.min(layout.startNode + layout.nodeCount, chunk.startNode + chunk.nodeCount);
    if (start >= end)
        return 0;
    target.set(chunk.bytes.subarray((start - chunk.startNode) * 4, (end - chunk.startNode) * 4), (start - layout.startNode) * 4);
    return end - start;
}
