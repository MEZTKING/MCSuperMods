/**
 * The block catalogue (B387): what the simulation knows about each block, read from the lowered
 * files the game would get (ADR 0085 D3): the `msm/<ns>/block/<path>.json` definition, the
 * block state definition, the `en_us` names and the vanilla tags lowering writes. Folder names
 * come from the target (golden rule); the set type and wood type names a block may take are
 * checked against `TargetFacts.blocks`.
 *
 * A block whose definition cannot be read, a vanilla block (`minecraft:`) and a block of an
 * unknown type are props (ADR 0085 L10): drawn, solid as a full cube, breakable, nothing more,
 * each with one "Only in Minecraft" line.
 */
import { parseJson, utf8 } from '@msm/core';
import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import type { BlockShapes, BlockState, Box, SimFiles, SimLog, SimOrigin } from '../types.js';
import { freezeState, stateKey } from '../world/sim-world.js';
import { HORIZONTALS } from './directions.js';
import {
  collisionBoxes,
  coversTop,
  FULL_CUBE,
  isFullCube,
  outlineBoxes,
  type PixelBox,
  type ShapeFacts,
  supportsCentre,
} from './shapes.js';
import { types2Entries } from './types2/catalogue.js';
import { isType2, type SimBlockType2, type Types2Facts } from './types2/facts.js';
import { types3Entries } from './types3/catalogue.js';
import { isType3, type SimBlockType3, type Types3Facts } from './types3/facts.js';
import { type WeatheringFacts, weatheringOf } from './weathering.js';

/** The block types of the `msm:block` format (ADR 0067, 0068, 0077), in the format's order. */
export const SIM_BLOCK_TYPES = Object.freeze([
  'block',
  'pillar',
  'horizontal',
  'directional',
  'slab',
  'stairs',
  'wall',
  'fence',
  'fence_gate',
  'door',
  'trapdoor',
  'button',
  'pressure_plate',
  'pane',
  'crop',
  'sapling',
  'leaves',
  'portal',
] as const);

/**
 * A block type (with the twenty of vanilla parity 2, B463), or `prop` for a block the simulation
 * only draws (ADR 0085 L10).
 */
export type SimBlockType =
  | (typeof SIM_BLOCK_TYPES)[number]
  | SimBlockType2
  | SimBlockType3
  | 'prop';

/**
 * The set types hands cannot open (ADR 0067 D2: `iron`, and `gold`, which is redstone-only
 * too). MSM's own format names; the names a target accepts are `TargetFacts.blocks.setTypes`.
 */
export const HAND_CLOSED_SET_TYPES: readonly string[] = Object.freeze(['iron', 'gold']);

/**
 * The wooden set types: their buttons stay pressed 30 ticks, the others 20 (the `msm:block`
 * format's `press_ticks` default, ADR 0067 D2).
 */
export const WOODEN_SET_TYPES: readonly string[] = Object.freeze([
  'wood',
  'cherry',
  'bamboo',
  'crimson',
  'warped',
]);

/** A button's press time without `press_ticks`: 30 ticks for wooden set types, else 20. */
export const pressTicksFor = (setType: string): number =>
  WOODEN_SET_TYPES.includes(setType) ? 30 : 20;

/** The `max_age` of a crop without one (the format's default, as wheat). */
export const DEFAULT_CROP_MAX_AGE = 7;

/** The facts the catalogue reads from a target: its folder names and block names. */
export type CatalogueTarget = Pick<TargetFacts, 'id' | 'folders' | 'blocks'>;

/** One block the simulation knows. */
export interface CatalogueBlock extends ShapeFacts {
  /** The block's resource location. */
  readonly id: string;
  /** Its name in plain words (`en_us`), else its id. */
  readonly displayName: string;
  /** The block type, or `prop`. */
  readonly type: SimBlockType;
  /** True for a block the simulation only draws: a vanilla block or one it cannot read. */
  readonly prop: boolean;
  /** Every state property with its values, in name order. */
  readonly properties: Readonly<Record<string, readonly string[]>>;
  /** The state the block starts in. */
  readonly defaultState: BlockState;
  /** A door's, trapdoor's, button's or plate's `set_type`. */
  readonly setType?: string;
  /** A fence gate's `wood_type`. */
  readonly woodType?: string;
  /** Whether a hand opens it: doors and trapdoors by set type, fence gates always. */
  readonly opensByHand: boolean;
  /** A button's press time in ticks. */
  readonly pressTicks?: number;
  /** A weighted plate's entity count for the full signal. */
  readonly weightedMax?: number;
  /** A crop's last age. */
  readonly maxAge?: number;
  /** A crop's or sapling's soil, a block tag or block id. */
  readonly soil?: string;
  /** Whether a fence is wooden (in `#minecraft:wooden_fences`); wooden fences join only wooden ones. */
  readonly woodenFence?: boolean;
  /** Whether the lowered files hold a block state definition for it. */
  readonly hasBlockstate: boolean;
  /** What the twenty types of vanilla parity 2 know beyond the state (B463). */
  readonly types2?: Types2Facts;
  /** What the five types of vanilla parity 3 know beyond the state (B519). */
  readonly types3?: Types3Facts;
  /**
   * A container's storage of vanilla parity 3 (ADR 0104 D4, D5): a double chest's two halves and
   * a store for each player.
   */
  readonly storage?: { readonly double: boolean; readonly perPlayer: boolean };
  /** The block's own sounds (`block_sounds`, ADR 0105 D1), by event: shown as captions. */
  readonly sounds?: BlockSoundFacts;
  /** A door's, trapdoor's, button's or plate's own set type sounds (ADR 0105 D2), by event. */
  readonly setTypeSounds?: Readonly<Record<string, string>>;
  /** Its weathering (`msm:weathering`, B463). */
  readonly weathering?: WeatheringFacts;
  /** Whether players climb it (`#minecraft:climbable` or a climbable type, B463). */
  readonly climbable?: boolean;
  /** A project fluid's liquid block (B483, `fluids/`): no boxes, replaced on placing. */
  readonly liquid?: boolean;
  /** Where log lines about it point. */
  readonly origin: SimOrigin;
}

/** A block's own sounds (`block_sounds`): the sound event of each event given, with volume and pitch. */
export interface BlockSoundFacts {
  readonly events: Readonly<Partial<Record<'break' | 'step' | 'place' | 'hit' | 'fall', string>>>;
  readonly volume?: number;
  readonly pitch?: number;
}

const SOUND_EVENTS = ['break', 'step', 'place', 'hit', 'fall'] as const;

/** The `block_sounds` of a definition, or `undefined` without one (ADR 0105 D1). */
export function blockSoundsOf(definition: JsonObject): BlockSoundFacts | undefined {
  const sounds = definition.block_sounds;
  if (!isRecord(sounds)) return undefined;
  const events: Partial<Record<(typeof SOUND_EVENTS)[number], string>> = {};
  for (const event of SOUND_EVENTS) {
    const id = nonEmpty(sounds[event]);
    if (id !== undefined) events[event] = id;
  }
  return Object.freeze({
    events: Object.freeze(events),
    ...(typeof sounds.volume === 'number' ? { volume: sounds.volume } : {}),
    ...(typeof sounds.pitch === 'number' ? { pitch: sounds.pitch } : {}),
  });
}

/**
 * A `set_type` as the catalogue reads it (ADR 0105 D2): a vanilla name, or an own set type object
 * whose `base` (default `wood`) gives the rest. `undefined` when absent or not readable.
 */
export function setTypeOf(value: Json | undefined):
  | {
      readonly base: string;
      readonly canOpenByHand?: boolean;
      readonly sounds?: Readonly<Record<string, string>>;
    }
  | undefined {
  const name = nonEmpty(value);
  if (name !== undefined) return { base: name };
  if (!isRecord(value)) return undefined;
  const sounds: Record<string, string> = {};
  if (isRecord(value.sounds)) {
    for (const [event, id] of Object.entries(value.sounds)) {
      if (typeof id === 'string' && id !== '') sounds[event] = id;
    }
  }
  return {
    base: nonEmpty(value.base) ?? 'wood',
    ...(typeof value.can_open_by_hand === 'boolean'
      ? { canOpenByHand: value.can_open_by_hand }
      : {}),
    ...(Object.keys(sounds).length > 0 ? { sounds: Object.freeze(sounds) } : {}),
  };
}

/** A container's double chest and per-player settings, when the definition has a container. */
function storageOf(definition: JsonObject): CatalogueBlock['storage'] {
  const components = isRecord(definition.components) ? definition.components : {};
  const container = components['msm:container'];
  if (!isRecord(container)) return undefined;
  const double = container.double === true;
  const perPlayer = container.per_player === true;
  return double || perPlayer ? Object.freeze({ double, perPlayer }) : undefined;
}

/** Options of {@link buildCatalogue}. */
export interface CatalogueOptions {
  /**
   * Vanilla block state definitions by block id, as text, from the user's client jar (ADR 0011).
   * They give a vanilla prop its properties; without them a prop has none.
   */
  readonly vanillaBlockstates?: ReadonlyMap<string, string>;
  /**
   * Vanilla ids that get no "prop for looks only" line of their own: the blocks of a loaded
   * ground (B405), which the local source sums up in one line instead.
   */
  readonly quietProps?: (id: string) => boolean;
}

/**
 * Liquids, drawn as see-through props that nothing collides with or points at (B405; physics
 * is out of scope, limit L7). Their ids have been the same in every version MSM targets.
 */
export const LIQUID_PROP_IDS: ReadonlySet<string> = new Set([
  'minecraft:water',
  'minecraft:lava',
  'minecraft:bubble_column',
]);

const NO_BOXES: readonly Box[] = Object.freeze([]);

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmpty = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** Reads a lowered file as JSON; `undefined` when absent or not JSON. */
export function readJsonFile(files: SimFiles, path: string): Json | undefined {
  const raw = files.get(path);
  if (raw === undefined) return undefined;
  try {
    return parseJson(typeof raw === 'string' ? raw : utf8.decode(raw));
  } catch {
    return undefined;
  }
}

/** A property's values in a fixed order. */
type PropertyTable = Record<string, { values: readonly string[]; fallback: string }>;

const BOOL = ['false', 'true'] as const;
const bool = (fallback: 'false' | 'true' = 'false') => ({ values: BOOL, fallback });
const facing4 = { values: HORIZONTALS, fallback: 'north' };
const range = (last: number) => Array.from({ length: last + 1 }, (_, i) => String(i));

/** The properties a block state definition names, with the values it names for each. */
export function blockstateProperties(blockstate: Json | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (name: string, value: string): void => {
    const values = out.get(name) ?? [];
    if (!values.includes(value)) values.push(value);
    out.set(name, values);
  };
  if (!isRecord(blockstate)) return out;
  if (isRecord(blockstate.variants)) {
    for (const key of Object.keys(blockstate.variants)) {
      for (const pair of key.split(',')) {
        const equals = pair.indexOf('=');
        if (equals > 0) add(pair.slice(0, equals), pair.slice(equals + 1));
      }
    }
  }
  const readWhen = (when: Json | undefined): void => {
    if (!isRecord(when)) return;
    for (const [name, value] of Object.entries(when)) {
      if (name === 'OR' || name === 'AND') {
        if (Array.isArray(value)) for (const inner of value) readWhen(inner);
      } else if (typeof value === 'string') {
        for (const one of value.split('|')) add(name, one);
      } else if (typeof value === 'boolean' || typeof value === 'number') {
        add(name, String(value));
      }
    }
  };
  if (Array.isArray(blockstate.multipart)) {
    for (const part of blockstate.multipart) if (isRecord(part)) readWhen(part.when);
  }
  return out;
}

/** The properties of a block type, from its definition (the runtime's state definition). */
function typeProperties(type: SimBlockType, definition: JsonObject): PropertyTable {
  const side = (fallback: string, values: readonly string[]) => ({ values, fallback });
  switch (type) {
    case 'block':
    case 'pillar':
    case 'horizontal':
    case 'directional': {
      const table: PropertyTable = {};
      if (type === 'pillar') table.axis = { values: ['x', 'y', 'z'], fallback: 'y' };
      if (type === 'horizontal') table.facing = facing4;
      if (type === 'directional') {
        table.facing = {
          values: ['down', 'up', 'north', 'south', 'west', 'east'],
          fallback: 'north',
        };
      }
      const components = isRecord(definition.components) ? definition.components : {};
      const redstone = components['msm:redstone'];
      if (
        isRecord(redstone) &&
        (redstone.on_powered !== undefined || redstone.on_unpowered !== undefined)
      ) {
        table.powered = bool();
      }
      const container = components['msm:container'];
      if (isRecord(components['msm:machine'])) table.lit = bool();
      else if (isRecord(container) && container.double === true) {
        // A double chest is vanilla's chest family (B513): it faces four ways, has its halves
        // and always holds water, but no `open`.
        table.facing = facing4;
        table.type = { values: ['single', 'left', 'right'], fallback: 'single' };
        table.waterlogged = bool();
      } else if (isRecord(container)) table.open = bool();
      return table;
    }
    case 'slab':
      return { type: { values: ['bottom', 'top', 'double'], fallback: 'bottom' } };
    case 'stairs':
      return {
        facing: facing4,
        half: { values: ['bottom', 'top'], fallback: 'bottom' },
        shape: {
          values: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'],
          fallback: 'straight',
        },
      };
    case 'wall': {
      const table: PropertyTable = { up: bool('true') };
      for (const name of HORIZONTALS) table[name] = side('none', ['none', 'low', 'tall']);
      return table;
    }
    case 'fence':
    case 'pane': {
      const table: PropertyTable = {};
      for (const name of HORIZONTALS) table[name] = bool();
      return table;
    }
    case 'fence_gate':
      return { facing: facing4, in_wall: bool(), open: bool() };
    case 'door':
      return {
        facing: facing4,
        half: { values: ['lower', 'upper'], fallback: 'lower' },
        hinge: { values: ['left', 'right'], fallback: 'left' },
        open: bool(),
      };
    case 'trapdoor':
      return {
        facing: facing4,
        half: { values: ['bottom', 'top'], fallback: 'bottom' },
        open: bool(),
      };
    case 'button':
      return {
        face: { values: ['floor', 'wall', 'ceiling'], fallback: 'wall' },
        facing: facing4,
        powered: bool(),
      };
    case 'pressure_plate':
      return definition.weighted_max !== undefined
        ? { power: { values: range(15), fallback: '0' } }
        : { powered: bool() };
    case 'crop':
      return { age: { values: range(cropMaxAge(definition)), fallback: '0' } };
    case 'sapling':
      // `stage` changes no picture (the lowered block state has one variant), but growth
      // steps it (B391), as the game does.
      return { stage: { values: ['0', '1'], fallback: '0' } };
    case 'portal':
      return { axis: { values: ['x', 'z'], fallback: 'x' } };
    default:
      return {};
  }
}

function cropMaxAge(definition: JsonObject): number {
  const age = definition.max_age;
  return typeof age === 'number' && Number.isInteger(age) && age >= 1 && age <= 15
    ? age
    : DEFAULT_CROP_MAX_AGE;
}

/** A crop's outline height per age: `stage_heights`, else `2 + 14 * age / max_age` rounded. */
function stageHeights(definition: JsonObject, maxAge: number): number[] {
  const given = definition.stage_heights;
  return range(maxAge).map((_, age) => {
    const value = Array.isArray(given) ? given[age] : undefined;
    return typeof value === 'number' && value >= 1 && value <= 16
      ? value
      : Math.round(2 + (14 * age) / maxAge);
  });
}

/** `msm:shape` boxes in pixels, when the definition has the component. */
function shapeOf(definition: JsonObject): { boxes: PixelBox[]; collision: boolean } | undefined {
  const components = isRecord(definition.components) ? definition.components : undefined;
  const shape = components?.['msm:shape'];
  if (!isRecord(shape)) return undefined;
  const boxes: PixelBox[] = [];
  if (Array.isArray(shape.boxes)) {
    for (const box of shape.boxes) {
      if (
        Array.isArray(box) &&
        box.length === 6 &&
        box.every((n) => typeof n === 'number' && Number.isFinite(n))
      ) {
        boxes.push(box as unknown as PixelBox);
      }
    }
  }
  if (boxes.length === 0) boxes.push([0, 0, 0, 16, 16, 16]);
  return { boxes, collision: shape.collision !== false };
}

/** Merges the type's properties with the ones the block state definition names. */
export function mergeProperties(
  table: PropertyTable,
  fromBlockstate: Map<string, string[]>,
): { properties: Record<string, readonly string[]>; defaults: Record<string, string> } {
  const properties: Record<string, readonly string[]> = {};
  const defaults: Record<string, string> = {};
  for (const [name, { values, fallback }] of Object.entries(table)) {
    properties[name] = Object.freeze([...values]);
    defaults[name] = fallback;
  }
  for (const [name, values] of fromBlockstate) {
    if (properties[name] !== undefined) continue;
    properties[name] = Object.freeze([...values]);
    defaults[name] = values.includes('false') ? 'false' : (values[0] as string);
  }
  const sorted: Record<string, readonly string[]> = {};
  for (const name of Object.keys(properties).sort()) sorted[name] = properties[name] as string[];
  return { properties: Object.freeze(sorted), defaults };
}

/** `Ruby Block` from `mymod:ruby_block` when the lang file has no name. */
function plainName(id: string): string {
  const path = id.slice(id.indexOf(':') + 1);
  const last = path.slice(path.lastIndexOf('/') + 1);
  return last
    .split('_')
    .filter((word) => word !== '')
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

const DEFINITION_PATH = /^msm\/([a-z0-9_.-]+)\/block\/(.+)\.json$/;

/**
 * Everything the simulation knows about the project's blocks, and the {@link BlockShapes} the
 * player collides with. Build it with {@link buildCatalogue}.
 */
export class BlockCatalogue implements BlockShapes {
  private readonly blocks = new Map<string, CatalogueBlock>();
  private readonly projectIds: string[] = [];
  private readonly said = new Set<string>();
  private readonly shapeCache = new Map<
    string,
    { collision: readonly Box[]; outline: readonly Box[] }
  >();

  /** The target the files were lowered for. */
  readonly target: CatalogueTarget;
  private readonly files: SimFiles;
  private readonly log: SimLog;
  private readonly options: CatalogueOptions;

  constructor(
    target: CatalogueTarget,
    files: SimFiles,
    log: SimLog,
    options: CatalogueOptions = {},
  ) {
    this.target = target;
    this.files = files;
    this.log = log;
    this.options = options;
  }

  /** Adds a project block (used by {@link buildCatalogue}). */
  addProjectBlock(block: CatalogueBlock): void {
    // Companions (a wall torch, an attached stem, B463) are blocks but not offered on their own.
    if (
      !this.blocks.has(block.id) &&
      block.types2?.companion === undefined &&
      block.types3?.companion === undefined
    ) {
      this.projectIds.push(block.id);
    }
    this.blocks.set(block.id, block);
    const companion = block.types3?.companion;
    if (companion?.kind === 'potted' && block.types3?.plant !== undefined) {
      this.potted.set(block.id, Object.freeze({ pot: companion.of, plant: block.types3.plant }));
    }
  }

  private readonly potted = new Map<string, { readonly pot: string; readonly plant: string }>();

  /** Records that `block` is `plant` in the project pot `pot` (a `potted_plant` naming it, B519). */
  registerPotted(block: string, pot: string, plant: string): void {
    this.potted.set(block, Object.freeze({ pot, plant }));
  }

  /** The project pot and plant of a potted block in a project pot (B519), else `undefined`. */
  pottedIn(id: string): { readonly pot: string; readonly plant: string } | undefined {
    return this.potted.get(id);
  }

  /** The project's block ids, in path order. */
  ids(): readonly string[] {
    return this.projectIds;
  }

  /** A block the catalogue already knows: a project block or a prop met before. */
  get(id: string): CatalogueBlock | undefined {
    return this.blocks.get(id);
  }

  /**
   * The block for an id: a project block, or a vanilla (`minecraft:`) prop, made on first use
   * with one "Only in Minecraft" line. `undefined` for any other unknown id (another mod's
   * block or one removed from the project).
   */
  blockFor(id: string): CatalogueBlock | undefined {
    const known = this.blocks.get(id);
    if (known !== undefined) return known;
    if (!id.startsWith('minecraft:')) return undefined;
    const text = this.options.vanillaBlockstates?.get(id);
    let blockstate: Json | undefined;
    if (text !== undefined) {
      try {
        blockstate = parseJson(text);
      } catch {
        blockstate = undefined;
      }
    }
    const block = propBlock(id, plainName(id), blockstate);
    this.blocks.set(id, block);
    if (this.options.quietProps?.(id) !== true) {
      this.sayOnce(
        `prop:${id}`,
        `${block.displayName} is a vanilla block; here it is a prop for looks only`,
        block.origin,
      );
    }
    return block;
  }

  /**
   * A state the block can take: unknown properties dropped, missing or invalid ones set to the
   * default (ADR 0085 D4). `null` when the block is unknown ({@link blockFor}).
   */
  normalise(state: BlockState): BlockState | null {
    const block = this.blockFor(state.name);
    if (block === undefined) return null;
    const properties: Record<string, string> = {};
    for (const [name, values] of Object.entries(block.properties)) {
      const value = state.properties[name];
      properties[name] =
        value !== undefined && values.includes(value)
          ? value
          : (block.defaultState.properties[name] as string);
    }
    return freezeState({ name: block.id, properties });
  }

  /** A block's state with some properties changed (values not in its domain are ignored). */
  withProperties(state: BlockState, changes: Readonly<Record<string, string>>): BlockState {
    const block = this.blockFor(state.name);
    const properties: Record<string, string> = { ...state.properties };
    for (const [name, value] of Object.entries(changes)) {
      if (block?.properties[name]?.includes(value) === true) properties[name] = value;
    }
    return freezeState({ name: state.name, properties });
  }

  /** The default state of a block, through {@link blockFor}. */
  defaultState(id: string): BlockState | undefined {
    return this.blockFor(id)?.defaultState;
  }

  private readonly shapeByObject = new WeakMap<
    BlockState,
    { collision: readonly Box[]; outline: readonly Box[] }
  >();

  /**
   * The cached boxes of a state: the same arrays for the same state on every call (the player
   * collides against nearby blocks every tick), by object first and then by state key.
   */
  private shapes(state: BlockState) {
    const byObject = this.shapeByObject.get(state);
    if (byObject !== undefined) return byObject;
    const key = stateKey(state);
    const cached = this.shapeCache.get(key);
    if (cached !== undefined) {
      this.shapeByObject.set(state, cached);
      return cached;
    }
    const block = this.blocks.get(state.name);
    const facts: ShapeFacts = block ?? { type: 'prop' };
    const shapes = this.isLiquid(state)
      ? { collision: NO_BOXES, outline: NO_BOXES }
      : { collision: collisionBoxes(facts, state), outline: outlineBoxes(facts, state) };
    this.shapeCache.set(key, shapes);
    this.shapeByObject.set(state, shapes);
    return shapes;
  }

  /** The boxes the player cannot walk through (a full cube for props and unknown blocks). */
  collision(state: BlockState): readonly Box[] {
    return this.shapes(state).collision;
  }

  /** The boxes a pointing ray hits. */
  outline(state: BlockState): readonly Box[] {
    return this.shapes(state).outline;
  }

  /**
   * Whether the state is a liquid: a liquid prop ({@link LIQUID_PROP_IDS}) or a project fluid's
   * block (B483). No boxes; replaced on placing.
   */
  isLiquid(state: BlockState): boolean {
    const block = this.blocks.get(state.name);
    if (block?.liquid === true) return true;
    return LIQUID_PROP_IDS.has(state.name) && block?.prop !== false;
  }

  /** Whether the block is a solid full cube, as fences, walls and panes connect to. */
  isSolidCube(state: BlockState): boolean {
    const block = this.blocks.get(state.name);
    if (block?.type === 'leaves') return false;
    return isFullCube(this.collision(state));
  }

  /** Whether something can stand on the block's top face (doors need it below). */
  hasSturdyTop(state: BlockState): boolean {
    return coversTop(this.collision(state));
  }

  /** Whether the block's middle reaches its top (a plate can rest on it, as on a fence post). */
  supportsCentre(state: BlockState): boolean {
    return supportsCentre(this.collision(state));
  }

  /** Writes an "Only in Minecraft" line once per key for the catalogue's life. */
  sayOnce(key: string, what: string, origin?: SimOrigin): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.log.onlyInMinecraft(what, origin);
  }

  /** The lowered files the catalogue was built from. */
  get sourceFiles(): SimFiles {
    return this.files;
  }
}

function propBlock(id: string, displayName: string, blockstate: Json | undefined): CatalogueBlock {
  const { properties, defaults } = mergeProperties({}, blockstateProperties(blockstate));
  return Object.freeze({
    id,
    displayName,
    type: 'prop',
    prop: true,
    properties,
    defaultState: freezeState({ name: id, properties: defaults }),
    opensByHand: false,
    hasBlockstate: blockstate !== undefined,
    origin: { elementId: id },
  });
}

/** The ids a tag file lists (strings or `{ id }` entries). */
function tagValues(json: Json | undefined): string[] {
  if (!isRecord(json) || !Array.isArray(json.values)) return [];
  return json.values.flatMap((value: Json) => {
    if (typeof value === 'string') return [value];
    if (isRecord(value) && typeof value.id === 'string') return [value.id];
    return [];
  });
}

/**
 * Builds the catalogue of a project's blocks from its lowered files.
 *
 * @param files - The lowered output files by path (ADR 0085 D3).
 * @param target - The target they were lowered for (folder names, set and wood type names).
 * @param log - Where "Only in Minecraft" lines go.
 * @param options - Vanilla block state definitions for props.
 */
export function buildCatalogue(
  files: SimFiles,
  target: CatalogueTarget,
  log: SimLog,
  options: CatalogueOptions = {},
): BlockCatalogue {
  const catalogue = new BlockCatalogue(target, files, log, options);
  const blockstateFolder = target.folders.resource.block_definition;
  const langFolder = target.folders.resource.lang;
  const tagsFolder = target.folders.data.tags;
  const wooden = new Set(
    tagValues(readJsonFile(files, `data/minecraft/${tagsFolder}/block/wooden_fences.json`)),
  );
  const climbable = new Set(
    tagValues(readJsonFile(files, `data/minecraft/${tagsFolder}/block/climbable.json`)),
  );
  const langs = new Map<string, JsonObject>();
  const nameOf = (id: string, namespace: string, path: string): string => {
    let lang = langs.get(namespace);
    if (lang === undefined) {
      const json = readJsonFile(files, `assets/${namespace}/${langFolder}/en_us.json`);
      lang = isRecord(json) ? json : {};
      langs.set(namespace, lang);
    }
    return nonEmpty(lang[`block.${namespace}.${path.replaceAll('/', '.')}`]) ?? plainName(id);
  };

  const paths = [...files.keys()].filter((path) => DEFINITION_PATH.test(path)).sort();
  // `potted_plant` elements whose `pot` names a project pot go in that pot (ADR 0103 D2, B519).
  const pottedByPot = new Map<string, Map<string, string>>();
  for (const path of paths) {
    const definition = readJsonFile(files, path);
    if (!isRecord(definition) || definition.type !== 'potted_plant') continue;
    const pot = nonEmpty(definition.pot);
    const plant = nonEmpty(definition.plant);
    if (pot === undefined || plant === undefined || pot === 'minecraft:flower_pot') continue;
    const match = DEFINITION_PATH.exec(path) as RegExpExecArray;
    const map = pottedByPot.get(pot) ?? new Map<string, string>();
    if (!map.has(plant)) map.set(plant, `${match[1]}:${match[2]}`);
    pottedByPot.set(pot, map);
  }
  for (const path of paths) {
    const match = DEFINITION_PATH.exec(path) as RegExpExecArray;
    const namespace = match[1] as string;
    const blockPath = match[2] as string;
    const id = `${namespace}:${blockPath}`;
    const displayName = nameOf(id, namespace, blockPath);
    const origin: SimOrigin = { elementId: id };
    const blockstate = readJsonFile(
      files,
      `assets/${namespace}/${blockstateFolder}/${blockPath}.json`,
    );
    const asProp = (why: string): void => {
      const prop = { ...propBlock(id, displayName, blockstate), origin };
      catalogue.addProjectBlock(Object.freeze(prop));
      catalogue.sayOnce(
        `prop:${id}`,
        `${displayName} ${why}; here it is a prop for looks only`,
        origin,
      );
    };
    const definition = readJsonFile(files, path);
    if (!isRecord(definition)) {
      asProp('has a definition the preview cannot read');
      continue;
    }
    const rawType = definition.type ?? 'block';
    const sounds = blockSoundsOf(definition);
    if (typeof rawType === 'string' && isType3(rawType)) {
      // The growing and climbing plants and the project pot of vanilla parity 3 (B519).
      const potted = pottedByPot.get(id);
      for (const entry of types3Entries({
        id,
        displayName,
        type: rawType,
        definition,
        origin,
        blockstateOf: (blockId) =>
          readJsonFile(
            files,
            `assets/${namespace}/${blockstateFolder}/${blockId.slice(namespace.length + 1)}.json`,
          ),
        blockstateProperties,
        merge: mergeProperties,
        climbable: (blockId) => climbable.has(blockId),
        ...(potted === undefined ? {} : { pottedElements: potted }),
      })) {
        catalogue.addProjectBlock(
          sounds === undefined ? entry : Object.freeze({ ...entry, sounds }),
        );
      }
      continue;
    }
    if (typeof rawType === 'string' && isType2(rawType)) {
      // The twenty types of vanilla parity 2 and their companions (B463).
      for (const entry of types2Entries({
        id,
        displayName,
        type: rawType,
        definition,
        origin,
        blockstateOf: (blockId) =>
          readJsonFile(
            files,
            `assets/${namespace}/${blockstateFolder}/${blockId.slice(namespace.length + 1)}.json`,
          ),
        blockstateProperties,
        merge: mergeProperties,
        climbable: (blockId) => climbable.has(blockId),
      })) {
        const weathering = entry.id === id ? weatheringOf(definition) : undefined;
        catalogue.addProjectBlock(
          weathering === undefined && sounds === undefined
            ? entry
            : Object.freeze({
                ...entry,
                ...(weathering === undefined ? {} : { weathering }),
                ...(sounds === undefined ? {} : { sounds }),
              }),
        );
      }
      continue;
    }
    if (typeof rawType !== 'string' || !(SIM_BLOCK_TYPES as readonly string[]).includes(rawType)) {
      asProp(`has a block type the preview does not know (${JSON.stringify(rawType)})`);
      continue;
    }
    const type = rawType as (typeof SIM_BLOCK_TYPES)[number];
    // An own set type object names its `base` (ADR 0105 D2; the B506 note for B519).
    const ownSetType = setTypeOf(definition.set_type);
    const setType = ownSetType?.base;
    const woodType = nonEmpty(definition.wood_type);
    const needsSetType = ['door', 'trapdoor', 'button', 'pressure_plate'].includes(type);
    const knownSetTypes = target.blocks?.setTypes;
    if (
      needsSetType &&
      (setType === undefined || (knownSetTypes !== undefined && !knownSetTypes.includes(setType)))
    ) {
      asProp(`has a set type this game version does not have (${String(setType)})`);
      continue;
    }
    const knownWoodTypes = target.blocks?.woodTypes;
    if (
      type === 'fence_gate' &&
      (woodType === undefined ||
        (knownWoodTypes !== undefined && !knownWoodTypes.includes(woodType)))
    ) {
      asProp(`has a wood type this game version does not have (${String(woodType)})`);
      continue;
    }

    const { properties, defaults } = mergeProperties(
      typeProperties(type, definition),
      blockstateProperties(blockstate),
    );
    // A double chest keeps the chest's own shape and ignores `msm:shape` (B513).
    const shape =
      ['block', 'pillar', 'horizontal', 'directional'].includes(type) &&
      storageOf(definition)?.double !== true
        ? shapeOf(definition)
        : undefined;
    const maxAge = type === 'crop' ? cropMaxAge(definition) : undefined;
    const weighted = definition.weighted_max;
    const pressTicks = definition.press_ticks;
    const weathering = weatheringOf(definition);
    const storage = storageOf(definition);
    const block: CatalogueBlock = {
      id,
      displayName,
      type,
      prop: false,
      properties,
      defaultState: freezeState({ name: id, properties: defaults }),
      opensByHand:
        type === 'fence_gate' ||
        ((type === 'door' || type === 'trapdoor') &&
          setType !== undefined &&
          (ownSetType?.canOpenByHand ?? !HAND_CLOSED_SET_TYPES.includes(setType))),
      hasBlockstate: blockstate !== undefined,
      origin,
      ...(climbable.has(id) ? { climbable: true } : {}),
      ...(weathering === undefined ? {} : { weathering }),
      ...(sounds === undefined ? {} : { sounds }),
      ...(storage === undefined ? {} : { storage }),
      ...(ownSetType?.sounds !== undefined && needsSetType
        ? { setTypeSounds: ownSetType.sounds }
        : {}),
      ...(setType !== undefined && needsSetType ? { setType } : {}),
      ...(woodType !== undefined && type === 'fence_gate' ? { woodType } : {}),
      ...(type === 'button' && setType !== undefined
        ? {
            pressTicks:
              typeof pressTicks === 'number' && Number.isInteger(pressTicks)
                ? pressTicks
                : pressTicksFor(setType),
          }
        : {}),
      ...(type === 'pressure_plate' && typeof weighted === 'number'
        ? { weightedMax: weighted }
        : {}),
      ...(maxAge !== undefined
        ? { maxAge, stageHeights: Object.freeze(stageHeights(definition, maxAge)) }
        : {}),
      ...(type === 'crop' || type === 'sapling'
        ? {
            soil:
              nonEmpty(definition.soil) ??
              (type === 'crop' ? '#minecraft:supports_crops' : '#minecraft:supports_vegetation'),
          }
        : {}),
      ...(type === 'fence' ? { woodenFence: wooden.has(id) } : {}),
      ...(shape !== undefined
        ? { shapeBoxes: Object.freeze(shape.boxes), shapeCollision: shape.collision }
        : {}),
    };
    catalogue.addProjectBlock(Object.freeze(block));
  }
  for (const [pot, map] of pottedByPot) {
    if (catalogue.get(pot)?.types3?.pot === undefined) continue;
    for (const [plant, potted] of map) catalogue.registerPotted(potted, pot, plant);
  }
  return catalogue;
}

/** The full cube, for callers that need the prop shape. */
export const PROP_SHAPE: readonly Box[] = Object.freeze([FULL_CUBE]);
