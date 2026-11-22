// MSM's own pictures from the spike engine: a biome map of b574:clim_mix (MSM's own parameter list) and a side cut.
import fs from 'node:fs'; import zlib from 'node:zlib';
import { vanillaFiles, fillRegistries, makeWorld, column, ds } from './engine.mjs';
import { loadDataDir } from './files.mjs';
await import('./fastinterp.mjs');
const B = '/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b574';
const files = vanillaFiles('26.3'); fillRegistries(files);
const w = makeWorld(files, loadDataDir(`${B}/pack/26.3`).dimension['b574:clim_mix'], 0n);
const W = 256, Hm = 256, Hs = 96;
const img = Buffer.alloc(W * (Hm + Hs) * 3);
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const colour = (id) => { const h = hash(id); return [80 + (h & 127), 80 + ((h >> 7) & 127), 80 + ((h >> 14) & 127)]; };
for (let x = 0; x < W; x++) for (let z = 0; z < Hm; z++) { const b = w.gen.computeBiome(w.rs, x - 128, 16, z - 128).toString(); const c = colour(b); img.set(c, (z * W + x) * 3); }
const stateColour = (s) => s === 'minecraft:air' ? [200, 225, 255] : s === 'minecraft:water' ? [40, 80, 200] : s === 'minecraft:lava' ? [230, 90, 20] : /grass/.test(s) ? [70, 160, 60] : /sand|terracotta/.test(s) ? [220, 200, 140] : /dirt|mud/.test(s) ? [130, 90, 60] : /deepslate/.test(s) ? [70, 70, 80] : [128, 128, 128];
for (let x = 0; x < W; x++) {
  const col = column(w, (x - 128) * 4, 0, (bx, by, bz) => w.gen.computeBiome(w.rs, bx >> 2, by >> 2, bz >> 2));
  for (let r = 0; r < Hs; r++) { const y = 319 - r * 4; img.set(stateColour(col[y + 64]), ((Hm + r) * W + x) * 3); }
}
// PNG
const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const H = Hm + Hs; const raw = Buffer.alloc(H * (W * 3 + 1));
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(process.argv[2], Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', process.argv[2]);
