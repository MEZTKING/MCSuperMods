// Spike-only speed-up of deepslate's Interpolated: numeric cache keys and an inline trilinear lerp.
// Same corners and same lerp order as deepslate's, so results are identical (checked by parity.mjs --fast).
import { ds } from './engine.mjs';
const P = ds.DensityFunction.Interpolated.prototype;
const ctx = { x: 0, y: 0, z: 0 };
P.compute = function ({ x: bx, y: by, z: bz }) {
  const w = this.cellSizeXz, h = this.cellSizeY;
  const cx = Math.floor(bx / w), cy = Math.floor(by / h), cz = Math.floor(bz / w);
  const fx = (bx - cx * w) / w, fy = (by - cy * h) / h, fz = (bz - cz * w) / w;
  const c = (i, j, k) => {
    const key = ((cx + i + 1048576) * 2097152 + (cz + k + 1048576)) * 2048 + (cy + j + 1024);
    let v = this.values.get(key);
    if (v === undefined) { v = this.input.compute({ x: (cx + i) * w, y: (cy + j) * h, z: (cz + k) * w }); this.values.set(key, v); }
    return v;
  };
  const l = (t, a, b) => a + t * (b - a);
  return l(fz,
    l(fy, l(fx, c(0, 0, 0), c(1, 0, 0)), l(fx, c(0, 1, 0), c(1, 1, 0))),
    l(fy, l(fx, c(0, 0, 1), c(1, 0, 1)), l(fx, c(0, 1, 1), c(1, 1, 1))));
};
