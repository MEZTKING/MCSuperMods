/**
 * What Try it's hotbar and picker offer (ADR 0085 D13, B390): the project's blocks first, then
 * its spawn eggs, then (only when the client jar is set up) vanilla blocks as props for looks.
 * Each thing carries the picture the slot shows, found in the lowered files; a thing without one
 * shows an icon instead (a spawn egg without an egg item model shows the egg icon).
 */

import type { Json } from '@msm/plugin-api';
import { type BlockCatalogue, type EntityCatalogue, readJsonFile, type SimFiles } from '@msm/sim';
import type { ResourceFolders } from '../preview/model-chain';
import { HOTBAR_SIZE } from './input';

/** One thing the player can hold. */
export interface TryItThing {
  /** The block id, or the spawn egg's item id. */
  readonly id: string;
  /** Its name in plain words. */
  readonly name: string;
  /**
   * A project block, a spawn egg, a vehicle's item (B428), a bag or bundle (B463), a fluid's
   * bucket (B483), or a vanilla block for looks only.
   */
  readonly kind: 'block' | 'egg' | 'vehicle' | 'bag' | 'bucket' | 'prop';
  /** The texture id the slot shows (`<ns>:block/ruby`), when one was found. */
  readonly texture?: string;
}

const isRecord = (value: Json | undefined): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const split = (id: string): { namespace: string; path: string } => {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
};

/** The texture keys a slot prefers, in order. */
const PREFERRED_TEXTURES = ['layer0', 'all', 'side', 'texture', 'front', 'top', 'end', 'particle'];

/** The texture a model file names first by {@link PREFERRED_TEXTURES}, following `#` references. */
export function modelTexture(model: Json | undefined): string | undefined {
  if (!isRecord(model) || !isRecord(model.textures)) return undefined;
  const textures = model.textures;
  const resolve = (value: Json | undefined, depth = 0): string | undefined => {
    if (typeof value !== 'string' || depth > 4) return undefined;
    if (value.startsWith('#')) return resolve(textures[value.slice(1)], depth + 1);
    return value;
  };
  for (const key of PREFERRED_TEXTURES) {
    const found = resolve(textures[key]);
    if (found !== undefined) return found;
  }
  for (const value of Object.values(textures)) {
    const found = resolve(value);
    if (found !== undefined) return found;
  }
  return undefined;
}

function modelFile(files: SimFiles, folders: ResourceFolders, modelId: string): Json | undefined {
  const { namespace, path } = split(modelId);
  return readJsonFile(files, `assets/${namespace}/${folders.model}/${path}.json`);
}

/** The model id an item definition (`assets/<ns>/items/<path>.json`) shows, when plain. */
function itemModel(files: SimFiles, folders: ResourceFolders, itemId: string): string | undefined {
  const { namespace, path } = split(itemId);
  const definition = readJsonFile(
    files,
    `assets/${namespace}/${folders.item_definition}/${path}.json`,
  );
  if (!isRecord(definition) || !isRecord(definition.model)) return undefined;
  const model = definition.model.model;
  return typeof model === 'string' ? model : undefined;
}

/** The first model a blockstate file names (its first variant or multipart part). */
function blockstateModel(files: SimFiles, folders: ResourceFolders, blockId: string) {
  const { namespace, path } = split(blockId);
  const blockstate = readJsonFile(
    files,
    `assets/${namespace}/${folders.block_definition}/${path}.json`,
  );
  if (!isRecord(blockstate)) return undefined;
  const first = (value: Json | undefined): string | undefined => {
    const entry = Array.isArray(value) ? value[0] : value;
    return isRecord(entry) && typeof entry.model === 'string' ? entry.model : undefined;
  };
  if (isRecord(blockstate.variants)) {
    for (const value of Object.values(blockstate.variants)) {
      const found = first(value);
      if (found !== undefined) return found;
    }
  }
  if (Array.isArray(blockstate.multipart)) {
    for (const part of blockstate.multipart) {
      if (isRecord(part)) {
        const found = first(part.apply);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

/** The texture a block's slot shows: its item model's, else its block model's. */
export function blockTexture(
  files: SimFiles,
  folders: ResourceFolders,
  blockId: string,
): string | undefined {
  for (const model of [
    itemModel(files, folders, blockId),
    blockstateModel(files, folders, blockId),
  ]) {
    if (model === undefined) continue;
    const texture = modelTexture(modelFile(files, folders, model));
    if (texture !== undefined) return texture;
  }
  return undefined;
}

/**
 * The texture a spawn egg's slot shows: the egg item model's, else the mob definition's
 * `spawn_egg.texture`; `undefined` when there is no egg picture (the slot shows the egg icon).
 */
export function eggTexture(
  files: SimFiles,
  folders: ResourceFolders,
  eggId: string,
  entityId: string,
): string | undefined {
  const model = itemModel(files, folders, eggId);
  const fromModel = modelTexture(
    modelFile(files, folders, model ?? `${split(eggId).namespace}:item/${split(eggId).path}`),
  );
  if (fromModel !== undefined) return fromModel;
  const { namespace, path } = split(entityId);
  const definition = readJsonFile(files, `msm/${namespace}/entity/${path}.json`);
  if (isRecord(definition) && isRecord(definition.spawn_egg)) {
    const texture = definition.spawn_egg.texture;
    if (typeof texture === 'string' && texture !== '') return texture;
  }
  return undefined;
}

/** The project's things: its blocks in id order, then its spawn eggs. */
export function projectThings(
  blocks: Pick<BlockCatalogue, 'ids' | 'get'>,
  mobs: Pick<EntityCatalogue, 'ids' | 'get'>,
  files: SimFiles,
  folders: ResourceFolders,
): TryItThing[] {
  const out: TryItThing[] = [];
  for (const id of blocks.ids()) {
    const block = blocks.get(id);
    if (block === undefined) continue;
    const texture = blockTexture(files, folders, id);
    out.push({
      id,
      name: block.displayName,
      kind: 'block',
      ...(texture === undefined ? {} : { texture }),
    });
  }
  for (const id of mobs.ids()) {
    const mob = mobs.get(id);
    if (mob?.spawnEgg === undefined) continue;
    const texture = eggTexture(files, folders, mob.spawnEgg, id);
    out.push({
      id: mob.spawnEgg,
      name: mob.spawnEggName ?? `${mob.displayName} Spawn Egg`,
      kind: 'egg',
      ...(texture === undefined ? {} : { texture }),
    });
  }
  return out;
}

/** A vanilla block offered for looks only: its name in plain words from its id. */
export function propThing(id: string): TryItThing {
  const path = split(id).path;
  const name = path
    .split(/[_/]/)
    .filter((word) => word !== '')
    .map((word) => (word[0] ?? '').toUpperCase() + word.slice(1))
    .join(' ');
  return { id, name, kind: 'prop', texture: `minecraft:block/${path}` };
}

/** Vanilla ids the picker never offers: nothing to see or stand on. */
const NOT_PROPS = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

/** The vanilla block ids of the registry the picker offers as props. */
export function propIds(registryIds: readonly string[]): string[] {
  return registryIds.filter((id) => id.startsWith('minecraft:') && !NOT_PROPS.has(id));
}

/**
 * The nine hotbar slots: the slots the user filled from the picker (while their thing still
 * exists), the others filled in order with the project's things not already shown.
 */
export function hotbarSlots(
  things: readonly TryItThing[],
  chosen: Readonly<Record<number, string>>,
  props: readonly TryItThing[] = [],
): (TryItThing | null)[] {
  const byId = new Map<string, TryItThing>();
  for (const thing of [...things, ...props]) byId.set(thing.id, thing);
  const slots: (TryItThing | null)[] = Array.from({ length: HOTBAR_SIZE }, () => null);
  const used = new Set<string>();
  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    const id = chosen[i];
    const thing = id === undefined ? undefined : byId.get(id);
    if (thing !== undefined) {
      slots[i] = thing;
      used.add(thing.id);
    }
  }
  const rest = things.filter((thing) => !used.has(thing.id));
  for (let i = 0; i < HOTBAR_SIZE && rest.length > 0; i += 1) {
    if (slots[i] === null) slots[i] = rest.shift() ?? null;
  }
  return slots;
}

/** The picture path of a texture id (`<ns>:block/x` to `assets/<ns>/textures/block/x.png`). */
export function texturePath(folders: ResourceFolders, texture: string): string {
  const { namespace, path } = split(texture);
  return `assets/${namespace}/${folders.textures}/${path}.png`;
}
