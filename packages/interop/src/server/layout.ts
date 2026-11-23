/**
 * The local server's folder (ADR 0133 D5, D7, D8): `<msmHome>/servers/<namespace>-<mc>/`,
 * outside every launcher, marked by `.msm-server.json`, and `ensureServer`, which makes or
 * brings it up to date from a server recipe.
 *
 * Layout of a server folder:
 * - `.msm-server.json`: the marker (MSM's record: owner, versions, the launcher jar's SHA-256,
 *   the user's EULA acceptance, the `server.properties` values MSM wrote, the worlds it copied);
 * - `fabric-server-launch.jar`: the Fabric server launcher (`fabric-launcher.ts`);
 * - `mods/`: the content jar and Fabric API, recorded in `mods/.msm-installed.json` by the
 *   same installer as an instance's;
 * - `server.properties`: MSM's keys only (`properties.ts`); `eula.txt` only with the user's
 *   acceptance (`eula.ts`);
 * - `<level-name>/`: the world, made by the server or copied by MSM (`world/` by default);
 * - and what the server makes itself at its first start: `.fabric/`, `libraries/`,
 *   `versions/`, `logs/`, `crash-reports/` (about 131 MB, B760 N9).
 *
 * Naming: the folder is `<namespace>-<mc>` (`my_mod-<mc>`), short so the game's deep library
 * paths stay well inside Windows' path limits; the recipe's `place.name`
 * (`MCSuperMods Server <namespace> (<mc>)`) stays the name shown to the user. A folder of that
 * name that is not this server (no marker, or MSM's for something else) gives `-2`, `-3`…
 *
 * Safety: MSM writes only inside a folder holding its marker for this recipe, only files it
 * recorded (mods, the launcher jar, copied worlds, its own `server.properties` keys and
 * `eula.txt`), and refuses anything of the same name it did not write. Everything here must
 * run while the server is stopped (the server rewrites `server.properties` at every start); the
 * app's main process, which owns the server process, makes sure of it and runs these one at a
 * time.
 */

import { type Sha256, webCryptoSha256 } from '../fabric/changes';
import { MANAGED_INSTANCE_MARKER } from '../fabric/instance';
import {
  ensureFabricApi,
  INSTALLED_RECORD_FILE,
  installContentJar,
  installExtraMod,
  readInstalledRecord,
  removeUnlistedInstalls,
} from '../fabric/mods-install';
import { FabricTestError, type Sha512, stableJson } from '../fabric/types';
import { candidateName, isMadeName, MAX_NAME_SUFFIX, ownerLabel } from '../instances/names';
import { isWorldFolderName, type RecipeMod, type RunRecipe } from '../instances/recipe';
import {
  buildStaged,
  clearStaleStaging,
  newStagingId,
  StagingTakenError,
} from '../instances/staging';
import { isAbsoluteInstallPath, isPathInside, isSafeSegment } from '../launchers/paths';
import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import { ServerError } from './errors';
import {
  type EulaAcceptance,
  type EulaState,
  isEulaAcceptance,
  readEula,
  writeEulaAcceptance,
} from './eula';
import {
  SERVER_LAUNCHER_FILE,
  type ServerLauncherJar,
  type ServerStartCommand,
  serverStartCommand,
} from './fabric-launcher';
import {
  applyServerProperties,
  DEFAULT_SERVER_PORT,
  MSM_SERVER_KEYS,
  type MsmServerKey,
  parseProperties,
  SERVER_PROPERTIES_FILE,
  type ServerSettings,
  serverPropertyValues,
} from './properties';

/** The servers folder's name inside MSM's home folder. */
export const SERVERS_FOLDER = 'servers';

/** The marker in every server folder MSM made. */
export const SERVER_MARKER = '.msm-server.json';

/** The marker version this code writes. */
export const SERVER_MARKER_FORMAT = 1;

/** The server software. Only Fabric's launcher today; Plan C's B789 adds `paper`. */
export type ServerKind = 'fabric';

/** A server folder's marker. */
export interface ServerMarker {
  formatVersion: typeof SERVER_MARKER_FORMAT;
  kind: ServerKind;
  /** The project's namespace. */
  owner: string;
  minecraft: string;
  /** Fabric Loader's version. */
  loader: string | null;
  /** The launcher jar MSM put there: its installer version and SHA-256. */
  launcher: { installer: string; sha256: string } | null;
  /** The user's acceptance of the EULA for this folder, or `null`. */
  eula: { acceptedAt: string } | null;
  /** The `server.properties` values MSM wrote last. */
  properties: Partial<Record<MsmServerKey, string>>;
  /** The world folders MSM copied in. */
  worlds: string[];
}

/** The servers folder in MSM's home folder (`<msmHome>/servers`). */
export function serversFolder(msmHome: string): string {
  if (!isAbsoluteInstallPath(msmHome)) {
    throw new ServerError('server.no-folder', "MCSuperMods' own folder was not found.");
  }
  return joinInstallPath(msmHome, SERVERS_FOLDER);
}

/** The base folder name of a server recipe before the taken-name rule: `<namespace>-<mc>`. */
export function serverFolderBase(recipe: RunRecipe): string {
  const label = ownerLabel(recipe.owner);
  const name = `${label}-${recipe.mcVersion}`;
  if (label === '' || !isMadeName(name)) {
    throw new ServerError(
      'server.bad-recipe',
      `${JSON.stringify(recipe.owner)} cannot name a server folder.`,
    );
  }
  return name;
}

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_TEXT = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;

/** Parses a server marker's text; `null` when it is not a marker this code can read. */
export function parseServerMarker(text: string): ServerMarker | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const raw = parsed as Record<string, unknown>;
  if (raw.generator !== 'MCSuperMods' || raw.formatVersion !== SERVER_MARKER_FORMAT) return null;
  if (raw.kind !== 'fabric' || typeof raw.owner !== 'string' || typeof raw.minecraft !== 'string') {
    return null;
  }
  if (raw.loader !== null && typeof raw.loader !== 'string') return null;
  let launcher: ServerMarker['launcher'] = null;
  const rawLauncher = raw.launcher as { installer?: unknown; sha256?: unknown } | null | undefined;
  if (rawLauncher !== null && rawLauncher !== undefined) {
    if (
      typeof rawLauncher.installer !== 'string' ||
      !SAFE_TEXT.test(rawLauncher.installer) ||
      typeof rawLauncher.sha256 !== 'string' ||
      !SHA256.test(rawLauncher.sha256)
    ) {
      return null;
    }
    launcher = { installer: rawLauncher.installer, sha256: rawLauncher.sha256 };
  }
  let eula: ServerMarker['eula'] = null;
  const rawEula = raw.eula as { acceptedAt?: unknown } | null | undefined;
  if (rawEula !== null && rawEula !== undefined) {
    if (!isEulaAcceptance({ accepted: true, at: rawEula.acceptedAt })) return null;
    eula = { acceptedAt: rawEula.acceptedAt as string };
  }
  const properties: Partial<Record<MsmServerKey, string>> = {};
  if (
    typeof raw.properties === 'object' &&
    raw.properties !== null &&
    !Array.isArray(raw.properties)
  ) {
    for (const key of MSM_SERVER_KEYS) {
      const value = (raw.properties as Record<string, unknown>)[key];
      if (typeof value === 'string') properties[key] = value;
    }
  }
  const worlds = Array.isArray(raw.worlds)
    ? [
        ...new Set(
          raw.worlds.filter((w): w is string => typeof w === 'string' && isWorldFolderName(w)),
        ),
      ].sort()
    : [];
  return {
    formatVersion: SERVER_MARKER_FORMAT,
    kind: 'fabric',
    owner: raw.owner,
    minecraft: raw.minecraft,
    loader: raw.loader as string | null,
    launcher,
    eula,
    properties,
    worlds,
  };
}

/** The marker's text: sorted keys, 2-space indented. */
export function serverMarkerText(marker: ServerMarker): string {
  return stableJson({
    eula: marker.eula,
    formatVersion: SERVER_MARKER_FORMAT,
    generator: 'MCSuperMods',
    kind: marker.kind,
    launcher: marker.launcher,
    loader: marker.loader,
    minecraft: marker.minecraft,
    owner: marker.owner,
    properties: marker.properties,
    worlds: [...marker.worlds].sort(),
  });
}

/**
 * Reads a server folder's marker: `'absent'` without one, `'unreadable'` when it is there but
 * cannot be read (the folder is then taken, never MSM's).
 */
export async function readServerMarker(
  fs: InstallFileSystem,
  serverDir: string,
): Promise<ServerMarker | 'absent' | 'unreadable'> {
  const path = joinInstallPath(serverDir, SERVER_MARKER);
  if (!(await fs.exists(path))) return 'absent';
  try {
    return parseServerMarker(new TextDecoder().decode(await fs.readFile(path))) ?? 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/** Whether a marker is the one a recipe wants. */
function markerMatches(marker: ServerMarker, recipe: RunRecipe): boolean {
  return (
    marker.kind === 'fabric' &&
    marker.owner === recipe.owner &&
    marker.minecraft === recipe.mcVersion
  );
}

/** Where a server recipe goes. */
export type ServerPlacement =
  | { kind: 'existing'; folder: string; serverDir: string; marker: ServerMarker }
  | { kind: 'new'; folder: string; serverDir: string };

/**
 * The folder for `recipe` in `serversDir`: MSM's existing one for it (any of the base name and
 * `-2` to `-99`), else the first free name. Read-only.
 */
export async function placeServer(
  fs: InstallFileSystem,
  serversDir: string,
  recipe: RunRecipe,
): Promise<ServerPlacement> {
  const base = serverFolderBase(recipe);
  let free: string | null = null;
  for (let n = 1; n <= MAX_NAME_SUFFIX; n++) {
    const folder = candidateName(base, n);
    const serverDir = joinInstallPath(serversDir, folder);
    if (!(await fs.exists(serverDir))) {
      free ??= folder;
      continue;
    }
    const marker = await readServerMarker(fs, serverDir);
    if (marker !== 'absent' && marker !== 'unreadable' && markerMatches(marker, recipe)) {
      return { kind: 'existing', folder, serverDir, marker };
    }
  }
  if (free === null) {
    throw new ServerError(
      'server.no-free-name',
      `Every name from "${base}" to "${candidateName(base, MAX_NAME_SUFFIX)}" is taken in the servers folder. Remove some of those servers in Settings, then try again.`,
    );
  }
  return { kind: 'new', folder: free, serverDir: joinInstallPath(serversDir, free) };
}

/** Folders the server makes itself; a copied world may not take one of these names. */
const SERVER_OWN_FOLDERS = new Set([
  '.fabric',
  'config',
  'crash-reports',
  'debug',
  'libraries',
  'logs',
  'mods',
  'versions',
]);

function checkRecipe(recipe: RunRecipe): void {
  if (recipe.place.kind !== 'server' || recipe.purpose !== 'server') {
    throw new ServerError(
      'server.bad-recipe',
      'This recipe is for a launcher instance, not a server.',
    );
  }
  if (recipe.loader.kind !== 'fabric' || recipe.loader.version === null) {
    throw new ServerError(
      'server.loader-not-supported',
      'MCSuperMods can make a Fabric server only. Other servers come later.',
    );
  }
  for (const mod of recipe.mods) {
    if (!isSafeSegment(mod.fileName) || !mod.fileName.endsWith('.jar')) {
      throw new ServerError(
        'server.bad-recipe',
        `${JSON.stringify(mod.fileName)} is not a jar file name.`,
      );
    }
  }
  if (recipe.resourcePacks.length > 0) {
    // A server hands players a resource pack only from a download address (B760 N13).
    throw new ServerError(
      'server.bad-recipe',
      'A server cannot give players a resource pack from its folder. The pictures and sounds reach them in the mod.',
    );
  }
  if (recipe.join !== null) {
    throw new ServerError('server.bad-recipe', 'A server joins nothing.');
  }
  if (recipe.world !== null) {
    if (
      !isWorldFolderName(recipe.world.folder) ||
      SERVER_OWN_FOLDERS.has(recipe.world.folder.toLowerCase())
    ) {
      throw new ServerError(
        'server.bad-recipe',
        `${JSON.stringify(recipe.world.folder)} is not a world folder name a server can use.`,
      );
    }
  }
}

async function realOrSelf(fs: InstallFileSystem, path: string): Promise<string | null> {
  if (fs.realpath === undefined) return path;
  try {
    return await fs.realpath(path);
  } catch {
    return null;
  }
}

/** Throws `server.outside-root` unless `child` resolves strictly inside `parent`. */
async function assertInside(fs: InstallFileSystem, parent: string, child: string): Promise<void> {
  const outside = (): ServerError =>
    new ServerError(
      'server.outside-root',
      'The server folder leads outside the servers folder, so MCSuperMods leaves it alone.',
    );
  if (!isPathInside(parent, child)) throw outside();
  const realParent = await realOrSelf(fs, parent);
  const realChild = await realOrSelf(fs, child);
  if (realParent === null || realChild === null || !isPathInside(realParent, realChild))
    throw outside();
}

/** Wraps the mods installer's foreign-file error. */
async function mods<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof FabricTestError && error.code === 'fabric.foreign-file') {
      throw new ServerError(
        'server.foreign-file',
        error.message.replace('mods folder', "server's mods folder"),
      );
    }
    throw error;
  }
}

/** What {@link ensureServer} needs. */
export interface EnsureServerDeps {
  fs: InstallFileSystem;
  sha512: Sha512;
  /** Default: Web Crypto. */
  sha256?: Sha256;
  /** The bytes of a mod the recipe names (the content jar, Fabric API from the cache). */
  bytesOf(mod: RecipeMod): Promise<Uint8Array>;
  /**
   * The verified Fabric server launcher for the recipe (`cachedServerLauncher`); called only
   * when the folder has none or the loader changed.
   */
  launcher(): Promise<ServerLauncherJar>;
  /** A fresh staging id (tests); defaults to a random UUID. */
  stagingId?: () => string;
}

/** The server's settings for {@link ensureServer}; `levelName` comes from the recipe's world. */
export interface EnsureServerOptions extends Omit<ServerSettings, 'levelName'> {
  /** MSM's keys to write even over the user's own value (a port found taken). */
  force?: readonly MsmServerKey[];
}

/** What {@link ensureServer} found or did. */
export interface EnsuredServer {
  serversDir: string;
  /** The folder name. */
  folder: string;
  serverDir: string;
  /** The name shown to the user (the recipe's). */
  name: string;
  /** `true` when the folder was made now. */
  created: boolean;
  /** The launcher jar in the folder, and whether it was written now. */
  launcher: { installer: string; sha256: string; written: boolean };
  /** Mod files MSM wrote or kept (sorted), and those it removed (its own, unlisted). */
  mods: { files: string[]; removed: string[] };
  /** The recipe's world, and whether it was copied now. */
  world: { folder: string; copied: boolean } | null;
  /** `server.properties`' values for MSM's keys, as they now are. */
  properties: Partial<Record<MsmServerKey, string>>;
  /** MSM's keys the user had set themselves, kept. */
  keptUserValues: MsmServerKey[];
  /** The port in `server.properties` (the caller checks it is free before starting). */
  port: number;
  /** Whether the EULA is accepted in the folder. */
  eula: EulaState;
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/**
 * Makes the local server folder `recipe` names in `serversDir` (`serversFolder(msmHome)`), or
 * brings MSM's existing one up to date: the launcher jar, the mods, the copied world,
 * `server.properties`, and `eula.txt` again when the user accepted the EULA for this folder
 * before and the file has gone. It never accepts the EULA (see {@link acceptServerEula}) and
 * starts nothing. Call it only while the server is stopped.
 *
 * @throws {ServerError} With a code and a message for the user.
 */
export async function ensureServer(
  deps: EnsureServerDeps,
  serversDir: string,
  recipe: RunRecipe,
  options: EnsureServerOptions = {},
): Promise<EnsuredServer> {
  const { fs } = deps;
  const sha256 = deps.sha256 ?? webCryptoSha256;
  const stagingId = deps.stagingId ?? newStagingId;
  checkRecipe(recipe);
  if (recipe.place.kind !== 'server') throw new Error('unreachable');
  if (!isAbsoluteInstallPath(serversDir)) {
    throw new ServerError('server.no-folder', "MCSuperMods' servers folder was not found.");
  }
  const levelName = recipe.world?.folder ?? 'world';
  let wanted: Partial<Record<MsmServerKey, string>>;
  try {
    wanted = serverPropertyValues({ ...options, levelName });
  } catch (error) {
    throw new ServerError(
      'server.bad-recipe',
      error instanceof Error ? error.message : String(error),
    );
  }
  await fs.mkdirp(serversDir);
  if (fs.rename !== undefined) await clearStaleStaging(fs, serversDir);

  const placement = await placeServer(fs, serversDir, recipe);
  let marker: ServerMarker;
  const created = placement.kind === 'new';
  if (placement.kind === 'existing') {
    marker = placement.marker;
  } else {
    marker = {
      formatVersion: SERVER_MARKER_FORMAT,
      kind: 'fabric',
      owner: recipe.owner,
      minecraft: recipe.mcVersion,
      loader: recipe.loader.version,
      launcher: null,
      eula: null,
      properties: {},
      worlds: [],
    };
    // The marker first: a folder never exists without it (staged when the file system can).
    const write = async (dir: string): Promise<void> => {
      await fs.writeFile(joinInstallPath(dir, SERVER_MARKER), encode(serverMarkerText(marker)));
    };
    if (fs.rename !== undefined) {
      try {
        await buildStaged(fs, serversDir, placement.folder, write, stagingId());
      } catch (error) {
        if (error instanceof StagingTakenError) {
          throw new ServerError(
            'server.no-free-name',
            `A folder named "${placement.folder}" appeared in the servers folder while MCSuperMods was making it. Try again.`,
          );
        }
        throw error;
      }
    } else {
      await fs.mkdirp(placement.serverDir);
      await write(placement.serverDir);
    }
  }
  const serverDir = placement.serverDir;
  await assertInside(fs, serversDir, serverDir);
  const markerPath = joinInstallPath(serverDir, SERVER_MARKER);
  let markerText = serverMarkerText(marker);
  const saveMarker = async (): Promise<void> => {
    const next = serverMarkerText(marker);
    if (next === markerText) return;
    await fs.writeFile(markerPath, encode(next));
    markerText = next;
  };
  // A server folder's marker must never be taken for an instance's, nor the other way round.
  if (await fs.exists(joinInstallPath(serverDir, MANAGED_INSTANCE_MARKER))) {
    throw new ServerError('server.not-ours', 'This folder is a launcher instance, not a server.');
  }

  // The launcher jar.
  const jarPath = joinInstallPath(serverDir, SERVER_LAUNCHER_FILE);
  let launcherWritten = false;
  const jarExists = await fs.exists(jarPath);
  if (jarExists) {
    if (marker.launcher === null) {
      throw new ServerError(
        'server.foreign-file',
        `The server folder already holds ${SERVER_LAUNCHER_FILE}, which MCSuperMods did not put there. Remove the server in Settings and make it again.`,
      );
    }
    if ((await sha256(await fs.readFile(jarPath))) !== marker.launcher.sha256) {
      throw launcherChanged();
    }
  }
  if (!jarExists || marker.launcher === null || marker.loader !== recipe.loader.version) {
    const jar = await deps.launcher();
    if (jar.mcVersion !== recipe.mcVersion || jar.loader !== recipe.loader.version) {
      throw new ServerError(
        'server.bad-recipe',
        'The server launcher is for another Minecraft or Fabric version.',
      );
    }
    if ((await sha256(jar.bytes)) !== jar.sha256) throw launcherChanged();
    if (jarExists) await fs.remove(jarPath);
    await fs.writeFile(jarPath, jar.bytes);
    marker.launcher = { installer: jar.installer, sha256: jar.sha256 };
    marker.loader = recipe.loader.version;
    launcherWritten = true;
    await saveMarker();
  }
  const launcher = marker.launcher as { installer: string; sha256: string };

  // Mods, recorded in `mods/.msm-installed.json`.
  const modsDir = joinInstallPath(serverDir, 'mods');
  await fs.mkdirp(modsDir);
  await assertInside(fs, serverDir, modsDir);
  const installDeps = { fs, sha512: deps.sha512 };
  const modFiles: string[] = [];
  const keep = new Set<string>();
  let wantsFabricApi = false;
  for (const mod of recipe.mods) {
    if (mod.role === 'fabric-api') {
      wantsFabricApi = true;
      const api = await mods(() =>
        ensureFabricApi(installDeps, modsDir, mod.version, async () => {
          const bytes = await deps.bytesOf(mod);
          return { bytes, sha512: await deps.sha512(bytes) };
        }),
      );
      modFiles.push(api.file);
      keep.add(api.file);
    } else if (mod.role === 'content') {
      const bytes = await deps.bytesOf(mod);
      await mods(() => installContentJar(installDeps, modsDir, mod.modId, bytes));
      modFiles.push(mod.fileName);
      keep.add(mod.fileName);
    } else {
      const bytes = await deps.bytesOf(mod);
      await mods(() => installExtraMod(installDeps, modsDir, mod.fileName, mod.projectId, bytes));
      modFiles.push(mod.fileName);
      keep.add(mod.fileName);
    }
  }
  const removed = await removeUnlistedInstalls(installDeps, modsDir, keep);
  // A server without mods (a game that plays without them) keeps no Fabric API of MSM's either,
  // so players without mods can join it.
  if (!wantsFabricApi) removed.push(...(await removeOwnFabricApi(fs, deps.sha512, modsDir)));

  // The world.
  let world: EnsuredServer['world'] = null;
  if (recipe.world !== null) {
    const { folder, source, replace } = recipe.world;
    const target = joinInstallPath(serverDir, folder);
    let copied = false;
    if (source !== null) {
      if (!isAbsoluteInstallPath(source) || !(await fs.exists(source))) {
        throw new ServerError('server.bad-recipe', `The world "${folder}" to copy was not found.`);
      }
      if (isPathInside(serverDir, source) || isPathInside(source, serverDir)) {
        throw new ServerError(
          'server.bad-recipe',
          `The world "${folder}" cannot be copied into its own server.`,
        );
      }
      const exists = await fs.exists(target);
      const ours = marker.worlds.includes(folder);
      if (exists && !ours) {
        throw new ServerError(
          'server.foreign-world',
          `The server already has a world named "${folder}" that MCSuperMods did not put there. Remove the server in Settings and make it again.`,
        );
      }
      if (!exists || replace) {
        if (fs.rename === undefined) {
          throw new ServerError(
            'server.cannot-stage',
            'MCSuperMods cannot copy the world here: the folder cannot be moved into place in one step.',
          );
        }
        // Built whole beside the server's files, then moved into place; MSM's earlier copy goes
        // only once the new one is whole.
        await clearStaleStaging(fs, serverDir);
        await buildStaged(
          fs,
          serverDir,
          folder,
          async (staged) => {
            await copyTree(fs, source, staged, 0);
            if (exists) await fs.remove(target);
          },
          stagingId(),
        );
        copied = true;
        if (!ours) {
          marker.worlds = [...marker.worlds, folder].sort();
          await saveMarker();
        }
      }
    }
    world = { folder, copied };
  }

  // `server.properties`.
  const propertiesPath = joinInstallPath(serverDir, SERVER_PROPERTIES_FILE);
  const before = (await fs.exists(propertiesPath))
    ? decode(await fs.readFile(propertiesPath))
    : null;
  let applied: ReturnType<typeof applyServerProperties>;
  try {
    applied = applyServerProperties(
      before,
      wanted,
      marker.properties,
      new Set(options.force ?? []),
    );
  } catch (error) {
    throw new ServerError(
      'server.bad-recipe',
      error instanceof Error ? error.message : String(error),
    );
  }
  if (applied.text !== before) await fs.writeFile(propertiesPath, encode(applied.text));
  marker.properties = applied.written;
  await saveMarker();

  // The EULA: written again only from the user's own earlier acceptance of this folder.
  let eula = await readEula(fs, serverDir);
  if (eula === 'missing' && marker.eula !== null) {
    await writeEulaAcceptance(fs, serverDir, { accepted: true, at: marker.eula.acceptedAt });
    eula = 'accepted';
  }

  return {
    serversDir,
    folder: placement.folder,
    serverDir,
    name: recipe.place.name,
    created,
    launcher: { ...launcher, written: launcherWritten },
    mods: { files: [...modFiles].sort(), removed: removed.sort() },
    world,
    properties: applied.effective,
    keptUserValues: applied.keptUserValues,
    port: Number(applied.effective['server-port'] ?? wanted['server-port']),
    eula,
  };
}

function launcherChanged(): ServerError {
  return new ServerError(
    'server.launcher-changed',
    "The server's launcher file is not the one MCSuperMods put there, so the server was not started. Remove the server in Settings and make it again.",
  );
}

/** Removes the Fabric API jars MSM recorded in `modsDir` whose bytes are unchanged. */
async function removeOwnFabricApi(
  fs: InstallFileSystem,
  sha512: Sha512,
  modsDir: string,
): Promise<string[]> {
  const record = await readInstalledRecord(fs, modsDir);
  const removed: string[] = [];
  let dropped = false;
  for (const [name, entry] of Object.entries(record.files)) {
    if (entry.role !== 'fabric-api') continue;
    const path = joinInstallPath(modsDir, name);
    if ((await fs.exists(path)) && (await sha512(await fs.readFile(path))) === entry.sha512) {
      await fs.remove(path);
      removed.push(name);
    }
    delete record.files[name];
    dropped = true;
  }
  if (dropped) {
    await fs.writeFile(joinInstallPath(modsDir, INSTALLED_RECORD_FILE), encode(stableJson(record)));
  }
  return removed;
}

/** The deepest folder a world copy follows. */
const MAX_COPY_DEPTH = 32;

async function copyTree(
  fs: InstallFileSystem,
  from: string,
  to: string,
  depth: number,
): Promise<void> {
  if (depth > MAX_COPY_DEPTH) return;
  await fs.mkdirp(to);
  for (const entry of await fs.readDir(from)) {
    if (!isSafeSegment(entry.name)) continue;
    // The game's lock file belongs to a running game, never to a copy.
    if (depth === 0 && entry.name === 'session.lock') continue;
    const src = joinInstallPath(from, entry.name);
    const dst = joinInstallPath(to, entry.name);
    if (entry.kind === 'directory') await copyTree(fs, src, dst, depth + 1);
    else await fs.writeFile(dst, await fs.readFile(src));
  }
}

/** Reads a folder's marker and checks it is MSM's server folder inside `serversDir`. */
async function ownServer(
  fs: InstallFileSystem,
  serversDir: string,
  serverDir: string,
): Promise<ServerMarker> {
  if (!isAbsoluteInstallPath(serversDir) || !isAbsoluteInstallPath(serverDir)) {
    throw new ServerError('server.no-folder', "MCSuperMods' servers folder was not found.");
  }
  await assertInside(fs, serversDir, serverDir);
  const marker = await readServerMarker(fs, serverDir);
  if (marker === 'absent' || marker === 'unreadable') {
    throw new ServerError(
      'server.not-ours',
      'This folder is not a server MCSuperMods made, so it leaves it alone.',
    );
  }
  return marker;
}

/**
 * Records the user's acceptance of the Minecraft EULA for one server folder of MSM's and writes
 * `eula=true` there (ADR 0133 D8). Without a real `acceptance` (`accepted` exactly `true`, a
 * time) it is `server.eula-not-accepted` and nothing is written. Call it only while the server
 * is stopped.
 */
export async function acceptServerEula(
  fs: InstallFileSystem,
  serversDir: string,
  serverDir: string,
  acceptance: EulaAcceptance,
): Promise<void> {
  if (!isEulaAcceptance(acceptance)) {
    throw new ServerError(
      'server.eula-not-accepted',
      'The server cannot be started until you accept the Minecraft EULA.',
    );
  }
  const marker = await ownServer(fs, serversDir, serverDir);
  await writeEulaAcceptance(fs, serverDir, acceptance);
  marker.eula = { acceptedAt: acceptance.at };
  await fs.writeFile(joinInstallPath(serverDir, SERVER_MARKER), encode(serverMarkerText(marker)));
}

/** {@link planServerStart}'s answer: never throws. */
export type ServerStartPlan =
  | { ok: true; command: ServerStartCommand; port: number; levelName: string }
  | { ok: false; code: ServerError['code']; message: string };

/**
 * Checks a server folder just before a start and gives the command: the folder is MSM's, the
 * launcher jar is the one recorded (a changed jar is refused), and the EULA is accepted in it.
 * Read-only. The caller then checks the port is free, spawns the command without a shell and
 * reads the log for the state (`serverStateAfter`).
 */
export async function planServerStart(
  deps: { fs: InstallFileSystem; sha256?: Sha256 },
  serversDir: string,
  serverDir: string,
  java: string,
  options: { memoryMb?: number } = {},
): Promise<ServerStartPlan> {
  const { fs } = deps;
  const sha256 = deps.sha256 ?? webCryptoSha256;
  try {
    const marker = await ownServer(fs, serversDir, serverDir);
    const jarPath = joinInstallPath(serverDir, SERVER_LAUNCHER_FILE);
    if (marker.launcher === null || !(await fs.exists(jarPath))) {
      return {
        ok: false,
        code: 'server.not-ours',
        message: 'The server is not ready yet. Make it again from Play with friends.',
      };
    }
    if ((await sha256(await fs.readFile(jarPath))) !== marker.launcher.sha256)
      throw launcherChanged();
    if ((await readEula(fs, serverDir)) !== 'accepted') {
      return {
        ok: false,
        code: 'server.eula-needed',
        message: 'The server does not start until you accept the Minecraft EULA.',
      };
    }
    const properties = joinInstallPath(serverDir, SERVER_PROPERTIES_FILE);
    const text = (await fs.exists(properties)) ? decode(await fs.readFile(properties)) : '';
    const values = parseProperties(text);
    return {
      ok: true,
      command: serverStartCommand({
        java,
        serverDir,
        ...(options.memoryMb === undefined ? {} : { memoryMb: options.memoryMb }),
      }),
      port: Number(values.get('server-port') ?? DEFAULT_SERVER_PORT),
      levelName: values.get('level-name') ?? 'world',
    };
  } catch (error) {
    if (error instanceof ServerError)
      return { ok: false, code: error.code, message: error.message };
    return {
      ok: false,
      code: 'server.not-ours',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** One server folder MSM made, as {@link listServers} finds it. */
export interface ManagedServerEntry {
  serversDir: string;
  folder: string;
  serverDir: string;
  kind: ServerKind;
  owner: string;
  mcVersion: string;
  loaderVersion: string | null;
  /** Whether the user accepted the EULA for it. */
  eulaAccepted: boolean;
}

/**
 * The server folders MSM made in `serversDir`: folders holding a readable server marker,
 * sorted by name. Read-only; hidden folders (staging), unsafe names and folders whose real
 * path leaves `serversDir` are skipped. A missing folder gives an empty list.
 */
export async function listServers(
  fs: InstallFileSystem,
  serversDir: string,
): Promise<ManagedServerEntry[]> {
  if (!isAbsoluteInstallPath(serversDir) || !(await fs.exists(serversDir))) return [];
  let entries: Awaited<ReturnType<InstallFileSystem['readDir']>>;
  try {
    entries = await fs.readDir(serversDir);
  } catch {
    return [];
  }
  const out: ManagedServerEntry[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'directory' || entry.name.startsWith('.') || !isSafeSegment(entry.name))
      continue;
    const serverDir = joinInstallPath(serversDir, entry.name);
    const marker = await readServerMarker(fs, serverDir);
    if (marker === 'absent' || marker === 'unreadable') continue;
    try {
      await assertInside(fs, serversDir, serverDir);
    } catch {
      continue;
    }
    out.push({
      serversDir,
      folder: entry.name,
      serverDir,
      kind: marker.kind,
      owner: marker.owner,
      mcVersion: marker.minecraft,
      loaderVersion: marker.loader,
      eulaAccepted: (await readEula(fs, serverDir)) === 'accepted',
    });
  }
  return out.sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0));
}
