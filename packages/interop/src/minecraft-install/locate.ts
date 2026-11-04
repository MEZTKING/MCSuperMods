/**
 * Locating the Minecraft game directory and the client jars installed in it.
 */

import { type InstallFileSystem, joinInstallPath } from './fs';

/** The host facts {@link defaultMinecraftDir} needs. `@msm/interop/node` provides `nodeEnv()`. */
export interface InstallEnv {
  /** `process.platform`. */
  platform: 'win32' | 'darwin' | 'linux' | string;
  /** The user's home directory. */
  home: string;
  /** `%APPDATA%` on Windows, when set. */
  appData?: string | undefined;
}

/**
 * The launcher's default game directory for a platform: `%APPDATA%\.minecraft` on Windows,
 * `~/Library/Application Support/minecraft` on macOS and `~/.minecraft` elsewhere.
 */
export function defaultMinecraftDir(env: InstallEnv): string {
  switch (env.platform) {
    case 'win32': {
      const appData =
        env.appData !== undefined && env.appData !== ''
          ? env.appData
          : joinInstallPath(env.home, 'AppData', 'Roaming');
      return joinInstallPath(appData, '.minecraft');
    }
    case 'darwin':
      return joinInstallPath(env.home, 'Library', 'Application Support', 'minecraft');
    default:
      return joinInstallPath(env.home, '.minecraft');
  }
}

/** A version folder that contains a client jar. */
export interface InstalledVersion {
  /** The version id, which is also the folder and file stem (`versions/<id>/<id>.jar`). */
  id: string;
  /** Absolute path of `<id>.jar`. */
  jarPath: string;
  /** Absolute path of `<id>.json`. It may be absent on disk. */
  jsonPath: string;
}

/**
 * Lists the versions under `<minecraftDir>/versions` whose `<id>/<id>.jar` exists, sorted by
 * id. Returns an empty list when the directory or its `versions` folder does not exist, so
 * previews degrade gracefully without an installation.
 */
export async function listInstalledVersions(
  fs: InstallFileSystem,
  minecraftDir: string,
): Promise<InstalledVersion[]> {
  const versionsDir = joinInstallPath(minecraftDir, 'versions');
  if (!(await fs.exists(versionsDir))) return [];
  const entries = await fs.readDir(versionsDir);
  const result: InstalledVersion[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'directory') continue;
    const dir = joinInstallPath(versionsDir, entry.name);
    const jarPath = joinInstallPath(dir, `${entry.name}.jar`);
    if (!(await fs.exists(jarPath))) continue;
    result.push({ id: entry.name, jarPath, jsonPath: joinInstallPath(dir, `${entry.name}.json`) });
  }
  return result.sort((a, b) => compareStrings(a.id, b.id));
}

/**
 * Picks the installed jar for a Minecraft version: the exact id first, otherwise the
 * greatest id (descending string order) that starts with `mcVersion` followed by a
 * non-digit (so `1.2-fabric` matches `1.2` but `1.20` does not).
 */
export function pickVersionJar(
  versions: readonly InstalledVersion[],
  mcVersion: string,
): InstalledVersion | undefined {
  const exact = versions.find((version) => version.id === mcVersion);
  if (exact !== undefined) return exact;
  const prefixed = versions
    .filter(
      (version) =>
        version.id.startsWith(mcVersion) && !/^[0-9]/.test(version.id.slice(mcVersion.length)),
    )
    .sort((a, b) => compareStrings(b.id, a.id));
  return prefixed[0];
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
