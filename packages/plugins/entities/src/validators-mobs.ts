/**
 * Cross-element checks of the mob format of ADRs 0070 to 0072 (bases, movement modes, ranged
 * attacks, taming, breeding, riding, variants and the renderer). Every validator is pure and
 * reads only the project's elements, the target's facts and the registry ids. Codes:
 *
 * - `entities.component-needs-base` (error): `msm:tameable` or `msm:breedable` on an entity
 *   whose `base` is not `animal`; the runtime drops the component with a load error.
 * - `entities.ranged-goal-without-component` (warning): a `ranged_attack` goal without
 *   `msm:ranged_attack`; the runtime adds nothing for it. Reported once per entity.
 * - `entities.ranged-without-goal` (info): `msm:ranged_attack` without a `ranged_attack` goal,
 *   so the mob never shoots.
 * - `entities.unknown-projectile` (error): `msm:ranged_attack.projectile` is neither a vanilla
 *   projectile item of the target (`target.entities.projectileItems`) nor a project `msm:item`
 *   with `msm:throwable`; the runtime drops the component. Skipped on a target without entity
 *   facts.
 * - `entities.controlled-by-owner-needs-tameable` (warning): `msm:rideable.controlled_by` is
 *   `owner` but the entity has no `msm:tameable`, so it never has an owner to steer it.
 * - `entities.variant-texture-missing` (warning): a variant's `texture` is empty or has no
 *   project PNG (skipped when the registry index has no textures, as `entities.missing-texture`).
 * - `entities.duplicate-variant-id` (error): two variants share an `id`, the name saved in the
 *   mob's data.
 * - `entities.variants-without-biomes` (info): `choose` is `biome` but no variant lists
 *   `biomes`, so the pick is plain random.
 * - `entities.saddle-bone-unknown` (warning): `msm:rideable.saddle_bone` is not a bone of the
 *   entity's geo model (skipped when the model is not in the project).
 * - `entities.vanilla-renderer-subset` (warning): the entity draws with the vanilla renderer
 *   (`renderer` `vanilla`, or `auto` on a target without GeckoLib) and its animation set uses
 *   what that renderer does not play (ADR 0072 D3): Molang expressions, easings or lerp modes
 *   other than `linear` and `catmullrom`, sound, particle or instruction keyframes.
 * - `entities.geckolib-renderer-target` (error): `renderer` is `geckolib` on a target without
 *   GeckoLib; the entity cannot be exported for it.
 * - `entities.mode-category` (info): `msm:movement.mode` `swim` outside the water categories,
 *   or a water category with a walking mob.
 * - `entities.monster-base-creature` (info): `base` `monster` in a category other than
 *   `monster`; allowed (ADR 0070 D1), but the mob then shares that category's spawn cap.
 *
 * `sit`, `fly`, `swim` and `shoot` are checked by `entities.unknown-animation-name` in
 * `validators.ts`.
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  TargetFacts,
  ValidationRegistry,
} from '@msm/plugin-api';
import { ANIMATION_KIND, ENTITY_KIND, GEO_MODEL_KIND } from './kinds';
import { isRecord } from './lowering/paths';

/** Every code the mob validators report. */
export const ENTITIES_MOB_PROBLEM_CODES = Object.freeze([
  'entities.component-needs-base',
  'entities.ranged-goal-without-component',
  'entities.ranged-without-goal',
  'entities.unknown-projectile',
  'entities.controlled-by-owner-needs-tameable',
  'entities.variant-texture-missing',
  'entities.duplicate-variant-id',
  'entities.variants-without-biomes',
  'entities.saddle-bone-unknown',
  'entities.vanilla-renderer-subset',
  'entities.geckolib-renderer-target',
  'entities.mode-category',
  'entities.monster-base-creature',
] as const);

/** The kind of `@msm/plugin-blocks-items` items, read by kind string only. */
const ITEM_KIND = 'msm:item';
const ANIMATED_MODEL = 'msm:animated_model';
const RANGED_ATTACK = 'msm:ranged_attack';
const RIDEABLE = 'msm:rideable';
const VARIANTS = 'msm:variants';

/** The mob categories of water creatures (vanilla `MobCategory`). */
const WATER_CATEGORIES: ReadonlySet<string> = new Set([
  'water_creature',
  'water_ambient',
  'underground_water_creature',
  'axolotls',
]);

/** Lerp modes the vanilla renderer plays (ADR 0072 D2). */
const VANILLA_LERP_MODES: ReadonlySet<string> = new Set(['linear', 'catmullrom']);

/** RFC 6901 escaping of one reference token. */
const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');

const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;

const entities = (elements: readonly Element[]): Element[] =>
  elements.filter((element) => element.kind === ENTITY_KIND);

const componentsOf = (element: Element): JsonObject | undefined =>
  record(dataOf(element).components);

const component = (element: Element, name: string): JsonObject | undefined =>
  record(componentsOf(element)?.[name]);

/** The goals of `msm:ai_goals`, with their index. */
function goalsOf(element: Element): { goal: JsonObject; index: number }[] {
  const goals = component(element, 'msm:ai_goals')?.goals;
  if (!Array.isArray(goals)) return [];
  const found: { goal: JsonObject; index: number }[] = [];
  goals.forEach((goal, index) => {
    const fields = record(goal);
    if (fields !== undefined) found.push({ goal: fields, index });
  });
  return found;
}

/** The entity's `base`; absent means `mob` (ADR 0070 D1). */
const baseOf = (element: Element): string => {
  const base = dataOf(element).base;
  return typeof base === 'string' ? base : 'mob';
};

/** The entity's renderer; absent means `auto` (ADR 0072 D4). */
const rendererOf = (element: Element): string => {
  const renderer = component(element, ANIMATED_MODEL)?.renderer;
  return typeof renderer === 'string' ? renderer : 'auto';
};

/** True when the target has GeckoLib (`TargetFacts.geckolib`). */
const hasGeckolib = (target: TargetFacts): boolean => target.geckolib !== undefined;

function componentsNeedingBase(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const base = baseOf(element);
    if (base === 'animal') continue;
    for (const name of ['msm:tameable', 'msm:breedable'] as const) {
      if (component(element, name) === undefined) continue;
      problems.push({
        severity: 'error',
        code: 'entities.component-needs-base',
        elementId: element.id,
        path: pointer('components', name),
        message: `"${name}" needs "base" set to "animal" (this mob's base is "${base}"); the game leaves the component out with a load error. Set "base" to "animal", or remove the component.`,
      });
    }
  }
  return problems;
}

function rangedGoalsAndComponents(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const ranged = component(element, RANGED_ATTACK);
    const goal = goalsOf(element).find(({ goal }) => goal.type === 'ranged_attack');
    if (goal !== undefined && ranged === undefined) {
      problems.push({
        severity: 'warning',
        code: 'entities.ranged-goal-without-component',
        elementId: element.id,
        path: pointer('components', 'msm:ai_goals', 'goals', goal.index),
        message:
          'This mob has a ranged attack goal but no "msm:ranged_attack" component, so the game leaves the goal out and the mob never shoots. Add "msm:ranged_attack" with a projectile, or remove the goal.',
      });
    }
    if (ranged !== undefined && goal === undefined) {
      problems.push({
        severity: 'info',
        code: 'entities.ranged-without-goal',
        elementId: element.id,
        path: pointer('components', RANGED_ATTACK),
        message:
          'This mob has "msm:ranged_attack" but no "ranged_attack" goal, so it never shoots. Add a "ranged_attack" goal with targets.',
      });
    }
  }
  return problems;
}

function unknownProjectiles(elements: readonly Element[], target: TargetFacts): Problem[] {
  const vanilla = target.entities?.projectileItems;
  if (vanilla === undefined) return [];
  const known = new Set(vanilla);
  const items = new Map<string, Element>(
    elements
      .filter((element) => element.kind === ITEM_KIND)
      .map((element) => [element.id, element] as const),
  );
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const projectile = component(element, RANGED_ATTACK)?.projectile;
    if (typeof projectile !== 'string' || known.has(projectile)) continue;
    const item = items.get(projectile);
    if (item !== undefined && component(item, 'msm:throwable') !== undefined) continue;
    problems.push({
      severity: 'error',
      code: 'entities.unknown-projectile',
      elementId: element.id,
      path: pointer('components', RANGED_ATTACK, 'projectile'),
      message:
        item === undefined
          ? `"${projectile}" cannot be shot: it is not a vanilla projectile item of ${target.mcVersion} (such as minecraft:arrow or minecraft:snowball) nor a project item. The game leaves "msm:ranged_attack" out; pick a projectile item, or a project item with "msm:throwable".`
          : `Project item "${projectile}" has no "msm:throwable" component, so the mob cannot throw it and the game leaves "msm:ranged_attack" out. Add "msm:throwable" to the item, or pick a vanilla projectile item.`,
    });
  }
  return problems;
}

function controlledByOwner(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const rideable = component(element, RIDEABLE);
    if (rideable?.controlled_by !== 'owner') continue;
    if (component(element, 'msm:tameable') !== undefined) continue;
    problems.push({
      severity: 'warning',
      code: 'entities.controlled-by-owner-needs-tameable',
      elementId: element.id,
      path: pointer('components', RIDEABLE, 'controlled_by'),
      message:
        'Only the owner may steer this mob, but it has no "msm:tameable" component, so it never has an owner and nobody can steer it. Add "msm:tameable" (with "base" "animal"), or set "controlled_by" to "anyone".',
    });
  }
  return problems;
}

/** The variants of `msm:variants`, with their index. */
function variantsOf(element: Element): { variant: JsonObject; index: number }[] {
  const list = component(element, VARIANTS)?.variants;
  if (!Array.isArray(list)) return [];
  const found: { variant: JsonObject; index: number }[] = [];
  list.forEach((variant, index) => {
    const fields = record(variant);
    if (fields !== undefined) found.push({ variant: fields, index });
  });
  return found;
}

function variantChecks(elements: readonly Element[], registry: ValidationRegistry): Problem[] {
  const knowsTextures = registry.ids('texture').length > 0;
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const variants = variantsOf(element);
    const seen = new Set<string>();
    for (const { variant, index } of variants) {
      const id = variant.id;
      if (typeof id === 'string') {
        if (seen.has(id)) {
          problems.push({
            severity: 'error',
            code: 'entities.duplicate-variant-id',
            elementId: element.id,
            path: pointer('components', VARIANTS, 'variants', index, 'id'),
            message: `Variant id "${id}" is used more than once. The id is saved in the mob's data, so each variant needs its own; rename one of them.`,
          });
        }
        seen.add(id);
      }
      const texture = variant.texture;
      const empty = typeof texture !== 'string' || texture.length === 0;
      if (!empty && (!knowsTextures || registry.has('texture', texture))) continue;
      if (typeof texture !== 'string' && texture !== undefined) continue;
      problems.push({
        severity: 'warning',
        code: 'entities.variant-texture-missing',
        elementId: element.id,
        path: pointer('components', VARIANTS, 'variants', index, 'texture'),
        message: empty
          ? `Variant "${String(id ?? index)}" has no texture, so it renders with the missing-texture pattern. Pick a texture.`
          : `Variant texture "${texture}" has no PNG in the project (expected under "textures/"), so mobs of this variant render with the missing-texture pattern.`,
      });
    }
    const choose = component(element, VARIANTS)?.choose;
    if (
      choose === 'biome' &&
      variants.length > 0 &&
      variants.every(({ variant }) => !Array.isArray(variant.biomes) || variant.biomes.length === 0)
    ) {
      problems.push({
        severity: 'info',
        code: 'entities.variants-without-biomes',
        elementId: element.id,
        path: pointer('components', VARIANTS, 'choose'),
        message:
          'Variants are chosen by biome, but no variant lists "biomes", so every spawn picks at random. Add biomes to the variants that belong somewhere, or set "choose" to "random".',
      });
    }
  }
  return problems;
}

/** The bone names of an `msm:geo_model` element, over all its geometries. */
function boneNames(model: Element): Set<string> {
  const names = new Set<string>();
  const geometries = dataOf(model)['minecraft:geometry'];
  if (!Array.isArray(geometries)) return names;
  for (const geometry of geometries) {
    const bones = record(geometry)?.bones;
    if (!Array.isArray(bones)) continue;
    for (const bone of bones) {
      const name = record(bone)?.name;
      if (typeof name === 'string') names.add(name);
    }
  }
  return names;
}

function saddleBones(elements: readonly Element[]): Problem[] {
  const models = new Map<string, Element>(
    elements
      .filter((element) => element.kind === GEO_MODEL_KIND)
      .map((element) => [element.id, element] as const),
  );
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const bone = component(element, RIDEABLE)?.saddle_bone;
    if (typeof bone !== 'string') continue;
    const modelId = component(element, ANIMATED_MODEL)?.model;
    const model = typeof modelId === 'string' ? models.get(modelId) : undefined;
    if (model === undefined) continue;
    const names = boneNames(model);
    if (names.has(bone)) continue;
    problems.push({
      severity: 'warning',
      code: 'entities.saddle-bone-unknown',
      elementId: element.id,
      path: pointer('components', RIDEABLE, 'saddle_bone'),
      message: `Bone "${bone}" is not in geo model "${model.id}", so no saddle is shown. Pick one of: ${[...names].sort().join(', ') || '(none)'}.`,
    });
  }
  return problems;
}

/** What an animation set uses that the vanilla renderer does not play (ADR 0072 D3). */
interface Unsupported {
  molang: string[];
  easing: string[];
  sound: string[];
  particle: string[];
  instruction: string[];
}

const isNonEmptyRecord = (value: Json | undefined): boolean =>
  isRecord(value) && Object.keys(value).length > 0;

/** True when a vector value holds a Molang string anywhere. */
function vectorHasMolang(value: Json | undefined): boolean {
  if (typeof value === 'string') return true;
  return Array.isArray(value) && value.some((entry) => typeof entry === 'string');
}

/** Scans one bone channel (constant, keyframes or `pre`/`post` keyframes). */
function scanChannel(channel: Json | undefined): { molang: boolean; easing: boolean } {
  const found = { molang: false, easing: false };
  if (channel === undefined) return found;
  if (!isRecord(channel)) {
    found.molang = vectorHasMolang(channel);
    return found;
  }
  // A keyframe object written as the whole channel, or keyframes keyed by time.
  const direct = 'vector' in channel || 'pre' in channel || 'post' in channel;
  const keyframes: JsonObject[] = direct ? [channel] : [];
  if (!direct) {
    for (const value of Object.values(channel)) {
      if (isRecord(value)) keyframes.push(value);
      else if (vectorHasMolang(value)) found.molang = true;
    }
  }
  for (const keyframe of keyframes) {
    for (const key of ['vector', 'pre', 'post'] as const) {
      if (vectorHasMolang(keyframe[key])) found.molang = true;
    }
    const lerp = keyframe.lerp_mode;
    if (typeof lerp === 'string' && !VANILLA_LERP_MODES.has(lerp)) found.easing = true;
    const easing = keyframe.easing;
    if (typeof easing === 'string' && !VANILLA_LERP_MODES.has(easing)) found.easing = true;
  }
  return found;
}

function unsupportedFeatures(set: Element): Unsupported {
  const found: Unsupported = { molang: [], easing: [], sound: [], particle: [], instruction: [] };
  const animations = record(dataOf(set).animations) ?? {};
  for (const name of Object.keys(animations).sort()) {
    const animation = record(animations[name]);
    if (animation === undefined) continue;
    let molang = false;
    let easing = false;
    for (const key of ['start_delay', 'loop_delay', 'blend_weight', 'anim_time_update'] as const) {
      if (typeof animation[key] === 'string') molang = true;
    }
    for (const bone of Object.values(record(animation.bones) ?? {})) {
      const channels = record(bone);
      if (channels === undefined) continue;
      for (const key of ['rotation', 'position', 'scale'] as const) {
        const scanned = scanChannel(channels[key]);
        molang ||= scanned.molang;
        easing ||= scanned.easing;
      }
    }
    if (molang) found.molang.push(name);
    if (easing) found.easing.push(name);
    if (isNonEmptyRecord(animation.sound_effects)) found.sound.push(name);
    if (isNonEmptyRecord(animation.particle_effects)) found.particle.push(name);
    if (isNonEmptyRecord(animation.timeline)) found.instruction.push(name);
  }
  return found;
}

const listed = (names: readonly string[]): string => names.map((name) => `"${name}"`).join(', ');

function rendererChecks(elements: readonly Element[], target: TargetFacts): Problem[] {
  const sets = new Map<string, Element>(
    elements
      .filter((element) => element.kind === ANIMATION_KIND)
      .map((element) => [element.id, element] as const),
  );
  const geckolib = hasGeckolib(target);
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const animated = component(element, ANIMATED_MODEL);
    if (animated === undefined) continue;
    const renderer = rendererOf(element);
    if (renderer === 'geckolib' && !geckolib) {
      problems.push({
        severity: 'error',
        code: 'entities.geckolib-renderer-target',
        elementId: element.id,
        path: pointer('components', ANIMATED_MODEL, 'renderer'),
        message: `This mob draws only with GeckoLib, which has no build for ${target.mcVersion}, so it cannot be exported for this version. Set "renderer" to "auto" or "vanilla" to draw it with the vanilla renderer.`,
      });
      continue;
    }
    const vanilla = renderer === 'vanilla' || (renderer === 'auto' && !geckolib);
    if (!vanilla) continue;
    const setId = animated.animations;
    const set = typeof setId === 'string' ? sets.get(setId) : undefined;
    if (set === undefined) continue;
    const found = unsupportedFeatures(set);
    const parts: string[] = [];
    if (found.molang.length > 0) {
      parts.push(`Molang expressions play as 0 (${listed(found.molang)})`);
    }
    if (found.easing.length > 0) {
      parts.push(
        `easings other than linear and catmullrom play as linear (${listed(found.easing)})`,
      );
    }
    if (found.sound.length > 0) parts.push(`sound keyframes are silent (${listed(found.sound)})`);
    if (found.particle.length > 0) {
      parts.push(`particle keyframes show nothing (${listed(found.particle)})`);
    }
    if (found.instruction.length > 0) {
      parts.push(`instruction keyframes are skipped (${listed(found.instruction)})`);
    }
    if (parts.length === 0) continue;
    const why =
      renderer === 'vanilla'
        ? 'This mob draws with the vanilla renderer'
        : `GeckoLib has no build for ${target.mcVersion}, so this mob draws with the vanilla renderer there`;
    problems.push({
      severity: 'warning',
      code: 'entities.vanilla-renderer-subset',
      elementId: element.id,
      path: pointer(
        'components',
        ANIMATED_MODEL,
        animated.renderer === undefined ? 'animations' : 'renderer',
      ),
      message: `${why}, which plays a subset of animation set "${set.id}": ${parts.join('; ')}. Use plain numbers and linear or catmullrom keyframes, or set "renderer" to "geckolib" where GeckoLib is available.`,
    });
  }
  return problems;
}

function categoryChecks(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const data = dataOf(element);
    const category = typeof data.category === 'string' ? data.category : undefined;
    if (category === undefined) continue;
    const movement = component(element, 'msm:movement');
    const mode = typeof movement?.mode === 'string' ? movement.mode : 'walk';
    const water = WATER_CATEGORIES.has(category);
    if (mode === 'swim' && !water) {
      problems.push({
        severity: 'info',
        code: 'entities.mode-category',
        elementId: element.id,
        path: pointer('components', 'msm:movement', 'mode'),
        message: `This mob swims but is in the "${category}" category, which spawns on land and counts against land mobs' cap. Water creatures usually use "water_creature" or "water_ambient".`,
      });
    } else if (mode === 'walk' && water) {
      problems.push({
        severity: 'info',
        code: 'entities.mode-category',
        elementId: element.id,
        path: '/category',
        message: `This mob is in the water category "${category}" but walks. Set "msm:movement" "mode" to "swim" or "amphibious", or pick a land category.`,
      });
    }
    if (baseOf(element) === 'monster' && category !== 'monster') {
      problems.push({
        severity: 'info',
        code: 'entities.monster-base-creature',
        elementId: element.id,
        path: '/base',
        message: `This mob is a monster but spawns in the "${category}" category, so it shares that category's spawn cap and spawns as those mobs do. That is allowed; use the "monster" category for a usual hostile mob.`,
      });
    }
  }
  return problems;
}

const REFERENCE_KINDS = [ENTITY_KIND, GEO_MODEL_KIND, ANIMATION_KIND] as const;

/** The mob validators, registered after {@link entitiesValidators} of `validators.ts`. */
export const entitiesMobValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.entities.component-needs-base',
    kinds: [ENTITY_KIND],
    validate: ({ elements }) => componentsNeedingBase(elements),
  },
  {
    id: 'msm.entities.ranged-attack',
    kinds: [ENTITY_KIND, ITEM_KIND],
    validate: ({ elements, target }) => [
      ...rangedGoalsAndComponents(elements),
      ...unknownProjectiles(elements, target),
    ],
  },
  {
    id: 'msm.entities.rideable',
    kinds: REFERENCE_KINDS,
    validate: ({ elements }) => [...controlledByOwner(elements), ...saddleBones(elements)],
  },
  {
    id: 'msm.entities.variants',
    kinds: [ENTITY_KIND],
    validate: ({ elements, registry }) => variantChecks(elements, registry),
  },
  {
    id: 'msm.entities.renderer',
    kinds: REFERENCE_KINDS,
    validate: ({ elements, target }) => rendererChecks(elements, target),
  },
  {
    id: 'msm.entities.kind-of-mob',
    kinds: [ENTITY_KIND],
    validate: ({ elements }) => categoryChecks(elements),
  },
] satisfies ProjectValidator[]);
