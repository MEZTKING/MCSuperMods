/**
 * The situation a loot table, predicate or item modifier is tried in (ADR 0120 D4; B608): the
 * presets in plain words and the fields behind them, which the picker shows under Advanced.
 * Pure: the picker (`SituationPicker.tsx`) draws these, the views turn them into `@msm/sim`'s
 * `Situation` with {@link situationOf}, and the view preferences keep them (`view-prefs.ts`),
 * never the project file.
 *
 * The ids in the presets are sample items and enchantments, not version facts: a target without
 * one answers it as an unknown item, as the game would. Fields are text as typed; a field left
 * empty is left out of the situation (and a condition that asks about it answers "only the game
 * knows").
 */

import {
  type EntitySample,
  type ItemSample,
  SITUATION_PRESETS as SIM_PRESETS,
  type Situation,
} from '@msm/sim';

/** The situation's fields as the picker edits them (text as typed, plus a few switches). */
export interface SituationFields {
  /** A `context_key_set` id (`minecraft:block`, `minecraft:entity`, ...). */
  readonly context: string;
  /** The tool's item id (blocks broken, fishing). */
  readonly tool: string;
  /** The tool's enchantments: `minecraft:fortune 3, minecraft:unbreaking 1`. */
  readonly toolEnchantments: string;
  /** The block's id; empty means the thing the view shows (a block's own table). */
  readonly block: string;
  /** The block's state: `age=7, facing=north`. */
  readonly blockState: string;
  /** The entity's type; empty means the thing the view shows (a mob's own table). */
  readonly entity: string;
  /** The entity's flags, as `entity_properties` names them: `is_on_fire, is_baby`. */
  readonly entityFlags: string;
  /** The killer's type; empty for no killer. */
  readonly killer: string;
  /** Whether the killer is a player. */
  readonly killerIsPlayer: boolean;
  /** The killer's weapon's item id. */
  readonly weapon: string;
  /** The weapon's enchantments, as {@link toolEnchantments}. */
  readonly weaponEnchantments: string;
  /** The damage type id. */
  readonly damage: string;
  /** The weather: `''` (not said), `clear`, `rain` or `thunder`. */
  readonly weather: string;
  /** The clock a `time_check` reads (a `world_clock` id). */
  readonly clock: string;
  /** The time in ticks, as typed. */
  readonly ticks: string;
  readonly dimension: string;
  readonly biome: string;
  /** `x y z`, as typed. */
  readonly position: string;
  /** Luck, as typed. */
  readonly luck: string;
  /** Whether an explosion caused it. */
  readonly explosion: boolean;
  /** The explosion's power, as typed. */
  readonly explosionPower: string;
  /** Whether the explosion thins out the drops (a block's or a creeper's blast does). */
  readonly explosionDecays: boolean;
}

/** Every field empty or off: nothing in the situation but its context. */
export const EMPTY_FIELDS: SituationFields = Object.freeze({
  context: '',
  tool: '',
  toolEnchantments: '',
  block: '',
  blockState: '',
  entity: '',
  entityFlags: '',
  killer: '',
  killerIsPlayer: false,
  weapon: '',
  weaponEnchantments: '',
  damage: '',
  weather: '',
  clock: '',
  ticks: '',
  dimension: '',
  biome: '',
  position: '',
  luck: '',
  explosion: false,
  explosionPower: '',
  explosionDecays: false,
});

/** One preset of the picker: the words shown and the fields it fills. */
export interface PickerPreset {
  readonly id: string;
  /** The words shown (`@msm/sim`'s presets, plain words). */
  readonly label: string;
  readonly fields: SituationFields;
}

const enchantmentText = (enchantments: Readonly<Record<string, number>> | undefined): string =>
  Object.entries(enchantments ?? {})
    .map(([id, level]) => `${id} ${level}`)
    .join(', ');

/** The fields of a situation: what the picker shows under Advanced for it. */
export function fieldsOfSituation(situation: Situation): SituationFields {
  const entity = situation.thisEntity;
  const flags =
    entity !== undefined && typeof entity.flags === 'object' && entity.flags !== null
      ? Object.entries(entity.flags as Record<string, unknown>)
          .filter(([, on]) => on === true)
          .map(([name]) => name)
          .join(', ')
      : '';
  const weather = situation.weather;
  return Object.freeze({
    ...EMPTY_FIELDS,
    context: situation.context,
    tool: situation.tool?.id ?? '',
    toolEnchantments: enchantmentText(situation.tool?.enchantments),
    block: situation.block?.id ?? '',
    blockState: Object.entries(situation.block?.state ?? {})
      .map(([name, value]) => `${name}=${value}`)
      .join(', '),
    entity: entity?.type ?? '',
    entityFlags: flags,
    killer: situation.killer?.type ?? '',
    killerIsPlayer: situation.killer?.player ?? false,
    weapon: situation.killer?.weapon?.id ?? '',
    weaponEnchantments: enchantmentText(situation.killer?.weapon?.enchantments),
    damage: situation.damage?.type ?? '',
    weather:
      weather === undefined
        ? ''
        : weather.thundering
          ? 'thunder'
          : weather.raining
            ? 'rain'
            : 'clear',
    clock: situation.time?.clock ?? '',
    ticks: situation.time === undefined ? '' : String(situation.time.ticks),
    dimension: situation.dimension ?? '',
    biome: situation.biome ?? '',
    position: situation.position?.join(' ') ?? '',
    luck: situation.luck === undefined ? '' : String(situation.luck),
    explosion: situation.explosion !== undefined,
    explosionPower: situation.explosion === undefined ? '' : String(situation.explosion.power),
    explosionDecays: situation.explosion?.decays ?? false,
  });
}

/**
 * The presets, in the order the picker shows them: `@msm/sim`'s (B604), so the picker, Try it
 * and the tests share one list.
 */
export const PICKER_PRESETS: readonly PickerPreset[] = Object.freeze(
  SIM_PRESETS.map((entry) =>
    Object.freeze({ id: entry.id, label: entry.label, fields: fieldsOfSituation(entry.situation) }),
  ),
);

/** The id of a situation whose fields no preset matches. */
export const CUSTOM_SITUATION = 'custom';

/** The context ids the Advanced box suggests (any other id can be typed). */
export const CONTEXT_SUGGESTIONS: readonly string[] = Object.freeze([
  'minecraft:block',
  'minecraft:entity',
  'minecraft:chest',
  'minecraft:fishing',
  'minecraft:gift',
  'minecraft:archaeology',
  'minecraft:empty',
]);

/** A preset by id, or `undefined`. */
export function presetById(id: string): PickerPreset | undefined {
  return PICKER_PRESETS.find((entry) => entry.id === id);
}

/** The presets for some contexts (all of them for none). */
export function presetsFor(contexts?: readonly string[]): readonly PickerPreset[] {
  if (contexts === undefined || contexts.length === 0) return PICKER_PRESETS;
  return PICKER_PRESETS.filter((entry) => contexts.includes(entry.fields.context));
}

/** Whether two sets of fields are the same. */
export function sameFields(a: SituationFields, b: SituationFields): boolean {
  return (Object.keys(EMPTY_FIELDS) as (keyof SituationFields)[]).every((key) => a[key] === b[key]);
}

/** The preset whose fields these are, or {@link CUSTOM_SITUATION}. */
export function presetOf(fields: SituationFields): string {
  return PICKER_PRESETS.find((entry) => sameFields(entry.fields, fields))?.id ?? CUSTOM_SITUATION;
}

/** Stored fields, checked: every field of the right type, anything else the empty value. */
export function readFields(value: unknown): SituationFields | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const out: Record<string, string | boolean> = {};
  for (const [key, empty] of Object.entries(EMPTY_FIELDS)) {
    out[key] = typeof v[key] === typeof empty ? (v[key] as string | boolean) : empty;
  }
  return out as unknown as SituationFields;
}

/** The situation a view uses: the stored fields, else the preset's, else the first preset's. */
export function fieldsOfChoice(
  situation: string,
  stored: SituationFields | null,
  contexts?: readonly string[],
): SituationFields {
  if (stored !== null) return stored;
  const fitting = presetsFor(contexts);
  return (
    fitting.find((entry) => entry.id === situation)?.fields ??
    fitting[0]?.fields ??
    (PICKER_PRESETS[0] as PickerPreset).fields
  );
}

/** `fortune` or `minecraft:fortune` to `minecraft:fortune`; empty stays empty. */
export function fullId(id: string): string {
  const trimmed = id.trim().toLowerCase();
  if (trimmed === '') return '';
  return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`;
}

/** `minecraft:fortune 3, silk_touch` to `{ 'minecraft:fortune': 3, 'minecraft:silk_touch': 1 }`. */
export function parseEnchantments(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of text.split(',')) {
    const [id = '', level = '1'] = part.trim().split(/\s+/);
    const key = fullId(id);
    const number = Number.parseInt(level, 10);
    if (key !== '') out[key] = Number.isFinite(number) && number > 0 ? number : 1;
  }
  return out;
}

/** `age=7, facing=north` to `{ age: '7', facing: 'north' }`. */
export function parseState(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(',')) {
    const [name, value] = part.split('=').map((s) => s.trim());
    if (name !== undefined && name !== '' && value !== undefined && value !== '') out[name] = value;
  }
  return out;
}

/** `is_on_fire, is_baby` to `{ is_on_fire: true, is_baby: true }`. */
export function parseFlags(text: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const part of text.split(',')) {
    const name = part.trim().toLowerCase();
    if (name !== '') out[name] = true;
  }
  return out;
}

const numberOf = (text: string): number | undefined => {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
};

/** `1 64 -3` to a position, or `undefined` unless three numbers were typed. */
export function parsePosition(text: string): readonly [number, number, number] | undefined {
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return undefined;
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

function itemOf(id: string, enchantments: string): ItemSample | undefined {
  const full = fullId(id);
  if (full === '') return undefined;
  const parsed = parseEnchantments(enchantments);
  return Object.keys(parsed).length === 0
    ? { id: full, count: 1 }
    : { id: full, count: 1, enchantments: parsed };
}

/** What the view shows: the block or entity a table or predicate is about. */
export interface SituationSubject {
  /** The block of a block's own table. */
  readonly block?: string;
  /** The entity type of a mob's own table. */
  readonly entity?: string;
}

/**
 * The `@msm/sim` situation of these fields. An empty field is left out. The subject (the thing
 * the view shows) stands in for the block of a block context and the entity of an entity context
 * when the field is empty, or, with `subjectFirst` (a preset, whose block or mob is only a
 * sample), in place of the field's.
 */
export function situationOf(
  fields: SituationFields,
  subject: SituationSubject = {},
  subjectFirst = false,
): Situation {
  const out: {
    -readonly [K in keyof Situation]?: Situation[K];
  } = { context: fullId(fields.context) || 'minecraft:empty' };
  const tool = itemOf(fields.tool, fields.toolEnchantments);
  if (tool !== undefined) out.tool = tool;
  const pick = (field: string, own: string | undefined, context: string): string => {
    const mine = fullId(own ?? '');
    if (mine !== '' && out.context === context && (subjectFirst || fullId(field) === '')) {
      return mine;
    }
    return fullId(field);
  };
  const block = pick(fields.block, subject.block, 'minecraft:block');
  if (block !== '') {
    const state = parseState(fields.blockState);
    out.block = Object.keys(state).length === 0 ? { id: block } : { id: block, state };
  }
  const entity = pick(fields.entity, subject.entity, 'minecraft:entity');
  if (entity !== '') {
    const flags = parseFlags(fields.entityFlags);
    const sample: EntitySample =
      Object.keys(flags).length === 0 ? { type: entity } : { type: entity, flags };
    out.thisEntity = sample;
  }
  const killer = fullId(fields.killer);
  if (killer !== '') {
    const weapon = itemOf(fields.weapon, fields.weaponEnchantments);
    out.killer = {
      type: killer,
      player: fields.killerIsPlayer,
      ...(weapon === undefined ? {} : { weapon }),
    };
    out.directKiller = { type: killer };
  }
  const damage = fullId(fields.damage);
  if (damage !== '') out.damage = { type: damage };
  if (fields.explosion) {
    out.explosion = {
      power: numberOf(fields.explosionPower) ?? 4,
      decays: fields.explosionDecays,
    };
  }
  if (fields.weather === 'clear' || fields.weather === 'rain' || fields.weather === 'thunder') {
    out.weather = { raining: fields.weather !== 'clear', thundering: fields.weather === 'thunder' };
  }
  const ticks = numberOf(fields.ticks);
  const clock = fullId(fields.clock);
  if (ticks !== undefined && clock !== '') out.time = { clock, ticks: Math.round(ticks) };
  const dimension = fullId(fields.dimension);
  if (dimension !== '') out.dimension = dimension;
  const biome = fullId(fields.biome);
  if (biome !== '') out.biome = biome;
  const position = parsePosition(fields.position);
  if (position !== undefined) out.position = position;
  const luck = numberOf(fields.luck);
  if (luck !== undefined) out.luck = luck;
  return out as Situation;
}
