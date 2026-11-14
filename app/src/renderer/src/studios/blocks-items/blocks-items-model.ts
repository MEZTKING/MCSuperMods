/**
 * Pure helpers of the Block and Item Studios (B97): the action table of MSM definition
 * format v1 (ADR 0025 D4), event lists, renaming an event with its references, and schema
 * choices. No React, no session.
 *
 * The action table is a fact of the MSM format, which is version-independent (it lives in
 * `@msm/schemas`, not in a target); vanilla choices (sound types, tiers, tools, rarities) are
 * read from the schema.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import {
  FULL_CUBE,
  isCubeModel,
  SHAPE_PRESET_BOXES,
  SHAPE_PRESETS,
  type ShapePreset,
} from '@msm/plugin-blocks-items';
import type { SchemaNode } from '@msm/schemas';
import { childPointer, isJsonObject } from '../../forms/pointer';
import { flattenUnion, resolveNode } from '../../forms/schema-utils';
import { fieldNode, stringChoices } from '../structures/pickers';

type JsonObject = { [key: string]: Json };

/** The kind ids the Studios edit. */
export const BLOCK_KIND = 'msm:block';
export const ITEM_KIND = 'msm:item';
/** The kind id of custom entities (the Entity Studio, ADR 0028), which share the events editor. */
export const ENTITY_KIND = 'msm:entity';
/** The kind id of custom mob effects (the Effect Studio, ADR 0055). */
export const EFFECT_KIND = 'msm:effect';
/** The kind id a model id may name in the project (go to definition). */
export const MODEL_KIND = 'minecraft:model';

/** The object at `value`, or an empty one. */
export function asObject(value: Json | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** The pointer of `path` (keys and indices) from the element root. */
export function pointerOf(path: readonly (string | number)[]): string {
  return path.reduce<string>((pointer, key) => childPointer(pointer, key), '');
}

/** One field of an action. */
export interface ActionField {
  key: string;
  label: string;
  /**
   * `id`: a registry id (with {@link registry}); `text`: free text; `int`/`float`: a number;
   * `offset`: three integers; `event`: an event of the same element; `animation`: an
   * animation name offered by the host (the entity's animation set); `handler`: a script
   * handler id (`msm.actions.define`), offered from the project's scripts or typed; `choice`:
   * one of {@link choices}.
   */
  type: 'id' | 'text' | 'int' | 'float' | 'offset' | 'event' | 'animation' | 'handler' | 'choice';
  /** The registry suggestions come from, for `id` fields. */
  registry?: string;
  /** The values a `choice` field offers. */
  choices?: readonly string[];
  /** The value {@link newAction} writes for a required field (otherwise an empty string). */
  initialValue?: Json;
  /** Whether the field must be set. */
  required: boolean;
  /** The value the runtime uses when the field is absent (ADR 0025 D4). */
  defaultValue?: Json;
}

/**
 * Who an `apply_effect`, `launch`, `damage` or `heal` action affects (`EffectTarget` in
 * `action.mcdoc`): `self` is the event's player (an entity without one: itself; an effect:
 * its holder; a throwable's hit: the thrower), `other` the other entity of the event.
 */
export const EFFECT_TARGETS: readonly string[] = Object.freeze(['self', 'other']);

/** Where a `launch` action pushes (`LaunchDirection` in `action.mcdoc`, ADR 0052). */
export const LAUNCH_DIRECTIONS: readonly string[] = Object.freeze(['look', 'horizontal', 'up']);

/** One action type of format v1. */
export interface ActionSpec {
  type: string;
  label: string;
  fields: readonly ActionField[];
}

/**
 * The actions of format v1 with their fields and defaults: the six of ADR 0025 D4,
 * `run_script` (ADR 0032 D4), which calls a handler a script defines, `apply_effect`
 * (ADR 0044 D2), which gives a mob effect to the event's player or the other entity,
 * `launch` (ADR 0052), which pushes it, and `damage` ("Hurt") and `heal` ("Heal", ADR 0055
 * D4), which hurt it with magic damage or heal it.
 */
export const ACTIONS: readonly ActionSpec[] = Object.freeze([
  {
    type: 'play_sound',
    label: 'Play sound',
    fields: [
      { key: 'sound', label: 'Sound', type: 'id', registry: 'sound_event', required: true },
      { key: 'volume', label: 'Volume', type: 'float', required: false, defaultValue: 1 },
      { key: 'pitch', label: 'Pitch', type: 'float', required: false, defaultValue: 1 },
    ],
  },
  {
    type: 'spawn_particle',
    label: 'Spawn particle',
    fields: [
      {
        key: 'particle',
        label: 'Particle',
        type: 'id',
        registry: 'particle_type',
        required: true,
      },
      { key: 'count', label: 'Count', type: 'int', required: false, defaultValue: 1 },
      { key: 'spread', label: 'Spread', type: 'float', required: false, defaultValue: 0 },
      { key: 'speed', label: 'Speed', type: 'float', required: false, defaultValue: 0 },
    ],
  },
  {
    type: 'run_function',
    label: 'Run function',
    fields: [
      { key: 'function', label: 'Function', type: 'id', registry: 'function', required: true },
    ],
  },
  {
    type: 'set_block_state',
    label: 'Set block state',
    fields: [
      { key: 'state', label: 'Block state', type: 'text', required: true },
      { key: 'offset', label: 'Offset', type: 'offset', required: false, defaultValue: [0, 0, 0] },
    ],
  },
  {
    type: 'give_item',
    label: 'Give item',
    fields: [
      { key: 'item', label: 'Item', type: 'id', registry: 'item', required: true },
      { key: 'count', label: 'Count', type: 'int', required: false, defaultValue: 1 },
    ],
  },
  {
    type: 'trigger_event',
    label: 'Trigger event',
    fields: [{ key: 'event', label: 'Event', type: 'event', required: true }],
  },
  {
    type: 'run_script',
    label: 'Run script',
    fields: [{ key: 'handler', label: 'Handler', type: 'handler', required: true }],
  },
  {
    type: 'apply_effect',
    label: 'Apply effect',
    fields: [
      { key: 'effect', label: 'Effect', type: 'id', registry: 'mob_effect', required: true },
      { key: 'seconds', label: 'Seconds', type: 'float', required: true, initialValue: 10 },
      { key: 'amplifier', label: 'Amplifier', type: 'int', required: false, defaultValue: 0 },
      {
        key: 'target',
        label: 'Target',
        type: 'choice',
        choices: EFFECT_TARGETS,
        required: false,
        defaultValue: 'self',
      },
    ],
  },
  {
    // ADR 0052: a real push (slime block, wind charge); `add` is left to Raw JSON.
    type: 'launch',
    label: 'Launch (push)',
    fields: [
      {
        key: 'strength',
        label: 'Strength (blocks per tick)',
        type: 'float',
        required: true,
        initialValue: 1,
      },
      {
        key: 'direction',
        label: 'Direction',
        type: 'choice',
        choices: LAUNCH_DIRECTIONS,
        required: false,
        defaultValue: 'look',
      },
      { key: 'up', label: 'Extra upward push', type: 'float', required: false, defaultValue: 0 },
      {
        key: 'target',
        label: 'Target',
        type: 'choice',
        choices: EFFECT_TARGETS,
        required: false,
        defaultValue: 'self',
      },
    ],
  },
  {
    type: 'damage',
    label: 'Hurt',
    fields: [
      {
        key: 'amount',
        label: 'Amount (half hearts)',
        type: 'float',
        required: true,
        initialValue: 2,
      },
      {
        key: 'target',
        label: 'Target',
        type: 'choice',
        choices: EFFECT_TARGETS,
        required: false,
        defaultValue: 'self',
      },
    ],
  },
  {
    type: 'heal',
    label: 'Heal',
    fields: [
      {
        key: 'amount',
        label: 'Amount (half hearts)',
        type: 'float',
        required: true,
        initialValue: 2,
      },
      {
        key: 'target',
        label: 'Target',
        type: 'choice',
        choices: EFFECT_TARGETS,
        required: false,
        defaultValue: 'self',
      },
    ],
  },
] satisfies ActionSpec[]);

/** `play_animation` (ADR 0028), which only entity events may use. */
export const PLAY_ANIMATION_ACTION: ActionSpec = Object.freeze({
  type: 'play_animation',
  label: 'Play animation',
  fields: [
    { key: 'animation', label: 'Animation', type: 'animation', required: true },
    { key: 'controller', label: 'Controller', type: 'text', required: false },
  ],
} satisfies ActionSpec);

/** The actions entity events offer: those of format v1 plus `play_animation`. */
export const ENTITY_ACTIONS: readonly ActionSpec[] = Object.freeze([
  ...ACTIONS,
  PLAY_ANIMATION_ACTION,
]);

/** The actions an element of `kind` offers. */
export function actionsFor(kind: string): readonly ActionSpec[] {
  return kind === ENTITY_KIND ? ENTITY_ACTIONS : ACTIONS;
}

/** The spec of action `type` among `actions`, or `undefined` for an unknown type. */
export function actionSpec(
  type: Json | undefined,
  actions: readonly ActionSpec[] = ENTITY_ACTIONS,
): ActionSpec | undefined {
  return actions.find((spec) => spec.type === type);
}

/**
 * A new action of `type`: the type and its required fields (ids empty for the user to fill;
 * a `trigger_event` takes the first of `events` other than `ownEvent`). Optional fields stay
 * absent, so the runtime defaults apply.
 */
export function newAction(type: string, events: readonly string[], ownEvent?: string): JsonObject {
  const spec = actionSpec(type);
  const action: JsonObject = { type };
  for (const field of spec?.fields ?? []) {
    if (!field.required) continue;
    action[field.key] =
      field.initialValue ??
      (field.type === 'event' ? (events.find((name) => name !== ownEvent) ?? '') : '');
  }
  return action;
}

/** The event ids declared in `data.events`, in declaration order. */
export function eventNames(data: Json | undefined): string[] {
  return Object.keys(asObject(asObject(data).events));
}

/** The actions of event `name`, or `[]`. */
export function eventActions(data: Json | undefined, name: string): Json[] {
  const actions = asObject(asObject(asObject(data).events)[name]).actions;
  return Array.isArray(actions) ? actions : [];
}

/**
 * The trigger fields that name an event, per kind: the path under `components`, ending in the
 * field that holds the event id (`['msm:on_use', 'event']`, or
 * `['msm:throwable', 'on_hit_entity', 'event']` for a nested trigger).
 */
export const EVENT_FIELDS: Readonly<Record<string, readonly (readonly string[])[]>> = Object.freeze(
  {
    [BLOCK_KIND]: [
      ['msm:on_interact', 'event'],
      ['msm:on_step', 'event'],
      ['msm:redstone', 'on_powered'],
      ['msm:redstone', 'on_unpowered'],
      ['msm:on_break', 'event'],
      ['msm:on_place', 'event'],
      ['msm:on_random_tick', 'event'],
      ['msm:on_entity_inside', 'event'],
    ],
    [ITEM_KIND]: [
      ['msm:on_use', 'event'],
      ['msm:throwable', 'on_hit_entity', 'event'],
      ['msm:throwable', 'on_hit_block', 'event'],
      ['msm:on_hit', 'event'],
      ['msm:on_use_on_block', 'event'],
      ['msm:while_held', 'event'],
      ['msm:while_worn', 'event'],
    ],
    [ENTITY_KIND]: [
      ['msm:on_hurt', 'event'],
      ['msm:on_death', 'event'],
      ['msm:on_interact', 'event'],
      ['msm:attack', 'on_attack'],
      ['msm:on_tick', 'event'],
      ['msm:on_spawn', 'event'],
    ],
    [EFFECT_KIND]: [
      ['msm:on_start', 'event'],
      ['msm:on_tick', 'event'],
      ['msm:on_end', 'event'],
    ],
  },
);

/** The smallest interval of a repeating trigger, in ticks (ADR 0061 D4). */
export const MIN_TRIGGER_INTERVAL = 5;

/** One field of a trigger component besides its `event`. */
export interface TriggerFieldSpec {
  key: string;
  label: string;
  /** `int` and `float` are numbers; `choice` offers the schema's string values. */
  type: 'int' | 'float' | 'choice';
  /** The value the runtime uses when the field is absent (ADR 0061). */
  defaultValue: number | string;
  /** The `data-testid` suffix of the field, after the trigger's own. */
  testId: string;
  /** Values a `choice` offers when the schema names none. */
  choices?: readonly string[];
}

/** One trigger component of ADR 0061 that the Triggers section edits. */
export interface TriggerSpec {
  /** The component id, for example `msm:on_hit`. */
  component: string;
  label: string;
  /** What fires it and who self and other are. */
  help: string;
  fields: readonly TriggerFieldSpec[];
}

const intervalField = (): TriggerFieldSpec => ({
  key: 'interval_ticks',
  label: 'Every (ticks)',
  type: 'int',
  defaultValue: 20,
  testId: 'interval',
});

/** The triggers of ADR 0061 per kind, in the order the Triggers section shows them. */
export const TRIGGERS: Readonly<Record<string, readonly TriggerSpec[]>> = Object.freeze({
  [ITEM_KIND]: [
    {
      component: 'msm:on_hit',
      label: 'On hit',
      help: 'After the item hits a mob, by a player or a mob holding it; self is the attacker, other the mob hit.',
      fields: [],
    },
    {
      component: 'msm:on_use_on_block',
      label: 'On use on a block',
      help: 'When the item is used on a block; the block is the one clicked.',
      fields: [
        {
          key: 'cooldown_ticks',
          label: 'Cooldown (ticks)',
          type: 'int',
          defaultValue: 0,
          testId: 'cooldown',
        },
      ],
    },
    {
      component: 'msm:while_held',
      label: 'While held',
      help: 'Repeatedly while an entity holds the item.',
      fields: [
        intervalField(),
        {
          key: 'hand',
          label: 'Hand',
          type: 'choice',
          defaultValue: 'main',
          testId: 'hand',
          choices: ['main', 'off', 'either'],
        },
      ],
    },
    {
      component: 'msm:while_worn',
      label: 'While worn',
      help: 'Repeatedly while an entity wears the item in its armour slot.',
      fields: [intervalField()],
    },
  ],
  [BLOCK_KIND]: [
    {
      component: 'msm:on_break',
      label: 'On break',
      help: 'When a player breaks the block, in any game mode; self is the player.',
      fields: [],
    },
    {
      component: 'msm:on_place',
      label: 'On place',
      help: 'When an entity places the block; self is the placer.',
      fields: [],
    },
    {
      component: 'msm:on_random_tick',
      label: 'On random tick',
      help: 'On a random block tick (about once every 68 seconds per block on average).',
      fields: [
        {
          key: 'chance',
          label: 'Chance (0 to 1)',
          type: 'float',
          defaultValue: 1,
          testId: 'chance',
        },
      ],
    },
    {
      component: 'msm:on_entity_inside',
      label: 'On entity inside',
      help: 'While an entity is inside the block, at most once per cooldown for each entity.',
      fields: [
        {
          key: 'cooldown_ticks',
          label: 'Cooldown (ticks)',
          type: 'int',
          defaultValue: 20,
          testId: 'cooldown',
        },
      ],
    },
  ],
  [ENTITY_KIND]: [
    {
      component: 'msm:on_tick',
      label: 'On tick',
      help: 'Repeatedly while the mob is alive.',
      fields: [intervalField()],
    },
    {
      component: 'msm:on_spawn',
      label: 'On spawn',
      help: 'When the mob spawns naturally, from an egg or from a spawner; not when its chunk loads.',
      fields: [],
    },
  ],
} satisfies Record<string, TriggerSpec[]>);

/** The `data-testid` stem of a trigger component: `msm:on_use_on_block` is `trigger-on-use-on-block`. */
export function triggerTestId(component: string): string {
  return `trigger-${component.replace(/^msm:/, '').replaceAll('_', '-')}`;
}

/**
 * The node of field `key` of `node` for `value`, also through a union (the first struct member
 * that has the field, preferring the member the value fits); `undefined` when none has it.
 */
export function fieldNodeThrough(
  node: SchemaNode | undefined,
  value: Json | undefined,
  key: string,
): SchemaNode | undefined {
  if (node === undefined) return undefined;
  const resolved = resolveNode(node);
  if (resolved.kind !== 'union') return fieldNode(resolved, value, key);
  for (const member of flattenUnion(resolved)) {
    const found = fieldNode(member, value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The string choices of the value at `path` under `node` (keys and list indices), following
 * unions and lists; `[]` when the schema has no such place.
 */
export function choicesThrough(
  node: SchemaNode | undefined,
  value: Json | undefined,
  path: readonly (string | number)[],
): string[] {
  let current: SchemaNode | undefined = node;
  let currentValue: Json | undefined = value;
  for (const key of path) {
    if (typeof key === 'number') {
      const resolved = current === undefined ? undefined : resolveNode(current);
      current = resolved?.kind === 'list' ? resolved.item : undefined;
      currentValue = Array.isArray(currentValue) ? currentValue[key] : undefined;
    } else {
      current = fieldNodeThrough(current, currentValue, key);
      currentValue = asObject(currentValue)[key];
    }
    if (current === undefined) return [];
  }
  const direct = stringChoices(current);
  if (direct.length > 0 || current === undefined) return direct;
  const resolved = resolveNode(current);
  if (resolved.kind !== 'union') return [];
  return [...new Set(flattenUnion(resolved).flatMap((member) => stringChoices(member)))];
}

/** Compost chances (`CompostChance` in `element.mcdoc`), when the schema names none. */
export const COMPOST_CHANCES: readonly string[] = Object.freeze([
  '30%',
  '50%',
  '65%',
  '85%',
  '100%',
]);

/** The fuel "Burns in a furnace" writes: 10 seconds, enough to smelt one item. */
export const NEW_FUEL: Readonly<{ burn_seconds: number }> = Object.freeze({ burn_seconds: 10 });

/** `value` with the string at `path` replaced by `to` when it equals `from`; else `value`. */
function renamedAt(value: Json, path: readonly string[], from: string, to: string): Json {
  const [key, ...rest] = path;
  if (key === undefined || !isJsonObject(value)) return value;
  const child = value[key];
  if (child === undefined) return value;
  if (rest.length === 0) return child === from ? { ...value, [key]: to } : value;
  const next = renamedAt(child, rest, from, to);
  return next === child ? value : { ...value, [key]: next };
}

/**
 * `data` with event `from` renamed to `to`, keeping its position, and every reference to it
 * (trigger component fields of `kind` and `trigger_event` actions) rewritten.
 *
 * @throws Error If `from` is not declared, or `to` is empty or already declared.
 */
export function renameEvent(data: Json, kind: string, from: string, to: string): JsonObject {
  const root = asObject(data);
  const events = asObject(root.events);
  if (!Object.hasOwn(events, from)) throw new Error(`No event "${from}".`);
  if (to === '') throw new Error('An event id cannot be empty.');
  if (to !== from && Object.hasOwn(events, to)) throw new Error(`Event "${to}" already exists.`);
  const renamedEvents: JsonObject = {};
  for (const [name, event] of Object.entries(events)) {
    const object = asObject(event);
    const actions = Array.isArray(object.actions)
      ? object.actions.map((action) =>
          isJsonObject(action) && action.type === 'trigger_event' && action.event === from
            ? { ...action, event: to }
            : action,
        )
      : object.actions;
    const nextEvent: Json = isJsonObject(event)
      ? actions === undefined
        ? event
        : { ...event, actions }
      : event;
    renamedEvents[name === from ? to : name] = nextEvent;
  }
  let components: Json | undefined = isJsonObject(root.components)
    ? { ...root.components }
    : undefined;
  if (components !== undefined) {
    for (const path of EVENT_FIELDS[kind] ?? []) {
      components = renamedAt(components, path, from, to);
    }
  }
  return {
    ...root,
    events: renamedEvents,
    ...(components === undefined ? {} : { components }),
  };
}

/** `list` with the entry at `from` moved to `to`. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [entry] = next.splice(from, 1);
  if (entry !== undefined) next.splice(to, 0, entry);
  return next;
}

/**
 * The string choices (enum values) of the field at `path` under `node`, following `value`
 * through the struct fields; `[]` when the schema has no such field.
 */
export function choicesAt(
  node: SchemaNode | undefined,
  value: Json | undefined,
  path: readonly string[],
): string[] {
  let current: SchemaNode | undefined = node;
  let currentValue: Json | undefined = value;
  for (const key of path) {
    current = fieldNode(current, currentValue, key);
    currentValue = asObject(currentValue)[key];
    if (current === undefined) return [];
  }
  const direct = stringChoices(current);
  if (direct.length > 0 || current === undefined) return direct;
  // A union of named values and an object (a tool tier or a custom material, ADR 0042):
  // offer the named values; the object form stays editable in Raw JSON.
  const resolved = resolveNode(current);
  if (resolved.kind !== 'union') return [];
  return [...new Set(flattenUnion(resolved).flatMap((member) => stringChoices(member)))];
}

/** The project element with id `id` and kind `kind`, or `undefined`. */
export function findElement(project: Project, id: string, kind: string): Element | undefined {
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find((entry) => entry.id === id && entry.kind === kind);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The ids of the project's own mob effects (`msm:effect` elements), sorted. */
export function projectEffects(project: Project | null | undefined): string[] {
  if (project === null || project === undefined) return [];
  return project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter((element) => element.kind === EFFECT_KIND)
    .map((element) => element.id)
    .sort();
}

/**
 * `suggest` with `ids` (for example the project's own effects) offered first for `registry`
 * when they match the typed prefix; other registries are unchanged.
 */
export function withProjectIds(
  suggest: (registry: string, prefix: string) => string[],
  registry: string,
  ids: readonly string[],
): (registry: string, prefix: string) => string[] {
  if (ids.length === 0) return suggest;
  return (asked, prefix) => {
    const base = suggest(asked, prefix);
    if (asked !== registry) return base;
    const own = ids.filter((id) => id.startsWith(prefix) || id.split(':')[1]?.startsWith(prefix));
    return [...own, ...base.filter((id) => !own.includes(id))];
  };
}

/** A suggested id for a new event of `elementId`: `<id>_event`, `<id>_event_2`, … */
export function suggestEventId(elementId: string, existing: readonly string[]): string {
  const base = `${elementId}_event`;
  if (!existing.includes(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!existing.includes(candidate)) return candidate;
  }
}

/** The `onChange` of a Studio. */
export type StudioChange = (
  pointer: string,
  value: Json | undefined,
  options?: { coalesce?: string },
) => void;

/**
 * A setter over element paths: sets `value` at `path` (the core command creates absent
 * parents), and removes the key only when it exists (through objects and list items), so a
 * clear never adds an empty undo step. `coalesce` merges typing into one undo step.
 */
export function pathSetter(data: Json, onChange: StudioChange) {
  return (path: readonly (string | number)[], value: Json | undefined, coalesce?: string) => {
    const pointer = pointerOf(path);
    const options = coalesce === undefined ? undefined : { coalesce };
    if (value === undefined) {
      let current: Json | undefined = data;
      for (const key of path) {
        if (Array.isArray(current)) current = typeof key === 'number' ? current[key] : undefined;
        else current = isJsonObject(current) ? current[String(key)] : undefined;
        if (current === undefined) return;
      }
      onChange(pointer, undefined, options);
      return;
    }
    onChange(pointer, value, options);
  };
}

// Block shapes (ADR 0059) -------------------------------------------------------------------

/** The element path of a block's `msm:shape` component. */
export const SHAPE_PATH: readonly string[] = Object.freeze(['components', 'msm:shape']);

/** The most boxes a shape holds (`boxes @ 1..16`). */
export const MAX_SHAPE_BOXES = 16;

/** The presets the Block Studio offers, in order (from the plugin). */
export { SHAPE_PRESETS, type ShapePreset };

/** The words the Block Studio shows for each preset. */
export const SHAPE_PRESET_LABELS: Readonly<Record<ShapePreset, string>> = Object.freeze({
  full: 'Full block',
  slab_bottom: 'Bottom half',
  slab_top: 'Top half',
  carpet: 'Carpet',
  pillar: 'Pillar',
  cross: 'Plant (cross)',
  custom: 'Custom boxes',
});

/** One pixel box `[x1, y1, z1, x2, y2, z2]`. */
export type PixelBox = [number, number, number, number, number, number];

const isPreset = (value: Json | undefined): value is ShapePreset =>
  typeof value === 'string' && (SHAPE_PRESETS as readonly string[]).includes(value);

/** The preset of a shape object, or `undefined` when it names none. */
export function shapePreset(shape: Json | undefined): ShapePreset | undefined {
  const preset = asObject(shape).preset;
  return isPreset(preset) ? preset : undefined;
}

const isBox = (value: Json | undefined): value is PixelBox =>
  Array.isArray(value) && value.length === 6 && value.every((entry) => typeof entry === 'number');

/** The well-formed boxes written in a shape's `boxes`. */
export function writtenBoxes(shape: Json | undefined): PixelBox[] {
  const boxes = asObject(shape).boxes;
  return Array.isArray(boxes) ? boxes.filter(isBox).map((box) => [...box] as PixelBox) : [];
}

/**
 * The boxes a shape lowers to, for the preview: a preset's own boxes (except `custom`), else
 * the written boxes, else the full cube.
 */
export function effectiveBoxes(shape: Json | undefined): PixelBox[] {
  const preset = shapePreset(shape);
  if (preset !== undefined && preset !== 'custom') {
    return SHAPE_PRESET_BOXES[preset].map((box) => [...box] as PixelBox);
  }
  const written = writtenBoxes(shape);
  return written.length > 0 ? written : [[...FULL_CUBE] as PixelBox];
}

/** Whether `boxes` fill the whole block (one box equal to the full cube). */
export function isFullCube(boxes: readonly PixelBox[]): boolean {
  const [only] = boxes;
  return (
    boxes.length === 1 && only !== undefined && only.every((value, i) => value === FULL_CUBE[i])
  );
}

/** Whether a block with this shape is walk-through (`collision` false; `cross` by default). */
export function isWalkThrough(shape: Json | undefined): boolean {
  const object = asObject(shape);
  if (typeof object.collision === 'boolean') return !object.collision;
  return shapePreset(shape) === 'cross';
}

/** What "From model" found: boxes to write as `custom`, or why there are none. */
export type ShapeFromModel =
  | { ok: true; boxes: PixelBox[]; walkThrough: boolean; source: string }
  | { ok: false; reason: string };

/** Vanilla model families "From model" knows besides the cubes (ADR 0059 D2). */
const VANILLA_SHAPES: Readonly<Record<string, { preset: Exclude<ShapePreset, 'custom'> }>> =
  Object.freeze({
    'block/slab': { preset: 'slab_bottom' },
    'block/slab_top': { preset: 'slab_top' },
    'block/carpet': { preset: 'carpet' },
    'block/cross': { preset: 'cross' },
    'block/tinted_cross': { preset: 'cross' },
  });

/**
 * The family of a vanilla block model path: the family models themselves, and by the game's
 * naming the models made from them (`block/oak_slab`, `block/oak_slab_top`,
 * `block/white_carpet`).
 */
function vanillaFamily(path: string): { preset: Exclude<ShapePreset, 'custom'> } | undefined {
  const own = VANILLA_SHAPES[path];
  if (own !== undefined) return own;
  if (!path.startsWith('block/')) return undefined;
  if (path.endsWith('_slab_top')) return { preset: 'slab_top' };
  if (path.endsWith('_slab')) return { preset: 'slab_bottom' };
  if (path.endsWith('_carpet')) return { preset: 'carpet' };
  return undefined;
}

const namespacedModel = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

const clampPixel = (value: number): number => Math.min(16, Math.max(0, value));

/** The boxes of a model's `elements` (`from`, `to`), clamped to the block; flat ones dropped. */
function elementBoxes(elements: readonly Json[]): PixelBox[] {
  const boxes: PixelBox[] = [];
  for (const entry of elements) {
    const { from, to } = asObject(entry);
    if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 3 || to.length !== 3)
      continue;
    const a = from.map((value) => (typeof value === 'number' ? clampPixel(value) : Number.NaN));
    const b = to.map((value) => (typeof value === 'number' ? clampPixel(value) : Number.NaN));
    if ([...a, ...b].some(Number.isNaN)) continue;
    const low = a.map((value, i) => Math.min(value, b[i] as number));
    const high = a.map((value, i) => Math.max(value, b[i] as number));
    if (low.some((value, i) => value === high[i])) continue;
    boxes.push([...low, ...high] as PixelBox);
  }
  return boxes;
}

/**
 * The shape of block model `model` (ADR 0059 D2): the boxes of the first model with its own
 * `elements`, following project parents, or the boxes of a known vanilla family (the `cube*`
 * and `orientable*` models, `slab`, `slab_top`, `carpet`, `cross`, `tinted_cross`, and models
 * named `*_slab`, `*_slab_top`, `*_carpet`; a cross is walk-through). Other vanilla models are
 * not read (their files stay in the extraction cache).
 *
 * @param project - The project, for its `minecraft:model` elements.
 * @param model - The block's model id.
 */
export function shapeFromModel(project: Project, model: string): ShapeFromModel {
  if (model.trim() === '') return { ok: false, reason: 'The block has no model.' };
  const seen = new Set<string>();
  let current = namespacedModel(model);
  for (;;) {
    if (seen.has(current)) {
      return { ok: false, reason: `The model "${model}" has a parent loop.` };
    }
    seen.add(current);
    const own = findElement(project, current, MODEL_KIND);
    if (own === undefined) break;
    const data = asObject(own.data);
    if (Array.isArray(data.elements) && data.elements.length > 0) {
      const boxes = elementBoxes(data.elements);
      if (boxes.length === 0) {
        return { ok: false, reason: `The elements of "${current}" have no volume.` };
      }
      if (boxes.length > MAX_SHAPE_BOXES) {
        return {
          ok: false,
          reason: `"${current}" has ${boxes.length} boxes; a shape holds at most ${MAX_SHAPE_BOXES}.`,
        };
      }
      return { ok: true, boxes, walkThrough: false, source: current };
    }
    if (typeof data.parent !== 'string' || data.parent === '') {
      return { ok: false, reason: `"${current}" has no elements and no parent.` };
    }
    current = namespacedModel(data.parent);
  }
  const path = current.startsWith('minecraft:') ? current.slice('minecraft:'.length) : undefined;
  const family = path === undefined ? undefined : vanillaFamily(path);
  if (family !== undefined) {
    return {
      ok: true,
      boxes: SHAPE_PRESET_BOXES[family.preset].map((box) => [...box] as PixelBox),
      walkThrough: family.preset === 'cross',
      source: current,
    };
  }
  if (path !== undefined && isCubeModel(current)) {
    return { ok: true, boxes: [[...FULL_CUBE] as PixelBox], walkThrough: false, source: current };
  }
  return {
    ok: false,
    reason: `"${current}" is not a project model, a cube, a slab, a carpet or a cross, so its shape cannot be read.`,
  };
}

/**
 * The `msm:shape` object "From model" writes: `custom` with the found boxes, keeping
 * `see_through`; a cross also sets `collision: false`.
 */
export function shapeWithBoxes(
  shape: Json | undefined,
  found: { boxes: PixelBox[]; walkThrough: boolean },
): JsonObject {
  const next: JsonObject = { ...asObject(shape), preset: 'custom', boxes: found.boxes };
  if (found.walkThrough) next.collision = false;
  return next;
}

/**
 * The `msm:shape` object after choosing `preset`: other presets drop written `boxes` (lowering
 * ignores them); `custom` starts from the boxes the shape showed.
 */
export function shapeWithPreset(shape: Json | undefined, preset: ShapePreset): JsonObject {
  const { boxes: _boxes, ...rest } = asObject(shape);
  if (preset === 'custom') return { ...rest, preset, boxes: effectiveBoxes(shape) };
  return { ...rest, preset };
}
