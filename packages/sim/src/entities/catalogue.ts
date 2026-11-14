/**
 * The entity catalogue (B393): the project's mobs as the simulation knows them, read from the
 * lowered files the game would get (ADR 0085 D3): the `msm/<ns>/entity/<path>.json` definitions
 * (ADR 0028 D1) and the `en_us` names. Only what Try it uses is kept: the hitbox, the model's
 * render scale, the movement mode and speeds, and the model, texture and animation ids the view
 * draws with. Everything else a definition holds (goals, attacks, taming, breeding, riding,
 * variants, boss bars, natural spawning) is listed in plain words so the first spawn of
 * the mob can say it works only in Minecraft (ADR 0085 D5, limit L3).
 */
import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import { readJsonFile } from '../blocks/catalogue.js';
import type { SimFiles, SimLog, SimOrigin } from '../types.js';
import { DEFAULT_FLYING_SPEED, DEFAULT_MOVEMENT_SPEED, DEFAULT_STEP_HEIGHT } from './constants.js';

/** How a mob moves (ADR 0070 D3), the format's names. */
export type EntityMovementMode = 'walk' | 'fly' | 'swim' | 'amphibious';

const MOVEMENT_MODES: readonly EntityMovementMode[] = ['walk', 'fly', 'swim', 'amphibious'];

/** The model, texture and animation names the view draws a mob with (`msm:animated_model`). */
export interface EntityModel {
  /** The geo model id, for example `mymod:entity/golem`. */
  readonly model: string;
  /** The texture id, for example `mymod:entity/golem`. */
  readonly texture: string;
  /** The animation set id, when there is one. */
  readonly animations?: string;
  /** The render scale (1 without one). */
  readonly scale: number;
  /** The animation looped while standing. */
  readonly idle?: string;
  /** The animation looped while walking. */
  readonly walk?: string;
  /** The animation looped while moving in the air. */
  readonly fly?: string;
  /** The animation looped while moving in water (never played in the preview). */
  readonly swim?: string;
}

/** One mob the simulation knows. */
export interface CatalogueEntity {
  /** The entity type's resource location. */
  readonly id: string;
  /** Its name in plain words (`en_us`), else one made from its id. */
  readonly displayName: string;
  /** The spawn egg's item id (`<ns>:<path>_spawn_egg`), when the mob has an egg. */
  readonly spawnEgg?: string;
  /** The spawn egg's name in plain words, when the mob has an egg. */
  readonly spawnEggName?: string;
  /** The hitbox width along x and z, in blocks. */
  readonly width: number;
  /** The hitbox height, in blocks. */
  readonly height: number;
  /** How it moves. */
  readonly mode: EntityMovementMode;
  /** The `movement_speed` attribute. */
  readonly speed: number;
  /** The `flying_speed` attribute (flyers). */
  readonly flyingSpeed: number;
  /** Whether a flyer stays in the air when it stops (defaults to true). */
  readonly hovers: boolean;
  /** The highest ledge it walks up. */
  readonly stepHeight: number;
  /** What the view draws it with; absent when the definition has no `msm:animated_model`. */
  readonly model?: EntityModel;
  /** The things the definition asks for that only the game does, in plain words. */
  readonly onlyInMinecraft: readonly string[];
  /** Where log lines about it point. */
  readonly origin: SimOrigin;
}

/** The facts the entity catalogue reads from a target: its folder names. */
export type EntityCatalogueTarget = Pick<TargetFacts, 'folders'>;

const DEFINITION_PATH = /^msm\/([a-z0-9_.-]+)\/entity\/([a-z0-9_./-]+)\.json$/;

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmpty = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const positive = (value: Json | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const atLeastZero = (value: Json | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/** `Ruby Golem` from `mymod:ruby_golem` when the lang file has no name. */
export function plainEntityName(id: string): string {
  const path = id.slice(id.indexOf(':') + 1);
  const last = path.slice(path.lastIndexOf('/') + 1);
  return last
    .split('_')
    .filter((word) => word !== '')
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

/** `a`, `a and b`, `a, b and c`. */
export function plainList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Plain words for the components Try it does not run, in the definition's component order. */
const COMPONENT_WORDS: Readonly<Record<string, string>> = {
  'msm:attack': 'melee attacks',
  'msm:ranged_attack': 'ranged attacks',
  'msm:tameable': 'taming',
  'msm:breedable': 'breeding and babies',
  'msm:rideable': 'riding',
  'msm:variants': 'texture variants',
  'msm:boss_bar': 'boss bar',
};

/**
 * Components Try it uses, or that are about survival and say so when the mob is hit. The event
 * components are the triggers' (B396, `events/triggers.ts`): `msm:on_spawn`, `msm:on_interact`,
 * `msm:on_tick` and `msm:on_death` fire, and `msm:on_hurt` is said when the mob is first hit.
 */
const HANDLED_COMPONENTS = new Set([
  'msm:animated_model',
  'msm:movement',
  'msm:health',
  'msm:on_hurt',
  'msm:on_death',
  'msm:on_interact',
  'msm:on_tick',
  'msm:on_spawn',
]);

/** `ranged_attack` as `ranged attack`. */
const goalWords = (type: string): string => type.replaceAll('_', ' ');

/** The plain-words list of what a definition asks for that only the game does. */
function unhandledFeatures(definition: JsonObject): string[] {
  const out: string[] = [];
  const components = isRecord(definition.components) ? definition.components : {};
  const goals = components['msm:ai_goals'];
  if (isRecord(goals) && Array.isArray(goals.goals)) {
    const list: readonly Json[] = goals.goals;
    const types = list
      .map((goal: Json) => (isRecord(goal) ? nonEmpty(goal.type) : undefined))
      .filter(
        (type: string | undefined): type is string => type !== undefined && type !== 'wander',
      );
    const unique = [...new Set(types)];
    if (unique.length > 0) out.push(`goals (${unique.map(goalWords).join(', ')})`);
  }
  for (const key of Object.keys(components)) {
    if (key === 'msm:ai_goals' || HANDLED_COMPONENTS.has(key)) continue;
    out.push(COMPONENT_WORDS[key] ?? `${key} component`);
  }
  if (isRecord(definition.spawn)) out.push('natural spawning');
  return out;
}

function movementOf(definition: JsonObject): {
  mode: EntityMovementMode;
  unknownMode?: string;
  speed: number;
  flyingSpeed: number;
  hovers: boolean;
  stepHeight: number;
} {
  const components = isRecord(definition.components) ? definition.components : {};
  const movement = isRecord(components['msm:movement']) ? components['msm:movement'] : {};
  const rawMode = movement.mode;
  const known = MOVEMENT_MODES.find((mode) => mode === rawMode);
  return {
    mode: known ?? 'walk',
    ...(rawMode !== undefined && known === undefined ? { unknownMode: String(rawMode) } : {}),
    speed: atLeastZero(movement.speed) ?? DEFAULT_MOVEMENT_SPEED,
    flyingSpeed: atLeastZero(movement.flying_speed) ?? DEFAULT_FLYING_SPEED,
    hovers: movement.hovers !== false,
    stepHeight: atLeastZero(movement.step_height) ?? DEFAULT_STEP_HEIGHT,
  };
}

function modelOf(definition: JsonObject): EntityModel | undefined {
  const components = isRecord(definition.components) ? definition.components : {};
  const raw = components['msm:animated_model'];
  if (!isRecord(raw)) return undefined;
  const model = nonEmpty(raw.model);
  const texture = nonEmpty(raw.texture);
  if (model === undefined || texture === undefined) return undefined;
  const optional = (key: 'animations' | 'idle' | 'walk' | 'fly' | 'swim') => {
    const value = nonEmpty(raw[key]);
    return value === undefined ? {} : { [key]: value };
  };
  return Object.freeze({
    model,
    texture,
    scale: positive(raw.scale) ?? 1,
    ...optional('animations'),
    ...optional('idle'),
    ...optional('walk'),
    ...optional('fly'),
    ...optional('swim'),
  });
}

/** The project's mobs, by entity type id. */
export class EntityCatalogue {
  private readonly entities = new Map<string, CatalogueEntity>();
  private readonly eggs = new Map<string, string>();
  private readonly said = new Set<string>();
  private readonly log: SimLog;

  constructor(log: SimLog) {
    this.log = log;
  }

  /** Adds a mob (used by {@link buildEntityCatalogue}). */
  add(entity: CatalogueEntity): void {
    this.entities.set(entity.id, entity);
    if (entity.spawnEgg !== undefined) this.eggs.set(entity.spawnEgg, entity.id);
  }

  /** Every mob's id, sorted. */
  ids(): string[] {
    return [...this.entities.keys()].sort();
  }

  /** A mob by its entity type id. */
  get(id: string): CatalogueEntity | undefined {
    return this.entities.get(id);
  }

  /** The mob a spawn egg item hatches, by the egg's item id. */
  entityForEgg(itemId: string): CatalogueEntity | undefined {
    const id = this.eggs.get(itemId);
    return id === undefined ? undefined : this.entities.get(id);
  }

  /** Writes an "Only in Minecraft" line once per key for the catalogue's life. */
  sayOnce(key: string, what: string, origin?: SimOrigin): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.log.onlyInMinecraft(what, origin);
  }
}

/**
 * Builds the catalogue of a project's mobs from its lowered files. A definition that cannot be
 * read is left out with one "Only in Minecraft" line; an unknown movement mode walks, with a line.
 *
 * @param files - The lowered output files by path (ADR 0085 D3).
 * @param target - The target they were lowered for (the language folder's name).
 * @param log - Where "Only in Minecraft" lines go.
 */
export function buildEntityCatalogue(
  files: SimFiles,
  target: EntityCatalogueTarget,
  log: SimLog,
): EntityCatalogue {
  const catalogue = new EntityCatalogue(log);
  const langFolder = target.folders.resource.lang;
  const langs = new Map<string, JsonObject>();
  const langOf = (namespace: string): JsonObject => {
    let lang = langs.get(namespace);
    if (lang === undefined) {
      const json = readJsonFile(files, `assets/${namespace}/${langFolder}/en_us.json`);
      lang = isRecord(json) ? json : {};
      langs.set(namespace, lang);
    }
    return lang;
  };

  const paths = [...files.keys()].filter((path) => DEFINITION_PATH.test(path)).sort();
  for (const path of paths) {
    const match = DEFINITION_PATH.exec(path) as RegExpExecArray;
    const namespace = match[1] as string;
    const entityPath = match[2] as string;
    const id = `${namespace}:${entityPath}`;
    const dotted = entityPath.replaceAll('/', '.');
    const lang = langOf(namespace);
    const displayName = nonEmpty(lang[`entity.${namespace}.${dotted}`]) ?? plainEntityName(id);
    const origin: SimOrigin = { elementId: id };
    const definition = readJsonFile(files, path);
    const size = isRecord(definition) && isRecord(definition.size) ? definition.size : undefined;
    const width = positive(size?.width);
    const height = positive(size?.height);
    if (!isRecord(definition) || width === undefined || height === undefined) {
      catalogue.sayOnce(
        `unreadable:${id}`,
        `${displayName} has a definition the preview cannot read; it is left out of the preview`,
        origin,
      );
      continue;
    }
    const movement = movementOf(definition);
    if (movement.unknownMode !== undefined) {
      catalogue.sayOnce(
        `mode:${id}`,
        `${displayName} moves in a way the preview does not know (${movement.unknownMode}); here it walks`,
        { ...origin, pointer: '/components/msm:movement/mode' },
      );
    }
    const egg = definition.spawn_egg;
    const hasEgg = egg === undefined || isRecord(egg);
    const eggPath = `${entityPath}_spawn_egg`;
    const model = modelOf(definition);
    catalogue.add(
      Object.freeze({
        id,
        displayName,
        ...(hasEgg
          ? {
              spawnEgg: `${namespace}:${eggPath}`,
              spawnEggName:
                nonEmpty(lang[`item.${namespace}.${eggPath.replaceAll('/', '.')}`]) ??
                `${displayName} Spawn Egg`,
            }
          : {}),
        width,
        height,
        mode: movement.mode,
        speed: movement.speed,
        flyingSpeed: movement.flyingSpeed,
        hovers: movement.hovers,
        stepHeight: movement.stepHeight,
        ...(model === undefined ? {} : { model }),
        onlyInMinecraft: Object.freeze(unhandledFeatures(definition)),
        origin,
      }),
    );
  }
  return catalogue;
}
