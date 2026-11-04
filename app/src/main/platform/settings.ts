/**
 * Application settings in `<msmHome>/settings.json`, and the MSM home directory itself.
 *
 * @packageDocumentation
 */

import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';
import { defaultMinecraftDir, type InstallEnv } from '@msm/interop';
import type { AppSettings, AppSettingsPatch, AppSettingsView } from '../../shared/platform';

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
  /** Merges `settings` into the stored settings and writes them. */
  set(settings: AppSettingsPatch): Promise<void>;
  /** The Minecraft directory in use: the setting, else the detected default, else `null`. */
  minecraftDir(): Promise<string | null>;
  /** Whether the app checks for updates after start-up (`updates.autoCheck`, default `true`). */
  autoCheckUpdates(): Promise<boolean>;
}

const defaults = (): AppSettings => ({ minecraftDir: null, updates: { autoCheck: true } });

/** JSON with sorted keys at every level, 2-space indent and a final newline. */
function sortedJson(value: unknown): string {
  const sort = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(sort);
    if (typeof node !== 'object' || node === null) return node;
    const record = node as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sort(record[key])]),
    );
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

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
      return defaults();
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return defaults();
    }
    const record = parsed as Record<string, unknown>;
    const dir = record.minecraftDir;
    const updates = record.updates;
    const autoCheck =
      typeof updates === 'object' && updates !== null
        ? (updates as Record<string, unknown>).autoCheck
        : undefined;
    return {
      minecraftDir: typeof dir === 'string' && dir !== '' && isAbsolute(dir) ? dir : null,
      // Anything but an explicit `false` keeps the default (on).
      updates: { autoCheck: autoCheck !== false },
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
      if (dir !== undefined && dir !== null && !isAbsolute(dir)) {
        throw new Error('The Minecraft folder must be an absolute path.');
      }
      const current = await read();
      const next: AppSettings = {
        minecraftDir:
          dir === undefined ? current.minecraftDir : dir === null ? null : normalize(dir),
        updates:
          settings.updates === undefined
            ? current.updates
            : { autoCheck: settings.updates.autoCheck },
      };
      await mkdir(deps.msmHome, { recursive: true });
      // Sorted keys, 2-space indent; written to a temporary file and renamed into place.
      const text = sortedJson(next);
      const temp = `${file}.tmp`;
      await writeFile(temp, text, 'utf8');
      await rename(temp, file);
    },
    async minecraftDir() {
      return (await read()).minecraftDir ?? (await detected());
    },
    async autoCheckUpdates() {
      return (await read()).updates.autoCheck;
    },
  };
}
