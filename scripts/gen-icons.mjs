/**
 * Generates Vault's raster app icons from the same lettermark as the SVG
 * favicon (a cream "V" on the dark-green ground, #0d1614 / #f3e7c9).
 *
 * Pure Node — no rasterizer dependency. The "V" is drawn as a filled
 * polygon with 4x supersampled anti-aliasing; PNGs are encoded by hand
 * (zlib for the IDAT stream) and packed into a multi-size PNG-in-ICO.
 *
 * Run `npm run gen:icons` after changing the colours or glyph below.
 * Emits into public/: favicon.ico, apple-touch-icon.png, icon-192.png,
 * icon-512.png. The scalable icon.svg stays the hand-authored source.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = [0x0d, 0x16, 0x14]; // #0d1614
const FG = [0xf3, 0xe7, 0xc9]; // #f3e7c9

// "V" outline in a 0..100 box, traced as one simple (non-self-intersecting)
// polygon: outer-top-left, inner-top-left, inner apex, inner-top-right,
// outer-top-right, outer bottom point.
const GLYPH = [
  [22, 28],
  [38, 28],
  [50, 58],
  [62, 28],
  [78, 28],
  [50, 72],
];

function inPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// RGBA pixel buffer for a size x size icon. SS = supersampling factor.
function renderRGBA(size, SS = 4) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = ((x + (sx + 0.5) / SS) / size) * 100;
          const ny = ((y + (sy + 0.5) / SS) / size) * 100;
          if (inPolygon(nx, ny, GLYPH)) hits++;
        }
      }
      const a = hits / (SS * SS);
      const o = (y * size + x) * 4;
      buf[o] = Math.round(BG[0] + (FG[0] - BG[0]) * a);
      buf[o + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * a);
      buf[o + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * a);
      buf[o + 3] = 255;
    }
  }
  return buf;
}

// --- PNG encoding -----------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // 10,11,12 = compression / filter / interlace = 0
  // Prefix each scanline with filter byte 0 (none).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- ICO (PNG-compressed entries) -------------------------------------------
function encodeICO(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const e = i * 16;
    dir[e] = size >= 256 ? 0 : size;
    dir[e + 1] = size >= 256 ? 0 : size;
    dir[e + 2] = 0; // palette
    dir[e + 3] = 0; // reserved
    dir.writeUInt16LE(1, e + 4); // planes
    dir.writeUInt16LE(32, e + 6); // bpp
    dir.writeUInt32LE(data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

// --- emit -------------------------------------------------------------------
function png(size) {
  return encodePNG(size, renderRGBA(size));
}

const icoSizes = [16, 32, 48];
writeFileSync(
  join(PUBLIC_DIR, 'favicon.ico'),
  encodeICO(icoSizes.map((size) => ({ size, data: png(size) }))),
);
writeFileSync(join(PUBLIC_DIR, 'apple-touch-icon.png'), png(180));
writeFileSync(join(PUBLIC_DIR, 'icon-192.png'), png(192));
writeFileSync(join(PUBLIC_DIR, 'icon-512.png'), png(512));

console.log('Wrote favicon.ico (16/32/48), apple-touch-icon.png, icon-192.png, icon-512.png');
