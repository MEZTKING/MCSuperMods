/**
 * One-click Play and Reload in the main process (ADR 0084). Play installs the content jar and
 * Fabric API into the managed Prism instance `MCSuperMods Test (<mc>)` (created on the first
 * Play), writes the dev session files into its game folder (`msm-dev/`, the dev resource pack
 * and the `options.txt` line) and starts Prism on it; when the game is already running it asks
 * it to quit first and waits (D5). Reload compares the lowered project with `installed.json`
 * and writes what can change in place (the world's dev data pack, script and event overlays,
 * the dev resource pack) with a reload or reopen request; what needs a restart comes back as
 * reasons in plain words (D6). Main polls `status.json` every second while a window is
 * focused and pushes the status when it changes (D7).
 *
 * Safety (D9): every write goes into the managed instance (its game folder, plus the instance
 * files `createManagedInstance` writes) or the download cache, and only into an instance that
 * holds the `.msm-managed.json` marker. The user's other instances and settings are never
 * touched (Play does not change the install target).
 *
 * Play my game (ADR 0116 D1, B554) is the same Play with `PlayInput.game`: it opens or makes
 * `msm-game-<ns>` with the world setup's world preset (the content jar's data, which every Play
 * installs), game mode and difficulty; the runtime picks a random seed and reports it in
 * `status.json`. Its setup function has no lines (no test area, chests or game rules). Reload
 * works in it as in the test world; Start over renames it as New test world does.
 *
 * File formats, change sorting and the setup function live in `@msm/interop` `fabric/`; this
 * module adds the managed instance, path containment, scripts, the clock and the spawn.
 *
 * @packageDocumentation
 */

import { realpath as realpathNode, rename as renameNode } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import {
  cachedFabricApi,
  checkedGame,
  classifyChanges,
  contentJarModsFileName,
  createManagedInstance,
  DEV_RESOURCE_PACK_ID,
  type DevChanges,
  type DevJarFacts,
  type DevOutputSource,
  type DevRequest,
  type DevSequence,
  type DevStatus,
  type Downloader,
  definitionKind,
  devDataPackPath,
  devFileText,
  devInfo,
  devPaths,
  ensureFabricApi,
  type FabricApiInstall,
  type FabricTestFacts,
  fetchDownloader,
  findLauncherProgram,
  GAME_SETUP_FUNCTION,
  type GameLocation,
  gameSetupFunctionText,
  hashOutputs,
  type InstallFileSystem,
  installContentJar,
  installedDevRecord,
  installedFiles,
  isGameRunning,
  isGameWorldFolder,
  isHandled,
  type LauncherProgramEnv,
  launchArguments,
  locationPathKey,
  MANAGED_INSTANCE_MARKER,
  managedInstanceName,
  nextPlayRequest,
  nextRequest,
  ONBOARD_ACCESSIBILITY_KEY,
  oldWorldFolder,
  overlayAfterReload,
  overlayTarget,
  type PlayRequest,
  parseDevInfo,
  parseDevRequest,
  parseDevStatus,
  parseInstalledDevRecord,
  parsePlayRequest,
  playWorldFolder,
  QUIT_WAIT_MS,
  type RestartReason,
  readMmcConfig,
  removeUnlistedInstalls,
  type Sha256,
  type Sha512,
  setupFunctionLines,
  setupFunctionText,
  stableJson,
  webCryptoSha256,
  webCryptoSha512,
  withDefaultOption,
  withResourcePack,
} from '@msm/interop';
import type { DevFacts, PackFormat } from '@msm/plugin-api';
import { targetById } from '@msm/targets';
import { unzipSync } from 'fflate';
import type {
  PlayFailureCode,
  PlayFailure as PlayFailureResult,
  PlayGameState,
  PlayInput,
  PlayOutputFile,
  PlayRestartReason,
  PlayResult,
  PlayStatus,
  PlayWorldKind,
  ReloadInput,
  ReloadResult,
  ScriptTranspileOutcome,
  TestWorldResult,
} from '../../shared/platform';
import type { SettingsStore } from './settings';
import {
  builtInFabricFacts,
  checkedFolderInGame,
  type FolderQueue,
  findPrismRoot,
  messageOf,
  NO_QUEUE,
  spawnDetached,
} from './test-in-minecraft';

/** How long after starting Prism the status says "Starting…" without a word from the game. */
export const STARTING_WINDOW_MS = 180_000;
/**
 * After the game has handled a quit request, how long without a new status counts as gone
 * (the runtime writes one every 2 seconds while it runs).
 */
export const QUIT_SETTLE_MS = 5_000;
/** How often Play looks at the status and the jar while it waits for the game to close. */
export const QUIT_POLL_MS = 500;
/** How often main reads `status.json` while a window is focused (ADR 0084 D7). */
export const STATUS_POLL_MS = 1_000;

/** The plain message when the game does not close or keeps the jar locked (ADR 0084 D5). */
export const CLOSE_MINECRAFT_MESSAGE = 'Close Minecraft, then press Play again.';

/** The status chip's words (ADR 0084 D7), by state. */
export const PLAY_STATE_LABELS: Readonly<Record<PlayGameState, string>> = {
  'no-prism': 'Prism Launcher not found',
  'not-running': 'Game not running',
  starting: 'Starting…',
  'test-world': 'In the test world',
  'game-world': 'In my game',
  'other-world': 'In another world',
};
/** The chip's words when a Reload found changes that need a restart and the game runs. */
export const RESTART_NEEDED_LABEL = 'Restart needed';

/** The main-process Play service; mirrors `PlatformAdapter['play']` plus main-only parts. */
export interface PlayService {
  /** The managed instance and the game, for `targetId`. Never writes. */
  status(targetId: string): Promise<PlayStatus>;
  /** Installs, writes the dev files and starts the game (restarting it when it runs). */
  play(input: PlayInput): Promise<PlayResult>;
  /** Writes what reloads in place and a reload or reopen request; lists restart reasons. */
  reload(input: ReloadInput): Promise<ReloadResult>;
  /** Restart: the same as {@link play} (asks the running game to quit, then starts it). */
  restart(input: PlayInput): Promise<PlayResult>;
  /**
   * Renames the test world (or, with `kind` `game`, Play my game's world: Start over) to
   * `<world>-old-<n>`; the next Play creates a fresh one.
   */
  newTestWorld(targetId: string, namespace: string, kind?: PlayWorldKind): Promise<TestWorldResult>;
  /** Subscribes to status changes (polls and operations); returns an unsubscribe function. */
  onStatus(listener: (status: PlayStatus) => void): () => void;
  /**
   * Turns the once-a-second status poll on (a window is focused) or off. The poll watches the
   * target of the last call; nothing is polled before one.
   */
  setPolling(on: boolean): void;
}

/** What the service needs from its host. */
export interface PlayDeps {
  fs: InstallFileSystem;
  env: LauncherProgramEnv;
  settings: Pick<SettingsStore, 'get' | 'launcherPrograms'>;
  /** The download cache folder (absolute). */
  cacheDir: string;
  /** The app's version, for `dev.json`. */
  appVersion(): Promise<string>;
  /** Transpiles a script for the overlay (main's scripting service). */
  transpile(source: string, name: string): Promise<ScriptTranspileOutcome>;
  download?: Downloader;
  sha512?: Sha512;
  sha256?: Sha256;
  /** The Fabric facts of a target. Defaults to the built-in targets'. */
  facts?(targetId: string): FabricTestFacts;
  /** The dev facts and pack formats of a target. Defaults to the built-in targets'. */
  devFacts?(targetId: string): TargetDevFacts;
  spawnLauncher?(program: string, args: readonly string[]): Promise<void>;
  realpath?(absPath: string): Promise<string>;
  /** Renames a folder (New test world). Defaults to `fs.rename`. */
  rename?(from: string, to: string): Promise<void>;
  /** Milliseconds since the epoch. */
  now?(): number;
  sleep?(ms: number): Promise<void>;
  /** Interval timer for the status poll. */
  setInterval?(fn: () => void, ms: number): unknown;
  clearInterval?(handle: unknown): void;
  /**
   * The launcher folders' queue shared with the instances service (B765): Play makes or updates
   * the test instance in it, so it never stages in a Prism folder while `instances.ensure` does.
   */
  queue?: FolderQueue;
}

/** The version facts Play needs beyond the Fabric versions. */
export interface TargetDevFacts {
  dev: DevFacts;
  packFormats: { resource: PackFormat; data: PackFormat };
}

/** The dev facts of a built-in target. */
export function builtInDevFacts(targetId: string): TargetDevFacts {
  const target = targetById(targetId)?.target;
  if (target === undefined) throw new Error(`Unknown target ${JSON.stringify(targetId)}.`);
  if (target.dev === undefined) {
    throw new Error(`Minecraft ${target.mcVersion} has no test world facts in MSM yet.`);
  }
  return { dev: target.dev, packFormats: target.packFormats };
}

/** The kinds whose definitions may get an event overlay (B369: never potion, particle, additions). */
const EVENT_OVERLAY_KINDS: readonly string[] = ['block', 'item', 'entity', 'effect'];

/** Plain words for definition kinds, in restart reasons. */
const KIND_WORDS: Readonly<Record<string, [one: string, many: string]>> = {
  block: ['block', 'blocks'],
  item: ['item', 'items'],
  entity: ['mob', 'mobs'],
  effect: ['effect', 'effects'],
  potion: ['potion', 'potions'],
  particle: ['particle', 'particles'],
  biome_addition: ['world addition', 'world additions'],
  loot_addition: ['extra drop', 'extra drops'],
};

/**
 * A restart reason in plain words (ADR 0084 D6), for example "You added a new block: Ruby
 * Lamp. New blocks are only read when Minecraft starts."
 */
export function restartReasonText(reason: RestartReason, name: string): string {
  const [one, many] = KIND_WORDS[reason.kind ?? ''] ?? ['thing', 'things'];
  switch (reason.reason) {
    case 'new-definition':
      return `You added a new ${one}: ${name}. New ${many} are only read when Minecraft starts.`;
    case 'definition-changed':
      return reason.kind !== undefined && !EVENT_OVERLAY_KINDS.includes(reason.kind)
        ? `You changed the ${one} ${name}. Changes to ${many} are only read when Minecraft starts.`
        : `You changed more than what ${name} does when something happens. Changes like that are only read when Minecraft starts.`;
    case 'definition-renamed':
      return `You renamed the ${one} ${name}. New names are only read when Minecraft starts.`;
    case 'file-removed':
      return reason.kind !== undefined
        ? `You removed the ${one} ${name}. Minecraft keeps it until it starts again.`
        : `You removed ${name}. Minecraft keeps it until it starts again.`;
    case 'sound-events':
      return 'You added or removed a sound. Sounds are only read when Minecraft starts.';
    case 'mod-file':
      return reason.path === 'fabric.mod.json'
        ? "Your mod's details changed. They are only read when Minecraft starts."
        : `The file ${reason.path} changed. It is only read when Minecraft starts.`;
    case 'mod-id':
      return "Your mod's id changed. It is only read when Minecraft starts.";
    case 'runtime-version':
      return 'MCSuperMods has a new version of its runtime. It is only loaded when Minecraft starts.';
    case 'fabric-api-version':
      return 'The Fabric API version changed. It is only loaded when Minecraft starts.';
  }
}

function plainName(reason: RestartReason, names: Readonly<Record<string, string>>): string {
  if (reason.elementId !== undefined) {
    const name = names[reason.elementId];
    if (name !== undefined && name.trim() !== '') return name;
    return reason.elementId;
  }
  return reason.path;
}

/** The jar-level facts of a content jar: its `fabric.mod.json` hash and nested runtime. */
export async function jarFacts(
  jar: Uint8Array,
  modId: string,
  fabricApi: string,
  sha256: Sha256,
): Promise<DevJarFacts> {
  const names: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(jar, {
      filter(file) {
        names.push(file.name);
        return file.name === 'fabric.mod.json';
      },
    });
  } catch (error) {
    throw new Error(`The mod jar could not be read (${messageOf(error)}).`);
  }
  const modJson = files['fabric.mod.json'];
  if (modJson === undefined) throw new Error('The mod jar has no fabric.mod.json.');
  const runtime = names
    .map((name) => /^META-INF\/jars\/msm_runtime-(.+)\.jar$/.exec(name)?.[1])
    .find((version) => version !== undefined);
  return { modId, runtime: runtime ?? 'separate', fabricApi, modJson: await sha256(modJson) };
}

function packMcmeta(format: PackFormat, description: string): Uint8Array {
  return new TextEncoder().encode(
    stableJson({
      pack: {
        description,
        max_format: [format.major, format.minor],
        min_format: [format.major, format.minor],
        pack_format: format.major,
      },
    }),
  );
}

const DEV_PACK_DESCRIPTION = 'MCSuperMods test changes';

function isLockError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
}

class PlayFailure extends Error {
  readonly code: PlayFailureCode;

  constructor(code: PlayFailureCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** The lowered files as `@msm/interop` hashes them (the layer is not hashed). */
function devSources(outputs: readonly PlayOutputFile[]): DevOutputSource[] {
  return outputs.map((file) => ({
    path: file.path,
    contents: file.contents,
    layer: file.path.startsWith('assets/')
      ? 'resourcepack'
      : file.path.startsWith('data/')
        ? 'datapack'
        : 'msm',
    ...(file.elementId === undefined ? {} : { elementId: file.elementId }),
  }));
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Creates the service. */
export function createPlayService(deps: PlayDeps): PlayService {
  const { fs } = deps;
  const factsFor = deps.facts ?? builtInFabricFacts;
  const devFactsFor = deps.devFacts ?? builtInDevFacts;
  const sha512 = deps.sha512 ?? webCryptoSha512;
  const sha256 = deps.sha256 ?? webCryptoSha256;
  const download = deps.download ?? fetchDownloader;
  const spawnLauncher = deps.spawnLauncher ?? spawnDetached;
  const resolveReal = deps.realpath ?? ((path: string) => realpathNode(path));
  const rename = deps.rename ?? renameNode;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const queue = deps.queue ?? NO_QUEUE;
  const startInterval = deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const stopInterval =
    deps.clearInterval ?? ((handle: unknown) => clearInterval(handle as NodeJS.Timeout));

  /** Per target: when Prism was last started, and the last Reload's restart reasons. */
  const launchedAt = new Map<string, number>();
  const restartNeeded = new Map<string, PlayRestartReason[]>();
  let busy: { targetId: string; op: 'play' | 'reload' | 'restart'; progress: string } | null = null;
  let watchedTarget: string | null = null;
  const listeners = new Set<(status: PlayStatus) => void>();
  let lastPushed = '';
  // Pushes read the status asynchronously and can finish out of order (a slow read from an
  // earlier poll or operation finishing after a later one): only the newest read is pushed.
  let pushesStarted = 0;
  let newestPushed = 0;
  let pollHandle: unknown = null;
  let polling = false;

  const readText = async (path: string): Promise<string | null> => {
    try {
      return textDecoder.decode(await fs.readFile(path));
    } catch {
      return null;
    }
  };

  /** The managed instance's location, when it exists with its marker. Never writes. */
  const findManaged = async (
    targetId: string,
  ): Promise<
    | { kind: 'no-prism' }
    | { kind: 'missing'; root: string }
    | { kind: 'ready'; root: string; location: GameLocation }
  > => {
    const root = await findPrismRoot(fs, deps.env, deps.settings);
    if (root === null) return { kind: 'no-prism' };
    const facts = factsFor(targetId);
    const folder = managedInstanceName(facts.mcVersion);
    const { instanceDirs } = await readMmcConfig(fs, root);
    for (const instancesDir of instanceDirs) {
      const instanceDir = join(instancesDir, folder);
      if (!(await fs.exists(join(instanceDir, MANAGED_INSTANCE_MARKER)))) continue;
      return { kind: 'ready', root, location: managedLocation(root, instanceDir, folder, facts) };
    }
    return { kind: 'missing', root };
  };

  const managedLocation = (
    root: string,
    instanceDir: string,
    folder: string,
    facts: FabricTestFacts,
  ): GameLocation => {
    // Prism's game root is `minecraft/`; `createManagedInstance` always creates it.
    const gameDir = join(instanceDir, 'minecraft');
    return {
      ref: { launcher: 'prism', root: normalize(root), instance: folder },
      id: `prism:${folder}`,
      displayName: folder,
      mcVersion: facts.mcVersion,
      loader: { kind: 'fabric', version: facts.loader },
      gameDir,
      modsDir: join(gameDir, 'mods'),
      instanceDir,
      problems: [],
    };
  };

  const readSession = async (gameDir: string) => {
    const paths = devPaths(gameDir);
    const [info, play, request, status] = await Promise.all([
      readText(paths.info).then(parseDevInfo),
      readText(paths.play).then(parsePlayRequest),
      readText(paths.request).then(parseDevRequest),
      readText(paths.status).then(parseDevStatus),
    ]);
    return { paths, info, play, request, status };
  };

  const computeStatus = async (targetId: string): Promise<PlayStatus> => {
    const facts = factsFor(targetId);
    const instanceName = managedInstanceName(facts.mcVersion);
    const managed = await findManaged(targetId);
    const reasons = restartNeeded.get(targetId) ?? [];
    const base = {
      targetId,
      mcVersion: facts.mcVersion,
      instanceName,
      restartNeeded: reasons,
      busy: busy !== null && busy.targetId === targetId ? busy.op : null,
      progress: busy !== null && busy.targetId === targetId ? busy.progress : null,
    };
    if (managed.kind !== 'ready') {
      const state: PlayGameState = managed.kind === 'no-prism' ? 'no-prism' : 'not-running';
      return {
        ...base,
        instance: managed.kind,
        gameDir: null,
        state,
        testWorld: null,
        world: null,
        seed: null,
        handled: null,
        canReload: false,
        label: PLAY_STATE_LABELS[state],
      };
    }
    const { info, status } = await readSession(managed.location.gameDir);
    const time = now();
    const running = isGameRunning(status, time);
    const testWorld = info?.world ?? null;
    let state: PlayGameState;
    if (running && status !== null) {
      state =
        status.state === 'world'
          ? status.world !== null && status.world === testWorld
            ? isGameWorldFolder(testWorld)
              ? 'game-world'
              : 'test-world'
            : 'other-world'
          : 'starting';
    } else {
      const started = launchedAt.get(targetId);
      // The starting window only applies before the first sign of life: a game that wrote any
      // status after the launch and then stopped is simply not running.
      const sawGame = status !== null && started !== undefined && status.time >= started;
      state =
        !sawGame && started !== undefined && time - started < STARTING_WINDOW_MS
          ? 'starting'
          : 'not-running';
    }
    const label =
      reasons.length > 0 && state !== 'not-running'
        ? RESTART_NEEDED_LABEL
        : PLAY_STATE_LABELS[state];
    return {
      ...base,
      instance: 'ready',
      gameDir: normalize(managed.location.gameDir),
      state,
      testWorld,
      world: running ? (status?.world ?? null) : null,
      seed: running && status?.state === 'world' ? (status.seed ?? null) : null,
      handled: status?.handled ?? null,
      canReload: state === 'test-world' || state === 'game-world',
      label,
    };
  };

  const push = async (targetId: string): Promise<void> => {
    if (listeners.size === 0) return;
    const order = ++pushesStarted;
    let status: PlayStatus;
    try {
      status = await computeStatus(targetId);
    } catch {
      return;
    }
    if (order < newestPushed) return;
    newestPushed = order;
    const key = JSON.stringify(status);
    if (key === lastPushed) return;
    lastPushed = key;
    for (const listener of listeners) {
      try {
        listener(status);
      } catch {
        // A listener's failure must not stop the others.
      }
    }
  };

  const setProgress = (targetId: string, op: 'play' | 'reload' | 'restart', progress: string) => {
    busy = { targetId, op, progress };
    void push(targetId);
  };

  /** Writes `data` to `path` inside the game folder, creating its folder after the containment check. */
  const writeInGame = async (
    location: GameLocation,
    checked: Set<string>,
    path: string,
    data: Uint8Array,
  ): Promise<void> => {
    const folder = dirname(path);
    if (!checked.has(folder)) {
      await checkedFolderInGame(
        { fs, realpath: resolveReal },
        location,
        folder,
        'A test folder',
        true,
      );
      checked.add(folder);
    }
    await fs.writeFile(path, data);
  };

  /** Removes `path` after checking its folder is inside the game folder. */
  const removeInGame = async (location: GameLocation, path: string): Promise<void> => {
    if (!(await fs.exists(path))) return;
    await checkedFolderInGame(
      { fs, realpath: resolveReal },
      location,
      dirname(path),
      'A test folder',
    );
    await fs.remove(path);
  };

  /** Waits for the running game to close after a quit request; false when it does not. */
  const waitForQuit = async (
    gameDir: string,
    seq: number,
    install: () => Promise<boolean>,
  ): Promise<boolean> => {
    const deadline = now() + QUIT_WAIT_MS;
    for (;;) {
      const status = parseDevStatus(await readText(devPaths(gameDir).status));
      const time = now();
      const gone =
        !isGameRunning(status, time) ||
        (isHandled(status, seq) && status !== null && time - status.time >= QUIT_SETTLE_MS);
      if (gone && (await install())) return true;
      if (time >= deadline) return false;
      await sleep(QUIT_POLL_MS);
    }
  };

  const runPlay = async (input: PlayInput, op: 'play' | 'restart'): Promise<PlayResult> => {
    const { targetId } = input;
    const facts = factsFor(targetId);
    const target = devFactsFor(targetId);
    const namespace = input.namespaces[0];
    if (namespace === undefined)
      throw new PlayFailure('bad-input', 'The project has no namespace.');
    let game: ReturnType<typeof checkedGame> | undefined;
    try {
      game = input.game === undefined ? undefined : checkedGame(input.game);
    } catch (error) {
      throw new PlayFailure('bad-input', messageOf(error));
    }
    const world = playWorldFolder(game === undefined ? 'test' : 'game', namespace);

    setProgress(targetId, op, 'Getting the test instance ready…');
    const root = await findPrismRoot(fs, deps.env, deps.settings);
    if (root === null) {
      throw new PlayFailure(
        'no-prism',
        'Prism Launcher was not found. Install Prism Launcher, sign in with your Microsoft account and start it once, then press Play again.',
      );
    }
    const [instancesDir] = (await readMmcConfig(fs, root)).instanceDirs;
    if (instancesDir === undefined) {
      throw new PlayFailure('no-prism', 'Prism Launcher has no instances folder.');
    }
    let created: Awaited<ReturnType<typeof createManagedInstance>>;
    try {
      // The renderer makes a missing test instance through `instances.ensure` first (the offer
      // card, ADR 0133 D3); here it is only checked and brought up to date, in the launcher
      // folder's queue so the two never overlap (B765).
      created = await queue(locationPathKey(root), async () => {
        await fs.mkdirp(instancesDir);
        return createManagedInstance(fs, instancesDir, facts);
      });
    } catch (error) {
      throw new PlayFailure('instance-not-managed', messageOf(error));
    }
    const location = managedLocation(root, created.instanceDir, created.folder, facts);
    const checked = new Set<string>();
    const modsDir = await checkedFolderInGame(
      { fs, realpath: resolveReal },
      location,
      join(location.gameDir, 'mods'),
    );
    const gameDir = normalize(location.gameDir);
    checked.add(modsDir);

    // Everything that may download or fail is done before the game is asked to quit.
    const jar = await jarFacts(input.jar, input.modId, facts.api, sha256);
    const outputs = await hashOutputs(devSources(input.outputs), sha256);
    let setup: ReturnType<typeof setupFunctionLines>;
    try {
      setup =
        game === undefined
          ? setupFunctionLines({ gameRules: target.dev.gameRules, items: input.items })
          : GAME_SETUP_FUNCTION;
    } catch (error) {
      throw new PlayFailure('bad-input', messageOf(error));
    }
    setProgress(targetId, op, 'Getting Fabric API…');
    const api = await cachedFabricApi({ fs, cacheDir: deps.cacheDir, download, sha512 }, facts.api);
    const appVersion = await deps.appVersion();

    const installDeps = { fs, sha512 };
    let apiState: FabricApiInstall['state'] = 'present';
    const install = async (): Promise<boolean> => {
      try {
        apiState = (await ensureFabricApi(installDeps, modsDir, facts.api, async () => api)).state;
        await installContentJar(installDeps, modsDir, input.modId, input.jar);
        await removeUnlistedInstalls(
          installDeps,
          modsDir,
          new Set([contentJarModsFileName(input.modId)]),
        );
        return true;
      } catch (error) {
        if (isLockError(error)) return false;
        throw error;
      }
    };

    const session = await readSession(gameDir);
    let restarted = false;
    if (isGameRunning(session.status, now())) {
      setProgress(targetId, op, 'Waiting for Minecraft to close…');
      const quit = nextRequest(sequence(session), 'quit');
      await writeInGame(location, checked, session.paths.request, text(quit));
      restarted = true;
      if (!(await waitForQuit(gameDir, quit.seq, install))) {
        throw new PlayFailure('game-not-closing', CLOSE_MINECRAFT_MESSAGE);
      }
    } else {
      setProgress(targetId, op, 'Installing the mod…');
      if (!(await install())) throw new PlayFailure('jar-locked', CLOSE_MINECRAFT_MESSAGE);
    }

    setProgress(targetId, op, 'Writing the test world files…');
    const paths = devPaths(gameDir);
    // Every Play clears the overlays: the new jar holds everything.
    await removeInGame(location, paths.overlay);
    await removeInGame(location, paths.resourcePack);
    await removeInGame(location, devDataPackPath(gameDir, world));
    await writeInGame(
      location,
      checked,
      join(paths.resourcePack, 'pack.mcmeta'),
      packMcmeta(target.packFormats.resource, DEV_PACK_DESCRIPTION),
    );
    const optionsPath = join(gameDir, 'options.txt');
    const options = await readText(optionsPath);
    const nextOptions = withDefaultOption(
      withResourcePack(options, DEV_RESOURCE_PACK_ID),
      ONBOARD_ACCESSIBILITY_KEY,
      'false',
    );
    if (nextOptions !== options) {
      await writeInGame(location, checked, optionsPath, textEncoder.encode(nextOptions));
    }
    await writeInGame(
      location,
      checked,
      paths.setup,
      textEncoder.encode(game === undefined ? setupFunctionText(setup) : gameSetupFunctionText()),
    );
    await writeInGame(
      location,
      checked,
      paths.installed,
      text(installedDevRecord(jar, installedFiles(outputs))),
    );
    await writeInGame(
      location,
      checked,
      paths.info,
      text(devInfo({ namespaces: input.namespaces, target: targetId, world, appVersion })),
    );
    const latest = await readSession(gameDir);
    const playRequest = nextPlayRequest(sequence(latest), world, game);
    await writeInGame(location, checked, paths.play, text(playRequest));

    setProgress(targetId, op, 'Starting Prism Launcher…');
    restartNeeded.delete(targetId);
    const programs = await deps.settings.launcherPrograms();
    const program = await findLauncherProgram(fs, 'prism', root, deps.env, programs.prism);
    let launched = false;
    let note: string | null = null;
    if (program === null) {
      note = `Prism Launcher was not found, so it was not started. Start "${location.displayName}" from it.`;
    } else {
      try {
        await spawnLauncher(program, launchArguments(location.ref, deps.env));
        launched = true;
        launchedAt.set(targetId, now());
      } catch (error) {
        note = `Prism Launcher could not be started (${messageOf(error)}). Start "${location.displayName}" from it.`;
      }
    }
    return {
      ok: true,
      instanceName: location.displayName,
      instanceCreated: created.created,
      gameDir,
      world,
      restarted,
      launched,
      note,
      fabricApi: apiState,
      itemsLeftOut: setup.leftOut,
      seq: playRequest.seq,
    };
  };

  const runReload = async (input: ReloadInput): Promise<ReloadResult> => {
    const { targetId } = input;
    const facts = factsFor(targetId);
    const target = devFactsFor(targetId);
    const managed = await findManaged(targetId);
    if (managed.kind !== 'ready') {
      throw new PlayFailure('not-played', 'Press Play first: the test instance is not set up yet.');
    }
    const { location } = managed;
    const gameDir = normalize(location.gameDir);
    const session = await readSession(gameDir);
    const installed = parseInstalledDevRecord(await readText(session.paths.installed));
    if (installed === null || session.info === null) {
      throw new PlayFailure(
        'not-played',
        'Press Play first: the game has not been started from MCSuperMods.',
      );
    }
    const world = session.info.world;
    const status = session.status;
    if (!isGameRunning(status, now()) || status?.state !== 'world' || status.world !== world) {
      throw new PlayFailure(
        'not-in-world',
        isGameWorldFolder(world)
          ? 'Reload works while Minecraft is in your game. Press Play my game first.'
          : 'Reload works while Minecraft is in the test world. Press Play first.',
      );
    }
    setProgress(targetId, 'reload', 'Comparing your changes…');
    const files = await hashOutputs(devSources(input.outputs), sha256);
    const nextJar =
      input.jar === undefined
        ? { ...installed.jar, modId: input.modId }
        : await jarFacts(input.jar, input.modId, facts.api, sha256);
    const next = { jar: nextJar, files };
    const changes = guardEventOverlays(
      classifyChanges(installed, next, { worldDataFolders: target.dev.worldDataFolders }),
    );
    const names = input.names ?? {};
    const restart: PlayRestartReason[] = changes.restart.map((reason) => ({
      reason: reason.reason,
      path: reason.path,
      ...(reason.from === undefined ? {} : { from: reason.from }),
      ...(reason.kind === undefined ? {} : { kind: reason.kind }),
      ...(reason.elementId === undefined ? {} : { elementId: reason.elementId }),
      text: restartReasonText(reason, plainName(reason, names)),
    }));
    if (restart.length > 0) restartNeeded.set(targetId, restart);
    else restartNeeded.delete(targetId);

    const counts = {
      data: changes.reload.data.length,
      scripts: changes.reload.scripts.length,
      events: changes.reload.events.length,
      assets: changes.reload.assets.length,
      worldData: changes.reopenWorld.length,
      removed: changes.stale.length,
    };
    if (changes.pending === 0) {
      return {
        ok: true,
        action: 'none',
        seq: null,
        changes: 0,
        assets: false,
        counts,
        restart,
        message:
          restart.length > 0
            ? 'Nothing else to reload: the other changes need a restart.'
            : 'Nothing to reload: Minecraft already has your latest changes.',
      };
    }

    // Transpile every script before anything is written.
    const sources = new Map(input.outputs.map((file) => [file.path, file]));
    const writes: { path: string; data: Uint8Array }[] = [];
    const reloadable = [
      ...changes.reload.data,
      ...changes.reload.scripts,
      ...changes.reload.events,
      ...changes.reload.assets,
      ...changes.reopenWorld,
    ];
    for (const change of reloadable) {
      const file = sources.get(change.path);
      const relative = overlayTarget(change.path, world, target.dev.worldDataFolders);
      if (file === undefined || relative === undefined) continue;
      writes.push({
        path: join(gameDir, ...relative.split('/')),
        data: await overlayBytes(file),
      });
    }

    setProgress(targetId, 'reload', 'Writing your changes…');
    const checked = new Set<string>();
    for (const stale of changes.stale) {
      const relative = overlayTarget(stale, world, target.dev.worldDataFolders);
      if (relative !== undefined)
        await removeInGame(location, join(gameDir, ...relative.split('/')));
    }
    if (changes.reload.data.length > 0 || changes.reopenWorld.length > 0) {
      await writeInGame(
        location,
        checked,
        join(devDataPackPath(gameDir, world), 'pack.mcmeta'),
        packMcmeta(target.packFormats.data, DEV_PACK_DESCRIPTION),
      );
    }
    if (changes.reload.assets.length > 0) {
      await writeInGame(
        location,
        checked,
        join(session.paths.resourcePack, 'pack.mcmeta'),
        packMcmeta(target.packFormats.resource, DEV_PACK_DESCRIPTION),
      );
    }
    for (const write of writes) await writeInGame(location, checked, write.path, write.data);
    await writeInGame(
      location,
      checked,
      session.paths.installed,
      text({ ...installed, overlay: overlayAfterReload(changes, next) }),
    );
    const assets =
      changes.reload.assets.length > 0 || changes.stale.some((path) => path.startsWith('assets/'));
    const action = changes.reopenWorld.length > 0 ? 'reopen' : 'reload';
    const latest = await readSession(gameDir);
    const request: DevRequest = nextRequest(sequence(latest), action, {
      assets,
      changes: changes.pending,
    });
    await writeInGame(location, checked, session.paths.request, text(request));
    const plural = changes.pending === 1 ? 'change' : 'changes';
    return {
      ok: true,
      action,
      seq: request.seq,
      changes: changes.pending,
      assets,
      counts,
      restart,
      message:
        action === 'reopen'
          ? `Reopening ${isGameWorldFolder(world) ? 'your game' : 'the test world'} for ${changes.pending} ${plural}. New land shows only in new chunks.`
          : `Reloading ${changes.pending} ${plural} in Minecraft.`,
    };
  };

  /** The file as it goes to the overlay: scripts transpiled to JavaScript. */
  const overlayBytes = async (file: PlayOutputFile): Promise<Uint8Array> => {
    const bytes =
      file.contents instanceof Uint8Array
        ? file.contents
        : textEncoder.encode(stableJson(file.contents));
    if (!(file.path.startsWith('msm/') && file.path.endsWith('.ts'))) return bytes;
    const outcome = await deps.transpile(textDecoder.decode(bytes), file.path);
    if ('problems' in outcome) {
      const first = outcome.problems[0]?.message ?? 'it has errors';
      throw new PlayFailure('script-error', `The script ${file.path} could not be built: ${first}`);
    }
    return textEncoder.encode(outcome.js);
  };

  const guarded = async <R>(
    targetId: string,
    run: () => Promise<R>,
  ): Promise<R | PlayFailureResult> => {
    if (busy !== null) {
      return { ok: false, code: 'busy', message: 'Play or Reload is already running.' };
    }
    watchedTarget = targetId;
    try {
      return await run();
    } catch (error) {
      if (error instanceof PlayFailure)
        return { ok: false, code: error.code, message: error.message };
      return { ok: false, code: 'failed', message: messageOf(error) };
    } finally {
      busy = null;
      void push(targetId);
    }
  };

  const poll = (): void => {
    if (watchedTarget !== null) void push(watchedTarget);
  };

  return {
    async status(targetId) {
      watchedTarget = targetId;
      return computeStatus(targetId);
    },
    play: (input) => guarded(input.targetId, () => runPlay(input, 'play')),
    restart: (input) => guarded(input.targetId, () => runPlay(input, 'restart')),
    reload: (input) => guarded(input.targetId, () => runReload(input)),
    async newTestWorld(targetId, namespace, kind = 'test') {
      watchedTarget = targetId;
      try {
        const managed = await findManaged(targetId);
        if (managed.kind !== 'ready') return { ok: true, renamedTo: null };
        const { location } = managed;
        const gameDir = normalize(location.gameDir);
        const { status } = await readSession(gameDir);
        if (isGameRunning(status, now())) {
          return {
            ok: false,
            code: 'game-running',
            message:
              kind === 'game'
                ? 'Close Minecraft first, then choose Start over again.'
                : 'Close Minecraft first, then choose New test world again.',
          };
        }
        const world = playWorldFolder(kind, namespace);
        const saves = join(gameDir, 'saves');
        if (!(await fs.exists(join(saves, world)))) return { ok: true, renamedTo: null };
        await checkedFolderInGame(
          { fs, realpath: resolveReal },
          location,
          saves,
          'The saves folder',
        );
        const existing = (await fs.readDir(saves)).map((entry) => entry.name);
        const renamedTo = oldWorldFolder(world, existing);
        await rename(join(saves, world), join(saves, renamedTo));
        return { ok: true, renamedTo };
      } catch (error) {
        return { ok: false, code: 'failed', message: messageOf(error) };
      } finally {
        void push(targetId);
      }
    },
    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setPolling(on) {
      if (on === polling) return;
      polling = on;
      if (on) {
        pollHandle = startInterval(poll, STATUS_POLL_MS);
        poll();
      } else if (pollHandle !== null) {
        stopInterval(pollHandle);
        pollHandle = null;
      }
    },
  };
}

function text(value: Parameters<typeof devFileText>[0]): Uint8Array {
  return textEncoder.encode(devFileText(value));
}

function sequence(session: {
  play: PlayRequest | null;
  request: DevRequest | null;
  status: DevStatus | null;
}): DevSequence {
  return { play: session.play, request: session.request, status: session.status };
}

/**
 * Moves events-only changes of kinds without events (potions, particles, additions) to the
 * restart list: their overlays are refused by the runtime (B369).
 */
function guardEventOverlays(changes: DevChanges): DevChanges {
  const keep = changes.reload.events.filter((change) =>
    EVENT_OVERLAY_KINDS.includes(definitionKind(change.path) ?? ''),
  );
  if (keep.length === changes.reload.events.length) return changes;
  const moved = changes.reload.events.filter((change) => !keep.includes(change));
  const restart: RestartReason[] = [
    ...changes.restart,
    ...moved.map((change) => {
      const kind = definitionKind(change.path);
      return {
        reason: 'definition-changed' as const,
        path: change.path,
        ...(kind === undefined ? {} : { kind }),
        ...(change.elementId === undefined ? {} : { elementId: change.elementId }),
      };
    }),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    ...changes,
    reload: { ...changes.reload, events: keep },
    restart,
    pending: Math.max(0, changes.pending - moved.length),
  };
}
