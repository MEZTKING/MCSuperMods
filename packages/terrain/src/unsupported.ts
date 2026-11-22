/**
 * The walker (spike B574, WS1, F7): deepslate parses an unknown density function type as 0, an
 * unknown rule as "nothing" and an unknown condition as "false", silently. This walks everything
 * a world reaches (its noise settings, router, aquifers, named functions, noises, surface rules
 * and conditions) and lists every type no parser knows, every field no parser reads and every
 * file that is missing, so the views can name them (never dropped silently). The known types and
 * fields are deepslate 0.27.2's (read from its MIT source) plus the engine's own and the
 * extensions' (`extensions/index.ts`).
 */

import type { Unsupported } from './api';
import { conditionTypes, densityFunctionTypes, ruleTypes } from './extensions';
import { prepassDensityFunction, prepassRule, shortType } from './prepass';
import { FOLDERS, type WorldFiles, withNamespace } from './registries';

const UNARY = ['input', 'argument'];
const BINARY = ['left', 'right', 'argument1', 'argument2'];

/** Density function types deepslate (or the engine) parses, with the fields it reads. */
const DENSITY_FIELDS: Readonly<Record<string, readonly string[]>> = {
  blend_alpha: [],
  blend_offset: [],
  beardifier: [],
  end_outer_islands: [],
  old_blended_noise: ['xz_scale', 'y_scale', 'xz_factor', 'y_factor', 'smear_scale_multiplier'],
  interpolated: ['input', 'argument', 'cell_size_xz', 'cell_size_y'],
  cache: UNARY,
  noise: ['noise', 'xz_scale', 'y_scale', 'shift_x', 'shift_y', 'shift_z'],
  find_top_surface: ['density', 'upper_bound', 'lower_bound', 'cell_height'],
  range_choice: ['input', 'min_inclusive', 'max_exclusive', 'when_in_range', 'when_out_of_range'],
  shift_a: ['noise', 'argument'],
  shift_b: ['noise', 'argument'],
  shift: ['noise', 'argument'],
  blend_density: UNARY,
  clamp: ['input', 'min', 'max'],
  interval_select: ['input', 'thresholds', 'functions'],
  spline: ['spline'],
  constant: ['value', 'argument'],
  gradient: ['axis', 'tiling', 'from_coordinate', 'to_coordinate', 'from_value', 'to_value'],
  lerp: ['alpha', 'first', 'second'],
  pow: ['base', 'exponent'],
  distance_to_point: ['point', 'metric'],
  slice: ['axis', 'coordinate', 'input'],
  ...Object.fromEntries(
    [
      'abs',
      'square',
      'cube',
      'sqrt',
      'half_negative',
      'quarter_negative',
      'squeeze',
      'reciprocal',
      'negate',
      'log',
      'sign',
    ].map((t) => [t, UNARY]),
  ),
  ...Object.fromEntries(['add', 'sub', 'mul', 'div', 'min', 'max'].map((t) => [t, BINARY])),
  ...Object.fromEntries(
    ['floor', 'round', 'ceil', 'truncate'].map((t) => [t, ['input', 'multiple']]),
  ),
};

/** Fields of a density function node that hold child functions. */
const DENSITY_CHILDREN = new Set([
  'input',
  'argument',
  'argument1',
  'argument2',
  'left',
  'right',
  'shift_x',
  'shift_y',
  'shift_z',
  'density',
  'upper_bound',
  'when_in_range',
  'when_out_of_range',
  'alpha',
  'first',
  'second',
  'multiple',
  'base',
  'exponent',
]);

const RULE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  block: ['result_state'],
  sequence: ['sequence'],
  condition: ['if_true', 'then_run'],
};

const CONDITION_FIELDS: Readonly<Record<string, readonly string[]>> = {
  above_preliminary_surface: [],
  biome: ['biome_is'],
  noise_threshold: ['noise', 'min_threshold', 'max_threshold', 'is_3d'],
  not: ['invert'],
  stone_depth: ['offset', 'add_surface_depth', 'secondary_depth_range', 'surface_type'],
  vertical_gradient: ['random_name', 'true_at_and_below', 'false_at_and_above'],
  water: ['offset', 'surface_depth_multiplier', 'add_surface_depth'],
  y_above: ['anchor', 'surface_depth_multiplier', 'add_surface_depth'],
};

const SETTINGS_FIELDS = new Set([
  'noise',
  'default_block',
  'default_fluid',
  'noise_router',
  'material_rule',
  'sea_level',
  'aquifers',
  'legacy_random_source',
]);

/** Noise settings fields that do not shape the land; read by no parser, and not reported. */
const SETTINGS_NOT_LAND = new Set(['debug_functions', 'disable_mob_generation', 'spawn_target']);

const ROUTER_FIELDS = new Set([
  'temperature',
  'vegetation',
  'continents',
  'erosion',
  'depth',
  'ridges',
  'preliminary_surface_level',
  'chunk_surface_level',
  'final_density',
]);

const AQUIFER_FIELDS = new Set([
  'barrier',
  'fluid_level_floodedness',
  'fluid_level_spread',
  'lava',
  'exclusion',
  'surface_level',
]);

const NOISE_FIELDS = new Set([
  'base_amplitude',
  'base_octave',
  'octave_count',
  'normalize',
  'amplitude_modifiers',
]);

/** Plain words for what is drawn in place of each kind of gap. */
export const DRAWN_INSTEAD = Object.freeze({
  densityFunction: 'Nothing: it counts as 0 where it is used.',
  rule: 'Nothing: the blocks it would set keep what was there.',
  condition: 'Never true: the rules it guards are skipped.',
  file: 'Nothing: the file is missing.',
  field: 'It is left out.',
  inlineNoise: 'Nothing: a noise written inside a function counts as 0; name a noise file instead.',
});

function typeSet(list: readonly unknown[]): Set<string> {
  const out = new Set<string>();
  for (const entry of list) {
    const t = (entry as { type?: unknown } | null)?.type;
    if (typeof t === 'string') out.add(shortType(t) ?? t);
  }
  return out;
}

/** The fields of extension rules and conditions that hold density functions (B581). */
function densityFieldsOf(list: readonly unknown[]): Map<string, readonly string[]> {
  const out = new Map<string, readonly string[]>();
  for (const entry of list) {
    const e = entry as { type?: unknown; densityFields?: unknown } | null;
    if (typeof e?.type === 'string' && Array.isArray(e.densityFields)) {
      out.set(
        shortType(e.type) ?? e.type,
        e.densityFields.filter((f): f is string => typeof f === 'string'),
      );
    }
  }
  return out;
}

/** The extension types drawn only about right, with their plain words (B581). */
function approximateOf(list: readonly unknown[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of list) {
    const e = entry as { type?: unknown; approximate?: unknown } | null;
    if (typeof e?.type === 'string' && typeof e.approximate === 'string') {
      out.set(shortType(e.type) ?? e.type, e.approximate);
    }
  }
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Walks what one world reaches and collects what cannot be honoured. */
export class Walker {
  private readonly notes = new Map<string, Unsupported>();
  private readonly seen = new Set<string>();
  private readonly densityExtensions: Set<string>;
  private readonly ruleExtensions: Set<string>;
  private readonly conditionExtensions: Set<string>;
  private readonly approximate: Map<string, string>;
  private readonly densityFields: Map<string, readonly string[]>;

  private readonly files: WorldFiles;

  constructor(
    files: WorldFiles,
    extensions: {
      densityFunctions?: readonly unknown[];
      rules?: readonly unknown[];
      conditions?: readonly unknown[];
    } = {},
  ) {
    this.files = files;
    this.densityExtensions = typeSet(extensions.densityFunctions ?? densityFunctionTypes);
    this.ruleExtensions = typeSet(extensions.rules ?? ruleTypes);
    this.conditionExtensions = typeSet(extensions.conditions ?? conditionTypes);
    this.densityFields = densityFieldsOf([
      ...(extensions.rules ?? ruleTypes),
      ...(extensions.conditions ?? conditionTypes),
    ]);
    this.approximate = approximateOf([
      ...(extensions.densityFunctions ?? densityFunctionTypes),
      ...(extensions.rules ?? ruleTypes),
      ...(extensions.conditions ?? conditionTypes),
    ]);
  }

  /** Notes an extension type that is drawn only about right (B581). */
  private aboutRight(kind: Unsupported['kind'], type: string, where: string): void {
    const words = this.approximate.get(type);
    if (words !== undefined)
      this.add({ kind, type: `minecraft:${type}`, where, drawnInstead: words });
  }

  /** Adds one note (the same note twice is kept once). */
  add(note: Unsupported): void {
    const key = `${note.kind}|${note.type}|${note.where}`;
    if (!this.notes.has(key)) this.notes.set(key, note);
  }

  /** Every note so far, in the order found. */
  list(): Unsupported[] {
    return [...this.notes.values()];
  }

  private missing(folder: string, id: string, where: string): void {
    this.add({ kind: 'file', type: `${folder}/${id}`, where, drawnInstead: DRAWN_INSTEAD.file });
  }

  private field(type: string, where: string): void {
    this.add({ kind: 'field', type, where, drawnInstead: DRAWN_INSTEAD.field });
  }

  /** A noise settings file (named or inline). */
  noiseSettings(json: unknown, where: string): void {
    if (!isObject(json)) return;
    for (const key of Object.keys(json)) {
      if (!SETTINGS_FIELDS.has(key) && !SETTINGS_NOT_LAND.has(key)) {
        this.field(`noise_settings.${key}`, where);
      }
    }
    if (isObject(json.noise_router)) {
      for (const [key, value] of Object.entries(json.noise_router)) {
        if (!ROUTER_FIELDS.has(key)) this.field(`noise_router.${key}`, where);
        else this.densityFunction(value, where);
      }
    }
    if (isObject(json.aquifers)) {
      for (const [key, value] of Object.entries(json.aquifers)) {
        if (!AQUIFER_FIELDS.has(key)) this.field(`aquifers.${key}`, where);
        else this.densityFunction(value, where);
      }
    }
    this.rule(json.material_rule, where);
  }

  /** A density function: a reference, a number or a node. */
  densityFunction(json: unknown, where: string): void {
    if (typeof json === 'string') {
      const id = withNamespace(json);
      if (this.seen.has(`df ${id}`)) return;
      this.seen.add(`df ${id}`);
      const file = this.files.get(FOLDERS.densityFunction, id);
      if (file === undefined) this.missing(FOLDERS.densityFunction, id, where);
      else this.densityNode(prepassDensityFunction(file), id);
      return;
    }
    this.densityNode(prepassDensityFunction(json), where);
  }

  private noiseRef(json: unknown, where: string): void {
    if (typeof json !== 'string') {
      this.add({
        kind: 'field',
        type: 'inline noise',
        where,
        drawnInstead: DRAWN_INSTEAD.inlineNoise,
      });
      return;
    }
    const id = withNamespace(json);
    if (this.seen.has(`noise ${id}`)) return;
    this.seen.add(`noise ${id}`);
    const file = this.files.get(FOLDERS.noise, id);
    if (file === undefined) {
      this.missing(FOLDERS.noise, id, where);
      return;
    }
    if (isObject(file)) {
      for (const key of Object.keys(file)) {
        if (!NOISE_FIELDS.has(key)) this.field(`noise.${key}`, id);
      }
    }
  }

  private densityNode(json: unknown, where: string): void {
    if (typeof json === 'string') {
      this.densityFunction(json, where);
      return;
    }
    if (!isObject(json)) return;
    const type = shortType(json.type) ?? '';
    if (this.densityExtensions.has(type)) {
      this.aboutRight('density_function', type, where);
      // The extension parses its own fields; its child functions are walked where they are nodes.
      for (const value of Object.values(json)) {
        if (isObject(value) && typeof value.type === 'string') this.densityNode(value, where);
      }
      return;
    }
    const known = DENSITY_FIELDS[type];
    if (!known) {
      this.add({
        kind: 'density_function',
        type: `minecraft:${type}`,
        where,
        drawnInstead: DRAWN_INSTEAD.densityFunction,
      });
      return;
    }
    for (const [key, value] of Object.entries(json)) {
      if (key === 'type') continue;
      if (!known.includes(key)) {
        this.field(`density_function.${type}.${key}`, where);
        continue;
      }
      if (
        (type === 'noise' || type.startsWith('shift')) &&
        (key === 'noise' || key === 'argument')
      ) {
        this.noiseRef(value, where);
      } else if (key === 'functions' && Array.isArray(value)) {
        for (const f of value) this.densityNode(f, where);
      } else if (key === 'spline') this.spline(value, where);
      else if (DENSITY_CHILDREN.has(key)) this.densityNode(value, where);
    }
  }

  private spline(json: unknown, where: string): void {
    if (!isObject(json)) return;
    for (const key of Object.keys(json)) {
      if (key !== 'coordinate' && key !== 'points') this.field(`spline.${key}`, where);
    }
    this.densityNode(json.coordinate, where);
    for (const point of Array.isArray(json.points) ? json.points : []) {
      if (!isObject(point)) continue;
      for (const key of Object.keys(point)) {
        if (key !== 'location' && key !== 'value' && key !== 'derivative') {
          this.field(`spline_point.${key}`, where);
        }
      }
      this.spline(point.value, where);
    }
  }

  /** A surface rule: a reference or a node. */
  rule(json: unknown, where: string): void {
    if (typeof json === 'string') {
      const id = withNamespace(json);
      if (this.seen.has(`rule ${id}`)) return;
      this.seen.add(`rule ${id}`);
      const file = this.files.get(FOLDERS.materialRule, id);
      if (file === undefined) this.missing(FOLDERS.materialRule, id, where);
      else this.ruleNode(prepassRule(file), id);
      return;
    }
    this.ruleNode(prepassRule(json), where);
  }

  private ruleNode(json: unknown, where: string): void {
    if (typeof json === 'string') {
      this.rule(json, where);
      return;
    }
    if (!isObject(json)) return;
    const type = shortType(json.type) ?? '';
    if (this.ruleExtensions.has(type)) {
      this.aboutRight('material_rule', type, where);
      this.extensionChildren(json, where);
      return;
    }
    const known = RULE_FIELDS[type];
    if (!known) {
      this.add({
        kind: 'material_rule',
        type: `minecraft:${type}`,
        where,
        drawnInstead: DRAWN_INSTEAD.rule,
      });
      return;
    }
    for (const key of Object.keys(json)) {
      if (key !== 'type' && !known.includes(key)) this.field(`material_rule.${type}.${key}`, where);
    }
    if (type === 'sequence') {
      for (const r of Array.isArray(json.sequence) ? json.sequence : []) this.ruleNode(r, where);
    }
    if (type === 'condition') {
      this.conditionNode(json.if_true, where);
      this.ruleNode(json.then_run, where);
    }
  }

  /**
   * The children of an extension rule or condition: density functions in the fields the type
   * names (`densityFields`), rules and conditions found by their type elsewhere.
   */
  private extensionChildren(json: Record<string, unknown>, where: string): void {
    const densityFields = this.densityFields.get(shortType(json.type) ?? '') ?? [];
    for (const field of densityFields) {
      if (json[field] !== undefined) this.densityFunction(json[field], where);
    }
    for (const [key, value] of Object.entries(json)) {
      if (densityFields.includes(key)) continue;
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (!isObject(item) || typeof item.type !== 'string') continue;
        const t = shortType(item.type) ?? '';
        if (t in CONDITION_FIELDS || this.conditionExtensions.has(t))
          this.conditionNode(item, where);
        else this.ruleNode(item, where);
      }
    }
  }

  private conditionNode(json: unknown, where: string): void {
    if (typeof json === 'string') {
      const id = withNamespace(json);
      if (this.seen.has(`condition ${id}`)) return;
      this.seen.add(`condition ${id}`);
      const file = this.files.get(FOLDERS.materialCondition, id);
      if (file === undefined) this.missing(FOLDERS.materialCondition, id, where);
      else this.conditionNode(prepassRule(file), id);
      return;
    }
    if (!isObject(json)) return;
    const type = shortType(json.type) ?? '';
    if (this.conditionExtensions.has(type)) {
      this.aboutRight('material_condition', type, where);
      this.extensionChildren(json, where);
      return;
    }
    const known = CONDITION_FIELDS[type];
    if (!known) {
      this.add({
        kind: 'material_condition',
        type: `minecraft:${type}`,
        where,
        drawnInstead: DRAWN_INSTEAD.condition,
      });
      return;
    }
    for (const key of Object.keys(json)) {
      if (key !== 'type' && !known.includes(key)) {
        this.field(`material_condition.${type}.${key}`, where);
      }
    }
    if (type === 'not') this.conditionNode(json.invert, where);
    if (type === 'noise_threshold') this.noiseRef(json.noise, where);
  }
}
