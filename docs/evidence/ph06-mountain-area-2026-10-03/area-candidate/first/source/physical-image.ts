import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

export interface PhysicalView { name: string; leftWorld: number; topWorld: number; stepWorld: number; width: number; height: number }
const crcTable = Array.from({ length: 256 }, (_, i) => { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
function chunk(name: string, bytes: Buffer) {
  const body = Buffer.concat([Buffer.from(name), bytes]); let crc = 0xffffffff;
  for (const value of body) crc = crcTable[(crc ^ value) & 255] ^ crc >>> 8;
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(bytes.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
function writePng(file: string, width: number, height: number, rgba: Uint8Array) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]), { flag: 'wx' });
}

/** CPU diagnostic of saved physical elevations, not a game renderer. No noise,
 * contour embellishment, artificial ridge lines or geometry-only overlay. */
export function renderPhysicalView(prefix: string, view: PhysicalView, sample: (xQ: number, yQ: number) => number, reliefMeters: number) {
  if (!/^[a-z0-9-]+$/.test(view.name) || ![view.width, view.height].every(n => Number.isInteger(n) && n >= 32 && n <= 768)
    || ![2, 4, 8, 16].includes(view.stepWorld) || view.leftWorld < 0 || view.topWorld < 0
    || view.leftWorld + (view.width - 1) * view.stepWorld > 4096 || view.topWorld + (view.height - 1) * view.stepWorld > 4096) throw new Error('Physical preview view must be explicitly bounded.');
  const values = new Int32Array(view.width * view.height); let low = Infinity, high = -Infinity;
  for (let y = 0; y < view.height; y++) for (let x = 0; x < view.width; x++) {
    const height = sample(Math.round((view.leftWorld + x * view.stepWorld) * 256), Math.round((view.topWorld + y * view.stepWorld) * 256));
    if (!Number.isFinite(height)) throw new Error('Non-finite physical preview height.');
    values[y * view.width + x] = Math.round(height); low = Math.min(low, height); high = Math.max(high, height);
  }
  const rgba = new Uint8Array(values.length * 4), grey = new Uint8Array(values.length * 4);
  for (let y = 0; y < view.height; y++) for (let x = 0; x < view.width; x++) {
    const id = y * view.width + x, h = values[id], land = h >= 0;
    const dx = (values[y * view.width + Math.min(view.width - 1, x + 1)] - values[y * view.width + Math.max(0, x - 1)]) / (2 * view.stepWorld);
    const dy = (values[Math.min(view.height - 1, y + 1) * view.width + x] - values[Math.max(0, y - 1) * view.width + x]) / (2 * view.stepWorld);
    // Fixed metres/world vertical factor; same for baseline and candidate.
    const nx = -dx * .04, ny = -dy * .04, normal = Math.hypot(nx, ny, 1);
    const shade = .35 + .65 * Math.max(0, (nx * -.45 + ny * -.55 + .704) / normal);
    const t = Math.min(1, Math.max(0, h / reliefMeters));
    const color = land ? [132 + 102 * t, 151 + 76 * t, 104 + 110 * t] : [24, 53, 68];
    for (let c = 0; c < 3; c++) { rgba[id * 4 + c] = Math.round(color[c] * (land ? shade : 1)); grey[id * 4 + c] = land ? Math.round(t * 255) : 0; }
    rgba[id * 4 + 3] = grey[id * 4 + 3] = 255;
  }
  writePng(`${prefix}-${view.name}-physical.png`, view.width, view.height, rgba);
  writePng(`${prefix}-${view.name}-height.png`, view.width, view.height, grey);
  writeFileSync(`${prefix}-${view.name}-height.i32`, new Uint8Array(values.buffer), { flag: 'wx' });
  return { view, minimumMeters: low, maximumMeters: high, sampleCount: values.length,
    physical: `${prefix}-${view.name}-physical.png`, heightImage: `${prefix}-${view.name}-height.png`, rawInt32: `${prefix}-${view.name}-height.i32` };
}
