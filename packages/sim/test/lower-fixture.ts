/**
 * Lowers a committed fixture project for a test, as the view will (ADR 0085 D3), and returns
 * its output files as `SimFiles`. `@msm/sim` may depend only on `@msm/plugin-api` and
 * `@msm/core`, so the built-in plugins and targets are loaded here by file path at test time;
 * the package itself never imports them.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  type DirEntry,
  ElementKindRegistry,
  loadProject,
  lowerProject,
  type ProjectFileSystem,
  registerPlugin,
  stableStringify,
} from '@msm/core';
import type { Plugin, Problem, Target } from '@msm/plugin-api';
import type { SimFiles } from '../src/index.js';

/** The repository root. */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const PLUGIN_FOLDERS: Readonly<Record<string, string>> = {
  'msm.resourcepack': 'resourcepack',
  'msm.datapack': 'datapack',
  'msm.worldgen': 'worldgen',
  'msm.blocks-items': 'blocks-items',
  'msm.structures': 'structures',
  'msm.models-anim': 'models-anim',
  'msm.entities': 'entities',
  'msm.scripting': 'scripting',
  'msm.rules': 'rules',
  'msm.controls': 'controls',
};

/** Imports a workspace module by its path from the repository root. */
async function importFromRepo<T>(path: string): Promise<T> {
  return (await import(pathToFileURL(join(REPO_ROOT, path)).href)) as T;
}

/** The built-in targets, newest first. */
export async function builtInTargets(): Promise<readonly Target[]> {
  const all = await importFromRepo<{ builtInTargets: readonly { target: Target }[] }>(
    'packages/targets/all/src/index.ts',
  );
  return all.builtInTargets.map((bundle) => bundle.target);
}

function readOnlyFs(root: string): ProjectFileSystem {
  const resolve = (path: string): string => join(root, ...path.split('/'));
  const refuse = async (): Promise<never> => {
    throw new Error('Fixtures are read-only in tests.');
  };
  return {
    readFile: async (path) => new Uint8Array(await readFile(resolve(path))),
    async readDir(path) {
      const entries = await readdir(resolve(path), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map(
          (entry): DirEntry => ({
            name: entry.name,
            kind: entry.isDirectory() ? 'directory' : 'file',
          }),
        );
    },
    async exists(path) {
      try {
        await stat(resolve(path));
        return true;
      } catch {
        return false;
      }
    },
    writeFile: refuse,
    mkdirp: refuse,
    remove: refuse,
  };
}

/** A fixture project lowered for a target: its files and the problems found. */
export interface LoweredFixture {
  readonly files: SimFiles;
  readonly problems: readonly Problem[];
}

/**
 * Loads `fixtures/<name>` with the plugins it lists and lowers it for `target`. JSON contents
 * become stable JSON text; bytes stay bytes.
 */
export async function lowerFixture(name: string, target: Target): Promise<LoweredFixture> {
  return lowerProjectAt(join(REPO_ROOT, 'fixtures', name), target);
}

/** Loads the project at `root` (for example a library starter under `examples/`) and lowers it. */
export async function lowerProjectAt(root: string, target: Target): Promise<LoweredFixture> {
  const header = JSON.parse(await readFile(join(root, 'msm.project.json'), 'utf8')) as {
    plugins: string[];
  };
  const registry = new ElementKindRegistry();
  const plugins: Plugin[] = [];
  for (const pluginId of header.plugins) {
    const folder = PLUGIN_FOLDERS[pluginId];
    if (folder === undefined) throw new Error(`No plugin folder for ${pluginId}.`);
    const module = await importFromRepo<{ default: Plugin }>(
      `packages/plugins/${folder}/src/index.ts`,
    );
    registerPlugin(registry, module.default);
    plugins.push(module.default);
  }
  const loaded = await loadProject(readOnlyFs(root), registry);
  const lowered = lowerProject(loaded.project, registry, target, { plugins });
  const files = new Map<string, string | Uint8Array>();
  for (const file of lowered.files) {
    files.set(
      file.path,
      file.contents instanceof Uint8Array ? file.contents : stableStringify(file.contents),
    );
  }
  return { files, problems: [...loaded.problems, ...lowered.problems] };
}
