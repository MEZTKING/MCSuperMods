// WS1/WS8 walker: every `type` in the terrain files against what deepslate 0.27.2's parsers read,
// and every field a parser does not read. Fields are taken from deepslate's own source (MIT).
import { loadDataDir, V } from './files.mjs';
const strip = (t) => (typeof t === 'string' ? t.replace(/^minecraft:/, '') : t);
const DF_FIELDS = {
  blend_alpha: [], blend_offset: [], beardifier: [], end_outer_islands: [],
  old_blended_noise: ['xz_scale', 'y_scale', 'xz_factor', 'y_factor', 'smear_scale_multiplier'],
  interpolated: ['input', 'argument', 'cell_size_xz', 'cell_size_y'],
  cache: ['input', 'argument'],
  noise: ['noise', 'xz_scale', 'y_scale', 'shift_x', 'shift_y', 'shift_z'],
  find_top_surface: ['density', 'upper_bound', 'lower_bound', 'cell_height'],
  range_choice: ['input', 'min_inclusive', 'max_exclusive', 'when_in_range', 'when_out_of_range'],
  shift_a: ['noise', 'argument'], shift_b: ['noise', 'argument'], shift: ['noise', 'argument'],
  blend_density: ['input', 'argument'], clamp: ['input', 'min', 'max'],
  interval_select: ['input', 'thresholds', 'functions'],
  spline: ['spline'], constant: ['value', 'argument'],
  gradient: ['axis', 'tiling', 'from_coordinate', 'to_coordinate', 'from_value', 'to_value'],
  lerp: ['alpha', 'first', 'second'], pow: ['base', 'exponent'],
  distance_to_point: ['point', 'metric'], slice: ['axis', 'coordinate', 'input'],
};
for (const u of ['abs', 'square', 'cube', 'sqrt', 'half_negative', 'quarter_negative', 'squeeze', 'reciprocal', 'negate', 'log', 'sign']) DF_FIELDS[u] = ['input', 'argument'];
for (const b of ['add', 'sub', 'mul', 'div', 'min', 'max']) DF_FIELDS[b] = ['left', 'right', 'argument1', 'argument2'];
for (const r of ['floor', 'round', 'ceil', 'truncate']) DF_FIELDS[r] = ['input', 'multiple'];
const DF_CHILD = new Set(['input', 'argument', 'argument1', 'argument2', 'left', 'right', 'shift_x', 'shift_y', 'shift_z', 'density', 'upper_bound', 'when_in_range', 'when_out_of_range', 'alpha', 'first', 'second', 'multiple', 'base', 'exponent']);
const RULE_FIELDS = { block: ['result_state'], sequence: ['sequence'], condition: ['if_true', 'then_run'] };
const COND_FIELDS = {
  above_preliminary_surface: [], biome: ['biome_is'], noise_threshold: ['noise', 'min_threshold', 'max_threshold', 'is_3d'],
  not: ['invert'], stone_depth: ['offset', 'add_surface_depth', 'secondary_depth_range', 'surface_type'],
  vertical_gradient: ['random_name', 'true_at_and_below', 'false_at_and_above'],
  water: ['offset', 'surface_depth_multiplier', 'add_surface_depth'],
  y_above: ['anchor', 'surface_depth_multiplier', 'add_surface_depth'],
};
const NOISE_FIELDS = ['base_amplitude', 'base_octave', 'octave_count', 'normalize', 'amplitude_modifiers'];
const SETTINGS_FIELDS = ['noise', 'default_block', 'default_fluid', 'noise_router', 'material_rule', 'sea_level', 'aquifers', 'legacy_random_source'];
const ROUTER_FIELDS = ['temperature', 'vegetation', 'continents', 'erosion', 'depth', 'ridges', 'preliminary_surface_level', 'final_density'];
const AQUIFER_FIELDS = ['barrier', 'fluid_level_floodedness', 'fluid_level_spread', 'lava', 'exclusion', 'surface_level'];

export function walk(files) {
  const types = { density_function: {}, material_rule: {}, material_condition: {}, chunk_generator: {}, biome_source: {} };
  const unsupported = {}; // "df:upscale" -> [where]
  const ignored = {}; // "df:noise.foo" -> count
  const add = (m, k, where) => { (m[k] ??= []).length < 5 && m[k].push(where); };
  const bump = (k, where) => { (ignored[k] ??= { count: 0, where: [] }).count++; if (ignored[k].where.length < 3) ignored[k].where.push(where); };
  function df(o, where) {
    if (typeof o === 'string' || typeof o === 'number' || o == null) return;
    if (typeof o !== 'object') return;
    const t = strip(o.type);
    types.density_function[t] = (types.density_function[t] ?? 0) + 1;
    const known = DF_FIELDS[t];
    if (!known) add(unsupported, `density_function:${t}`, where);
    for (const [k, v] of Object.entries(o)) {
      if (k === 'type') continue;
      if (known && !known.includes(k)) bump(`density_function:${t}.${k}`, where);
      if (DF_CHILD.has(k) || !known) {
        if (v && typeof v === 'object' && !Array.isArray(v) && 'cell_size' in v) continue; // upscale axis
        if (Array.isArray(v)) v.forEach((x) => df(x, where)); else df(v, where);
      }
      if (k === 'functions' && Array.isArray(v)) v.forEach((x) => df(x, where));
      if (k === 'spline') spline(v, where);
    }
  }
  function spline(s, where) {
    if (typeof s === 'number' || s == null) return;
    for (const k of Object.keys(s)) if (!['coordinate', 'points'].includes(k)) bump(`spline.${k}`, where);
    df(s.coordinate, where);
    for (const p of s.points ?? []) {
      for (const k of Object.keys(p)) if (!['location', 'value', 'derivative'].includes(k)) bump(`spline_point.${k}`, where);
      spline(p.value, where);
    }
  }
  function rule(o, where) {
    if (typeof o === 'string' || o == null) return;
    const t = strip(o.type);
    types.material_rule[t] = (types.material_rule[t] ?? 0) + 1;
    const known = RULE_FIELDS[t];
    if (!known) add(unsupported, `material_rule:${t}`, where);
    for (const [k, v] of Object.entries(o)) {
      if (k === 'type') continue;
      if (known && !known.includes(k)) bump(`material_rule:${t}.${k}`, where);
    }
    if (t === 'sequence') (o.sequence ?? []).forEach((r) => rule(r, where));
    if (t === 'condition') { cond(o.if_true, where); rule(o.then_run, where); }
    if (!known) for (const v of Object.values(o)) if (v && typeof v === 'object' && v.type) rule(v, where);
  }
  function cond(o, where) {
    if (typeof o === 'string' || o == null) return;
    const t = strip(o.type);
    types.material_condition[t] = (types.material_condition[t] ?? 0) + 1;
    const known = COND_FIELDS[t];
    if (!known) add(unsupported, `material_condition:${t}`, where);
    for (const k of Object.keys(o)) if (k !== 'type' && known && !known.includes(k)) bump(`material_condition:${t}.${k}`, where);
    if (t === 'not') cond(o.invert, where);
  }
  for (const [id, j] of Object.entries(files['worldgen/density_function'] ?? {})) df(j, `density_function ${id}`);
  for (const [id, j] of Object.entries(files['worldgen/material_rule'] ?? {})) rule(j, `material_rule ${id}`);
  for (const [id, j] of Object.entries(files['worldgen/material_condition'] ?? {})) cond(j, `material_condition ${id}`);
  for (const [id, j] of Object.entries(files['worldgen/noise'] ?? {})) for (const k of Object.keys(j)) if (!NOISE_FIELDS.includes(k)) bump(`noise.${k}`, `noise ${id}`);
  for (const [id, s] of Object.entries(files['worldgen/noise_settings'] ?? {})) {
    const w = `noise_settings ${id}`;
    for (const k of Object.keys(s)) if (!SETTINGS_FIELDS.includes(k)) bump(`noise_settings.${k}`, w);
    for (const k of SETTINGS_FIELDS) if (!(k in s) && ['default_block', 'default_fluid', 'material_rule', 'sea_level'].includes(k)) bump(`noise_settings missing ${k}`, w);
    for (const [k, v] of Object.entries(s.noise_router ?? {})) { if (!ROUTER_FIELDS.includes(k)) bump(`noise_router.${k}`, w); df(v, `${w} router.${k}`); }
    for (const [k, v] of Object.entries(s.aquifers ?? {})) { if (!AQUIFER_FIELDS.includes(k)) bump(`aquifers.${k}`, w); df(v, `${w} aquifers.${k}`); }
    rule(s.material_rule, w);
  }
  function gen(g, where) {
    const t = strip(g.type);
    types.chunk_generator[t] = (types.chunk_generator[t] ?? 0) + 1;
    if (t === 'noise') {
      const b = g.biome_source; const bt = strip(b.type);
      types.biome_source[bt] = (types.biome_source[bt] ?? 0) + 1;
      if (bt === 'multi_noise' && typeof b.preset === 'string') add(unsupported, `biome_source:multi_noise.preset=${b.preset}`, where);
      if (bt === 'multi_noise' && typeof b.biomes === 'string') add(unsupported, `biome_source:multi_noise.biomes(ref)`, where);
      if (typeof g.settings === 'object') { /* inline */ }
    } else if (t === 'flat' || t === 'debug') add(unsupported, `chunk_generator:${t}`, where);
  }
  for (const [id, p] of Object.entries(files['worldgen/world_preset'] ?? {})) for (const [d, dim] of Object.entries(p.dimensions ?? {})) gen(dim.generator, `world_preset ${id} ${d}`);
  return { types, unsupported, ignored };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = {};
  for (const v of ['26.3', '26.4-snapshot-7']) out[v] = walk(loadDataDir(`${V}/${v}`));
  console.log(JSON.stringify(out, null, 1));
}
