/**
 * Writes a solid 1024×1024 RGBA PNG (no npm deps) for `tauri icon logo.png`.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 1024;
const H = 1024;
const R = 30;
const G = 58;
const B = 95;
const A = 255;

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crcIn = Buffer.concat([t, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(crcIn), 0);
  return Buffer.concat([len, t, data, c]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const row = 1 + W * 4;
const raw = Buffer.alloc(row * H);
for (let y = 0; y < H; y++) {
  const o = y * row;
  raw[o] = 0;
  for (let x = 0; x < W; x++) {
    const p = o + 1 + x * 4;
    raw[p] = R;
    raw[p + 1] = G;
    raw[p + 2] = B;
    raw[p + 3] = A;
  }
}

const idat = deflateSync(raw, { level: 9 });

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync("logo.png", png);
console.log("Wrote logo.png (1024×1024)");
