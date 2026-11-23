/**
 * The local server in the main process (ADR 0133 D7 to D9, B763). One server runs at a time,
 * started and stopped in sight:
 *
 * - `prepare` makes or updates the server folder: the Fabric server launcher from the download
 *   cache (downloaded once, its SHA-256 recorded; `cachedServerLauncher`), then `ensureServer`
 *   with the content jars and Fabric API, the user's white list and online mode settings; it
 *   also looks for Java (`findJava`, the launchers' own Java first, then `JAVA_HOME` and the
 *   path, a `java -version` probe only for a Java without a `release` file). Only while no
 *   server runs, and one step at a time.
 * - `acceptEula` writes `eula=true` only with the user's tick (`acceptServerEula`, D8).
 * - `start` prepares again, checks the port is free (else the next free one, written with
 *   `force`), plans the start (`planServerStart`) and spawns Java directly, never through a
 *   shell. The state comes from the log lines (`serverStateAfter`), never from the exit status:
 *   a missing EULA and a taken port both exit 0 (B760 N12).
 * - `stop` writes `stop` on standard input and ends the process after a time-out; `shutdown`
 *   does the same, sooner, when the app quits.
 *
 * The log is kept in memory, capped at `LOCAL_SERVER_LOG_MAX` lines. Every answer is
 * `{ ok: false, code, message }` on failure, never a throw, as Play's.
 *
 * @packageDocumentation
 */

import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { normalize } from 'node:path';
import {
  acceptServerEula,
  cachedFabricApi,
  cachedServerLauncher,
  DEFAULT_SERVER_PORT,
  type Downloader,
  defaultMinecraftDir,
  defaultPrismDataDirs,
  type EnsuredServer,
  ensureServer,
  type FindJavaResult,
  fetchDownloader,
  findJava,
  type InstallFileSystem,
  isSafeSegment,
  type JavaSearchEnv,
  joinInstallPath,
  type MsmServerKey,
  planServerStart,
  type RecipeMod,
  type RecipeTargetFacts,
  type RunRecipe,
  recipeFor,
  SERVER_STOP_LINE,
  ServerError,
  type ServerLogState,
  type ServerStartCommand,
  type Sha256,
  type Sha512,
  serverStateAfter,
  serversFolder,
  webCryptoSha256,
  webCryptoSha512,
} from '@msm/interop';
import { LOCAL_SERVER_LINE_MAX, LOCAL_SERVER_LOG_MAX } from '../../shared/ipc-contract';
import type {
  InstanceJar,
  LocalServerEulaAcceptance,
  LocalServerLog,
  LocalServerPlatform,
  LocalServerRequest,
  LocalServerResult,
  LocalServerState,
  LocalServerStatus,
} from '../../shared/platform';
import { builtInRecipeFacts, failure, failureOf } from './instances';
import type { SettingsStore } from './settings';
import { messageOf } from './test-in-minecraft';

/** How long `stop` waits for the server to save and end before it is killed. */
export const SERVER_STOP_TIMEOUT_MS = 30_000;
/** How long the app's quit waits for the server before it is killed. */
export const SERVER_QUIT_TIMEOUT_MS = 10_000;
/** How many ports after a taken one are tried. */
export const SERVER_PORT_TRIES = 20;
/** The fewest milliseconds between two status pushes for new log lines alone. */
export const LOG_PUSH_INTERVAL_MS = 250;

/** The state's words for the server panel. */
export const LOCAL_SERVER_LABELS: Readonly<Record<LocalServerState, string>> = {
  stopped: 'Stopped',
  preparing: 'Getting the server ready…',
  starting: 'Starting…',
  downloading: "Downloading Minecraft's server files…",
  running: 'Running',
  stopping: 'Stopping…',
  'eula-needed': 'Needs the Minecraft EULA',
  'port-taken': 'Port in use',
  crashed: 'Stopped with an error',
};

/** A started server process, as the service drives it. */
export interface ServerProcess {
  /** Calls `listener` with each line of standard output and standard error. */
  onLine(listener: (line: string) => void): void;
  /** Calls `listener` once the process has ended and its output is read. */
  onExit(listener: () => void): void;
  /** Writes to standard input; ignored once it is closed. */
  write(text: string): void;
  /** Ends the process. */
  kill(): void;
}

/** The main-process local server service: the platform's methods plus the app's quit. */
export interface LocalServerService extends LocalServerPlatform {
  /** Whether a server process runs now. */
  isRunning(): boolean;
  /** Whether the server in `serverDir` runs now (Settings may not remove it). */
  runs(serverDir: string): boolean;
  /** Stops the running server for the app's quit (a shorter time-out), then resolves. */
  shutdown(): Promise<void>;
  /** Kills the running server at once (the process is exiting). */
  killNow(): void;
}

/** What the service needs from its host. */
export interface LocalServerDeps {
  fs: InstallFileSystem;
  /** Host facts for the Java search: `JAVA_HOME`, `PATH` and `LOCALAPPDATA` included. */
  javaEnv: JavaSearchEnv;
  settings: Pick<SettingsStore, 'get' | 'localServerSettings' | 'minecraftDir'>;
  msmHome: string;
  /** The download cache folder (absolute), shared with Play. */
  cacheDir: string;
  download?: Downloader;
  sha512?: Sha512;
  sha256?: Sha256;
  /** The recipe facts of a target. Defaults to the built-in targets'. */
  targetFacts?(targetId: string): RecipeTargetFacts;
  /** Asks a Java program for its version (`java -version`'s text), or `null`. */
  probe?(program: string): Promise<string | null>;
  /** Starts the server process without a shell; rejects when it cannot be started. */
  spawnServer?(command: ServerStartCommand): Promise<ServerProcess>;
  /** Whether nothing listens on `port`. */
  isPortFree?(port: number): Promise<boolean>;
  /** The computer's addresses on its networks (IPv4, not internal). */
  lanAddresses?(): string[];
  stopTimeoutMs?: number;
  quitTimeoutMs?: number;
}

/** Splits a stream's text into lines, keeping a partial last line until more comes. */
function lineSplitter(emit: (line: string) => void): { push(text: string): void; end(): void } {
  let rest = '';
  return {
    push(text) {
      const parts = (rest + text).split(/\r?\n/);
      rest = parts.pop() ?? '';
      for (const part of parts) emit(part);
    },
    end() {
      if (rest !== '') emit(rest);
      rest = '';
    },
  };
}

/**
 * Spawns a server command with Node, directly (no shell), so ending the process ends the
 * server on Windows too (B760 N12).
 */
export function nodeSpawnServer(command: ServerStartCommand): Promise<ServerProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.program, command.args, {
      cwd: command.cwd,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lineListeners: ((line: string) => void)[] = [];
    const exitListeners: (() => void)[] = [];
    let exited = false;
    const emit = (line: string): void => {
      for (const listener of lineListeners) listener(line);
    };
    const out = lineSplitter(emit);
    const err = lineSplitter(emit);
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => out.push(chunk));
    child.stderr?.on('data', (chunk: string) => err.push(chunk));
    // A server that ended closes its input: a late `stop` must not crash main.
    child.stdin?.on('error', () => {});
    child.once('close', () => {
      out.end();
      err.end();
      exited = true;
      for (const listener of exitListeners) listener();
    });
    child.once('error', (error) => {
      if (!exited && child.pid === undefined) reject(error);
    });
    child.once('spawn', () => {
      resolve({
        onLine: (listener) => {
          lineListeners.push(listener);
        },
        onExit: (listener) => {
          if (exited) listener();
          else exitListeners.push(listener);
        },
        write: (text) => {
          if (child.stdin?.writable) child.stdin.write(text);
        },
        kill: () => {
          if (!exited) child.kill();
        },
      });
    });
  });
}

/** Whether nothing listens on `port` (a listen on every address, closed at once). */
export function isPortFreeNode(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

/** `java -version`'s text (it prints to standard error), or `null` when it cannot run. */
export function nodeJavaProbe(program: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      program,
      ['-version'],
      { timeout: 10_000, windowsHide: true, maxBuffer: 64 * 1024 },
      (error, stdout, stderr) => {
        const text = `${stderr}${stdout}`;
        resolve(error !== null && text.trim() === '' ? null : text);
      },
    );
  });
}

/** The computer's IPv4 addresses on its networks (not loopback). */
export function nodeLanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) out.push(entry.address);
    }
  }
  return [...new Set(out)].sort().slice(0, 16);
}

/** The JAVA search facts of this process (`nodeEnv` has none of them, B762). */
export function processJavaEnv(
  env: Readonly<Record<string, string | undefined>>,
): Pick<JavaSearchEnv, 'javaHome' | 'path' | 'localAppData'> {
  return {
    javaHome: env.JAVA_HOME,
    path: env.PATH ?? env.Path,
    localAppData: env.LOCALAPPDATA,
  };
}

interface Current {
  folder: string;
  serverDir: string;
  name: string;
  targetId: string;
  mcVersion: string;
  owner: string;
  port: number;
  eulaAccepted: boolean;
}

/** Creates the local server service. */
export function createLocalServerService(deps: LocalServerDeps): LocalServerService {
  const { fs } = deps;
  const download = deps.download ?? fetchDownloader;
  const sha512 = deps.sha512 ?? webCryptoSha512;
  const sha256 = deps.sha256 ?? webCryptoSha256;
  const facts = deps.targetFacts ?? builtInRecipeFacts;
  const spawnServer = deps.spawnServer ?? nodeSpawnServer;
  const isPortFree = deps.isPortFree ?? isPortFreeNode;
  const lanAddresses = deps.lanAddresses ?? nodeLanAddresses;
  const probe = deps.probe ?? nodeJavaProbe;
  const stopTimeoutMs = deps.stopTimeoutMs ?? SERVER_STOP_TIMEOUT_MS;
  const quitTimeoutMs = deps.quitTimeoutMs ?? SERVER_QUIT_TIMEOUT_MS;
  const serversDir = serversFolder(deps.msmHome);

  let current: Current | null = null;
  let java: LocalServerStatus['java'] = null;
  let state: LocalServerState = 'stopped';
  let progress: string | null = null;
  let message: string | null = null;
  let busy = false;
  let child: ServerProcess | null = null;
  let runningDir: string | null = null;
  let logState: ServerLogState | null = null;
  let exited: Promise<void> = Promise.resolve();
  const lines: string[] = [];
  let logFrom = 0;
  let logSeq = 0;
  const listeners = new Set<(status: LocalServerStatus) => void>();
  let pushTimer: ReturnType<typeof setTimeout> | null = null;

  const snapshot = (): LocalServerStatus => ({
    state,
    label: LOCAL_SERVER_LABELS[state],
    server:
      current === null
        ? null
        : {
            folder: current.folder,
            name: current.name,
            targetId: current.targetId,
            mcVersion: current.mcVersion,
            owner: current.owner,
            port: current.port,
            eulaAccepted: current.eulaAccepted,
            path: current.serverDir,
          },
    java,
    progress,
    message,
    addresses:
      state === 'running' && current !== null
        ? lanAddresses().map((address) => `${address}:${(current as Current).port}`)
        : [],
    logSeq,
  });

  const push = (): void => {
    if (pushTimer !== null) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    const status = snapshot();
    for (const listener of listeners) {
      try {
        listener(status);
      } catch {
        // A listener's failure never stops the server.
      }
    }
  };

  /** New log lines alone are pushed at most every {@link LOG_PUSH_INTERVAL_MS}. */
  const pushSoon = (): void => {
    if (pushTimer !== null) return;
    pushTimer = setTimeout(() => {
      pushTimer = null;
      push();
    }, LOG_PUSH_INTERVAL_MS);
    pushTimer.unref?.();
  };

  const setState = (next: LocalServerState, nextProgress: string | null = null): void => {
    state = next;
    progress = nextProgress;
    push();
  };

  const setProgress = (line: string): void => {
    progress = line;
    push();
  };

  const appendLine = (raw: string): void => {
    const line = raw.length > LOCAL_SERVER_LINE_MAX ? raw.slice(0, LOCAL_SERVER_LINE_MAX) : raw;
    lines.push(line);
    logSeq++;
    while (lines.length > LOCAL_SERVER_LOG_MAX) {
      lines.shift();
      logFrom++;
    }
  };

  const ok = (): LocalServerResult => ({ ok: true, status: snapshot() });

  const recipeOf = (request: LocalServerRequest): RunRecipe => {
    return recipeFor({ kind: 'server' }, request.project, facts(request.targetId));
  };

  const jarOf = (jars: readonly InstanceJar[], modId: string): Uint8Array => {
    const jar = jars.find((candidate) => candidate.modId === modId);
    if (jar === undefined) {
      throw new Error(`The mod ${modId} was not sent. Export the project once, then try again.`);
    }
    return jar.data;
  };

  const ensure = async (
    request: LocalServerRequest,
    recipe: RunRecipe,
    port: { port: number; force: readonly MsmServerKey[] } | null,
  ): Promise<EnsuredServer> => {
    const loader = recipe.loader.version;
    if (loader === null) throw new Error('unreachable: a server recipe has Fabric.');
    const settings = await deps.settings.localServerSettings();
    const ensured = await ensureServer(
      {
        fs,
        sha512,
        sha256,
        bytesOf: async (mod: RecipeMod) => {
          if (mod.role === 'content') return jarOf(request.jars, mod.modId);
          if (mod.role === 'fabric-api') {
            setProgress('Getting Fabric API…');
            return (
              await cachedFabricApi({ fs, cacheDir: deps.cacheDir, download, sha512 }, mod.version)
            ).bytes;
          }
          throw new Error('A server takes no Modrinth mods yet.');
        },
        launcher: () => {
          setProgress('Downloading the Fabric server launcher…');
          return cachedServerLauncher(
            { fs, cacheDir: deps.cacheDir, download, sha256 },
            { mcVersion: recipe.mcVersion, loader },
          );
        },
      },
      serversDir,
      recipe,
      {
        whiteList: settings.whiteList,
        onlineMode: settings.onlineMode,
        ...(port === null ? {} : { port: port.port, force: port.force }),
      },
    );
    current = {
      folder: ensured.folder,
      serverDir: ensured.serverDir,
      name: ensured.name,
      targetId: request.targetId,
      mcVersion: recipe.mcVersion,
      owner: recipe.owner,
      port: ensured.port,
      eulaAccepted: ensured.eula === 'accepted',
    };
    return ensured;
  };

  const lookForJava = async (wanted: number): Promise<FindJavaResult> => {
    progress = 'Looking for Java…';
    push();
    const launchers = (await deps.settings.get()).launchers;
    const launcherRoots = [
      ...defaultPrismDataDirs(deps.javaEnv),
      ...(launchers?.prismDataDirs ?? []),
      ...(launchers?.multimcRoots ?? []),
    ];
    const minecraftDirs = [defaultMinecraftDir(deps.javaEnv)];
    const chosen = await deps.settings.minecraftDir();
    if (chosen !== null && !minecraftDirs.includes(chosen)) minecraftDirs.push(chosen);
    const found = await findJava(
      { fs, env: deps.javaEnv, launcherRoots, minecraftDirs, probe },
      wanted,
    );
    java = found.ok
      ? { ok: true, version: found.java.version, path: found.java.program }
      : { ok: false, message: found.message };
    return found;
  };

  /** Runs one step at a time; refuses while another runs. */
  const step = async (
    run: () => Promise<LocalServerResult>,
    options: { whileRunning?: boolean } = {},
  ): Promise<LocalServerResult> => {
    if (busy)
      return failure('busy', 'The server is busy with another step. Try again in a moment.');
    if (child !== null && options.whileRunning !== true) {
      return failure(
        'running',
        `${current?.name ?? 'A server'} is running. Stop it first, then try again.`,
      );
    }
    busy = true;
    try {
      return await run();
    } catch (error) {
      const result = failureOf(error);
      message = result.message;
      return result;
    } finally {
      busy = false;
      if (child === null && (state === 'preparing' || state === 'starting')) state = 'stopped';
      progress = null;
      push();
    }
  };

  const prepareStep = async (request: LocalServerRequest): Promise<LocalServerResult> => {
    const recipe = recipeOf(request);
    message = null;
    setState('preparing', 'Making the server folder…');
    await ensure(request, recipe, null);
    await lookForJava(recipe.java);
    state = 'stopped';
    return ok();
  };

  const finalState = (): LocalServerState =>
    logState === 'eula-needed' || logState === 'port-taken' || logState === 'crashed'
      ? logState
      : 'stopped';

  const MESSAGES: Partial<Record<LocalServerState, (port: number) => string>> = {
    'eula-needed': () => 'The server stopped because the Minecraft EULA is not accepted.',
    'port-taken': (port) =>
      `Another program is using port ${port}. Close it, or start the server again to use another port.`,
    crashed: () => 'The server stopped with an error. Its log says why.',
  };

  const liveState = (): LocalServerState => {
    switch (logState) {
      case null:
        return 'starting';
      case 'downloading':
      case 'running':
      case 'stopping':
      case 'eula-needed':
      case 'port-taken':
      case 'crashed':
        return logState;
    }
  };

  const startStep = async (request: LocalServerRequest): Promise<LocalServerResult> => {
    const recipe = recipeOf(request);
    message = null;
    setState('preparing', 'Making the server folder…');
    let ensured = await ensure(request, recipe, null);
    const found = await lookForJava(recipe.java);
    if (!found.ok) {
      state = 'stopped';
      message = found.message;
      return failure('no-java', found.message);
    }
    if (!(await isPortFree(ensured.port))) {
      let free: number | null = null;
      for (let port = ensured.port + 1; port <= ensured.port + SERVER_PORT_TRIES; port++) {
        if (port > 65535) break;
        if (await isPortFree(port)) {
          free = port;
          break;
        }
      }
      if (free === null) {
        state = 'stopped';
        message = `Port ${ensured.port} and the ${SERVER_PORT_TRIES} after it are in use. Close the program using them, then try again.`;
        return failure('port-taken', message);
      }
      ensured = await ensure(request, recipe, { port: free, force: ['server-port'] });
    }
    const plan = await planServerStart(
      { fs, sha256 },
      serversDir,
      ensured.serverDir,
      found.java.program,
    );
    if (!plan.ok) {
      state = 'stopped';
      message = plan.message;
      return failureOf(new ServerError(plan.code, plan.message));
    }
    progress = 'Starting the server…';
    push();
    let proc: ServerProcess;
    try {
      proc = await spawnServer(plan.command);
    } catch (error) {
      state = 'stopped';
      message = `Java could not be started: ${messageOf(error)}`;
      return failure('failed', message);
    }
    child = proc;
    runningDir = ensured.serverDir;
    logState = null;
    lines.length = 0;
    logFrom = logSeq;
    state = 'starting';
    let resolveExit: () => void = () => {};
    exited = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    proc.onLine((line) => {
      appendLine(line);
      if (child !== proc) return;
      const before = state;
      logState = serverStateAfter(logState, line);
      state = liveState();
      if (state !== before) push();
      else pushSoon();
    });
    proc.onExit(() => {
      if (child === proc) {
        child = null;
        runningDir = null;
        state = finalState();
        const port = current?.port ?? DEFAULT_SERVER_PORT;
        message = MESSAGES[state]?.(port) ?? 'The server stopped.';
        progress = null;
        push();
      }
      resolveExit();
    });
    return ok();
  };

  const waitFor = (promise: Promise<void>, ms: number): Promise<boolean> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      void promise.then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });

  /** Asks the running server to stop, then kills it after `timeoutMs`. */
  const stopProcess = async (timeoutMs: number): Promise<void> => {
    const proc = child;
    if (proc === null) return;
    state = 'stopping';
    progress = 'Stopping the server…';
    push();
    proc.write(SERVER_STOP_LINE);
    if (!(await waitFor(exited, timeoutMs))) {
      proc.kill();
      await waitFor(exited, 5_000);
    }
  };

  const stop = async (): Promise<LocalServerResult> => {
    if (child === null) return failure('not-running', 'No server is running.');
    if (busy)
      return failure('busy', 'The server is busy with another step. Try again in a moment.');
    busy = true;
    try {
      await stopProcess(stopTimeoutMs);
      return ok();
    } finally {
      busy = false;
    }
  };

  return {
    async status() {
      return snapshot();
    },

    prepare: (request) => step(() => prepareStep(request)),

    acceptEula: (folder: string, acceptance: LocalServerEulaAcceptance) =>
      step(async () => {
        if (!isSafeSegment(folder) || folder.startsWith('.')) {
          return failure('bad-input', 'That is not a server MCSuperMods made.');
        }
        await acceptServerEula(fs, serversDir, joinInstallPath(serversDir, folder), acceptance);
        if (current !== null && current.folder === folder) current.eulaAccepted = true;
        message = null;
        return ok();
      }),

    start: (request) => step(() => startStep(request)),

    stop,

    async restart(request) {
      if (child !== null) {
        const stopped = await stop();
        if (!stopped.ok) return stopped;
      }
      return step(() => startStep(request));
    },

    async log(since): Promise<LocalServerLog> {
      const from = Math.min(Math.max(since, logFrom), logSeq);
      return { from, next: logSeq, lines: lines.slice(from - logFrom) };
    },

    onStatus(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    isRunning: () => child !== null,

    runs: (serverDir) => runningDir !== null && normalize(runningDir) === normalize(serverDir),

    async shutdown() {
      if (child === null) return;
      await stopProcess(quitTimeoutMs);
    },

    killNow() {
      child?.kill();
    },
  };
}
