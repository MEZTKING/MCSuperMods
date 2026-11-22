/**
 * The rule front (ADR 0119 D3 seam 3, spike B574 WS10): our own parser for the whole surface rule
 * tree, because deepslate's `MaterialRule.fromJson` recurses into itself and has no hook. Known
 * rule and condition types build deepslate's classes; the extension types (`extensions/index.ts`,
 * B581) build their own; anything else is "nothing" or "false" (the walker reports it). Named
 * rules and conditions are resolved here, from the world's own files, so a compiled rule never
 * reads deepslate's static registries (F9).
 *
 * `BiomeIs` adapts deepslate's `MaterialCondition.Biome` (deepslate 0.27.2, MIT, Copyright (c)
 * Misode) and adds biome tags.
 */

import {
  DensityFunction,
  MaterialCondition,
  MaterialRule,
  type MaterialRuleContext,
  NormalNoise,
} from 'deepslate/worldgen';
import { conditionTypes, ruleTypes } from './extensions';
import { prepassRule, shortType } from './prepass';
import { BUILTIN_NOISES } from './registries';

/** Parses rules and conditions for the extension types. */
export interface RuleParser {
  rule(json: unknown): MaterialRule;
  condition(json: unknown): MaterialCondition;
  /** A biome's file, for extension conditions that read a biome's fields (B581). */
  biome?(id: string): unknown;
  /**
   * A density function inside a rule, parsed by the world's density front and not yet bound to
   * the world's noises (an extension binds it when it compiles, B581).
   */
  density?(json: unknown): DensityFunction;
  /** Whether the world draws its noises the legacy way (`legacy_random_source`, B581). */
  readonly legacyRandom?: boolean;
}

/** One surface rule type the engine adds (B581 fills `ruleTypes` with entries of this shape). */
export interface RuleType {
  readonly type: string;
  /**
   * Plain words for the notes when the type is drawn only about right (B581): the walker then
   * still lists it in `unsupported()`, with these words as what is drawn instead.
   */
  readonly approximate?: string;
  /** Fields that hold density functions, which the walker walks as such (B581). */
  readonly densityFields?: readonly string[];
  parse(json: Readonly<Record<string, unknown>>, front: RuleParser): MaterialRule;
}

/**
 * One surface condition type the engine adds (B581 fills `conditionTypes`). A condition that reads
 * the depth below to the next ceiling sets `readsDepthBelow`, so the ground scans that far.
 */
export interface ConditionType {
  readonly type: string;
  /** As `RuleType.approximate` (B581). */
  readonly approximate?: string;
  /** As `RuleType.densityFields` (B581). */
  readonly densityFields?: readonly string[];
  readonly readsDepthBelow?: boolean;
  parse(json: Readonly<Record<string, unknown>>, front: RuleParser): MaterialCondition;
}

/** What the rule front needs from the world's files. */
export interface RuleFiles {
  rule(id: string): unknown;
  condition(id: string): unknown;
  /** The biome ids of a biome tag (without `#`), tags inside it resolved. */
  biomeTag(id: string): readonly string[];
  /** A noise file, for the surface depth bound. */
  noise?(id: string): unknown;
  /** A biome file (B581). */
  biome?(id: string): unknown;
  /** The world's density function front (B581). */
  density?(json: unknown): DensityFunction;
  /** The world's `legacy_random_source` (B581). */
  readonly legacyRandom?: boolean;
}

function typed<T extends { readonly type: string }>(list: readonly unknown[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as { type?: unknown; parse?: unknown };
    if (typeof e.type === 'string' && typeof e.parse === 'function') {
      out.set(shortType(e.type) ?? e.type, entry as T);
    }
  }
  return out;
}

const LEAF_CONDITIONS = new Set([
  'above_preliminary_surface',
  'noise_threshold',
  'stone_depth',
  'vertical_gradient',
  'water',
  'y_above',
]);

/**
 * The largest surface depth and secondary noise value, from the ranges of the world's `surface`
 * and `surface_secondary` noises (deepslate's built-in ones when the files have none), for the
 * bound on how deep a ceiling `stone_depth` can still be true.
 */
function surfaceDepthBounds(files: RuleFiles): { surface: number; secondary: number } {
  const own = (id: string, fallback: NormalNoise) => {
    const json = files.noise?.(id);
    return json === undefined ? fallback : NormalNoise.fromJson(json);
  };
  const surface = own('minecraft:surface', BUILTIN_NOISES.get('minecraft:surface') as NormalNoise);
  const secondary = own(
    'minecraft:surface_secondary',
    BUILTIN_NOISES.get('minecraft:surface_secondary') as NormalNoise,
  );
  // getSurfaceDepth = noise * 2.75 + 3 + random * 0.25.
  return { surface: surface.range.max * 2.75 + 3 + 0.25, secondary: secondary.range.max };
}

/** A biome condition over a set of ids (a list, one id or a `#tag`). */
export class BiomeIs extends MaterialCondition {
  readonly biomes: ReadonlySet<string>;

  constructor(biomes: ReadonlySet<string>) {
    super();
    this.biomes = biomes;
  }

  compile(context: MaterialRuleContext): () => boolean {
    let lastUpdateY = context.lastUpdateY - 1;
    let result = false;
    return () => {
      if (context.lastUpdateY !== lastUpdateY) {
        lastUpdateY = context.lastUpdateY;
        result = this.biomes.has(context.getBiome().toString());
      }
      return result;
    };
  }
}

function withNamespace(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/** The rule front of one world. */
export class RuleFront implements RuleParser {
  private readonly rules = new Map<string, MaterialRule>();
  private readonly conditions = new Map<string, MaterialCondition>();
  private readonly resolving = new Set<string>();
  private readonly ruleExtensions: Map<string, RuleType>;
  private readonly conditionExtensions: Map<string, ConditionType>;
  /** The deepest `stone_depth` ceiling a condition can still be true at. */
  ceilingDepth = 0;
  /** Whether a condition may read the depth below without a known bound. */
  ceilingUnbounded = false;
  private depthBounds: { surface: number; secondary: number } | undefined;

  private readonly files: RuleFiles;

  constructor(
    files: RuleFiles,
    extensions: { rules?: readonly unknown[]; conditions?: readonly unknown[] } = {},
  ) {
    this.files = files;
    this.ruleExtensions = typed<RuleType>(extensions.rules ?? ruleTypes);
    this.conditionExtensions = typed<ConditionType>(extensions.conditions ?? conditionTypes);
  }

  get legacyRandom(): boolean {
    return this.files.legacyRandom === true;
  }

  biome(id: string): unknown {
    return this.files.biome?.(withNamespace(id));
  }

  density(json: unknown): DensityFunction {
    return this.files.density ? this.files.density(json) : DensityFunction.Constant.ZERO;
  }

  rule(json: unknown): MaterialRule {
    if (typeof json === 'string') {
      const id = withNamespace(json);
      const known = this.rules.get(id);
      if (known) return known;
      const file = this.files.rule(id);
      if (file === undefined || this.resolving.has(`rule ${id}`)) return MaterialRule.NOOP;
      this.resolving.add(`rule ${id}`);
      const parsed = this.rule(prepassRule(file));
      this.resolving.delete(`rule ${id}`);
      this.rules.set(id, parsed);
      return parsed;
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) return MaterialRule.NOOP;
    const node = json as Record<string, unknown>;
    const type = shortType(node.type) ?? '';
    const extension = this.ruleExtensions.get(type);
    if (extension) return extension.parse(node, this);
    switch (type) {
      case 'block':
        return MaterialRule.fromJson(node);
      case 'sequence':
        return new MaterialRule.Sequence(
          (Array.isArray(node.sequence) ? node.sequence : []).map((r) => this.rule(r)),
        );
      case 'condition':
        return new MaterialRule.Condition(this.condition(node.if_true), this.rule(node.then_run));
      default:
        return MaterialRule.NOOP;
    }
  }

  condition(json: unknown): MaterialCondition {
    if (typeof json === 'string') {
      const id = withNamespace(json);
      const known = this.conditions.get(id);
      if (known) return known;
      const file = this.files.condition(id);
      if (file === undefined || this.resolving.has(`condition ${id}`)) {
        return MaterialCondition.ALWAYS_FALSE;
      }
      this.resolving.add(`condition ${id}`);
      const parsed = this.condition(prepassRule(file));
      this.resolving.delete(`condition ${id}`);
      this.conditions.set(id, parsed);
      return parsed;
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      return MaterialCondition.ALWAYS_FALSE;
    }
    const node = json as Record<string, unknown>;
    const type = shortType(node.type) ?? '';
    const extension = this.conditionExtensions.get(type);
    if (extension) {
      if (extension.readsDepthBelow) this.ceilingUnbounded = true;
      return extension.parse(node, this);
    }
    if (type === 'not') return new MaterialCondition.Not(this.condition(node.invert));
    if (type === 'biome') return new BiomeIs(this.biomeSet(node.biome_is));
    if (LEAF_CONDITIONS.has(type)) {
      if (type === 'stone_depth' && shortType(node.surface_type) === 'ceiling') {
        const offset = typeof node.offset === 'number' ? Math.floor(node.offset) : 0;
        const secondary =
          typeof node.secondary_depth_range === 'number'
            ? Math.floor(node.secondary_depth_range)
            : 0;
        this.depthBounds ??= surfaceDepthBounds(this.files);
        const bounds = this.depthBounds;
        const surface = node.add_surface_depth === true ? bounds.surface : 0;
        // map(secondary noise, -1, 1, 0, range), at the noise's largest value.
        const deepest = secondary === 0 ? 0 : ((bounds.secondary + 1) / 2) * secondary;
        this.ceilingDepth = Math.max(
          this.ceilingDepth,
          Math.ceil(1 + offset + surface + Math.max(0, deepest)) + 2,
        );
      }
      return MaterialCondition.fromJson(node);
    }
    return MaterialCondition.ALWAYS_FALSE;
  }

  private biomeSet(value: unknown): Set<string> {
    const out = new Set<string>();
    const add = (entry: unknown) => {
      if (typeof entry !== 'string') return;
      if (entry.startsWith('#')) {
        for (const id of this.files.biomeTag(withNamespace(entry.slice(1)))) out.add(id);
      } else out.add(withNamespace(entry));
    };
    if (Array.isArray(value)) value.forEach(add);
    else add(value);
    return out;
  }
}
