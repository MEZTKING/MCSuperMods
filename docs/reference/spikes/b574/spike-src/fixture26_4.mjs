// WS8: learn domain_warp and upscale from MSM's own fixture world (26.4), by observation only.
import fs from 'node:fs'; import zlib from 'node:zlib';
import { vanillaFiles, fillRegistries, ds } from './engine.mjs';
const dump = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${process.argv[2]}`)));
const seed = BigInt(process.argv[3] ?? 574);
const files = vanillaFiles('26.4-snapshot-7'); fillRegistries(files);
const fx = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b574/pack/fixture-26.4/data/b574/worldgen/noise_settings/twin.json'));
const settings = ds.NoiseGeneratorSettings.fromJson({ ...fx, default_block: 'minecraft:stone' });
const rs = new ds.RandomState(settings, seed);
const H = rs.router.finalDensity;
const N2 = new ds.RandomState(ds.NoiseGeneratorSettings.fromJson({ ...fx, default_block: 'minecraft:stone', noise_router: { ...fx.noise_router, final_density: { type: 'minecraft:noise', noise: 'minecraft:surface_secondary', xz_scale: 1, y_scale: 0 } } }), seed).router.finalDensity;
const f = (fn) => (x, y, z) => fn.compute({ x, y, z });
const h = f(H), n2 = f(N2);
const lerp = (t, a, b) => a + t * (b - a);
const ease = { lin: (t) => t, cos: (t) => (1 - Math.cos(Math.PI * t)) / 2 };
const up = (g, w, hY, mode) => (x, y, z) => {
  const cx = Math.floor(x / w), cz = Math.floor(z / w), cy = Math.floor(y / hY);
  const tx = (x - cx * w) / w, tz = (z - cz * w) / w, ty = (y - cy * hY) / hY;
  if (mode === 'nn_floor') return g(cx * w, y, cz * w);
  if (mode === 'nn_round') return g(Math.round(x / w) * w, y, Math.round(z / w) * w);
  if (mode === 'nn_centre') return g(cx * w + w / 2, y, cz * w + w / 2);
  const e = ease[mode];
  const ex = e(tx), ez = e(tz), ey = hY === 1 ? 0 : ty;
  const c = (i, j, k) => g((cx + i) * w, (cy + j) * hY, (cz + k) * w);
  return lerp(ez, lerp(ey, lerp(ex, c(0, 0, 0), c(1, 0, 0)), lerp(ex, c(0, 1, 0), c(1, 1, 0))), lerp(ey, lerp(ex, c(0, 0, 1), c(1, 0, 1)), lerp(ex, c(0, 1, 1), c(1, 1, 1))));
};
const hyps = {
  twin: { H: h },
  warp_const: { 'H(x+16)': (x, y, z) => h(x + 16, y, z), 'H(x-16)': (x, y, z) => h(x - 16, y, z) },
  warp_fn: { 'H(z+off)': (x, y, z) => h(x, y, z + 24 * n2(x, y, z)), 'H(floor(z+off))': (x, y, z) => h(x, y, Math.floor(z + 24 * n2(x, y, z))), 'H(round(z+off))': (x, y, z) => h(x, y, Math.round(z + 24 * n2(x, y, z))), 'H(z+off@y0)': (x, y, z) => h(x, y, z + 24 * n2(x, 0, z)), 'H(z+floor(off))': (x, y, z) => h(x, y, z + Math.floor(24 * n2(x, y, z))), 'H(z-off)': (x, y, z) => h(x, y, z - 24 * n2(x, y, z)) },
  up_lin: { lin: up(h, 8, 4, 'lin'), deepslateInterpolated: f(new ds.DensityFunction.Interpolated(H, 8, 4)) },
  up_nn: { nn_floor: up(h, 8, 1, 'nn_floor'), nn_round: up(h, 8, 1, 'nn_round'), nn_centre: up(h, 8, 1, 'nn_centre') },
  up_cos: { cos: up(h, 8, 1, 'cos'), lin: up(h, 8, 1, 'lin') },
};
const out = {};
for (const [name, hs] of Object.entries(hyps)) {
  const chunks = dump[`b574:${name}`].filter((c) => c.cols && (c.status === 'minecraft:full' || c.status === 'minecraft:terrain'));
  const res = {};
  for (const [hn, g] of Object.entries(hs)) {
    let n = 0, exact = 0, maxErr = 0;
    for (const c of chunks) for (const idx of [2, 6, 10, 14].flatMap((x) => [2, 6, 10, 14].map((z) => x + z * 16))) {
      const runs = c.cols.runs[idx]; if (!runs) continue;
      const obs = []; for (const [l, k] of runs) for (let i = 0; i < k; i++) obs.push(l);
      let to = -1; for (let y = obs.length - 1; y >= 0; y--) if (obs[y] === 'stone') { to = y + c.cols.ymin; break; }
      const bx = c.cx * 16 + (idx & 15), bz = c.cz * 16 + (idx >> 4);
      let td = -1; for (let y = 127; y >= 0; y--) if (g(bx, y, bz) > 0) { td = y; break; }
      n++; if (to === td) exact++; maxErr = Math.max(maxErr, Math.abs(to - td));
    }
    res[hn] = { columns: n, exact, rate: +(exact / n).toFixed(3), maxErr };
  }
  out[name] = res; console.error(name, JSON.stringify(res));
}
console.log(JSON.stringify(out));
