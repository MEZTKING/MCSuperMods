/**
 * Instances for anything in the main process (ADR 0133, B763): `plan` works out the run recipe
 * of an action with `recipeFor` in `@msm/interop`, its offer card sentences, what MSM already
 * made for it and whether the card shows (D3); `ensure` makes or updates the managed Prism
 * instance with `ensureInstance`; `list`, `remove` (into the recycle bin) and `showInFolder`
 * serve Settings' "Instances MSM made"; `launch` starts Prism on an instance, joining a server
 * (`--server`) or opening a copied world (`--world`, B760 N3).
 *
 * Safety (D5): every write goes through `ensureInstance` (inside a folder that holds MSM's
 * marker for the recipe, or a new one built in staging and moved into place with one rename)
 * or the download cache; removal takes only a folder `list` found with MSM's marker, checked
 * again just before. `ensureInstance` and removal run one at a time per launcher folder (B761:
 * a second run's stale-staging clean-up could remove the first run's staging folder).
 *
 * Every answer is `{ ok: false, code, message }` on failure, never a throw, as Play's.
 * `playPlain`, `openMap` and `curseForgeProfile` answer `not-yet` until B766, B767 and B768.
 *
 * @packageDocumentation
 */

import { normalize } from 'node:path';
import {
  cachedFabricApi,
  type Downloader,
  defaultPrismDataDirs,
  describeRecipe,
  devPaths,
  ensureInstance,
  FabricTestError,
  fetchDownloader,
  findLauncherProgram,
  type InstallFileSystem,
  InstanceError,
  joinInstallPath,
  type LauncherProgramEnv,
  launchArguments,
  listManaged,
  listServers,
  locationPathKey,
  placeInstance,
  placeServer,
  type RecipeMod,
  type RecipePack,
  type RecipeTargetFacts,
  type RunAction,
  type RunRecipe,
  readInstanceMarker,
  readMmcConfig,
  readServerMarker,
  recipeFor,
  ServerError,
  type Sha512,
  serversFolder,
  webCryptoSha512,
} from '@msm/interop';
import { targetById } from '@msm/targets';
import type {
  InstanceDoneResult,
  InstanceEnsureRequest,
  InstanceEnsureResult,
  InstanceFailure,
  InstanceFailureCode,
  InstanceJar,
  InstanceLaunchResult,
  InstancePlanRequest,
  InstancePlanResult,
  InstanceRecipeView,
  InstancesPlatform,
  ManagedKind,
  ManagedThing,
} from '../../shared/platform';
import type { SettingsStore } from './settings';
import { messageOf, spawnDetached } from './test-in-minecraft';

/** How long after making an instance Prism is given before `--launch` (B760, B763 notes). */
export const LAUNCH_AFTER_CREATE_MS = 1_000;

/** The main-process instances service; mirrors `PlatformAdapter['instances']`. */
export type InstancesService = InstancesPlatform;

/** What the service needs from its host. */
export interface InstancesDeps {
  fs: InstallFileSystem;
  env: LauncherProgramEnv;
  settings: Pick<
    SettingsStore,
    'get' | 'launcherPrograms' | 'instanceSettings' | 'rememberInstanceKind'
  >;
  /** The MSM home (the servers folder is `<msmHome>/servers`). */
  msmHome: string;
  /** The download cache folder (absolute), shared with Play. */
  cacheDir: string;
  download?: Downloader;
  sha512?: Sha512;
  /** The recipe facts of a target. Defaults to the built-in targets'. */
  targetFacts?(targetId: string): RecipeTargetFacts;
  /** Starts the launcher detached; rejects when it cannot be started. */
  spawnLauncher?(program: string, args: readonly string[]): Promise<void>;
  /** Moves a folder to the recycle bin (Electron's `shell.trashItem`). */
  trashItem?(path: string): Promise<void>;
  /** Shows a folder in the file manager (Electron's `shell.showItemInFolder`). */
  showItemInFolder?(path: string): void;
  /** Whether the local server in `serverDir` runs now. */
  serverRunning?(serverDir: string): boolean;
  /** Milliseconds since the epoch. */
  now?(): number;
  sleep?(ms: number): Promise<void>;
}

/** The recipe facts of a built-in target. */
export function builtInRecipeFacts(targetId: string): RecipeTargetFacts {
  const target = targetById(targetId)?.target;
  if (target === undefined) {
    throw new InstanceError('recipe.bad-input', `Unknown target ${JSON.stringify(targetId)}.`);
  }
  return {
    mcVersion: target.mcVersion,
    channel: target.channel,
    java: target.java,
    ...(target.fabric === undefined ? {} : { fabric: target.fabric }),
  };
}

/** A failure in plain words. */
export function failure(code: InstanceFailureCode, message: string): InstanceFailure {
  return { ok: false, code, message };
}

const INSTANCE_CODES: Readonly<Record<InstanceError['code'], InstanceFailureCode>> = {
  'recipe.bad-input': 'bad-input',
  'recipe.needs-mod': 'needs-mod',
  'recipe.no-fabric': 'no-fabric',
  'instance.server-recipe': 'bad-input',
  'instance.loader-not-supported': 'not-yet',
  'instance.no-launcher': 'no-launcher',
  'instance.no-free-name': 'no-free-name',
  'instance.outside-root': 'not-managed',
  'instance.foreign-file': 'not-managed',
  'instance.foreign-world': 'not-managed',
  'instance.cannot-stage': 'failed',
  'instance.taken': 'busy',
};

const SERVER_CODES: Readonly<Record<ServerError['code'], InstanceFailureCode>> = {
  'server.bad-recipe': 'bad-input',
  'server.loader-not-supported': 'not-yet',
  'server.no-folder': 'failed',
  'server.no-free-name': 'no-free-name',
  'server.outside-root': 'not-managed',
  'server.foreign-file': 'not-managed',
  'server.foreign-world': 'not-managed',
  'server.not-ours': 'not-managed',
  'server.launcher-changed': 'launcher-changed',
  'server.download-failed': 'download-failed',
  'server.eula-not-accepted': 'eula-needed',
  'server.eula-needed': 'eula-needed',
  'server.no-java': 'no-java',
  'server.java-too-old': 'no-java',
  'server.cannot-stage': 'failed',
};

/** Any error as a failure: interop's coded errors keep their meaning, the rest is `failed`. */
export function failureOf(error: unknown): InstanceFailure {
  if (error instanceof InstanceError) {
    return failure(INSTANCE_CODES[error.code] ?? 'failed', error.message);
  }
  if (error instanceof ServerError) {
    return failure(SERVER_CODES[error.code] ?? 'failed', error.message);
  }
  if (error instanceof FabricTestError) {
    const code: InstanceFailureCode =
      error.code === 'fabric.foreign-file' || error.code === 'fabric.instance-not-managed'
        ? 'not-managed'
        : error.code === 'fabric.download-failed' || error.code === 'fabric.checksum-mismatch'
          ? 'download-failed'
          : 'bad-input';
    return failure(code, error.message);
  }
  return failure('failed', messageOf(error));
}

/** The run action of a request, or `not-yet` for what a later brief brings. */
function runActionOf(request: InstancePlanRequest): RunAction | InstanceFailure {
  const action = request.action;
  switch (action.kind) {
    case 'test':
    case 'game':
      return action.join === undefined
        ? { kind: action.kind }
        : { kind: action.kind, join: { host: action.join.host, port: action.join.port } };
    case 'plain':
      return { kind: 'plain' };
    case 'modpack':
      return { kind: 'modpack', name: action.name, modIds: [...action.modIds] };
    case 'map':
      return notYet('Opening a map in its own instance');
    case 'server':
      return { kind: 'server' };
  }
}

/** The kind a recipe makes. */
export function kindOf(recipe: RunRecipe): ManagedKind {
  return recipe.place.kind === 'server' ? 'server' : recipe.place.role;
}

/** A recipe without paths, for the renderer. */
export function recipeView(recipe: RunRecipe): InstanceRecipeView {
  return {
    purpose: recipe.purpose,
    owner: recipe.owner,
    mcVersion: recipe.mcVersion,
    channel: recipe.channel,
    java: recipe.java,
    loader: { kind: recipe.loader.kind, version: recipe.loader.version },
    place: { kind: recipe.place.kind, name: recipe.place.name },
    mods: recipe.mods.map((mod) => ({ role: mod.role, fileName: mod.fileName })),
    resourcePacks: recipe.resourcePacks.map((pack) => pack.fileName),
    world:
      recipe.world === null
        ? null
        : { folder: recipe.world.folder, copied: recipe.world.source !== null },
    join: recipe.join === null ? null : { host: recipe.join.host, port: recipe.join.port },
  };
}

function notYet(what: string): InstanceFailure {
  return failure('not-yet', `${what} comes in a later version of MCSuperMods.`);
}

const NO_PRISM_MESSAGE =
  'Prism Launcher was not found. Install it and start it once, then try again.';

/** The ids `list` gives: the kind of folder and its path. */
export function instanceId(instanceDir: string): string {
  return `instance:${normalize(instanceDir)}`;
}

export function serverId(serverDir: string): string {
  return `server:${normalize(serverDir)}`;
}

/** One found thing with what the service needs besides the view. */
interface FoundThing {
  view: ManagedThing;
  /** The folder whose queue removal waits in (the launcher root or the servers folder). */
  queueKey: string;
  check(): Promise<boolean>;
}

/**
 * Runs `step` after every earlier step queued under the same key (a launcher data folder or the
 * servers folder), so `ensureInstance` and removals never overlap in one folder.
 */
export function createFolderQueue(): <T>(key: string, step: () => Promise<T>) => Promise<T> {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, step: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    const next = previous.then(step, step);
    const tail = next.then(
      () => undefined,
      () => undefined,
    );
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return next;
  };
}

/** Creates the instances service. */
export function createInstancesService(deps: InstancesDeps): InstancesService {
  const { fs } = deps;
  const download = deps.download ?? fetchDownloader;
  const sha512 = deps.sha512 ?? webCryptoSha512;
  const facts = deps.targetFacts ?? builtInRecipeFacts;
  const spawnLauncher = deps.spawnLauncher ?? spawnDetached;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const serversDir = serversFolder(deps.msmHome);
  const queue = createFolderQueue();
  /** Instance folders made in this run, and when (Prism is given a moment before `--launch`). */
  const madeAt = new Map<string, number>();

  const prismRoots = async (): Promise<string[]> => {
    const manual = (await deps.settings.get()).launchers?.prismDataDirs ?? [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const root of [...defaultPrismDataDirs(deps.env), ...manual]) {
      const key = locationPathKey(root);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(root);
    }
    return out;
  };

  /** The first Prism data folder that exists (as Play finds it), or `null`. */
  const prismRoot = async (): Promise<string | null> => {
    for (const root of await prismRoots()) {
      if (await fs.exists(root)) return root;
    }
    return null;
  };

  const recipeOf = (request: InstancePlanRequest): RunRecipe | InstanceFailure => {
    const action = runActionOf(request);
    if ('ok' in action) return action;
    try {
      return recipeFor(action, request.project, facts(request.targetId));
    } catch (error) {
      return failureOf(error);
    }
  };

  const askFor = async (kind: ManagedKind): Promise<boolean> => {
    const settings = await deps.settings.instanceSettings();
    if (settings.ask === 'never') return false;
    if (settings.ask === 'always') return true;
    return !settings.madeByItself.includes(kind);
  };

  /** The instances folder of a Prism root. */
  const instancesDirOf = async (root: string): Promise<string | null> =>
    (await readMmcConfig(fs, root)).instanceDirs[0] ?? null;

  /** MSM's existing instance for an instance recipe in the Prism root, or `null`. */
  const existingInstance = async (
    root: string,
    recipe: RunRecipe,
  ): Promise<{ folder: string; instanceDir: string } | null> => {
    const instancesDir = await instancesDirOf(root);
    if (instancesDir === null || !(await fs.exists(instancesDir))) return null;
    const placement = await placeInstance(fs, instancesDir, recipe);
    return placement.kind === 'existing'
      ? { folder: placement.folder, instanceDir: placement.instanceDir }
      : null;
  };

  const gameDirOf = async (instanceDir: string): Promise<string> => {
    const dotGame = joinInstallPath(instanceDir, '.minecraft');
    return (await fs.exists(dotGame)) ? dotGame : joinInstallPath(instanceDir, 'minecraft');
  };

  const jarOf = (jars: readonly InstanceJar[], modId: string): Uint8Array => {
    const jar = jars.find((candidate) => candidate.modId === modId);
    if (jar === undefined) {
      throw new InstanceError(
        'recipe.bad-input',
        `The mod ${modId} was not sent. Export the project once, then try again.`,
      );
    }
    return jar.data;
  };

  const bytesOf =
    (jars: readonly InstanceJar[]) =>
    async (item: RecipeMod | RecipePack): Promise<Uint8Array> => {
      if (!('role' in item)) {
        throw new InstanceError(
          'recipe.bad-input',
          'Resource packs in an instance come in a later version.',
        );
      }
      switch (item.role) {
        case 'content':
          return jarOf(jars, item.modId);
        case 'fabric-api':
          return (
            await cachedFabricApi({ fs, cacheDir: deps.cacheDir, download, sha512 }, item.version)
          ).bytes;
        case 'extra':
          throw new InstanceError(
            'recipe.bad-input',
            "A modpack's Modrinth mods in its own instance come in a later version.",
          );
      }
    };

  /** Every instance and server MSM made, with what removal needs. */
  const scan = async (): Promise<FoundThing[]> => {
    const found: FoundThing[] = [];
    const launchers = (await deps.settings.get()).launchers;
    const roots: { root: string; launcher: 'prism' | 'multimc' | 'polymc' }[] = [];
    const seen = new Set<string>();
    const addRoot = (root: string, launcher: 'prism' | 'multimc' | 'polymc'): void => {
      const key = locationPathKey(root);
      if (seen.has(key)) return;
      seen.add(key);
      roots.push({ root, launcher });
    };
    for (const root of await prismRoots()) addRoot(root, 'prism');
    for (const root of launchers?.multimcRoots ?? []) {
      addRoot(root, (await fs.exists(joinInstallPath(root, 'polymc.cfg'))) ? 'polymc' : 'multimc');
    }
    for (const { root, launcher } of roots) {
      let entries: Awaited<ReturnType<typeof listManaged>>;
      try {
        entries = await listManaged(fs, [root]);
      } catch {
        continue;
      }
      for (const entry of entries) {
        found.push({
          view: {
            id: instanceId(entry.instanceDir),
            kind: entry.role,
            name: entry.folder,
            owner: entry.owner,
            mcVersion: entry.mcVersion,
            loader: { kind: entry.loaderKind, version: entry.loaderVersion },
            launcher,
            path: entry.instanceDir,
            eulaAccepted: null,
            running: false,
          },
          queueKey: locationPathKey(root),
          check: async () => {
            const marker = await readInstanceMarker(fs, entry.instanceDir);
            return marker !== 'absent' && marker !== 'unreadable';
          },
        });
      }
    }
    let servers: Awaited<ReturnType<typeof listServers>> = [];
    try {
      servers = await listServers(fs, serversDir);
    } catch {
      // An unreadable servers folder lists nothing.
    }
    for (const entry of servers) {
      found.push({
        view: {
          id: serverId(entry.serverDir),
          kind: 'server',
          name: entry.folder,
          owner: entry.owner,
          mcVersion: entry.mcVersion,
          loader: { kind: entry.kind, version: entry.loaderVersion },
          launcher: null,
          path: entry.serverDir,
          eulaAccepted: entry.eulaAccepted,
          running: deps.serverRunning?.(entry.serverDir) === true,
        },
        queueKey: locationPathKey(serversDir),
        check: async () => {
          const marker = await readServerMarker(fs, entry.serverDir);
          return marker !== 'absent' && marker !== 'unreadable';
        },
      });
    }
    return found;
  };

  const findThing = async (id: string): Promise<FoundThing | null> =>
    (await scan()).find((thing) => thing.view.id === id) ?? null;

  const NOT_OURS = failure(
    'not-found',
    'MCSuperMods did not make this, or it is gone, so MCSuperMods leaves it alone.',
  );

  return {
    async plan(request): Promise<InstancePlanResult> {
      try {
        const recipe = recipeOf(request);
        if ('ok' in recipe) return recipe;
        const kind = kindOf(recipe);
        const description = describeRecipe(recipe, { launcher: 'prism' });
        let launcher: 'prism' | null = null;
        let existing: { id: string; name: string } | null = null;
        if (recipe.place.kind === 'server') {
          if (await fs.exists(serversDir)) {
            const placement = await placeServer(fs, serversDir, recipe);
            if (placement.kind === 'existing') {
              existing = { id: serverId(placement.serverDir), name: placement.folder };
            }
          }
        } else {
          const root = await prismRoot();
          if (root !== null) {
            launcher = 'prism';
            const found = await existingInstance(root, recipe);
            if (found !== null)
              existing = { id: instanceId(found.instanceDir), name: found.folder };
          }
        }
        return {
          ok: true,
          recipe: recipeView(recipe),
          kind,
          title: description.title,
          sentences: description.sentences,
          launcher,
          existing,
          ask: existing === null && (await askFor(kind)),
        };
      } catch (error) {
        return failureOf(error);
      }
    },

    async ensure(request: InstanceEnsureRequest): Promise<InstanceEnsureResult> {
      try {
        const recipe = recipeOf(request);
        if ('ok' in recipe) return recipe;
        if (recipe.place.kind === 'server') {
          return failure('bad-input', 'A server is not a launcher instance: make it as a server.');
        }
        const root = await prismRoot();
        if (root === null) return failure('no-launcher', NO_PRISM_MESSAGE);
        const kind = kindOf(recipe);
        const ensured = await queue(locationPathKey(root), () =>
          ensureInstance({ fs, sha512, bytesOf: bytesOf(request.jars) }, root, recipe),
        );
        if (ensured.created) madeAt.set(normalize(ensured.instanceDir), now());
        try {
          const settings = await deps.settings.instanceSettings();
          if (request.remember === true || (ensured.created && settings.ask === 'first-time')) {
            await deps.settings.rememberInstanceKind(kind);
          }
        } catch {
          // An unwritable settings file only means the card shows again next time.
        }
        return {
          ok: true,
          id: instanceId(ensured.instanceDir),
          name: ensured.folder,
          created: ensured.created,
          updated: ensured.updated,
          gameDir: ensured.gameDir,
          mods: ensured.mods.files,
        };
      } catch (error) {
        return failureOf(error);
      }
    },

    async list() {
      try {
        return (await scan()).map((thing) => thing.view);
      } catch {
        return [];
      }
    },

    async remove(id): Promise<InstanceDoneResult> {
      try {
        const thing = await findThing(id);
        if (thing === null) return NOT_OURS;
        if (thing.view.running) {
          return failure('running', 'The server is running. Stop it first, then remove it.');
        }
        if (deps.trashItem === undefined) {
          return failure('failed', 'The recycle bin is not available, so nothing was removed.');
        }
        const trash = deps.trashItem;
        return await queue(thing.queueKey, async (): Promise<InstanceDoneResult> => {
          // Checked again just before: the folder must still hold MSM's marker.
          if (!(await thing.check())) return NOT_OURS;
          if (thing.view.kind === 'server' && deps.serverRunning?.(thing.view.path) === true) {
            return failure('running', 'The server is running. Stop it first, then remove it.');
          }
          await trash(normalize(thing.view.path));
          madeAt.delete(normalize(thing.view.path));
          return { ok: true };
        });
      } catch (error) {
        return failure('failed', `It could not be moved to the recycle bin: ${messageOf(error)}`);
      }
    },

    async showInFolder(id): Promise<InstanceDoneResult> {
      try {
        const thing = await findThing(id);
        if (thing === null) return NOT_OURS;
        if (deps.showItemInFolder === undefined) {
          return failure('failed', 'The file manager is not available here.');
        }
        deps.showItemInFolder(normalize(thing.view.path));
        return { ok: true };
      } catch (error) {
        return failureOf(error);
      }
    },

    async launch(request): Promise<InstanceLaunchResult> {
      try {
        const recipe = recipeOf(request);
        if ('ok' in recipe) return recipe;
        if (recipe.place.kind === 'server') {
          return failure('bad-input', 'A server is not started from a launcher.');
        }
        const root = await prismRoot();
        if (root === null) return failure('no-launcher', NO_PRISM_MESSAGE);
        const found = await existingInstance(root, recipe);
        if (found === null) {
          return failure('not-found', `${recipe.place.name} is not made yet. Make it first.`);
        }
        if (recipe.join !== null && recipe.place.role === 'test') {
          // B760 N14: a play request left from an earlier Play could open the test world
          // instead of joining the server.
          const playRequest = devPaths(await gameDirOf(found.instanceDir)).play;
          if (await fs.exists(playRequest)) await fs.remove(playRequest);
        }
        const program = await findLauncherProgram(
          fs,
          'prism',
          root,
          deps.env,
          (await deps.settings.launcherPrograms()).prism,
        );
        if (program === null) {
          return {
            ok: true,
            name: found.folder,
            launched: false,
            note: `Start Prism Launcher and choose "${found.folder}".`,
          };
        }
        const args = launchArguments({ launcher: 'prism', root, instance: found.folder }, deps.env);
        if (recipe.join !== null) args.push('--server', `${recipe.join.host}:${recipe.join.port}`);
        else if (recipe.world !== null && recipe.world.source !== null) {
          args.push('--world', recipe.world.folder);
        }
        // B760: a running Prism lists a new instance folder a moment after it appears.
        const made = madeAt.get(normalize(found.instanceDir));
        if (made !== undefined) {
          const wait = made + LAUNCH_AFTER_CREATE_MS - now();
          if (wait > 0) await sleep(wait);
        }
        try {
          await spawnLauncher(program, args);
        } catch (error) {
          return failure('failed', `Prism Launcher could not be started: ${messageOf(error)}`);
        }
        return { ok: true, name: found.folder, launched: true, note: null };
      } catch (error) {
        return failureOf(error);
      }
    },

    async playPlain() {
      return notYet('Playing without mods');
    },

    async openMap() {
      return notYet('Opening a map in its own instance');
    },

    async curseForgeProfile() {
      return notYet('A CurseForge profile');
    },
  };
}
