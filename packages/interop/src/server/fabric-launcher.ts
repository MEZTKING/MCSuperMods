/**
 * The Fabric server launcher (ADR 0133 D7, D10; B760 N9, N10, N12): its address on Fabric's
 * meta service, a download cache with the jar's SHA-256 recorded at the first download and
 * compared on every later one, how a server is started with it, and what its log lines say.
 *
 * Fabric publishes no checksum beside the server launcher jar (B760 N9), but its bytes are
 * stable for a game, loader and installer version, so the first download is trusted and
 * recorded (`<cacheDir>/fabric-server/launchers.json`); any later download or cached copy with
 * other bytes is refused (`server.launcher-changed`). The launcher itself, at the server's
 * first start on the user's machine, fetches Minecraft's server jar from Mojang (SHA-1
 * checked by it) and Fabric's libraries; MSM never downloads, caches or bundles those.
 *
 * No Node imports: the downloader and the hasher are injected (defaults: none for the
 * downloader, Web Crypto for SHA-256 through `fabric/changes.ts`'s `webCryptoSha256`).
 */

import { type Sha256, webCryptoSha256 } from '../fabric/changes';
import { type Downloader, SAFE_VERSION, stableJson } from '../fabric/types';
import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import { ServerError } from './errors';

/** Fabric's meta service (the source `tools/run-fabric-server` uses). */
export const FABRIC_META = 'https://meta.fabricmc.net/v2';

/** The installer versions list on the meta service. */
export const FABRIC_INSTALLER_VERSIONS_URL = `${FABRIC_META}/versions/installer`;

/** The launcher's file name in a server folder (as `tools/run-fabric-server` names it). */
export const SERVER_LAUNCHER_FILE = 'fabric-server-launch.jar';

/** The cache folder inside the download cache. */
export const SERVER_LAUNCHER_CACHE = 'fabric-server';

/** The record of every launcher's first-seen SHA-256, inside {@link SERVER_LAUNCHER_CACHE}. */
export const SERVER_LAUNCHER_RECORD = 'launchers.json';

function assertVersion(value: string, what: string): void {
  if (!SAFE_VERSION.test(value)) {
    throw new ServerError(
      'server.bad-recipe',
      `${JSON.stringify(value)} is not a valid ${what} version.`,
    );
  }
}

/**
 * The Fabric server launcher's address for a game, loader and installer version:
 * `https://meta.fabricmc.net/v2/versions/loader/<mc>/<loader>/<installer>/server/jar`.
 */
export function serverLauncherUrl(mcVersion: string, loader: string, installer: string): string {
  assertVersion(mcVersion, 'Minecraft');
  assertVersion(loader, 'Fabric Loader');
  assertVersion(installer, 'Fabric installer');
  const part = (value: string): string => encodeURIComponent(value);
  return `${FABRIC_META}/versions/loader/${part(mcVersion)}/${part(loader)}/${part(installer)}/server/jar`;
}

/**
 * The first stable installer version of the meta service's `/versions/installer` list (the
 * newest comes first), or `null` when the list names none.
 */
export function latestStableInstaller(list: unknown): string | null {
  if (!Array.isArray(list)) return null;
  for (const entry of list) {
    const record = entry as { version?: unknown; stable?: unknown } | null;
    if (
      record !== null &&
      record.stable === true &&
      typeof record.version === 'string' &&
      SAFE_VERSION.test(record.version)
    ) {
      return record.version;
    }
  }
  return null;
}

/** One launcher's first-seen fingerprint. */
interface KnownLauncher {
  sha256: string;
}

interface LauncherRecord {
  formatVersion: 1;
  /** Keyed `<mc>/<loader>/<installer>`. */
  launchers: Record<string, KnownLauncher>;
}

const SHA256 = /^[0-9a-f]{64}$/;

function recordKey(mcVersion: string, loader: string, installer: string): string {
  return `${mcVersion}/${loader}/${installer}`;
}

async function readRecord(fs: InstallFileSystem, path: string): Promise<LauncherRecord> {
  const empty: LauncherRecord = { formatVersion: 1, launchers: {} };
  if (!(await fs.exists(path))) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(await fs.readFile(path)));
  } catch {
    // An unreadable record must never let a changed launcher through: refuse until it is
    // removed by hand (the cache folder belongs to MSM).
    throw new ServerError(
      'server.launcher-changed',
      'The record of the Fabric server launchers MCSuperMods downloaded cannot be read. Empty the download cache in Settings, then try again.',
    );
  }
  const raw = (parsed as { launchers?: unknown } | null)?.launchers;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return empty;
  const launchers: Record<string, KnownLauncher> = {};
  for (const [key, value] of Object.entries(raw)) {
    const sha256 = (value as { sha256?: unknown } | null)?.sha256;
    if (typeof sha256 === 'string' && SHA256.test(sha256)) launchers[key] = { sha256 };
  }
  return { formatVersion: 1, launchers };
}

/** Whether the bytes start as a zip (a jar) does: `PK\x03\x04`. */
function looksLikeJar(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** What {@link cachedServerLauncher} needs. */
export interface ServerLauncherCacheDeps {
  fs: InstallFileSystem;
  /** The download cache folder (absolute), such as `<userData>/downloads`. */
  cacheDir: string;
  /** Fetches a URL; never called for what the cache already holds. Tests inject one. */
  download: Downloader;
  sha256?: Sha256;
}

/** What a server recipe's launcher is. */
export interface ServerLauncherWanted {
  mcVersion: string;
  /** Fabric Loader's version (the recipe's `loader.version`). */
  loader: string;
  /**
   * The installer version. Default: the newest one recorded for this game and loader whose
   * jar is still cached (so later starts need no network), else the meta service's newest
   * stable one.
   */
  installer?: string;
}

/** A verified Fabric server launcher jar. */
export interface ServerLauncherJar {
  mcVersion: string;
  loader: string;
  installer: string;
  bytes: Uint8Array;
  /** Lower-case hex SHA-256, equal to the one recorded at the first download. */
  sha256: string;
  /** `true` when it came from the cache without a download. */
  cached: boolean;
  /** `true` when this call recorded its SHA-256 for the first time. */
  firstSeen: boolean;
}

function compareInstallers(a: string, b: string): number {
  const parts = (value: string): number[] =>
    (/^[0-9]+(?:\.[0-9]+)*/.exec(value)?.[0] ?? '0').split('.').map(Number);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The Fabric server launcher for `wanted`, from the cache
 * (`<cacheDir>/fabric-server/<mc>/<loader>/<installer>/fabric-server-launch.jar`) when its
 * bytes still match the recorded SHA-256, otherwise downloaded from Fabric's meta service.
 * The first download of a version records its SHA-256; a later download or cached copy with
 * other bytes is refused (`server.launcher-changed`) and nothing is written. A response that
 * is not a jar, or a network failure, is `server.download-failed`.
 *
 * Must not run twice at once for the same cache folder; the app's main process runs these one
 * at a time.
 */
export async function cachedServerLauncher(
  deps: ServerLauncherCacheDeps,
  wanted: ServerLauncherWanted,
): Promise<ServerLauncherJar> {
  const { fs } = deps;
  const sha256 = deps.sha256 ?? webCryptoSha256;
  assertVersion(wanted.mcVersion, 'Minecraft');
  assertVersion(wanted.loader, 'Fabric Loader');
  const root = joinInstallPath(deps.cacheDir, SERVER_LAUNCHER_CACHE);
  const recordPath = joinInstallPath(root, SERVER_LAUNCHER_RECORD);
  const record = await readRecord(fs, recordPath);
  const jarPathOf = (installer: string): string =>
    joinInstallPath(root, wanted.mcVersion, wanted.loader, installer, SERVER_LAUNCHER_FILE);

  /** The cached jar when its bytes match the record, else `null`. */
  const fromCache = async (installer: string): Promise<ServerLauncherJar | null> => {
    const known = record.launchers[recordKey(wanted.mcVersion, wanted.loader, installer)];
    const path = jarPathOf(installer);
    if (known === undefined || !(await fs.exists(path))) return null;
    try {
      const bytes = await fs.readFile(path);
      if ((await sha256(bytes)) !== known.sha256) return null;
      return {
        mcVersion: wanted.mcVersion,
        loader: wanted.loader,
        installer,
        bytes,
        sha256: known.sha256,
        cached: true,
        firstSeen: false,
      };
    } catch {
      return null;
    }
  };

  let installer = wanted.installer;
  if (installer === undefined) {
    // The newest recorded installer still in the cache: no network needed.
    const prefix = `${wanted.mcVersion}/${wanted.loader}/`;
    const recorded = Object.keys(record.launchers)
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
      .filter((value) => SAFE_VERSION.test(value))
      .sort(compareInstallers)
      .reverse();
    for (const candidate of recorded) {
      const hit = await fromCache(candidate);
      if (hit !== null) return hit;
    }
    let list: unknown;
    try {
      list = JSON.parse(
        new TextDecoder().decode(await deps.download(FABRIC_INSTALLER_VERSIONS_URL)),
      );
    } catch (error) {
      throw downloadFailed(wanted, error);
    }
    const latest = latestStableInstaller(list);
    if (latest === null) {
      throw new ServerError(
        'server.download-failed',
        "Fabric's meta service lists no stable Fabric installer, so the server cannot be made now. Try again later.",
      );
    }
    installer = latest;
  }
  assertVersion(installer, 'Fabric installer');

  const hit = await fromCache(installer);
  if (hit !== null) return hit;

  let bytes: Uint8Array;
  try {
    bytes = await deps.download(serverLauncherUrl(wanted.mcVersion, wanted.loader, installer));
  } catch (error) {
    throw downloadFailed(wanted, error);
  }
  if (!looksLikeJar(bytes)) {
    throw new ServerError(
      'server.download-failed',
      `Fabric's meta service did not send a server launcher for Minecraft ${wanted.mcVersion}. Try again later.`,
    );
  }
  const actual = await sha256(bytes);
  const key = recordKey(wanted.mcVersion, wanted.loader, installer);
  const known = record.launchers[key];
  if (known !== undefined && known.sha256 !== actual) {
    throw new ServerError(
      'server.launcher-changed',
      `The Fabric server launcher for Minecraft ${wanted.mcVersion} is not the one MCSuperMods downloaded before, so it was not used. Nothing was changed.`,
    );
  }
  const dir = joinInstallPath(root, wanted.mcVersion, wanted.loader, installer);
  await fs.remove(dir);
  await fs.mkdirp(dir);
  await fs.writeFile(jarPathOf(installer), bytes);
  if (known === undefined) {
    record.launchers[key] = { sha256: actual };
    await fs.writeFile(recordPath, new TextEncoder().encode(stableJson(record)));
  }
  return {
    mcVersion: wanted.mcVersion,
    loader: wanted.loader,
    installer,
    bytes,
    sha256: actual,
    cached: false,
    firstSeen: known === undefined,
  };
}

function downloadFailed(wanted: ServerLauncherWanted, error: unknown): ServerError {
  return new ServerError(
    'server.download-failed',
    `The Fabric server launcher for Minecraft ${wanted.mcVersion} could not be downloaded from Fabric's meta service: ${error instanceof Error ? error.message : String(error)}`,
  );
}

/** The default largest Java heap for a local server, in megabytes. */
export const DEFAULT_SERVER_MEMORY_MB = 2048;

/** The line written on the server's standard input to stop it (B760 N12). */
export const SERVER_STOP_LINE = 'stop\n';

/** How to start a local server: spawn `program` with `args` in `cwd`, without a shell. */
export interface ServerStartCommand {
  program: string;
  args: string[];
  cwd: string;
}

/**
 * The start command of a Fabric server folder: `<java> -Xmx<memory>M -jar
 * fabric-server-launch.jar nogui` in the folder (one process: the launcher runs the game in
 * its own JVM, B760 N9). Spawn it directly, never through a shell, so ending the process ends
 * the server on Windows too (N12); stop it with {@link SERVER_STOP_LINE} first.
 */
export function serverStartCommand(options: {
  /** The Java program (`findJava`'s `program`). */
  java: string;
  /** The server folder. */
  serverDir: string;
  /** The largest heap in megabytes (default {@link DEFAULT_SERVER_MEMORY_MB}). */
  memoryMb?: number;
}): ServerStartCommand {
  const memory = options.memoryMb ?? DEFAULT_SERVER_MEMORY_MB;
  if (!Number.isInteger(memory) || memory < 512 || memory > 65536) {
    throw new ServerError('server.bad-recipe', `${memory} MB is not a memory size for a server.`);
  }
  if (options.java === '' || options.serverDir === '') {
    throw new ServerError('server.bad-recipe', 'The server has no Java program or no folder.');
  }
  return {
    program: options.java,
    args: [`-Xmx${memory}M`, '-jar', SERVER_LAUNCHER_FILE, 'nogui'],
    cwd: options.serverDir,
  };
}

/**
 * What a server log line says about its state. The process's exit status says nothing (it is
 * 0 for a missing EULA and for a taken port as well as after `stop`, B760 N10, N12).
 *
 * - `downloading`: the launcher's first run fetches the game and libraries;
 * - `running`: started (`Done (…)!`), players can join;
 * - `eula-needed`: stopped because the EULA is not accepted;
 * - `port-taken`: the port is in use (the server stops by itself);
 * - `crashed`: a crash report was written;
 * - `stopping`: it is stopping.
 */
export type ServerLogState =
  | 'downloading'
  | 'running'
  | 'eula-needed'
  | 'port-taken'
  | 'crashed'
  | 'stopping';

/**
 * Each message must start the line or follow the logger's `]: ` directly, so a player's chat
 * (`]: <Ann> Done (1s)!`) or a `/say` line never passes for the server's own.
 */
const LOG_STATES: readonly (readonly [RegExp, ServerLogState])[] = [
  [/(?:^|\]: )Done \(\d+(?:[.,]\d+)?s\)!/, 'running'],
  [/(?:^|\]: )You need to agree to the EULA in order to run the server/, 'eula-needed'],
  [/(?:^|\]: )\*\*\*\* FAILED TO BIND TO PORT!/, 'port-taken'],
  [/(?:^|\]: )This crash report has been saved to:/, 'crashed'],
  [/(?:^|\]: )Stopping server\s*$/, 'stopping'],
  [/^(?:Downloading Minecraft server|Installing Fabric Loader)\b/, 'downloading'],
];

/** The state a server log line announces, or `null` for any other line. */
export function serverLogState(line: string): ServerLogState | null {
  for (const [pattern, state] of LOG_STATES) {
    if (pattern.test(line)) return state;
  }
  return null;
}

/**
 * The server's state after `line`, from its state before (`null` before any known line). The
 * reason a server stopped by itself is kept: a taken port is followed by a crash report and
 * `Stopping server`, and those do not hide it; the same for a missing EULA.
 */
export function serverStateAfter(
  previous: ServerLogState | null,
  line: string,
): ServerLogState | null {
  const next = serverLogState(line);
  if (next === null) return previous;
  if (
    (previous === 'port-taken' || previous === 'eula-needed') &&
    (next === 'crashed' || next === 'stopping')
  ) {
    return previous;
  }
  return next;
}
