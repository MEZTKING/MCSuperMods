/**
 * Starting Prism Launcher or MultiMC on an instance (ADR 0026 D5). Both take
 * `--launch <instance id>` (`-l`) and `--dir <data folder>` (`-d`; Prism and MultiMC
 * `Application.cpp`); the instance id is the instance folder name. The app spawns the
 * launcher itself; this module only says which program to run and with which arguments.
 */

import { defaultPrismDataDirs } from '../launchers/discover';
import { locationPathKey } from '../launchers/paths';
import type { GameLocationRef } from '../launchers/types';
import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import type { InstallEnv } from '../minecraft-install/locate';

/** Host facts used to find a launcher program, beyond {@link InstallEnv}. */
export interface LauncherProgramEnv extends InstallEnv {
  /** `%LOCALAPPDATA%` on Windows, when set. */
  localAppData?: string | undefined;
  /** `%ProgramFiles%` on Windows, when set. */
  programFiles?: string | undefined;
}

/**
 * Where a launcher's program may be, in the order to try. `root` is the launcher's data
 * folder (portable installs keep the program there).
 *
 * - Prism on Windows: `<root>\prismlauncher.exe` (portable), the installer's default
 *   `%LOCALAPPDATA%\Programs\PrismLauncher\prismlauncher.exe` (Prism `win_install.nsi.in`),
 *   `%ProgramFiles%\PrismLauncher\prismlauncher.exe` and Scoop's
 *   `<home>\scoop\apps\prismlauncher\current\prismlauncher.exe` (verify at implementation).
 * - Prism on macOS: `Prism Launcher.app` in `/Applications` or `~/Applications` (verify at
 *   implementation).
 * - Prism on Linux: `prismlauncher` in `/usr/bin`, `/usr/local/bin`, `~/.local/bin`, and the
 *   Flatpak export wrappers `org.prismlauncher.PrismLauncher` (verify at implementation).
 * - MultiMC (and PolyMC): the program sits in its root folder: `MultiMC.exe` / `polymc.exe`
 *   on Windows, `MultiMC` / `polymc` elsewhere, `MultiMC.app` on macOS (verify at
 *   implementation).
 */
export function launcherProgramCandidates(
  launcher: 'prism' | 'multimc',
  root: string,
  env: LauncherProgramEnv,
): string[] {
  const home = env.home;
  if (launcher === 'multimc') {
    switch (env.platform) {
      case 'win32':
        return [joinInstallPath(root, 'MultiMC.exe'), joinInstallPath(root, 'polymc.exe')];
      case 'darwin':
        return [
          joinInstallPath(root, 'MultiMC.app', 'Contents', 'MacOS', 'MultiMC'),
          joinInstallPath(root, 'MultiMC'),
        ];
      default:
        return [joinInstallPath(root, 'MultiMC'), joinInstallPath(root, 'polymc')];
    }
  }
  switch (env.platform) {
    case 'win32': {
      const localAppData =
        env.localAppData !== undefined && env.localAppData !== ''
          ? env.localAppData
          : joinInstallPath(home, 'AppData', 'Local');
      const out = [
        joinInstallPath(root, 'prismlauncher.exe'),
        joinInstallPath(localAppData, 'Programs', 'PrismLauncher', 'prismlauncher.exe'),
      ];
      if (env.programFiles !== undefined && env.programFiles !== '') {
        out.push(joinInstallPath(env.programFiles, 'PrismLauncher', 'prismlauncher.exe'));
      }
      out.push(
        joinInstallPath(home, 'scoop', 'apps', 'prismlauncher', 'current', 'prismlauncher.exe'),
      );
      return out;
    }
    case 'darwin':
      return [
        '/Applications/Prism Launcher.app/Contents/MacOS/prismlauncher',
        joinInstallPath(
          home,
          'Applications',
          'Prism Launcher.app',
          'Contents',
          'MacOS',
          'prismlauncher',
        ),
      ];
    default:
      return [
        joinInstallPath(root, 'prismlauncher'),
        '/usr/bin/prismlauncher',
        '/usr/local/bin/prismlauncher',
        joinInstallPath(home, '.local', 'bin', 'prismlauncher'),
        joinInstallPath(
          home,
          '.local',
          'share',
          'flatpak',
          'exports',
          'bin',
          'org.prismlauncher.PrismLauncher',
        ),
        '/var/lib/flatpak/exports/bin/org.prismlauncher.PrismLauncher',
      ];
  }
}

/**
 * The launcher program to run: `configured` (from the settings) when it exists, otherwise
 * the first existing {@link launcherProgramCandidates} entry, otherwise `null`.
 */
export async function findLauncherProgram(
  fs: InstallFileSystem,
  launcher: 'prism' | 'multimc',
  root: string,
  env: LauncherProgramEnv,
  configured: string | null,
): Promise<string | null> {
  if (configured !== null && configured !== '' && (await fs.exists(configured))) return configured;
  for (const candidate of launcherProgramCandidates(launcher, root, env)) {
    if (await fs.exists(candidate)) return candidate;
  }
  return null;
}

/**
 * The arguments that start `ref`'s instance: `--launch <instance>`, preceded by
 * `--dir <root>` unless the root is one of Prism's default data folders (which the program
 * finds itself; Flatpak's sandbox may not see a host path given with `--dir`).
 */
export function launchArguments(ref: GameLocationRef, env: InstallEnv): string[] {
  if (ref.instance === undefined) throw new Error('Only launcher instances can be launched.');
  const isDefault =
    ref.launcher === 'prism' &&
    defaultPrismDataDirs(env).some((dir) => locationPathKey(dir) === locationPathKey(ref.root));
  return [...(isDefault ? [] : ['--dir', ref.root]), '--launch', ref.instance];
}
