import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import type { NaturalPointQ, roundAndIndexNaturalOutline } from './runtime/detail-natural-outline';
type Outline = Awaited<ReturnType<typeof roundAndIndexNaturalOutline>>;
const crcTable = Array.from({ length: 256 }, (_, i) => { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
function chunk(name: string, bytes: Buffer) {
  const body = Buffer.concat([Buffer.from(name), bytes]); let crc = 0xffffffff;
  for (const value of body) crc = crcTable[(crc ^ value) & 255] ^ crc >>> 8;
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(bytes.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
export function renderOutline(file: string, outline: Outline, source: readonly NaturalPointQ[], frame: { x: number; y: number; span: number }) {
  const size = 768, rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const land = outline.inside((frame.x + (x + .5) / size * frame.span) * 256, (frame.y + (y + .5) / size * frame.span) * 256);
    rgba.set(land ? [156, 177, 133, 255] : [25, 53, 66, 255], (y * size + x) * 4);
  }
  const line = (a: NaturalPointQ, b: NaturalPointQ, color: number[], dashed: boolean) => {
    const x0 = (a.xQ / 256 - frame.x) / frame.span * size, y0 = (a.yQ / 256 - frame.y) / frame.span * size;
    const x1 = (b.xQ / 256 - frame.x) / frame.span * size, y1 = (b.yQ / 256 - frame.y) / frame.span * size;
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= steps; i++) {
      if (dashed && Math.floor(i / 10) % 2) continue;
      const x = Math.round(x0 + (x1 - x0) * i / Math.max(1, steps)), y = Math.round(y0 + (y1 - y0) * i / Math.max(1, steps));
      if (x >= 0 && x < size && y >= 0 && y < size) rgba.set(color, (y * size + x) * 4);
    }
  };
  for (const edge of outline.edges) line(edge.a, edge.b, [33, 43, 33, 255], false);
  for (let i = 0; i < source.length; i++) line(source[i], source[(i + 1) % source.length], [230, 231, 224, 255], true);
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) rows.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (1 + size * 4) + 1);
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]), { flag: 'wx' });
}
