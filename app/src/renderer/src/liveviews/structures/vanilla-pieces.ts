/**
 * The renderer's only reader of vanilla structure templates (ADR 0122, Live views 4; B636): by
 * template id (`minecraft:village/plains/houses/plains_small_house_1`), over
 * `platform.minecraft.readStructureTemplates`, the read by id of the user's own jar cache
 * (schema 7, the B634 spike's 4S6). Each template is parsed once, with `@msm/plugin-structures`'
 * NBT reader (the one the structure importer uses), into a {@link PieceTemplate} (the shape of
 * `@msm/terrain`'s `PieceTemplate`, mirrored here because no app source but the terrain worker
 * may import the engine, ADR 0119 D5; a test checks the two agree), and kept per reader; several ids asked together go in as few calls as the channel allows (256
 * ids a call). Without the Minecraft folder set up every call answers `not_set_up` (and the next
 * call asks again, so a cache made meanwhile is seen).
 *
 * The templates come from the user's client jar and stay in the local cache and this reader's
 * memory: nothing here writes them anywhere (no export, no project file, no AI helper context).
 *
 * @packageDocumentation
 */

import { parseBlockState, readNbt, structureTemplateFromNbt } from '@msm/plugin-structures';
import type { VanillaStructureTemplates } from '../../../../shared/platform';

/** Mirrors `JigsawOrientation` in `@msm/terrain`: the side a jigsaw faces, then its top. */
export type JigsawOrientation =
  | 'down_east'
  | 'down_north'
  | 'down_south'
  | 'down_west'
  | 'up_east'
  | 'up_north'
  | 'up_south'
  | 'up_west'
  | 'west_up'
  | 'east_up'
  | 'north_up'
  | 'south_up';

/** Mirrors `JigsawBlock` in `@msm/terrain`: one jigsaw block of a template. */
export interface JigsawBlock {
  readonly pos: readonly [number, number, number];
  readonly orientation: JigsawOrientation;
  readonly name: string;
  readonly target: string;
  readonly pool: string;
  readonly joint: 'rollable' | 'aligned';
  readonly finalState: string;
  readonly selectionPriority: number;
  readonly placementPriority: number;
}

/** Mirrors `TemplateBlock` in `@msm/terrain`: a block as its position and palette index. */
export interface TemplateBlock {
  readonly pos: readonly [number, number, number];
  readonly state: number;
  /** The block entity data as SNBT, where the block has any (a jigsaw's is in `jigsaws`). */
  readonly nbt?: unknown;
}

/** Mirrors `PieceTemplate` in `@msm/terrain`: a parsed template file. */
export interface PieceTemplate {
  readonly id: string;
  readonly size: readonly [number, number, number];
  readonly jigsaws: readonly JigsawBlock[];
  readonly blocks: readonly TemplateBlock[] | null;
  readonly palette: readonly string[];
}

/** The answer of {@link VanillaPieceReader.template}. */
export type VanillaPieceAnswer =
  | { readonly status: 'ready'; readonly id: string; readonly template: PieceTemplate }
  /** The cache is set up and the jar has no such template. */
  | { readonly status: 'missing'; readonly id: string }
  /** The cached file was refused by main, or is not a structure template; `reason` says why. */
  | { readonly status: 'unreadable'; readonly id: string; readonly reason: string }
  | { readonly status: 'not_set_up' };

/** Reads vanilla structure templates by id; see the module comment. */
export interface VanillaPieceReader {
  /** The Minecraft version read, or `null` for the reader that is never set up. */
  readonly mcVersion: string | null;
  /** One template by id (`igloo/top` means `minecraft:igloo/top`). */
  template(id: string): Promise<VanillaPieceAnswer>;
  /** Several templates by id, in one call per 256 of those not read yet; keyed by the namespaced id. */
  templates(ids: readonly string[]): Promise<ReadonlyMap<string, VanillaPieceAnswer>>;
  /**
   * A template already read, synchronously (for the assembler's `templates(id)`): the template,
   * `null` when it is known missing or unreadable, `undefined` when it was not read yet.
   */
  cached(id: string): PieceTemplate | null | undefined;
  /** Drops what was read (after the Minecraft folder changed). */
  forget(): void;
}

/** Reads some templates of a version's cache: `platform.minecraft.readStructureTemplates`. */
export type ReadVanillaStructureTemplates = (
  mcVersion: string,
  ids: readonly string[],
) => Promise<VanillaStructureTemplates | null>;

/** Options of {@link createVanillaPieceReader}. */
export interface VanillaPieceReaderOptions {
  /** The project's Minecraft version (the target's `mcVersion`). */
  readonly mcVersion: string;
  /** Default: the preload bridge's `minecraft.readStructureTemplates` (`window.msm`). */
  readonly read?: ReadVanillaStructureTemplates;
}

/** The most ids one call asks (the channel's limit). */
export const PIECE_IDS_PER_CALL = 256;

/** A vanilla template id's path, as interop and the channel check it. */
const TEMPLATE_PATH = /^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/;

/**
 * The namespaced id of a vanilla template, or `null` when `id` is not one (another namespace, an
 * upper-case letter, a `.` or `..` part).
 */
export function vanillaPieceId(id: string): string | null {
  const path = id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id;
  if (
    path.length === 0 ||
    path.length > 256 ||
    !TEMPLATE_PATH.test(path) ||
    path.split('/').some((part) => /^\.+$/.test(part))
  ) {
    return null;
  }
  return `minecraft:${path}`;
}

const ORIENTATIONS: ReadonlySet<string> = new Set<JigsawOrientation>([
  'down_east',
  'down_north',
  'down_south',
  'down_west',
  'up_east',
  'up_north',
  'up_south',
  'up_west',
  'west_up',
  'east_up',
  'north_up',
  'south_up',
]);

/**
 * Parses a structure template file (gzipped, zlib or plain NBT) into a {@link PieceTemplate}:
 * its size, palette (block-state strings), every block in the file's sorted order (y, z, x) with
 * a block entity's NBT as SNBT, and its jigsaws. A jigsaw's orientation is its block state's
 * `orientation` (`north_up` when absent, the block's default state); a missing `joint` is
 * `aligned` when the jigsaw faces sideways and `rollable` when it faces up or down, as the game
 * reads an older jigsaw; missing priorities are 0. With several random `palettes`, the first.
 *
 * @throws Error When the bytes are not NBT or not a structure template.
 */
export function parsePieceTemplate(id: string, bytes: Uint8Array): PieceTemplate {
  const { root } = readNbt(bytes);
  const { data } = structureTemplateFromNbt(root);
  const entityAt = new Map<string, string>();
  for (const entity of data.block_entities ?? []) entityAt.set(entity.pos.join(','), entity.nbt);
  const blocks: TemplateBlock[] = data.blocks.map(([x, y, z, state]) => {
    const nbt = entityAt.get(`${x},${y},${z}`);
    return nbt === undefined ? { pos: [x, y, z], state } : { pos: [x, y, z], state, nbt };
  });
  const stateAt = new Map<string, number>();
  for (const [x, y, z, state] of data.blocks) stateAt.set(`${x},${y},${z}`, state);
  const jigsaws: JigsawBlock[] = (data.jigsaws ?? []).map((jigsaw) => {
    const state = stateAt.get(jigsaw.pos.join(','));
    const written =
      state === undefined ? undefined : parseBlockState(data.palette[state] ?? '').properties;
    const orientation = (
      written?.orientation !== undefined && ORIENTATIONS.has(written.orientation)
        ? written.orientation
        : 'north_up'
    ) as JigsawOrientation;
    const front = orientation.split('_')[0];
    const joint = jigsaw.joint ?? (front === 'up' || front === 'down' ? 'rollable' : 'aligned');
    return {
      pos: jigsaw.pos,
      orientation,
      name: jigsaw.name,
      target: jigsaw.target,
      pool: jigsaw.pool,
      joint,
      finalState: jigsaw.final_state,
      selectionPriority: jigsaw.selection_priority ?? 0,
      placementPriority: jigsaw.placement_priority ?? 0,
    };
  });
  return { id, size: data.size, palette: data.palette, blocks, jigsaws };
}

/**
 * Reads through the preload bridge. `window.msm` is read here rather than through the session's
 * `bridge()`, so no file under `liveviews/` imports from the session (B601's rule).
 */
const readThroughBridge: ReadVanillaStructureTemplates = (version, ids) => {
  const msm = (window as Partial<Window>).msm;
  const read = msm?.minecraft.readStructureTemplates;
  if (read === undefined) {
    return Promise.reject(new Error('The MSM preload bridge has no structure template read.'));
  }
  return read(version, ids);
};

const NOT_SET_UP = Object.freeze({ status: 'not_set_up' as const });

/** The reader without a Minecraft folder: every call answers `not_set_up`, nothing is asked. */
export const NOT_SET_UP_VANILLA_PIECES: VanillaPieceReader = Object.freeze({
  mcVersion: null,
  template: async () => NOT_SET_UP,
  templates: async (ids: readonly string[]) => new Map(ids.map((id) => [id, NOT_SET_UP])),
  cached: () => undefined,
  forget: () => {},
});

/** A reader of one version's cache; see the module comment. */
export function createVanillaPieceReader(options: VanillaPieceReaderOptions): VanillaPieceReader {
  const { mcVersion } = options;
  const read: ReadVanillaStructureTemplates = options.read ?? readThroughBridge;
  /** Ids read or being read; a not set up or failed answer is not kept. */
  let pending = new Map<string, Promise<VanillaPieceAnswer>>();
  /** Settled answers, for {@link VanillaPieceReader.cached}. */
  let settled = new Map<string, VanillaPieceAnswer>();

  const ask = (ids: readonly string[]): void => {
    const generation = pending;
    const done = settled;
    const call = read(mcVersion, ids);
    for (const id of ids) {
      const one = call.then((answer): VanillaPieceAnswer => {
        if (answer === null) return NOT_SET_UP;
        const bytes = Object.hasOwn(answer.templates, id) ? answer.templates[id] : undefined;
        if (bytes !== undefined) {
          try {
            return { status: 'ready', id, template: parsePieceTemplate(id, bytes) };
          } catch (error) {
            return {
              status: 'unreadable',
              id,
              reason: error instanceof Error ? error.message : String(error),
            };
          }
        }
        if (answer.refused.includes(id)) {
          return { status: 'unreadable', id, reason: 'The cached file was refused.' };
        }
        return { status: 'missing', id };
      });
      generation.set(id, one);
      one.then(
        (answer) => {
          if (generation.get(id) !== one) return;
          // Not set up: ask again next time.
          if (answer.status === 'not_set_up') generation.delete(id);
          else done.set(id, answer);
        },
        () => {
          if (generation.get(id) === one) generation.delete(id);
        },
      );
    }
  };

  const load = (ids: readonly string[]): Promise<VanillaPieceAnswer>[] => {
    const keys = ids.map((id) => {
      const key = vanillaPieceId(id);
      if (key === null) throw new Error(`${JSON.stringify(id)} is not a vanilla template id.`);
      return key;
    });
    const missing = [...new Set(keys)].filter((key) => !pending.has(key));
    for (let start = 0; start < missing.length; start += PIECE_IDS_PER_CALL) {
      ask(missing.slice(start, start + PIECE_IDS_PER_CALL));
    }
    return keys.map((key) => pending.get(key) as Promise<VanillaPieceAnswer>);
  };

  return {
    mcVersion,
    async template(id) {
      const [answer] = load([id]);
      return (await answer) ?? NOT_SET_UP;
    },
    async templates(ids) {
      const keys = ids.map((id) => vanillaPieceId(id) ?? id);
      const answers = await Promise.all(load(ids));
      return new Map(keys.map((key, index) => [key, answers[index] ?? NOT_SET_UP]));
    },
    cached(id) {
      const key = vanillaPieceId(id);
      if (key === null) return null;
      const answer = settled.get(key);
      if (answer === undefined) return undefined;
      return answer.status === 'ready' ? answer.template : null;
    },
    forget() {
      pending = new Map();
      settled = new Map();
    },
  };
}
