/**
 * Application settings in `<msmHome>/settings.json`, and the MSM home directory itself.
 *
 * @packageDocumentation
 */

import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, sep } from 'node:path';
import { defaultMinecraftDir, type InstallEnv } from '@msm/interop';
import { gameLocationRefSchema, LAUNCHER_ROOTS_MAX } from '../../shared/ipc-contract';
import type {
  AppSettings,
  AppSettingsPatch,
  AppSettingsView,
  GameLocationRef,
  LauncherSettings,
} from '../../shared/platform';

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
  /** The stored install target, or `null` for the official launcher (ADR 0019). */
  installTarget(): Promise<GameLocationRef | null>;
  /** The manually added launcher folders (empty lists by default). */
  launcherSettings(): Promise<LauncherSettings>;
}

/** {@link AppSettings} with every field present, as the store reads and writes it. */
type StoredSettings = Required<AppSettings>;

const LAUNCHER_LISTS = ['prismDataDirs', 'multimcRoots', 'curseForgeRoots'] as const;

const emptyLaunchers = (): LauncherSettings => ({
  prismDataDirs: [],
  multimcRoots: [],
  curseForgeRoots: [],
});

const defaults = (): StoredSettings => ({
  minecraftDir: null,
  updates: { autoCheck: true },
  launchers: emptyLaunchers(),
  installTarget: null,
});

/** Normalises a folder path and drops a trailing separator (but keeps a root such as `/`). */
function normaliseFolder(path: string): string {
  const normalised = normalize(path);
  const trimmed = normalised.replace(sep === '\\' ? /[\\/]+$/ : /\/+$/, '');
  return trimmed === '' || /^[A-Za-z]:$/.test(trimmed) ? normalised : trimmed;
}

/**
 * Normalises, deduplicates and caps one list of launcher folders. Non-strings and relative
 * paths are dropped when `strict` is false (reading a file) and rejected when it is true.
 */
function cleanRoots(values: unknown, caseInsensitive: boolean, strict: boolean): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || value === '' || !isAbsolute(value)) {
      if (strict) throw new Error('Launcher folders must be absolute paths.');
      continue;
    }
    const folder = normaliseFolder(value);
    const key = caseInsensitive ? folder.toLowerCase() : folder;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(folder);
    if (out.length === LAUNCHER_ROOTS_MAX) break;
  }
  return out;
}

function cleanLaunchers(
  value: unknown,
  caseInsensitive: boolean,
  strict: boolean,
): LauncherSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    if (strict) throw new Error('Launcher folders must be an object of lists.');
    return emptyLaunchers();
  }
  const record = value as Record<string, unknown>;
  const result = emptyLaunchers();
  for (const list of LAUNCHER_LISTS) {
    result[list] = cleanRoots(record[list], caseInsensitive, strict);
  }
  return result;
}

/** A valid install target with a normalised root, or `null` when `value` is not one. */
function parseInstallTarget(value: unknown): GameLocationRef | null {
  const parsed = gameLocationRefSchema.safeParse(value);
  if (!parsed.success || !isAbsolute(parsed.data.root)) return null;
  const root = normaliseFolder(parsed.data.root);
  return parsed.data.instance === undefined
    ? { launcher: parsed.data.launcher, root }
    : { launcher: parsed.data.launcher, root, instance: parsed.data.instance };
}

const hasManualRoots = (launchers: LauncherSettings): boolean =>
  LAUNCHER_LISTS.some((list) => launchers[list].length > 0);

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
  // Windows and macOS file systems are case-insensitive by default.
  const caseInsensitive =
    deps.installEnv.platform === 'win32' || deps.installEnv.platform === 'darwin';

  const read = async (): Promise<StoredSettings> => {
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
      launchers: cleanLaunchers(record.launchers, caseInsensitive, false),
      installTarget: parseInstallTarget(record.installTarget),
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
      const launchers =
        settings.launchers === undefined
          ? undefined
          : cleanLaunchers(settings.launchers, caseInsensitive, true);
      let installTarget: GameLocationRef | null | undefined = settings.installTarget;
      if (installTarget !== undefined && installTarget !== null) {
        installTarget = parseInstallTarget(installTarget);
        if (installTarget === null) {
          throw new Error('The install target must name a launcher and an absolute folder.');
        }
      }
      const current = await read();
      const next: StoredSettings = {
        minecraftDir:
          dir === undefined ? current.minecraftDir : dir === null ? null : normalize(dir),
        updates:
          settings.updates === undefined
            ? current.updates
            : { autoCheck: settings.updates.autoCheck },
        launchers: launchers ?? current.launchers,
        installTarget: installTarget === undefined ? current.installTarget : installTarget,
      };
      await mkdir(deps.msmHome, { recursive: true });
      // Default launcher fields are left out, so files without them stay byte-for-byte the same.
      const { launchers: nextLaunchers, installTarget: nextTarget, ...base } = next;
      const stored: AppSettings = {
        ...base,
        ...(hasManualRoots(nextLaunchers) ? { launchers: nextLaunchers } : {}),
        ...(nextTarget === null ? {} : { installTarget: nextTarget }),
      };
      // Sorted keys, 2-space indent; written to a temporary file and renamed into place.
      const text = sortedJson(stored);
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
    async installTarget() {
      return (await read()).installTarget;
    },
    async launcherSettings() {
      return (await read()).launchers;
    },
  };
}
