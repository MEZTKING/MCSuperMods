/**
 * The on-disk layout of a project directory.
 *
 * @packageDocumentation
 */

import type { Element } from '@msm/plugin-api';
import { parseResourceLocation } from '../model/resource-location';

/** The project file at the root of every project directory. */
export const PROJECT_FILE = 'msm.project.json';

/** Directory holding one JSON file per element: `content/<ns>/<kind-folder>/<path>.json`. */
export const CONTENT_DIR = 'content';

/** Directory holding raw binary assets: `assets/<ns>/...`. */
export const ASSETS_DIR = 'assets';

/** Prefix of the folder used for elements whose kind is not registered. */
export const UNKNOWN_KIND_FOLDER = '_unknown';

/**
 * The folder used for an element whose kind is not registered. Saving such elements here
 * keeps them lossless until their plugin is installed again.
 *
 * @param kind - The element's kind id, for example `my_plugin:thing`.
 */
export function unknownKindFolder(kind: string): string {
  return `${UNKNOWN_KIND_FOLDER}/${kind.replace(':', '/')}`;
}

/**
 * The path of an element's file within the project.
 *
 * @param element - The element.
 * @param folder - The kind-folder, for example `recipe` or `msm/block`.
 * @returns `content/<ns>/<folder>/<path>.json`.
 */
export function elementFilePath(element: Element, folder: string): string {
  const { namespace, path } = parseResourceLocation(element.id);
  return `${CONTENT_DIR}/${namespace}/${folder}/${path}.json`;
}

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  bbmodel: 'application/json',
  json: 'application/json',
  nbt: 'application/x-minecraft-nbt',
  ogg: 'audio/ogg',
  png: 'image/png',
};

/**
 * The media type of an asset, from its file extension.
 *
 * @param path - The asset path.
 * @returns The media type, or `application/octet-stream` for unknown extensions.
 */
export function mediaTypeForPath(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return 'application/octet-stream';
  return MEDIA_TYPES[name.slice(dot + 1).toLowerCase()] ?? 'application/octet-stream';
}
