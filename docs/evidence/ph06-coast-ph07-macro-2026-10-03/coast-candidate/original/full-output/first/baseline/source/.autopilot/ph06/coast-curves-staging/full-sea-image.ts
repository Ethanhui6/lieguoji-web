import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import type { PhysicalView } from '../ridge-landform-staging/area-v2/physical-image';
const crcTable = Array.from({ length: 256 }, (_, i) => { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
function chunk(name: string, bytes: Buffer) {
  const body = Buffer.concat([Buffer.from(name), bytes]); let crc = 0xffffffff;
  for (const value of body) crc = crcTable[(crc ^ value) & 255] ^ crc >>> 8;
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(bytes.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
/** Actual persisted owner-node coverage, not height-sign or Hbase substitution. */
export function renderCoverageView(prefix: string, view: PhysicalView, sample: (xQ: number, yQ: number) => number) {
  const { width, height } = view, values = new Int16Array(width * height), rows = Buffer.alloc(height * (1 + width * 4));
  let positive = 0, zero = 0, negative = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = sample((view.leftWorld + x * view.stepWorld) * 256, (view.topWorld + y * view.stepWorld) * 256);
    if (!Number.isInteger(value) || value < -32767 || value > 32767) throw new Error('Invalid persisted coverage sample.');
    values[y * width + x] = value;
    if (value > 0) positive++; else if (value === 0) zero++; else negative++;
    rows.set(value > 0 ? [158, 178, 136, 255] : value === 0 ? [228, 217, 181, 255] : [25, 53, 66, 255], y * (1 + width * 4) + 1 + x * 4);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const image = `${prefix}-${view.name}-coverage.png`, raw = `${prefix}-${view.name}-coverage.i16`;
  writeFileSync(image, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]), { flag: 'wx' });
  writeFileSync(raw, new Uint8Array(values.buffer), { flag: 'wx' });
  return { image, raw, positive, zero, negative, sampleCount: values.length };
}
