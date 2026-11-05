/**
 * Application settings in `<msmHome>/settings.json`, and the MSM home directory itself.
 *
 * @packageDocumentation
 */

import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, sep } from 'node:path';
import {
  AI_MODEL_IDS,
  type AiEffort,
  type AiMode,
  type AiModelId,
  type AiRunLimits,
  type AiSettings,
  DEFAULT_AI_SETTINGS,
} from '@msm/ai';
import { defaultMinecraftDir, type InstallEnv } from '@msm/interop';
import {
  gameLocationRefSchema,
  LAUNCHER_ROOTS_MAX,
  RECENT_PROJECTS_MAX,
} from '../../shared/ipc-contract';
import type {
  AppSettings,
  AppSettingsPatch,
  AppSettingsView,
  GameLocationRef,
  LauncherSettings,
  RecentProject,
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
  /** The AI helper settings, cleaned (ADR 0041 D7; `DEFAULT_AI_SETTINGS` when unset). */
  aiSettings(): Promise<AiSettings>;
  /** The stored install target, or `null` for the official launcher (ADR 0019). */
  installTarget(): Promise<GameLocationRef | null>;
  /** The manually added launcher folders (empty lists by default). */
  launcherSettings(): Promise<LauncherSettings>;
  /** The recent projects, newest first (normalised absolute roots, deduplicated, capped). */
  recentProjects(): Promise<RecentProject[]>;
  /** The stored entry whose root matches `root` (normalised; case-folded on Windows/macOS). */
  findRecentProject(root: string): Promise<RecentProject | null>;
  /**
   * Puts `entry` first in the recent list, replacing an entry with the same root, and keeps
   * at most {@link RECENT_PROJECTS_MAX}. Returns the new list.
   */
  recordRecentProject(entry: RecentProject): Promise<RecentProject[]>;
  /** Removes the entry matching `root`; returns the new list. */
  removeRecentProject(root: string): Promise<RecentProject[]>;
  /** Empties the recent list. */
  clearRecentProjects(): Promise<void>;
  /**
   * The launcher programs the user chose for Test in Minecraft (ADR 0026 D5), by launcher;
   * `null` when none was chosen. Main only: not part of {@link AppSettings}.
   */
  launcherPrograms(): Promise<LauncherPrograms>;
  /** Stores (or with `null` clears) the program for one launcher. Must be absolute. */
  setLauncherProgram(launcher: keyof LauncherPrograms, path: string | null): Promise<void>;
  /**
   * The folder the last project folder was chosen in (`lastProjectParent`), when it still
   * exists as a directory; otherwise `null`. Main only.
   */
  lastProjectParent(): Promise<string | null>;
  /** Stores the parent folder of a chosen project folder. Must be absolute. */
  setLastProjectParent(path: string): Promise<void>;
  /**
   * Records `version` as the last version launched (`lastSeenVersion`) and returns the
   * version stored before (`null` when none) and whether the settings file existed at all
   * (`false` on a brand-new install). Main only.
   */
  recordSeenVersion(version: string): Promise<{ previous: string | null; existed: boolean }>;
}

/** Launcher programs chosen by hand (absolute paths), stored as `launcherPrograms`. */
export interface LauncherPrograms {
  prism: string | null;
  multimc: string | null;
}

const emptyPrograms = (): LauncherPrograms => ({ prism: null, multimc: null });

/** A stored program path: an absolute string, else `null`. */
function cleanProgram(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && !value.includes('\0') && isAbsolute(value)
    ? normalize(value)
    : null;
}

function cleanPrograms(value: unknown): LauncherPrograms {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyPrograms();
  const record = value as Record<string, unknown>;
  return { prism: cleanProgram(record.prism), multimc: cleanProgram(record.multimc) };
}

/** {@link AppSettings} with every field present, plus the recent projects. */
type StoredSettings = Required<AppSettings> & {
  recentProjects: RecentProject[];
  launcherPrograms: LauncherPrograms;
  lastProjectParent: string | null;
  lastSeenVersion: string | null;
};

const LAUNCHER_LISTS = ['prismDataDirs', 'multimcRoots', 'curseForgeRoots'] as const;

const emptyLaunchers = (): LauncherSettings => ({
  prismDataDirs: [],
  multimcRoots: [],
  curseForgeRoots: [],
});

/** The fewest and most tool turns a stored run limit may have. */
export const AI_TOOL_TURNS_RANGE = [1, 1000] as const;
/** The fewest and most output tokens a stored run limit may have. */
export const AI_OUTPUT_TOKENS_RANGE = [1000, 5_000_000] as const;

const AI_EFFORTS: readonly AiEffort[] = ['low', 'medium', 'high', 'xhigh'];
const AI_MODES: readonly AiMode[] = ['chat', 'build'];

/** A fresh copy of {@link DEFAULT_AI_SETTINGS}. */
export function defaultAiSettings(): AiSettings {
  return {
    model: DEFAULT_AI_SETTINGS.model,
    effort: { ...DEFAULT_AI_SETTINGS.effort },
    fallbacks: DEFAULT_AI_SETTINGS.fallbacks,
    limits: {
      chat: { ...DEFAULT_AI_SETTINGS.limits.chat },
      build: { ...DEFAULT_AI_SETTINGS.limits.build },
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clampInt(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function cleanLimits(value: unknown, fallback: AiRunLimits): AiRunLimits {
  const record = asRecord(value);
  if (record === null) return { ...fallback };
  return {
    maxToolTurns: clampInt(record.maxToolTurns, AI_TOOL_TURNS_RANGE, fallback.maxToolTurns),
    maxOutputTokens: clampInt(
      record.maxOutputTokens,
      AI_OUTPUT_TOKENS_RANGE,
      fallback.maxOutputTokens,
    ),
    taskBudget: typeof record.taskBudget === 'boolean' ? record.taskBudget : fallback.taskBudget,
  };
}

/**
 * Cleans stored or sent AI helper settings field by field: an unknown model or effort falls
 * back to the default, limits are clamped to {@link AI_TOOL_TURNS_RANGE} and
 * {@link AI_OUTPUT_TOKENS_RANGE}, anything malformed takes the default.
 */
export function cleanAiSettings(value: unknown): AiSettings {
  const result = defaultAiSettings();
  const record = asRecord(value);
  if (record === null) return result;
  if ((AI_MODEL_IDS as readonly unknown[]).includes(record.model)) {
    result.model = record.model as AiModelId;
  }
  const effort = asRecord(record.effort);
  const limits = asRecord(record.limits);
  for (const mode of AI_MODES) {
    const chosen = effort?.[mode];
    if ((AI_EFFORTS as readonly unknown[]).includes(chosen))
      result.effort[mode] = chosen as AiEffort;
    result.limits[mode] = cleanLimits(limits?.[mode], result.limits[mode]);
  }
  if (typeof record.fallbacks === 'boolean') result.fallbacks = record.fallbacks;
  return result;
}

/** Whether two AI helper settings are the same (both cleaned). */
function sameAiSettings(a: AiSettings, b: AiSettings): boolean {
  return sortedJson(a) === sortedJson(b);
}

const defaults = (): StoredSettings => ({
  minecraftDir: null,
  updates: { autoCheck: true },
  ai: defaultAiSettings(),
  launchers: emptyLaunchers(),
  installTarget: null,
  recentProjects: [],
  launcherPrograms: emptyPrograms(),
  lastProjectParent: null,
  lastSeenVersion: null,
});

/** The longest stored version string (`lastSeenVersion`). */
const VERSION_MAX = 64;

function cleanVersion(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value.length <= VERSION_MAX ? value : null;
}

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

/** A folder path as a comparison key: normalised, and lower-cased on case-insensitive hosts. */
function folderKey(path: string, caseInsensitive: boolean): string {
  const folder = normaliseFolder(path);
  return caseInsensitive ? folder.toLowerCase() : folder;
}

/**
 * Cleans a stored recent-projects list: drops malformed entries and relative roots,
 * normalises roots, keeps the first of duplicate roots and at most
 * {@link RECENT_PROJECTS_MAX} entries.
 */
function cleanRecent(values: unknown, caseInsensitive: boolean): RecentProject[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: RecentProject[] = [];
  for (const value of values) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const { root, name, openedAt } = record;
    if (typeof root !== 'string' || root === '' || root.includes('\0') || !isAbsolute(root)) {
      continue;
    }
    if (typeof name !== 'string' || typeof openedAt !== 'string') continue;
    const key = folderKey(root, caseInsensitive);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ root: normaliseFolder(root), name, openedAt });
    if (out.length === RECENT_PROJECTS_MAX) break;
  }
  return out;
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
      ai: cleanAiSettings(record.ai),
      recentProjects: cleanRecent(record.recentProjects, caseInsensitive),
      launcherPrograms: cleanPrograms(record.launcherPrograms),
      lastProjectParent: cleanProgram(record.lastProjectParent),
      lastSeenVersion: cleanVersion(record.lastSeenVersion),
    };
  };

  const write = async (next: StoredSettings): Promise<void> => {
    await mkdir(deps.msmHome, { recursive: true });
    // Default launcher, target, AI helper and recent fields are left out, so files without them stay
    // byte-for-byte the same.
    const {
      launchers: nextLaunchers,
      installTarget: nextTarget,
      recentProjects: nextRecent,
      launcherPrograms: nextPrograms,
      lastProjectParent: nextParent,
      lastSeenVersion: nextSeen,
      ai: nextAi,
      ...base
    } = next;
    const programs = Object.fromEntries(
      Object.entries(nextPrograms).filter(([, path]) => path !== null),
    );
    const stored: AppSettings & {
      recentProjects?: RecentProject[];
      launcherPrograms?: Partial<LauncherPrograms>;
      lastProjectParent?: string;
      lastSeenVersion?: string;
    } = {
      ...base,
      ...(hasManualRoots(nextLaunchers) ? { launchers: nextLaunchers } : {}),
      ...(nextTarget === null ? {} : { installTarget: nextTarget }),
      ...(sameAiSettings(nextAi, defaultAiSettings()) ? {} : { ai: nextAi }),
      ...(nextRecent.length === 0 ? {} : { recentProjects: nextRecent }),
      ...(Object.keys(programs).length === 0 ? {} : { launcherPrograms: programs }),
      ...(nextParent === null ? {} : { lastProjectParent: nextParent }),
      ...(nextSeen === null ? {} : { lastSeenVersion: nextSeen }),
    };
    // Sorted keys, 2-space indent; written to a temporary file and renamed into place.
    const text = sortedJson(stored);
    const temp = `${file}.tmp`;
    await writeFile(temp, text, 'utf8');
    await rename(temp, file);
  };

  const detected = async (): Promise<string | null> => {
    const dir = normalize(defaultMinecraftDir(deps.installEnv));
    return (await isDirectory(dir)) ? dir : null;
  };

  return {
    async get() {
      const {
        recentProjects: _recent,
        launcherPrograms: _programs,
        lastProjectParent: _parent,
        lastSeenVersion: _seen,
        ...settings
      } = await read();
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
        ai: settings.ai === undefined ? current.ai : cleanAiSettings(settings.ai),
        recentProjects: current.recentProjects,
        launcherPrograms: current.launcherPrograms,
        lastProjectParent: current.lastProjectParent,
        lastSeenVersion: current.lastSeenVersion,
      };
      await write(next);
    },
    async minecraftDir() {
      return (await read()).minecraftDir ?? (await detected());
    },
    async autoCheckUpdates() {
      return (await read()).updates.autoCheck;
    },
    async aiSettings() {
      return (await read()).ai;
    },
    async installTarget() {
      return (await read()).installTarget;
    },
    async launcherSettings() {
      return (await read()).launchers;
    },
    async recentProjects() {
      return (await read()).recentProjects;
    },
    async findRecentProject(root) {
      if (!isAbsolute(root)) return null;
      const key = folderKey(root, caseInsensitive);
      const list = (await read()).recentProjects;
      return list.find((entry) => folderKey(entry.root, caseInsensitive) === key) ?? null;
    },
    async recordRecentProject(entry) {
      if (!isAbsolute(entry.root)) throw new Error('A recent project root must be absolute.');
      const current = await read();
      const recentProjects = cleanRecent([entry, ...current.recentProjects], caseInsensitive);
      await write({ ...current, recentProjects });
      return recentProjects;
    },
    async removeRecentProject(root) {
      const current = await read();
      const key = isAbsolute(root) ? folderKey(root, caseInsensitive) : null;
      const recentProjects = current.recentProjects.filter(
        (entry) => folderKey(entry.root, caseInsensitive) !== key,
      );
      if (recentProjects.length !== current.recentProjects.length) {
        await write({ ...current, recentProjects });
      }
      return recentProjects;
    },
    async clearRecentProjects() {
      const current = await read();
      if (current.recentProjects.length > 0) await write({ ...current, recentProjects: [] });
    },
    async launcherPrograms() {
      return (await read()).launcherPrograms;
    },
    async setLauncherProgram(launcher, path) {
      if (path !== null && cleanProgram(path) === null) {
        throw new Error('The launcher program must be an absolute path.');
      }
      const current = await read();
      await write({
        ...current,
        launcherPrograms: { ...current.launcherPrograms, [launcher]: cleanProgram(path) },
      });
    },
    async lastProjectParent() {
      const parent = (await read()).lastProjectParent;
      return parent !== null && (await isDirectory(parent)) ? parent : null;
    },
    async setLastProjectParent(path) {
      const parent = cleanProgram(path);
      if (parent === null) throw new Error('The project folder must be an absolute path.');
      const current = await read();
      if (current.lastProjectParent === parent) return;
      await write({ ...current, lastProjectParent: parent });
    },
    async recordSeenVersion(version) {
      let existed = true;
      try {
        await stat(file);
      } catch {
        existed = false;
      }
      const current = await read();
      const previous = current.lastSeenVersion;
      const next = cleanVersion(version);
      if (next !== null && next !== previous) await write({ ...current, lastSeenVersion: next });
      return { previous, existed };
    },
  };
}
