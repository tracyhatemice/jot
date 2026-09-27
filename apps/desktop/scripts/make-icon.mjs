// Writes a solid 1024×1024 RGBA PNG used as the source for `tauri icon` (placeholder until real branding).
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const size = 1024;
const [r, g, b] = [0x2f, 0x4f, 0x6f];
const row = Buffer.alloc(1 + size * 4); // filter byte 0, then RGBA pixels
for (let x = 0; x < size; x++) row.set([r, g, b, 255], 1 + x * 4);
const raw = Buffer.concat(Array.from({ length: size }, () => row));

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8; // bit depth
header[9] = 6; // colour type RGBA
writeFileSync(
  process.argv[2] ?? 'app-icon.png',
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
