/**
 * Sorting a Reload's changes (ADR 0084 D6): compares the lowered project with what the
 * installed jar holds (`installed.json`) and says what reloads in place, what needs the world
 * reopened and what needs a restart, with a reason for each restart.
 *
 * Files are keyed by their jar path (the `OutputFile.path`: `assets/...`, `data/...` or
 * `msm/...`). A definition's change is told apart from an events-only change by the hash of
 * the definition without `events` ({@link DevFileHash.frozen}).
 *
 * Pure: hashing is injected, nothing is read or written.
 */

import type { Json, OutputFile } from '@msm/plugin-api';
import type { DevFileHash, DevJarFacts, InstalledDevRecord } from './dev-session';
import { stableJson } from './types';

/** Lower-case hex SHA-256 of the bytes. */
export type Sha256 = (bytes: Uint8Array) => Promise<string>;

interface WebCryptoLike {
  subtle: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> };
}

/** {@link Sha256} through the global Web Crypto (Node, Electron, browsers). */
export const webCryptoSha256: Sha256 = async (bytes) => {
  const crypto = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (crypto?.subtle === undefined) throw new Error('Web Crypto is not available.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * The definition kinds the runtime reads from `msm/<ns>/<kind>/` (keep in step with the
 * runtime's `loader/DefinitionScanner.KINDS`).
 */
export const DEV_DEFINITION_KINDS: readonly string[] = [
  'block',
  'item',
  'entity',
  'effect',
  'potion',
  'particle',
  'biome_addition',
  'loot_addition',
];

/** An output file of the lowered project, with the element it came from when known. */
export type DevOutputSource = OutputFile & { elementId?: string };

/** One lowered file, hashed. */
export interface DevOutput extends DevFileHash {
  path: string;
}

/** What a jar path is, for sorting. */
export type DevPathClass =
  | 'definition'
  | 'script'
  | 'sounds'
  | 'asset'
  | 'data'
  | 'world-data'
  | 'mod-file';

/**
 * What a jar path is. `worldDataFolders` are folders under `data/<ns>/` loaded with the world
 * (`TargetFacts.dev.worldDataFolders`, for example `worldgen/biome` or `enchantment`); a
 * folder matches itself and everything below it.
 */
export function devPathClass(path: string, worldDataFolders: readonly string[]): DevPathClass {
  const parts = path.split('/');
  const [root, namespace, folder] = parts;
  if (namespace === undefined || namespace === '' || folder === undefined) return 'mod-file';
  if (root === 'msm') {
    if (folder === 'script' && parts.length >= 4) return 'script';
    if (DEV_DEFINITION_KINDS.includes(folder) && parts.length >= 4 && path.endsWith('.json')) {
      return 'definition';
    }
    return 'mod-file';
  }
  if (root === 'assets') {
    return parts.length === 3 && folder === 'sounds.json' ? 'sounds' : 'asset';
  }
  if (root === 'data') {
    const rest = parts.slice(2).join('/');
    for (const world of worldDataFolders) {
      const clean = world.replace(/^\/+|\/+$/g, '');
      if (clean !== '' && (rest === clean || rest.startsWith(`${clean}/`))) return 'world-data';
    }
    return 'data';
  }
  return 'mod-file';
}

/** The definition kind of a `msm/<ns>/<kind>/...` path, or `undefined`. */
export function definitionKind(path: string): string | undefined {
  const [root, , kind] = path.split('/');
  return root === 'msm' && kind !== undefined && DEV_DEFINITION_KINDS.includes(kind)
    ? kind
    : undefined;
}

const utf8 = new TextEncoder();
const utf8Decoder = new TextDecoder();

function contentBytes(contents: Uint8Array | Json): Uint8Array {
  return contents instanceof Uint8Array ? contents : utf8.encode(stableJson(contents));
}

function contentJson(contents: Uint8Array | Json): unknown {
  if (!(contents instanceof Uint8Array)) return contents;
  try {
    return JSON.parse(utf8Decoder.decode(contents)) as unknown;
  } catch {
    return undefined;
  }
}

/** The part of a file only a restart can change, as text, or `undefined` for none. */
function frozenText(path: string, contents: Uint8Array | Json): string | undefined {
  const cls = devPathClass(path, []);
  if (cls !== 'definition' && cls !== 'sounds') return undefined;
  const json = contentJson(contents);
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return undefined;
  if (cls === 'sounds') return stableJson(Object.keys(json).sort());
  const { events: _events, ...rest } = json as Record<string, unknown>;
  return stableJson(rest);
}

/**
 * Hashes the lowered files: `sha256` over the bytes (a JSON value as sorted, 2-space JSON),
 * `frozen` for definitions and `sounds.json`. Main hashes the same way at Play (for
 * `installed.json`) and at Reload, so equal files compare equal. Sorted by path.
 */
export async function hashOutputs(
  files: readonly DevOutputSource[],
  sha256: Sha256,
): Promise<DevOutput[]> {
  const out: DevOutput[] = [];
  for (const file of files) {
    const frozen = frozenText(file.path, file.contents);
    out.push({
      path: file.path,
      sha256: await sha256(contentBytes(file.contents)),
      ...(frozen !== undefined ? { frozen: await sha256(utf8.encode(frozen)) } : {}),
      ...(file.elementId !== undefined ? { element: file.elementId } : {}),
    });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The `files` map of `installed.json` from hashed outputs. */
export function installedFiles(outputs: readonly DevOutput[]): Record<string, DevFileHash> {
  const files: Record<string, DevFileHash> = {};
  for (const { path, ...hash } of outputs) files[path] = hash;
  return files;
}

/** One file that reloads in place or with the world reopened. */
export interface DevChange {
  path: string;
  change: 'added' | 'changed';
  /** The element the file came from, when known. */
  elementId?: string;
}

/** Why a restart is needed. */
export type RestartReasonCode =
  /** A definition (block, item, mob, ...) that the installed jar does not have. */
  | 'new-definition'
  /** A definition changed outside `events` (components, triggers, properties). */
  | 'definition-changed'
  /** A definition moved to another id (same element, another path). */
  | 'definition-renamed'
  /** A file the installed jar has is gone; an overlay cannot remove it. */
  | 'file-removed'
  /** `sounds.json` gained or lost a sound event (registered at start). */
  | 'sound-events'
  /** Any other file of the mod (`fabric.mod.json`, unknown `msm/` files, files outside the layers). */
  | 'mod-file'
  /** The project's mod id changed. */
  | 'mod-id'
  /** The nested runtime's version changed. */
  | 'runtime-version'
  /** The Fabric API version changed. */
  | 'fabric-api-version';

/** One reason for a restart. */
export interface RestartReason {
  reason: RestartReasonCode;
  /** The jar path concerned (for jar-level reasons: `fabric.mod.json`). */
  path: string;
  /** For `definition-renamed`: the old path. */
  from?: string;
  /** The definition kind (`block`, `item`, `entity`, ...), for definitions. */
  kind?: string;
  elementId?: string;
}

/** The wording key of a restart reason, for the app's plain-language table. */
export function restartReasonKey(reason: RestartReasonCode): string {
  return `play.restart.${reason}`;
}

/** The outcome of {@link classifyChanges}. */
export interface DevChanges {
  /**
   * What reloads in place, compared with the installed jar (the full overlay: everything
   * listed here is written, whether or not an earlier Reload wrote it already).
   */
  reload: {
    /** `data/` files: written to `saves/<world>/datapacks/msm-dev/`. */
    data: DevChange[];
    /** Scripts: written to `msm-dev/overlay/msm/<ns>/script/**.js` (transpiled). */
    scripts: DevChange[];
    /** Definitions whose `events` alone changed: written to `msm-dev/overlay/<path>`. */
    events: DevChange[];
    /** `assets/` files: written to `resourcepacks/msm-dev/`. */
    assets: DevChange[];
  };
  /** World data (`worldDataFolders`): written to the world's data pack, then the world reopens. */
  reopenWorld: DevChange[];
  /** Reasons for a restart, in path order; empty when none is needed. */
  restart: RestartReason[];
  /** Paths an earlier Reload wrote that are no longer wanted: remove them from the overlay. */
  stale: string[];
  /**
   * How many files differ from what the installed jar plus the current overlay show the game
   * (changed or new overlay files, and stale ones): the "N changes" of the chat line; 0 means
   * a Reload has nothing to do in place.
   */
  pending: number;
}

/** What {@link classifyChanges} compares against. */
export interface DevNext {
  jar: DevJarFacts;
  files: readonly DevOutput[];
}

/** Version facts {@link classifyChanges} needs (`TargetFacts.dev`). */
export interface DevChangeFacts {
  worldDataFolders: readonly string[];
}

/**
 * Sorts the differences between the installed jar (`installed`) and the lowered project
 * (`next`). Overlays are compared with `installed.overlay` to count {@link DevChanges.pending}
 * and find {@link DevChanges.stale} entries.
 */
export function classifyChanges(
  installed: InstalledDevRecord,
  next: DevNext,
  facts: DevChangeFacts,
): DevChanges {
  const result: DevChanges = {
    reload: { data: [], scripts: [], events: [], assets: [] },
    reopenWorld: [],
    restart: [],
    stale: [],
    pending: 0,
  };
  const restart: RestartReason[] = [];
  const wantedOverlay = new Map<string, string>();

  if (installed.jar.modId !== next.jar.modId) {
    restart.push({ reason: 'mod-id', path: 'fabric.mod.json' });
  } else if (installed.jar.modJson !== next.jar.modJson) {
    restart.push({ reason: 'mod-file', path: 'fabric.mod.json' });
  }
  if (installed.jar.runtime !== next.jar.runtime) {
    restart.push({ reason: 'runtime-version', path: 'fabric.mod.json' });
  }
  if (installed.jar.fabricApi !== next.jar.fabricApi) {
    restart.push({ reason: 'fabric-api-version', path: 'fabric.mod.json' });
  }

  const nextPaths = new Set<string>();
  const addedDefinitions: DevOutput[] = [];
  for (const file of next.files) {
    nextPaths.add(file.path);
    const before = installed.files[file.path];
    if (before !== undefined && before.sha256 === file.sha256) continue;
    const change: DevChange = {
      path: file.path,
      change: before === undefined ? 'added' : 'changed',
      ...(file.element !== undefined ? { elementId: file.element } : {}),
    };
    const cls = devPathClass(file.path, facts.worldDataFolders);
    const overlay = (list: DevChange[]): void => {
      list.push(change);
      wantedOverlay.set(file.path, file.sha256);
    };
    switch (cls) {
      case 'data':
        overlay(result.reload.data);
        break;
      case 'world-data':
        overlay(result.reopenWorld);
        break;
      case 'script':
        overlay(result.reload.scripts);
        break;
      case 'asset':
        overlay(result.reload.assets);
        break;
      case 'sounds':
        if (before !== undefined && sameFrozen(before, file)) overlay(result.reload.assets);
        else restart.push(reason('sound-events', file));
        break;
      case 'definition':
        if (before === undefined) addedDefinitions.push(file);
        else if (sameFrozen(before, file)) overlay(result.reload.events);
        else restart.push(reason('definition-changed', file));
        break;
      case 'mod-file':
        restart.push(reason('mod-file', file));
        break;
    }
  }

  const removed = Object.keys(installed.files).filter((path) => !nextPaths.has(path));
  const renamedFrom = new Set<string>();
  for (const file of addedDefinitions) {
    const from = removed.find(
      (path) =>
        !renamedFrom.has(path) &&
        file.element !== undefined &&
        installed.files[path]?.element === file.element &&
        definitionKind(path) !== undefined,
    );
    if (from !== undefined) {
      renamedFrom.add(from);
      restart.push({ ...reason('definition-renamed', file), from });
    } else {
      restart.push(reason('new-definition', file));
    }
  }
  for (const path of removed) {
    if (renamedFrom.has(path)) continue;
    const before = installed.files[path];
    const kind = definitionKind(path);
    restart.push({
      reason: 'file-removed',
      path,
      ...(kind !== undefined ? { kind } : {}),
      ...(before?.element !== undefined ? { elementId: before.element } : {}),
    });
  }

  for (const [path, sha] of wantedOverlay) {
    if (installed.overlay[path] !== sha) result.pending++;
  }
  for (const path of Object.keys(installed.overlay).sort()) {
    if (!wantedOverlay.has(path)) {
      result.stale.push(path);
      result.pending++;
    }
  }
  result.restart = restart.sort((a, b) => order(a.path, b.path) || order(a.reason, b.reason));
  return result;
}

/** The `overlay` map of `installed.json` after a Reload that wrote `changes`. */
export function overlayAfterReload(changes: DevChanges, next: DevNext): Record<string, string> {
  const byPath = new Map(next.files.map((file) => [file.path, file.sha256]));
  const overlay: Record<string, string> = {};
  const lists = [
    changes.reload.data,
    changes.reload.scripts,
    changes.reload.events,
    changes.reload.assets,
    changes.reopenWorld,
  ];
  for (const list of lists) {
    for (const change of list) {
      const sha = byPath.get(change.path);
      if (sha !== undefined) overlay[change.path] = sha;
    }
  }
  return overlay;
}

/**
 * Where a reloadable file goes, relative to the game folder: `data/` files into the world's
 * data pack, `assets/` into the dev resource pack, scripts (as `.js`) and definitions into the
 * dev overlay. `undefined` for paths that never go to an overlay.
 */
export function overlayTarget(
  path: string,
  world: string,
  worldDataFolders: readonly string[],
): string | undefined {
  switch (devPathClass(path, worldDataFolders)) {
    case 'data':
    case 'world-data':
      return `saves/${world}/datapacks/msm-dev/${path}`;
    case 'asset':
    case 'sounds':
      return `resourcepacks/msm-dev/${path}`;
    case 'script':
      return `msm-dev/overlay/${path.replace(/\.ts$/, '.js')}`;
    case 'definition':
      return `msm-dev/overlay/${path}`;
    default:
      return undefined;
  }
}

function sameFrozen(before: DevFileHash, after: DevFileHash): boolean {
  return before.frozen !== undefined && before.frozen === after.frozen;
}

function reason(code: RestartReasonCode, file: DevOutput): RestartReason {
  const kind = definitionKind(file.path);
  return {
    reason: code,
    path: file.path,
    ...(kind !== undefined ? { kind } : {}),
    ...(file.element !== undefined ? { elementId: file.element } : {}),
  };
}

function order(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
