import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createPng(size, ringRadius, ringThickness, greenColor = [22, 163, 74]) {
  const width = size;
  const height = size;
  const cx = size / 2;
  const cy = size / 2;
  const halfT = ringThickness / 2;

  // Raw RGBA scanlines: 1 filter byte + width * 4 bytes per row
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(rowBytes * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Distance from center of ring boundary
      const ringDist = Math.abs(dist - ringRadius);

      // Anti-aliased alpha: 1.0 inside boundary, fading to 0.0 at edges
      let alpha = 0;
      if (ringDist <= halfT - 0.75) {
        alpha = 1.0;
      } else if (ringDist < halfT + 0.75) {
        alpha = (halfT + 0.75 - ringDist) / 1.5;
      }

      if (alpha > 0) {
        rawData[pxOffset] = greenColor[0];     // R
        rawData[pxOffset + 1] = greenColor[1]; // G
        rawData[pxOffset + 2] = greenColor[2]; // B
        rawData[pxOffset + 3] = Math.round(alpha * 255); // A
      } else {
        // Transparent (no fill in middle and outside)
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  // Deflate IDAT data
  const compressed = zlib.deflateSync(rawData);

  // Helper to build chunks
  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = zlib.crc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crc >>> 0, 8 + len);
    return buf;
  }

  // IHDR chunk (13 bytes)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.resolve(__dirname, '../public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 512x512 icon: radius 195, thickness 36px
const png512 = createPng(512, 195, 36, [22, 163, 74]); // #16a34a
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), png512);

// 192x192 icon: radius 73, thickness 14px
const png192 = createPng(192, 73, 14, [22, 163, 74]); // #16a34a
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), png192);

// SVG vector icon for web & favicon:
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <circle cx="256" cy="256" r="195" stroke="#16a34a" stroke-width="36" />
</svg>
`;
fs.writeFileSync(path.resolve(__dirname, '../public/icon.svg'), svg, 'utf8');

console.log('Successfully generated green circular ring icons (192, 512, svg)');
