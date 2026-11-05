/**
 * Third-party plugin folders (ADR 0035 D1, D2): `<msmHome>/plugins/<folder>/msm-plugin.json`.
 * Main validates each manifest and serves the bundle and schema files as text; the renderer
 * runs the bundle in a sandboxed worker. Main never runs plugin code.
 *
 * Every file read stays inside its plugin folder by real path (a symbolic link that leads out
 * is refused), and the bundle and schema files have size limits (`plugin.too-large`).
 *
 * @packageDocumentation
 */

import { mkdir, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Problem } from '@msm/plugin-api';
import {
  PLUGIN_MAIN_MAX_BYTES,
  PLUGIN_SCHEMA_MAX_BYTES,
  PLUGINS_MAX,
  PluginProblemCodes,
} from '../../shared/ipc-channels';
import { pluginManifestSchema } from '../../shared/ipc-contract';
import type { ExternalPluginBundle, ExternalPluginEntry, PluginManifest } from '../../shared/platform';

/** The plugins folder under the MSM home. */
export const PLUGINS_DIR = 'plugins';

/** The manifest file name in each plugin folder. */
export const PLUGIN_MANIFEST_FILE = 'msm-plugin.json';

/** The largest manifest main reads, in bytes. */
export const PLUGIN_MANIFEST_MAX_BYTES = 64 * 1024;

/** The plugin service main serves over IPC (`msm:v1:plugins:*`). */
export interface PluginsService {
  /** The plugins folder (absolute). */
  readonly dir: string;
  list(): Promise<ExternalPluginEntry[]>;
  read(id: string): Promise<ExternalPluginBundle>;
  openFolder(): Promise<void>;
}

/** Dependencies of {@link createPluginsService}. */
export interface PluginsServiceDeps {
  /** The MSM home (`MSM_HOME` or `<home>/.msm`). */
  msmHome: string;
  /** Opens a folder in the OS file manager (Electron's `shell.openPath`); returns an error text or `''`. */
  openPath(path: string): Promise<string>;
}

/** An error whose message starts with a `plugin.*` code, so the renderer can read it. */
export class PluginReadError extends Error {
  readonly code: string;

  /**
   * @param code - A `plugin.*` code.
   * @param message - What went wrong.
   */
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = 'PluginReadError';
  }
}

const decoder = new TextDecoder('utf-8', { fatal: true });

function manifestProblem(message: string, path?: string): Problem {
  return {
    severity: 'error',
    code: PluginProblemCodes.manifestInvalid,
    message,
    ...(path === undefined || path === '' ? {} : { path }),
  };
}

/** Whether `child` is `parent` or inside it (both absolute, resolved). */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * Reads a file inside `folder` (its real path) with a size limit.
 *
 * @throws {@link PluginReadError} `plugin.too-large` over the limit, `plugin.manifest-invalid`
 *   when the file is missing, outside the folder or not UTF-8.
 */
async function readContained(
  folder: string,
  relativePath: string,
  limit: number,
  what: string,
): Promise<string> {
  const realFolder = await realpath(folder);
  const target = resolve(realFolder, ...relativePath.split('/'));
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    throw new PluginReadError(PluginProblemCodes.manifestInvalid, `${what} ${relativePath} does not exist.`);
  }
  if (!isInside(realFolder, real) || real === realFolder) {
    throw new PluginReadError(
      PluginProblemCodes.manifestInvalid,
      `${what} ${relativePath} lies outside the plugin folder.`,
    );
  }
  const info = await stat(real);
  if (!info.isFile()) {
    throw new PluginReadError(PluginProblemCodes.manifestInvalid, `${what} ${relativePath} is not a file.`);
  }
  if (info.size > limit) {
    throw new PluginReadError(
      PluginProblemCodes.tooLarge,
      `${what} ${relativePath} is ${info.size} bytes; the limit is ${limit}.`,
    );
  }
  const bytes = await readFile(real);
  if (bytes.byteLength > limit) {
    throw new PluginReadError(
      PluginProblemCodes.tooLarge,
      `${what} ${relativePath} is ${bytes.byteLength} bytes; the limit is ${limit}.`,
    );
  }
  try {
    return decoder.decode(bytes);
  } catch {
    throw new PluginReadError(PluginProblemCodes.manifestInvalid, `${what} ${relativePath} is not UTF-8 text.`);
  }
}

/** Reads and validates one folder's manifest. */
async function readEntry(dir: string, folder: string): Promise<ExternalPluginEntry> {
  const fallback = (problem: Problem): ExternalPluginEntry => ({
    id: folder,
    folder,
    manifest: null,
    problems: [problem],
  });
  let text: string;
  try {
    text = await readContained(join(dir, folder), PLUGIN_MANIFEST_FILE, PLUGIN_MANIFEST_MAX_BYTES, 'The manifest');
  } catch (error) {
    const message =
      error instanceof PluginReadError && error.code === PluginProblemCodes.tooLarge
        ? `${PLUGIN_MANIFEST_FILE} is larger than ${PLUGIN_MANIFEST_MAX_BYTES} bytes.`
        : `The folder has no readable ${PLUGIN_MANIFEST_FILE}.`;
    return fallback(manifestProblem(message));
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return fallback(
      manifestProblem(`${PLUGIN_MANIFEST_FILE} is not valid JSON: ${(error as Error).message}`),
    );
  }
  const parsed = pluginManifestSchema.safeParse(json);
  if (!parsed.success) {
    const id =
      typeof json === 'object' && json !== null && typeof (json as { id?: unknown }).id === 'string'
        ? ((json as { id: string }).id.slice(0, 64) || folder)
        : folder;
    return {
      id,
      folder,
      manifest: null,
      problems: parsed.error.issues.slice(0, 16).map((issue) => {
        const path = issue.path.length === 0 ? '' : `/${issue.path.map(String).join('/')}`;
        return manifestProblem(
          `${PLUGIN_MANIFEST_FILE}${path === '' ? '' : ` ${path}`}: ${issue.message}`,
          path,
        );
      }),
    };
  }
  const manifest: PluginManifest = parsed.data;
  return { id: manifest.id, folder, manifest, problems: [] };
}

/**
 * The plugin service over `<msmHome>/plugins/`.
 *
 * @param deps - The MSM home and the folder opener.
 */
export function createPluginsService(deps: PluginsServiceDeps): PluginsService {
  const dir = join(deps.msmHome, PLUGINS_DIR);

  const list = async (): Promise<ExternalPluginEntry[]> => {
    let names: string[];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      names = entries
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => entry.name)
        .filter((name) => !name.startsWith('.'))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    } catch {
      return [];
    }
    const out: ExternalPluginEntry[] = [];
    const seen = new Map<string, string>();
    for (const folder of names.slice(0, PLUGINS_MAX)) {
      try {
        if (!(await stat(join(dir, folder))).isDirectory()) continue;
      } catch {
        continue;
      }
      const entry = await readEntry(dir, folder);
      if (entry.manifest !== null) {
        const first = seen.get(entry.manifest.id);
        if (first !== undefined) {
          out.push({
            ...entry,
            manifest: null,
            problems: [
              {
                severity: 'error',
                code: PluginProblemCodes.refused,
                message: `The folder ${first} already holds the plugin ${entry.manifest.id}; this copy is ignored.`,
              },
            ],
          });
          continue;
        }
        seen.set(entry.manifest.id, folder);
      }
      out.push(entry);
    }
    return out;
  };

  return {
    dir,
    list,
    async read(id) {
      const entry = (await list()).find(
        (candidate) => candidate.manifest !== null && candidate.manifest.id === id,
      );
      if (entry === undefined || entry.manifest === null) {
        throw new PluginReadError(PluginProblemCodes.manifestInvalid, `No usable plugin ${id} was found.`);
      }
      const folder = join(dir, entry.folder);
      const manifest = entry.manifest;
      const main = await readContained(folder, manifest.main, PLUGIN_MAIN_MAX_BYTES, 'The bundle');
      const schemas: string[] = [];
      for (const schema of manifest.schemas) {
        schemas.push(await readContained(folder, schema, PLUGIN_SCHEMA_MAX_BYTES, 'The schema file'));
      }
      return { manifest, main, schemas };
    },
    async openFolder() {
      await mkdir(dir, { recursive: true });
      const failure = await deps.openPath(dir);
      if (failure !== '') throw new Error(`The plugins folder could not be opened: ${failure}`);
    },
  };
}
