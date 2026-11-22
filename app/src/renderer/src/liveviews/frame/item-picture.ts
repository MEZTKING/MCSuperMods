/**
 * An item's picture and words for a live view's slots (B608; spike answer 2S15): the picture is
 * found as Try it's hotbar finds one (the item definition's model, then the model's first
 * texture by the hotbar's preference, `tryit/hotbar.ts`), read from the user's own jar cache
 * (`LiveViewProps.vanillaAssets`) for `minecraft:` items and from the host for the project's;
 * the words come from `en_us`. Nothing here is written anywhere; pictures become `data:` URLs.
 */

import type { Json, Project } from '@msm/plugin-api';
import { defaultTargetId, targetById } from '@msm/targets';
import { useEffect, useState } from 'react';
import { pngDataUrl } from '../../preview/bundle-source';
import type { ResourceFolders, VanillaAssetReader } from '../../preview/model-chain';
import { modelTexture, texturePath } from '../../tryit/hotbar';

/** Where a slot's picture comes from. */
export interface ItemPictureSource {
  /** Vanilla's pictures and models (the jar cache), or `null` when it is not set up. */
  readonly vanillaAssets: VanillaAssetReader | null;
  /** The target's resource folder names, or `null` when not known (no picture then). */
  readonly folders: ResourceFolders | null;
  /** The project's own file at a jar path (`assets/<ns>/...`), or `null`; none by default. */
  readonly readProject?: (path: string) => Promise<Uint8Array | null>;
}

/** The resource folder names of the project's target (the default target's for none). */
export function resourceFoldersOf(project: Pick<Project, 'targets'>): ResourceFolders | null {
  const id = project.targets[0] ?? defaultTargetId;
  return targetById(id)?.target.folders.resource ?? null;
}

const split = (id: string): { namespace: string; path: string } => {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
};

const isRecord = (value: Json | undefined): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseJson(bytes: Uint8Array | null): Json | undefined {
  if (bytes === null) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Json;
  } catch {
    return undefined;
  }
}

/**
 * The first model an item definition shows: a plain `model` first, else the first one found in
 * its cases, fallbacks and parts (the picture the item has most often).
 */
export function definitionModel(definition: Json | undefined, depth = 0): string | undefined {
  if (depth > 8) return undefined;
  if (Array.isArray(definition)) {
    for (const entry of definition) {
      const found = definitionModel(entry, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(definition)) return undefined;
  if (typeof definition.model === 'string') return definition.model;
  for (const key of ['model', 'fallback', 'on_true', 'cases', 'entries', 'models', 'on_false']) {
    const found = definitionModel(definition[key], depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

type ReadJson = (path: string) => Promise<Json | undefined>;

/** The texture id a model shows, following its parents (four at most). */
async function textureOfModel(
  read: ReadJson,
  folders: ResourceFolders,
  modelId: string,
): Promise<string | undefined> {
  let id: string | undefined = modelId;
  for (let depth = 0; depth < 5 && id !== undefined; depth += 1) {
    const { namespace, path } = split(id);
    const model = await read(`assets/${namespace}/${folders.model}/${path}.json`);
    const texture = modelTexture(model);
    if (texture !== undefined) return texture;
    id = isRecord(model) && typeof model.parent === 'string' ? model.parent : undefined;
  }
  return undefined;
}

const pictureCache = new WeakMap<object, Map<string, Promise<string | null>>>();
const NO_READER = {};

/**
 * An item's picture as a `data:` URL, or `null` when there is none to be found (the slot then
 * shows the item's name). Cached per reader and id.
 */
export function itemPicture(id: string, source: ItemPictureSource): Promise<string | null> {
  const { folders } = source;
  if (folders === null || id === '') return Promise.resolve(null);
  const full = id.includes(':') ? id : `minecraft:${id}`;
  const vanilla = full.startsWith('minecraft:');
  const owner: object = vanilla
    ? (source.vanillaAssets ?? NO_READER)
    : (source.readProject ?? NO_READER);
  if (owner === NO_READER) return Promise.resolve(null);
  let cache = pictureCache.get(owner);
  if (cache === undefined) {
    cache = new Map();
    pictureCache.set(owner, cache);
  }
  const key = `${full}|${folders.item_definition}|${folders.model}|${folders.textures}`;
  let entry = cache.get(key);
  if (entry === undefined) {
    const bytesOf = (path: string): Promise<Uint8Array | null> =>
      (vanilla ? source.vanillaAssets?.readAsset(path) : source.readProject?.(path)) ??
      Promise.resolve(null);
    const read: ReadJson = async (path) => parseJson(await bytesOf(path));
    entry = (async () => {
      const { namespace, path } = split(full);
      const definition = await read(`assets/${namespace}/${folders.item_definition}/${path}.json`);
      const model = definitionModel(definition) ?? `${namespace}:item/${path}`;
      const texture = await textureOfModel(read, folders, model);
      if (texture === undefined) return null;
      const bytes = await bytesOf(texturePath(folders, texture));
      return bytes === null || bytes.length === 0 ? null : pngDataUrl(bytes);
    })().catch(() => null);
    cache.set(key, entry);
  }
  return entry;
}

/** The item's picture, or `null` while loading or when there is none. */
export function useItemPicture(id: string, source: ItemPictureSource | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const vanillaAssets = source?.vanillaAssets ?? null;
  const folders = source?.folders ?? null;
  const readProject = source?.readProject;
  useEffect(() => {
    setUrl(null);
    if (folders === null) return;
    let live = true;
    void itemPicture(id, { vanillaAssets, folders, ...(readProject ? { readProject } : {}) }).then(
      (found) => {
        if (live) setUrl(found);
      },
    );
    return () => {
      live = false;
    };
  }, [id, vanillaAssets, folders, readProject]);
  return url;
}

/** Language keys to words (`en_us`). */
export type LangTable = Readonly<Record<string, string>>;

const langCache = new WeakMap<VanillaAssetReader, Promise<LangTable | null>>();

/** Vanilla's `en_us` from the jar cache, read once per reader; `null` when not set up. */
export function vanillaLang(
  reader: VanillaAssetReader | null,
  folders: ResourceFolders | null,
): Promise<LangTable | null> {
  if (reader === null || folders === null) return Promise.resolve(null);
  let entry = langCache.get(reader);
  if (entry === undefined) {
    entry = reader
      .readAsset(`assets/minecraft/${folders.lang}/en_us.json`)
      .then((bytes) => {
        const json = parseJson(bytes);
        if (!isRecord(json)) return null;
        const out: Record<string, string> = {};
        for (const [key, value] of Object.entries(json)) {
          if (typeof value === 'string') out[key] = value;
        }
        return out;
      })
      .catch(() => null);
    langCache.set(reader, entry);
  }
  return entry;
}

/** Vanilla's `en_us`, or `null` while loading or when not set up. */
export function useVanillaLang(
  reader: VanillaAssetReader | null,
  folders: ResourceFolders | null,
): LangTable | null {
  const [lang, setLang] = useState<LangTable | null>(null);
  useEffect(() => {
    let live = true;
    void vanillaLang(reader, folders).then((found) => {
      if (live) setLang(found);
    });
    return () => {
      live = false;
    };
  }, [reader, folders]);
  return lang;
}

/** `diamond_pickaxe` to `Diamond Pickaxe`: the words when no language file names it. */
export function wordsOfPath(id: string): string {
  const { path } = split(id);
  const last = path.slice(path.lastIndexOf('/') + 1);
  return last
    .split('_')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

/** An item's name: `en_us`'s item or block name, else words made from its id. */
export function itemName(id: string, lang: LangTable | null): string {
  const { namespace, path } = split(id);
  const key = path.replaceAll('/', '.');
  return (
    lang?.[`item.${namespace}.${key}`] ?? lang?.[`block.${namespace}.${key}`] ?? wordsOfPath(id)
  );
}

const ROMAN: readonly [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** 3 to `III`; 0 and below as digits. */
export function romanNumeral(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value >= 4000) return String(value);
  let rest = value;
  let out = '';
  for (const [n, letters] of ROMAN) {
    while (rest >= n) {
      out += letters;
      rest -= n;
    }
  }
  return out;
}

/**
 * An enchantment's tooltip line: its name and level (`Fortune III`), from `en_us` when it has
 * the words. An enchantment whose most level is one shows no number, when `maxLevel` says so
 * (the enchantment file's `max_level`); without it the level is always shown.
 */
export function enchantmentLine(
  id: string,
  level: number,
  lang: LangTable | null,
  maxLevel?: number,
): string {
  const { namespace, path } = split(id);
  const name = lang?.[`enchantment.${namespace}.${path.replaceAll('/', '.')}`] ?? wordsOfPath(id);
  if (level === 1 && maxLevel === 1) return name;
  return `${name} ${lang?.[`enchantment.level.${level}`] ?? romanNumeral(level)}`;
}
