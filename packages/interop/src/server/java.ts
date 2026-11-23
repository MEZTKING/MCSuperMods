/**
 * Finding a Java program for a local server (ADR 0133 D9; B760 N8). None is bundled or
 * downloaded: MSM looks where the launchers keep the Java they downloaded, then at
 * `JAVA_HOME`, then along the path, and reads each one's version from the `release` file at
 * its Java home, without starting it. Only where that file is missing does it ask the
 * injected `probe` (the app's main process runs `java -version`); interop starts nothing.
 *
 * Places, in order:
 * 1. Prism Launcher: the global `JavaPath` setting of `prismlauncher.cfg` when it names a
 *    program, then every Java under `<data>/java/` (Prism's downloads; `<name>/bin/<exe>`,
 *    `<name>/jre/bin/<exe>` or one folder deeper; the folder names are verify at
 *    implementation);
 * 2. the official launcher's `runtime/` folder (`java-runtime-epsilon` is 26.x's), and on
 *    Windows the Store app's `LocalCache\Local\runtime\` (layouts below `runtime` verify at
 *    implementation);
 * 3. `JAVA_HOME`;
 * 4. each folder of `PATH`.
 *
 * The account files of a launcher are never read (B760's rule).
 */

import { defaultPrismDataDirs } from '../launchers/discover';
import { parseIni } from '../launchers/ini';
import { isAbsoluteInstallPath, isSafeSegment, locationPathKey } from '../launchers/paths';
import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import { defaultMinecraftDir, type InstallEnv } from '../minecraft-install/locate';
import type { ServerErrorCode } from './errors';

/** The host facts the Java search needs, beyond {@link InstallEnv}. */
export interface JavaSearchEnv extends InstallEnv {
  /** `$JAVA_HOME`, when set. */
  javaHome?: string | undefined;
  /** `$PATH` (`%PATH%` on Windows), when set. */
  path?: string | undefined;
  /** `%LOCALAPPDATA%` on Windows, when set (the Store launcher's runtime). */
  localAppData?: string | undefined;
}

/** Where a Java program was found. */
export type JavaSource =
  | 'prism-setting'
  | 'prism'
  | 'official'
  | 'official-store'
  | 'java-home'
  | 'path';

/** One Java program found. */
export interface JavaCandidate {
  /** The program to start (`java`, or `java.exe` / `javaw.exe` on Windows). */
  program: string;
  /** Its Java home (the folder holding `bin/`). */
  home: string;
  /** Its feature release (25 for `25.0.5.1`, 8 for `1.8.0_392`), or `null` when unknown. */
  major: number | null;
  /** The full version as read, or `null`. */
  version: string | null;
  source: JavaSource;
}

/** What {@link findJava} needs. */
export interface FindJavaDeps {
  fs: InstallFileSystem;
  env: JavaSearchEnv;
  /** Prism, MultiMC or PolyMC data folders to look in (default: Prism's default folders). */
  launcherRoots?: readonly string[];
  /** Official launcher game folders (default: the platform's `.minecraft`). */
  minecraftDirs?: readonly string[];
  /**
   * Asks a program for its version (the text `java -version` prints), for a Java whose home has
   * no `release` file. Without it such a Java counts as of unknown version and is not chosen.
   */
  probe?: (program: string) => Promise<string | null>;
}

/** {@link findJava}'s answer: never throws. */
export type FindJavaResult =
  | { ok: true; java: JavaCandidate; candidates: JavaCandidate[] }
  | {
      ok: false;
      code: Extract<ServerErrorCode, 'server.no-java' | 'server.java-too-old'>;
      message: string;
      candidates: JavaCandidate[];
    };

/** The feature release of a Java version string (`25.0.5.1` 25, `1.8.0_392` 8, `25` 25). */
export function javaMajor(version: string): number | null {
  const match = /^(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (match === null) return null;
  const first = Number(match[1]);
  if (first === 1 && match[2] !== undefined) return Number(match[2]);
  return first > 0 && first < 1000 ? first : null;
}

/** `JAVA_VERSION` of a Java home's `release` file, or `null`. */
export function parseReleaseFile(text: string): string | null {
  const match = /^JAVA_VERSION\s*=\s*"?([^"\r\n]+)"?\s*$/m.exec(text);
  return match?.[1]?.trim() ?? null;
}

/** The version in `java -version`'s output (`openjdk version "25.0.5.1" …`), or `null`. */
export function parseJavaVersionOutput(text: string): string | null {
  const match = /\bversion "([^"]+)"/.exec(text);
  return match?.[1] ?? null;
}

function isWindows(env: InstallEnv): boolean {
  return env.platform === 'win32';
}

/** The program names to look for in a `bin` folder, in order. */
function programNames(env: InstallEnv): string[] {
  // `java.exe` first: a server needs its console streams; `javaw.exe` is all some runtimes have.
  return isWindows(env) ? ['java.exe', 'javaw.exe'] : ['java'];
}

function parentPath(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '');
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (index <= 0) return trimmed.slice(0, index + 1) || trimmed;
  // Keep a drive root such as `C:\`.
  if (/^[A-Za-z]:$/.test(trimmed.slice(0, index))) return trimmed.slice(0, index + 1);
  return trimmed.slice(0, index);
}

async function isDir(fs: InstallFileSystem, path: string): Promise<boolean> {
  try {
    await fs.readDir(path);
    return true;
  } catch {
    return false;
  }
}

async function children(fs: InstallFileSystem, dir: string): Promise<string[]> {
  try {
    return (await fs.readDir(dir))
      .filter((entry) => entry.kind === 'directory' && isSafeSegment(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/** The first program of {@link programNames} in `binDir`, or `null`. */
async function programIn(
  fs: InstallFileSystem,
  env: InstallEnv,
  binDir: string,
): Promise<string | null> {
  for (const name of programNames(env)) {
    const path = joinInstallPath(binDir, name);
    if ((await fs.exists(path)) && !(await isDir(fs, path))) return path;
  }
  return null;
}

/** The deepest folder level searched below a runtime folder. */
const MAX_DEPTH = 6;
/** The most folders a single search looks into. */
const MAX_VISITS = 400;

/**
 * Every Java home below `dir` (a folder holding `bin/<program>`), breadth first, at most
 * {@link MAX_DEPTH} levels and {@link MAX_VISITS} folders. A home's own sub-folders are not
 * searched further.
 */
async function homesBelow(
  fs: InstallFileSystem,
  env: InstallEnv,
  dir: string,
  depth: number = MAX_DEPTH,
): Promise<{ home: string; program: string }[]> {
  const found: { home: string; program: string }[] = [];
  let level = [dir];
  let visits = 0;
  for (let d = 0; d <= depth && level.length > 0; d++) {
    const next: string[] = [];
    for (const folder of level) {
      if (++visits > MAX_VISITS) return found;
      const program = await programIn(fs, env, joinInstallPath(folder, 'bin'));
      if (program !== null) {
        found.push({ home: folder, program });
        continue;
      }
      for (const name of await children(fs, folder)) next.push(joinInstallPath(folder, name));
    }
    level = next;
  }
  return found;
}

async function readVersion(
  deps: FindJavaDeps,
  home: string,
  program: string,
): Promise<{ version: string | null; major: number | null }> {
  const release = joinInstallPath(home, 'release');
  if (await deps.fs.exists(release)) {
    try {
      const version = parseReleaseFile(new TextDecoder().decode(await deps.fs.readFile(release)));
      if (version !== null) return { version, major: javaMajor(version) };
    } catch {
      // Unreadable: the probe below, if any.
    }
  }
  if (deps.probe !== undefined) {
    try {
      const output = await deps.probe(program);
      const version = output === null ? null : parseJavaVersionOutput(output);
      if (version !== null) return { version, major: javaMajor(version) };
    } catch {
      // A program that cannot be asked counts as unknown.
    }
  }
  return { version: null, major: null };
}

/** Prism's global `JavaPath` (absolute, or relative to the data folder), when it names a program. */
async function prismSettingProgram(
  fs: InstallFileSystem,
  env: InstallEnv,
  root: string,
): Promise<string | null> {
  for (const name of ['prismlauncher.cfg', 'polymc.cfg', 'multimc.cfg']) {
    const path = joinInstallPath(root, name);
    if (!(await fs.exists(path))) continue;
    try {
      const value = parseIni(new TextDecoder().decode(await fs.readFile(path))).get('JavaPath');
      if (value === undefined) return null;
      const trimmed = value.trim();
      // A bare `java` or `javaw` means the path, searched later.
      if (trimmed === '' || !/[/\\]/.test(trimmed)) return null;
      const program = isAbsoluteInstallPath(trimmed) ? trimmed : joinInstallPath(root, trimmed);
      if (!programNames(env).some((n) => program.toLowerCase().endsWith(n))) return null;
      return (await fs.exists(program)) ? program : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** The Store launcher's runtime folder on Windows (B760 N8; verify at implementation). */
const STORE_PACKAGE = 'Microsoft.4297127D64EC6_8wekyb3d8bbwe';

/**
 * Finds a Java program of at least `wanted` (the target's `java`, 25 on 26.x) for a local
 * server. Among those new enough, the first of exactly `wanted` in the order of the places
 * above wins, then the oldest newer one. Never throws; with none it says why in plain words.
 */
export async function findJava(deps: FindJavaDeps, wanted: number): Promise<FindJavaResult> {
  const { fs, env } = deps;
  const found: { home: string; program: string; source: JavaSource }[] = [];
  const add = (home: string, program: string, source: JavaSource): void => {
    found.push({ home, program, source });
  };

  const roots = deps.launcherRoots ?? defaultPrismDataDirs(env);
  for (const root of roots) {
    if (!isAbsoluteInstallPath(root) || !(await fs.exists(root))) continue;
    const setting = await prismSettingProgram(fs, env, root);
    if (setting !== null) add(parentPath(parentPath(setting)), setting, 'prism-setting');
    for (const hit of await homesBelow(fs, env, joinInstallPath(root, 'java'), 3)) {
      add(hit.home, hit.program, 'prism');
    }
  }

  const official = deps.minecraftDirs ?? [defaultMinecraftDir(env)];
  for (const dir of official) {
    if (!isAbsoluteInstallPath(dir)) continue;
    const runtime = joinInstallPath(dir, 'runtime');
    if (!(await fs.exists(runtime))) continue;
    for (const hit of await homesBelow(fs, env, runtime)) add(hit.home, hit.program, 'official');
  }
  if (isWindows(env) && env.localAppData !== undefined && isAbsoluteInstallPath(env.localAppData)) {
    const runtime = joinInstallPath(
      env.localAppData,
      'Packages',
      STORE_PACKAGE,
      'LocalCache',
      'Local',
      'runtime',
    );
    if (await fs.exists(runtime)) {
      for (const hit of await homesBelow(fs, env, runtime))
        add(hit.home, hit.program, 'official-store');
    }
  }

  if (env.javaHome !== undefined && isAbsoluteInstallPath(env.javaHome)) {
    const program = await programIn(fs, env, joinInstallPath(env.javaHome, 'bin'));
    if (program !== null) add(env.javaHome, program, 'java-home');
  }

  if (env.path !== undefined) {
    for (const entry of env.path.split(isWindows(env) ? ';' : ':')) {
      const dir = entry.trim().replace(/^"(.*)"$/, '$1');
      if (dir === '' || !isAbsoluteInstallPath(dir)) continue;
      const program = await programIn(fs, env, dir);
      if (program === null) continue;
      // `/usr/bin/java` is usually a link into the real Java home.
      let real = program;
      if (fs.realpath !== undefined) {
        try {
          real = await fs.realpath(program);
        } catch {
          // Keep the path as it is.
        }
      }
      add(parentPath(parentPath(real)), program, 'path');
    }
  }

  const candidates: JavaCandidate[] = [];
  const seen = new Set<string>();
  for (const hit of found) {
    const key = locationPathKey(hit.home);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ ...hit, ...(await readVersion(deps, hit.home, hit.program)) });
  }

  const usable = candidates.filter((c) => c.major !== null && c.major >= wanted);
  const exact = usable.find((c) => c.major === wanted);
  const newer = [...usable].sort((a, b) => (a.major as number) - (b.major as number))[0];
  const java = exact ?? newer;
  if (java !== undefined) return { ok: true, java, candidates };

  const how =
    'Start your test instance once in Prism Launcher, which downloads the Java the game needs, then try again.';
  const known = candidates.filter((c) => c.major !== null);
  if (known.length > 0) {
    const best = Math.max(...known.map((c) => c.major as number));
    return {
      ok: false,
      code: 'server.java-too-old',
      message: `The server needs Java ${wanted}, and the newest Java found on this computer is Java ${best}. ${how}`,
      candidates,
    };
  }
  return {
    ok: false,
    code: 'server.no-java',
    message:
      candidates.length > 0
        ? `The server needs Java ${wanted}, and MCSuperMods could not tell the version of the Java it found on this computer. ${how}`
        : `The server needs Java ${wanted}, and MCSuperMods found no Java on this computer. ${how}`,
    candidates,
  };
}
