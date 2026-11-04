/**
 * Application settings in `<msmHome>/settings.json`, and the MSM home directory itself.
 *
 * @packageDocumentation
 */

import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';
import { defaultMinecraftDir, type InstallEnv } from '@msm/interop';
import type { AppSettings, AppSettingsView } from '../../shared/platform';

/** The settings file name below the MSM home directory. */
export const SETTINGS_FILE = 'settings.json';

/**
 * The MSM home directory: `MSM_HOME` when it is set to an absolute path (tests and e2e),
 * otherwise `<home>/.msm`.
 */
export function resolveMsmHome(
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string {
  const override = env.MSM_HOME;
  if (override !== undefined && override !== '' && isAbsolute(override)) return normalize(override);
  return join(home, '.msm');
}

/** Reads and writes {@link AppSettings}. */
export interface SettingsStore {
  get(): Promise<AppSettingsView>;
  set(settings: AppSettings): Promise<void>;
  /** The Minecraft directory in use: the setting, else the detected default, else `null`. */
  minecraftDir(): Promise<string | null>;
}

const DEFAULTS: AppSettings = { minecraftDir: null };

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Creates the settings store.
 *
 * @param deps.msmHome - The MSM home directory (see {@link resolveMsmHome}).
 * @param deps.installEnv - Host facts used to detect the launcher's default game directory.
 */
export function createSettingsStore(deps: {
  msmHome: string;
  installEnv: InstallEnv;
}): SettingsStore {
  const file = join(deps.msmHome, SETTINGS_FILE);

  const read = async (): Promise<AppSettings> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return { ...DEFAULTS };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ...DEFAULTS };
    }
    const dir = (parsed as Record<string, unknown>).minecraftDir;
    return {
      minecraftDir: typeof dir === 'string' && dir !== '' && isAbsolute(dir) ? dir : null,
    };
  };

  const detected = async (): Promise<string | null> => {
    const dir = normalize(defaultMinecraftDir(deps.installEnv));
    return (await isDirectory(dir)) ? dir : null;
  };

  return {
    async get() {
      const settings = await read();
      return { ...settings, detectedMinecraftDir: await detected() };
    },
    async set(settings) {
      const dir = settings.minecraftDir;
      if (dir !== null && !isAbsolute(dir)) {
        throw new Error('The Minecraft folder must be an absolute path.');
      }
      const next: AppSettings = { minecraftDir: dir === null ? null : normalize(dir) };
      await mkdir(deps.msmHome, { recursive: true });
      // Sorted keys, 2-space indent; written to a temporary file and renamed into place.
      const text = `${JSON.stringify(next, Object.keys(next).sort(), 2)}\n`;
      const temp = `${file}.tmp`;
      await writeFile(temp, text, 'utf8');
      await rename(temp, file);
    },
    async minecraftDir() {
      return (await read()).minecraftDir ?? (await detected());
    },
  };
}
