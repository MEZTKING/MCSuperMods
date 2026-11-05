/**
 * Cross-element checks of entities (ADR 0028 D3). Every validator is pure and reads only the
 * project's elements and the registry ids. Models and animation sets are `msm:geo_model` and
 * `msm:animation` elements, read by kind string only (`@msm/plugin-models-anim` is another
 * plugin). Codes:
 *
 * - `entities.unknown-event` (error): an event field of a trigger component (`msm:on_hurt`,
 *   `msm:on_death`, `msm:on_interact`, `msm:attack.on_attack`) or a `trigger_event` action
 *   naming an event the entity does not declare.
 * - `entities.event-cycle` (error): events whose `trigger_event` actions call each other in a
 *   loop; the runtime would stop the chain at 16 levels with a logged error.
 * - `entities.unknown-model` (error): `msm:animated_model.model` is not an `msm:geo_model`
 *   element id.
 * - `entities.unknown-animations` (error): `msm:animated_model.animations` is set but is not an
 *   `msm:animation` element id.
 * - `entities.unknown-animation-name` (warning): `idle`, `walk`, `attack` or a
 *   `play_animation` action names an animation the referenced animation element lacks.
 * - `entities.missing-texture` (warning): `msm:animated_model.texture` has no texture
 *   (project asset `textures/<path>.png`) in the registry index. Skipped when the index has no
 *   textures at all.
 * - `entities.egg-texture-missing` (warning): the entity has a spawn egg without a texture, or
 *   with a texture the registry index does not know (skipped like `missing-texture`).
 * - `entities.group-range` (error): `spawn.min_group` is larger than `spawn.max_group` (mcdoc
 *   cannot compare the two).
 * - `entities.goal-needs-targets` (warning): a `melee_attack` goal without `targets` and
 *   without `retaliate` never attacks.
 * - `entities.melee-without-attack` (warning): an `msm:ai_goals` list with a `melee_attack`
 *   goal but no `msm:attack` component; the runtime then adds no melee goals and the mob never
 *   attacks (ADR 0028 D2). Reported once per entity, at the first `melee_attack` goal.
 *
 * The event checks are a copy of the blocks-items ones, because plugins cannot import each
 * other.
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  ValidationRegistry,
} from '@msm/plugin-api';
import { ANIMATION_KIND, ENTITY_KIND, GEO_MODEL_KIND } from './kinds';
import { hasSpawnEgg } from './lowering/entity';
import { isRecord } from './lowering/paths';

/** Every code the validators report. */
export const ENTITIES_PROBLEM_CODES = Object.freeze([
  'entities.unknown-event',
  'entities.event-cycle',
  'entities.unknown-model',
  'entities.unknown-animations',
  'entities.unknown-animation-name',
  'entities.missing-texture',
  'entities.egg-texture-missing',
  'entities.group-range',
  'entities.goal-needs-targets',
  'entities.melee-without-attack',
] as const);

const ANIMATED_MODEL = 'msm:animated_model';

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

const animatedModelOf = (element: Element): JsonObject | undefined =>
  record(componentsOf(element)?.[ANIMATED_MODEL]);

/** The trigger component fields that name an event: `[component, field]`. */
const EVENT_FIELDS: readonly (readonly [string, string])[] = [
  ['msm:attack', 'on_attack'],
  ['msm:on_hurt', 'event'],
  ['msm:on_death', 'event'],
  ['msm:on_interact', 'event'],
];

/** One event reference inside an element. */
interface EventReference {
  event: string;
  path: string;
  /** The event whose action makes the reference, for `trigger_event`; absent for components. */
  from?: string;
}

/** Every action of every declared event, with its JSON pointer. */
function actionsOf(element: Element): { event: string; action: JsonObject; path: string }[] {
  const found: { event: string; action: JsonObject; path: string }[] = [];
  const events = record(dataOf(element).events) ?? {};
  for (const [name, event] of Object.entries(events)) {
    const actions = record(event)?.actions;
    if (!Array.isArray(actions)) continue;
    actions.forEach((action, index) => {
      const fields = record(action);
      if (fields !== undefined) {
        found.push({
          event: name,
          action: fields,
          path: pointer('events', name, 'actions', index),
        });
      }
    });
  }
  return found;
}

function eventReferences(element: Element): EventReference[] {
  const references: EventReference[] = [];
  const components = componentsOf(element);
  for (const [component, field] of EVENT_FIELDS) {
    const value = record(components?.[component])?.[field];
    if (typeof value === 'string') {
      references.push({ event: value, path: pointer('components', component, field) });
    }
  }
  for (const { event, action, path } of actionsOf(element)) {
    if (action.type === 'trigger_event' && typeof action.event === 'string') {
      references.push({ event: action.event, path: `${path}/event`, from: event });
    }
  }
  return references;
}

const declaredEvents = (element: Element): Set<string> =>
  new Set(Object.keys(record(dataOf(element).events) ?? {}));

function unknownEvents(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const declared = declaredEvents(element);
    for (const reference of eventReferences(element)) {
      if (declared.has(reference.event)) continue;
      problems.push({
        severity: 'error',
        code: 'entities.unknown-event',
        elementId: element.id,
        path: reference.path,
        message: `Event "${reference.event}" is not declared in this entity's "events". Add it there or pick an existing event.`,
      });
    }
  }
  return problems;
}

/** Strongly connected components with more than one node or a self-loop, each sorted. */
function cycles(
  nodes: readonly string[],
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of [...(edges.get(node) ?? [])].sort()) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) as number, low.get(next) as number));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) as number, index.get(next) as number));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop() as string;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || edges.get(node)?.has(node) === true) found.push(component.sort());
    }
  };
  for (const node of nodes) if (!index.has(node)) visit(node);
  return found;
}

function eventCycles(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const declared = declaredEvents(element);
    const edges = new Map<string, Set<string>>();
    for (const reference of eventReferences(element)) {
      if (reference.from === undefined || !declared.has(reference.event)) continue;
      const targets = edges.get(reference.from) ?? new Set<string>();
      targets.add(reference.event);
      edges.set(reference.from, targets);
    }
    for (const cycle of cycles([...declared].sort(), edges)) {
      const names = cycle.map((name) => `"${name}"`).join(', ');
      problems.push({
        severity: 'error',
        code: 'entities.event-cycle',
        elementId: element.id,
        path: pointer('events', cycle[0] as string),
        message: `Events ${names} trigger each other in a loop. The game stops such a chain after 16 steps and logs an error; remove one of the "trigger_event" actions.`,
      });
    }
  }
  return problems;
}

const idsOfKind = (elements: readonly Element[], kind: string): Set<string> =>
  new Set(elements.filter((element) => element.kind === kind).map((element) => element.id));

function unknownModels(elements: readonly Element[]): Problem[] {
  const models = idsOfKind(elements, GEO_MODEL_KIND);
  const animationSets = idsOfKind(elements, ANIMATION_KIND);
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const animated = animatedModelOf(element);
    if (animated === undefined) continue;
    const model = animated.model;
    if (typeof model === 'string' && !models.has(model)) {
      problems.push({
        severity: 'error',
        code: 'entities.unknown-model',
        elementId: element.id,
        path: pointer('components', ANIMATED_MODEL, 'model'),
        message:
          model.length === 0
            ? 'This entity has no model. Pick a geo model, or import one from Blockbench.'
            : `Geo model "${model}" is not in the project. Add or import it, or pick an existing geo model.`,
      });
    }
    const animations = animated.animations;
    if (typeof animations === 'string' && !animationSets.has(animations)) {
      problems.push({
        severity: 'error',
        code: 'entities.unknown-animations',
        elementId: element.id,
        path: pointer('components', ANIMATED_MODEL, 'animations'),
        message:
          animations.length === 0
            ? 'The animation set is empty. Pick an animation set, or remove the field for a model without animations.'
            : `Animation set "${animations}" is not in the project. Add or import it, or pick an existing animation set.`,
      });
    }
  }
  return problems;
}

/** The animation names of an `msm:animation` element: the keys of its `animations` map. */
const animationNames = (element: Element): Set<string> =>
  new Set(Object.keys(record(dataOf(element).animations) ?? {}));

function unknownAnimationNames(elements: readonly Element[]): Problem[] {
  const sets = new Map<string, Element>(
    elements
      .filter((element) => element.kind === ANIMATION_KIND)
      .map((element) => [element.id, element] as const),
  );
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const animated = animatedModelOf(element);
    const setId = animated?.animations;
    const set = typeof setId === 'string' ? sets.get(setId) : undefined;
    if (set === undefined) continue;
    const names = animationNames(set);
    const report = (name: string, path: string): void => {
      if (names.has(name)) return;
      problems.push({
        severity: 'warning',
        code: 'entities.unknown-animation-name',
        elementId: element.id,
        path,
        message: `Animation "${name}" is not in animation set "${set.id}", so nothing plays. Pick one of: ${[...names].sort().join(', ') || '(none)'}.`,
      });
    };
    for (const field of ['idle', 'walk', 'attack'] as const) {
      const name = animated?.[field];
      if (typeof name === 'string') report(name, pointer('components', ANIMATED_MODEL, field));
    }
    for (const { action, path } of actionsOf(element)) {
      if (action.type === 'play_animation' && typeof action.animation === 'string') {
        report(action.animation, `${path}/animation`);
      }
    }
  }
  return problems;
}

function missingTextures(elements: readonly Element[], registry: ValidationRegistry): Problem[] {
  if (registry.ids('texture').length === 0) return [];
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const texture = animatedModelOf(element)?.texture;
    if (typeof texture !== 'string' || registry.has('texture', texture)) continue;
    problems.push({
      severity: 'warning',
      code: 'entities.missing-texture',
      elementId: element.id,
      path: pointer('components', ANIMATED_MODEL, 'texture'),
      message:
        texture.length === 0
          ? 'This entity has no texture, so it renders with the missing-texture pattern. Pick a texture.'
          : `Texture "${texture}" has no PNG in the project (expected under "textures/"), so the entity renders with the missing-texture pattern.`,
    });
  }
  return problems;
}

function eggTextures(elements: readonly Element[], registry: ValidationRegistry): Problem[] {
  const known = registry.ids('texture').length > 0;
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    if (!isRecord(element.data) || !hasSpawnEgg(element.data)) continue;
    const data = element.data;
    const texture = record(data.spawn_egg)?.texture;
    const missing = typeof texture !== 'string' || texture.length === 0;
    if (!missing && (!known || registry.has('texture', texture))) continue;
    problems.push({
      severity: 'warning',
      code: 'entities.egg-texture-missing',
      elementId: element.id,
      path: missing ? '/spawn_egg' : '/spawn_egg/texture',
      message: missing
        ? 'The spawn egg has no texture, so it shows as the missing-model cube. Pick an item texture, or set "spawn_egg" to false.'
        : `Spawn egg texture "${texture}" has no PNG in the project (expected under "textures/").`,
    });
  }
  return problems;
}

function groupRanges(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const spawn = record(dataOf(element).spawn);
    const min = spawn?.min_group;
    const max = spawn?.max_group;
    if (typeof min !== 'number' || typeof max !== 'number' || min <= max) continue;
    problems.push({
      severity: 'error',
      code: 'entities.group-range',
      elementId: element.id,
      path: '/spawn/max_group',
      message: `The largest group (${max}) is smaller than the smallest group (${min}). Raise "max_group" or lower "min_group".`,
    });
  }
  return problems;
}

function goalsWithoutTargets(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const goals = record(componentsOf(element)?.['msm:ai_goals'])?.goals;
    if (!Array.isArray(goals)) continue;
    goals.forEach((goal, index) => {
      const fields = record(goal);
      if (fields?.type !== 'melee_attack') return;
      const targets = fields.targets;
      if ((Array.isArray(targets) && targets.length > 0) || fields.retaliate === true) return;
      problems.push({
        severity: 'warning',
        code: 'entities.goal-needs-targets',
        elementId: element.id,
        path: pointer('components', 'msm:ai_goals', 'goals', index),
        message:
          'This melee attack has no targets and does not retaliate, so the mob never attacks. Add targets such as "minecraft:player", or turn on "retaliate".',
      });
    });
  }
  return problems;
}

function meleeWithoutAttack(elements: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of entities(elements)) {
    const components = componentsOf(element);
    if (record(components?.['msm:attack']) !== undefined) continue;
    const goals = record(components?.['msm:ai_goals'])?.goals;
    if (!Array.isArray(goals)) continue;
    const index = goals.findIndex((goal) => record(goal)?.type === 'melee_attack');
    if (index < 0) continue;
    problems.push({
      severity: 'warning',
      code: 'entities.melee-without-attack',
      elementId: element.id,
      path: pointer('components', 'msm:ai_goals', 'goals', index),
      message:
        'This mob has a melee attack goal but no "msm:attack" component, so the game leaves the goal out and the mob never attacks. Add "msm:attack" with a damage value, or remove the goal.',
    });
  }
  return problems;
}

const REFERENCE_KINDS = [ENTITY_KIND, GEO_MODEL_KIND, ANIMATION_KIND] as const;

export const entitiesValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.entities.unknown-event',
    kinds: [ENTITY_KIND],
    validate: ({ elements }) => unknownEvents(elements),
  },
  {
    id: 'msm.entities.event-cycle',
    kinds: [ENTITY_KIND],
    validate: ({ elements }) => eventCycles(elements),
  },
  {
    id: 'msm.entities.unknown-model',
    kinds: REFERENCE_KINDS,
    validate: ({ elements }) => unknownModels(elements),
  },
  {
    id: 'msm.entities.unknown-animation-name',
    kinds: REFERENCE_KINDS,
    validate: ({ elements }) => unknownAnimationNames(elements),
  },
  {
    id: 'msm.entities.textures',
    kinds: [ENTITY_KIND],
    validate: ({ elements, registry }) => [
      ...missingTextures(elements, registry),
      ...eggTextures(elements, registry),
    ],
  },
  {
    id: 'msm.entities.group-range',
    kinds: [ENTITY_KIND],
    validate: ({ elements }) => groupRanges(elements),
  },
  {
    id: 'msm.entities.goal-needs-targets',
    kinds: [ENTITY_KIND],
    validate: ({ elements }) => goalsWithoutTargets(elements),
  },
  {
    id: 'msm.entities.melee-without-attack',
    kinds: [ENTITY_KIND],
    validate: ({ elements }) => meleeWithoutAttack(elements),
  },
] satisfies ProjectValidator[]);
