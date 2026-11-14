/**
 * Pure helpers of the Particle Studio and of the places that name particles (ADR 0081 D1, D2;
 * format ADR 0080 D1, D5): the Studio's choices in words, frame and lifetime edits, the
 * "Kind" of a particle to spawn (a particle, coloured dust, block pieces or item pieces), the
 * project's particles offered first in particle pickers, the frame pictures a particle's
 * project sprites need (the session reports the missing ones as
 * `blocks-items.particle-texture-missing`) and the one undo step of "Split a strip into frames". No React, no session.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project, ResourceLocation } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { particleSpritePath } from '@msm/plugin-blocks-items';
import type { ChangeAsset, ChangeItem } from '../../changeset/changeset';
import { isJsonObject } from '../../forms/pointer';
import { PARTICLE_KIND } from './blocks-items-model';
import type { ParticleAnimation, ParticleFade } from './particle-sim';

type JsonObject = { [key: string]: Json };

export { PARTICLE_KIND };

function asObject(value: Json | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

// The Studio's words --------------------------------------------------------------------

/** "Animation" in the Studio's words, in the order offered. */
export const ANIMATION_LABELS: Readonly<Record<ParticleAnimation, string>> = Object.freeze({
  age: 'Once over its life',
  loop: 'Loop',
  random: 'A random frame',
});

/** "Fade" in the Studio's words, in the order offered. */
export const FADE_LABELS: Readonly<Record<ParticleFade, string>> = Object.freeze({
  none: 'None',
  out: 'Out',
  in_out: 'In and out',
});

/** The "Gravity" shortcuts and the value each writes (`undefined`: the default 0). */
export const GRAVITY_SHORTCUTS: readonly {
  key: 'up' | 'none' | 'falls';
  label: string;
  value: number | undefined;
}[] = Object.freeze([
  { key: 'up', label: 'Floats up', value: -0.05 },
  { key: 'none', label: 'None', value: undefined },
  { key: 'falls', label: 'Falls', value: 0.1 },
]);

/** The size of a new frame picture ("New picture"), as vanilla's particle pictures. */
export const NEW_PICTURE_SIZE = Object.freeze({ width: 8, height: 8 });

// Frames and lifetime ---------------------------------------------------------------------

/** The frame sprite ids of a particle, in order (non-strings are shown empty). */
export function particleFrames(data: Json | undefined): string[] {
  const textures = asObject(data).textures;
  return Array.isArray(textures)
    ? textures.map((entry) => (typeof entry === 'string' ? entry : ''))
    : [];
}

/** A sprite id for a new frame of particle `id` that the frames do not use yet: `<id>_<n>`. */
export function nextFrameSprite(id: string, frames: readonly string[]): string {
  for (let n = frames.length; ; n += 1) {
    const sprite = `${id}_${n}`;
    if (!frames.includes(sprite)) return sprite;
  }
}

/** Whether `lifetime` is a `{ min, max }` range. */
export function isLifetimeRange(data: Json | undefined): boolean {
  return isJsonObject(asObject(data).lifetime);
}

/**
 * The `lifetime` after "Between" is ticked (`{ min, max }` from the current number) or
 * unticked (the range's `min`); `undefined` leaves the default of 20.
 */
export function lifetimeWithRange(current: Json | undefined, range: boolean): Json | undefined {
  if (range) {
    if (isJsonObject(current)) return current;
    const value = typeof current === 'number' ? current : 20;
    return { min: value, max: value };
  }
  if (!isJsonObject(current)) return current;
  return typeof current.min === 'number' ? current.min : undefined;
}

/** Whether the particle draws see-through when `translucent` is not written (ADR 0080 D1). */
export function defaultTranslucent(data: Json | undefined): boolean {
  const object = asObject(data);
  const alpha = typeof object.alpha === 'number' ? object.alpha : 1;
  const fade = typeof object.fade === 'string' ? object.fade : 'none';
  return alpha < 1 || fade !== 'none';
}

// Particles to spawn (ADR 0080 D5) ------------------------------------------------------

/** The vanilla particle type of coloured dust. */
export const DUST_TYPE = 'minecraft:dust';
/** The vanilla particle type of block pieces. */
export const BLOCK_PIECES_TYPE = 'minecraft:block';
/** The vanilla particle type of item pieces. */
export const ITEM_PIECES_TYPE = 'minecraft:item';

/** What a particle field holds: an id, one of three options objects, or another object. */
export type ParticleSpecKind = 'particle' | 'dust' | 'block' | 'item' | 'other';

/** The kinds offered by "Kind", in order. */
export const PARTICLE_SPEC_KINDS: readonly Exclude<ParticleSpecKind, 'other'>[] = Object.freeze([
  'particle',
  'dust',
  'block',
  'item',
]);

/** "Kind" in the editor's words. */
export const PARTICLE_SPEC_KIND_LABELS: Readonly<Record<ParticleSpecKind, string>> = Object.freeze({
  particle: 'A particle',
  dust: 'Coloured dust',
  block: 'Block pieces',
  item: 'Item pieces',
  other: 'Other options (edit them under Advanced)',
});

/** The kind of a `particle` value (an id, or an options object by its `type`). */
export function particleSpecKind(value: Json | undefined): ParticleSpecKind {
  if (value === undefined || typeof value === 'string') return 'particle';
  if (!isJsonObject(value)) return 'other';
  switch (value.type) {
    case DUST_TYPE:
      return 'dust';
    case BLOCK_PIECES_TYPE:
      return 'block';
    case ITEM_PIECES_TYPE:
      return 'item';
    default:
      return 'other';
  }
}

/** The default scale of coloured dust (vanilla's `scale` takes 0.01 to 4). */
export const DEFAULT_DUST_SCALE = 1;
/** The colour new coloured dust starts with. */
export const DEFAULT_DUST_COLOUR = 0xff0000;

/**
 * The `particle` value for a new `kind`: an empty id, dust in {@link DEFAULT_DUST_COLOUR},
 * pieces of stone or of a diamond (block and item ids the user changes).
 */
export function particleSpecFor(kind: Exclude<ParticleSpecKind, 'other'>): Json {
  switch (kind) {
    case 'particle':
      return '';
    case 'dust':
      return { type: DUST_TYPE, color: DEFAULT_DUST_COLOUR, scale: DEFAULT_DUST_SCALE };
    case 'block':
      return { type: BLOCK_PIECES_TYPE, block_state: 'minecraft:stone' };
    case 'item':
      return { type: ITEM_PIECES_TYPE, item: { id: 'minecraft:diamond' } };
  }
}

/** The block id of block pieces (`block_state` as an id, or `{ Name }`). */
export function blockPiecesId(value: Json | undefined): string {
  const state = asObject(value).block_state;
  if (typeof state === 'string') return state;
  const name = asObject(state).Name;
  return typeof name === 'string' ? name : '';
}

/** The item id of item pieces (`item` as an id, or `{ id }`). */
export function itemPiecesId(value: Json | undefined): string {
  const item = asObject(value).item;
  if (typeof item === 'string') return item;
  const id = asObject(item).id;
  return typeof id === 'string' ? id : '';
}

/** `value` (an options object) with `key` set, or removed when `next` is `undefined`. */
export function withOption(value: Json | undefined, key: string, next: Json | undefined): Json {
  const { [key]: _old, ...rest } = asObject(value);
  return next === undefined ? rest : { ...rest, [key]: next };
}

/** Item pieces naming `id`, keeping the item's other fields. */
export function withItemPieces(value: Json | undefined, id: string): Json {
  const item = asObject(value).item;
  return withOption(value, 'item', isJsonObject(item) ? { ...item, id } : { id });
}

/**
 * `motion` after setting `axis` (0, 1 or 2) to `next`: the other axes keep their values (0
 * when unset); `undefined` once clearing an axis leaves only zeros.
 */
export function motionWith(
  current: Json | undefined,
  axis: number,
  next: number | undefined,
): Json | undefined {
  const parts: (number | undefined)[] = [0, 1, 2].map((index) => {
    const value = Array.isArray(current) ? current[index] : undefined;
    return typeof value === 'number' ? value : undefined;
  });
  parts[axis] = next;
  // Clearing the last axis that was not 0 removes the field.
  if (next === undefined && parts.every((part) => part === undefined || part === 0)) {
    return undefined;
  }
  return parts.map((part) => part ?? 0);
}

/** The ids of the project's own particles (`msm:particle` elements), sorted. */
export function projectParticles(project: Project | null | undefined): string[] {
  if (project === null || project === undefined) return [];
  return project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter((element) => element.kind === PARTICLE_KIND)
    .map((element) => element.id)
    .sort();
}

/**
 * `suggest` with project particles first: for `particle_type`, ids outside the `minecraft`
 * namespace (the project's particles) come before vanilla ones; other registries are
 * unchanged.
 */
export function particlesFirst(
  suggest: (registry: string, prefix: string) => string[],
): (registry: string, prefix: string) => string[] {
  return (registry, prefix) => {
    const ids = suggest(registry, prefix);
    if (registry !== 'particle_type') return ids;
    const vanilla = (id: string) => id.startsWith('minecraft:') || !id.includes(':');
    return [...ids.filter((id) => !vanilla(id)), ...ids.filter(vanilla)];
  };
}

// Frame pictures (ADR 0080 D2, D10) ---------------------------------------------------------

/** The folders used when no target is known (vanilla's own). */
const FALLBACK_FOLDERS: Pick<TargetFacts, 'particles' | 'folders'> = {
  folders: { resource: { textures: 'textures' } } as TargetFacts['folders'],
};

/** Where a sprite's picture lives: `assets/<namespace>/<path>`, or `undefined` for a bad id. */
export function spriteAsset(
  target: Pick<TargetFacts, 'particles' | 'folders'> | undefined,
  sprite: string,
): { namespace: string; path: string; assetPath: string } | undefined {
  const assetPath = particleSpritePath(target ?? FALLBACK_FOLDERS, sprite);
  if (assetPath === undefined) return undefined;
  const [, namespace, ...rest] = assetPath.split('/');
  if (namespace === undefined) return undefined;
  return { namespace, path: rest.join('/'), assetPath };
}

/** Whether `sprite` is a vanilla sprite (never bundled, read from the game when known). */
export function isVanillaSprite(sprite: string): boolean {
  return !sprite.includes(':') || sprite.startsWith('minecraft:');
}

/** Whether the project has the picture of a project sprite (vanilla sprites always count). */
export function hasSpritePicture(
  project: Project,
  target: Pick<TargetFacts, 'particles' | 'folders'> | undefined,
  sprite: string,
): boolean {
  if (sprite === '' || isVanillaSprite(sprite)) return true;
  const asset = spriteAsset(target, sprite);
  if (asset === undefined) return true;
  return project.namespaces.some(
    (namespace) =>
      namespace.name === asset.namespace &&
      namespace.assets.some((entry) => entry.path === asset.path),
  );
}

/** The sprite ids of the project's particle pictures (`<ns>:<name>`), sorted. */
export function projectSprites(
  project: Project,
  target: Pick<TargetFacts, 'particles' | 'folders'> | undefined,
): string[] {
  const probe = spriteAsset(target, 'x:x');
  const folder = probe === undefined ? 'textures/particle/' : probe.path.slice(0, -'x.png'.length);
  const out: string[] = [];
  for (const namespace of project.namespaces) {
    for (const asset of namespace.assets) {
      if (asset.path.startsWith(folder) && asset.path.endsWith('.png')) {
        out.push(`${namespace.name}:${asset.path.slice(folder.length, -'.png'.length)}`);
      }
    }
  }
  return out.sort();
}

/**
 * The one undo step of "Split a strip into frames" (ADR 0045): the frame pictures (new files
 * as asset items, existing ones as byte writes) and the particle's `textures` set to the
 * frames `<id>_0` … in order.
 */
export function splitChangeset(
  project: Project,
  target: Pick<TargetFacts, 'particles' | 'folders'> | undefined,
  element: Element,
  frames: readonly Uint8Array[],
): { items: ChangeItem[]; writes: ChangeAsset[]; sprites: string[] } {
  const items: ChangeItem[] = [];
  const writes: ChangeAsset[] = [];
  const sprites: string[] = [];
  frames.forEach((bytes, index) => {
    const sprite = `${element.id}_${index}`;
    const asset = spriteAsset(target, sprite);
    if (asset === undefined) return;
    sprites.push(sprite);
    const file: ChangeAsset = { namespace: asset.namespace, path: asset.path, bytes };
    if (hasSpritePicture(project, target, sprite)) writes.push(file);
    else {
      items.push({
        itemId: `frame-${index}`,
        op: 'asset',
        asset: file,
        accepted: true,
        problems: [],
      });
    }
  });
  items.unshift({
    itemId: 'frames',
    op: 'update',
    elementId: element.id as ResourceLocation,
    kind: element.kind,
    before: element.data,
    after: { ...asObject(element.data), textures: sprites },
    accepted: true,
    problems: [],
  });
  return { items, writes, sprites };
}
