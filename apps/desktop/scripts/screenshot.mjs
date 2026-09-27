// Captures one window of the desktop container's X display as a PNG, so the Tauri app can be
// checked from Docker. Usage (inside the desktop container): node apps/desktop/scripts/screenshot.mjs "Jot" out.png
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const [title = 'Jot', out = '.screenshots/window.png'] = process.argv.slice(2);
const xwd = execFileSync('xwd', ['-name', title, '-silent'], { maxBuffer: 256 * 1024 * 1024 });
const field = (i) => xwd.readUInt32BE(i * 4);
const headerSize = field(0);
const [width, height, byteOrder, bitsPerPixel, bytesPerLine, colors] = [field(4), field(5), field(7), field(11), field(12), field(19)];
const pixels = headerSize + colors * 12;

const rows = [];
for (let y = 0; y < height; y++) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    const at = pixels + y * bytesPerLine + x * (bitsPerPixel / 8);
    const px = byteOrder === 0 ? xwd.readUInt32LE(at) : xwd.readUInt32BE(at);
    row[1 + x * 3] = (px >> 16) & 255;
    row[2 + x * 3] = (px >> 8) & 255;
    row[3 + x * 3] = px & 255;
  }
  rows.push(row);
}

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 2; // RGB
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
console.log(`${out} ${width}x${height}`);
