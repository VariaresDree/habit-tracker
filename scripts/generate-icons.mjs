// Generates the PWA icon PNGs without any image dependencies.
// Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GREEN = [16, 185, 129, 255]; // #10b981
const WHITE = [255, 255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Check mark as two segments in unit coords, scaled per icon size.
function makeIcon(size, { maskable }) {
  const pad = maskable ? 0 : 0; // background always fills; check shrinks when maskable
  const radius = maskable ? 0 : size * 0.18;
  const inset = maskable ? size * 0.18 : size * 0.1; // safe zone for maskable
  const s = size - inset * 2;
  const a = [inset + s * 0.22, inset + s * 0.55];
  const mid = [inset + s * 0.43, inset + s * 0.74];
  const b = [inset + s * 0.78, inset + s * 0.3];
  const stroke = s * 0.09;

  return png(size, (x, y) => {
    // rounded-rect clip (transparent corners on non-maskable icons)
    if (!maskable) {
      const cx = Math.max(radius - x, x - (size - 1 - radius), 0);
      const cy = Math.max(radius - y, y - (size - 1 - radius), 0);
      if (Math.hypot(cx, cy) > radius + pad) return [0, 0, 0, 0];
    }
    const d = Math.min(
      distToSegment(x, y, a[0], a[1], mid[0], mid[1]),
      distToSegment(x, y, mid[0], mid[1], b[0], b[1]),
    );
    return d <= stroke ? WHITE : GREEN;
  });
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'pwa-192.png'), makeIcon(192, { maskable: false }));
writeFileSync(join(outDir, 'pwa-512.png'), makeIcon(512, { maskable: false }));
writeFileSync(join(outDir, 'maskable-512.png'), makeIcon(512, { maskable: true }));
console.log('icons written to', outDir);
