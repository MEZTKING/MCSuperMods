/**
 * The JSON pre-pass (ADR 0119 D3 seam 1; spike B574 fixes F1 to F5): field renames and lossless
 * rewrites applied to a file before deepslate 0.27.2 or our fronts parse it. Every function
 * returns a new tree and never changes its input.
 *
 * - F1: the router field `chunk_surface_level` is read by deepslate as `preliminary_surface_level`.
 * - F2: `y_above` and `water` conditions carry `add_stone_depth`; deepslate reads
 *   `add_surface_depth`.
 * - F3: noise settings without `default_block` (the newer target's) get a placeholder the rules
 *   replace.
 * - F4: `upscale` with every axis `interpolate_linear` and equal x and z cells is deepslate's
 *   `interpolated` (exact, WS8). Other modes stay `upscale` for the extensions (B581).
 * - F5: `interval_select` keeps one function too few in 0.27.2 (fixed in 0.27.3); it becomes
 *   nested `range_choice` nodes with the same first-match choice.
 */

/** How often each fix fired; tests and the notes read it. */
export interface PrepassLog {
  renamedRouter: number;
  renamedStoneDepth: number;
  defaultBlockAdded: number;
  upscaleMapped: number;
  intervalSelect: number;
}

export function emptyPrepassLog(): PrepassLog {
  return {
    renamedRouter: 0,
    renamedStoneDepth: 0,
    defaultBlockAdded: 0,
    upscaleMapped: 0,
    intervalSelect: 0,
  };
}

/** The placeholder for a missing `default_block` (F3); the surface rules replace it. */
export const DEFAULT_BLOCK_PLACEHOLDER = Object.freeze({ Name: 'minecraft:stone' });

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A type id without the `minecraft:` namespace. */
export function shortType(value: unknown): string | undefined {
  return typeof value === 'string' ? value.replace(/^minecraft:/, '') : undefined;
}

function mapTree(value: unknown, node: (o: Json) => Json): unknown {
  if (Array.isArray(value)) return value.map((v) => mapTree(v, node));
  if (!isObject(value)) return value;
  const out: Json = {};
  for (const [k, v] of Object.entries(value)) out[k] = mapTree(v, node);
  return node(out);
}

function isLinearAxis(axis: unknown): axis is { cell_size: number } {
  if (!isObject(axis) || typeof axis.cell_size !== 'number') return false;
  const mode = axis.mode ?? 'interpolate_linear';
  return shortType(mode) === 'interpolate_linear';
}

/** F4 and F5 over a density function tree (named file, router field or inline). */
export function prepassDensityFunction(
  json: unknown,
  log: PrepassLog = emptyPrepassLog(),
): unknown {
  return mapTree(json, (o) => {
    const t = shortType(o.type);
    if (t === 'upscale') {
      const { x, y, z } = o;
      if (isLinearAxis(x) && isLinearAxis(y) && isLinearAxis(z) && x.cell_size === z.cell_size) {
        log.upscaleMapped += 1;
        return {
          type: 'minecraft:interpolated',
          input: o.input,
          cell_size_xz: x.cell_size,
          cell_size_y: y.cell_size,
        };
      }
      return o;
    }
    if (t === 'interval_select') {
      const thresholds = Array.isArray(o.thresholds) ? o.thresholds : [];
      const functions = Array.isArray(o.functions) ? o.functions : [];
      if (functions.length !== thresholds.length + 1) return o;
      log.intervalSelect += 1;
      if (thresholds.length === 0) return functions[0] as Json;
      // The first band whose threshold the input is below wins; past every threshold, the last.
      let node: unknown = functions[thresholds.length];
      for (let i = thresholds.length - 1; i >= 0; i -= 1) {
        node = {
          type: 'minecraft:range_choice',
          input: o.input,
          min_inclusive: Number.NEGATIVE_INFINITY,
          max_exclusive: thresholds[i],
          when_in_range: functions[i],
          when_out_of_range: node,
        };
      }
      return node as Json;
    }
    return o;
  });
}

/** F2 over a surface rule or condition tree. */
export function prepassRule(json: unknown, log: PrepassLog = emptyPrepassLog()): unknown {
  return mapTree(json, (o) => {
    const t = shortType(o.type);
    if ((t === 'y_above' || t === 'water') && 'add_stone_depth' in o) {
      const { add_stone_depth: stoneDepth, ...rest } = o;
      log.renamedStoneDepth += 1;
      return 'add_surface_depth' in rest ? rest : { ...rest, add_surface_depth: stoneDepth };
    }
    return o;
  });
}

/** F1 to F5 over a noise settings file. */
export function prepassNoiseSettings(json: unknown, log: PrepassLog = emptyPrepassLog()): Json {
  const settings: Json = isObject(json) ? { ...json } : {};
  if (isObject(settings.noise_router)) {
    const router: Json = {};
    for (const [k, v] of Object.entries(settings.noise_router)) {
      router[k] = prepassDensityFunction(v, log);
    }
    if ('chunk_surface_level' in router && !('preliminary_surface_level' in router)) {
      router.preliminary_surface_level = router.chunk_surface_level;
      delete router.chunk_surface_level;
      log.renamedRouter += 1;
    }
    settings.noise_router = router;
  }
  if (isObject(settings.aquifers)) {
    const aquifers: Json = {};
    for (const [k, v] of Object.entries(settings.aquifers)) {
      aquifers[k] = prepassDensityFunction(v, log);
    }
    settings.aquifers = aquifers;
  }
  if ('material_rule' in settings)
    settings.material_rule = prepassRule(settings.material_rule, log);
  if (!('default_block' in settings)) {
    settings.default_block = { ...DEFAULT_BLOCK_PLACEHOLDER };
    log.defaultBlockAdded += 1;
  }
  return settings;
}
