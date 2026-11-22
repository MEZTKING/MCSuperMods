// Spike engine: vanilla (or fixture) files -> deepslate registries, with the pre-pass fixes the walker found.
import * as ds from '/home/user/MCSuperMods/node_modules/.pnpm/deepslate@0.27.2/node_modules/deepslate/lib/index.js';
import { loadDataDir, V } from './files.mjs';
export { ds };
const { Identifier, BlockState, BlockPos, ChunkPos, Chunk } = ds;
const { WorldgenRegistries, NoiseGeneratorSettings, RandomState, NoiseChunkGenerator, BiomeSource, DensityFunction, MaterialRuleContext, NoiseChunk, DensityVolume } = ds;

export const fixes = { renamedRouter: 0, renamedStoneDepth: 0, upscaleMapped: 0, upscaleUnmapped: 0, defaultBlockAdded: 0 };
// Pre-pass over a JSON tree: field renames and type swaps deepslate needs; returns a new tree.
export function prepass(o, ctx = {}) {
  if (Array.isArray(o)) return o.map((x) => prepass(x, ctx));
  if (!o || typeof o !== 'object') return o;
  let r = {};
  for (const [k, v] of Object.entries(o)) r[k] = prepass(v, ctx);
  const t = typeof r.type === 'string' ? r.type.replace(/^minecraft:/, '') : undefined;
  if ((t === 'y_above' || t === 'water') && 'add_stone_depth' in r) {
    r.add_surface_depth = r.add_stone_depth; delete r.add_stone_depth; fixes.renamedStoneDepth++;
  }
  if (t === 'interval_select' && process.env.IVFIX && Array.isArray(r.functions) && r.functions.length === (r.thresholds ?? []).length + 1) {
    // deepslate 0.27.2 drops the last function (fixed in 0.27.3): the same choice as a chain of range_choice nodes
    const th = r.thresholds; let node = r.functions[th.length];
    for (let i = th.length - 1; i >= 0; i--) node = { type: 'minecraft:range_choice', input: r.input, min_inclusive: i === 0 ? -1e300 : th[i - 1], max_exclusive: th[i], when_in_range: r.functions[i], when_out_of_range: node };
    // the chain above tests from the top; rebuild it so each band is [th[i-1], th[i])
    r = node; fixes.intervalSelect = (fixes.intervalSelect ?? 0) + 1;
  }
  if (t === 'upscale') {
    const ax = r.x, ay = r.y, az = r.z;
    const lin = [ax, ay, az].every((a) => a && (a.mode ?? 'interpolate_linear') === 'interpolate_linear');
    if (lin && ax.cell_size === az.cell_size && !ctx.noUpscale) {
      r = { type: 'minecraft:interpolated', input: r.input, cell_size_xz: ax.cell_size, cell_size_y: ay.cell_size };
      fixes.upscaleMapped++;
    } else fixes.upscaleUnmapped++;
  }
  return r;
}
export function prepSettings(s) {
  s = prepass(s);
  if (s.noise_router && 'chunk_surface_level' in s.noise_router) {
    s.noise_router.preliminary_surface_level = s.noise_router.chunk_surface_level; fixes.renamedRouter++;
  }
  if (!('default_block' in s)) { s.default_block = 'minecraft:stone'; fixes.defaultBlockAdded++; }
  return s;
}
const cache = {};
export function vanillaFiles(version) { return (cache[version] ??= loadDataDir(`${V}/${version}`)); }

// Fill deepslate's global registries (they are static: one world at a time).
export function fillRegistries(files, opts = {}) {
  const regs = [
    [WorldgenRegistries.NOISE, 'worldgen/noise', (j) => ds.NormalNoise.fromJson(j)],
    [WorldgenRegistries.DENSITY_FUNCTION, 'worldgen/density_function', (j) => DensityFunction.fromJson(prepass(j, opts))],
    [WorldgenRegistries.MATERIAL_RULE, 'worldgen/material_rule', (j) => ds.MaterialRule.fromJson(prepass(j, opts))],
    [WorldgenRegistries.MATERIAL_CONDITION, 'worldgen/material_condition', (j) => ds.MaterialCondition.fromJson(prepass(j, opts))],
    [WorldgenRegistries.NOISE_SETTINGS, 'worldgen/noise_settings', (j) => NoiseGeneratorSettings.fromJson(prepSettings(j))],
  ];
  for (const [reg, key, parse] of regs) {
    for (const id of reg.keys()) if (!(reg === WorldgenRegistries.NOISE && ['minecraft:surface', 'minecraft:surface_secondary'].includes(id.toString()))) reg.delete(id);
    for (const [id, j] of Object.entries(files[key] ?? {})) reg.register(Identifier.parse(id), () => parse(j));
  }
  for (const id of WorldgenRegistries.BIOME.keys()) WorldgenRegistries.BIOME.delete(id);
  for (const id of Object.keys(files['worldgen/biome'] ?? {})) WorldgenRegistries.BIOME.register(Identifier.parse(id), {});
}

export function makeWorld(files, dimension, seed) {
  // dimension: { type, generator: { type: 'noise', settings, biome_source } }
  const g = dimension.generator;
  const settingsJson = typeof g.settings === 'string' ? files['worldgen/noise_settings'][g.settings] : g.settings;
  const settings = NoiseGeneratorSettings.fromJson(prepSettings(settingsJson));
  const biomeSource = BiomeSource.fromJson(g.biome_source);
  const gen = new NoiseChunkGenerator(biomeSource, settings);
  const rs = new RandomState(settings, BigInt(seed));
  return { settings, biomeSource, gen, rs };
}

const AIR = BlockState.AIR;
// One column: fill (density + aquifer), then surface rules with a biome getter. Returns array of state names (index y - minY).
export function column(world, bx, bz, biomeAt, { surface = true } = {}) {
  const { gen, rs, settings } = world;
  const minY = settings.noise.minY, height = settings.noise.height;
  const fill = new Array(height);
  gen.iterateNoiseColumn(rs, bx, bz, fill, undefined);
  if (!surface) return fill.map((s) => s.getName().toString());
  const chunk = new Chunk(minY, height, ChunkPos.create(bx >> 4, bz >> 4));
  const volume = new DensityVolume(1, height, 1, bx, minY, bz);
  const nc = new NoiseChunk(rs, settings, gen.globalFluidPicker, volume);
  const ctx = { minY, height, seaLevel: settings.seaLevel };
  const rc = new MaterialRuleContext(rs.surfaceSystem, rs, chunk, nc, ctx, (pos) => biomeAt(pos[0], pos[1], pos[2]));
  const rule = settings.materialRule.compile(rc);
  rc.updateXZ(bx, bz);
  let stoneAbove = 0, waterHeight = Number.MIN_SAFE_INTEGER, nextCeiling = Number.MAX_SAFE_INTEGER;
  for (let y = minY + height - 1; y >= minY; y--) {
    const old = fill[y - minY];
    if (old.equals(AIR)) { stoneAbove = 0; waterHeight = Number.MIN_SAFE_INTEGER; continue; }
    if (old.isFluid()) { if (waterHeight === Number.MIN_SAFE_INTEGER) waterHeight = y + 1; continue; }
    if (nextCeiling >= y) {
      nextCeiling = Number.MIN_SAFE_INTEGER;
      for (let ly = y - 1; ly >= minY; ly--) { const s = fill[ly - minY]; if (s.equals(AIR) || s.isFluid()) { nextCeiling = ly + 1; break; } }
    }
    stoneAbove++;
    rc.updateY(stoneAbove, y - nextCeiling + 1, waterHeight, y);
    const st = rule(bx, y, bz);
    if (st) fill[y - minY] = st;
  }
  return fill.map((s) => s.getName().toString());
}
export function biomeOf(world, qx, qy, qz) { return world.gen.computeBiome(world.rs, qx, qy, qz).toString(); }

// A whole chunk: deepslate's fill, then the surface pass over all 256 columns with a biome getter.
export function buildChunk(world, cx, cz, biomeAt, { surface = true } = {}) {
  const { gen, rs, settings } = world;
  const minY = settings.noise.minY, height = settings.noise.height;
  const chunk = new Chunk(minY, height, ChunkPos.create(cx, cz));
  const nc = gen.createNoiseChunk(rs, chunk, false);
  gen.doFill(chunk, nc);
  if (!surface) return chunk;
  const ctx = { minY, height, seaLevel: settings.seaLevel };
  const rc = new MaterialRuleContext(rs.surfaceSystem, rs, chunk, nc, ctx, (pos) => biomeAt(pos[0], pos[1], pos[2]));
  const rule = settings.materialRule.compile(rc);
  const pos = [0, 0, 0];
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    const bx = cx * 16 + x, bz = cz * 16 + z;
    rc.updateXZ(bx, bz);
    let stoneAbove = 0, waterHeight = Number.MIN_SAFE_INTEGER, nextCeiling = Number.MAX_SAFE_INTEGER;
    for (let y = minY + height - 1; y >= minY; y--) {
      pos[0] = bx; pos[1] = y; pos[2] = bz;
      const old = chunk.getBlockState(pos);
      if (old.equals(AIR)) { stoneAbove = 0; waterHeight = Number.MIN_SAFE_INTEGER; continue; }
      if (old.isFluid()) { if (waterHeight === Number.MIN_SAFE_INTEGER) waterHeight = y + 1; continue; }
      if (nextCeiling >= y) {
        nextCeiling = Number.MIN_SAFE_INTEGER;
        for (let ly = y - 1; ly >= minY; ly--) { const s = chunk.getBlockState([bx, ly, bz]); if (s.equals(AIR) || s.isFluid()) { nextCeiling = ly + 1; break; } }
      }
      stoneAbove++;
      rc.updateY(stoneAbove, y - nextCeiling + 1, waterHeight, y);
      const st = rule(bx, y, bz);
      if (st) chunk.setBlockState([bx, y, bz], st);
    }
  }
  return chunk;
}
