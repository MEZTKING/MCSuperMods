/**
 * The fluid catalogue (B483, ADR 0099 D1, ADR 0101 D5): the project's fluids as Try it knows
 * them, read from the lowered files the game would get (ADR 0085 D3): the definitions
 * `msm/<ns>/fluid/<path>.json`, the liquid block's model (its `still`, `flowing` and `overlay`
 * texture variables, B477) and the `en_us` names. Each fluid is a liquid block under its own id
 * (no boxes, replaced by a block placed into it) and a bucket `<ns>:<path>_bucket` that pours a
 * source of it.
 *
 * The flow numbers keep the runtime's defaults by `behaves_like` (B475): water's 5, 4, 1 and
 * infinite, lava's 30, 2, 2 and not infinite, `none` takes water's; light 0, 15 for lava-like.
 * They are only said out loud: fluids do not flow in the preview (limit Q29).
 *
 * Batch 2 (B540, ADR 0108 as amended after B525): `mixing` rules, the cauldron
 * `<ns>:<path>_cauldron` (three levels with `levels` on a fluid that is not lava-like, else full
 * only) and the bottle `<ns>:<path>_bottle` with its `on_drink`, as the runtime reads them
 * (`FluidDefinition`, B529). Each cauldron joins the block catalogue (`level` 1 to 3 when it has
 * levels); `cauldrons.ts` fills and empties them.
 */
import type { Json, JsonObject, TargetFacts } from '@msm/plugin-api';
import { type BlockCatalogue, type CatalogueBlock, readJsonFile } from '../blocks/catalogue.js';
import { plainEntityName } from '../entities/catalogue.js';
import type { SimFiles, SimOrigin } from '../types.js';
import { freezeState } from '../world/sim-world.js';

/** Which vanilla liquid a fluid behaves like (the format's names). */
export type FluidBehaviour = 'water' | 'lava' | 'none';

/** How a fluid spreads in the game (never in the preview). */
export interface FluidFlow {
  /** Ticks between two flow steps. */
  readonly tickDelay: number;
  /** How far it looks for a way down, in blocks. */
  readonly slopeDistance: number;
  /** Levels lost per block of spreading. */
  readonly dropOff: number;
  /** Whether two sources side by side make a new one. */
  readonly infinite: boolean;
}

/** One mixing rule (ADR 0108 D1): `water`, `lava` or a fluid id, and the blocks it makes. */
export interface MixingRule {
  readonly with: string;
  /** The block a source of the fluid becomes. */
  readonly source?: string;
  /** The block flowing fluid becomes (the preview has no flowing fluid; said). */
  readonly flowing?: string;
}

/** A fluid's cauldron (ADR 0108 D2). */
export interface FluidCauldronSpec {
  /** The block `<ns>:<path>_cauldron`. */
  readonly id: string;
  readonly displayName: string;
  /** Three levels, as water's cauldron (a bottle takes or adds one), or full only as lava's. */
  readonly levels: boolean;
}

/** A fluid's bottle (ADR 0108 D3). */
export interface FluidBottleSpec {
  /** The item `<ns>:<path>_bottle`. */
  readonly id: string;
  readonly name: string;
  /** The event `on_drink` names. */
  readonly onDrink?: string;
  /** Whether it restores hunger (`food`). */
  readonly food: boolean;
  /** How many mob effects it gives. */
  readonly effects: number;
}

/** One project fluid. */
export interface FluidSpec {
  /** The fluid's (and its liquid block's) resource location. */
  readonly id: string;
  /** Its name in plain words (`block.<ns>.<path>`), else one made from its id. */
  readonly displayName: string;
  /** Its bucket's item id, `<ns>:<path>_bucket`. */
  readonly bucket: string;
  /** The bucket's name in plain words. */
  readonly bucketName: string;
  readonly behavesLike: FluidBehaviour;
  readonly flow: FluidFlow;
  /** Light level of the liquid block. */
  readonly light: number;
  /** The RGB tint, when it has one. */
  readonly tint?: number;
  /** The event `on_entity_inside` names, when it has one. */
  readonly onEntityInside?: string;
  /** Its mixing rules, in file order (B540; absent: none). */
  readonly mixing?: readonly MixingRule[];
  /** Its cauldron, when it has one (B540). */
  readonly cauldron?: FluidCauldronSpec;
  /** Its bottle, when it has one (B540). */
  readonly bottle?: FluidBottleSpec;
  /** The texture ids of the liquid block's model, when the model names them. */
  readonly textures: {
    readonly still?: string;
    readonly flowing?: string;
    readonly overlay?: string;
  };
  /** Where log lines about it point. */
  readonly origin: SimOrigin;
}

/** The facts the fluid catalogue reads from a target: its folder names. */
export type FluidsTarget = Pick<TargetFacts, 'folders'>;

const DEFINITION_PATH = /^msm\/([a-z0-9_.-]+)\/fluid\/([a-z0-9_./-]+)\.json$/;

/** The runtime's defaults by `behaves_like` (B475; ADR 0099 D1). */
const FLOW_DEFAULTS: Readonly<Record<FluidBehaviour, FluidFlow>> = {
  water: { tickDelay: 5, slopeDistance: 4, dropOff: 1, infinite: true },
  lava: { tickDelay: 30, slopeDistance: 2, dropOff: 2, infinite: false },
  none: { tickDelay: 5, slopeDistance: 4, dropOff: 1, infinite: true },
};

const isRecord = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmpty = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const whole = (value: Json | undefined, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;

/** A texture variable of a model, `#` references followed. */
function textureOf(textures: JsonObject, key: string, depth = 0): string | undefined {
  const value = nonEmpty(textures[key]);
  if (value === undefined || depth > 4) return undefined;
  return value.startsWith('#') ? textureOf(textures, value.slice(1), depth + 1) : value;
}

/** The project's fluids, by id, and their buckets. */
export class FluidCatalogue {
  private readonly fluids = new Map<string, FluidSpec>();
  private readonly buckets = new Map<string, string>();
  private readonly cauldrons = new Map<string, string>();
  private readonly bottles = new Map<string, string>();

  /** Adds a fluid (used by {@link readFluids}). */
  add(fluid: FluidSpec): void {
    this.fluids.set(fluid.id, fluid);
    this.buckets.set(fluid.bucket, fluid.id);
    if (fluid.cauldron !== undefined) this.cauldrons.set(fluid.cauldron.id, fluid.id);
    if (fluid.bottle !== undefined) this.bottles.set(fluid.bottle.id, fluid.id);
  }

  /** The fluid a cauldron block holds, by the cauldron's id (B540). */
  forCauldron(blockId: string): FluidSpec | undefined {
    const id = this.cauldrons.get(blockId);
    return id === undefined ? undefined : this.fluids.get(id);
  }

  /** The fluid a bottle item holds, by the bottle's id (B540). */
  forBottle(itemId: string): FluidSpec | undefined {
    const id = this.bottles.get(itemId);
    return id === undefined ? undefined : this.fluids.get(id);
  }

  /** Every fluid, in id order. */
  all(): FluidSpec[] {
    return [...this.fluids.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** The number of fluids. */
  get size(): number {
    return this.fluids.size;
  }

  /** A fluid by its id (the liquid block's id). */
  get(id: string): FluidSpec | undefined {
    return this.fluids.get(id);
  }

  /** The fluid a bucket item pours, by the bucket's id. */
  forBucket(itemId: string): FluidSpec | undefined {
    const id = this.buckets.get(itemId);
    return id === undefined ? undefined : this.fluids.get(id);
  }
}

/**
 * Reads the project's fluids from its lowered files. A definition that cannot be read is left
 * out (the block and bucket then do nothing in the preview).
 *
 * @param files - The lowered output files by path (ADR 0085 D3).
 * @param target - The target they were lowered for (folder names).
 */
export function readFluids(files: SimFiles, target: FluidsTarget): FluidCatalogue {
  const catalogue = new FluidCatalogue();
  const resource = target.folders.resource;
  const langs = new Map<string, JsonObject>();
  const langOf = (namespace: string): JsonObject => {
    let lang = langs.get(namespace);
    if (lang === undefined) {
      const json = readJsonFile(files, `assets/${namespace}/${resource.lang}/en_us.json`);
      lang = isRecord(json) ? json : {};
      langs.set(namespace, lang);
    }
    return lang;
  };
  const paths = [...files.keys()].filter((path) => DEFINITION_PATH.test(path)).sort();
  for (const path of paths) {
    const match = DEFINITION_PATH.exec(path) as RegExpExecArray;
    const namespace = match[1] as string;
    const fluidPath = match[2] as string;
    const id = `${namespace}:${fluidPath}`;
    const definition = readJsonFile(files, path);
    if (!isRecord(definition)) continue;
    const lang = langOf(namespace);
    const dotted = fluidPath.replaceAll('/', '.');
    const displayName = nonEmpty(lang[`block.${namespace}.${dotted}`]) ?? plainEntityName(id);
    const bucket = `${id}_bucket`;
    const behavesLike: FluidBehaviour =
      definition.behaves_like === 'lava' || definition.behaves_like === 'none'
        ? definition.behaves_like
        : 'water';
    const defaults = FLOW_DEFAULTS[behavesLike];
    const flow = isRecord(definition.flow) ? definition.flow : {};
    const model = readJsonFile(
      files,
      `assets/${namespace}/${resource.model}/block/${fluidPath}.json`,
    );
    const modelTextures = isRecord(model) && isRecord(model.textures) ? model.textures : {};
    const still = textureOf(modelTextures, 'still');
    const flowing = textureOf(modelTextures, 'flowing');
    const overlay = textureOf(modelTextures, 'overlay');
    const tint = whole(definition.tint, 0, 0xffffff);
    const onEntityInside = nonEmpty(definition.on_entity_inside);
    const mixing: MixingRule[] = [];
    for (const rule of Array.isArray(definition.mixing) ? definition.mixing : []) {
      if (!isRecord(rule)) continue;
      const other = nonEmpty(rule.with);
      const source = nonEmpty(rule.source);
      const flowingBlock = nonEmpty(rule.flowing);
      if (other === undefined || (source === undefined && flowingBlock === undefined)) continue;
      mixing.push(
        Object.freeze({
          with: other,
          ...(source === undefined ? {} : { source }),
          ...(flowingBlock === undefined ? {} : { flowing: flowingBlock }),
        }),
      );
    }
    const cauldronPath = `${fluidPath}_cauldron`;
    const cauldron: FluidCauldronSpec | undefined = isRecord(definition.cauldron)
      ? Object.freeze({
          id: `${namespace}:${cauldronPath}`,
          displayName:
            nonEmpty(lang[`block.${namespace}.${cauldronPath.replaceAll('/', '.')}`]) ??
            `${displayName} Cauldron`,
          levels: definition.cauldron.levels === true && behavesLike !== 'lava',
        })
      : undefined;
    const bottlePath = `${fluidPath}_bottle`;
    const bottleOnDrink = isRecord(definition.bottle)
      ? nonEmpty(definition.bottle.on_drink)
      : undefined;
    const bottle: FluidBottleSpec | undefined = isRecord(definition.bottle)
      ? Object.freeze({
          id: `${namespace}:${bottlePath}`,
          name:
            nonEmpty(lang[`item.${namespace}.${bottlePath.replaceAll('/', '.')}`]) ??
            `Bottle of ${displayName}`,
          ...(bottleOnDrink === undefined ? {} : { onDrink: bottleOnDrink }),
          food: isRecord(definition.bottle.food),
          effects: Array.isArray(definition.bottle.effects) ? definition.bottle.effects.length : 0,
        })
      : undefined;
    catalogue.add(
      Object.freeze({
        id,
        displayName,
        bucket,
        bucketName:
          nonEmpty(lang[`item.${namespace}.${dotted}_bucket`]) ?? `Bucket of ${displayName}`,
        behavesLike,
        flow: Object.freeze({
          tickDelay: whole(flow.tick_delay, 1, 100) ?? defaults.tickDelay,
          slopeDistance: whole(flow.slope_distance, 1, 8) ?? defaults.slopeDistance,
          dropOff: whole(flow.drop_off, 1, 4) ?? defaults.dropOff,
          infinite: typeof flow.infinite === 'boolean' ? flow.infinite : defaults.infinite,
        }),
        light: whole(definition.light, 0, 15) ?? (behavesLike === 'lava' ? 15 : 0),
        ...(tint === undefined ? {} : { tint }),
        ...(onEntityInside === undefined ? {} : { onEntityInside }),
        mixing: Object.freeze(mixing),
        ...(cauldron === undefined ? {} : { cauldron }),
        ...(bottle === undefined ? {} : { bottle }),
        textures: Object.freeze({
          ...(still === undefined ? {} : { still }),
          ...(flowing === undefined ? {} : { flowing }),
          ...(overlay === undefined ? {} : { overlay }),
        }),
        origin: Object.freeze({ elementId: id }),
      }),
    );
  }
  return catalogue;
}

/** The `level` values of a cauldron with levels, as vanilla's water cauldron's. */
export const CAULDRON_LEVELS: readonly string[] = Object.freeze(['1', '2', '3']);

/**
 * Adds each fluid's liquid block to a block catalogue: a liquid (no boxes, replaced by a block
 * placed into it) with no states, since the preview keeps only sources (nothing flows, Q29).
 * A fluid's cauldron (B540) joins as a solid block, with `level` 1 to 3 when it has levels.
 */
export function addFluidBlocks(blocks: BlockCatalogue, fluids: FluidCatalogue): void {
  for (const fluid of fluids.all()) {
    const cauldron = fluid.cauldron;
    if (cauldron !== undefined && blocks.get(cauldron.id) === undefined) {
      const properties: Record<string, readonly string[]> = cauldron.levels
        ? { level: CAULDRON_LEVELS }
        : {};
      blocks.addProjectBlock(
        Object.freeze({
          id: cauldron.id,
          displayName: cauldron.displayName,
          type: 'prop',
          prop: false,
          properties: Object.freeze(properties),
          defaultState: freezeState({
            name: cauldron.id,
            properties: cauldron.levels ? { level: '3' } : {},
          }),
          opensByHand: false,
          hasBlockstate: true,
          origin: fluid.origin,
        } satisfies CatalogueBlock),
      );
    }
    if (blocks.get(fluid.id) !== undefined) continue;
    const block: CatalogueBlock = {
      id: fluid.id,
      displayName: fluid.displayName,
      type: 'prop',
      prop: false,
      properties: {},
      defaultState: freezeState({ name: fluid.id, properties: {} }),
      opensByHand: false,
      hasBlockstate: true,
      liquid: true,
      origin: fluid.origin,
    };
    blocks.addProjectBlock(Object.freeze(block));
  }
}

/** Plain words for how a fluid flows in the game, for the "Only in Minecraft" line. */
export function flowWords(fluid: FluidSpec): string {
  const { flow } = fluid;
  const seconds = flow.tickDelay / 20;
  const reach = Math.max(1, Math.ceil(8 / flow.dropOff) - 1);
  return `spreading a block every ${seconds} second${seconds === 1 ? '' : 's'}, up to ${reach} block${reach === 1 ? '' : 's'} out, finding a way down ${flow.slopeDistance} block${flow.slopeDistance === 1 ? '' : 's'} away${flow.infinite ? ', and two sources side by side make a new one' : ''}`;
}
