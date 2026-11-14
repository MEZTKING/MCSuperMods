/**
 * The dev session files of one-click Play and Reload (ADR 0084 D3, D5). They live in the
 * managed test instance's game folder, in `msm-dev/`, and are plain JSON with sorted keys:
 *
 * - `dev.json` ({@link DevInfo}): written by main at Play; its presence turns the runtime's
 *   dev mode on (client with an integrated server only, ADR 0084 D4).
 * - `play.json` ({@link PlayRequest}): a play request, handled once at the title screen.
 * - `request.json` ({@link DevRequest}): a reload, reopen or quit request.
 * - `status.json` ({@link DevStatus}): written by the runtime, read by main.
 * - `installed.json` ({@link InstalledDevRecord}): what the installed jar holds, written by
 *   main at Play (and its overlay part at each Reload).
 * - `setup.mcfunction` (see `setup-function.ts`) and the folder `overlay/`.
 *
 * Requests and status share one sequence: every request main writes carries a `seq` larger
 * than any written or handled before ({@link nextRequest}); the runtime reports the last
 * `seq` it handled in `status.json`.
 *
 * Pure: no file is read or written here. Main writes the files atomically.
 */

import { joinInstallPath } from '../minecraft-install/fs';
import { stableJson } from './types';

/** The dev folder inside the managed instance's game folder. */
export const DEV_FOLDER = 'msm-dev';
/** File names inside {@link DEV_FOLDER}. */
export const DEV_INFO_FILE = 'dev.json';
export const PLAY_REQUEST_FILE = 'play.json';
export const DEV_REQUEST_FILE = 'request.json';
export const DEV_STATUS_FILE = 'status.json';
export const INSTALLED_DEV_FILE = 'installed.json';
export const SETUP_FUNCTION_FILE = 'setup.mcfunction';
/** The overlay folder inside {@link DEV_FOLDER}: `overlay/msm/<ns>/...` (ADR 0084 D6). */
export const OVERLAY_FOLDER = 'overlay';
/** The folder pack name, both `resourcepacks/msm-dev/` and `saves/<world>/datapacks/msm-dev/`. */
export const DEV_PACK_FOLDER = 'msm-dev';
/** The `options.txt` id of the dev resource pack. */
export const DEV_RESOURCE_PACK_ID = `file/${DEV_PACK_FOLDER}`;

/** The format number every dev file carries. */
export const DEV_FILE_FORMAT = 1;

/** A status older than this means the game is not running (ADR 0084 D5). */
export const GAME_RUNNING_STALE_MS = 10_000;
/** How long Play waits for a quit request to be honoured (ADR 0084 D5). */
export const QUIT_WAIT_MS = 30_000;
/** How often the runtime polls `request.json` and writes `status.json`, in client ticks. */
export const REQUEST_POLL_TICKS = 10;
export const STATUS_WRITE_TICKS = 40;

/** A namespace as used in ids and the world folder name. */
const NAMESPACE = /^[a-z0-9_.-]{1,64}$/;
/** A world folder name the app writes: one safe segment. */
const WORLD_FOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** `dev.json`. */
export interface DevInfo {
  format: 1;
  /** The project's namespaces; the first is the project's own. */
  namespaces: string[];
  /** The target id, for example `mc-<version>`. */
  target: string;
  /** The test world's folder name in `saves/`. */
  world: string;
  /** The app's version, for log lines and support. */
  appVersion: string;
}

/** `play.json`: open (or create) {@link PlayRequest.world} once at the title screen. */
export interface PlayRequest {
  format: 1;
  seq: number;
  world: string;
}

/** What a {@link DevRequest} asks for. */
export type DevRequestAction = 'reload' | 'reopen' | 'quit';

/**
 * `request.json`.
 *
 * - `reload`: `/reload` on the integrated server, then `reloadResourcePacks()` when `assets`.
 * - `reopen`: save, leave and reopen the world (which loads every data pack afresh), then
 *   `reloadResourcePacks()` when `assets`.
 * - `quit`: save, leave the world and stop the game.
 */
export interface DevRequest {
  format: 1;
  seq: number;
  action: DevRequestAction;
  /** Resource pack files changed: reload the client's resources too. */
  assets: boolean;
  /** How many files changed, for the chat line "MCSuperMods: reloaded (N changes)". */
  changes: number;
}

/** Where the game is, as the runtime reports it. */
export type DevGameState = 'title' | 'loading' | 'world';

/** The outcome of the last request the runtime handled. */
export interface DevHandled {
  seq: number;
  ok: boolean;
  /** A plain-language line when `ok` is false. */
  message?: string;
}

/** `status.json`, written by the runtime every {@link STATUS_WRITE_TICKS} ticks. */
export interface DevStatus {
  format: 1;
  state: DevGameState;
  /** The open world's folder name, or `null` outside a world. */
  world: string | null;
  /** The last handled play request or request, or `null` before any. */
  handled: DevHandled | null;
  /** When the runtime wrote the file, in milliseconds since the epoch. */
  time: number;
  /** The runtime's version. */
  runtime: string;
}

/** One file of the installed jar or the overlay, by its jar path. */
export interface DevFileHash {
  /** Lower-case hex SHA-256 of the file as lowered (see `hashOutputs`). */
  sha256: string;
  /**
   * For definitions (`msm/<ns>/<kind>/<path>.json`) and `assets/<ns>/sounds.json`: the
   * SHA-256 of the part only a restart can change (a definition without `events`; the sorted
   * sound event keys).
   */
  frozen?: string;
  /** The element the file came from, when known (to name it in restart reasons). */
  element?: string;
}

/** Jar-level facts that need a restart when they change. */
export interface DevJarFacts {
  modId: string;
  /** The nested runtime's version. */
  runtime: string;
  /** The Fabric API version installed with it. */
  fabricApi: string;
  /** SHA-256 of the jar's `fabric.mod.json`. */
  modJson: string;
}

/** `installed.json`. */
export interface InstalledDevRecord {
  format: 1;
  jar: DevJarFacts;
  /** Every output file in the installed jar, by jar path. */
  files: Record<string, DevFileHash>;
  /**
   * What the last Reload wrote (overlay, data pack folder and resource pack folder), by jar
   * path, as SHA-256. Emptied at every Play.
   */
  overlay: Record<string, string>;
}

/** The paths of the dev files under a game folder. */
export interface DevPaths {
  dir: string;
  info: string;
  play: string;
  request: string;
  status: string;
  installed: string;
  setup: string;
  overlay: string;
  resourcePack: string;
}

/** Paths of the dev files in `gameDir` (the managed instance's `.minecraft` folder). */
export function devPaths(gameDir: string): DevPaths {
  const dir = joinInstallPath(gameDir, DEV_FOLDER);
  return {
    dir,
    info: joinInstallPath(dir, DEV_INFO_FILE),
    play: joinInstallPath(dir, PLAY_REQUEST_FILE),
    request: joinInstallPath(dir, DEV_REQUEST_FILE),
    status: joinInstallPath(dir, DEV_STATUS_FILE),
    installed: joinInstallPath(dir, INSTALLED_DEV_FILE),
    setup: joinInstallPath(dir, SETUP_FUNCTION_FILE),
    overlay: joinInstallPath(dir, OVERLAY_FOLDER),
    resourcePack: joinInstallPath(gameDir, 'resourcepacks', DEV_PACK_FOLDER),
  };
}

/** The world's dev data pack folder: `saves/<world>/datapacks/msm-dev`. */
export function devDataPackPath(gameDir: string, world: string): string {
  return joinInstallPath(gameDir, 'saves', assertWorldFolder(world), 'datapacks', DEV_PACK_FOLDER);
}

/** The test world's folder name: `msm-test-<namespace>`. */
export function devWorldFolder(namespace: string): string {
  if (!NAMESPACE.test(namespace)) {
    throw new Error(`${JSON.stringify(namespace)} is not a valid namespace.`);
  }
  return `msm-test-${namespace}`;
}

/**
 * The folder an old test world is renamed to by "New test world": `<world>-old-<n>` with the
 * smallest `n` from 1 not among `existing` (folder names in `saves/`). Never deletes.
 */
export function oldWorldFolder(world: string, existing: Iterable<string>): string {
  assertWorldFolder(world);
  const taken = new Set(existing);
  for (let n = 1; ; n++) {
    const name = `${world}-old-${n}`;
    if (!taken.has(name)) return name;
  }
}

function assertWorldFolder(world: string): string {
  if (!WORLD_FOLDER.test(world) || world === '.' || world === '..') {
    throw new Error(`${JSON.stringify(world)} is not a valid world folder name.`);
  }
  return world;
}

/**
 * Whether the game is running: a status written less than {@link GAME_RUNNING_STALE_MS}
 * before `now` (a time slightly ahead of `now` counts as fresh). `null` is not running.
 */
export function isGameRunning(status: DevStatus | null, now: number): boolean {
  if (status === null) return false;
  return now - status.time < GAME_RUNNING_STALE_MS;
}

/** Whether the runtime has handled the request with this `seq` (or a later one). */
export function isHandled(status: DevStatus | null, seq: number): boolean {
  return (status?.handled?.seq ?? 0) >= seq;
}

/** The sequence state {@link nextRequest} and {@link nextPlayRequest} continue from. */
export interface DevSequence {
  play?: PlayRequest | null;
  request?: DevRequest | null;
  status?: DevStatus | null;
}

function nextSeq(current: DevSequence): number {
  return (
    Math.max(
      0,
      current.play?.seq ?? 0,
      current.request?.seq ?? 0,
      current.status?.handled?.seq ?? 0,
    ) + 1
  );
}

/** The next `request.json`: its `seq` is one more than any written or handled. */
export function nextRequest(
  current: DevSequence,
  action: DevRequestAction,
  options: { assets?: boolean; changes?: number } = {},
): DevRequest {
  const changes = options.changes ?? 0;
  if (!Number.isInteger(changes) || changes < 0) {
    throw new Error('changes must be a whole number of 0 or more.');
  }
  return {
    format: DEV_FILE_FORMAT,
    seq: nextSeq(current),
    action,
    assets: options.assets ?? false,
    changes,
  };
}

/** The next `play.json`, sharing the sequence with {@link nextRequest}. */
export function nextPlayRequest(current: DevSequence, world: string): PlayRequest {
  return { format: DEV_FILE_FORMAT, seq: nextSeq(current), world: assertWorldFolder(world) };
}

/** A fresh `installed.json` for a Play (the overlay is empty: the new jar holds everything). */
export function installedDevRecord(
  jar: DevJarFacts,
  files: Readonly<Record<string, DevFileHash>>,
): InstalledDevRecord {
  return { format: DEV_FILE_FORMAT, jar: { ...jar }, files: { ...files }, overlay: {} };
}

/** A `dev.json`. */
export function devInfo(input: Omit<DevInfo, 'format'>): DevInfo {
  if (input.namespaces.length === 0) throw new Error('A dev session needs a namespace.');
  for (const namespace of input.namespaces) {
    if (!NAMESPACE.test(namespace)) {
      throw new Error(`${JSON.stringify(namespace)} is not a valid namespace.`);
    }
  }
  return {
    format: DEV_FILE_FORMAT,
    namespaces: [...input.namespaces],
    target: input.target,
    world: assertWorldFolder(input.world),
    appVersion: input.appVersion,
  };
}

/** Any dev file as text: sorted keys, 2-space, ending in a newline. */
export function devFileText(
  value: DevInfo | PlayRequest | DevRequest | DevStatus | InstalledDevRecord,
): string {
  return stableJson(value);
}

// ---- Parsing. Every parser returns null on a missing, unreadable or invalid file. ----

type Obj = Record<string, unknown>;

function parseObject(text: string | null): Obj | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const obj = value as Obj;
    return obj.format === DEV_FILE_FORMAT ? obj : null;
  } catch {
    return null;
  }
}

function isSeq(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isHex64(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/** Parses `dev.json`. */
export function parseDevInfo(text: string | null): DevInfo | null {
  const obj = parseObject(text);
  if (obj === null) return null;
  const { namespaces, target, world, appVersion } = obj;
  if (
    !Array.isArray(namespaces) ||
    namespaces.length === 0 ||
    !namespaces.every((ns) => isString(ns) && NAMESPACE.test(ns)) ||
    !isString(target) ||
    !isString(world) ||
    !WORLD_FOLDER.test(world) ||
    !isString(appVersion)
  ) {
    return null;
  }
  return { format: 1, namespaces: [...(namespaces as string[])], target, world, appVersion };
}

/** Parses `play.json`. */
export function parsePlayRequest(text: string | null): PlayRequest | null {
  const obj = parseObject(text);
  if (obj === null || !isSeq(obj.seq) || !isString(obj.world) || !WORLD_FOLDER.test(obj.world)) {
    return null;
  }
  return { format: 1, seq: obj.seq, world: obj.world };
}

/** Parses `request.json`. */
export function parseDevRequest(text: string | null): DevRequest | null {
  const obj = parseObject(text);
  if (obj === null || !isSeq(obj.seq)) return null;
  const { action, assets, changes } = obj;
  if (action !== 'reload' && action !== 'reopen' && action !== 'quit') return null;
  if (typeof assets !== 'boolean') return null;
  if (typeof changes !== 'number' || !Number.isSafeInteger(changes) || changes < 0) return null;
  return { format: 1, seq: obj.seq, action, assets, changes };
}

/** Parses `status.json`. */
export function parseDevStatus(text: string | null): DevStatus | null {
  const obj = parseObject(text);
  if (obj === null) return null;
  const { state, world, handled, time, runtime } = obj;
  if (state !== 'title' && state !== 'loading' && state !== 'world') return null;
  if (world !== null && !(isString(world) && WORLD_FOLDER.test(world))) return null;
  if (typeof time !== 'number' || !Number.isFinite(time) || !isString(runtime)) return null;
  let parsedHandled: DevHandled | null = null;
  if (handled !== null) {
    if (typeof handled !== 'object' || Array.isArray(handled)) return null;
    const h = handled as Obj;
    if (!isSeq(h.seq) || typeof h.ok !== 'boolean') return null;
    if (h.message !== undefined && !isString(h.message)) return null;
    parsedHandled = {
      seq: h.seq,
      ok: h.ok,
      ...(isString(h.message) ? { message: h.message } : {}),
    };
  }
  return { format: 1, state, world, handled: parsedHandled, time, runtime };
}

/** Parses `installed.json`; invalid entries make the whole record invalid. */
export function parseInstalledDevRecord(text: string | null): InstalledDevRecord | null {
  const obj = parseObject(text);
  if (obj === null) return null;
  const { jar, files, overlay } = obj;
  if (typeof jar !== 'object' || jar === null || Array.isArray(jar)) return null;
  const j = jar as Obj;
  if (!isString(j.modId) || !isString(j.runtime) || !isString(j.fabricApi) || !isHex64(j.modJson)) {
    return null;
  }
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return null;
  if (typeof overlay !== 'object' || overlay === null || Array.isArray(overlay)) return null;
  const outFiles: Record<string, DevFileHash> = {};
  for (const [path, entry] of Object.entries(files)) {
    if (!isJarPath(path) || typeof entry !== 'object' || entry === null) return null;
    const e = entry as Obj;
    if (!isHex64(e.sha256) || (e.frozen !== undefined && !isHex64(e.frozen))) return null;
    if (e.element !== undefined && !isString(e.element)) return null;
    outFiles[path] = {
      sha256: e.sha256,
      ...(isHex64(e.frozen) ? { frozen: e.frozen } : {}),
      ...(isString(e.element) ? { element: e.element } : {}),
    };
  }
  const outOverlay: Record<string, string> = {};
  for (const [path, sha] of Object.entries(overlay)) {
    if (!isJarPath(path) || !isHex64(sha)) return null;
    outOverlay[path] = sha;
  }
  return {
    format: 1,
    jar: { modId: j.modId, runtime: j.runtime, fabricApi: j.fabricApi, modJson: j.modJson },
    files: outFiles,
    overlay: outOverlay,
  };
}

/** A relative POSIX path inside the jar: no empty, `.` or `..` segments, no backslashes. */
export function isJarPath(path: string): boolean {
  if (path === '' || path.includes('\\') || path.startsWith('/')) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
