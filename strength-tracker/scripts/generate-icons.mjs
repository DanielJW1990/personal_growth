/**
 * Generates the PWA icons as plain PNGs so the repo carries no binary assets
 * from outside. Run with `node scripts/generate-icons.mjs`.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BACKGROUND = [11, 15, 20, 255]; // ink-900
const FOREGROUND = [56, 189, 248, 255]; // accent

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size, pixelAt) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0; // filter type: none
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixelAt(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A dumbbell: a centre bar with a plate stack at each end. */
function dumbbellPixel(size) {
  const unit = size / 32;
  const inRect = (x, y, left, top, width, height) =>
    x >= left * unit && x < (left + width) * unit && y >= top * unit && y < (top + height) * unit;

  return (x, y) => {
    const isBar = inRect(x, y, 9, 15, 14, 2);
    const isInnerPlate = inRect(x, y, 7, 12, 2, 8) || inRect(x, y, 23, 12, 2, 8);
    const isOuterPlate = inRect(x, y, 4, 14, 3, 4) || inRect(x, y, 25, 14, 3, 4);
    return isBar || isInnerPlate || isOuterPlate ? FOREGROUND : BACKGROUND;
  };
}

mkdirSync(OUT_DIR, { recursive: true });

for (const size of [192, 512]) {
  writeFileSync(resolve(OUT_DIR, `icon-${size}.png`), encodePng(size, dumbbellPixel(size)));
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0b0f14"/>
  <g fill="#38bdf8">
    <rect x="9" y="15" width="14" height="2"/>
    <rect x="7" y="12" width="2" height="8"/>
    <rect x="23" y="12" width="2" height="8"/>
    <rect x="4" y="14" width="3" height="4"/>
    <rect x="25" y="14" width="3" height="4"/>
  </g>
</svg>
`;
writeFileSync(resolve(OUT_DIR, 'favicon.svg'), favicon);

console.log(`Wrote icons to ${OUT_DIR}`);
