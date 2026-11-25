/**
 * The Rules catalogue (ADR 0082 D4, D5): every trigger, step, condition, value, place and "who"
 * of rule book format 1, with plain words, sentence templates and slot types, and lookups by id.
 */
import { CONDITIONS } from './conditions';
import { STEPS } from './steps';
import { TRIGGERS } from './triggers';
import type {
  ConditionEntry,
  PlaceEntry,
  StepEntry,
  TriggerEntry,
  ValueEntry,
  WhoEntry,
} from './types';
import { PLACES, VALUES, WHO } from './values';

export { CONDITIONS } from './conditions';
export { STEPS } from './steps';
export {
  AREA_KIND,
  BLOCK_KIND,
  COMMAND_KIND,
  EFFECT_KIND,
  ENTITY_KIND,
  GAME_KIND,
  ITEM_KIND,
  KEY_BIND_KIND,
  KIT_KIND,
  OBJECTIVE_KIND,
  ONE_BLOCK_KIND,
  TEAM_KIND,
  TIMER_KIND,
  TRIGGERS,
  VEHICLE_KIND,
} from './triggers';
export type * from './types';
export { PLACES, VALUES, WHO } from './values';

const byId = <T extends { id: string }>(entries: readonly T[]): ReadonlyMap<string, T> =>
  new Map(entries.map((entry) => [entry.id, entry]));

const TRIGGER_BY_ID = byId(TRIGGERS);
const STEP_BY_ID = byId(STEPS);
const CONDITION_BY_ID = byId(CONDITIONS);
const VALUE_BY_ID = byId(VALUES);
const PLACE_BY_ID = byId(PLACES);
const WHO_BY_ID = byId(WHO);

/** The trigger with `id`, or undefined. */
export const triggerById = (id: string): TriggerEntry | undefined => TRIGGER_BY_ID.get(id);
/** The step with `id`, or undefined. */
export const stepById = (id: string): StepEntry | undefined => STEP_BY_ID.get(id);
/** The condition with `id`, or undefined. */
export const conditionById = (id: string): ConditionEntry | undefined => CONDITION_BY_ID.get(id);
/** The value reading with `id`, or undefined. */
export const valueById = (id: string): ValueEntry | undefined => VALUE_BY_ID.get(id);
/** The place (named or object kind) with `id`, or undefined. */
export const placeById = (id: string): PlaceEntry | undefined => PLACE_BY_ID.get(id);
/** The "who" (named or `players_nearby`) with `id`, or undefined. */
export const whoById = (id: string): WhoEntry | undefined => WHO_BY_ID.get(id);

/** Every id of the catalogue by section, as the rule book format spells them. */
export const CATALOGUE_IDS = Object.freeze({
  triggers: Object.freeze(TRIGGERS.map((entry) => entry.id)),
  steps: Object.freeze(STEPS.map((entry) => entry.id)),
  conditions: Object.freeze(CONDITIONS.map((entry) => entry.id)),
  values: Object.freeze(VALUES.map((entry) => entry.id)),
  places: Object.freeze(PLACES.map((entry) => entry.id)),
  who: Object.freeze(WHO.map((entry) => entry.id)),
});

/** The maximum nesting of logic steps (ADR 0082 D1). */
export const MAX_DEPTH = 3;
/** The maximum number of steps in a rule, nested ones included (ADR 0082 D1). */
export const MAX_STEPS = 50;
/** The most times `repeat` runs (ADR 0082 D5). */
export const MAX_REPEAT = 100;
/** The largest radius of "for each player nearby" and "every player nearby" (ADR 0082 D5). */
export const MAX_RADIUS = 64;
/** The largest explosion power the Script API takes (Script API 1.4, B370). */
export const MAX_EXPLOSION_POWER = 10;
/** The element kind of HUD elements, which the HUD steps name (ADR 0089 D7). */
export const HUD_KIND = 'msm:hud';
/** The most items one "Drop an item" step drops (Script API 1.4 `World.dropItem`). */
export const MAX_DROP_COUNT = 64;
/** The longest weather a step sets, in seconds (Script API 1.4 `World.setWeather`). */
export const MAX_WEATHER_SECONDS = 1000000;
/** The most choices of one "Pick one at random" (ADR 0115 D1). */
export const MAX_PICK_CHOICES = 16;
/** The heaviest weight of one choice of "Pick one at random". */
export const MAX_PICK_WEIGHT = 1000;
/**
 * The widest world border, in blocks: both targets' `worldborder set` takes up to 59,999,968
 * (the vendored command trees).
 */
export const MAX_WORLD_BORDER = 59999968;
/** The longest world border change, in seconds (a day). */
export const MAX_WORLD_BORDER_SECONDS = 86400;
