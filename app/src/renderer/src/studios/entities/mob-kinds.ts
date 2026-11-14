/**
 * Pure helpers of the Entity Studio's mob sections (B297, ADR 0070 D6, ADR 0073 D5): the
 * "Kind of mob" table and the one-step data change it makes, the labels of the mob enums
 * (bases, movement modes, renderers, ride control, variant choice, boss bar colours and
 * styles), the projectile choices, new component values and the props every mob section
 * shares. No React, no session.
 *
 * The enum values are facts of the MSM format (`@msm/schemas`); the projectile items come
 * from the target (`target.entities.projectileItems`, plugin API 1.11.0) plus the project's
 * items with `msm:throwable`.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import type { FormProblem } from '../../forms';
import { asObject } from '../blocks-items/blocks-items-model';

type JsonObject = { [key: string]: Json };

/** Sets a value at a path of the element (absent removes it); see `pathSetter`. */
export type PathSet = (
  path: readonly (string | number)[],
  value: Json | undefined,
  coalesce?: string,
) => void;

/** What every mob section of the Entity Studio receives. */
export interface MobSectionProps {
  project: Project;
  /** The element's id, for test ids and messages. */
  elementId: string;
  /** The element data. */
  data: Json;
  set: PathSet;
  /** Replaces the whole element data in one undoable edit. */
  replace(next: Json): void;
  /** The element's declared event ids. */
  events: readonly string[];
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  /** The value last switched off in this session under `key`, if any. */
  remembered(key: string): Json | undefined;
  /** Keeps a value that is being switched off, so switching it on restores it. */
  remember(key: string, value: Json | undefined): void;
}

// Bases and kinds ----------------------------------------------------------------------------

/** The values of `base` (ADR 0070 D1). */
export const MOB_BASES = Object.freeze(['mob', 'animal', 'monster'] as const);
export type MobBase = (typeof MOB_BASES)[number];

/** The words the Studio shows for each base. */
export const MOB_BASE_LABELS: Readonly<Record<MobBase, string>> = Object.freeze({
  mob: 'Mob (plain)',
  animal: 'Animal (babies, taming, breeding)',
  monster: 'Monster (enemy)',
});

/** The movement modes (ADR 0070 D3). */
export const MOVEMENT_MODES = Object.freeze(['walk', 'fly', 'swim', 'amphibious'] as const);
export type MovementMode = (typeof MOVEMENT_MODES)[number];

/** The words the Studio shows for each movement mode. */
export const MOVEMENT_MODE_LABELS: Readonly<Record<MovementMode, string>> = Object.freeze({
  walk: 'Walks',
  fly: 'Flies',
  swim: 'Swims (lives in water)',
  amphibious: 'Walks and swims',
});

/** One entry of the "Kind of mob" picker: the five values it writes together. */
export interface MobKind {
  id: string;
  label: string;
  /** One sentence shown under the picker. */
  description: string;
  base: MobBase;
  category: string;
  placement: string;
  rule: string;
  mode: MovementMode;
}

/** The kinds of the picker, in order (ADR 0070 D6). */
export const MOB_KINDS: readonly MobKind[] = Object.freeze([
  {
    id: 'creature',
    label: 'Creature',
    description: 'A peaceful mob that walks about on the ground.',
    base: 'mob',
    category: 'creature',
    placement: 'on_ground',
    rule: 'mob',
    mode: 'walk',
  },
  {
    id: 'farm_animal',
    label: 'Farm animal',
    description:
      'An animal that spawns on grass and can have babies: add Breeding below to choose its food.',
    base: 'animal',
    category: 'creature',
    placement: 'on_ground',
    rule: 'animal',
    mode: 'walk',
  },
  {
    id: 'pet',
    label: 'Pet',
    description: 'An animal you can tame: add Taming below to choose its food.',
    base: 'animal',
    category: 'creature',
    placement: 'on_ground',
    rule: 'animal',
    mode: 'walk',
  },
  {
    id: 'monster',
    label: 'Monster',
    description: 'An enemy that spawns in the dark and is removed in peaceful.',
    base: 'monster',
    category: 'monster',
    placement: 'on_ground',
    rule: 'monster',
    mode: 'walk',
  },
  {
    id: 'flying_creature',
    label: 'Flying creature',
    description: 'A mob that flies about and takes no fall damage.',
    base: 'mob',
    category: 'creature',
    placement: 'on_ground',
    rule: 'mob',
    mode: 'fly',
  },
  {
    id: 'water_creature',
    label: 'Water creature',
    description:
      'A larger mob that lives in water, such as a dolphin. Swimmers need a speed near 1.',
    base: 'mob',
    category: 'water_creature',
    placement: 'in_water',
    rule: 'water_animal',
    mode: 'swim',
  },
  {
    id: 'fish',
    label: 'Fish',
    description:
      'A small mob that lives in water and dries out on land. Swimmers need a speed near 1.',
    base: 'mob',
    category: 'water_ambient',
    placement: 'in_water',
    rule: 'water_animal',
    mode: 'swim',
  },
  {
    id: 'ambient',
    label: 'Ambient',
    description: 'A harmless background mob, such as a bat; it does not count as a creature.',
    base: 'mob',
    category: 'ambient',
    placement: 'on_ground',
    rule: 'mob',
    mode: 'walk',
  },
] satisfies MobKind[]);

/** The kind with `id`, or `undefined`. */
export function mobKind(id: string | undefined): MobKind | undefined {
  return MOB_KINDS.find((kind) => kind.id === id);
}

/** The base of `data` (`mob` when absent or unknown). */
export function baseOf(data: Json | undefined): MobBase {
  const base = asObject(data).base;
  return base === 'animal' || base === 'monster' ? base : 'mob';
}

/** The movement mode of `data` (`walk` when absent or unknown). */
export function modeOf(data: Json | undefined): MovementMode {
  const mode = asObject(asObject(asObject(data).components)['msm:movement']).mode;
  return typeof mode === 'string' && (MOVEMENT_MODES as readonly string[]).includes(mode)
    ? (mode as MovementMode)
    : 'walk';
}

/**
 * The kinds that match `data`: base, category and mode always; placement and rule when the
 * entity spawns naturally (absent ones are vanilla's `on_ground` and `mob`). "Farm animal"
 * and "Pet" write the same values, so both match; a mob with `msm:tameable` lists "Pet" first.
 */
export function matchingKinds(data: Json | undefined): MobKind[] {
  const object = asObject(data);
  const base = baseOf(data);
  const mode = modeOf(data);
  const spawn = object.spawn === undefined ? undefined : asObject(object.spawn);
  const matches = MOB_KINDS.filter(
    (kind) =>
      kind.base === base &&
      kind.category === object.category &&
      kind.mode === mode &&
      (spawn === undefined ||
        ((spawn.placement ?? 'on_ground') === kind.placement &&
          (spawn.rule ?? 'mob') === kind.rule)),
  );
  const tameable = asObject(object.components)['msm:tameable'] !== undefined;
  return tameable
    ? [...matches].sort((a, b) => (b.id === 'pet' ? 1 : 0) - (a.id === 'pet' ? 1 : 0))
    : matches;
}

/**
 * The data after picking `kind`: `base` (absent for `mob`), `category`, the movement `mode`
 * (absent for `walk`; `msm:movement` is removed when nothing else is left in it) and, when the
 * entity spawns naturally, the spawn `placement` and `rule`. Everything else stays. One value,
 * so the Studio applies it as one undoable edit.
 */
export function withMobKind(data: Json | undefined, kind: MobKind): JsonObject {
  const next: JsonObject = { ...asObject(data) };
  if (kind.base === 'mob') delete next.base;
  else next.base = kind.base;
  next.category = kind.category;
  const components: JsonObject = { ...asObject(next.components) };
  const movement: JsonObject = { ...asObject(components['msm:movement']) };
  if (kind.mode === 'walk') delete movement.mode;
  else movement.mode = kind.mode;
  if (Object.keys(movement).length === 0) delete components['msm:movement'];
  else components['msm:movement'] = movement;
  next.components = components;
  if (next.spawn !== undefined) {
    const spawn: JsonObject = { ...asObject(next.spawn) };
    spawn.placement = kind.placement;
    spawn.rule = kind.rule;
    next.spawn = spawn;
  }
  return next;
}

// Renderer -----------------------------------------------------------------------------------

/** The renderer choices (ADR 0072 D4). */
export const RENDERERS = Object.freeze(['auto', 'geckolib', 'vanilla'] as const);
export type RendererChoice = (typeof RENDERERS)[number];

/** The words the Studio shows for each renderer. */
export const RENDERER_LABELS: Readonly<Record<RendererChoice, string>> = Object.freeze({
  auto: 'Automatic (GeckoLib when present)',
  geckolib: 'GeckoLib only',
  vanilla: 'Built-in renderer',
});

/**
 * The note under the renderer picker for the target: which renderer draws the mob there and
 * what that means. `hasGeckolib` is whether the target has GeckoLib facts.
 */
export function rendererNote(
  renderer: Json | undefined,
  hasGeckolib: boolean,
  mcVersion: string,
): string {
  const choice = renderer === 'geckolib' || renderer === 'vanilla' ? renderer : 'auto';
  if (choice === 'vanilla') {
    return `Drawn by the built-in renderer on every target: no Molang, no easings, no sound or particle keyframes.`;
  }
  if (hasGeckolib) {
    return choice === 'geckolib'
      ? `Drawn by GeckoLib on ${mcVersion}; the jar nests GeckoLib. This mob cannot be exported for a target without GeckoLib.`
      : `Drawn by GeckoLib on ${mcVersion}; the jar nests GeckoLib. On a target without GeckoLib the built-in renderer draws it.`;
  }
  return choice === 'geckolib'
    ? `${mcVersion} has no GeckoLib, so this mob cannot be exported for it. Choose Automatic or Built-in renderer.`
    : `${mcVersion} has no GeckoLib: drawn by the built-in renderer: no Molang, no easings, no sound or particle keyframes.`;
}

// Riding, variants, boss bars ----------------------------------------------------------------

/** Who may steer (`controlled_by`). */
export const RIDE_CONTROLS = Object.freeze(['anyone', 'owner'] as const);
export const RIDE_CONTROL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  anyone: 'Anyone',
  owner: 'Its owner only (needs Taming)',
});

/** How a variant is picked (`choose`). */
export const VARIANT_CHOICES = Object.freeze(['random', 'biome'] as const);
export const VARIANT_CHOICE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  random: 'At random (by weight)',
  biome: 'By biome',
});

/** Boss bar colours. */
export const BOSS_BAR_COLOURS = Object.freeze([
  'pink',
  'blue',
  'red',
  'green',
  'yellow',
  'purple',
  'white',
] as const);
export const BOSS_BAR_COLOUR_LABELS: Readonly<Record<string, string>> = Object.freeze({
  pink: 'Pink',
  blue: 'Blue',
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  purple: 'Purple',
  white: 'White',
});

/** Boss bar styles. */
export const BOSS_BAR_OVERLAYS = Object.freeze([
  'progress',
  'notched_6',
  'notched_10',
  'notched_12',
  'notched_20',
] as const);
export const BOSS_BAR_OVERLAY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  progress: 'Smooth',
  notched_6: '6 notches',
  notched_10: '10 notches',
  notched_12: '12 notches',
  notched_20: '20 notches',
});

/** The most variants a mob may have. */
export const MAX_VARIANTS = 32;

/** The fields the "Ranged attack" toggle writes when switched on: a skeleton's arrow. */
export function newRangedAttack(): JsonObject {
  return { projectile: 'minecraft:arrow' };
}

/** The fields the "Can be tamed" toggle writes when switched on. */
export function newTameable(): JsonObject {
  return { items: ['minecraft:bone'] };
}

/** The fields the "Can have babies" toggle writes when switched on. */
export function newBreedable(): JsonObject {
  return { items: ['minecraft:wheat'] };
}

/** The fields the "Can be ridden" toggle writes when switched on. */
export function newRideable(saddleBone: string | undefined): JsonObject {
  return saddleBone === undefined ? {} : { saddle_bone: saddleBone };
}

/** The fields the "Shows a boss bar" toggle writes when switched on. */
export function newBossBar(): JsonObject {
  return {};
}

/** A fresh variant id not used in `variants`: `variant_<n>`. */
export function nextVariantId(variants: readonly Json[]): string {
  const used = new Set(variants.map((variant) => asObject(variant).id));
  for (let n = variants.length + 1; ; n++) {
    const id = `variant_${n}`;
    if (!used.has(id)) return id;
  }
}

/** A new variant: a fresh id and `texture` (the mob's own texture, or empty). */
export function newVariant(variants: readonly Json[], texture: string): JsonObject {
  return { id: nextVariantId(variants), texture };
}

/** The variant list of `data` (`components.msm:variants.variants`), or `[]`. */
export function variantsOf(data: Json | undefined): Json[] {
  const list = asObject(asObject(asObject(data).components)['msm:variants']).variants;
  return Array.isArray(list) ? list : [];
}

// Projectiles --------------------------------------------------------------------------------

/** The project's `msm:item` ids with an `msm:throwable` component, sorted. */
export function projectThrowables(project: Project): string[] {
  const out: string[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind !== 'msm:item') continue;
      if (asObject(asObject(element.data).components)['msm:throwable'] !== undefined) {
        out.push(element.id);
      }
    }
  }
  return out.sort();
}

/**
 * The projectile picker's choices: the target's projectile items (in the target's order),
 * then the project's throwables.
 */
export function projectileChoices(
  project: Project,
  projectileItems: readonly string[] | undefined,
): string[] {
  const vanilla = projectileItems ?? ['minecraft:arrow'];
  return [...vanilla, ...projectThrowables(project).filter((id) => !vanilla.includes(id))];
}
